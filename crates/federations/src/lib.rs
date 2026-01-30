use std::collections::{BTreeMap, HashMap};
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, bail};
use bitcoin::Network;
use device_registration::DeviceRegistrationService;
use federation_sm::{FederationState, FederationStateMachine};
use federation_v2::{FederationPrefetchedInfo, FederationV2};
use federations_locker::FederationsLocker;
use fedimint_core::config::FederationIdPrefix;
use fedimint_core::invite_code::InviteCode;
use fedimint_mint_client::OOBNotes;
use futures::StreamExt;
use rpc_types::{RpcAmount, RpcEcashInfo, RpcFederationId, RpcFederationPreview};
use runtime::bridge_runtime::Runtime;
use runtime::storage::state::{FederationInfo, FediFeeSchedule};
use runtime::utils::{PoisonedLockExt as _, timeout_log_only};
use tracing::{error, warn};

use crate::federation_v2::{MultispendNotifications, SptNotifications};
use crate::fedi_fee::FediFeeHelper;

pub mod federation_sm;
pub mod federation_v2;
pub mod federations_locker;
pub mod fedi_fee;

pub struct Federations {
    runtime: Arc<Runtime>,
    pub fedi_fee_helper: Arc<FediFeeHelper>,
    federations: Mutex<BTreeMap<String, FederationStateMachine>>,
    federations_locker: FederationsLocker,
    multispend_services: Arc<dyn MultispendNotifications>,
    spt_notifications: Arc<dyn SptNotifications>,
    device_registration_service: Arc<DeviceRegistrationService>,
    last_federation_preview_info: Mutex<Option<FederationPrefetchedInfo>>,
}

impl Federations {
    pub fn new(
        runtime: Arc<Runtime>,
        multispend_services: Arc<dyn MultispendNotifications>,
        spt_notifications: Arc<dyn SptNotifications>,
        device_registration_service: Arc<DeviceRegistrationService>,
    ) -> Self {
        Federations {
            fedi_fee_helper: Arc::new(FediFeeHelper::new(runtime.clone())),
            runtime,
            federations: Default::default(),
            federations_locker: Default::default(),
            multispend_services,
            spt_notifications,
            device_registration_service,
            last_federation_preview_info: Mutex::new(None),
        }
    }

    pub async fn load_joined_federations_in_background(self: &Arc<Self>) {
        let joined_federations = self
            .runtime
            .app_state
            .with_read_lock(|state| state.joined_federations.clone())
            .await;

        let mut futures = Vec::new();
        let mut federations = self.federations.ensure_lock();
        for (federation_id, federation_info) in joined_federations {
            if federation_info.version < 2 {
                error!(version = federation_info.version, %federation_id, "Invalid federation version");
                continue;
            }
            let fed_sm = FederationStateMachine::prepare_for_load();
            federations.insert(federation_id.clone(), fed_sm.clone());

            let this = self.clone();
            let fed_id_clone = federation_id.clone();
            futures.push(timeout_log_only(
                async move {
                    load_federation(
                        this.runtime.clone(),
                        this.fedi_fee_helper.clone(),
                        &this.federations_locker,
                        federation_id.clone(),
                        federation_info,
                        this.multispend_services.clone(),
                        this.spt_notifications.clone(),
                        this.device_registration_service.clone(),
                        fed_sm,
                    )
                    .await
                },
                Duration::from_secs(10),
                move || {
                    error!(fed_id_clone, "found federation slow-loading culprit");
                },
            ));
        }
        drop(federations);

        self.runtime
            .task_group
            .clone()
            .spawn_cancellable("load federations", async move {
                futures::future::join_all(futures).await;
            });

        let this = self.clone();
        self.runtime.task_group.clone().spawn_cancellable(
            "fedi fee schedule fetcher",
            async move {
                this.fedi_fee_helper
                    .update_fee_schedule_continuously()
                    .await;
            },
        );

        let this = self.clone();
        self.runtime.task_group.clone().spawn_cancellable(
            "fedi fee schedule updater",
            async move {
                let mut updates = this.fedi_fee_helper.subscribe_to_updates();

                while let Some(maybe_new_schedule) = updates.next().await {
                    let Some(new_schedule_map) = maybe_new_schedule else {
                        continue;
                    };
                    this.update_fedi_fees_schedule(new_schedule_map).await
                }
            },
        );
    }

    pub async fn federation_preview(
        &self,
        invite_code: &str,
    ) -> anyhow::Result<RpcFederationPreview> {
        let root_mnemonic = self.runtime.app_state.root_mnemonic().await;
        let device_index = self.runtime.app_state.device_index().await;
        let info = FederationPrefetchedInfo::fetch(
            self.runtime.connectors.clone(),
            invite_code,
            &root_mnemonic,
            device_index,
            self.runtime.feature_catalog.override_localhost.is_some(),
        )
        .await?;
        let preview =
            FederationV2::federation_preview(&info, self.runtime.connectors.clone()).await;
        *self.last_federation_preview_info.ensure_lock() = Some(info);
        preview
    }

    /// Joins federation from invite code
    ///
    /// Federation ID saved to global database, new rocksdb database created for
    /// it, and it is saved to local hashmap by ID
    pub async fn join_federation(
        &self,
        invite_code_string: String,
        recover_from_scratch: bool,
    ) -> anyhow::Result<Arc<FederationV2>> {
        let invite_code = InviteCode::from_str(&invite_code_string.to_lowercase())?;
        let federation_id = invite_code.federation_id().to_string();
        let fed_sm = self
            .federations
            .lock()
            .expect("posoined")
            .entry(federation_id.clone())
            .or_insert_with(FederationStateMachine::prepare_for_join)
            .clone();

        let last_info = self.last_federation_preview_info.ensure_lock().take();
        let info = if let Some(last_info) = last_info
            && last_info.federation_id == invite_code.federation_id()
        {
            last_info
        } else {
            FederationPrefetchedInfo::fetch(
                self.runtime.connectors.clone(),
                &invite_code_string,
                &self.runtime.app_state.root_mnemonic().await,
                self.runtime.app_state.device_index().await,
                self.runtime.feature_catalog.override_localhost.is_some(),
            )
            .await?
        };
        let federation_arc = fed_sm
            .join(
                federation_id,
                info,
                self.runtime.clone(),
                &self.federations_locker,
                recover_from_scratch,
                &self.fedi_fee_helper,
                self.multispend_services.clone(),
                self.spt_notifications.clone(),
                self.device_registration_service.clone(),
            )
            .await?;
        Ok(federation_arc)
    }

    /// Look up federation by id from in-memory hashmap
    pub fn get_federation(&self, federation_id: &str) -> anyhow::Result<Arc<FederationV2>> {
        match self.get_federation_state(federation_id)? {
            FederationState::Ready(federation) => Ok(federation),
            FederationState::Recovering(_) => bail!("client is still recovering"),
            FederationState::Loading => bail!("Federation is still loading"),
            FederationState::Failed(e) => bail!("Federation failed to load: {}", e),
        }
    }

    /// Look up federation by id from in-memory hashmap
    pub fn get_federation_maybe_recovering(
        &self,
        federation_id: &str,
    ) -> anyhow::Result<Arc<FederationV2>> {
        match self.get_federation_state(federation_id)? {
            FederationState::Ready(federation) | FederationState::Recovering(federation) => {
                Ok(federation)
            }
            FederationState::Loading => bail!("Federation is still loading"),
            FederationState::Failed(e) => bail!("Federation failed to load: {}", e),
        }
    }

    pub fn get_federation_state(&self, federation_id: &str) -> anyhow::Result<FederationState> {
        self.federations
            .ensure_lock()
            .get(federation_id)
            .context("Federation not found")?
            .get_state()
            .context("Federation not found")
    }

    pub fn get_federations_map(&self) -> BTreeMap<String, FederationState> {
        self.federations
            .ensure_lock()
            .clone()
            .iter()
            .filter_map(|(id, fed_sm)| fed_sm.get_state().map(|state| (id.clone(), state)))
            .collect()
    }

    pub async fn leave_federation(&self, federation_id_str: &str) -> anyhow::Result<()> {
        let fed_sm = self
            .federations
            .ensure_lock()
            .get(federation_id_str)
            .context("Federation not found")?
            .clone();
        fed_sm
            .leave(&self.runtime.storage, &self.runtime.global_db)
            .await?;
        Ok(())
    }

    pub fn find_federation_id_for_prefix(&self, prefix: FederationIdPrefix) -> Option<String> {
        let prefix = prefix.to_string();
        self.get_federations_map()
            .keys()
            .find(|x| x.starts_with(&prefix))
            .cloned()
    }

    pub async fn validate_ecash(&self, ecash: String) -> anyhow::Result<RpcEcashInfo> {
        let oob = OOBNotes::from_str(&ecash)?;
        let id = self.find_federation_id_for_prefix(oob.federation_id_prefix());
        match id {
            Some(id) => Ok(RpcEcashInfo::Joined {
                federation_id: RpcFederationId(id),
                amount: RpcAmount(oob.total_amount()),
            }),
            None => Ok(RpcEcashInfo::NotJoined {
                federation_invite: oob.federation_invite().map(|invite| invite.to_string()),
                amount: RpcAmount(oob.total_amount()),
            }),
        }
    }

    async fn update_fedi_fees_schedule(&self, new_schedule: HashMap<Network, FediFeeSchedule>) {
        let app_state_update_res = self
            .runtime
            .app_state
            .with_write_lock(|state| {
                state.joined_federations.iter_mut().for_each(|(id, info)| {
                    // Only proceed if we know this federation's network
                    let Some(network) = info.network else {
                        warn!(%id, "Federation's network is not stored on disk");
                        return;
                    };

                    // Only proceed if we have fetched a fee schedule for the fed's network
                    // For any network other than mainnet, use the signet fee schedule
                    let fedi_fee_schedule = match network {
                        Network::Bitcoin => new_schedule.get(&network),
                        _ => new_schedule.get(&Network::Signet),
                    };
                    let Some(fedi_fee_schedule) = fedi_fee_schedule else {
                        return;
                    };

                    info.fedi_fee_schedule = fedi_fee_schedule.clone();
                })
            })
            .await;

        if let Err(error) = app_state_update_res {
            error!(
                ?error,
                "Failed to update app state with new fedi fee schedule"
            )
        }
    }
}

#[tracing::instrument(skip_all, err, fields(federation_id = federation_id_str))]
#[allow(clippy::too_many_arguments)]
async fn load_federation(
    runtime: Arc<Runtime>,
    fedi_fee_helper: Arc<FediFeeHelper>,
    federations_locker: &FederationsLocker,
    federation_id_str: String,
    federation_info: FederationInfo,
    multispend_services: Arc<dyn MultispendNotifications>,
    spt_notifications: Arc<dyn SptNotifications>,
    device_registration_service: Arc<DeviceRegistrationService>,
    fed_sm: FederationStateMachine,
) -> anyhow::Result<()> {
    fed_sm
        .load_from_db(
            federation_id_str,
            runtime,
            federation_info,
            federations_locker,
            &fedi_fee_helper,
            multispend_services,
            spt_notifications,
            device_registration_service,
        )
        .await;
    Ok(())
}
