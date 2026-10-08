use std::sync::Arc;

use anyhow::ensure;
use fedimint_connectors::ConnectorRegistry;
use fedimint_core::db::{
    Database, IDatabaseTransactionOpsCore as _, IDatabaseTransactionOpsCoreTyped as _,
};
use fedimint_core::task::TaskGroup;
use futures::StreamExt as _;

use super::event::EventSink;
use super::storage::Storage;
use crate::api::IFediApi;
use crate::db::{
    BridgeDbPrefix, FiClientEnvironmentOwnerKey, FiClientResetPendingKey,
    FiManifoldEnvironmentSelectionKey,
};
use crate::features::{
    FeatureCatalog, FiManifoldEnvironment, RemoteFeaturesService, RuntimeEnvironment,
};
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

    /// Schedule a non-Production FI namespace wipe for the next internal-build
    /// launch.
    pub async fn schedule_fi_client_reset(&self) -> anyhow::Result<()> {
        schedule_fi_client_reset(
            &self.bridge_db(),
            self.feature_catalog.runtime_env,
            self.fi_manifold_environment().await,
        )
        .await
    }

    pub fn fi_client_reset_is_allowed(&self) -> bool {
        fi_client_reset_is_allowed(self.feature_catalog.runtime_env)
    }

    /// Apply a safe scheduled test-state wipe before Manifold opens FI.
    pub async fn apply_scheduled_fi_client_reset(&self) -> anyhow::Result<bool> {
        apply_scheduled_fi_client_reset(
            &self.bridge_db(),
            self.feature_catalog.runtime_env,
            self.fi_manifold_environment().await,
        )
        .await
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

    pub async fn fi_manifold_environment(&self) -> FiManifoldEnvironment {
        let default = default_fi_manifold_environment(self.feature_catalog.runtime_env);
        if !fi_client_reset_is_allowed(self.feature_catalog.runtime_env) {
            return default;
        }
        if let Some(selected) = self
            .bridge_db()
            .begin_transaction_nc()
            .await
            .get_value(&FiManifoldEnvironmentSelectionKey)
            .await
        {
            return selected;
        }
        self.app_state
            .with_read_lock(|state| state.fi_manifold_environment)
            .await
            .unwrap_or(default)
    }

    pub async fn set_fi_manifold_environment(
        &self,
        environment: FiManifoldEnvironment,
    ) -> anyhow::Result<()> {
        switch_fi_manifold_environment(
            &self.bridge_db(),
            self.feature_catalog.runtime_env,
            self.fi_manifold_environment().await,
            environment,
        )
        .await
    }
}

fn default_fi_manifold_environment(environment: RuntimeEnvironment) -> FiManifoldEnvironment {
    match environment {
        RuntimeEnvironment::Dev | RuntimeEnvironment::Tests => FiManifoldEnvironment::Development,
        RuntimeEnvironment::Staging => FiManifoldEnvironment::Staging,
        RuntimeEnvironment::Edge | RuntimeEnvironment::Prod => FiManifoldEnvironment::Production,
    }
}

fn fi_client_reset_is_allowed(environment: RuntimeEnvironment) -> bool {
    matches!(
        environment,
        RuntimeEnvironment::Dev | RuntimeEnvironment::Tests | RuntimeEnvironment::Staging
    )
}

async fn switch_fi_manifold_environment(
    bridge_db: &Database,
    build: RuntimeEnvironment,
    current: FiManifoldEnvironment,
    destination: FiManifoldEnvironment,
) -> anyhow::Result<()> {
    ensure!(
        fi_client_reset_is_allowed(build),
        "FI environment switching is only available in internal builds"
    );
    ensure!(
        current != FiManifoldEnvironment::Production || current == destination,
        "cannot switch away from Production Manifold state"
    );
    if current == destination {
        return Ok(());
    }
    queue_fi_client_reset(bridge_db, build, current, Some(destination)).await
}

async fn schedule_fi_client_reset(
    bridge_db: &Database,
    build: RuntimeEnvironment,
    selected: FiManifoldEnvironment,
) -> anyhow::Result<()> {
    queue_fi_client_reset(bridge_db, build, selected, None).await
}

async fn queue_fi_client_reset(
    bridge_db: &Database,
    build: RuntimeEnvironment,
    source: FiManifoldEnvironment,
    destination: Option<FiManifoldEnvironment>,
) -> anyhow::Result<()> {
    ensure!(
        fi_client_reset_is_allowed(build),
        "FI client reset is only available in internal builds"
    );
    ensure!(
        source != FiManifoldEnvironment::Production,
        "Production Manifold state cannot be reset"
    );
    let mut dbtx = bridge_db.begin_transaction().await;
    let owner = dbtx.get_value(&FiClientEnvironmentOwnerKey).await;
    ensure!(
        owner != Some(FiManifoldEnvironment::Production),
        "Production Manifold state cannot be reset"
    );
    if dbtx.get_value(&FiClientResetPendingKey).await.is_some() {
        ensure!(
            owner.is_some(),
            "queued FI reset has no known source environment"
        );
    } else if owner != Some(source) {
        let namespace_empty = dbtx
            .raw_find_by_prefix(&[BridgeDbPrefix::FiClientPrefix as u8])
            .await?
            .next()
            .await
            .is_none();
        ensure!(
            namespace_empty,
            "FI namespace owner is unknown or differs from the selected environment"
        );
        dbtx.insert_entry(&FiClientEnvironmentOwnerKey, &source)
            .await;
    }
    // An environment switch and its queued wipe are one durable action.
    if let Some(destination) = destination {
        dbtx.insert_entry(&FiManifoldEnvironmentSelectionKey, &destination)
            .await;
    }
    dbtx.insert_entry(&FiClientResetPendingKey, &()).await;
    dbtx.commit_tx_result().await?;
    Ok(())
}

async fn apply_scheduled_fi_client_reset(
    bridge_db: &Database,
    build: RuntimeEnvironment,
    selected: FiManifoldEnvironment,
) -> anyhow::Result<bool> {
    let mut dbtx = bridge_db.begin_transaction().await;
    let owner = dbtx.get_value(&FiClientEnvironmentOwnerKey).await;
    let migrate_legacy_selection = fi_client_reset_is_allowed(build)
        && dbtx
            .get_value(&FiManifoldEnvironmentSelectionKey)
            .await
            .is_none();
    if migrate_legacy_selection {
        dbtx.insert_entry(&FiManifoldEnvironmentSelectionKey, &selected)
            .await;
    }
    if dbtx.get_value(&FiClientResetPendingKey).await.is_some() {
        ensure!(
            fi_client_reset_is_allowed(build),
            "queued FI reset cannot be applied in this build"
        );
        ensure!(
            owner.is_some(),
            "queued FI reset has no known source environment"
        );
        ensure!(
            owner != Some(FiManifoldEnvironment::Production),
            "Production Manifold state cannot be reset"
        );
        dbtx.raw_remove_by_prefix(&[BridgeDbPrefix::FiClientPrefix as u8])
            .await?;
        dbtx.remove_entry(&FiClientResetPendingKey).await;
        dbtx.insert_entry(&FiClientEnvironmentOwnerKey, &selected)
            .await;
        dbtx.commit_tx_result().await?;
        return Ok(true);
    }
    if owner != Some(selected) {
        let namespace_empty = dbtx
            .raw_find_by_prefix(&[BridgeDbPrefix::FiClientPrefix as u8])
            .await?
            .next()
            .await
            .is_none();
        // The old switch queued a wipe before updating app state, and startup
        // applied that wipe before opening FI. With no pending wipe, the
        // legacy selection therefore identifies the namespace's environment.
        if namespace_empty || (migrate_legacy_selection && owner.is_none()) {
            dbtx.insert_entry(&FiClientEnvironmentOwnerKey, &selected)
                .await;
        } else if owner.is_some() {
            anyhow::bail!("FI namespace belongs to another Manifold environment");
        }
        // Ownerless state outside the one-time migration can still open,
        // but cannot be reset by guesswork.
    }
    dbtx.commit_tx_result().await?;
    Ok(false)
}

#[cfg(test)]
mod tests {
    use fedimint_core::db::IRawDatabaseExt as _;
    use fedimint_core::db::mem_impl::MemDatabase;

    use super::*;

    async fn put_formation(bridge_db: &Database, bytes: &[u8]) {
        let fi_db = bridge_db.with_prefix(vec![BridgeDbPrefix::FiClientPrefix as u8]);
        let mut tx = fi_db.begin_transaction().await;
        tx.raw_insert_bytes(&[0], bytes).await.unwrap();
        tx.commit_tx().await;
    }

    async fn formation(bridge_db: &Database) -> Option<Vec<u8>> {
        bridge_db
            .with_prefix(vec![BridgeDbPrefix::FiClientPrefix as u8])
            .begin_transaction_nc()
            .await
            .raw_get_bytes(&[0])
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn switch_and_reset_are_atomic_and_production_cannot_switch_back() {
        let db = MemDatabase::new().into_database();
        let bridge_db = db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        assert!(
            !apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .unwrap()
        );
        put_formation(&bridge_db, b"dev formation").await;
        switch_fi_manifold_environment(
            &bridge_db,
            RuntimeEnvironment::Dev,
            FiManifoldEnvironment::Development,
            FiManifoldEnvironment::Production,
        )
        .await
        .unwrap();
        let mut tx = bridge_db.begin_transaction_nc().await;
        assert_eq!(
            tx.get_value(&FiManifoldEnvironmentSelectionKey).await,
            Some(FiManifoldEnvironment::Production)
        );
        assert!(tx.get_value(&FiClientResetPendingKey).await.is_some());
        assert_eq!(
            tx.get_value(&FiClientEnvironmentOwnerKey).await,
            Some(FiManifoldEnvironment::Development)
        );
        assert_eq!(formation(&bridge_db).await, Some(b"dev formation".to_vec()));

        // Production is already selected, even though the old Dev formation
        // has not yet been wiped at startup.
        assert!(
            switch_fi_manifold_environment(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Production,
                FiManifoldEnvironment::Staging
            )
            .await
            .is_err()
        );
        assert!(
            apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Production
            )
            .await
            .unwrap()
        );
        assert_eq!(formation(&bridge_db).await, None);
        assert_eq!(
            bridge_db
                .begin_transaction_nc()
                .await
                .get_value(&FiClientEnvironmentOwnerKey)
                .await,
            Some(FiManifoldEnvironment::Production)
        );
        put_formation(&bridge_db, b"production formation").await;
        assert!(
            switch_fi_manifold_environment(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Production,
                FiManifoldEnvironment::Development
            )
            .await
            .is_err()
        );
        assert!(
            schedule_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .is_err()
        );
        assert_eq!(
            formation(&bridge_db).await,
            Some(b"production formation".to_vec())
        );
    }

    #[tokio::test]
    async fn test_environment_switches_reset_the_existing_slot() {
        let db = MemDatabase::new().into_database();
        let bridge_db = db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        assert!(
            !apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .unwrap()
        );
        put_formation(&bridge_db, b"dev formation").await;
        switch_fi_manifold_environment(
            &bridge_db,
            RuntimeEnvironment::Dev,
            FiManifoldEnvironment::Development,
            FiManifoldEnvironment::Staging,
        )
        .await
        .unwrap();
        assert!(
            apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Staging
            )
            .await
            .unwrap()
        );
        assert_eq!(formation(&bridge_db).await, None);
        assert_eq!(
            bridge_db
                .begin_transaction_nc()
                .await
                .get_value(&FiClientEnvironmentOwnerKey)
                .await,
            Some(FiManifoldEnvironment::Staging)
        );
    }

    #[tokio::test]
    async fn build_change_does_not_wipe_a_production_formation() {
        let db = MemDatabase::new().into_database();
        let bridge_db = db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        assert!(
            !apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Prod,
                FiManifoldEnvironment::Production
            )
            .await
            .unwrap()
        );
        put_formation(&bridge_db, b"production formation").await;
        assert!(
            schedule_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .is_err()
        );
        assert!(
            apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .is_err()
        );
        assert_eq!(
            formation(&bridge_db).await,
            Some(b"production formation".to_vec())
        );
    }

    #[tokio::test]
    async fn pending_test_reset_cannot_run_in_a_production_build() {
        let db = MemDatabase::new().into_database();
        let bridge_db = db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        assert!(
            !apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .unwrap()
        );
        put_formation(&bridge_db, b"dev formation").await;
        schedule_fi_client_reset(
            &bridge_db,
            RuntimeEnvironment::Dev,
            FiManifoldEnvironment::Development,
        )
        .await
        .unwrap();
        assert!(
            apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Prod,
                FiManifoldEnvironment::Production
            )
            .await
            .is_err()
        );
        assert_eq!(formation(&bridge_db).await, Some(b"dev formation".to_vec()));
        assert!(
            apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .unwrap()
        );
        assert_eq!(formation(&bridge_db).await, None);
    }

    #[tokio::test]
    async fn legacy_state_without_an_owner_cannot_be_wiped() {
        let db = MemDatabase::new().into_database();
        let bridge_db = db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        put_formation(&bridge_db, b"unclassified formation").await;
        assert!(
            schedule_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .is_err()
        );
        assert!(
            switch_fi_manifold_environment(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development,
                FiManifoldEnvironment::Production
            )
            .await
            .is_err()
        );
        assert_eq!(
            formation(&bridge_db).await,
            Some(b"unclassified formation".to_vec())
        );
        assert!(
            bridge_db
                .begin_transaction_nc()
                .await
                .get_value(&FiClientResetPendingKey)
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn legacy_owner_migration_preserves_test_resets_and_protects_production() {
        for selected in [
            FiManifoldEnvironment::Development,
            FiManifoldEnvironment::Production,
        ] {
            let db = MemDatabase::new().into_database();
            let bridge_db = db.with_prefix(vec![BRIDGE_DB_PREFIX]);
            put_formation(&bridge_db, b"legacy formation").await;
            // Startup supplies the legacy app-state selection (or build default).
            assert!(
                !apply_scheduled_fi_client_reset(&bridge_db, RuntimeEnvironment::Dev, selected)
                    .await
                    .unwrap()
            );
            let mut tx = bridge_db.begin_transaction_nc().await;
            assert_eq!(
                tx.get_value(&FiManifoldEnvironmentSelectionKey).await,
                Some(selected)
            );
            assert_eq!(
                tx.get_value(&FiClientEnvironmentOwnerKey).await,
                Some(selected)
            );
            assert_eq!(
                formation(&bridge_db).await,
                Some(b"legacy formation".to_vec())
            );
            let reset =
                schedule_fi_client_reset(&bridge_db, RuntimeEnvironment::Dev, selected).await;
            if selected == FiManifoldEnvironment::Development {
                reset.unwrap();
                assert!(
                    apply_scheduled_fi_client_reset(&bridge_db, RuntimeEnvironment::Dev, selected)
                        .await
                        .unwrap()
                );
                assert_eq!(formation(&bridge_db).await, None);
            } else {
                assert!(reset.is_err());
                assert!(
                    switch_fi_manifold_environment(
                        &bridge_db,
                        RuntimeEnvironment::Dev,
                        selected,
                        FiManifoldEnvironment::Development,
                    )
                    .await
                    .is_err()
                );
                assert_eq!(
                    formation(&bridge_db).await,
                    Some(b"legacy formation".to_vec())
                );
            }
        }
    }

    #[tokio::test]
    async fn an_old_ownerless_pending_reset_cannot_delete_legacy_production_state() {
        let db = MemDatabase::new().into_database();
        let bridge_db = db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        put_formation(&bridge_db, b"unclassified production formation").await;
        let mut tx = bridge_db.begin_transaction().await;
        tx.insert_entry(&FiClientResetPendingKey, &()).await;
        tx.commit_tx().await;

        assert!(
            apply_scheduled_fi_client_reset(
                &bridge_db,
                RuntimeEnvironment::Dev,
                FiManifoldEnvironment::Development
            )
            .await
            .is_err()
        );
        assert_eq!(
            formation(&bridge_db).await,
            Some(b"unclassified production formation".to_vec())
        );
        assert!(
            bridge_db
                .begin_transaction_nc()
                .await
                .get_value(&FiClientResetPendingKey)
                .await
                .is_some()
        );
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

    #[test]
    fn each_runtime_environment_defaults_to_its_own_manifold_deployment() {
        assert_eq!(
            default_fi_manifold_environment(RuntimeEnvironment::Dev),
            FiManifoldEnvironment::Development
        );
        assert_eq!(
            default_fi_manifold_environment(RuntimeEnvironment::Tests),
            FiManifoldEnvironment::Development
        );
        assert_eq!(
            default_fi_manifold_environment(RuntimeEnvironment::Staging),
            FiManifoldEnvironment::Staging
        );
        assert_eq!(
            default_fi_manifold_environment(RuntimeEnvironment::Edge),
            FiManifoldEnvironment::Production
        );
        assert_eq!(
            default_fi_manifold_environment(RuntimeEnvironment::Prod),
            FiManifoldEnvironment::Production
        );
    }
}
