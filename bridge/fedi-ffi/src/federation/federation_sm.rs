use std::mem;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use bip39::Mnemonic;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCore};
use fedimint_core::encoding::Encodable;
use fedimint_core::task::TaskGroup;
use tokio::sync::RwLock;
use tracing::{error, info};

use super::federations_locker::FederationsLocker;
use crate::error::RpcError;
use crate::event::{Event, EventSink, TypedEventExt as _};
use crate::features::FeatureCatalog;
use crate::federation::federation_v2::FederationV2;
use crate::fedi_fee::FediFeeHelper;
use crate::storage::{AppState, DatabaseInfo, FederationInfo, FediFeeSchedule, Storage};
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
        locker: &FederationsLocker,
        event_sink: &EventSink,
        root_task_group: &TaskGroup,
        db: Database,
        database_info: DatabaseInfo,
        root_mnemonic: Mnemonic,
        device_index: u8,
        recover_from_scratch: bool,
        fedi_fee_helper: &Arc<FediFeeHelper>,
        app_state: &Arc<AppState>,
        feature_catalog: &Arc<FeatureCatalog>,
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
        let federation_arc = FederationV2::join(
            invite_code,
            gaurd,
            event_sink.clone(),
            root_task_group.make_subgroup(),
            db,
            &root_mnemonic,
            device_index,
            recover_from_scratch,
            fedi_fee_helper.clone(),
            feature_catalog.clone(),
            app_state.clone(),
        )
        .await?;

        // If the phone dies here, it's still ok because the federation wouldn't
        // exist in the app_state, and we'd reattempt to join it. And the name of the
        // DB file is random so there shouldn't be any collisions.
        app_state
            .with_write_lock(|state| {
                let old_value = state.joined_federations.insert(
                    federation_id,
                    FederationInfo {
                        version: 2,
                        database: database_info,
                        fedi_fee_schedule: FediFeeSchedule::default(),
                    },
                );
                assert!(old_value.is_none(), "must not override a federation");
            })
            .await?;

        if federation_arc.recovering() {
            *wstate = FederationStateInternal::Recovering(federation_arc.clone());
            self.start_recovery_monitoring(root_task_group.clone(), root_mnemonic, device_index);
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
        db: Database,
        locker: &FederationsLocker,
        event_sink: &EventSink,
        root_task_group: &TaskGroup,
        root_mnemonic: Mnemonic,
        device_index: u8,
        fedi_fee_helper: &Arc<FediFeeHelper>,
        feature_catalog: &Arc<FeatureCatalog>,
        app_state: &Arc<AppState>,
    ) {
        let mut wstate = self.state.write().await;
        assert!(matches!(&*wstate, FederationStateInternal::NewForLoad));
        let gaurd = locker
            .try_lock_federation(federation_id.clone())
            .expect("lock must not be held in this federation state");
        let federation_result = FederationV2::from_db(
            db,
            gaurd,
            event_sink.clone(),
            root_task_group.make_subgroup(),
            &root_mnemonic,
            device_index,
            fedi_fee_helper.clone(),
            feature_catalog.clone(),
            app_state.clone(),
        )
        .await;

        // TODO: send federation event
        match federation_result {
            Ok(federation_arc) => {
                federation_arc.send_federation_event().await;
                if federation_arc.recovering() {
                    *wstate = FederationStateInternal::Recovering(federation_arc);
                    self.start_recovery_monitoring(
                        root_task_group.clone(),
                        root_mnemonic,
                        device_index,
                    );
                } else {
                    *wstate = FederationStateInternal::Normal(federation_arc);
                }
            }
            Err(err) => {
                event_sink.typed_event(&Event::federation(RpcFederationMaybeLoading::Failed {
                    error: RpcError::from_anyhow(&err),
                    id: RpcFederationId(federation_id),
                }));
                *wstate = FederationStateInternal::LoadFailed(Arc::new(err));
            }
        }
    }

    fn start_recovery_monitoring(
        &self,
        root_task_group: TaskGroup,
        root_mnemonic: Mnemonic,
        device_index: u8,
    ) {
        root_task_group.clone().spawn_cancellable(
            "waiting for recovery to replace federation",
            self.clone().start_recovery_monitoring_inner(
                root_task_group,
                root_mnemonic,
                device_index,
            ),
        );
    }
    // Start monitoring federation recovery in background
    // Invariant: this must called exactly once when transitioning to
    // Self::Recovering
    async fn start_recovery_monitoring_inner(
        self,
        root_task_group: TaskGroup,
        root_mnemonic: Mnemonic,
        device_index: u8,
    ) -> Result<()> {
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
        // is Recovering -> Normal which is this task.
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
        let federation_result = FederationV2::from_db(
            db,
            guard,
            event_sink.clone(),
            root_task_group.make_subgroup(),
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
