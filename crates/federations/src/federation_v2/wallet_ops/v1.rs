use anyhow::{Result, bail};
use bitcoin::Network;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::{Amount, apply};
use fedimint_wallet_client::{DepositStateV2, WithdrawState};
use futures::StreamExt;
use rpc_types::error::ErrorCode;
use rpc_types::{
    BaseMetadata, FrontendMetadata, RpcAmount, RpcFeeDetails, RpcTransactionDirection,
    RpcTransactionKind,
};
use tracing::{error, warn};

use super::super::client::ClientExt;
use super::super::{
    FederationTransactionParts, FederationV2, FediFeeStream, get_max_spendable_amount,
};
use super::WalletOps;
use crate::federation_v2::{async_trait_maybe_send, deposit_update_sanitized_log, log_update};

pub struct WalletOpsV1;

impl WalletOpsV1 {
    fn subscribe_deposit(&self, fed: &FederationV2, operation_id: OperationId) {
        fed.spawn_cancellable("subscribe deposit", move |fed| async move {
            let Ok(wallet) = fed.client.wallet() else {
                error!("Wallet module not present!");
                return;
            };
            // don't keep emit events if outcome is already cached.
            let Ok(fedimint_client::module::oplog::UpdateStreamOrOutcome::UpdateStream(
                mut updates,
            )) = wallet
                .subscribe_deposit(operation_id)
                .await
                .inspect_err(|e| {
                    warn!("subscribing to 0.3 deposits is not implemented: {e}");
                })
            else {
                return;
            };
            while let Some(update) = updates.next().await {
                log_update!(
                    fed.runtime,
                    update,
                    "Received deposit update",
                    deposit_update_sanitized_log(&update)
                );
                fed.update_operation_state(operation_id, update.clone())
                    .await;
                match update {
                    DepositStateV2::WaitingForConfirmation { btc_deposited, .. }
                    | DepositStateV2::Confirmed { btc_deposited, .. }
                    | DepositStateV2::Claimed { btc_deposited, .. } => {
                        let federation_fees = wallet.get_fee_consensus().peg_in_abs;
                        let amount = Amount::from_sats(btc_deposited.to_sat())
                            .saturating_sub(federation_fees);
                        // FIXME: add fedi fees once fedimint await primary module outputs
                        if let DepositStateV2::Claimed { .. } = &update {
                            fed.write_success_receive_fedi_fees(operation_id, amount)
                                .await
                                .ok();
                        }
                        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
                        fed.send_transaction_event(operation_id).await;
                    }
                    DepositStateV2::Failed(reason) => {
                        let _ = fed.write_failed_receive_fedi_fees(operation_id).await;
                        // FIXME: handle this
                        error!("Failed to claim on-chain deposit: {reason}");
                    }
                    _ => {}
                }
            }
        });
    }

    async fn get_deposit_outcome(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
    ) -> anyhow::Result<Option<DepositStateV2>> {
        if let Some(outcome) = fed
            .get_operation_state::<DepositStateV2>(&operation_id)
            .await?
        {
            return Ok(Some(outcome));
        }

        let Ok(wallet) = fed.client.wallet() else {
            panic!("get deposit outcome called when wallet module is absent");
        };

        match wallet.subscribe_deposit(operation_id).await {
            Err(e) => Err(e),
            Ok(fedimint_client::module::oplog::UpdateStreamOrOutcome::Outcome(outcome)) => {
                Ok(Some(outcome))
            }
            Ok(fedimint_client::module::oplog::UpdateStreamOrOutcome::UpdateStream(mut stream)) => {
                Ok(stream.next().await)
            }
        }
    }
}

#[apply(async_trait_maybe_send!)]
impl WalletOps for WalletOpsV1 {
    fn get_network(&self, fed: &FederationV2) -> Network {
        fed.client
            .wallet()
            .expect("wallet selected in FederationV2::new")
            .get_network()
    }

    async fn supports_safe_deposit(&self, fed: &FederationV2) -> Result<bool> {
        // gated on the wallet module reaching the safe-deposit consensus version
        Ok(fed.client.wallet()?.supports_safe_deposit().await)
    }

    /// Generate bitcoin address
    async fn generate_address(
        &self,
        fed: &FederationV2,
        frontend_meta: FrontendMetadata,
    ) -> Result<String> {
        // FIXME: add fedi fees once fedimint await primary module outputs
        let fee_ppms = fed
            .get_fee_ppms_by_stream(
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let deposit_address = fed
            .client
            .wallet()?
            .allocate_deposit_address_expert_only(BaseMetadata::from(frontend_meta))
            .await?;
        let operation_id = deposit_address.operation_id;
        let address = deposit_address.address;
        fed.write_pending_receive_fedi_fee_ppms(operation_id, &fee_ppms)
            .await?;

        self.subscribe_deposit(fed, operation_id);

        Ok(address.to_string())
    }

    async fn recheck_pegin_address(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
    ) -> Result<()> {
        fed.client
            .wallet()?
            .recheck_pegin_address_by_op_id(operation_id)
            .await
    }

    /// Returns the fee details for making a payment on-chain.
    /// Returns an error in case the amount exceeds the max spendable amount.
    async fn preview_pay_address(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<bitcoin::address::NetworkUnchecked>,
        amount: bitcoin::Amount,
    ) -> Result<RpcFeeDetails> {
        let fee_ppms = fed
            .get_fee_ppms_by_stream(fedimint_wallet_client::KIND, RpcTransactionDirection::Send)
            .await?;
        let amount_msat = amount.to_sat() * 1000;
        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Send,
                Amount::from_msats(amount_msat),
            )
            .await?;
        let wallet = fed.client.wallet()?;
        let network_fees = wallet
            .get_withdraw_fees(
                // TODO: need to verify against federation network, but where do we get it from?
                &address.assume_checked(),
                amount,
            )
            .await?;
        let federation_fee = wallet.get_fee_consensus().peg_out_abs;
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);
        let fedi_app_fee =
            FederationV2::fedi_fee_amount_for_stream(&fees_by_stream, FediFeeStream::App);
        let fedi_guardian_fee =
            FederationV2::fedi_fee_amount_for_stream(&fees_by_stream, FediFeeStream::Guardian);
        let network_fees_msat = network_fees.amount().to_sat() * 1000;
        let est_total_spend = amount_msat + fedi_fee.msats + network_fees_msat;
        let virtual_balance = fed.get_balance().await;
        if est_total_spend > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(
                    virtual_balance,
                    FederationV2::total_fedi_fee_ppm(&fee_ppms),
                    Some(network_fees),
                    None,
                )
            )));
        }

        Ok(RpcFeeDetails {
            fedi_app_fee: RpcAmount(fedi_app_fee),
            fedi_guardian_fee: RpcAmount(fedi_guardian_fee),
            network_fee: RpcAmount(Amount::from_msats(network_fees_msat)),
            federation_fee: RpcAmount(federation_fee),
        })
    }

    /// Pay an onchain address
    async fn pay_address(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<bitcoin::address::NetworkUnchecked>,
        amount: bitcoin::Amount,
        frontend_meta: FrontendMetadata,
    ) -> Result<OperationId> {
        let wallet = fed.client.wallet()?;
        let fee_ppms = fed
            .get_fee_ppms_by_stream(fedimint_wallet_client::KIND, RpcTransactionDirection::Send)
            .await?;
        let amount_msat = amount.to_sat() * 1000;
        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Send,
                Amount::from_msats(amount_msat),
            )
            .await?;
        let network_fees = wallet
            .get_withdraw_fees(
                // TODO: verify
                &address.clone().assume_checked(),
                amount,
            )
            .await?;
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);
        let network_fees_msat = network_fees.amount().to_sat() * 1000;
        let est_total_spend = amount_msat + fedi_fee.msats + network_fees_msat;

        let spend_guard = fed.spend_guard.lock().await;
        let virtual_balance = fed.get_balance().await;
        if est_total_spend > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(
                    virtual_balance,
                    FederationV2::total_fedi_fee_ppm(&fee_ppms),
                    Some(network_fees),
                    None,
                )
            )));
        }

        let operation_id = wallet
            .withdraw(
                // TODO: verify
                &address.clone().assume_checked(),
                amount,
                network_fees,
                BaseMetadata::from(frontend_meta),
            )
            .await?;
        fed.write_pending_send_fedi_fees(operation_id, &fees_by_stream)
            .await?;
        drop(spend_guard);
        let _ = fed
            .record_tx_date_fiat_info(operation_id, Amount::from_msats(est_total_spend))
            .await;
        fed.subscribe_to_operation(operation_id).await?;
        Ok(operation_id)
    }

    async fn subscribe_to_onchain_addresses(&self, fed: &FederationV2) {
        let Ok(wallet) = fed.client.wallet() else {
            return;
        };
        let tweak_idxes = wallet.list_peg_in_tweak_idxes().await;

        for tweak_data in tweak_idxes.into_values() {
            self.subscribe_deposit(fed, tweak_data.operation_id);
        }
    }

    async fn subscribe_pay_address(&self, fed: &FederationV2, op_id: OperationId) -> Result<()> {
        let mut updates = fed
            .client
            .wallet()?
            .subscribe_withdraw_updates(op_id)
            .await?
            .into_stream();

        while let Some(update) = updates.next().await {
            fed.update_operation_state(op_id, update.clone()).await;
            match update {
                WithdrawState::Created => (),
                WithdrawState::Succeeded(_) => {
                    let _ = fed.write_success_send_fedi_fees(op_id).await;
                }
                WithdrawState::Failed(_) => {
                    let _ = fed.write_failed_send_fedi_fees(op_id).await;
                }
            }
            fed.send_transaction_event(op_id).await;
        }

        Ok(())
    }

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    ) {
        match operation
            .meta::<fedimint_wallet_client::WalletOperationMeta>()
            .variant
        {
            fedimint_wallet_client::WalletOperationMetaVariant::Deposit { .. } => {
                // see subscribe_to_onchain_addresses
            }
            fedimint_wallet_client::WalletOperationMetaVariant::Withdraw { .. } => {
                fed.spawn_cancellable("subscribe_pay_address", move |fed| async move {
                    if let Err(e) = fed.subscribe_pay_address(operation_id).await {
                        warn!("subscribe_pay_address error: {e:?}")
                    }
                });
            }
            _ => {
                tracing::debug!(
                    "Can't subscribe to operation id: {}",
                    operation.operation_module_kind()
                );
            }
        }
    }

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        _fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>> {
        let wallet_meta: fedimint_wallet_client::WalletOperationMeta = entry.meta();
        let frontend_metadata = serde_json::from_value::<BaseMetadata>(wallet_meta.extra_meta)
            .unwrap_or_default()
            .into();
        match wallet_meta.variant {
            fedimint_wallet_client::WalletOperationMetaVariant::Deposit { address, .. } => {
                let outcome = self.get_deposit_outcome(fed, operation_id).await?;
                let wallet = fed.client.wallet();
                let peg_in_fees = wallet
                    .map(|w| w.get_fee_consensus().peg_in_abs)
                    .unwrap_or(Amount::ZERO);
                let transaction_amount = match outcome {
                    Some(
                        DepositStateV2::WaitingForConfirmation { btc_deposited, .. }
                        | DepositStateV2::Claimed { btc_deposited, .. },
                    ) => RpcAmount(
                        Amount::from_sats(btc_deposited.to_sat()).saturating_sub(peg_in_fees),
                    ),
                    _ => RpcAmount(Amount::ZERO),
                };
                Ok(Some(FederationTransactionParts {
                    amount: transaction_amount,
                    kind: RpcTransactionKind::OnchainDeposit {
                        onchain_address: address.assume_checked().to_string(),
                        peg_in_fees: RpcAmount(peg_in_fees),
                        state: outcome.map(Into::into),
                    },
                    frontend_metadata,
                }))
            }
            fedimint_wallet_client::WalletOperationMetaVariant::Withdraw {
                address,
                amount,
                fee,
                change: _,
            } => {
                let core_amount = Amount {
                    msats: amount.to_sat() * 1000,
                };
                let outcome = fed
                    .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                        fed.client.wallet()?.subscribe_withdraw_updates(op_id).await
                    })
                    .await?;

                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(core_amount),
                    kind: RpcTransactionKind::OnchainWithdraw {
                        onchain_address: address.assume_checked().to_string(),
                        onchain_fees: RpcAmount(Amount::from_sats(fee.amount().to_sat())),
                        onchain_fee_rate: fee.fee_rate.sats_per_kvb,
                        state: outcome.map(Into::into),
                    },
                    frontend_metadata,
                }))
            }
            fedimint_wallet_client::WalletOperationMetaVariant::RbfWithdraw { .. } => Ok(None),
        }
    }
}
