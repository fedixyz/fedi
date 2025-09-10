use std::time::Duration;

use fedimint_api_client::api::DynModuleApi;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::util::update_merge::UpdateMerge;
use fedimint_core::util::{backoff_util, retry};
use futures::Stream;
use stability_pool_common::AccountId;
use stability_pool_common::config::StabilityPoolClientConfig;
use tokio::sync::watch;
use tokio_stream::wrappers::WatchStream;

use crate::api::StabilityPoolApiExt;
use crate::db::{CachedSyncResponseKey, CachedSyncResponseValue, SeekLifetimeFeeKey};

/// Service that syncs account state from server in the background
#[derive(Debug)]
pub struct StabilityPoolSyncService {
    sync_response: watch::Sender<Option<CachedSyncResponseValue>>,
    module_api: DynModuleApi,
    db: Database,
    account_id: AccountId,
    update_merge: UpdateMerge,
}

impl StabilityPoolSyncService {
    pub async fn new(module_api: DynModuleApi, db: Database, account_id: AccountId) -> Self {
        // Fetch initial sync response from database
        let mut dbtx = db.begin_transaction().await;
        let maybe_sync_response = dbtx.get_value(&CachedSyncResponseKey { account_id }).await;
        drop(dbtx);

        // Create service with initial state
        Self {
            sync_response: watch::channel(maybe_sync_response).0,
            module_api,
            db,
            account_id,
            update_merge: Default::default(),
        }
    }

    /// Update sync data in background.
    ///
    /// Caller should run this method in a task.
    pub async fn update_continuously(&self, client_config: &StabilityPoolClientConfig) -> ! {
        let mut first = true;
        loop {
            let last_sync_time = self
                .sync_response
                .borrow()
                .as_ref()
                .map(|x| x.value.current_cycle.start_time);
            if let Some(last_sync_time) = last_sync_time {
                let sleep_time = client_config
                    .next_cycle_start_time(last_sync_time)
                    .duration_since(fedimint_core::time::now())
                    .map(|x| x + Duration::from_secs(5)) // give server some time
                    .unwrap_or(if first {
                        Duration::ZERO
                    } else {
                        // don't keep spamming
                        Duration::from_secs(2)
                    });
                fedimint_core::task::sleep(sleep_time).await;
            }
            retry("sp sync", backoff_util::background_backoff(), || {
                self.update_once()
            })
            .await
            .expect("inifinite retries");
            first = false;
        }
    }

    pub async fn update_once(&self) -> anyhow::Result<()> {
        self.update_merge
            .merge(async {
                let sync_response = self.module_api.account_sync(self.account_id).await?;
                let cached_sync_response = CachedSyncResponseValue {
                    fetch_time: fedimint_core::time::now(),
                    value: sync_response,
                };

                let mut dbtx = self.db.begin_transaction().await;
                dbtx.insert_entry(
                    &CachedSyncResponseKey {
                        account_id: self.account_id,
                    },
                    &cached_sync_response,
                )
                .await;

                if let Some(locked_seeks_lifetime_fee) = cached_sync_response
                    .value
                    .locked_seeks_lifetime_fee
                    .as_ref()
                {
                    for (txid, amount) in locked_seeks_lifetime_fee {
                        dbtx.insert_entry(&SeekLifetimeFeeKey(*txid), amount).await;
                    }
                }
                dbtx.commit_tx().await;

                // Send the new SyncResponse to all watchers
                self.sync_response.send_replace(Some(cached_sync_response));
                Ok(())
            })
            .await
    }

    /// Subscribe to sync data updates
    pub fn subscribe_to_updates(
        &self,
    ) -> impl Stream<Item = Option<CachedSyncResponseValue>> + use<> {
        WatchStream::new(self.sync_response.subscribe())
    }
}
