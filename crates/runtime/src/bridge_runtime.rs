use std::sync::Arc;

use anyhow::ensure;
use fedimint_connectors::ConnectorRegistry;
use fedimint_core::db::{
    Database, IDatabaseTransactionOpsCore as _, IDatabaseTransactionOpsCoreTyped as _,
};
use fedimint_core::task::TaskGroup;

use super::event::EventSink;
use super::storage::Storage;
use crate::api::IFediApi;
use crate::db::{BridgeDbPrefix, FiClientResetPendingKey};
use crate::features::{FeatureCatalog, RemoteFeaturesService, RuntimeEnvironment};
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

    /// DB for consumer-neutral Federation Initiator client state.
    pub fn fi_client_db(&self) -> Database {
        self.global_db
            .with_prefix(vec![BRIDGE_DB_PREFIX, BridgeDbPrefix::FiClientPrefix as u8])
    }

    /// Schedule a full FI namespace wipe for the next internal-build launch.
    pub async fn schedule_fi_client_reset(&self) -> anyhow::Result<()> {
        schedule_fi_client_reset(&self.bridge_db(), self.feature_catalog.runtime_env).await
    }

    pub fn fi_client_reset_is_allowed(&self) -> bool {
        fi_client_reset_is_allowed(self.feature_catalog.runtime_env)
    }

    /// Apply a scheduled wipe before Manifold opens the FI namespace.
    pub async fn apply_scheduled_fi_client_reset(&self) -> anyhow::Result<bool> {
        apply_scheduled_fi_client_reset(&self.bridge_db(), self.feature_catalog.runtime_env).await
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

fn fi_client_reset_is_allowed(environment: RuntimeEnvironment) -> bool {
    matches!(
        environment,
        RuntimeEnvironment::Dev | RuntimeEnvironment::Tests | RuntimeEnvironment::Staging
    )
}

async fn schedule_fi_client_reset(
    bridge_db: &Database,
    environment: RuntimeEnvironment,
) -> anyhow::Result<()> {
    ensure!(
        fi_client_reset_is_allowed(environment),
        "FI client reset is only available in internal builds"
    );
    let mut dbtx = bridge_db.begin_transaction().await;
    dbtx.insert_entry(&FiClientResetPendingKey, &()).await;
    dbtx.commit_tx_result().await?;
    Ok(())
}

async fn apply_scheduled_fi_client_reset(
    bridge_db: &Database,
    environment: RuntimeEnvironment,
) -> anyhow::Result<bool> {
    if !fi_client_reset_is_allowed(environment) {
        return Ok(false);
    }

    let mut dbtx = bridge_db.begin_transaction().await;
    if dbtx.get_value(&FiClientResetPendingKey).await.is_none() {
        return Ok(false);
    }
    dbtx.raw_remove_by_prefix(&[BridgeDbPrefix::FiClientPrefix as u8])
        .await?;
    dbtx.remove_entry(&FiClientResetPendingKey).await;
    dbtx.commit_tx_result().await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use fedimint_core::db::IRawDatabaseExt as _;
    use fedimint_core::db::mem_impl::MemDatabase;

    use super::*;

    #[tokio::test]
    async fn scheduled_reset_clears_only_the_fi_namespace() {
        let database = MemDatabase::new().into_database();
        let bridge_db = database.with_prefix(vec![BRIDGE_DB_PREFIX]);
        let fi_db = bridge_db.with_prefix(vec![BridgeDbPrefix::FiClientPrefix as u8]);
        let neighbour_db =
            bridge_db.with_prefix(vec![BridgeDbPrefix::FiFederationAutoJoinCompleted as u8]);

        let mut dbtx = fi_db.begin_transaction().await;
        dbtx.raw_insert_bytes(&[0x00], b"formation").await.unwrap();
        dbtx.raw_insert_bytes(&[0x04], b"liquidity").await.unwrap();
        dbtx.commit_tx().await;
        let mut dbtx = neighbour_db.begin_transaction().await;
        dbtx.raw_insert_bytes(&[0x00], b"keep").await.unwrap();
        dbtx.commit_tx().await;

        schedule_fi_client_reset(&bridge_db, RuntimeEnvironment::Staging)
            .await
            .unwrap();
        assert!(
            apply_scheduled_fi_client_reset(&bridge_db, RuntimeEnvironment::Staging)
                .await
                .unwrap()
        );

        let mut dbtx = fi_db.begin_transaction_nc().await;
        assert!(dbtx.raw_get_bytes(&[0x00]).await.unwrap().is_none());
        assert!(dbtx.raw_get_bytes(&[0x04]).await.unwrap().is_none());
        let mut dbtx = neighbour_db.begin_transaction_nc().await;
        assert_eq!(
            dbtx.raw_get_bytes(&[0x00]).await.unwrap(),
            Some(b"keep".to_vec())
        );
        let mut dbtx = bridge_db.begin_transaction_nc().await;
        assert!(dbtx.get_value(&FiClientResetPendingKey).await.is_none());
    }

    #[test]
    fn reset_is_internal_only() {
        for environment in [
            RuntimeEnvironment::Dev,
            RuntimeEnvironment::Tests,
            RuntimeEnvironment::Staging,
        ] {
            assert!(fi_client_reset_is_allowed(environment));
        }
        for environment in [RuntimeEnvironment::Edge, RuntimeEnvironment::Prod] {
            assert!(!fi_client_reset_is_allowed(environment));
        }
    }
}
