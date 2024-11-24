use std::collections::btree_map::Entry;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use bitcoin::bech32::{self, ToBase32};
use bitcoin::key::{KeyPair, XOnlyPublicKey};
use bitcoin::secp256k1::{Message, Secp256k1};
use fedi_social_client::{
    self, FediSocialCommonGen, RecoveryFile, SocialRecoveryClient, SocialRecoveryState,
};
use fedimint_api_client::api::DynGlobalApi;
use fedimint_core::config::ClientConfig;
use fedimint_core::core::ModuleKind;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCore};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::invite_code::InviteCode;
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::module::CommonModuleInit;
use fedimint_core::task::TaskGroup;
use fedimint_core::PeerId;
use fedimint_derive_secret::{ChildId, DerivableSecret};
use futures::future::join_all;
use tokio::sync::{Mutex, OnceCell};
use tracing::{debug, error, info, warn};

use super::event::EventSink;
use super::storage::Storage;
use super::types::{
    federation_v2_to_rpc_federation, RpcFederation, RpcFederationId, RpcPeerId, RpcPublicKey,
    RpcRecoveryId, RpcSignedLnurlMessage, SocialRecoveryApproval, SocialRecoveryQr,
};
use crate::api::IFediApi;
use crate::community::Communities;
use crate::constants::{LNURL_CHILD_ID, MATRIX_CHILD_ID, NOSTR_CHILD_ID};
use crate::device_registration::{self, DeviceRegistrationService};
use crate::error::{get_error_code, ErrorCode};
use crate::event::{Event, SocialRecoveryEvent, TypedEventExt as _};
use crate::features::FeatureCatalog;
use crate::federation_v2::{self, FederationV2};
use crate::fedi_fee::FediFeeHelper;
use crate::matrix::Matrix;
use crate::storage::{
    AppState, DatabaseInfo, FederationInfo, FediFeeSchedule, FiatFXInfo, ModuleFediFeeSchedule,
};
use crate::types::{
    RpcBridgeStatus, RpcDeviceIndexAssignmentStatus, RpcFederationMaybeLoading,
    RpcFederationPreview, RpcNostrPubkey, RpcNostrSecret, RpcRegisteredDevice,
};
use crate::utils::required_threashold_of;

// FIXME: federation-specific filename
pub const RECOVERY_FILENAME: &str = "backup.fedi";
pub const VERIFICATION_FILENAME: &str = "verification.mp4";

#[derive(Clone)]
pub enum FederationMaybeLoading {
    Loading,
    Ready(Arc<FederationV2>),
    Failed(Arc<anyhow::Error>),
}

/// This is instantiated once as a global. When RPC commands come in, this
/// struct is used as a router to look up the federation and handle the RPC
/// command using it.
#[derive(Clone)]
pub struct Bridge {
    pub storage: Storage,
    pub app_state: Arc<AppState>,
    pub federations: Arc<Mutex<BTreeMap<String, FederationMaybeLoading>>>,
    pub communities: Arc<Communities>,
    pub event_sink: EventSink,
    pub task_group: TaskGroup,
    pub fedi_api: Arc<dyn IFediApi>,
    pub fedi_fee_helper: Arc<FediFeeHelper>,
    pub matrix: OnceCell<Matrix>,
    pub device_registration_service: Arc<Mutex<DeviceRegistrationService>>,
    pub global_db: Database,
    pub feature_catalog: Arc<FeatureCatalog>,
}

impl Bridge {
    pub async fn new(
        storage: Storage,
        event_sink: EventSink,
        fedi_api: Arc<dyn IFediApi>,
        device_identifier: String,
        feature_catalog: Arc<FeatureCatalog>,
    ) -> Result<Self> {
        let task_group = TaskGroup::new();
        let app_state = Arc::new(AppState::load(storage.clone()).await?);
        let fedi_fee_helper = Arc::new(FediFeeHelper::new(
            fedi_api.clone(),
            app_state.clone(),
            task_group.make_subgroup(),
        ));

        let _device_identifier = app_state
            .verify_and_return_device_identifier(FromStr::from_str(&device_identifier)?)
            .await?;
        let device_registration_service = Mutex::new(
            DeviceRegistrationService::new(
                app_state.clone(),
                event_sink.clone(),
                &task_group,
                fedi_api.clone(),
            )
            .await,
        )
        .into();

        let global_db = storage.federation_database_v2("global").await?;

        // Load communities module
        let communities = Communities::init(
            app_state.clone(),
            event_sink.clone(),
            task_group.make_subgroup(),
        )
        .await
        .into();

        let bridge = Self {
            storage,
            app_state,
            federations: Arc::default(),
            communities,
            event_sink,
            task_group,
            fedi_api,
            fedi_fee_helper,
            matrix: OnceCell::default(),
            device_registration_service,
            global_db,
            feature_catalog,
        };
        Self::load_joined_federations_in_background(bridge.clone()).await?;
        Ok(bridge)
    }

    async fn load_joined_federations_in_background(bridge: Bridge) -> Result<()> {
        let joined_federations = bridge
            .app_state
            .with_read_lock(|state| state.joined_federations.clone())
            .await;

        let mut futures = Vec::new();
        let mut federations = bridge.federations.lock().await;
        for (federation_id, federation_info) in joined_federations {
            if federation_info.version < 2 {
                error!(version = federation_info.version, %federation_id, "Invalid federation version");
                continue;
            }
            federations.insert(federation_id.clone(), FederationMaybeLoading::Loading);

            futures.push(Bridge::load_federation(
                bridge.clone(),
                federation_id.clone(),
                federation_info,
            ));
        }
        drop(federations);

        // FIXME: update after each federation is loaded.
        bridge.task_group.clone().spawn_cancellable(
            "load federation and update fedi fee schedule",
            async move {
                futures::future::join_all(futures).await;
                bridge.update_fedi_fees_schedule().await;
            },
        );

        Ok(())
    }

    async fn update_fedi_fees_schedule(&self) {
        // Spawn a new task to asynchronously fetch the fee schedule and update app
        // state
        let fed_network_map = self
            .federations
            .lock()
            .await
            .iter()
            .filter_map(|(id, fed)| match fed {
                FederationMaybeLoading::Ready(fed) => Some((id.clone(), fed.get_network()?)),
                _ => None,
            })
            .collect();

        self.fedi_fee_helper
            .fetch_and_update_fedi_fee_schedule(fed_network_map)
            .await;
    }

    #[tracing::instrument(skip_all, err, fields(federation_id = federation_id_str))]
    async fn load_federation(
        bridge: Bridge,
        federation_id_str: String,
        federation_info: FederationInfo,
    ) -> Result<()> {
        let root_mnemonic = bridge.app_state.root_mnemonic().await;
        let device_index = bridge
            .app_state
            .device_index()
            .await
            .context("device index must exist when joined federations exist")?;

        let db = match &federation_info.database {
            DatabaseInfo::DatabaseName(db_name) => {
                bridge.storage.federation_database_v2(db_name).await?
            }
            DatabaseInfo::DatabasePrefix(prefix) => bridge
                .global_db
                .with_prefix(prefix.consensus_encode_to_vec()),
        };

        let federation_result = FederationV2::from_db(
            db,
            bridge.event_sink.clone(),
            bridge.task_group.make_subgroup(),
            &root_mnemonic,
            device_index,
            bridge.fedi_fee_helper.clone(),
            bridge.feature_catalog.clone(),
            bridge.app_state.clone(),
        )
        .await;

        match federation_result {
            Ok(federation) => {
                let federation_arc = Arc::new(federation);
                bridge.federations.lock().await.insert(
                    federation_id_str.clone(),
                    FederationMaybeLoading::Ready(federation_arc.clone()),
                );

                bridge
                    .send_federation_event(RpcFederationMaybeLoading::Ready(
                        federation_v2_to_rpc_federation(&federation_arc).await,
                    ))
                    .await;
                if federation_arc.recovering() {
                    Self::restart_federation_on_recovery(bridge.clone(), federation_arc).await;
                }
            }
            Err(err) => {
                error!(%err, "federation failed to load");
                bridge
                    .send_federation_event(RpcFederationMaybeLoading::Failed {
                        error: err.to_string(),
                        id: RpcFederationId(federation_id_str.clone()),
                    })
                    .await;
                bridge.federations.lock().await.insert(
                    federation_id_str.clone(),
                    FederationMaybeLoading::Failed(Arc::new(err)),
                );
            }
        }

        Ok(())
    }

    /// Send whenever federation is loaded.
    pub async fn send_federation_event(&self, rpc_federation: RpcFederationMaybeLoading) {
        let event = Event::federation(rpc_federation);
        self.event_sink.typed_event(&event);
    }

    pub async fn bridge_status(&self) -> anyhow::Result<RpcBridgeStatus> {
        let matrix_setup = self
            .app_state
            .with_read_lock(|x| x.matrix_session.is_some())
            .await;
        let device_index_assignment_status = self.device_index_assignment_status().await?;
        Ok(RpcBridgeStatus {
            matrix_setup,
            device_index_assignment_status,
        })
    }

    /// Kick-off tasks that should be performed whenever the app returns to the
    /// foreground.
    pub async fn on_app_foreground(&self) {
        self.communities.refresh_metas_in_background();
    }

    /// Dump the database for a given federation.
    pub async fn dump_db(&self, federation_id: &str) -> anyhow::Result<PathBuf> {
        let db_dump_path = format!("db-{federation_id}.dump");
        let federation = self.get_federation(federation_id).await?;
        let db = federation.client.db().clone();
        let mut buffer = Vec::new();
        fedi_db_dump::dump_db(&db, &mut buffer).await?;
        self.storage
            .write_file(db_dump_path.as_ref(), buffer)
            .await?;
        Ok(self.storage.platform_path(db_dump_path.as_ref()))
    }

    /// Wait until all clones of federation are dropped.
    pub async fn wait_till_fully_dropped(federation: Arc<FederationV2>) {
        // RPC calls might clone the federation Arc before we acquire the lock.
        for attempt in 0.. {
            let reference_count = Arc::strong_count(&federation);
            info!(
                reference_count,
                attempt, "waiting for RPCs to drop the federation object"
            );
            if reference_count == 1 {
                break;
            }
            fedimint_core::task::sleep(Duration::from_millis(10)).await;
        }
    }

    /// Restart the federation on recovery if the federation is recovering.
    async fn restart_federation_on_recovery(this: Self, federation: Arc<FederationV2>) {
        this.task_group.clone().spawn(
            "waiting for recovery to replace federation",
            move |_| async move {
                let inner_federation = &*federation;
                if let Err(error) = inner_federation.wait_for_recovery().await {
                    // this federation will stay as "recovering" till next restart.
                    error!(%error, "recovery failed");
                    return Ok(());
                }
                let tg = inner_federation.task_group.clone();
                let federation_id = inner_federation.federation_id().to_string();
                let client = inner_federation.client.clone();
                let mut federation_lock = this.federations.lock().await;
                let db = client.db().clone();
                drop(
                    federation_lock.insert(federation_id.clone(), FederationMaybeLoading::Loading),
                );
                info!(%federation_id, "removed from federation list");

                if let Err(error) = tg.shutdown_join_all(None).await {
                    warn!(%error, "failed to shutdown task group cleanly");
                }
                // some slow RPCs may take ~10 seconds
                if fedimint_core::task::timeout(
                    Duration::from_secs(20),
                    Self::wait_till_fully_dropped(federation),
                )
                .await
                .is_err()
                {
                    info!("failed to drop federation, not reinserting the federation");
                    return Ok(());
                }
                info!("manually shuting down the client");
                if let Some(client) = Arc::into_inner(client) {
                    // only Federation object stores the client handle, so this should always
                    // pass.
                    client.shutdown().await;
                    info!("manually shut down client complete");
                } else {
                    error!("ClientHandleArc is not unique, not reinserting the federation in list");
                    return Ok(());
                }
                let root_mnemonic = this.app_state.root_mnemonic().await;
                let device_index = this.app_state.ensure_device_index().await?;
                let federation_v2 = FederationV2::from_db(
                    db,
                    this.event_sink.clone(),
                    this.task_group.make_subgroup(),
                    &root_mnemonic,
                    device_index,
                    this.fedi_fee_helper.clone(),
                    this.feature_catalog.clone(),
                    this.app_state.clone(),
                )
                .await
                .with_context(|| format!("loading federation {}", federation_id.clone()))?;
                let fed_network = federation_v2.get_network();
                if federation_v2.recovering() {
                    error!(%federation_id, "federation must be recovered after restart on recovery completed once");
                }
                federation_lock.insert(federation_id.clone(), FederationMaybeLoading::Ready(Arc::new(federation_v2)));
                info!(%federation_id, "reinserted to federation list");
                drop(federation_lock);

                // refetch fee schedule once recovery is complete
                if let Some(network) = fed_network {
                    this.fedi_fee_helper
                        .fetch_and_update_fedi_fee_schedule(
                            vec![(federation_id.clone(), network)].into_iter().collect(),
                        )
                        .await;
                }
                // send the event only after we reinsert the federation.
                this.event_sink
                    .typed_event(&Event::recovery_complete(federation_id.clone()));
                anyhow::Ok(())
            },
        );
    }
    /// Joins federation from invite code
    ///
    /// Federation ID saved to global database, new rocksdb database created for
    /// it, and it is saved to local hashmap by ID
    pub async fn join_federation(
        &self,
        invite_code_string: String,
        recover_from_scratch: bool,
    ) -> Result<RpcFederation> {
        let invite_code = invite_code_string.to_lowercase();
        // FIXME: this is kinda unreliable
        let mut error_code = None;
        match self
            .join_federation_inner(invite_code.clone(), recover_from_scratch)
            .await
        {
            Ok(federation) => {
                info!("Joined v2 federation");
                return Ok(federation_v2_to_rpc_federation(&federation).await);
            }
            Err(e) => {
                error!("failed to join v2 federation {e:?}");
                error_code = error_code.or(get_error_code(&e));

                // If error code is NOT "AlreadyJoined" AND
                // If federation is still under loading state,
                // then let's remove it so that another attempt can happen later
                if !matches!(error_code, Some(ErrorCode::AlreadyJoined)) {
                    let invite_code = InviteCode::from_str(&invite_code_string)?;
                    let mut federations = self.federations.lock().await;
                    if let Some(FederationMaybeLoading::Loading) =
                        federations.get(&invite_code.federation_id().to_string())
                    {
                        federations.remove(&invite_code.federation_id().to_string());
                    }
                }
            }
        }
        if let Some(error_code) = error_code {
            bail!(error_code);
        }
        bail!("failed to join")
    }

    async fn join_federation_inner(
        &self,
        invite_code_string: String,
        recover_from_scratch: bool,
    ) -> Result<Arc<FederationV2>> {
        // Check if we've already joined this federation. If we have throw error,
        // otherwise write loading state
        let invite_code = InviteCode::from_str(&invite_code_string)?;
        let mut federations = self.federations.lock().await;
        if let Entry::Vacant(e) = federations.entry(invite_code.federation_id().to_string()) {
            e.insert(FederationMaybeLoading::Loading);
        } else {
            bail!(ErrorCode::AlreadyJoined)
        }
        drop(federations);

        let root_mnemonic = self.app_state.root_mnemonic().await;
        let device_index = self.app_state.ensure_device_index().await?;

        let db_prefix = self
            .app_state
            .new_federation_db_prefix()
            .await
            .context("failed to write AppState")?;
        let db = self
            .global_db
            .with_prefix(db_prefix.consensus_encode_to_vec());
        let federation = FederationV2::join(
            invite_code_string,
            self.event_sink.clone(),
            self.task_group.make_subgroup(),
            db,
            &root_mnemonic,
            device_index,
            recover_from_scratch,
            self.fedi_fee_helper.clone(),
            self.feature_catalog.clone(),
            self.app_state.clone(),
        )
        .await?;
        let federation_id = federation.federation_id();
        let mut federations = self.federations.lock().await;

        // If the phone dies here, it's still ok because the federation wouldn't
        // exist in the app_state, and we'd reattempt to join it. And the name of the
        // DB file is random so there shouldn't be any collisions.
        self.app_state
            .with_write_lock(|state| {
                let old_value = state.joined_federations.insert(
                    federation_id.to_string(),
                    FederationInfo {
                        version: 2,
                        database: DatabaseInfo::DatabasePrefix(db_prefix),
                        fedi_fee_schedule: FediFeeSchedule::default(),
                    },
                );
                assert!(old_value.is_none(), "must not override a federation");
            })
            .await?;
        let federation_arc = Arc::new(federation);
        federations.insert(
            federation_id.to_string(),
            FederationMaybeLoading::Ready(federation_arc.clone()),
        );
        drop(federations);
        if federation_arc.recovering() {
            Self::restart_federation_on_recovery(self.clone(), federation_arc.clone()).await;
        }

        // Spawn a new task to asynchronously fetch the fee schedule and update app
        // state
        self.update_fedi_fees_schedule().await;

        Ok(federation_arc)
    }

    pub async fn federation_preview(&self, invite_code: &str) -> Result<RpcFederationPreview> {
        let invite_code = invite_code.to_lowercase();
        let root_mnemonic = self.app_state.root_mnemonic().await;
        let device_index = self.app_state.ensure_device_index().await?;
        FederationV2::federation_preview(
            &invite_code,
            &root_mnemonic,
            device_index,
            self.feature_catalog.override_localhost.is_some(),
        )
        .await
    }

    /// Look up federation by id from in-memory hashmap
    pub async fn get_federation(&self, federation_id: &str) -> Result<Arc<FederationV2>> {
        let federation = self.get_federation_maybe_recovering(federation_id).await?;
        anyhow::ensure!(!federation.recovering(), "client is still recovering");
        Ok(federation)
    }

    /// Look up federation by id from in-memory hashmap
    pub async fn get_federation_maybe_recovering(
        &self,
        federation_id: &str,
    ) -> Result<Arc<FederationV2>> {
        match self.get_federation_maybe_loading(federation_id).await? {
            FederationMaybeLoading::Ready(federation) => Ok(federation),
            FederationMaybeLoading::Loading => bail!("Federation is still loading"),
            FederationMaybeLoading::Failed(e) => bail!("Federation failed to load: {}", e),
        }
    }
    /// Look up federation by id from in-memory hashmap
    async fn get_federation_maybe_loading(
        &self,
        federation_id: &str,
    ) -> Result<FederationMaybeLoading> {
        let lock = self.federations.lock().await;
        lock.get(federation_id)
            .cloned()
            .ok_or_else(|| anyhow!("Federation not found"))
    }

    pub async fn list_federations(&self) -> Vec<RpcFederationMaybeLoading> {
        let federations = self.federations.lock().await.clone();
        join_all(federations.into_iter().map(|(id, federation)| async move {
            match federation {
                FederationMaybeLoading::Ready(fed) => {
                    RpcFederationMaybeLoading::Ready(federation_v2_to_rpc_federation(&fed).await)
                }
                FederationMaybeLoading::Loading => RpcFederationMaybeLoading::Loading {
                    id: RpcFederationId(id),
                },
                FederationMaybeLoading::Failed(err) => RpcFederationMaybeLoading::Failed {
                    error: err.to_string(),
                    id: RpcFederationId(id),
                },
            }
        }))
        .await
    }

    pub async fn leave_federation(&self, federation_id_str: &str) -> Result<()> {
        // check if federation is loaded and not recovering
        self.get_federation(federation_id_str).await?;
        // delete federation from app state (global DB)
        let federation_id = federation_id_str.to_owned();
        let removed_federation_info = self
            .app_state
            .with_write_lock(|state| state.joined_federations.remove(&federation_id))
            .await?;

        let Some(removed_federation_info) = removed_federation_info else {
            bail!("federation must be present in state");
        };
        // If the phone dies here, it's still ok because the federation would be removed
        // from the app_state and in the worst case we'd just be leaving behind a stale
        // DB file.

        // Remove from bridge state
        let Some(federation) = self
            .federations
            .lock()
            .await
            .remove(&federation_id_str.to_string())
        else {
            bail!("federation must be present in state");
        };

        if let FederationMaybeLoading::Ready(federation) = federation {
            if let Err(error) = federation
                .task_group
                .clone()
                .shutdown_join_all(Some(Duration::from_secs(20)))
                .await
            {
                warn!(%error, "failed to shutdown task group cleanly");
            }

            if fedimint_core::task::timeout(
                Duration::from_secs(20),
                Self::wait_till_fully_dropped(federation),
            )
            .await
            .is_err()
            {
                info!("failed to drop federation, not deleting the database");
                return Ok(());
            }
        }

        match removed_federation_info.database {
            DatabaseInfo::DatabaseName(name) => {
                self.storage.delete_federation_db(&name).await?;
            }
            DatabaseInfo::DatabasePrefix(prefix) => {
                let mut dbtx = self.global_db.begin_transaction().await;
                dbtx.raw_remove_by_prefix(&prefix.consensus_encode_to_vec())
                    .await?;
                dbtx.commit_tx().await;
            }
        }

        Ok(())
    }

    // FIXME: doesn't need result
    async fn get_social_recovery_state(&self) -> anyhow::Result<Option<SocialRecoveryState>> {
        Ok(self
            .app_state
            .with_read_lock(|state| state.social_recovery_state.clone())
            .await)
    }

    async fn set_social_recovery_state(
        &self,
        social_recovery_state: Option<SocialRecoveryState>,
    ) -> anyhow::Result<()> {
        self.app_state
            .with_write_lock(|state| {
                state.social_recovery_state = social_recovery_state;
            })
            .await
    }

    pub async fn get_mnemonic_words(&self) -> anyhow::Result<Vec<String>> {
        Ok(self
            .app_state
            .root_mnemonic()
            .await
            .word_iter()
            .map(|x| x.to_owned())
            .collect())
    }

    pub async fn update_cached_fiat_fx_info(&self, info: FiatFXInfo) -> anyhow::Result<()> {
        self.app_state
            .with_write_lock(|state| state.cached_fiat_fx_info = Some(info))
            .await
    }

    /// Enable logging of potentially sensitive information.
    pub async fn sensitive_log(&self) -> bool {
        self.app_state
            .with_read_lock(|f| f.sensitive_log.unwrap_or(false))
            .await
    }

    pub async fn set_sensitive_log(&self, enable: bool) -> anyhow::Result<()> {
        self.app_state
            .with_write_lock(|f| {
                f.sensitive_log = Some(enable);
            })
            .await?;
        Ok(())
    }

    pub async fn fetch_registered_devices(&self) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
        let mnemonic = self.app_state.root_mnemonic().await;
        let registered_devices_fut = device_registration::get_registered_devices_with_backoff(
            self.fedi_api.clone(),
            mnemonic,
        );
        let registered_devices =
            fedimint_core::task::timeout(Duration::from_secs(120), registered_devices_fut)
                .await
                .context("fetching registered devices timed out")??
                .into_iter()
                .map(Into::into)
                .collect();
        Ok(registered_devices)
    }

    pub async fn register_device_with_index(
        &self,
        index: u8,
        force_overwrite: bool,
    ) -> anyhow::Result<Option<RpcFederation>> {
        let seed = self.app_state.root_mnemonic().await;
        let identifier = self.app_state.device_identifier().await;
        let identifier = identifier.ok_or(anyhow!("device identifier must be present"))?;
        let enc_identifier = self.app_state.encrypted_device_identifier().await?;
        let register_device_fut = device_registration::register_device_with_backoff(
            self.app_state.clone(),
            self.fedi_api.clone(),
            self.event_sink.clone(),
            seed,
            index,
            identifier,
            enc_identifier,
            force_overwrite,
        );
        fedimint_core::task::timeout(Duration::from_secs(120), register_device_fut)
            .await
            .context("registering device timed out")??;

        self.app_state.set_device_index(index).await?;
        self.device_registration_service
            .lock()
            .await
            .start_ongoing_periodic_registration(index, &self.task_group, self.event_sink.clone())
            .await?;

        if self
            .app_state
            .with_read_lock(|state| state.social_recovery_state.clone())
            .await
            .is_some()
        {
            let recovery_client = self.social_recovery_client_continue().await?;

            self.set_social_recovery_state(None).await?;
            tracing::info!("social recovery complete");
            tracing::info!("auto joining federation");
            self.join_federation(
                federation_v2::invite_code_from_client_confing(
                    &ClientConfig::consensus_decode_hex(
                        &recovery_client.state().client_config,
                        &Default::default(),
                    )?,
                )
                .to_string(),
                false,
            )
            .await
            .map(Some)
        } else {
            Ok(None)
        }
    }

    pub async fn device_index_assignment_status(
        &self,
    ) -> anyhow::Result<RpcDeviceIndexAssignmentStatus> {
        Ok(match self.app_state.ensure_device_index().await {
            Ok(index) => RpcDeviceIndexAssignmentStatus::Assigned(index),
            Err(_) => RpcDeviceIndexAssignmentStatus::Unassigned,
        })
    }

    // FIXME: this function has weird name now that it doesn't do any recovery
    pub async fn recover_from_mnemonic(
        &self,
        mnemonic: bip39::Mnemonic,
    ) -> Result<Vec<RpcRegisteredDevice>> {
        self.device_registration_service
            .lock()
            .await
            .stop_ongoing_periodic_registration()
            .await?;
        self.app_state.recover_mnemonic(mnemonic).await?;
        self.fetch_registered_devices().await
    }

    pub async fn upload_backup_file(
        &self,
        federation_id: RpcFederationId,
        video_file_path: PathBuf,
    ) -> Result<PathBuf> {
        let federation = self.get_federation(&federation_id.0).await?;
        let storage = self.storage.clone();
        // if remote bridge, copy with adb? maybe storage trait could do this?
        let video_file = storage
            .read_file(&video_file_path)
            .await?
            .ok_or(anyhow!("video file not found"))?;
        let root_mnemonic = self.app_state.root_mnemonic().await;
        let recovery_file = federation
            .upload_backup_file(video_file, root_mnemonic)
            .await?;
        storage
            .write_file(RECOVERY_FILENAME.as_ref(), recovery_file)
            .await?;
        Ok(storage.platform_path(RECOVERY_FILENAME.as_ref()))
    }

    pub async fn start_social_recovery_v2(
        &self,
        recovery_file: RecoveryFile,
    ) -> anyhow::Result<()> {
        let social_instance_id = *recovery_file
            .client_config
            .modules
            .iter()
            .find(|(_, module_config)| module_config.is_kind(&fedi_social_client::KIND))
            .context("social module not available in recovery config")?
            .0;
        let decoders = ModuleDecoderRegistry::from_iter(vec![(
            social_instance_id,
            fedi_social_client::KIND,
            FediSocialCommonGen::decoder(),
        )]);
        let config = recovery_file
            .client_config
            .clone()
            .redecode_raw(&decoders)?;
        let (social_module_id, social_cfg) = config
            .get_first_module_by_kind::<fedi_social_client::config::FediSocialClientConfig>(
                "fedi-social",
            )
            .expect("needs social recovery module client config");

        let social_api = DynGlobalApi::from_endpoints(
            config
                .global
                .api_endpoints
                .iter()
                .map(|(peer_id, peer_url)| (*peer_id, peer_url.url.clone())),
            &None, // FIXME: api secret
        )
        .with_module(social_module_id);
        let client = SocialRecoveryClient::new_start(
            social_module_id,
            social_cfg.clone(),
            social_api,
            recovery_file.clone(),
        )?;

        // request social recovery verification with the federation
        let verification_request =
            client.create_verification_request(recovery_file.verification_document.clone())?;
        client
            .upload_verification_request(&verification_request)
            .await
            .context("upload verification request")?;

        self.set_social_recovery_state(Some(client.state().clone()))
            .await?;
        Ok(())
    }

    pub async fn recovery_qr(&self) -> anyhow::Result<Option<SocialRecoveryQr>> {
        if let Some(state) = self.get_social_recovery_state().await? {
            Ok(Some(SocialRecoveryQr {
                recovery_id: RpcRecoveryId(state.recovery_id()),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn cancel_social_recovery(&self) -> anyhow::Result<()> {
        self.set_social_recovery_state(None).await?;
        Ok(())
    }

    // TODO: rename this to start_social_recovery
    pub async fn validate_recovery_file(&self, recovery_file_path: PathBuf) -> Result<()> {
        // Only allow recovery when there are no joined federations
        if !self.federations.lock().await.is_empty() {
            bail!("Cannot recover while joined federations exist");
        }

        // These 2 lines validate
        let recovery_file_bytes = self
            .storage
            .read_file(&recovery_file_path)
            .await?
            .ok_or(anyhow!("recovery file not found"))?;
        let recovery_file = RecoveryFile::from_bytes(&recovery_file_bytes)
            .context(ErrorCode::InvalidSocialRecoveryFile)?;

        // this starts a social recovery "session" ... what this means is kinda
        // handwavvy
        self.start_social_recovery_v2(recovery_file).await?;
        Ok(())
    }

    pub async fn complete_social_recovery(&self) -> Result<Vec<RpcRegisteredDevice>> {
        let recovery_client = self.social_recovery_client_continue().await?;
        let seed_phrase = recovery_client.combine_recovered_user_phrase()?;
        let root_mnemonic = bip39::Mnemonic::parse(seed_phrase.0)?;
        self.recover_from_mnemonic(root_mnemonic).await
    }

    async fn social_recovery_client_continue(&self) -> anyhow::Result<SocialRecoveryClient> {
        let social_state = self
            .get_social_recovery_state()
            .await?
            .context(ErrorCode::BadRequest)?;
        let config: ClientConfig =
            ClientConfig::consensus_decode_hex(&social_state.client_config, &Default::default())?;
        let social_instance_id = *config
            .modules
            .iter()
            .find(|(_, module_config)| module_config.is_kind(&fedi_social_client::KIND))
            .context("social module not available in recovery config")?
            .0;
        let decoders = ModuleDecoderRegistry::from_iter(vec![(
            social_instance_id,
            fedi_social_client::KIND,
            FediSocialCommonGen::decoder(),
        )]);
        let config = config.redecode_raw(&decoders)?;
        let (social_module_id, social_cfg) = config
            .get_first_module_by_kind::<fedi_social_client::config::FediSocialClientConfig>(
                "fedi-social",
            )
            .expect("needs social recovery module client config");
        let social_api = DynGlobalApi::from_endpoints(
            config
                .global
                .api_endpoints
                .iter()
                .map(|(peer_id, peer_url)| (*peer_id, peer_url.url.clone())),
            &None, // FIXME: api secret
        )
        .with_module(social_module_id);
        let recovery_client = SocialRecoveryClient::new_continue(
            social_module_id,
            social_cfg.clone(),
            social_api,
            social_state.clone(),
        );
        Ok(recovery_client)
    }

    pub async fn social_recovery_approvals(&self) -> Result<SocialRecoveryEvent> {
        let mut recovery_client = self.social_recovery_client_continue().await?;

        let client_config = ClientConfig::consensus_decode_hex(
            &recovery_client.state().client_config,
            &ModuleDecoderRegistry::from_iter(vec![]),
        )?;
        let guardian_peer_ids: Vec<(String, PeerId)> = client_config
            .global
            .api_endpoints
            .into_iter()
            .map(|(peer_id, endpoint)| (endpoint.name, peer_id))
            .collect();
        let mut approvals = vec![];
        for (guardian_name, peer_id) in guardian_peer_ids {
            let approved = recovery_client
                .get_decryption_share_from(peer_id)
                .await
                .unwrap_or_else(|_| {
                    debug!("failed to get decryption share from peer {}", peer_id);
                    false
                });
            approvals.push(SocialRecoveryApproval {
                guardian_name,
                approved,
            });
        }

        // calculate approvals remaining
        let approvals_required = required_threashold_of(approvals.len());
        let num_approvals = approvals.iter().filter(|a| a.approved).count();
        let remaining = approvals_required.saturating_sub(num_approvals);

        // Save progress to DB
        self.set_social_recovery_state(Some(recovery_client.state().clone()))
            .await?;
        let result = SocialRecoveryEvent {
            approvals,
            remaining,
        };
        Ok(result)
    }

    pub async fn download_verification_doc(
        &self,
        federation_id: RpcFederationId,
        recovery_id: RpcRecoveryId,
        peer_id: RpcPeerId,
    ) -> Result<Option<PathBuf>> {
        let federation = self.get_federation(&federation_id.0).await?;
        let verification_doc = federation
            .download_verification_doc(&recovery_id.0, peer_id.0)
            .await?;
        if let Some(verification_doc) = verification_doc {
            self.storage
                .write_file(VERIFICATION_FILENAME.as_ref(), verification_doc)
                .await?;
            tracing::info!("saved verificaiton doc");
            Ok(Some(
                self.storage.platform_path(VERIFICATION_FILENAME.as_ref()),
            ))
        } else {
            Ok(None)
        }
    }

    pub async fn approve_social_recovery_request(
        &self,
        federation_id: RpcFederationId,
        recovery_id: RpcRecoveryId,
        peer_id: RpcPeerId,
        password: String,
    ) -> Result<()> {
        let federation = self.get_federation(&federation_id.0).await?;
        federation
            .approve_social_recovery_request(&recovery_id.0, peer_id.0, &password)
            .await
    }

    pub async fn sign_lnurl_message(
        &self,
        message: Message,
        domain: String,
    ) -> Result<RpcSignedLnurlMessage> {
        let secp = Secp256k1::new();
        let lnurl_secret = self
            .app_state
            .root_secret()
            .await
            .child_key(ChildId(LNURL_CHILD_ID));
        let lnurl_secret_bytes: [u8; 32] = lnurl_secret.to_random_bytes();
        let lnurl_domain_secret = DerivableSecret::new_root(&lnurl_secret_bytes, domain.as_bytes());
        let lnurl_domain_keypair = lnurl_domain_secret.to_secp_key(&secp);
        let lnurl_domain_pubkey = lnurl_domain_keypair.public_key();
        let signature = secp.sign_ecdsa(&message, &lnurl_domain_keypair.secret_key());
        Ok(RpcSignedLnurlMessage {
            signature,
            pubkey: RpcPublicKey(lnurl_domain_pubkey),
        })
    }

    pub async fn get_nostr_pubkey(&self) -> Result<RpcNostrPubkey> {
        let nostr_pubkey = self.nostr_pubkey().await;
        let data = nostr_pubkey.serialize().to_base32();
        Ok(RpcNostrPubkey {
            npub: bech32::encode("npub", data, bech32::Variant::Bech32)?,
            hex: nostr_pubkey.to_string(),
        })
    }

    async fn nostr_pubkey(&self) -> XOnlyPublicKey {
        let global_root_secret = self.app_state.root_secret().await;
        let secp = Secp256k1::new();
        let nostr_secret = global_root_secret.child_key(ChildId(NOSTR_CHILD_ID));
        let nostr_keypair = nostr_secret.to_secp_key(&secp);

        nostr_keypair.x_only_public_key().0
    }

    pub async fn get_nostr_secret(&self) -> Result<RpcNostrSecret> {
        let secp = Secp256k1::new();
        let bytes = self.nostr_secret_key(&secp).await?.secret_bytes();
        let nsec = bech32::encode("nsec", bytes.to_base32(), bech32::Variant::Bech32)?;
        let hex = hex::encode(bytes);

        Ok(RpcNostrSecret { hex, nsec })
    }

    async fn nostr_secret_key<Ctx: bitcoin::secp256k1::Context + bitcoin::secp256k1::Signing>(
        &self,
        secp: &Secp256k1<Ctx>,
    ) -> anyhow::Result<KeyPair> {
        let global_root_secret = self.app_state.root_secret().await;
        let nostr_secret = global_root_secret.child_key(ChildId(NOSTR_CHILD_ID));
        let nostr_keypair = nostr_secret.to_secp_key(secp);

        Ok(nostr_keypair)
    }

    pub async fn sign_nostr_event(&self, event_hash: String) -> Result<String> {
        let global_root_secret = self.app_state.root_secret().await;
        let secp = Secp256k1::new();
        let nostr_secret = global_root_secret.child_key(ChildId(NOSTR_CHILD_ID));
        let nostr_keypair = nostr_secret.to_secp_key(&secp);
        let data = &hex::decode(event_hash)?;
        let message = Message::from_slice(data)?;
        let sig = secp.sign_schnorr(&message, &nostr_keypair);
        // Return hex-encoded string
        Ok(format!("{}", sig))
    }

    pub async fn get_matrix_secret(&self) -> DerivableSecret {
        let global_root_secret = self.app_state.root_secret().await;
        global_root_secret.child_key(ChildId(MATRIX_CHILD_ID))
    }

    pub async fn get_matrix_media_file(&self, path: PathBuf) -> Result<Vec<u8>> {
        let media_file = self
            .storage
            .read_file(&path)
            .await?
            .ok_or(anyhow!("media file not found"))?;
        Ok(media_file)
    }

    pub async fn set_module_fedi_fee_schedule(
        &self,
        federation_id: RpcFederationId,
        module_kind: ModuleKind,
        send_ppm: u64,
        receive_ppm: u64,
    ) -> Result<()> {
        self.fedi_fee_helper
            .set_module_fee_schedule(
                federation_id.0,
                module_kind,
                ModuleFediFeeSchedule {
                    send_ppm,
                    receive_ppm,
                },
            )
            .await
    }
}
