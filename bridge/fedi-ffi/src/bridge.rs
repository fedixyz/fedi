use std::collections::BTreeMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use bitcoin::bech32::{self, ToBase32};
use bitcoin::secp256k1::{Message, Secp256k1};
use fedi_social_client::{
    self, FediSocialCommonGen, RecoveryFile, SocialRecoveryClient, SocialRecoveryState,
};
use fedimint_core::api::{DynGlobalApi, InviteCode};
use fedimint_core::config::ClientConfig;
use fedimint_core::core::ModuleKind;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCore};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::module::CommonModuleInit;
use fedimint_core::task::TaskGroup;
use fedimint_core::PeerId;
use fedimint_derive_secret::{ChildId, DerivableSecret};
use futures::future::join_all;
use tokio::sync::{Mutex, OnceCell};
use tracing::{debug, error, info, info_span, warn, Instrument};

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
    AppState, DatabaseInfo, FederationInfo, FediFeeSchedule, ModuleFediFeeSchedule,
};
use crate::types::{
    RpcBridgeStatus, RpcDeviceIndexAssignmentStatus, RpcFederationPreview, RpcRegisteredDevice,
    RpcReturningMemberStatus,
};
use crate::utils::required_threashold_of;

// FIXME: federation-specific filename
pub const RECOVERY_FILENAME: &str = "backup.fedi";
pub const VERIFICATION_FILENAME: &str = "verification.mp4";

/// This is instantiated once as a global. When RPC commands come in, this
/// struct is used as a router to look up the federation and handle the RPC
/// command using it.
#[derive(Clone)]
pub struct Bridge {
    pub storage: Storage,
    pub app_state: Arc<AppState>,
    pub federations: Arc<Mutex<BTreeMap<String, Arc<FederationV2>>>>,
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
            task_group.make_subgroup().await,
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

        let root_mnemonic = app_state.root_mnemonic().await;

        let device_index = app_state.device_index().await;

        // load joined federations
        let joined_federations = app_state
            .with_read_lock(|state| state.joined_federations.clone())
            .await
            .into_iter()
            .collect::<Vec<_>>();

        let global_db = storage.federation_database_v2("global").await?;

        let federations = joined_federations
            .iter()
            // Ignore older version
            .filter(|(_, info)| info.version >= 2)
            .map(|(federation_id_str, federation_info)| {
                async {
                    Ok::<(String, Arc<FederationV2>), anyhow::Error>((
                        federation_id_str.clone(),
                        match federation_info.version {
                            2 => {
                                let db = match &federation_info.database {
                                    DatabaseInfo::DatabaseName(db_name) => {
                                        storage.federation_database_v2(db_name).await?
                                    }
                                    DatabaseInfo::DatabasePrefix(prefix) => {
                                        // use varint encoding so most of prefixes serialize to
                                        // single byte
                                        global_db.with_prefix(prefix.consensus_encode_to_vec())
                                    }
                                };
                                Arc::new(
                                    FederationV2::from_db(
                                        db,
                                        event_sink.clone(),
                                        task_group.make_subgroup().await,
                                        &root_mnemonic,
                                        // Always present when join federations exist
                                        device_index.context(
                                            "device index must exist when joined federations exist",
                                        )?,
                                        fedi_fee_helper.clone(),
                                        feature_catalog.clone(),
                                    )
                                    .await
                                    .with_context(|| {
                                        format!("loading federation {}", federation_id_str.clone())
                                    })?,
                                )
                            }
                            n => bail!("Invalid federation version {n}"),
                        },
                    ))
                }
                .instrument(info_span!("federation", federation_id = federation_id_str))
            });

        let federations = Arc::new(Mutex::new(
            futures::future::join_all(federations)
                .await
                .into_iter()
                .filter_map(|federation_res| match federation_res {
                    Ok((id, federation)) => Some((id, federation)),
                    Err(e) => {
                        error!("Could not initialize federation client: {e:?}");
                        None
                    }
                })
                .collect::<BTreeMap<_, _>>(),
        ));

        // Load communities module
        let communities = Communities::init(
            app_state.clone(),
            event_sink.clone(),
            task_group.make_subgroup().await,
        )
        .await
        .into();

        // Spawn a new task to asynchronously fetch the fee schedule and update app
        // state
        fedi_fee_helper
            .fetch_and_update_fedi_fee_schedule(
                federations
                    .lock()
                    .await
                    .iter()
                    .filter_map(|(id, fed)| Some((id.clone(), fed.get_network()?)))
                    .collect(),
            )
            .await;

        let bridge = Self {
            storage,
            app_state,
            federations,
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
        let federations = bridge.federations.lock().await.clone();
        for federation in federations.into_values() {
            Self::restart_federation_on_recovery(bridge.clone(), federation).await;
        }
        Ok(bridge)
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
    pub async fn restart_federation_on_recovery(this: Self, federation: Arc<FederationV2>) {
        if !federation.recovering() {
            return;
        }
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
                drop(federation_lock.remove(&federation_id));
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
                    this.task_group.make_subgroup().await,
                    &root_mnemonic,
                    device_index,
                    this.fedi_fee_helper.clone(),
                    this.feature_catalog.clone(),
                )
                .await
                .with_context(|| format!("loading federation {}", federation_id.clone()))?;
                let fed_network = federation_v2.get_network();
                federation_lock.insert(federation_id.clone(), Arc::new(federation_v2));
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
    pub async fn join_federation(&self, invite_code_string: String) -> Result<RpcFederation> {
        let invite_code = invite_code_string.to_lowercase();
        // FIXME: this is kinda unreliable
        let mut error_code = None;
        match self.join_federation_inner(invite_code.clone()).await {
            Ok(federation) => {
                info!("Joined v2 federation");
                return Ok(federation_v2_to_rpc_federation(&federation).await);
            }
            Err(e) => {
                error!("failed to join v2 federation {e:?}");
                error_code = error_code.or(get_error_code(&e));
            }
        }
        if let Some(error_code) = error_code {
            bail!(error_code);
        }
        bail!("failed to join")
    }

    async fn join_federation_inner(&self, invite_code_string: String) -> Result<Arc<FederationV2>> {
        // Check if we've already joined this federation
        let invite_code = InviteCode::from_str(&invite_code_string)?;
        if self
            .get_federation_maybe_recovering(&invite_code.federation_id().to_string())
            .await
            .is_ok()
        {
            bail!(ErrorCode::AlreadyJoined)
        }

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
            self.task_group.make_subgroup().await,
            db,
            &root_mnemonic,
            device_index,
            self.fedi_fee_helper.clone(),
            self.feature_catalog.clone(),
        )
        .await?;
        let federation_id = federation.federation_id();
        let mut federations = self.federations.lock().await;

        // If the phone dies here, it's still ok because the federation wouldn't
        // exist in the app_state, and we'd reattempt to join it. And the name of the
        // DB file is random so there shouldn't be any collisions.
        self.app_state
            .with_write_lock(|state| {
                state.joined_federations.insert(
                    federation_id.to_string(),
                    FederationInfo {
                        version: 2,
                        database: DatabaseInfo::DatabasePrefix(db_prefix),
                        fedi_fee_schedule: FediFeeSchedule::default(),
                    },
                );
            })
            .await?;
        let federation_arc = Arc::new(federation);
        federations
            .entry(federation_id.to_string())
            .or_insert_with(|| federation_arc.clone());
        Self::restart_federation_on_recovery(self.clone(), federation_arc.clone()).await;

        // Spawn a new task to asynchronously fetch the fee schedule and update app
        // state
        self.fedi_fee_helper
            .fetch_and_update_fedi_fee_schedule(
                federations
                    .iter()
                    .filter_map(|(id, fed)| Some((id.clone(), fed.get_network()?)))
                    .collect(),
            )
            .await;

        Ok(federation_arc)
    }

    pub async fn federation_preview(&self, invite_code: &str) -> Result<RpcFederationPreview> {
        let invite_code = invite_code.to_lowercase();
        let root_mnemonic = self.app_state.root_mnemonic().await;
        let device_index = self.app_state.ensure_device_index().await?;
        let (v2,) = futures::join!(FederationV2::download_client_config(
            &invite_code,
            &root_mnemonic,
            device_index,
            self.feature_catalog.override_localhost.is_some(),
        ));
        match (v2,) {
            (Ok((config, backup_snapshots_result)),) => Ok(RpcFederationPreview {
                id: RpcFederationId(config.global.calculate_federation_id().to_string()),
                name: config
                    .global
                    .federation_name()
                    .map(|x| x.to_owned())
                    .unwrap_or(
                        config.global.calculate_federation_id().to_string()[0..8].to_string(),
                    ),
                meta: config.global.meta,
                invite_code: invite_code.to_string(),
                version: 2,
                returning_member_status: match backup_snapshots_result.as_deref() {
                    Ok([]) => RpcReturningMemberStatus::NewMember,
                    Ok([_, ..]) => RpcReturningMemberStatus::ReturningMember,
                    Err(_) => RpcReturningMemberStatus::Unknown,
                },
            }),
            (Err(e),) => Err(e.context("Failed to connect")),
        }
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
        let lock = self.federations.lock().await;
        lock.get(federation_id)
            .cloned()
            .ok_or_else(|| anyhow!("Federation not found"))
    }

    pub async fn list_federations(&self) -> Vec<RpcFederation> {
        let federations = self.federations.lock().await.clone();
        join_all(federations.into_values().map(|federation| async move {
            federation_v2_to_rpc_federation(&federation.clone()).await
        }))
        .await
    }

    pub async fn leave_federation(&self, federation_id_str: &str) -> Result<()> {
        // check if federation exists and not recovering
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

        let social_api = DynGlobalApi::from_config(&config).with_module(social_module_id);
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
        let social_api = DynGlobalApi::from_config(&config).with_module(social_module_id);
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
    ) -> Result<Option<PathBuf>> {
        let federation = self.get_federation(&federation_id.0).await?;
        let verification_doc = federation.download_verification_doc(&recovery_id.0).await?;
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

    pub async fn get_nostr_pub_key_hex(&self) -> Result<String> {
        Ok(self.nostr_pubkey().await.to_string())
    }

    pub async fn get_nostr_pub_key(&self) -> Result<String> {
        let nostr_pubkey = self.nostr_pubkey().await;
        let data = nostr_pubkey.serialize().to_base32();
        Ok(bech32::encode("npub", data, bech32::Variant::Bech32)?)
    }

    async fn nostr_pubkey(&self) -> bitcoin::XOnlyPublicKey {
        let global_root_secret = self.app_state.root_secret().await;
        let secp = Secp256k1::new();
        let nostr_secret = global_root_secret.child_key(ChildId(NOSTR_CHILD_ID));
        let nostr_keypair = nostr_secret.to_secp_key(&secp);

        nostr_keypair.x_only_public_key().0
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
