use std::collections::BTreeMap;
use std::str::FromStr;
use std::sync::{Arc, Mutex};

use anyhow::{bail, Context};
use federation_sm::{FederationState, FederationStateMachine};
use federation_v2::FederationV2;
use federations_locker::FederationsLocker;
use fedimint_core::invite_code::InviteCode;
use tracing::error;

use crate::bridge::BridgeRuntime;
use crate::fedi_fee::FediFeeHelper;
use crate::storage::FederationInfo;
use crate::types::RpcFederationPreview;
use crate::utils::PoisonedLockExt as _;

pub mod federation_sm;
pub mod federation_v2;
pub mod federations_locker;

#[derive(Clone)]
pub struct Federations {
    runtime: Arc<BridgeRuntime>,
    fedi_fee_helper: Arc<FediFeeHelper>,
    federations: Arc<Mutex<BTreeMap<String, FederationStateMachine>>>,
    federations_locker: FederationsLocker,
}

impl Federations {
    pub fn new(runtime: Arc<BridgeRuntime>, fedi_fee_helper: Arc<FediFeeHelper>) -> Self {
        Federations {
            runtime,
            fedi_fee_helper,
            federations: Default::default(),
            federations_locker: Default::default(),
        }
    }

    pub async fn load_joined_federations_in_background(&self) {
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

            futures.push(load_federation(
                self.runtime.clone(),
                self.fedi_fee_helper.clone(),
                self.federations_locker.clone(),
                federation_id.clone(),
                federation_info,
                fed_sm,
            ));
        }
        drop(federations);

        // FIXME: update after each federation is loaded.
        let this = self.clone();
        self.runtime.task_group.clone().spawn_cancellable(
            "load federation and update fedi fee schedule",
            async move {
                futures::future::join_all(futures).await;
                this.update_fedi_fees_schedule().await;
            },
        );
    }

    pub async fn federation_preview(
        &self,
        invite_code: &str,
    ) -> anyhow::Result<RpcFederationPreview> {
        let invite_code = invite_code.to_lowercase();
        let root_mnemonic = self.runtime.app_state.root_mnemonic().await;
        let device_index = self.runtime.app_state.ensure_device_index().await?;
        FederationV2::federation_preview(
            &invite_code,
            &root_mnemonic,
            device_index,
            self.runtime.feature_catalog.override_localhost.is_some(),
        )
        .await
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
        let federation_arc = fed_sm
            .join(
                federation_id,
                invite_code_string,
                self.runtime.clone(),
                &self.federations_locker,
                recover_from_scratch,
                &self.fedi_fee_helper,
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

    async fn update_fedi_fees_schedule(&self) {
        // Spawn a new task to asynchronously fetch the fee schedule and update app
        // state
        let fed_network_map = self
            .federations
            .ensure_lock()
            .iter()
            .filter_map(|(id, fed_sm)| match fed_sm.get_state() {
                Some(FederationState::Ready(fed) | FederationState::Recovering(fed)) => {
                    Some((id.clone(), fed.get_network()?))
                }
                _ => None,
            })
            .collect();

        self.fedi_fee_helper
            .fetch_and_update_fedi_fee_schedule(fed_network_map)
            .await;
    }
}

#[tracing::instrument(skip_all, err, fields(federation_id = federation_id_str))]
async fn load_federation(
    runtime: Arc<BridgeRuntime>,
    fedi_fee_helper: Arc<FediFeeHelper>,
    federations_locker: FederationsLocker,
    federation_id_str: String,
    federation_info: FederationInfo,
    fed_sm: FederationStateMachine,
) -> anyhow::Result<()> {
    fed_sm
        .load_from_db(
            federation_id_str,
            runtime,
            federation_info,
            &federations_locker,
            &fedi_fee_helper,
        )
        .await;
    Ok(())
}
