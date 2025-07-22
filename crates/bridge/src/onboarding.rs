use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context as _};
use fedi_social_client::SocialRecoveryState;
use fedimint_core::db::Database;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::retry;
use rpc_types::RpcRegisteredDevice;
use runtime::api::{IFediApi, RegisterDeviceError};
use runtime::event::EventSink;
use runtime::features::FeatureCatalog;
use runtime::storage::state::{DeviceIdentifier, OnboardingStage};
use runtime::storage::{AppStateOnboarding, OnboardingCompletionMethod, Storage};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use ts_rs::TS;

mod social_recovery;

use crate::{Bridge, BridgeState};

pub struct BridgeOnboarding {
    // this state will None after onboarding complete
    state: Mutex<Option<AppStateOnboarding>>,
    fedi_api: Arc<dyn IFediApi>,
    // saved for transitioning into full
    storage: Storage,
    event_sink: EventSink,
    feature_catalog: Arc<FeatureCatalog>,
    device_identifier: DeviceIdentifier,
    global_db: Database,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcOnboardingStage {
    /// user hasn't taken any action
    Init,
    SocialRecovery,
    /// user needs to select a device index
    DeviceIndexSelection,
}

impl BridgeOnboarding {
    pub fn new(
        state: AppStateOnboarding,
        fedi_api: Arc<dyn IFediApi>,
        storage: Storage,
        global_db: Database,
        event_sink: EventSink,
        feature_catalog: Arc<FeatureCatalog>,
        device_identifier: DeviceIdentifier,
    ) -> Self {
        Self {
            state: Mutex::new(Some(state)),
            fedi_api,
            storage,
            global_db,
            event_sink,
            feature_catalog,
            device_identifier,
        }
    }

    pub async fn stage(&self) -> anyhow::Result<RpcOnboardingStage> {
        let state = self.state.lock().await;
        let Some(state) = state.as_ref() else {
            bail!("already completed onboarding");
        };
        let stage = match state.stage().await {
            OnboardingStage::Init {} => RpcOnboardingStage::Init,
            OnboardingStage::SocialRecovery { .. } => RpcOnboardingStage::SocialRecovery,
            OnboardingStage::DeviceIndexSelection { .. } => {
                RpcOnboardingStage::DeviceIndexSelection
            }
        };
        Ok(stage)
    }

    pub async fn social_recovery_start_or_update(
        &self,
        social_state: SocialRecoveryState,
    ) -> anyhow::Result<()> {
        let state = self.state.lock().await;
        let Some(state) = state.as_ref() else {
            bail!("already completed onboarding");
        };
        state.social_recovery_start_or_update(social_state).await
    }

    pub async fn social_recovery_cancel(&self) -> anyhow::Result<()> {
        let state = self.state.lock().await;
        let Some(state) = state.as_ref() else {
            bail!("already completed onboarding");
        };
        state.social_recovery_cancel().await?;
        Ok(())
    }

    pub async fn restore_mnemonic(&self, mnemonic: bip39::Mnemonic) -> anyhow::Result<()> {
        let state = self.state.lock().await;
        let Some(state) = state.as_ref() else {
            bail!("already completed onboarding");
        };
        state
            .restore_mnemonic(mnemonic, self.device_identifier.clone())
            .await
    }

    pub(crate) async fn complete_onboarding(
        &self,
        method: OnboardingCompletionMethod,
    ) -> anyhow::Result<BridgeState> {
        let mut state = self.state.lock().await;
        // leave None in option
        let Some(stolen_state) = state.take() else {
            panic!("duplicate call to complete onboarding");
        };
        match stolen_state
            .complete_onboarding(method, self.device_identifier.clone())
            .await
        {
            Ok(new_state) => {
                Bridge::try_load_bridge_full(
                    self.storage.clone(),
                    self.global_db.clone(),
                    self.event_sink.clone(),
                    self.fedi_api.clone(),
                    new_state,
                    self.feature_catalog.clone(),
                    self.device_identifier.clone(),
                )
                .await
            }
            Err((given_back_state, err)) => {
                // put back the stolen stuff
                *state = Some(given_back_state);
                Err(err)
            }
        }
    }

    pub async fn fetch_registered_devices(&self) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
        let state = self.state.lock().await;
        let Some(state) = state.as_ref() else {
            bail!("already completed onboarding");
        };
        let OnboardingStage::DeviceIndexSelection { root_mnemonic, .. } = state.stage().await
        else {
            bail!("illegal state for fetch registered device");
        };
        let registered_devices_fut = device_registration::get_registered_devices_with_backoff(
            self.fedi_api.clone(),
            root_mnemonic,
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
        device_index: u8,
        force_overwrite: bool,
    ) -> anyhow::Result<()> {
        {
            let state = self.state.lock().await;
            let Some(state) = state.as_ref() else {
                bail!("already completed onboarding");
            };
            let OnboardingStage::DeviceIndexSelection {
                root_mnemonic,
                encrypted_device_identifier,
                ..
            } = state.stage().await
            else {
                bail!("illegal state for fetch registered device");
            };

            retry("register for seed", aggressive_backoff(), || async {
                match self
                    .fedi_api
                    .register_device_for_seed(
                        root_mnemonic.clone(),
                        device_index,
                        encrypted_device_identifier.clone(),
                        force_overwrite,
                    )
                    .await
                {
                    Ok(()) => Ok(Ok(())),
                    Err(e @ RegisterDeviceError::AnotherDeviceOwnsIndex(..)) => {
                        Ok(Err(anyhow::format_err!(e)))
                    }
                    Err(e) => Err(anyhow::format_err!(e)),
                }
            })
            .await??;
        }

        Ok(())
        // if self
        //     .runtime
        //     .app_state
        //     .with_read_lock(|state| state.social_recovery_state.clone())
        //     .await
        //     .is_some()
        // {
        //     let recovery_client =
        // self.social_recovery_client_continue().await?;

        //     self.set_social_recovery_state(None).await?;
        //     tracing::info!("social recovery complete");
        //     tracing::info!("auto joining federation");
        //     let fed_arc = self
        //         .federations
        //         .join_federation(
        //             federation_v2::invite_code_from_client_confing(
        //                 &ClientConfig::consensus_decode_hex(
        //                     &recovery_client.state().client_config,
        //                     &Default::default(),
        //                 )?,
        //             )
        //             .to_string(),
        //             false,
        //         )
        //         .await?;
        //     Ok(Some(fed_arc.to_rpc_federation().await))
        // } else {
        //     Ok(None)
        // }
    }
}
