use std::sync::Arc;

use fedimint_connectors::ConnectorRegistry;
use fedimint_core::db::Database;
use fedimint_core::task::TaskGroup;

use super::event::EventSink;
use super::storage::Storage;
use crate::api::IFediApi;
use crate::db::BridgeDbPrefix;
use crate::features::{FeatureCatalog, RemoteFeaturesService};
use crate::rpc_stream::RpcStreamPool;
use crate::storage::{AppState, BRIDGE_DB_PREFIX};

// FIXME: federation-specific filename
pub const RECOVERY_FILENAME: &str = "backup.fedi";
pub const VERIFICATION_FILENAME: &str = "verification.mp4";

/// This struct encapsulates runtime dependencies like storage, event pipe, task
/// manager etc. that all the bridge services like Federations or Communities
/// need to properly function.
pub struct Runtime {
    pub storage: Storage,
    pub app_state: AppState,
    pub event_sink: EventSink,
    pub task_group: TaskGroup,
    pub fedi_api: Arc<dyn IFediApi>,
    pub global_db: Database,
    pub feature_catalog: Arc<FeatureCatalog>,
    pub stream_pool: RpcStreamPool,
    pub connectors: ConnectorRegistry,
    pub remote_features: RemoteFeaturesService,
}

impl Runtime {
    #[allow(clippy::too_many_arguments)]
    pub async fn new(
        storage: Storage,
        global_db: Database,
        connectors: ConnectorRegistry,
        event_sink: EventSink,
        task_group: TaskGroup,
        fedi_api: Arc<dyn IFediApi>,
        app_state: AppState,
        feature_catalog: Arc<FeatureCatalog>,
    ) -> Self {
        let stream_pool = RpcStreamPool::new(event_sink.clone(), task_group.clone());
        let remote_features = RemoteFeaturesService::new(
            task_group.clone(),
            global_db.with_prefix(vec![BRIDGE_DB_PREFIX]),
            feature_catalog.runtime_env,
        );
        // Warm the remote feature cache at startup. Foreground events refresh it
        // again so the cache stays fresh between launches.
        remote_features.spawn_refresh();
        Self {
            storage,
            connectors,
            app_state,
            event_sink,
            task_group,
            fedi_api,
            global_db,
            feature_catalog,
            stream_pool,
            remote_features,
        }
    }

    pub fn bridge_db(&self) -> Database {
        self.global_db.with_prefix(vec![BRIDGE_DB_PREFIX])
    }

    /// DB for mulitspend state.
    pub fn multispend_db(&self) -> Database {
        self.global_db.with_prefix(vec![
            BRIDGE_DB_PREFIX,
            BridgeDbPrefix::MultispendPrefix as u8,
        ])
    }

    /// DB for SP Transfers state.
    pub fn sp_transfers_db(&self) -> Database {
        self.global_db.with_prefix(vec![
            BRIDGE_DB_PREFIX,
            BridgeDbPrefix::SpTransfersPrefix as u8,
        ])
    }

    /// Enable logging of potentially sensitive information.
    pub async fn sensitive_log(&self) -> bool {
        self.app_state
            .with_read_lock(|state| state.sensitive_log.unwrap_or(false))
            .await
    }

    pub async fn set_sensitive_log(&self, enable: bool) -> anyhow::Result<()> {
        self.app_state
            .with_write_lock(|state| {
                state.sensitive_log = Some(enable);
            })
            .await?;
        Ok(())
    }
}
