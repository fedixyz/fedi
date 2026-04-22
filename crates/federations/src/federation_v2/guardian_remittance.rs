use std::collections::BTreeMap;

use anyhow::Context;
use bitcoin::secp256k1::Keypair;
use fedimint_core::Amount;
use futures::{Stream, StreamExt};
use rpc_types::{
    RpcAmount, RpcGuardianRemittanceAccountInfo, RpcGuardianRemittanceDashboard,
    RpcGuardianRemittanceDayBucket, RpcGuardianRemittanceModuleTotal,
};
use stability_pool_client::common::AccountType;
use stability_pool_client::db::{UserOperationHistoryItem, UserOperationHistoryItemKind};
use stability_pool_client::{StabilityPoolHistoryService, StabilityPoolSyncService};
use time::OffsetDateTime;
use tracing::error;

use super::FederationV2;
use super::client::ClientExt;
use crate::fedi_fee::guardian_metadata::decrypt_guardian_remittance_metadata;

pub struct GuardianRemittanceAccount {
    sync_service: StabilityPoolSyncService,
    history_service: StabilityPoolHistoryService,
}

impl GuardianRemittanceAccount {
    pub async fn new(fed: &FederationV2) -> anyhow::Result<Self> {
        let spv2 = fed.client.spv2()?;
        let account_id = spv2.our_account(AccountType::BtcDepositor).id();
        let account = Self {
            sync_service: StabilityPoolSyncService::new(
                spv2.api.clone(),
                spv2.db.clone(),
                account_id,
            )
            .await,
            history_service: StabilityPoolHistoryService::new(
                spv2.client_ctx.clone(),
                spv2.api.clone(),
                account_id,
            ),
        };
        fed.spawn_cancellable("guardian_remittance_sync", |fed| async move {
            let Some(account) = fed.guardian_remittance_account.get() else {
                error!("guardian remittance account missing during sync task");
                return;
            };
            let config = &fed.client.spv2().expect("subsystem init checked").cfg;
            account.sync_service.update_continuously(config).await;
        });
        fed.spawn_cancellable("guardian_remittance_history", |fed| async move {
            let Some(account) = fed.guardian_remittance_account.get() else {
                error!("guardian remittance account missing during history task");
                return;
            };
            account
                .history_service
                .update_continuously(&account.sync_service)
                .await;
        });
        Ok(account)
    }

    pub fn account_info(
        &self,
        fed: &FederationV2,
    ) -> anyhow::Result<RpcGuardianRemittanceAccountInfo> {
        let spv2 = fed.client.spv2()?;
        let account = spv2.our_account(AccountType::BtcDepositor);
        Ok(RpcGuardianRemittanceAccountInfo {
            serialized_account: serde_json::to_string(&account)?,
        })
    }

    pub async fn update_once(&self) -> anyhow::Result<()> {
        self.sync_service.update_once().await
    }

    pub fn subscribe_dashboard(
        &self,
        fed: &FederationV2,
    ) -> anyhow::Result<impl Stream<Item = RpcGuardianRemittanceDashboard> + use<>> {
        let spv2 = fed.client.spv2()?;
        let guardian_key = spv2.our_keypair(AccountType::BtcDepositor);
        Ok(self
            .history_service
            .subscribe_to_user_operation_updates()
            .map(move |history| dashboard_from_history(history, &guardian_key)))
    }

    pub fn subscribe_balance(&self) -> impl Stream<Item = RpcAmount> + use<> {
        self.sync_service.subscribe_to_updates().map(|sync| {
            let total = sync
                .map(|sync| {
                    sync.value.idle_balance + sync.value.staged_balance + sync.value.locked_balance
                })
                .unwrap_or(Amount::ZERO);
            RpcAmount(total)
        })
    }
}

fn dashboard_from_history(
    history: Vec<UserOperationHistoryItem>,
    guardian_key: &Keypair,
) -> RpcGuardianRemittanceDashboard {
    RpcGuardianRemittanceDashboard {
        day_buckets: aggregate_day_buckets(raw_entries_from_history(history, guardian_key)),
    }
}

fn raw_entries_from_history(
    history: Vec<UserOperationHistoryItem>,
    guardian_key: &Keypair,
) -> Vec<GuardianRemittanceEntry> {
    history
        .into_iter()
        .filter_map(|item| {
            let metadata = match item.kind {
                UserOperationHistoryItemKind::BtcBalanceDeposit { metadata } => metadata,
                _ => return None,
            };

            let metadata = match decrypt_guardian_remittance_metadata(guardian_key, &metadata) {
                Ok(metadata) => metadata,
                Err(error) => {
                    error!(
                        %item.txid,
                        %error,
                        "failed to decrypt guardian remittance metadata"
                    );
                    return None;
                }
            };

            let total_amount = Amount::from_msats(metadata.total_msats);
            if total_amount != item.amount {
                error!(
                    %item.txid,
                    metadata_total_msats = metadata.total_msats,
                    amount_msats = item.amount.msats,
                    "guardian remittance metadata amount mismatch"
                );
                return None;
            }

            let module_totals = metadata.breakdown.into_iter().fold(
                BTreeMap::<String, Amount>::new(),
                |mut acc, part| {
                    *acc.entry(part.module).or_default() += Amount::from_msats(part.amount_msats);
                    acc
                },
            );

            Some(GuardianRemittanceEntry {
                remitted_at_unix: metadata.remitted_at_unix,
                total_amount,
                module_totals,
            })
        })
        .collect()
}

#[derive(Debug, Clone)]
struct GuardianRemittanceEntry {
    remitted_at_unix: u64,
    total_amount: Amount,
    module_totals: BTreeMap<String, Amount>,
}

fn aggregate_day_buckets(
    entries: Vec<GuardianRemittanceEntry>,
) -> Vec<RpcGuardianRemittanceDayBucket> {
    let mut buckets = BTreeMap::<String, RpcGuardianRemittanceDayBucket>::new();

    for entry in entries {
        let day_key = match utc_day_key(entry.remitted_at_unix) {
            Ok(day_key) => day_key,
            Err(error) => {
                error!(
                    remitted_at_unix = entry.remitted_at_unix,
                    %error,
                    "guardian remittance timestamp invalid"
                );
                continue;
            }
        };
        let bucket =
            buckets
                .entry(day_key.clone())
                .or_insert_with(|| RpcGuardianRemittanceDayBucket {
                    day_key,
                    total_amount_remitted: RpcAmount(Amount::ZERO),
                    remittance_count: 0,
                    module_totals: Vec::new(),
                });
        bucket.total_amount_remitted.0 += entry.total_amount;
        bucket.remittance_count += 1;

        let mut module_totals = bucket
            .module_totals
            .iter()
            .map(|item| (item.module.clone(), item.total_amount.0))
            .collect::<BTreeMap<_, _>>();
        for (module, total_amount) in entry.module_totals {
            *module_totals.entry(module).or_default() += total_amount;
        }
        bucket.module_totals = module_totals
            .into_iter()
            .map(|(module, total_amount)| RpcGuardianRemittanceModuleTotal {
                module,
                total_amount: RpcAmount(total_amount),
            })
            .collect();
    }

    buckets.into_values().rev().collect()
}

fn utc_day_key(unix_seconds: u64) -> anyhow::Result<String> {
    let dt = OffsetDateTime::from_unix_timestamp(
        i64::try_from(unix_seconds).context("guardian remittance timestamp overflow")?,
    )?;
    let date = dt.date();
    Ok(format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        u8::from(date.month()),
        date.day()
    ))
}

#[cfg(test)]
mod tests {
    use bitcoin::secp256k1;
    use bitcoin::secp256k1::ecdh::SharedSecret;
    use fedimint_aead::LessSafeKey;
    use fedimint_core::core::ModuleKind;
    use fedimint_derive_secret::{ChildId, DerivableSecret};
    use rpc_types::RpcTransactionDirection;

    use super::*;
    use crate::fedi_fee::guardian_metadata::{
        GuardianFeeBreakdownItemV1, GuardianFeeRemittanceCiphertextV1,
        GuardianFeeRemittanceMetadataV1,
    };

    const TEST_CHILD_ID: ChildId = ChildId(0);

    #[test]
    fn decrypts_guardian_remittance_metadata() {
        let guardian_key = DerivableSecret::new_root(&[3; 32], b"guardian-test-root")
            .child_key(TEST_CHILD_ID)
            .to_secp_key(secp256k1::SECP256K1);
        let plaintext = GuardianFeeRemittanceMetadataV1 {
            version: 1,
            total_msats: 123_000,
            breakdown: vec![GuardianFeeBreakdownItemV1 {
                module: ModuleKind::from_static_str("mint").to_string(),
                direction: RpcTransactionDirection::Receive,
                amount_msats: 123_000,
            }],
            remitted_at_unix: 1_700_000_000,
        };

        let (ephemeral_secret, ephemeral_pubkey) =
            secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
        let shared_secret = SharedSecret::new(&guardian_key.public_key(), &ephemeral_secret);
        let shared_secret = DerivableSecret::new_root(
            &shared_secret.secret_bytes(),
            b"guardian-fee-remittance-ecdh",
        );
        let ciphertext = fedimint_aead::encrypt(
            serde_json::to_vec(&plaintext).expect("plaintext serializes"),
            &LessSafeKey::new(shared_secret.to_chacha20_poly1305_key()),
        )
        .expect("encrypts");
        let envelope = GuardianFeeRemittanceCiphertextV1 {
            version: 1,
            ephemeral_pubkey,
            ciphertext_hex: hex::encode(ciphertext),
        };

        let decrypted = decrypt_guardian_remittance_metadata(
            &guardian_key,
            &serde_json::to_vec(&envelope).expect("envelope serializes"),
        )
        .expect("metadata decrypts");

        assert_eq!(decrypted.total_msats, plaintext.total_msats);
        assert_eq!(decrypted.remitted_at_unix, plaintext.remitted_at_unix);
        assert_eq!(decrypted.breakdown.len(), 1);
        assert_eq!(decrypted.breakdown[0].module, "mint");
    }

    #[test]
    fn aggregates_remittances_by_day_descending() {
        let buckets = aggregate_day_buckets(vec![
            GuardianRemittanceEntry {
                remitted_at_unix: 1_700_086_400,
                total_amount: Amount::from_sats(5),
                module_totals: BTreeMap::from([
                    ("mint".to_string(), Amount::from_sats(2)),
                    ("wallet".to_string(), Amount::from_sats(3)),
                ]),
            },
            GuardianRemittanceEntry {
                remitted_at_unix: 1_700_080_000,
                total_amount: Amount::from_sats(7),
                module_totals: BTreeMap::from([("mint".to_string(), Amount::from_sats(7))]),
            },
            GuardianRemittanceEntry {
                remitted_at_unix: 1_699_999_999,
                total_amount: Amount::from_sats(11),
                module_totals: BTreeMap::from([("lightning".to_string(), Amount::from_sats(11))]),
            },
        ]);

        assert_eq!(buckets.len(), 2);
        assert_eq!(buckets[0].day_key, "2023-11-15");
        assert_eq!(
            buckets[0].total_amount_remitted,
            RpcAmount(Amount::from_sats(12))
        );
        assert_eq!(buckets[0].remittance_count, 2);
        assert_eq!(
            buckets[0].module_totals,
            vec![
                RpcGuardianRemittanceModuleTotal {
                    module: "mint".to_string(),
                    total_amount: RpcAmount(Amount::from_sats(9)),
                },
                RpcGuardianRemittanceModuleTotal {
                    module: "wallet".to_string(),
                    total_amount: RpcAmount(Amount::from_sats(3)),
                },
            ]
        );
        assert_eq!(buckets[1].day_key, "2023-11-14");
        assert_eq!(
            buckets[1].total_amount_remitted,
            RpcAmount(Amount::from_sats(11))
        );
    }
}
