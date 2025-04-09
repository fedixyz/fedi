use std::mem;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use fedimint_core::db::{Database, IDatabaseTransactionOpsCore, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::Encodable;
use tokio::sync::RwLock;
use tracing::{error, info};

use super::federations_locker::{FederationLockGuard, FederationsLocker};
use crate::bridge::BridgeRuntime;
use crate::db::FederationPendingRejoinFromScratchKey;
use crate::error::RpcError;
use crate::event::{Event, TypedEventExt as _};
use crate::federation::federation_v2::FederationV2;
use crate::fedi_fee::FediFeeHelper;
use crate::storage::{DatabaseInfo, FederationInfo, FediFeeSchedule, Storage};
use crate::types::{RpcFederationId, RpcFederationMaybeLoading};

// label: * = lock held
//
// actions:         ..(join).....................(app shutdown)
// federation lock: ..*****************************************
// state lock:      ..******...................................
//
// actions:         ..(load)..............(leave).........(join)...
// federation lock: ..***************************.........*********
// state lock:      ..******..............*******.........******...
//
#[derive(Clone)]
pub struct FederationStateMachine {
    // this lock serializes the state transitions.
    state: Arc<RwLock<FederationStateInternal>>,
}

impl FederationStateMachine {
    pub fn prepare_for_load() -> Self {
        Self {
            state: Arc::new(RwLock::new(FederationStateInternal::NewForLoad)),
        }
    }
    pub fn prepare_for_join() -> Self {
        Self {
            state: Arc::new(RwLock::new(FederationStateInternal::NewForJoin)),
        }
    }
    pub fn get_state(&self) -> Option<FederationState> {
        let Ok(rstate) = self.state.try_read() else {
            return Some(FederationState::Loading);
        };

        match &*rstate {
            FederationStateInternal::NewForJoin => None,
            FederationStateInternal::NewForLoad => Some(FederationState::Loading),
            FederationStateInternal::LoadFailed(e) => Some(FederationState::Failed(e.clone())),
            FederationStateInternal::Normal(f) => Some(FederationState::Ready(f.clone())),
            FederationStateInternal::Recovering(f) => Some(FederationState::Recovering(f.clone())),
            FederationStateInternal::Left => None,
            FederationStateInternal::Dead => None,
        }
    }
}

#[derive(Clone)]
pub enum FederationState {
    Loading,
    Ready(Arc<FederationV2>),
    Recovering(Arc<FederationV2>),
    Failed(Arc<anyhow::Error>),
}

enum FederationStateInternal {
    NewForJoin,
    NewForLoad,
    LoadFailed(Arc<anyhow::Error>),
    Normal(Arc<FederationV2>),
    Recovering(Arc<FederationV2>),
    Left,
    // a state with no transition, only used internally to mem::replace
    Dead,
}

impl FederationStateMachine {
    /// Transition from NewForJoin or Left to NewForJoin or Normal or Recovering
    #[allow(clippy::too_many_arguments)]
    pub async fn join(
        &self,
        federation_id: String,
        invite_code: String,
        runtime: Arc<BridgeRuntime>,
        locker: &FederationsLocker,
        recover_from_scratch: bool,
        fedi_fee_helper: &Arc<FediFeeHelper>,
    ) -> Result<Arc<FederationV2>> {
        let mut wstate = self.state.write().await;
        anyhow::ensure!(
            matches!(
                &*wstate,
                FederationStateInternal::NewForJoin | FederationStateInternal::Left
            ),
            "Federation already joined"
        );
        let gaurd = locker
            .try_lock_federation(federation_id.clone())
            .expect("lock must not be held in this federation state");
        let db_prefix = runtime
            .app_state
            .new_federation_db_prefix()
            .await
            .context("failed to write AppState")?;
        let federation_db = runtime
            .global_db
            .with_prefix(db_prefix.consensus_encode_to_vec());
        let root_mnemonic = runtime.app_state.root_mnemonic().await;
        let device_index = runtime.app_state.ensure_device_index().await?;
        let federation_arc = FederationV2::join(
            invite_code,
            gaurd,
            runtime.event_sink.clone(),
            runtime.task_group.make_subgroup(),
            runtime.bridge_db(),
            federation_db,
            &root_mnemonic,
            device_index,
            recover_from_scratch,
            fedi_fee_helper.clone(),
            runtime.feature_catalog.clone(),
            runtime.app_state.clone(),
        )
        .await?;

        // If the phone dies here, it's still ok because the federation wouldn't
        // exist in the app_state, and we'd reattempt to join it. And the name of the
        // DB file is random so there shouldn't be any collisions.
        runtime
            .app_state
            .with_write_lock(|state| {
                let old_value = state.joined_federations.insert(
                    federation_id,
                    FederationInfo {
                        version: 2,
                        database: DatabaseInfo::DatabasePrefix(db_prefix),
                        fedi_fee_schedule: FediFeeSchedule::default(),
                    },
                );
                assert!(old_value.is_none(), "must not override a federation");
            })
            .await?;

        if federation_arc.recovering() {
            *wstate = FederationStateInternal::Recovering(federation_arc.clone());
            self.start_recovery_monitoring(runtime);
        } else {
            *wstate = FederationStateInternal::Normal(federation_arc.clone());
        }
        federation_arc.send_federation_event().await;
        Ok(federation_arc)
    }

    /// Transition from NewForLoad to LoadFailed or Normal or Recovering
    #[allow(clippy::too_many_arguments)]
    pub async fn load_from_db(
        &self,
        federation_id: String,
        runtime: Arc<BridgeRuntime>,
        federation_info: FederationInfo,
        locker: &FederationsLocker,
        fedi_fee_helper: &Arc<FediFeeHelper>,
    ) {
        let mut wstate = self.state.write().await;
        assert!(matches!(&*wstate, FederationStateInternal::NewForLoad));
        let guard = locker
            .try_lock_federation(federation_id.clone())
            .expect("lock must not be held in this federation state");
        let federation_result = self
            .load_from_db_inner(&runtime, federation_info, fedi_fee_helper, guard)
            .await;

        // TODO: send federation event
        match federation_result {
            Ok(federation_arc) => {
                federation_arc.send_federation_event().await;
                if federation_arc.recovering() {
                    *wstate = FederationStateInternal::Recovering(federation_arc);
                    self.start_recovery_monitoring(runtime);
                } else {
                    *wstate = FederationStateInternal::Normal(federation_arc);
                }
            }
            Err(err) => {
                runtime.event_sink.typed_event(&Event::federation(
                    RpcFederationMaybeLoading::Failed {
                        error: RpcError::from_anyhow(&err),
                        id: RpcFederationId(federation_id),
                    },
                ));
                *wstate = FederationStateInternal::LoadFailed(Arc::new(err));
            }
        }
    }

    async fn load_from_db_inner(
        &self,
        runtime: &Arc<BridgeRuntime>,
        federation_info: FederationInfo,
        fedi_fee_helper: &Arc<FediFeeHelper>,
        guard: FederationLockGuard,
    ) -> anyhow::Result<Arc<FederationV2>> {
        let root_mnemonic = runtime.app_state.root_mnemonic().await;
        let device_index = runtime
            .app_state
            .device_index()
            .await
            .context("device index must exist when joined federations exist")?;
        let federation_db = match &federation_info.database {
            DatabaseInfo::DatabaseName(db_name) => {
                runtime.storage.federation_database_v2(db_name).await?
            }
            DatabaseInfo::DatabasePrefix(prefix) => runtime
                .global_db
                .with_prefix(prefix.consensus_encode_to_vec()),
        };
        FederationV2::from_db(
            federation_db,
            guard,
            runtime.event_sink.clone(),
            runtime.task_group.make_subgroup(),
            &root_mnemonic,
            device_index,
            fedi_fee_helper.clone(),
            runtime.feature_catalog.clone(),
            runtime.app_state.clone(),
        )
        .await
    }

    fn start_recovery_monitoring(&self, runtime: Arc<BridgeRuntime>) {
        runtime.task_group.clone().spawn_cancellable(
            "waiting for recovery to replace federation",
            self.clone().start_recovery_monitoring_inner(runtime),
        );
    }
    // Start monitoring federation recovery in background
    // Invariant: this must called exactly once when transitioning to
    // Self::Recovering
    async fn start_recovery_monitoring_inner(self, runtime: Arc<BridgeRuntime>) -> Result<()> {
        // acquire read lock to block all other writes
        let rstate = self.state.read().await;
        let FederationStateInternal::Recovering(federation_arc) = &*rstate else {
            panic!("invalid state");
        };
        if let Err(error) = federation_arc.wait_for_recovery().await {
            error!(%error, "recovery failed");
            return Ok(());
        }

        drop(rstate);
        // something else can get write lock at this time, but only permitted transition
        // is Recovering -> something  which is this task.
        let mut wstate = self.state.write().await;
        let FederationStateInternal::Recovering(federation_arc) =
            std::mem::replace(&mut *wstate, FederationStateInternal::Dead)
        else {
            panic!("invalid state");
        };
        let federation_id = federation_arc.federation_id().to_string();
        let db = federation_arc.client.db().clone();
        federation_arc
            .task_group
            .clone()
            .shutdown_join_all(None)
            .await?;

        let FederationV2 {
            event_sink,
            fedi_fee_helper,
            feature_catalog,
            app_state,
            client,
            guard,
            ..
        } = wait_for_unique(federation_arc).await;
        client.shutdown().await;

        let root_mnemonic = runtime.app_state.root_mnemonic().await;
        let device_index = runtime
            .app_state
            .device_index()
            .await
            .context("device index must exist when joined federations exist")?;
        let federation_result = FederationV2::from_db(
            db,
            guard,
            event_sink.clone(),
            runtime.task_group.make_subgroup(),
            &root_mnemonic,
            device_index,
            fedi_fee_helper,
            feature_catalog,
            app_state,
        )
        .await;

        match federation_result {
            Ok(federation_arc) => {
                assert!(
                    !federation_arc.recovering(),
                    "recovery must be complete after restart"
                );
                // After recovery finishes (and if it was not from scratch), ensure no e-cash
                // blind nonces are being reused. If they are, return an error and clear out the
                // federation. The front-end will take care of taking user through rejoining
                // with recover-from-scratch.
                let fed_pending_rejoin_key = FederationPendingRejoinFromScratchKey {
                    invite_code_str: federation_arc.get_invite_code().await,
                };
                let bridge_db = runtime.bridge_db();
                let mut dbtx = bridge_db.begin_transaction().await;
                if dbtx.get_value(&fed_pending_rejoin_key).await.is_none() {
                    if !federation_arc.perform_nonce_reuse_check().await {
                        let federation_id = federation_arc.rpc_federation_id();
                        dbtx.insert_entry(&fed_pending_rejoin_key, &()).await;
                        dbtx.commit_tx().await;

                        *wstate = FederationStateInternal::Left;
                        self.leave_internal(federation_arc, &runtime.storage, &runtime.global_db)
                            .await?;
                        runtime
                            .event_sink
                            .typed_event(&Event::nonce_reuse_check_failed(federation_id));
                        return Ok(());
                    }
                } else {
                    // a recovery from scratch completed so we remove this marker.
                    dbtx.remove_entry(&fed_pending_rejoin_key).await;
                    dbtx.commit_tx().await;
                }

                *wstate = FederationStateInternal::Normal(federation_arc);
            }
            Err(err) => {
                *wstate = FederationStateInternal::LoadFailed(Arc::new(err));
            }
        }
        drop(wstate);
        event_sink.typed_event(&Event::recovery_complete(federation_id));

        Ok(())
    }

    /// Transition from Normal to Left
    pub async fn leave(&self, storage: &Storage, global_db: &Database) -> Result<()> {
        let mut wstate = self.state.write().await;
        // TODO: allow leaving in failed federation?
        anyhow::ensure!(
            matches!(&*wstate, FederationStateInternal::Normal(_)),
            "Can only leave in Normal state"
        );
        let FederationStateInternal::Normal(federation_arc) =
            mem::replace(&mut *wstate, FederationStateInternal::Left)
        else {
            unreachable!("checked above");
        };
        self.leave_internal(federation_arc, storage, global_db)
            .await
    }

    async fn leave_internal(
        &self,
        federation_arc: Arc<FederationV2>,
        storage: &Storage,
        global_db: &Database,
    ) -> Result<()> {
        let removed_federation_info = federation_arc
            .app_state
            .with_write_lock(|state| {
                state
                    .joined_federations
                    .remove(&federation_arc.rpc_federation_id().0)
            })
            .await?;
        let Some(removed_federation_info) = removed_federation_info else {
            unreachable!("federation must be present in state if it is present as state machine");
        };
        federation_arc
            .task_group
            .clone()
            .shutdown_join_all(None)
            .await?;
        let federation = wait_for_unique(federation_arc).await;
        federation.client.shutdown().await;

        // delete from database
        match removed_federation_info.database {
            DatabaseInfo::DatabaseName(name) => {
                storage.delete_federation_db(&name).await?;
            }
            DatabaseInfo::DatabasePrefix(prefix) => {
                let mut dbtx = global_db.begin_transaction().await;
                dbtx.raw_remove_by_prefix(&prefix.consensus_encode_to_vec())
                    .await?;
                dbtx.commit_tx().await;
            }
        }
        Ok(())
    }
}

/// Wait until all clones of federation are dropped.
pub async fn wait_for_unique(mut federation: Arc<FederationV2>) -> FederationV2 {
    // RPC calls might clone the federation Arc before we acquire the lock.
    let mut attempt = 0u64;
    loop {
        match Arc::try_unwrap(federation) {
            Ok(fed) => return fed,
            Err(fed_arc) => {
                federation = fed_arc;
                if attempt % 1000 == 0 {
                    info!(attempt, "waiting for RPCs to drop the federation object");
                }
                attempt += 1;
                fedimint_core::task::sleep(Duration::from_millis(10)).await;
            }
        }
    }
}
