use std::sync::Arc;

use fedimint_core::db::Database;
use fedimint_core::task::TaskGroup;

use super::event::EventSink;
use super::storage::Storage;
use crate::api::IFediApi;
use crate::db::BridgeDbPrefix;
use crate::features::FeatureCatalog;
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
}

impl Runtime {
    pub async fn new(
        storage: Storage,
        global_db: Database,
        event_sink: EventSink,
        fedi_api: Arc<dyn IFediApi>,
        app_state: AppState,
        feature_catalog: Arc<FeatureCatalog>,
    ) -> Self {
        let task_group = TaskGroup::new();
        let stream_pool = RpcStreamPool::new(event_sink.clone(), task_group.clone());

        Self {
            storage,
            app_state,
            event_sink,
            task_group,
            fedi_api,
            global_db,
            feature_catalog,
            stream_pool,
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
}
