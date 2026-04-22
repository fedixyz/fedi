use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::{anyhow, bail, ensure};
use api_types::invoice_generator::GenerateInvoiceBreakdownItemV5;
use async_recursion::async_recursion;
use bitcoin::Network;
use fedimint_core::core::ModuleKind;
use fedimint_core::db::IDatabaseTransactionOpsCoreTyped;
use fedimint_core::util::backoff_util::custom_backoff;
use fedimint_core::util::retry;
use fedimint_core::{Amount, SATS_PER_BITCOIN};
use fedimint_ln_client::OutgoingLightningPayment;
use futures::StreamExt;
use lightning_invoice::Bolt11Invoice;
use rpc_types::{LightningSendMetadata, RpcTransactionDirection};
use runtime::constants::MILLION;
use tokio::sync::Mutex;
use tracing::{error, info, instrument};

use super::db::{
    LastRemittedTotalAccruedFeesByStreamKey, NextFediFeeRemittanceDueAtByStreamKey,
    OutstandingFediFeesByStreamKey, OutstandingFediFeesByStreamPerTXTypeKey,
    OutstandingFediFeesByStreamPerTXTypeKeyPrefix, TotalAccruedFediFeesByStreamKey,
};
use super::{FediFeeHelper, FediFeeStream};
use crate::federation_v2::client::ClientExt;
use crate::federation_v2::db::LastFediFeesRemittanceSPv2BalanceKey;
use crate::federation_v2::{FederationV2, zero_gateway_fees};

// Unreasonable amount of fee, nobody should pay this much fee.
const UNREASONABLE_FEDI_FEE_AMOUNT: Amount = Amount::from_sats(SATS_PER_BITCOIN / 10);

#[derive(Clone)]
struct AppFeeBreakdownItem {
    module: ModuleKind,
    tx_direction: RpcTransactionDirection,
    amount: Amount,
}

impl FediFeeHelper {
    /// Queries the Fedi API for a federation-scoped app-fee invoice using the
    /// aggregate requested amount and the full per-type fee breakdown.
    pub async fn fetch_fedi_fee_invoice(
        &self,
        amount: Amount,
        network: Network,
        accrued_fee_delta: Amount,
        spv2_balance_delta_cents: Option<i64>,
        breakdown: Vec<GenerateInvoiceBreakdownItemV5>,
    ) -> anyhow::Result<Bolt11Invoice> {
        let first_comm_invite_code = self
            .runtime
            .app_state
            .with_read_lock(|state| state.first_comm_invite_code.clone())
            .await;
        self.runtime
            .fedi_api
            .fetch_fedi_fee_invoice(
                amount,
                network,
                accrued_fee_delta,
                spv2_balance_delta_cents,
                first_comm_invite_code,
                breakdown,
            )
            .await
    }
}

#[derive(Clone)]
pub struct FediFeeRemittanceService {
    // In-process single-flight guard for app-fee remittance attempts.
    remittance_lock: Arc<Mutex<()>>,
}

impl FediFeeRemittanceService {
    /// On initialization, attempt one federation-scoped app-fee remittance if
    /// app outstanding fees already exist and the stream is due.
    pub fn init(fed: &FederationV2) -> Self {
        let service = Self {
            remittance_lock: Arc::new(Mutex::new(())),
        };

        let service2 = service.clone();
        fed.spawn_cancellable("init_fee_remittance_service", move |fed| async move {
            let outstanding_total = fed
                .fedi_fee_db()
                .begin_transaction_nc()
                .await
                .get_value(&OutstandingFediFeesByStreamKey(FediFeeStream::App))
                .await
                .unwrap_or(Amount::ZERO);

            if outstanding_total > Amount::ZERO {
                service2.remit_fedi_fee_if_threshold_met(&fed).await;
            }
        });

        service
    }

    /// Checks whether the federation-scoped app-fee outstanding balance has
    /// crossed the remittance threshold or whether the stream-level due time
    /// has elapsed. If so, spawns one background remittance for the full
    /// app-fee breakdown.
    #[instrument(skip(self, fed))]
    #[cfg_attr(target_family = "wasm", async_recursion(?Send))]
    #[cfg_attr(not(target_family = "wasm"), async_recursion)]
    pub async fn remit_fedi_fee_if_threshold_met(&self, fed: &FederationV2) {
        let Ok(guard) = self.remittance_lock.clone().try_lock_owned() else {
            info!("Fedi fee remittance already running");
            return;
        };

        let (outstanding_fees_total, breakdown) = match current_app_fee_breakdown(fed).await {
            Ok(snapshot) => snapshot,
            Err(e) => {
                error!(?e, "Failed to read current app fee breakdown");
                return;
            }
        };

        let remittance_threshold = fed.fedi_fee_schedule().await.remittance_threshold_msat;
        let now = fedimint_core::time::now();

        let next_due_at = fed
            .fedi_fee_db()
            .begin_transaction_nc()
            .await
            .get_value(&NextFediFeeRemittanceDueAtByStreamKey(FediFeeStream::App))
            .await
            .expect("app fee stream state init must seed next remittance due time");
        let (should_remit, accrued_fee_exceeds_threshold) =
            if outstanding_fees_total.msats >= remittance_threshold {
                (true, true)
            } else {
                if next_due_at <= now {
                    (true, false)
                } else {
                    (false, false)
                }
            };
        if !should_remit {
            info!("Fedi fee remittance not initiated, threshold not met AND max delay not hit");
            return;
        }

        fed.spawn_cancellable("remit_fedi_fee", move |fed2| async move {
            let backoff = custom_backoff(Duration::from_secs(1), Duration::from_secs(5), Some(5));
            let res = retry("remit_fedi_fee", backoff, || {
                let fed2 = fed2.clone();
                let breakdown = breakdown.clone();
                async move {
                    Self::remit_fedi_fee(
                        &fed2,
                        outstanding_fees_total,
                        breakdown,
                        accrued_fee_exceeds_threshold,
                    )
                    .await
                }
            })
            .await;
            if let Err(e) = res {
                error!(?e, "fee remittance failed after retries");
            }
            drop(guard);
        });
    }

    /// Performs one federation-scoped app-fee remittance using the entire
    /// snapshotted app outstanding breakdown as the v5 reporting payload.
    #[instrument(skip(fed, breakdown), err, ret)]
    async fn remit_fedi_fee(
        fed: &FederationV2,
        outstanding_fees_total: Amount,
        breakdown: Vec<AppFeeBreakdownItem>,
        accrued_fee_exceeds_threshold: bool,
    ) -> anyhow::Result<()> {
        let gateway = fed.select_gateway().await?;
        let amt_to_request = if accrued_fee_exceeds_threshold {
            info!("Accrued fee exceeds threshold");
            let gateway_fees = gateway
                .as_ref()
                .map(|g| g.fees)
                .unwrap_or(zero_gateway_fees());
            let amt_to_request_numerator = MILLION
                * (outstanding_fees_total
                    .msats
                    .checked_sub(gateway_fees.base_msat as u64)
                    .ok_or(anyhow!("Accrued fee < base gateway fees!"))?);
            let amt_to_request_denominator = MILLION + gateway_fees.proportional_millionths as u64;
            Amount::from_msats(amt_to_request_numerator / amt_to_request_denominator)
        } else {
            info!("Accrued fee below threshold, will request 0-amount invoice");
            Amount::ZERO
        };

        let (current_spv2_balance, spv2_balance_delta_cents) = if let Ok(spv2_account_info) =
            fed.spv2_account_info().await
        {
            match stability_pool_client::common::FiatAmount::from_btc_amount(
                spv2_account_info.value.staged_balance + spv2_account_info.value.locked_balance,
                spv2_account_info.value.current_cycle.start_price,
            ) {
                Ok(current_bal) => {
                    let prev_bal = fed
                        .dbtx()
                        .await
                        .get_value(&LastFediFeesRemittanceSPv2BalanceKey)
                        .await
                        .unwrap_or_default();
                    (
                        Some(current_bal),
                        i64::try_from(i128::from(current_bal.0) - i128::from(prev_bal.0))
                            .inspect_err(|e| error!(%e, "Failed to calculate delta"))
                            .ok(),
                    )
                }
                Err(e) => {
                    error!(%e, "SPV2 account info exists but couldn't convert to cents, this shouldn't happen!");
                    (None, None)
                }
            }
        } else {
            info!("SPV2 account info returned error, likely module absent");
            (None, None)
        };

        let current_total_accrued_fee = fed
            .fedi_fee_db()
            .begin_transaction_nc()
            .await
            .get_value(&TotalAccruedFediFeesByStreamKey(FediFeeStream::App))
            .await
            .unwrap_or(Amount::ZERO);
        let accrued_fee_delta = current_total_accrued_fee.saturating_sub(
            fed.fedi_fee_db()
                .begin_transaction_nc()
                .await
                .get_value(&LastRemittedTotalAccruedFeesByStreamKey(FediFeeStream::App))
                .await
                .unwrap_or(Amount::ZERO),
        );

        let invoice = fed
            .fedi_fee_helper
            .fetch_fedi_fee_invoice(
                amt_to_request,
                fed.get_network().ok_or(anyhow!(
                    "Federation recovering during fee remittance, unexpected!"
                ))?,
                accrued_fee_delta,
                spv2_balance_delta_cents,
                breakdown
                    .iter()
                    .map(to_invoice_breakdown_item)
                    .collect::<Vec<_>>(),
            )
            .await?;

        // Advance the reporting checkpoints before attempting payment so a
        // 0-amount invoice or a later payment failure still counts as a handled
        // reporting interval and doesn't resend the same accrued delta.
        fed.fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let next_due_at = next_app_fee_remittance_due_at(fed);
                        async move {
                            dbtx.insert_entry(
                                &NextFediFeeRemittanceDueAtByStreamKey(FediFeeStream::App),
                                &next_due_at,
                            )
                            .await;
                            dbtx.insert_entry(
                                &LastRemittedTotalAccruedFeesByStreamKey(FediFeeStream::App),
                                &current_total_accrued_fee,
                            )
                            .await;
                            if let Some(current_bal) = current_spv2_balance {
                                dbtx.insert_entry(
                                    &LastFediFeesRemittanceSPv2BalanceKey,
                                    &current_bal,
                                )
                                .await;
                            }
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            })?;

        if !accrued_fee_exceeds_threshold {
            bail!("Fedi fee less gateway fee would be effectively 0");
        }

        let invoice_amt = Amount::from_msats(
            invoice
                .amount_milli_satoshis()
                .expect("amount must be present"),
        );
        if invoice_amt > UNREASONABLE_FEDI_FEE_AMOUNT {
            bail!("likely bug: Fedi fee amount({invoice_amt}) is too high, we refuse to pay");
        }
        ensure!(
            invoice_amt == amt_to_request,
            "invoice amount must be match requested amount"
        );
        info!("fedi fee threshold exceeded, remitting");

        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: true,
            frontend_metadata: None,
        };
        let ln = fed.client.ln()?;
        let OutgoingLightningPayment { payment_type, .. } = ln
            .pay_bolt11_invoice(gateway, invoice.to_owned(), extra_meta.clone())
            .await?;

        fed.fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let breakdown = breakdown.clone();
                        async move {
                            apply_app_breakdown_to_outstanding(
                                dbtx,
                                &breakdown,
                                outstanding_fees_total,
                                true,
                            )
                            .await;
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            })?;

        if let Err(e) = fed.subscribe_to_ln_pay(payment_type, extra_meta).await {
            fed.fedi_fee_db()
                .autocommit(
                    |dbtx, _| {
                        Box::pin({
                            let breakdown = breakdown.clone();
                            async move {
                                apply_app_breakdown_to_outstanding(
                                    dbtx,
                                    &breakdown,
                                    outstanding_fees_total,
                                    false,
                                )
                                .await;
                                Ok::<(), anyhow::Error>(())
                            }
                        })
                    },
                    Some(100),
                )
                .await
                .map_err(|e| match e {
                    fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                        anyhow::anyhow!(last_error)
                    }
                    fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
                })?;
            return Err(e);
        }

        Ok(())
    }
}

fn next_app_fee_remittance_due_at(fed: &FederationV2) -> SystemTime {
    fedimint_core::time::now()
        .checked_add(Duration::from_secs(
            fed.runtime
                .feature_catalog
                .fedi_fee
                .remittance_max_delay_secs
                .into(),
        ))
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

fn to_invoice_breakdown_item(item: &AppFeeBreakdownItem) -> GenerateInvoiceBreakdownItemV5 {
    GenerateInvoiceBreakdownItemV5 {
        module: item.module.to_string(),
        tx_direction: match item.tx_direction {
            RpcTransactionDirection::Receive => runtime::api::TransactionDirection::Receive,
            RpcTransactionDirection::Send => runtime::api::TransactionDirection::Send,
        },
        amount_msat: item.amount.msats,
    }
}

async fn current_app_fee_breakdown(
    fed: &FederationV2,
) -> anyhow::Result<(Amount, Vec<AppFeeBreakdownItem>)> {
    let fee_db = fed.fedi_fee_db();
    let mut dbtx = fee_db.begin_transaction_nc().await;
    let total = dbtx
        .get_value(&OutstandingFediFeesByStreamKey(FediFeeStream::App))
        .await
        .unwrap_or(Amount::ZERO);
    let breakdown = dbtx
        .find_by_prefix(&OutstandingFediFeesByStreamPerTXTypeKeyPrefix(
            FediFeeStream::App,
        ))
        .await
        .filter_map(|(key, amount)| async move {
            (amount > Amount::ZERO).then_some(AppFeeBreakdownItem {
                module: key.1,
                tx_direction: key.2,
                amount,
            })
        })
        .collect::<Vec<_>>()
        .await;
    let breakdown_total = breakdown
        .iter()
        .fold(Amount::ZERO, |sum, item| sum + item.amount);
    ensure!(
        breakdown_total == total,
        "app fee outstanding breakdown mismatch: {breakdown_total} != {total}"
    );
    Ok((total, breakdown))
}

async fn apply_app_breakdown_to_outstanding(
    dbtx: &mut fedimint_core::db::DatabaseTransaction<'_>,
    breakdown: &[AppFeeBreakdownItem],
    total: Amount,
    subtract: bool,
) {
    let outstanding_key = OutstandingFediFeesByStreamKey(FediFeeStream::App);
    let current_total = dbtx
        .get_value(&outstanding_key)
        .await
        .unwrap_or(Amount::ZERO);
    let new_total = if subtract {
        current_total.saturating_sub(total)
    } else {
        current_total + total
    };
    dbtx.insert_entry(&outstanding_key, &new_total).await;

    for item in breakdown {
        let key = OutstandingFediFeesByStreamPerTXTypeKey(
            FediFeeStream::App,
            item.module.clone(),
            item.tx_direction.clone(),
        );
        let current = dbtx.get_value(&key).await.unwrap_or(Amount::ZERO);
        let new_value = if subtract {
            current.saturating_sub(item.amount)
        } else {
            current + item.amount
        };
        dbtx.insert_entry(&key, &new_value).await;
    }
}
