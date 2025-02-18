use std::time::{Duration, SystemTime};

use anyhow::Result;
use fedimint_client::backup::Metadata;
use fedimint_client::Client;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::util::backoff_util::{custom_backoff, FibonacciBackoff};
use fedimint_core::util::retry;
use fedimint_core::util::update_merge::UpdateMerge;
use futures::lock::Mutex;
use serde::Serialize;
use tracing::{error, info, instrument};
use ts_rs::TS;

use super::db::LastBackupTimestampKey;
use crate::constants::BACKUP_FREQUENCY;
use crate::types::FediBackupMetadata;
use crate::utils::to_unix_time;

#[derive(Default)]
pub struct BackupService {
    state: Mutex<BackupServiceState>,
    update_merge: UpdateMerge,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupServiceStatus {
    #[ts(type = "number | null")]
    last_backup_timestamp: Option<u64>,
    state: BackupServiceState,
}

#[derive(Clone, Debug, Serialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum BackupServiceState {
    #[default]
    Initializing,
    Waiting {
        #[ts(type = "number | null")]
        next_backup_timestamp: Option<u64>,
    },
    Running,
}

impl BackupService {
    pub async fn last_backup_timestamp(dbtx: &mut DatabaseTransaction<'_>) -> Option<SystemTime> {
        dbtx.get_value(&LastBackupTimestampKey).await
    }

    // FIXME: change this to observable when have it on master.
    pub async fn status(&self, client: &Client) -> BackupServiceStatus {
        let state = self.state.lock().await.clone();
        let last_backup_timestamp =
            Self::last_backup_timestamp(&mut client.db().begin_transaction_nc().await)
                .await
                .and_then(|x| to_unix_time(x).ok());
        BackupServiceStatus {
            state,
            last_backup_timestamp,
        }
    }

    #[instrument(err, ret, skip_all)]
    pub async fn backup(&self, client: &Client, backoff: FibonacciBackoff) -> Result<()> {
        self.update_merge
            .merge(retry("fedimint_backup", backoff, || {
                self.backup_inner(client)
            }))
            .await
    }

    async fn backup_inner(&self, client: &Client) -> Result<()> {
        let backup = FediBackupMetadata::new();
        client
            .backup_to_federation(Metadata::from_json_serialized(backup))
            .await?;
        let mut dbtx = client.db().begin_transaction().await;
        dbtx.insert_entry(&LastBackupTimestampKey, &fedimint_core::time::now())
            .await;
        if let Err(error) = dbtx.commit_tx_result().await {
            error!(%error, "conflict in saving last backup timestamp");
        }
        Ok(())
    }

    pub async fn run_continuously(&self, client: &Client) -> ! {
        loop {
            let sleep_duration =
                Self::last_backup_timestamp(&mut client.db().begin_transaction_nc().await)
                    .await
                    .and_then(|last| {
                        // don't sleep if last + backup_frequency < now
                        (last + BACKUP_FREQUENCY)
                            .duration_since(fedimint_core::time::now())
                            .ok()
                    });
            if let Some(sleep_duration) = sleep_duration {
                *self.state.lock().await = BackupServiceState::Waiting {
                    next_backup_timestamp: to_unix_time(
                        fedimint_core::time::now() + sleep_duration,
                    )
                    .ok(),
                };
                info!(?sleep_duration, "waiting for peroidic backup");
                fedimint_core::task::sleep(sleep_duration).await;
            }

            *self.state.lock().await = BackupServiceState::Running;
            self.backup(
                client,
                custom_backoff(Duration::from_secs(1), Duration::from_secs(20 * 60), None),
            )
            .await
            .expect("must not fail with usize::MAX retries");
        }
    }
}
