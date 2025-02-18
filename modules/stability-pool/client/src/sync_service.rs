use std::sync::Arc;
use std::time::Duration;

use fedimint_api_client::api::{DynModuleApi, FederationApiExt as _};
use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::module::ApiRequestErased;
use fedimint_core::util::{backoff_util, retry};
use futures::Stream;
use stability_pool_common::config::StabilityPoolClientConfig;
use stability_pool_common::{AccountId, SyncResponse};
use tokio::sync::watch;
use tokio_stream::wrappers::WatchStream;

use crate::db::{CacheSyncResponseValue, CachedSyncResponseKey};

/// Service that syncs account state from server in the background
#[derive(Debug)]
pub struct StabilityPoolSyncService {
    sync_response: watch::Sender<Option<SyncResponse>>,
    module_api: DynModuleApi,
    db: Database,
    account_id: AccountId,
}

impl StabilityPoolSyncService {
    pub async fn new(
        module_api: DynModuleApi,
        db: Database,
        account_id: AccountId,
    ) -> anyhow::Result<Arc<Self>> {
        // Fetch initial sync response from database
        let mut dbtx = db.begin_transaction().await;
        let maybe_sync_response = dbtx.get_value(&CachedSyncResponseKey { account_id }).await;
        let initial_sync = maybe_sync_response.map(|stored| stored.value);
        drop(dbtx);

        // Create service with initial state
        Ok(Arc::new(Self {
            sync_response: watch::channel(initial_sync).0,
            module_api,
            db,
            account_id,
        }))
    }

    /// Update sync data in background.
    ///
    /// Caller should run this method in a task.
    pub async fn update_continuously(&self, client_config: &StabilityPoolClientConfig) -> ! {
        loop {
            if let Some(last_sync) = &*self.sync_response.borrow() {
                let sleep_time = client_config
                    .next_cycle_start_time(last_sync.current_cycle.start_time)
                    .duration_since(fedimint_core::time::now())
                    .map(|x| x + Duration::from_secs(5)) // give server some time
                    .unwrap_or(Duration::ZERO);
                fedimint_core::task::sleep(sleep_time).await;
            }
            retry("sp sync", backoff_util::background_backoff(), || {
                self.update_once()
            })
            .await
            .expect("inifinite retries");
        }
    }

    pub async fn update_once(&self) -> anyhow::Result<()> {
        let sync_response: SyncResponse = self
            .module_api
            .request_current_consensus("sync".to_string(), ApiRequestErased::new(self.account_id))
            .await?;

        let mut dbtx = self.db.begin_transaction().await;
        dbtx.insert_entry(
            &CachedSyncResponseKey {
                account_id: self.account_id,
            },
            &CacheSyncResponseValue {
                fetch_time: fedimint_core::time::now(),
                value: sync_response.clone(),
            },
        )
        .await;
        dbtx.commit_tx().await;

        // Send the new SyncResponse to all watchers
        let _ = self.sync_response.send(Some(sync_response));
        Ok(())
    }

    /// Subscribe to sync data updates
    pub fn subscribe_to_updates(&self) -> impl Stream<Item = Option<SyncResponse>> {
        WatchStream::new(self.sync_response.subscribe())
    }
}
