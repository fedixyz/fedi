use std::collections::BTreeMap;
use std::time::{Duration, SystemTime};

use anyhow::ensure;
use fedimint_core::Amount;
use fedimint_core::core::OperationId;
use fedimint_core::db::{
    AutocommitResultExt, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped,
};
use futures::StreamExt;
use rand::Rng;
use rpc_types::{
    GuardianFeeRemittanceBreakdownItem, GuardianFeeRemittanceSnapshot, SPv2DepositMetadata,
};
use runtime::storage::state::{FediGuardianFeeConfig, FediGuardianFeeRecipient};
use stability_pool_client::common::{Account, AccountId, AccountType, BtcBalanceDepositMetadata};
use stability_pool_client::{StabilityPoolDepositOperationState, StabilityPoolMeta};
use tracing::error;

use super::FediFeeStream;
use super::db::{
    CurrentGuardianFeeRemittanceOperationKey, NextFediFeeRemittanceDueAtByStreamKey,
    OutstandingFediFeesByStreamKey, OutstandingFediFeesByStreamPerTXTypeKey,
    OutstandingFediFeesByStreamPerTXTypeKeyPrefix,
};
use super::guardian_metadata::{
    GuardianFeeBreakdownItemV1, GuardianFeeRemittanceMetadataV1,
    encrypt_guardian_remittance_metadata,
};
use crate::federation_v2::FederationV2;
use crate::federation_v2::client::ClientExt;
use crate::federation_v2::db::BridgeDbPrefix;
// Guardians should set this to 0 to stop new guardian-fee accrual while
// still leaving remittance config available to drain any already-accrued fee.
pub const FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY: &str = "fedi:guardian_fee_send_ppm";
pub const FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY: &str =
    "fedi:guardian_fee_remittance_account";
// Guardian fee config is federation-controlled metadata, so keep a very high
// but finite sanity cap to avoid obviously broken values.
pub(crate) const FEDI_GUARDIAN_FEE_SEND_PPM_MAX: u64 = 210_000;
const MAX_GUARDIAN_FEE_RECIPIENTS: usize = 32;

/// Manifold keeps using the legacy remittance-account meta key, but replaces
/// its single `Account` value with this versioned weighted list for new
/// federations.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct GuardianFeeRecipientList {
    version: u16,
    recipients: Vec<FediGuardianFeeRecipient>,
}

pub fn parse_fedi_guardian_fee_config(
    meta: &BTreeMap<String, String>,
) -> anyhow::Result<Option<FediGuardianFeeConfig>> {
    let guardian_fee_send_ppm = meta.get(FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY);
    let remittance_accounts = meta.get(FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY);

    let (Some(guardian_fee_send_ppm), Some(remittance_accounts)) =
        (guardian_fee_send_ppm, remittance_accounts)
    else {
        ensure!(
            guardian_fee_send_ppm.is_none() && remittance_accounts.is_none(),
            "guardian fee config must define both {} and {}",
            FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY,
            FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY,
        );
        return Ok(None);
    };

    let send_ppm = guardian_fee_send_ppm.parse::<u64>()?;
    ensure!(
        send_ppm <= FEDI_GUARDIAN_FEE_SEND_PPM_MAX,
        "guardian fee send ppm must be <= {}",
        FEDI_GUARDIAN_FEE_SEND_PPM_MAX,
    );
    // Existing federations publish one Account. Manifold federations publish
    // the versioned list under the same meta key.
    let recipients = match serde_json::from_str::<Account>(remittance_accounts) {
        Ok(account) => vec![FediGuardianFeeRecipient { account, weight: 1 }],
        Err(_) => {
            let list: GuardianFeeRecipientList = serde_json::from_str(remittance_accounts)?;
            ensure!(
                list.version == 1,
                "unsupported guardian fee recipient list version"
            );
            list.recipients
        }
    };
    let config = FediGuardianFeeConfig {
        send_ppm,
        recipients,
    };
    validate_guardian_fee_recipients(&config.recipients)?;

    Ok(Some(config))
}

/// Validates the wire policy and returns its total weight.
///
/// Sorted, unique account ids make the metadata canonical and prevent two
/// outputs for the same account in the single remittance transaction.
fn validate_guardian_fee_recipients(
    recipients: &[FediGuardianFeeRecipient],
) -> anyhow::Result<u64> {
    ensure!(
        !recipients.is_empty() && recipients.len() <= MAX_GUARDIAN_FEE_RECIPIENTS,
        "guardian fee recipient count must be between 1 and {MAX_GUARDIAN_FEE_RECIPIENTS}"
    );
    let mut previous: Option<AccountId> = None;
    let mut total_weight = 0_u64;
    for recipient in recipients {
        ensure!(
            recipient.account.acc_type() == AccountType::BtcDepositor,
            "guardian fee remittance account must be a btc-balance account"
        );
        ensure!(
            recipient.account.as_single().is_some(),
            "guardian fee remittance account must be single-sig"
        );
        ensure!(
            recipient.weight != 0,
            "guardian fee recipient weight must be positive"
        );
        let account_id = recipient.account.id();
        ensure!(
            previous.as_ref().is_none_or(|last| last < &account_id),
            "guardian fee recipients must be unique and sorted by account id"
        );
        previous = Some(account_id);
        total_weight = total_weight
            .checked_add(recipient.weight)
            .ok_or_else(|| anyhow::anyhow!("guardian fee recipient weights overflow"))?;
    }
    Ok(total_weight)
}

/// One recipient's output plus the accounting breakdown encrypted for it.
#[derive(Clone)]
struct GuardianFeeRecipientRemittance {
    account: Account,
    amount: Amount,
    snapshot: GuardianFeeRemittanceSnapshot,
}

/// The aggregate ledger slice to reserve and the recipient outputs it funds.
struct GuardianFeeRemittancePlan {
    amount: Amount,
    snapshot: GuardianFeeRemittanceSnapshot,
    recipients: Vec<GuardianFeeRecipientRemittance>,
}

/// Checked equivalent of summing `Amount`s with `+`, whose inner value is a
/// `u64`.
fn checked_amount_sum(amounts: impl IntoIterator<Item = Amount>) -> anyhow::Result<Amount> {
    amounts
        .into_iter()
        .try_fold(0_u64, |total, amount| total.checked_add(amount.msats))
        .map(Amount::from_msats)
        .ok_or_else(|| anyhow::anyhow!("guardian fee amount overflow"))
}

/// Checked addition used before mutating persisted fee totals.
fn checked_amount_add(left: Amount, right: Amount) -> anyhow::Result<Amount> {
    left.msats
        .checked_add(right.msats)
        .map(Amount::from_msats)
        .ok_or_else(|| anyhow::anyhow!("guardian fee amount overflow"))
}

/// Applies the recipient weights at remit time without changing accrual.
///
/// Each breakdown row is divided by the total weight, giving every recipient
/// `unit * weight`. The indivisible remainder stays in the aggregate ledger
/// for a future remittance. Returning `None` until every output reaches SPv2's
/// minimum lets all recipients be submitted in one atomic transaction.
fn plan_guardian_fee_remittance(
    outstanding_breakdown: &[GuardianFeeRemittanceBreakdownItem],
    recipients: &[FediGuardianFeeRecipient],
    minimum: Amount,
) -> anyhow::Result<Option<GuardianFeeRemittancePlan>> {
    let total_weight = validate_guardian_fee_recipients(recipients)?;
    let mut recipient_amounts = vec![Amount::ZERO; recipients.len()];
    let mut recipient_breakdowns = vec![Vec::new(); recipients.len()];
    let mut remittance_breakdown = Vec::new();

    for item in outstanding_breakdown {
        let unit = item.amount.msats / total_weight;
        if unit == 0 {
            continue;
        }
        let remitted = Amount::from_msats(
            unit.checked_mul(total_weight)
                .ok_or_else(|| anyhow::anyhow!("guardian fee remittance amount overflow"))?,
        );
        remittance_breakdown.push(GuardianFeeRemittanceBreakdownItem {
            module: item.module.clone(),
            tx_direction: item.tx_direction.clone(),
            amount: remitted,
        });

        for (index, recipient) in recipients.iter().enumerate() {
            let share = Amount::from_msats(
                unit.checked_mul(recipient.weight)
                    .ok_or_else(|| anyhow::anyhow!("guardian fee recipient share overflow"))?,
            );
            recipient_amounts[index] = checked_amount_add(recipient_amounts[index], share)?;
            recipient_breakdowns[index].push(GuardianFeeRemittanceBreakdownItem {
                module: item.module.clone(),
                tx_direction: item.tx_direction.clone(),
                amount: share,
            });
        }
    }

    if remittance_breakdown.is_empty() || recipient_amounts.iter().any(|amount| *amount < minimum) {
        return Ok(None);
    }

    let mut remittances = Vec::with_capacity(recipients.len());
    for ((recipient, amount), breakdown) in recipients
        .iter()
        .zip(recipient_amounts)
        .zip(recipient_breakdowns)
    {
        ensure!(
            checked_amount_sum(breakdown.iter().map(|item| item.amount))? == amount,
            "guardian fee recipient breakdown mismatch"
        );
        remittances.push(GuardianFeeRecipientRemittance {
            account: recipient.account.clone(),
            amount,
            snapshot: GuardianFeeRemittanceSnapshot { breakdown },
        });
    }
    let remittance_amount =
        checked_amount_sum(remittance_breakdown.iter().map(|item| item.amount))?;
    ensure!(
        checked_amount_sum(remittances.iter().map(|recipient| recipient.amount))?
            == remittance_amount,
        "guardian fee remittance plan does not conserve millisatoshis"
    );
    Ok(Some(GuardianFeeRemittancePlan {
        amount: remittance_amount,
        snapshot: GuardianFeeRemittanceSnapshot {
            breakdown: remittance_breakdown,
        },
        recipients: remittances,
    }))
}

/// Atomically reserves exactly the planned aggregate ledger slice.
///
/// This subtracts instead of clearing the ledger because indivisible dust and
/// fees accrued while an earlier operation was in flight must remain payable.
async fn reserve_guardian_fee_remittance_dbtx(
    dbtx: &mut DatabaseTransaction<'_>,
    operation_id: OperationId,
    amount: Amount,
    snapshot: &GuardianFeeRemittanceSnapshot,
) -> anyhow::Result<()> {
    let outstanding_key = OutstandingFediFeesByStreamKey(FediFeeStream::Guardian);
    let outstanding = dbtx
        .get_value(&outstanding_key)
        .await
        .unwrap_or(Amount::ZERO);
    let remaining = outstanding
        .msats
        .checked_sub(amount.msats)
        .map(Amount::from_msats)
        .ok_or_else(|| anyhow::anyhow!("guardian fee reservation exceeds outstanding"))?;

    let mut remaining_breakdown = Vec::with_capacity(snapshot.breakdown.len());
    for item in &snapshot.breakdown {
        let key = OutstandingFediFeesByStreamPerTXTypeKey(
            FediFeeStream::Guardian,
            item.module.clone(),
            item.tx_direction.clone(),
        );
        let current = dbtx.get_value(&key).await.unwrap_or(Amount::ZERO);
        let remaining = current
            .msats
            .checked_sub(item.amount.msats)
            .map(Amount::from_msats)
            .ok_or_else(|| anyhow::anyhow!("guardian fee breakdown reservation underflow"))?;
        remaining_breakdown.push((key, remaining));
    }

    dbtx.insert_entry(&outstanding_key, &remaining).await;
    for (key, remaining) in remaining_breakdown {
        dbtx.insert_entry(&key, &remaining).await;
    }
    dbtx.insert_entry(&CurrentGuardianFeeRemittanceOperationKey, &operation_id)
        .await;
    Ok(())
}

/// Idempotently clears the in-flight marker after an accepted transaction.
/// A stale callback is ignored because its operation id no longer owns the
/// marker.
async fn settle_guardian_fee_remittance_dbtx(
    dbtx: &mut DatabaseTransaction<'_>,
    operation_id: OperationId,
    next_due_at: SystemTime,
) -> anyhow::Result<bool> {
    if dbtx
        .get_value(&CurrentGuardianFeeRemittanceOperationKey)
        .await
        != Some(operation_id)
    {
        return Ok(false);
    }

    dbtx.insert_entry(
        &NextFediFeeRemittanceDueAtByStreamKey(FediFeeStream::Guardian),
        &next_due_at,
    )
    .await;
    dbtx.remove_entry(&CurrentGuardianFeeRemittanceOperationKey)
        .await;
    Ok(true)
}

/// Idempotently restores the reserved slice after a definitive rejection.
/// All checked additions happen before writes so overflow aborts the database
/// transaction without losing the in-flight marker.
async fn restore_guardian_fee_remittance_dbtx(
    dbtx: &mut DatabaseTransaction<'_>,
    operation_id: OperationId,
    amount: Amount,
    snapshot: &GuardianFeeRemittanceSnapshot,
) -> anyhow::Result<bool> {
    if dbtx
        .get_value(&CurrentGuardianFeeRemittanceOperationKey)
        .await
        != Some(operation_id)
    {
        return Ok(false);
    }

    let outstanding_key = OutstandingFediFeesByStreamKey(FediFeeStream::Guardian);
    let current_outstanding = dbtx
        .get_value(&outstanding_key)
        .await
        .unwrap_or(Amount::ZERO);
    let restored_outstanding = checked_amount_add(current_outstanding, amount)?;

    let mut restored_breakdown = Vec::with_capacity(snapshot.breakdown.len());
    for item in &snapshot.breakdown {
        let key = OutstandingFediFeesByStreamPerTXTypeKey(
            FediFeeStream::Guardian,
            item.module.clone(),
            item.tx_direction.clone(),
        );
        let current = dbtx.get_value(&key).await.unwrap_or(Amount::ZERO);
        restored_breakdown.push((key, checked_amount_add(current, item.amount)?));
    }

    dbtx.insert_entry(&outstanding_key, &restored_outstanding)
        .await;
    for (key, restored) in restored_breakdown {
        dbtx.insert_entry(&key, &restored).await;
    }
    dbtx.remove_entry(&CurrentGuardianFeeRemittanceOperationKey)
        .await;
    Ok(true)
}

#[derive(Debug, PartialEq, Eq)]
enum GuardianFeeDepositAction {
    Wait,
    Restore,
    Settle,
}

/// Only transaction rejection means the recipient outputs were not applied.
/// `PrimaryOutputError` happens after transaction acceptance, so restoring on
/// it would pay the same fees twice.
fn guardian_fee_deposit_action(
    state: &StabilityPoolDepositOperationState,
) -> GuardianFeeDepositAction {
    match state {
        StabilityPoolDepositOperationState::TxRejected(_) => GuardianFeeDepositAction::Restore,
        StabilityPoolDepositOperationState::PrimaryOutputError(_)
        | StabilityPoolDepositOperationState::Success => GuardianFeeDepositAction::Settle,
        StabilityPoolDepositOperationState::Initiated
        | StabilityPoolDepositOperationState::TxAccepted => GuardianFeeDepositAction::Wait,
    }
}

/// Background service that schedules, submits, and reconciles guardian-fee
/// remittances independently from the existing app-fee remittance flow.
///
/// ```mermaid
/// flowchart TD
///     A[Poll guardian remittance service] --> B{Current remittance op exists?}
///
///     B -->|yes| C[Ensure subscription to existing operation]
///     C --> Z[Done]
///
///     B -->|no| D{Guardian config present?}
///     D -->|no| Z
///     D -->|yes| E[Try to create guardian remittance op in one autocommit]
///
///     E -->|Not due / no outstanding| Z
///     E -->|Submitted| F[Persist current operation id]
///     F --> C
/// ```
#[derive(Clone)]
pub struct GuardianFeeRemittanceService;

impl GuardianFeeRemittanceService {
    /// Starts the background poll loop that drives guardian remittance
    /// scheduling and recovery.
    pub fn init(fed: &FederationV2) -> Self {
        let service = Self;
        let service2 = service.clone();

        fed.spawn_cancellable("guardian_fee_remittance_service", move |fed| async move {
            loop {
                service2.maybe_schedule_guardian_fee_remittance(&fed).await;
                fedimint_core::task::sleep(Duration::from_secs(
                    fed.runtime
                        .feature_catalog
                        .fedi_fee
                        .guardian_remittance_poll_interval_secs
                        .into(),
                ))
                .await;
            }
        });

        service
    }

    /// Runs one iteration of the guardian remittance control loop: if a
    /// current remittance already exists, reattach to it; otherwise, try to
    /// create a new remittance deposit operation if one is due.
    async fn maybe_schedule_guardian_fee_remittance(&self, fed: &FederationV2) {
        // A submitted guardian remittance is represented by its stable
        // operation id. If one is already recorded, just make sure we are
        // subscribed to its outcome and do not create another remittance.
        if let Some(operation_id) = fed
            .fedi_fee_db()
            .begin_transaction_nc()
            .await
            .get_value(&CurrentGuardianFeeRemittanceOperationKey)
            .await
        {
            self.subscribe_guardian_remittance(fed, operation_id).await;
            return;
        }

        let Some(guardian_fee_config) = fed.guardian_fee_config().await else {
            return;
        };

        let spv2_instance = match fed.client.spv2() {
            Ok(spv2) => spv2,
            Err(error) => {
                error!(
                    ?error,
                    "Failed to access stability-pool client for remittance"
                );
                return;
            }
        };
        let spv2_instance_id = spv2_instance.id;
        let spv2 = spv2_instance.inner().clone();
        let recipients = guardian_fee_config.recipients;
        if let Err(error) = validate_guardian_fee_recipients(&recipients) {
            error!(?error, "Guardian fee recipient policy is invalid");
            return;
        }
        for recipient in &recipients {
            if let Err(error) = spv2
                .ensure_btc_balance_deposit_supported(recipient.account.id())
                .await
            {
                error!(
                    ?error,
                    "Guardian fee remittance account is not currently deposit-capable"
                );
                return;
            }
        }

        #[derive(Debug)]
        enum SubmissionResult {
            Noop,
            Submitted(OperationId),
        }

        let operation_id = match fed
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    let spv2 = spv2.clone();
                    let recipients = recipients.clone();
                    Box::pin(async move {
                        let plan = {
                            let mut fee_dbtx = dbtx
                                .to_ref_nc()
                                .with_prefix(vec![BridgeDbPrefix::FediFeePrefix as u8]);

                            // Another remittance may have won the race before
                            // this autocommit started. Re-check the single
                            // in-flight marker inside the transaction boundary
                            // before creating a new operation.
                            if fee_dbtx
                                .get_value(&CurrentGuardianFeeRemittanceOperationKey)
                                .await
                                .is_some()
                            {
                                return Ok::<SubmissionResult, anyhow::Error>(
                                    SubmissionResult::Noop,
                                );
                            }

                            let outstanding_key =
                                OutstandingFediFeesByStreamKey(FediFeeStream::Guardian);
                            let outstanding_fees = fee_dbtx
                                .get_value(&outstanding_key)
                                .await
                                .unwrap_or(Amount::ZERO);
                            if outstanding_fees == Amount::ZERO {
                                return Ok(SubmissionResult::Noop);
                            }

                            let Some(next_due_at) = fee_dbtx
                                .get_value(&NextFediFeeRemittanceDueAtByStreamKey(
                                    FediFeeStream::Guardian,
                                ))
                                .await
                            else {
                                // Seed the first due time lazily. A later poll
                                // will pick the remittance up once this
                                // deadline is reached.
                                fee_dbtx
                                    .insert_entry(
                                        &NextFediFeeRemittanceDueAtByStreamKey(
                                            FediFeeStream::Guardian,
                                        ),
                                        &Self::next_guardian_remittance_due_at(fed),
                                    )
                                    .await;
                                return Ok(SubmissionResult::Noop);
                            };

                            if next_due_at > fedimint_core::time::now() {
                                return Ok(SubmissionResult::Noop);
                            }

                            let mut breakdown: Vec<GuardianFeeRemittanceBreakdownItem> = fee_dbtx
                                .find_by_prefix(&OutstandingFediFeesByStreamPerTXTypeKeyPrefix(
                                    FediFeeStream::Guardian,
                                ))
                                .await
                                .map(|(key, amount)| GuardianFeeRemittanceBreakdownItem {
                                    module: key.1,
                                    tx_direction: key.2,
                                    amount,
                                })
                                .collect::<Vec<_>>()
                                .await;
                            breakdown.retain(|item| item.amount != Amount::ZERO);

                            let breakdown_total =
                                checked_amount_sum(breakdown.iter().map(|item| item.amount))?;
                            // The stream-wide outstanding total and its
                            // per-(module, direction) breakdown should
                            // describe the same funds before we snapshot them
                            // into operation metadata.
                            anyhow::ensure!(
                                breakdown_total == outstanding_fees,
                                "guardian outstanding total mismatch: total={} breakdown={}",
                                outstanding_fees.msats,
                                breakdown_total.msats,
                            );
                            // Accrual remains one aggregate ledger. Apply the
                            // current metadata policy only when building this
                            // remittance.
                            let Some(plan) = plan_guardian_fee_remittance(
                                &breakdown,
                                &recipients,
                                spv2.cfg.min_allowed_seek,
                            )?
                            else {
                                return Ok(SubmissionResult::Noop);
                            };
                            plan
                        };

                        let deposits = plan
                            .recipients
                            .iter()
                            .map(|recipient| {
                                let encrypted_metadata =
                                    Self::encrypt_guardian_fee_remittance_metadata(
                                        &recipient.account,
                                        recipient.amount,
                                        &recipient.snapshot,
                                    )?;
                                Ok((
                                    recipient.account.id(),
                                    recipient.amount,
                                    BtcBalanceDepositMetadata(encrypted_metadata),
                                ))
                            })
                            .collect::<anyhow::Result<Vec<_>>>()?;
                        let operation_id = OperationId::new_random();
                        {
                            let mut spv2_dbtx =
                                dbtx.to_ref_with_prefix_module_id(spv2_instance_id).0;
                            // Every recipient is an output of this one Fedimint
                            // transaction, so acceptance or rejection is
                            // atomic across the entire split.
                            spv2.deposit_to_btc_balances_dbtx(
                                &mut spv2_dbtx,
                                operation_id,
                                deposits,
                                SPv2DepositMetadata::GuardianFeeRemittance {
                                    snapshot: plan.snapshot.clone(),
                                },
                            )
                            .await?;
                        }

                        let mut fee_dbtx = dbtx
                            .to_ref_nc()
                            .with_prefix(vec![BridgeDbPrefix::FediFeePrefix as u8]);
                        // Operation creation, recipient outputs, and ledger
                        // reservation share this outer autocommit.
                        reserve_guardian_fee_remittance_dbtx(
                            &mut fee_dbtx,
                            operation_id,
                            plan.amount,
                            &plan.snapshot,
                        )
                        .await?;

                        Ok(SubmissionResult::Submitted(operation_id))
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit()
        {
            Ok(SubmissionResult::Submitted(operation_id)) => operation_id,
            Ok(SubmissionResult::Noop) => return,
            Err(error) => {
                error!(?error, "Failed to create guardian fee remittance operation");
                return;
            }
        };

        // While a guardian remittance operation is in flight we do not want to
        // create another one anyway, so this service can simply await the
        // deposit subscriber inline and resume polling after reconciliation.
        self.subscribe_guardian_remittance(fed, operation_id).await;
    }

    /// Subscribes to the guardian remittance deposit operation and reconciles
    /// the reserved guardian fee ledger once it reaches a terminal state.
    async fn subscribe_guardian_remittance(&self, fed: &FederationV2, operation_id: OperationId) {
        let Ok(spv2) = fed.client.spv2() else {
            return;
        };
        let Ok(update_stream) = spv2.subscribe_deposit_operation(operation_id).await else {
            // An observation failure is ambiguous. Keep the marker so a later
            // poll can reattach instead of recreating an accepted payment.
            return;
        };

        let mut updates = update_stream.into_stream();
        while let Some(state) = updates.next().await {
            fed.update_operation_state(operation_id, state.clone())
                .await;
            match guardian_fee_deposit_action(&state) {
                GuardianFeeDepositAction::Restore => {
                    let _ = self
                        .handle_guardian_fee_remittance_failure(fed, operation_id)
                        .await;
                    return;
                }
                GuardianFeeDepositAction::Settle => {
                    fed.spv2_force_sync();
                    let _ = self
                        .handle_guardian_fee_remittance_success(fed, operation_id)
                        .await;
                    return;
                }
                GuardianFeeDepositAction::Wait => {}
            }
        }
    }

    /// Finalizes a successful guardian remittance by clearing the current
    /// in-flight operation and scheduling the next remittance. Outstanding was
    /// already reserved when the remittance operation was created.
    pub async fn handle_guardian_fee_remittance_success(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
    ) -> anyhow::Result<()> {
        fed.fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async move {
                        settle_guardian_fee_remittance_dbtx(
                            dbtx,
                            operation_id,
                            Self::next_guardian_remittance_due_at(fed),
                        )
                        .await?;
                        Ok(())
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit()
    }

    /// Finalizes a failed guardian remittance by restoring the reserved
    /// guardian outstanding amounts from the operation snapshot and clearing
    /// the current in-flight marker.
    pub async fn handle_guardian_fee_remittance_failure(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
    ) -> anyhow::Result<()> {
        let Some((amount, snapshot)) =
            Self::guardian_fee_remittance_snapshot_from_operation(fed, operation_id).await?
        else {
            return Ok(());
        };

        fed.fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    let snapshot = snapshot.clone();
                    Box::pin(async move {
                        restore_guardian_fee_remittance_dbtx(dbtx, operation_id, amount, &snapshot)
                            .await?;
                        Ok(())
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit()
    }

    /// Loads the guardian remittance snapshot from the submitted SPv2 deposit
    /// operation metadata, along with the total remitted amount stored in the
    /// top-level `Deposit` meta.
    async fn guardian_fee_remittance_snapshot_from_operation(
        fed: &FederationV2,
        operation_id: OperationId,
    ) -> anyhow::Result<Option<(Amount, GuardianFeeRemittanceSnapshot)>> {
        let Some(operation) = fed.client.operation_log().get_operation(operation_id).await else {
            return Ok(None);
        };
        // Guardian remittance uses the normal deposit path, so its durable
        // accounting snapshot lives in `Deposit` extra_meta rather than
        // in a separate bridge-owned pending record.
        let StabilityPoolMeta::Deposit {
            amount, extra_meta, ..
        } = operation.meta()
        else {
            return Ok(None);
        };

        Ok(
            match serde_json::from_value::<SPv2DepositMetadata>(extra_meta).ok() {
                Some(SPv2DepositMetadata::GuardianFeeRemittance { snapshot }) => {
                    Some((amount, snapshot))
                }
                _ => None,
            },
        )
    }

    /// Encrypts the guardian remittance breakdown into the metadata blob
    /// attached to the internal btc-balance deposit.
    fn encrypt_guardian_fee_remittance_metadata(
        remittance_account: &Account,
        amount: Amount,
        snapshot: &GuardianFeeRemittanceSnapshot,
    ) -> anyhow::Result<Vec<u8>> {
        // First serialize the human-readable accounting payload that the
        // guardian should be able to decrypt and inspect after remittance.
        let plaintext = GuardianFeeRemittanceMetadataV1 {
            version: 1,
            total_msats: amount.msats,
            breakdown: snapshot
                .breakdown
                .iter()
                .map(|item| GuardianFeeBreakdownItemV1 {
                    module: item.module.to_string(),
                    direction: item.tx_direction.clone(),
                    amount_msats: item.amount.msats,
                })
                .collect(),
            remitted_at_unix: fedimint_core::time::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("current time is after unix epoch")
                .as_secs(),
        };
        encrypt_guardian_remittance_metadata(remittance_account, &plaintext)
    }

    /// Computes the next guardian remittance due time from the current time,
    /// with randomized jitter centered around the base interval.
    fn next_guardian_remittance_due_at(fed: &FederationV2) -> SystemTime {
        let base_interval_secs = u64::from(
            fed.runtime
                .feature_catalog
                .fedi_fee
                .guardian_remittance_interval_secs,
        );
        let max_jitter_secs = u64::from(
            fed.runtime
                .feature_catalog
                .fedi_fee
                .guardian_remittance_jitter_max_secs,
        );
        let jittered_interval_secs = base_interval_secs.saturating_sub(max_jitter_secs)
            + Self::guardian_remittance_jitter_offset_secs(fed);
        fedimint_core::time::now() + Duration::from_secs(jittered_interval_secs)
    }

    /// Draws a fresh offset into the `[base - max, base + max]` jitter window
    /// so repeated remittances are less linkable by timing.
    fn guardian_remittance_jitter_offset_secs(fed: &FederationV2) -> u64 {
        let max_jitter_secs = u64::from(
            fed.runtime
                .feature_catalog
                .fedi_fee
                .guardian_remittance_jitter_max_secs,
        );
        rand::thread_rng().gen_range(0..=(2 * max_jitter_secs))
    }
}

#[cfg(test)]
mod tests {
    use bitcoin::secp256k1::{PublicKey, Secp256k1, SecretKey};
    use fedimint_core::core::ModuleKind;
    use fedimint_core::db::Database;
    use fedimint_core::db::mem_impl::MemDatabase;
    use rpc_types::RpcTransactionDirection;

    use super::*;

    const FI_FIXTURE_SECRET_BYTE: u8 = 30;
    const FEDI_FIXTURE_SECRET_BYTE: u8 = 31;

    fn account(byte: u8) -> Account {
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_slice(&[byte; 32]).expect("valid secret key");
        let public_key = PublicKey::from_secret_key(&secp, &secret_key);
        Account::single(public_key, AccountType::BtcDepositor)
    }

    fn meta(value: String) -> BTreeMap<String, String> {
        meta_with_ppm(value, 250)
    }

    fn meta_with_ppm(value: String, ppm: u64) -> BTreeMap<String, String> {
        BTreeMap::from([
            (
                FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY.to_string(),
                ppm.to_string(),
            ),
            (
                FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY.to_string(),
                value,
            ),
        ])
    }

    fn recipient_list_json(entries: &[(Account, u64)]) -> String {
        serde_json::json!({
            "version": 1,
            "recipients": entries
                .iter()
                .map(|(account, weight)| serde_json::json!({
                    "account": account,
                    "weight": weight,
                }))
                .collect::<Vec<_>>(),
        })
        .to_string()
    }

    fn manifold_4_1_1_recipients(guardian_count: u8) -> Vec<(Account, u64)> {
        let mut entries = (1..=guardian_count)
            .map(|byte| (account(byte), 1))
            .chain([
                (account(FI_FIXTURE_SECRET_BYTE), 4),
                (account(FEDI_FIXTURE_SECRET_BYTE), 1),
            ])
            .collect::<Vec<_>>();
        entries.sort_by_key(|(account, _)| account.id());
        entries
    }

    #[test]
    fn parses_legacy_and_weighted_guardian_fee_config() {
        let legacy = account(7);
        let config = parse_fedi_guardian_fee_config(&meta(
            serde_json::to_string(&legacy).expect("account should serialize"),
        ))
        .unwrap()
        .unwrap();
        assert_eq!(
            config.recipients,
            vec![FediGuardianFeeRecipient {
                account: legacy.clone(),
                weight: 1,
            }]
        );

        let entries = manifold_4_1_1_recipients(7);
        let wire = recipient_list_json(&entries);
        assert!(!wire.contains("account_id"));
        let config = parse_fedi_guardian_fee_config(&meta(wire))
            .unwrap()
            .unwrap();
        assert_eq!(config.recipients.len(), 9);
        assert_eq!(
            config
                .recipients
                .iter()
                .map(|recipient| recipient.weight)
                .sum::<u64>(),
            12
        );
    }

    #[test]
    fn rejects_invalid_recipient_lists() {
        let a = account(7);
        let b = account(8);
        let mut sorted = vec![(a.clone(), 1), (b.clone(), 1)];
        sorted.sort_by_key(|(account, _)| account.id());
        let mut unsorted = sorted.clone();
        unsorted.reverse();
        let invalid = [
            serde_json::json!({"version": 2, "recipients": [{"account": a, "weight": 1}]})
                .to_string(),
            serde_json::json!({"version": 1, "recipients": []}).to_string(),
            recipient_list_json(&[(a.clone(), 0)]),
            recipient_list_json(&[(a.clone(), 1), (a.clone(), 1)]),
            recipient_list_json(&unsorted),
            recipient_list_json(&[(sorted[0].0.clone(), u64::MAX), (sorted[1].0.clone(), 1)]),
        ];
        for value in invalid {
            assert!(parse_fedi_guardian_fee_config(&meta(value)).is_err());
        }

        let seeker = Account::single(*account(9).as_single().unwrap(), AccountType::Seeker);
        assert!(
            parse_fedi_guardian_fee_config(&meta(recipient_list_json(&[(seeker, 1)]))).is_err()
        );
    }

    #[test]
    fn rejects_multisig_guardian_fee_account() {
        let secp = Secp256k1::new();
        let key_a = PublicKey::from_secret_key(
            &secp,
            &SecretKey::from_slice(&[7; 32]).expect("valid secret key"),
        );
        let key_b = PublicKey::from_secret_key(
            &secp,
            &SecretKey::from_slice(&[8; 32]).expect("valid secret key"),
        );
        let account = serde_json::json!({
            "acc_type": AccountType::BtcDepositor,
            "pub_keys": [key_a, key_b],
            "threshold": 2u64,
        });
        let value = serde_json::json!({
            "version": 1,
            "recipients": [{"account": account, "weight": 1}],
        });
        assert!(parse_fedi_guardian_fee_config(&meta(value.to_string())).is_err());
    }

    #[test]
    fn rate_cap_and_partial_config_are_rejected() {
        let value = recipient_list_json(&manifold_4_1_1_recipients(7));
        assert!(
            parse_fedi_guardian_fee_config(&meta_with_ppm(
                value.clone(),
                FEDI_GUARDIAN_FEE_SEND_PPM_MAX,
            ))
            .is_ok()
        );
        assert!(
            parse_fedi_guardian_fee_config(&meta_with_ppm(
                value,
                FEDI_GUARDIAN_FEE_SEND_PPM_MAX + 1,
            ))
            .is_err()
        );
        let partial = BTreeMap::from([(
            FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY.to_string(),
            "250".to_string(),
        )]);
        assert!(parse_fedi_guardian_fee_config(&partial).is_err());
    }

    #[test]
    fn plans_one_exact_atomic_weighted_remittance_and_retains_dust() {
        let entries = manifold_4_1_1_recipients(7);
        let recipients = entries
            .iter()
            .map(|(account, weight)| FediGuardianFeeRecipient {
                account: account.clone(),
                weight: *weight,
            })
            .collect::<Vec<_>>();
        let mint = ModuleKind::from_static_str("mint");
        let wallet = ModuleKind::from_static_str("wallet");
        let minimum = Amount::from_msats(10_000);

        let below_floor = [GuardianFeeRemittanceBreakdownItem {
            module: mint.clone(),
            tx_direction: RpcTransactionDirection::Send,
            amount: Amount::from_msats(119_999),
        }];
        assert!(
            plan_guardian_fee_remittance(&below_floor, &recipients, minimum)
                .unwrap()
                .is_none()
        );

        let breakdown = [
            GuardianFeeRemittanceBreakdownItem {
                module: mint,
                tx_direction: RpcTransactionDirection::Send,
                amount: Amount::from_msats(60_001),
            },
            GuardianFeeRemittanceBreakdownItem {
                module: wallet,
                tx_direction: RpcTransactionDirection::Receive,
                amount: Amount::from_msats(60_004),
            },
        ];
        let plan = plan_guardian_fee_remittance(&breakdown, &recipients, minimum)
            .unwrap()
            .unwrap();
        assert_eq!(plan.amount, Amount::from_msats(120_000));
        assert_eq!(
            checked_amount_sum(plan.snapshot.breakdown.iter().map(|item| item.amount)).unwrap(),
            plan.amount
        );
        assert_eq!(plan.recipients.len(), 9);
        for (recipient, planned) in recipients.iter().zip(&plan.recipients) {
            assert_eq!(planned.account, recipient.account);
            assert_eq!(
                planned.amount,
                Amount::from_msats(10_000 * recipient.weight)
            );
            assert_eq!(
                checked_amount_sum(planned.snapshot.breakdown.iter().map(|item| item.amount))
                    .unwrap(),
                planned.amount
            );
        }
        for source in &plan.snapshot.breakdown {
            let allocated = plan
                .recipients
                .iter()
                .flat_map(|recipient| &recipient.snapshot.breakdown)
                .filter(|item| {
                    item.module == source.module && item.tx_direction == source.tx_direction
                })
                .map(|item| item.amount);
            assert_eq!(checked_amount_sum(allocated).unwrap(), source.amount);
        }
    }

    #[test]
    fn legacy_single_recipient_remits_as_before() {
        let recipient = FediGuardianFeeRecipient {
            account: account(7),
            weight: 1,
        };
        let breakdown = [GuardianFeeRemittanceBreakdownItem {
            module: ModuleKind::from_static_str("mint"),
            tx_direction: RpcTransactionDirection::Send,
            amount: Amount::from_msats(10_005),
        }];

        let plan = plan_guardian_fee_remittance(
            &breakdown,
            std::slice::from_ref(&recipient),
            Amount::from_msats(10_000),
        )
        .unwrap()
        .unwrap();

        assert_eq!(plan.amount, Amount::from_msats(10_005));
        assert_eq!(plan.snapshot.breakdown.len(), 1);
        assert_eq!(plan.snapshot.breakdown[0].amount, breakdown[0].amount);
        assert_eq!(plan.recipients.len(), 1);
        assert_eq!(plan.recipients[0].account, recipient.account);
        assert_eq!(plan.recipients[0].amount, plan.amount);
        assert_eq!(plan.recipients[0].snapshot.breakdown.len(), 1);
        assert_eq!(
            plan.recipients[0].snapshot.breakdown[0].amount,
            plan.snapshot.breakdown[0].amount
        );
    }

    #[tokio::test]
    async fn remittance_db_lifecycle_is_restart_safe_and_idempotent() {
        let db = Database::new(MemDatabase::new(), Default::default());
        let module = ModuleKind::from_static_str("mint");
        let direction = RpcTransactionDirection::Send;
        let total_key = OutstandingFediFeesByStreamKey(FediFeeStream::Guardian);
        let breakdown_key = OutstandingFediFeesByStreamPerTXTypeKey(
            FediFeeStream::Guardian,
            module.clone(),
            direction.clone(),
        );
        let snapshot = GuardianFeeRemittanceSnapshot {
            breakdown: vec![GuardianFeeRemittanceBreakdownItem {
                module,
                tx_direction: direction,
                amount: Amount::from_msats(120_000),
            }],
        };
        let first_operation = OperationId([1; 32]);

        let mut dbtx = db.begin_transaction().await;
        dbtx.insert_entry(&total_key, &Amount::from_msats(120_005))
            .await;
        dbtx.insert_entry(&breakdown_key, &Amount::from_msats(120_005))
            .await;
        reserve_guardian_fee_remittance_dbtx(
            &mut dbtx.to_ref_nc(),
            first_operation,
            Amount::from_msats(120_000),
            &snapshot,
        )
        .await
        .unwrap();
        dbtx.commit_tx().await;

        // Accrual while the operation is in flight adds to the retained dust.
        let mut dbtx = db.begin_transaction().await;
        let accrued = Amount::from_msats(12);
        let total = dbtx.get_value(&total_key).await.unwrap();
        let breakdown_total = dbtx.get_value(&breakdown_key).await.unwrap();
        dbtx.insert_entry(&total_key, &checked_amount_add(total, accrued).unwrap())
            .await;
        dbtx.insert_entry(
            &breakdown_key,
            &checked_amount_add(breakdown_total, accrued).unwrap(),
        )
        .await;
        dbtx.commit_tx().await;

        // A new process can reopen the same database and reconcile the old
        // 0x08 marker without any recipient-specific migration state.
        let reopened = db.clone();
        let mut read = reopened.begin_transaction_nc().await;
        assert_eq!(
            read.get_value(&CurrentGuardianFeeRemittanceOperationKey)
                .await,
            Some(first_operation)
        );
        drop(read);

        let mut dbtx = reopened.begin_transaction().await;
        assert!(
            restore_guardian_fee_remittance_dbtx(
                &mut dbtx.to_ref_nc(),
                first_operation,
                Amount::from_msats(120_000),
                &snapshot,
            )
            .await
            .unwrap()
        );
        dbtx.commit_tx().await;

        let mut dbtx = reopened.begin_transaction().await;
        assert!(
            !restore_guardian_fee_remittance_dbtx(
                &mut dbtx.to_ref_nc(),
                first_operation,
                Amount::from_msats(120_000),
                &snapshot,
            )
            .await
            .unwrap()
        );
        dbtx.commit_tx().await;

        let mut read = reopened.begin_transaction_nc().await;
        assert_eq!(
            read.get_value(&total_key).await,
            Some(Amount::from_msats(120_017))
        );
        assert_eq!(
            read.get_value(&breakdown_key).await,
            Some(Amount::from_msats(120_017))
        );
        drop(read);

        let second_operation = OperationId([2; 32]);
        let mut dbtx = reopened.begin_transaction().await;
        reserve_guardian_fee_remittance_dbtx(
            &mut dbtx.to_ref_nc(),
            second_operation,
            Amount::from_msats(120_000),
            &snapshot,
        )
        .await
        .unwrap();
        dbtx.commit_tx().await;

        let mut dbtx = reopened.begin_transaction().await;
        assert!(
            settle_guardian_fee_remittance_dbtx(
                &mut dbtx.to_ref_nc(),
                second_operation,
                SystemTime::UNIX_EPOCH + Duration::from_secs(1),
            )
            .await
            .unwrap()
        );
        dbtx.commit_tx().await;

        let mut dbtx = reopened.begin_transaction().await;
        assert!(
            !settle_guardian_fee_remittance_dbtx(
                &mut dbtx.to_ref_nc(),
                second_operation,
                SystemTime::UNIX_EPOCH + Duration::from_secs(2),
            )
            .await
            .unwrap()
        );
        assert!(
            !restore_guardian_fee_remittance_dbtx(
                &mut dbtx.to_ref_nc(),
                second_operation,
                Amount::from_msats(120_000),
                &snapshot,
            )
            .await
            .unwrap()
        );
        dbtx.commit_tx().await;

        let mut read = reopened.begin_transaction_nc().await;
        assert_eq!(
            read.get_value(&total_key).await,
            Some(Amount::from_msats(17))
        );
        assert!(
            read.get_value(&CurrentGuardianFeeRemittanceOperationKey)
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn rejection_restore_overflow_keeps_the_marker_and_rolls_back() {
        let db = Database::new(MemDatabase::new(), Default::default());
        let operation_id = OperationId([3; 32]);
        let total_key = OutstandingFediFeesByStreamKey(FediFeeStream::Guardian);
        let breakdown_key = OutstandingFediFeesByStreamPerTXTypeKey(
            FediFeeStream::Guardian,
            ModuleKind::from_static_str("mint"),
            RpcTransactionDirection::Send,
        );
        let snapshot = GuardianFeeRemittanceSnapshot {
            breakdown: vec![GuardianFeeRemittanceBreakdownItem {
                module: ModuleKind::from_static_str("mint"),
                tx_direction: RpcTransactionDirection::Send,
                amount: Amount::from_msats(1),
            }],
        };

        let mut dbtx = db.begin_transaction().await;
        dbtx.insert_entry(&total_key, &Amount::from_msats(u64::MAX - 1))
            .await;
        dbtx.insert_entry(&breakdown_key, &Amount::from_msats(u64::MAX))
            .await;
        dbtx.insert_entry(&CurrentGuardianFeeRemittanceOperationKey, &operation_id)
            .await;
        dbtx.commit_tx().await;

        let mut dbtx = db.begin_transaction().await;
        assert!(
            restore_guardian_fee_remittance_dbtx(
                &mut dbtx.to_ref_nc(),
                operation_id,
                Amount::from_msats(1),
                &snapshot,
            )
            .await
            .is_err()
        );
        drop(dbtx);

        let mut read = db.begin_transaction_nc().await;
        assert_eq!(
            read.get_value(&total_key).await,
            Some(Amount::from_msats(u64::MAX - 1))
        );
        assert_eq!(
            read.get_value(&CurrentGuardianFeeRemittanceOperationKey)
                .await,
            Some(operation_id)
        );
    }

    #[test]
    fn deposit_outcomes_restore_only_rejected_transactions() {
        assert_eq!(
            guardian_fee_deposit_action(&StabilityPoolDepositOperationState::TxRejected(
                "rejected".to_string()
            )),
            GuardianFeeDepositAction::Restore
        );
        assert_eq!(
            guardian_fee_deposit_action(&StabilityPoolDepositOperationState::PrimaryOutputError(
                "change".to_string()
            )),
            GuardianFeeDepositAction::Settle
        );
        assert_eq!(
            guardian_fee_deposit_action(&StabilityPoolDepositOperationState::Success),
            GuardianFeeDepositAction::Settle
        );
        assert_eq!(
            guardian_fee_deposit_action(&StabilityPoolDepositOperationState::TxAccepted),
            GuardianFeeDepositAction::Wait
        );
    }
}
