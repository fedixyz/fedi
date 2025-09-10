use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::Result;
use device_registration::DeviceRegistrationService;
use fedimint_client::Client;
use fedimint_client::backup::Metadata;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::util::backoff_util::{FibonacciBackoff, custom_backoff};
use fedimint_core::util::retry;
use fedimint_core::util::update_merge::UpdateMerge;
use rpc_types::FediBackupMetadata;
use runtime::constants::BACKUP_FREQUENCY;
use tracing::{error, info, instrument};

use super::db::LastBackupTimestampKey;

pub struct BackupService {
    update_merge: UpdateMerge,
    device_registration_service: Arc<DeviceRegistrationService>,
}

impl BackupService {
    pub fn new(device_registration_service: Arc<DeviceRegistrationService>) -> Self {
        Self {
            update_merge: UpdateMerge::default(),
            device_registration_service,
        }
    }

    pub async fn last_backup_timestamp(dbtx: &mut DatabaseTransaction<'_>) -> Option<SystemTime> {
        dbtx.get_value(&LastBackupTimestampKey).await
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
                info!(?sleep_duration, "waiting for peroidic backup");
                fedimint_core::task::sleep(sleep_duration).await;
            }

            // Wait for device registration to be recently renewed before backing up
            self.device_registration_service
                .wait_for_recently_renewed()
                .await;

            self.backup(
                client,
                custom_backoff(Duration::from_secs(1), Duration::from_secs(20 * 60), None),
            )
            .await
            .expect("must not fail with usize::MAX retries");
        }
    }
}
