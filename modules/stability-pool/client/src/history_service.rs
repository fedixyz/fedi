use std::ops::Range;
use std::sync::Arc;

use anyhow::bail;
use fedimint_api_client::api::{DynModuleApi, FederationApiExt as _};
use fedimint_core::db::{Database, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::module::ApiRequestErased;
use fedimint_core::util::backoff_util::{self};
use fedimint_core::util::retry;
use futures::{Stream, StreamExt};
use stability_pool_common::{AccountHistoryItem, AccountHistoryRequest, AccountId, SyncResponse};
use tokio::sync::watch;
use tokio_stream::wrappers::WatchStream;

use crate::db::{AccountHistoryItemKey, AccountHistoryItemKeyPrefix};
use crate::StabilityPoolSyncService;

/// Service that syncs account history from server in the background
#[derive(Debug)]
pub struct StabilityPoolHistoryService {
    is_fetching: watch::Sender<bool>,
    module_api: DynModuleApi,
    db: Database,
    account_id: AccountId,
}

impl StabilityPoolHistoryService {
    pub fn new(module_api: DynModuleApi, db: Database, account_id: AccountId) -> Arc<Self> {
        Arc::new(Self {
            is_fetching: watch::Sender::new(false),
            module_api,
            db,
            account_id,
        })
    }

    /// Update history data in background.
    ///
    /// Caller should run this method in a task.
    pub async fn update_continuously(&self, sync_service: &StabilityPoolSyncService) {
        let mut updates = sync_service.subscribe_to_updates();

        // Keep updating based on sync updates
        while let Some(Some(sync)) = updates.next().await {
            retry("history fetch", backoff_util::background_backoff(), || {
                self.update_once(&sync)
            })
            .await
            .expect("inifinite retry");
        }
    }

    async fn update_once(&self, sync_response: &SyncResponse) -> anyhow::Result<()> {
        let local_count = Self::get_account_history_count(
            &mut self.db.begin_transaction_nc().await,
            self.account_id,
        )
        .await;

        if sync_response.account_history_count == local_count {
            return Ok(());
        }

        if sync_response.account_history_count < local_count {
            bail!("server error: incorrect sync response");
        }

        let _ = self.is_fetching.send(true);
        let result = async {
            let new_history_items: Vec<AccountHistoryItem> = self
                .module_api
                .request_current_consensus(
                    "account_history".to_string(),
                    ApiRequestErased::new(AccountHistoryRequest {
                        account_id: self.account_id,
                        range: local_count..sync_response.account_history_count,
                    }),
                )
                .await?;

            let mut dbtx = self.db.begin_transaction().await;
            // Store each new item individually
            for (i, item) in new_history_items.into_iter().enumerate() {
                let key = AccountHistoryItemKey {
                    account_id: self.account_id,
                    index: local_count + i as u64,
                };
                dbtx.insert_entry(&key, &item).await;
            }

            dbtx.commit_tx().await;
            Ok(())
        }
        .await;
        let _ = self.is_fetching.send(false);
        result
    }

    pub async fn get_account_history_count(
        dbtx: &mut DatabaseTransaction<'_>,
        account_id: AccountId,
    ) -> u64 {
        dbtx.find_by_prefix_sorted_descending(&AccountHistoryItemKeyPrefix { account_id })
            .await
            .next()
            .await
            .map_or(0, |k| k.0.index)
    }

    /// Get all history items for the given account, ordered by index
    pub async fn get_account_history(
        &self,
        range: Range<u64>,
    ) -> anyhow::Result<Vec<AccountHistoryItem>> {
        let mut dbtx = self.db.begin_transaction().await;
        Ok(dbtx
            .find_by_range(
                AccountHistoryItemKey {
                    account_id: self.account_id,
                    index: range.start,
                }..AccountHistoryItemKey {
                    account_id: self.account_id,
                    index: range.end,
                },
            )
            .await
            .map(|(_key, value)| value)
            .collect()
            .await)
    }

    /// Subscribe to history fetch updates to show a loading.
    pub fn subscribe_to_fetches(&self) -> impl Stream<Item = bool> {
        WatchStream::new(self.is_fetching.subscribe())
    }
}
