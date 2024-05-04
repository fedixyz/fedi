use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::Result;
use fedimint_client::backup::Metadata;
use fedimint_client::ClientHandleArc;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::task::{TaskGroup, TaskHandle};
use futures::lock::Mutex;
use futures::FutureExt;
use rand::Rng;
use serde::Serialize;
use tokio::sync::watch;
use tracing::{error, info};
use ts_rs::TS;

use super::super::constants::BACKUP_FREQUENCY;
use super::super::types::FediBackupMetadata;
use super::db::{LastBackupTimestampKey, XmppUsernameKey};
use crate::utils::to_unix_time;

#[derive(Clone)]
pub struct BackupService {
    shared: Arc<BackupServiceShared>,
}

pub struct BackupServiceShared {
    client: ClientHandleArc,
    backup_trigger: watch::Sender<()>,
    state: Mutex<BackupServiceState>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct BackupServiceStatus {
    #[ts(type = "number | null")]
    last_backup_timestamp: Option<u64>,
    state: BackupServiceState,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum BackupServiceState {
    Waiting {
        #[ts(type = "number")]
        failed_count: u64,
        #[ts(type = "number | null")]
        next_backup_timestamp: Option<u64>,
    },
    Running,
}

impl BackupService {
    pub async fn new(client: ClientHandleArc, tg: &mut TaskGroup) -> Self {
        let shared = Arc::new(BackupServiceShared {
            client,
            backup_trigger: watch::Sender::new(()),
            state: Mutex::new(BackupServiceState::Waiting {
                failed_count: 0,
                next_backup_timestamp: None,
            }),
        });
        let shared2 = shared.clone();
        tg.spawn("backup_service", move |handle| {
            Self::run_inner(handle, shared2)
        });
        Self { shared }
    }

    pub async fn trigger_manual_backup(&self) {
        self.shared.backup_trigger.send_modify(|_| ());
    }

    pub async fn last_backup_timestamp(dbtx: &mut DatabaseTransaction<'_>) -> Option<SystemTime> {
        dbtx.get_value(&LastBackupTimestampKey).await
    }

    // FIXME: change this to observable when have it on master.
    pub async fn status(&self) -> BackupServiceStatus {
        let state = self.shared.state.lock().await.clone();
        let last_backup_timestamp =
            Self::last_backup_timestamp(&mut self.shared.client.db().begin_transaction_nc().await)
                .await
                .and_then(|x| to_unix_time(x).ok());
        BackupServiceStatus {
            state,
            last_backup_timestamp,
        }
    }

    async fn backup(client: &ClientHandleArc) -> Result<()> {
        let username = client
            .db()
            .begin_transaction_nc()
            .await
            .get_value(&XmppUsernameKey)
            .await;
        let backup = FediBackupMetadata::new(username);
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

    async fn run_inner(handle: TaskHandle, shared: Arc<BackupServiceShared>) {
        let mut shutdown = handle.make_shutdown_rx().await.fuse();
        let mut sleep_duration =
            Self::last_backup_timestamp(&mut shared.client.db().begin_transaction_nc().await)
                .await
                .and_then(|last| {
                    // don't sleep if last + backup_frequency < now
                    (last + BACKUP_FREQUENCY)
                        .duration_since(fedimint_core::time::now())
                        .ok()
                });
        let mut failed_count: u64 = 0;
        let mut trigger_recv = shared.backup_trigger.subscribe();

        loop {
            let backup_after_sleep = {
                let shared = shared.clone();
                let failed_count = failed_count;
                async move {
                    if let Some(sleep_duration) = sleep_duration {
                        *shared.state.lock().await = BackupServiceState::Waiting {
                            failed_count,
                            next_backup_timestamp: to_unix_time(
                                fedimint_core::time::now() + sleep_duration,
                            )
                            .ok(),
                        };
                        fedimint_core::task::sleep(sleep_duration).await;
                    }
                    *shared.state.lock().await = BackupServiceState::Running;
                    Self::backup(&shared.client).await
                }
            };
            sleep_duration = tokio::select! {
                biased;
                _ = &mut shutdown => {
                    info!("backup_service shuting down");
                    break;
                }
                _ = trigger_recv.changed() => {
                    info!("manually triggered backup");
                    // cancel current backup and trigger next immediately
                    None
                }
                result = backup_after_sleep => {
                    if let Err(error) = result {
                        error!(%failed_count, %error, "backup failed");
                        failed_count += 1;
                        let time = 1 << failed_count.min(9);
                        // max = 17.1 minutes
                        let time = rand::thread_rng().gen_range(time..(2 * time));
                        Some(Duration::from_secs(time))
                    } else {
                        info!("backup completed");
                        failed_count = 0;
                        Some(BACKUP_FREQUENCY)
                    }
                }
            };
        }
    }
}
