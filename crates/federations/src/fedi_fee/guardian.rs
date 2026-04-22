use std::time::{Duration, SystemTime};

use anyhow::ensure;
use fedimint_core::Amount;
use fedimint_core::core::OperationId;
use fedimint_core::db::{AutocommitResultExt, IDatabaseTransactionOpsCoreTyped};
use futures::StreamExt;
use rand::Rng;
use rpc_types::{
    GuardianFeeRemittanceBreakdownItem, GuardianFeeRemittanceSnapshot, SPv2DepositMetadata,
};
use runtime::storage::state::FediGuardianFeeConfig;
use stability_pool_client::common::{Account, AccountType, BtcBalanceDepositMetadata};
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

pub fn parse_fedi_guardian_fee_config(
    meta: &std::collections::BTreeMap<String, String>,
) -> anyhow::Result<Option<FediGuardianFeeConfig>> {
    let guardian_fee_send_ppm = meta.get(FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY);
    let remittance_account = meta.get(FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY);

    let (Some(guardian_fee_send_ppm), Some(remittance_account)) =
        (guardian_fee_send_ppm, remittance_account)
    else {
        ensure!(
            guardian_fee_send_ppm.is_none() && remittance_account.is_none(),
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
    let remittance_account = serde_json::from_str::<Account>(remittance_account)?;
    ensure!(
        remittance_account.acc_type() == AccountType::BtcDepositor,
        "guardian fee remittance account must be a btc-balance account",
    );
    ensure!(
        remittance_account.as_single().is_some(),
        "guardian fee remittance account must be single-sig",
    );

    Ok(Some(FediGuardianFeeConfig {
        send_ppm,
        remittance_account,
    }))
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
        let remittance_account = guardian_fee_config.remittance_account.clone();
        if let Err(error) = spv2
            .ensure_btc_balance_deposit_supported(remittance_account.id())
            .await
        {
            error!(
                ?error,
                "Guardian fee remittance account is not currently deposit-capable"
            );
            return;
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
                    let remittance_account = remittance_account.clone();
                    Box::pin(async move {
                        let (remittance_amount, snapshot) = {
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

                            let remittance_amount = breakdown
                                .iter()
                                .fold(Amount::ZERO, |acc, item| acc + item.amount);
                            // The stream-wide outstanding total and its
                            // per-(module, direction) breakdown should
                            // describe the same funds before we snapshot them
                            // into operation metadata.
                            anyhow::ensure!(
                                remittance_amount == outstanding_fees,
                                "guardian outstanding total mismatch: total={} breakdown={}",
                                outstanding_fees.msats,
                                remittance_amount.msats,
                            );
                            if remittance_amount < spv2.cfg.min_allowed_seek {
                                return Ok(SubmissionResult::Noop);
                            }

                            (
                                remittance_amount,
                                GuardianFeeRemittanceSnapshot { breakdown },
                            )
                        };

                        // Encrypt the recipient-facing accounting payload
                        // before the deposit operation is started so the
                        // snapshot and the operation meta stay in lockstep.
                        let encrypted_metadata = Self::encrypt_guardian_fee_remittance_metadata(
                            &remittance_account,
                            remittance_amount,
                            &snapshot,
                        )?;
                        let operation_id = OperationId::new_random();
                        {
                            let mut spv2_dbtx =
                                dbtx.to_ref_with_prefix_module_id(spv2_instance_id).0;
                            spv2.deposit_to_btc_balance_dbtx(
                                &mut spv2_dbtx,
                                operation_id,
                                remittance_account.id(),
                                remittance_amount,
                                BtcBalanceDepositMetadata(encrypted_metadata),
                                SPv2DepositMetadata::GuardianFeeRemittance {
                                    snapshot: snapshot.clone(),
                                },
                            )
                            .await?;
                        }

                        let mut fee_dbtx = dbtx
                            .to_ref_nc()
                            .with_prefix(vec![BridgeDbPrefix::FediFeePrefix as u8]);
                        // Reserve the snapshotted guardian fees atomically
                        // with operation creation so the virtual balance does
                        // not double-count an in-flight remittance. On failure
                        // we restore these exact amounts from operation
                        // metadata.
                        fee_dbtx
                            .insert_entry(
                                &OutstandingFediFeesByStreamKey(FediFeeStream::Guardian),
                                &(Amount::ZERO),
                            )
                            .await;
                        for item in &snapshot.breakdown {
                            fee_dbtx
                                .insert_entry(
                                    &OutstandingFediFeesByStreamPerTXTypeKey(
                                        FediFeeStream::Guardian,
                                        item.module.clone(),
                                        item.tx_direction.clone(),
                                    ),
                                    &Amount::ZERO,
                                )
                                .await;
                        }
                        fee_dbtx
                            .insert_entry(&CurrentGuardianFeeRemittanceOperationKey, &operation_id)
                            .await;

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
            let _ = self
                .handle_guardian_fee_remittance_failure(fed, operation_id)
                .await;
            return;
        };

        let mut updates = update_stream.into_stream();
        while let Some(state) = updates.next().await {
            fed.update_operation_state(operation_id, state.clone())
                .await;
            match state {
                StabilityPoolDepositOperationState::TxRejected(_)
                | StabilityPoolDepositOperationState::PrimaryOutputError(_) => {
                    let _ = self
                        .handle_guardian_fee_remittance_failure(fed, operation_id)
                        .await;
                    return;
                }
                StabilityPoolDepositOperationState::Success => {
                    fed.spv2_force_sync();
                    let _ = self
                        .handle_guardian_fee_remittance_success(fed, operation_id)
                        .await;
                    return;
                }
                _ => {}
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
                        if dbtx
                            .get_value(&CurrentGuardianFeeRemittanceOperationKey)
                            .await
                            != Some(operation_id)
                        {
                            return Ok::<(), anyhow::Error>(());
                        }

                        dbtx.insert_entry(
                            &NextFediFeeRemittanceDueAtByStreamKey(FediFeeStream::Guardian),
                            &Self::next_guardian_remittance_due_at(fed),
                        )
                        .await;
                        dbtx.remove_entry(&CurrentGuardianFeeRemittanceOperationKey)
                            .await;
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
                        if dbtx
                            .get_value(&CurrentGuardianFeeRemittanceOperationKey)
                            .await
                            != Some(operation_id)
                        {
                            return Ok::<(), anyhow::Error>(());
                        }

                        let outstanding_key =
                            OutstandingFediFeesByStreamKey(FediFeeStream::Guardian);
                        let current_outstanding = dbtx
                            .get_value(&outstanding_key)
                            .await
                            .unwrap_or(Amount::ZERO);
                        dbtx.insert_entry(&outstanding_key, &(current_outstanding + amount))
                            .await;

                        for item in &snapshot.breakdown {
                            let outstanding_tx_type_key = OutstandingFediFeesByStreamPerTXTypeKey(
                                FediFeeStream::Guardian,
                                item.module.clone(),
                                item.tx_direction.clone(),
                            );
                            let current_outstanding_tx_type = dbtx
                                .get_value(&outstanding_tx_type_key)
                                .await
                                .unwrap_or(Amount::ZERO);
                            dbtx.insert_entry(
                                &outstanding_tx_type_key,
                                &(current_outstanding_tx_type + item.amount),
                            )
                            .await;
                        }

                        dbtx.remove_entry(&CurrentGuardianFeeRemittanceOperationKey)
                            .await;
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
    use std::collections::BTreeMap;

    use bitcoin::secp256k1::{PublicKey, Secp256k1, SecretKey};

    use super::*;

    fn btc_depositor_account() -> Account {
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_slice(&[7; 32]).expect("valid secret key");
        let public_key = PublicKey::from_secret_key(&secp, &secret_key);
        Account::single(public_key, AccountType::BtcDepositor)
    }

    #[test]
    fn parses_guardian_fee_config_from_meta() {
        let account = btc_depositor_account();
        let meta = BTreeMap::from([
            (
                FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY.to_string(),
                "250".to_string(),
            ),
            (
                FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY.to_string(),
                serde_json::to_string(&account).expect("account should serialize"),
            ),
        ]);

        let config = parse_fedi_guardian_fee_config(&meta)
            .expect("config should parse")
            .expect("config should be present");

        assert_eq!(config.send_ppm, 250);
        assert_eq!(config.remittance_account, account);
    }

    #[test]
    fn rejects_partial_guardian_fee_config() {
        let meta = BTreeMap::from([(
            FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY.to_string(),
            "250".to_string(),
        )]);

        assert!(parse_fedi_guardian_fee_config(&meta).is_err());
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
        let meta = BTreeMap::from([
            (
                FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY.to_string(),
                "250".to_string(),
            ),
            (
                FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY.to_string(),
                account.to_string(),
            ),
        ]);

        assert!(parse_fedi_guardian_fee_config(&meta).is_err());
    }

    #[test]
    fn rejects_guardian_fee_send_ppm_above_cap() {
        let account = btc_depositor_account();
        let meta = BTreeMap::from([
            (
                FEDI_GUARDIAN_FEE_SEND_PPM_META_KEY.to_string(),
                (FEDI_GUARDIAN_FEE_SEND_PPM_MAX + 1).to_string(),
            ),
            (
                FEDI_GUARDIAN_FEE_REMITTANCE_ACCOUNT_META_KEY.to_string(),
                serde_json::to_string(&account).expect("account should serialize"),
            ),
        ]);

        assert!(parse_fedi_guardian_fee_config(&meta).is_err());
    }
}
