use anyhow::{Result, bail};
use bitcoin::Network;
use bitcoin::address::NetworkUnchecked;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::{Amount, apply};
use fedimint_wallet_client::PegOutFees;
use fedimint_walletv2_client::{
    FinalReceiveOperationState, FinalSendOperationState, WalletOperationMeta,
};
use rpc_types::error::ErrorCode;
use rpc_types::{
    FrontendMetadata, RpcAmount, RpcFeeDetails, RpcOnchainDepositState,
    RpcOnchainDepositTransactionData, RpcOnchainWithdrawState, RpcTransactionDirection,
    RpcTransactionKind,
};
use tracing::{error, warn};

use super::super::client::ClientExt;
use super::super::{FederationTransactionParts, FederationV2, get_max_spendable_amount};
use super::WalletOps;
use crate::federation_v2::async_trait_maybe_send;

pub struct WalletOpsV2;

// NOTE: walletv2 send/receive do not currently expose custom metadata fields,
// so frontend notes/contact metadata cannot be persisted for walletv2
// transactions. Keep returning `frontend_metadata: None` until upstream exposes
// parity with the lnv2/mintv2 custom metadata APIs.
#[apply(async_trait_maybe_send!)]
impl WalletOps for WalletOpsV2 {
    fn get_network(&self, fed: &FederationV2) -> Network {
        fed.client
            .walletv2()
            .expect("walletv2 selected in FederationV2::new")
            .get_network()
    }

    async fn supports_safe_deposit(&self, _fed: &FederationV2) -> Result<bool> {
        // walletv2 deposits are claimed from guardian-signed outputs by the
        // background scanner; there is no unsafe peg-in address reuse to guard
        // against, so every walletv2 deposit is safe.
        Ok(true)
    }

    /// Generate bitcoin address
    async fn generate_address(
        &self,
        fed: &FederationV2,
        _frontend_meta: FrontendMetadata,
    ) -> Result<String> {
        // v2 wallet has no per-address operation lifecycle — receive() just
        // returns the next unused address. funds appear in balance when claimed.
        Ok(fed.client.walletv2()?.receive().await.to_string())
    }

    async fn recheck_pegin_address(
        &self,
        _fed: &FederationV2,
        _operation_id: OperationId,
    ) -> Result<()> {
        // walletv2's background scanner detects deposits on its own;
        // there is no manual recheck path, so this is a no-op.
        Ok(())
    }

    /// Returns the fee details for making a payment on-chain.
    /// Returns an error in case the amount exceeds the max spendable amount.
    async fn preview_pay_address(
        &self,
        fed: &FederationV2,
        _address: bitcoin::Address<NetworkUnchecked>,
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
        let walletv2 = fed.client.walletv2()?;
        let network_fee = walletv2.send_fee().await?;
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);
        let network_fee_msat = network_fee.to_sat() * 1000;
        let est_total_spend = amount_msat + fedi_fee.msats + network_fee_msat;
        let virtual_balance = fed.get_balance().await;
        if est_total_spend > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(
                    virtual_balance,
                    FederationV2::total_fedi_fee_ppm(&fee_ppms),
                    Some(PegOutFees::from_amount(network_fee)),
                    None,
                )
            )));
        }

        Ok(RpcFeeDetails {
            fedi_app_fee: RpcAmount(FederationV2::fedi_fee_amount_for_stream(
                &fees_by_stream,
                crate::fedi_fee::FediFeeStream::App,
            )),
            fedi_guardian_fee: RpcAmount(FederationV2::fedi_fee_amount_for_stream(
                &fees_by_stream,
                crate::fedi_fee::FediFeeStream::Guardian,
            )),
            network_fee: RpcAmount(Amount::from_msats(network_fee_msat)),
            federation_fee: RpcAmount(Amount::ZERO),
        })
    }

    /// Pay an onchain address
    async fn pay_address(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
        _frontend_meta: FrontendMetadata,
    ) -> Result<OperationId> {
        let walletv2 = fed.client.walletv2()?;
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
        let network_fee = walletv2.send_fee().await?;
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);
        let network_fee_msat = network_fee.to_sat() * 1000;
        let est_total_spend = amount_msat + fedi_fee.msats + network_fee_msat;

        let spend_guard = fed.spend_guard.lock().await;
        let virtual_balance = fed.get_balance().await;
        if est_total_spend > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(
                    virtual_balance,
                    FederationV2::total_fedi_fee_ppm(&fee_ppms),
                    Some(PegOutFees::from_amount(network_fee)),
                    None,
                )
            )));
        }

        let operation_id = walletv2.send(address, amount, None).await?;
        fed.write_pending_send_fedi_fees(operation_id, &fees_by_stream)
            .await?;
        drop(spend_guard);
        let _ = fed
            .record_tx_date_fiat_info(operation_id, Amount::from_msats(est_total_spend))
            .await;
        fed.subscribe_to_operation(operation_id).await?;
        Ok(operation_id)
    }

    async fn subscribe_to_onchain_addresses(&self, _fed: &FederationV2) {
        // walletv2 discovers deposits via its background scanner; there is no
        // v1-style address subscription list to replay here.
    }

    async fn subscribe_pay_address(&self, fed: &FederationV2, op_id: OperationId) -> Result<()> {
        let walletv2 = fed.client.walletv2()?;
        let final_state = walletv2.await_final_send_operation_state(op_id).await?;
        match final_state {
            FinalSendOperationState::Success(_) => {
                let _ = fed.write_success_send_fedi_fees(op_id).await;
            }
            FinalSendOperationState::Aborted | FinalSendOperationState::Failure => {
                let _ = fed.write_failed_send_fedi_fees(op_id).await;
            }
        }
        // Outcome is now persisted to the operation log by
        // outcome_or_updates inside await_final_send_operation_state,
        // so the in-memory state stash is no longer required.
        fed.send_transaction_event(op_id).await;
        Ok(())
    }

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    ) {
        match operation.meta::<WalletOperationMeta>() {
            WalletOperationMeta::Send(_) => {
                fed.spawn_cancellable("subscribe walletv2 send", move |fed| async move {
                    if let Err(error) = fed.subscribe_pay_address(operation_id).await {
                        warn!("walletv2 subscribe_pay_address failed: {error:?}");
                    }
                });
            }
            WalletOperationMeta::Receive(meta) => {
                let amount = Amount::from_msats(
                    meta.value.to_sat().saturating_sub(meta.fee.to_sat()) * 1000,
                );
                fed.spawn_cancellable("subscribe walletv2 receive", move |fed| async move {
                    let Ok(walletv2) = fed.client.walletv2() else {
                        error!("walletv2 module not present");
                        return;
                    };
                    let final_state = match walletv2
                        .await_final_receive_operation_state(operation_id)
                        .await
                    {
                        Ok(state) => state,
                        Err(error) => {
                            warn!("walletv2 await_final_receive failed: {error:?}");
                            return;
                        }
                    };
                    match final_state {
                        FinalReceiveOperationState::Success => {
                            // Scanner-created receives never wrote a pending fee
                            // entry (no creation hook on our side), so this is a
                            // no-op for fees today — kept for symmetry with the
                            // other receive subscribers and for when a pending
                            // entry exists.
                            let _ = fed
                                .write_success_receive_fedi_fees(operation_id, amount)
                                .await;
                        }
                        FinalReceiveOperationState::Aborted => {
                            let _ = fed.write_failed_receive_fedi_fees(operation_id).await;
                        }
                    }
                    fed.send_transaction_event(operation_id).await;
                });
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
        let walletv2_meta: WalletOperationMeta = entry.meta();
        match walletv2_meta {
            WalletOperationMeta::Send(meta) => {
                // On-chain send debits value + network fee from the
                // balance, so display the gross spend (receives below
                // show value - fee, the net credited).
                let amount = RpcAmount(Amount::from_msats(
                    (meta.value.to_sat() + meta.fee.to_sat()) * 1000,
                ));
                // Upstream walletv2-client now persists the terminal
                // FinalSendOperationState via outcome_or_updates. Read
                // it back so we can surface the bitcoin txid on
                // Success and a proper error state on Aborted/Failure.
                // try_outcome to avoid panicking on a shape mismatch.
                let state = entry
                    .try_outcome::<FinalSendOperationState>()
                    .ok()
                    .flatten()
                    .map(|state| match state {
                        FinalSendOperationState::Success(txid) => {
                            RpcOnchainWithdrawState::Succeeded {
                                txid: txid.to_string(),
                            }
                        }
                        FinalSendOperationState::Aborted => RpcOnchainWithdrawState::Failed {
                            error: "aborted by federation".into(),
                        },
                        FinalSendOperationState::Failure => RpcOnchainWithdrawState::Failed {
                            error: "internal failure".into(),
                        },
                    });
                // walletv2 only stores the absolute fee in SendMeta;
                // derive the sats/kvB rate from the federation's
                // configured peg-out tx vbytes (a consensus constant
                // for this federation, public on WalletClientConfig).
                // Matches v1's `fee.fee_rate.sats_per_kvb` unit. The
                // op log entry is walletv2's so the module is
                // guaranteed present.
                let send_tx_vbytes = fed
                    .client
                    .config()
                    .await
                    .get_first_module_by_kind::<fedimint_walletv2_client::common::config::WalletClientConfig>(
                        fedimint_walletv2_client::common::KIND,
                    )
                    .map(|(_, cfg)| cfg.send_tx_vbytes)
                    .unwrap_or(0);
                let fee_rate_sats_per_kvb = if send_tx_vbytes > 0 {
                    meta.fee.to_sat().saturating_mul(1000) / send_tx_vbytes
                } else {
                    0
                };

                Ok(Some(FederationTransactionParts {
                    amount,
                    kind: RpcTransactionKind::OnchainWithdraw {
                        onchain_address: meta.address.assume_checked().to_string(),
                        onchain_fees: RpcAmount(Amount::from_sats(meta.fee.to_sat())),
                        onchain_fee_rate: fee_rate_sats_per_kvb,
                        state,
                    },
                    frontend_metadata: None,
                }))
            }
            WalletOperationMeta::Receive(meta) => {
                let net_sats = meta.value.to_sat().saturating_sub(meta.fee.to_sat());
                let amount = RpcAmount(Amount::from_msats(net_sats * 1000));
                // v2 receive op-log entries are created by the
                // output-scanner once funds are spotted on-chain;
                // the terminal state is persisted to the op log by
                // await_final_receive_operation_state. No outcome
                // yet means the claim is still in flight ==
                // Confirmed. address/outpoint are None on entries
                // persisted before fedimint#8646.
                let tx_data = RpcOnchainDepositTransactionData::new(
                    &meta.outpoint.unwrap_or(bitcoin::OutPoint::null()),
                );
                let state = match entry
                    .try_outcome::<FinalReceiveOperationState>()
                    .ok()
                    .flatten()
                {
                    Some(FinalReceiveOperationState::Success) => {
                        RpcOnchainDepositState::Claimed(tx_data)
                    }
                    Some(FinalReceiveOperationState::Aborted) => RpcOnchainDepositState::Failed,
                    None => {
                        // Scanner-created ops that completed without
                        // a live subscriber (mid-session detection)
                        // have no persisted outcome yet. Subscribe
                        // lazily: completed ops resolve immediately
                        // and persist their outcome for the next
                        // listing.
                        fed.spawn_cancellable(
                            "subscribe walletv2 receive",
                            move |fed| async move {
                                let Ok(walletv2) = fed.client.walletv2() else {
                                    error!("walletv2 module not present");
                                    return;
                                };
                                let final_state = match walletv2
                                    .await_final_receive_operation_state(operation_id)
                                    .await
                                {
                                    Ok(state) => state,
                                    Err(error) => {
                                        warn!("walletv2 await_final_receive failed: {error:?}");
                                        return;
                                    }
                                };
                                match final_state {
                                    FinalReceiveOperationState::Success => {
                                        let _ = fed
                                            .write_success_receive_fedi_fees(
                                                operation_id,
                                                Amount::from_msats(net_sats * 1000),
                                            )
                                            .await;
                                    }
                                    FinalReceiveOperationState::Aborted => {
                                        let _ =
                                            fed.write_failed_receive_fedi_fees(operation_id).await;
                                    }
                                }
                                fed.send_transaction_event(operation_id).await;
                            },
                        );
                        RpcOnchainDepositState::Confirmed(tx_data)
                    }
                };

                Ok(Some(FederationTransactionParts {
                    amount,
                    kind: RpcTransactionKind::OnchainDeposit {
                        onchain_address: meta
                            .address
                            .map(|address| address.assume_checked().to_string())
                            .unwrap_or_default(),
                        peg_in_fees: RpcAmount(Amount::from_sats(meta.fee.to_sat())),
                        state: Some(state),
                    },
                    frontend_metadata: None,
                }))
            }
        }
    }
}
