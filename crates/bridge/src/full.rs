use std::fmt::Display;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Result, anyhow};
use bug_report::db_dump::DbDumpHeader;
use communities::Communities;
use device_registration::DeviceRegistrationService;
use federations::Federations;
use federations::federation_v2::FederationV2;
use fedi_decentralized_push_gateway_types::FcmRegistrationToken;
use fedimint_core::core::ModuleKind;
use multispend::services::MultispendServices;
use nostril::Nostril;
use rpc_types::fi_client::{
    RpcFiClientStatus, RpcFiCurrentLiquidityOperationResult, RpcFiEligiblePayersResult,
    RpcFiErrorCode, RpcFiFederationMetadataUpdate, RpcFiFormationIntent,
    RpcFiLiquidityDiscoveryResult, RpcFiLiquidityNetwork, RpcFiLiquidityOperationPageResult,
    RpcFiLiquidityOperationResult, RpcFiLiquidityRequestIntent, RpcFiOperationError,
    RpcFiOperationResult, RpcFiPushPlatform, RpcFiPushRegistrationResult,
    RpcFiReplacementPreviewResult, RpcFiSelectionPreviewRequest, RpcFiSelectionPreviewResult,
    RpcFiSetupPaymentFederationsResult,
};
use rpc_types::{RpcFederationId, RpcPeerId, RpcRecoveryId};
use runtime::bridge_runtime::Runtime;
use runtime::storage::state::{DeviceIdentifier, ModuleFediFeeSchedule};
use serde::Serialize;
use sp_transfer::services::SptServices;
use sp_transfer::services::transfer_complete_notifier::SptTransferCompleteNotifier;
use tracing::error;
use ts_rs::TS;

use crate::bg_matrix::BgMatrix;
use crate::fi_client::{
    BridgeFiClient, BridgeFiDriver, FiFederationHandoffLocks, fi_client_status_to_rpc,
    fi_error_to_rpc, fi_push_error_to_rpc, open_fi_client, start_fi_driver,
    start_fi_federation_auto_join, suppress_fi_federation_auto_join,
};
use crate::fi_push::{BridgeFiPushGateway, FiPushError, FiPushPlatform};
use crate::providers::{
    FederationProviderWrapper, MultispendNotificationsProvider, SptFederationProviderWrapper,
    SptNotificationsProvider,
};

// FIXME: federation-specific filename
pub const RECOVERY_FILENAME: &str = "backup.fedi";
pub const VERIFICATION_FILENAME: &str = "verification.mp4";

/// This struct encapulsates the feature services of the Bridge like
/// Federations or Communities etc.
pub struct BridgeFull {
    pub runtime: Arc<Runtime>,
    pub federations: Arc<Federations>,
    pub communities: Arc<Communities>,
    pub matrix: Arc<BgMatrix>,
    pub multispend_services: Arc<MultispendServices>,
    pub sp_transfers_services: Arc<SptServices>,
    pub device_registration_service: Arc<DeviceRegistrationService>,
    pub nostril: Arc<Nostril>,
    /// Dormant FI service. Initialization errors are retained without
    /// offboarding an otherwise healthy wallet.
    fi_client: std::result::Result<Arc<BridgeFiClient>, Arc<fi_client::FiError>>,
    /// Seed- and installation-bound client for Manifold's push gateway.
    fi_push_gateway: std::result::Result<Arc<BridgeFiPushGateway>, Arc<FiPushError>>,
    /// The sole owner of long-running FI formation, liquidity, and maintenance
    /// operations.
    pub(crate) fi_driver: Option<BridgeFiDriver>,
    fi_federation_handoff_locks: Arc<FiFederationHandoffLocks>,
}

#[derive(Debug, TS, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum BridgeOffboardingReason {
    DeviceIdentifierMismatch {
        #[serde(skip)]
        existing: DeviceIdentifier,
        #[serde(skip)]
        new: DeviceIdentifier,
    },
    InternalBridgeExport,
    DeviceIndexConflict,
}

impl Display for BridgeOffboardingReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DeviceIdentifierMismatch { existing, new } => write!(
                f,
                "Expected device ID {existing} but received {new}. Likely app has been cloned on a new device."
            ),
            Self::InternalBridgeExport => write!(f, "Bridge is ready for export"),
            Self::DeviceIndexConflict => write!(f, "Device index conflict detected"),
        }
    }
}

impl BridgeFull {
    pub async fn leave_federation(&self, federation_id: &str) -> anyhow::Result<()> {
        let _handoff_guard = self.fi_federation_handoff_locks.lock(federation_id).await;
        suppress_fi_federation_auto_join(&self.runtime, federation_id).await;
        self.federations.leave_federation(federation_id).await
    }

    pub fn fi_status_receiver(
        &self,
    ) -> Result<tokio::sync::watch::Receiver<fi_client::FiStatus>, RpcFiOperationError> {
        self.fi_client
            .as_ref()
            .map(|client| client.observe())
            .map_err(|_| self.fi_initialization_error())
    }

    pub fn fi_client_status(&self) -> RpcFiClientStatus {
        fi_client_status_to_rpc(&self.fi_client)
    }

    pub async fn fi_eligible_payers(&self) -> RpcFiEligiblePayersResult {
        match &self.fi_driver {
            Some(driver) => driver.eligible_payers().await,
            None => RpcFiEligiblePayersResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_setup_payment_federations(&self) -> RpcFiSetupPaymentFederationsResult {
        match &self.fi_driver {
            Some(driver) => driver.setup_payment_federations().await,
            None => RpcFiSetupPaymentFederationsResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_register_push_installation(
        &self,
        fcm_token: String,
        platform: RpcFiPushPlatform,
    ) -> RpcFiPushRegistrationResult {
        let gateway = match &self.fi_push_gateway {
            Ok(gateway) => gateway,
            Err(error) => {
                return RpcFiPushRegistrationResult::Error {
                    error: fi_push_error_to_rpc(error),
                };
            }
        };
        let platform = match platform {
            RpcFiPushPlatform::Android => FiPushPlatform::Android,
            RpcFiPushPlatform::Ios => FiPushPlatform::Ios,
        };
        match gateway
            .register_installation(FcmRegistrationToken(fcm_token), platform)
            .await
        {
            Ok(()) => RpcFiPushRegistrationResult::Registered {
                installation_id: gateway.installation_id().to_owned(),
            },
            Err(error) => RpcFiPushRegistrationResult::Error {
                error: fi_push_error_to_rpc(&error),
            },
        }
    }

    pub async fn fi_unregister_push_installation(&self) -> RpcFiPushRegistrationResult {
        let gateway = match &self.fi_push_gateway {
            Ok(gateway) => gateway,
            Err(error) => {
                return RpcFiPushRegistrationResult::Error {
                    error: fi_push_error_to_rpc(error),
                };
            }
        };
        match gateway.unregister_installation().await {
            Ok(()) => RpcFiPushRegistrationResult::Unregistered {
                installation_id: gateway.installation_id().to_owned(),
            },
            Err(error) => RpcFiPushRegistrationResult::Error {
                error: fi_push_error_to_rpc(&error),
            },
        }
    }

    pub async fn fi_liquidity_discover(
        &self,
        intent: RpcFiLiquidityRequestIntent,
        network: RpcFiLiquidityNetwork,
    ) -> RpcFiLiquidityDiscoveryResult {
        match &self.fi_driver {
            Some(driver) => driver.discover_liquidity(intent, network).await,
            None => RpcFiLiquidityDiscoveryResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_liquidity_start(
        &self,
        formation_id: String,
        provider_pubkey: String,
        intent: RpcFiLiquidityRequestIntent,
    ) -> RpcFiLiquidityOperationResult {
        match &self.fi_driver {
            Some(driver) => {
                driver
                    .start_liquidity(formation_id, provider_pubkey, intent)
                    .await
            }
            None => RpcFiLiquidityOperationResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_liquidity_resume(&self, operation_id: String) -> RpcFiLiquidityOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.resume_liquidity(operation_id).await,
            None => RpcFiLiquidityOperationResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_liquidity_status(&self, operation_id: String) -> RpcFiLiquidityOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.liquidity_status(operation_id).await,
            None => RpcFiLiquidityOperationResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_liquidity_current(&self) -> RpcFiCurrentLiquidityOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.current_liquidity_operation().await,
            None => RpcFiCurrentLiquidityOperationResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_liquidity_list(
        &self,
        after: Option<String>,
    ) -> RpcFiLiquidityOperationPageResult {
        match &self.fi_driver {
            Some(driver) => driver.list_liquidity_operations(after).await,
            None => RpcFiLiquidityOperationPageResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_update_federation_metadata(
        &self,
        update: RpcFiFederationMetadataUpdate,
    ) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.update_federation_metadata(update).await,
            None => self.fi_initialization_failure(),
        }
    }

    pub async fn fi_set_guardian_fee(&self, guardian_fee_ppm: u32) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.set_guardian_fee(guardian_fee_ppm).await,
            None => self.fi_initialization_failure(),
        }
    }
    pub async fn fi_create_pinned(
        &self,
        intent: RpcFiFormationIntent,
        locators: Vec<String>,
    ) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.create_pinned(intent, locators).await,
            None => self.fi_initialization_failure(),
        }
    }

    pub async fn fi_preview_selection(
        &self,
        request: RpcFiSelectionPreviewRequest,
    ) -> RpcFiSelectionPreviewResult {
        match &self.fi_driver {
            Some(driver) => driver.preview_selection(request).await,
            None => RpcFiSelectionPreviewResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_pay_and_create(
        &self,
        preview_id: String,
        intent: RpcFiFormationIntent,
        payment_federation_id: String,
        max_total_msats: u64,
    ) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => {
                driver
                    .pay_and_create(preview_id, intent, payment_federation_id, max_total_msats)
                    .await
            }
            None => self.fi_initialization_failure(),
        }
    }

    pub async fn fi_preview_replacements(&self) -> RpcFiReplacementPreviewResult {
        match &self.fi_driver {
            Some(driver) => driver.preview_replacements().await,
            None => RpcFiReplacementPreviewResult::Error {
                error: self.fi_initialization_error(),
            },
        }
    }

    pub async fn fi_apply_replacements(
        &self,
        preview_id: String,
        max_total_msats: u64,
    ) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.apply_replacements(preview_id, max_total_msats).await,
            None => self.fi_initialization_failure(),
        }
    }

    pub async fn fi_resume(&self) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.resume().await,
            None => self.fi_initialization_failure(),
        }
    }

    pub async fn fi_abandon(&self) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => driver.abandon().await,
            None => self.fi_initialization_failure(),
        }
    }

    pub async fn fi_schedule_reset(&self) -> RpcFiOperationResult {
        match self.runtime.schedule_fi_client_reset().await {
            Ok(()) => RpcFiOperationResult::Success,
            Err(error) => {
                tracing::warn!(%error, "failed to schedule FI client reset");
                RpcFiOperationResult::Error {
                    error: RpcFiOperationError {
                        code: if self.runtime.fi_client_reset_is_allowed() {
                            RpcFiErrorCode::Storage
                        } else {
                            RpcFiErrorCode::CapabilityUnavailable
                        },
                        message: "Wallet-service test reset could not be scheduled".to_owned(),
                        detail: None,
                    },
                }
            }
        }
    }

    pub async fn fi_authorize_replacement_payments(
        &self,
        authorization_id: String,
    ) -> RpcFiOperationResult {
        match &self.fi_driver {
            Some(driver) => {
                driver
                    .authorize_replacement_payments(authorization_id)
                    .await
            }
            None => self.fi_initialization_failure(),
        }
    }

    fn fi_initialization_failure(&self) -> RpcFiOperationResult {
        RpcFiOperationResult::Error {
            error: self.fi_initialization_error(),
        }
    }

    fn fi_initialization_error(&self) -> rpc_types::fi_client::RpcFiOperationError {
        let Err(error) = &self.fi_client else {
            unreachable!("an FI driver is absent only when FI client initialization failed");
        };
        fi_error_to_rpc(error)
    }

    pub async fn new(
        runtime: Arc<Runtime>,
        device_identifier: DeviceIdentifier,
    ) -> anyhow::Result<Self, BridgeOffboardingReason> {
        // If the provided v2 identifier is not the same as the existing v2 identifier,
        // then under the guarantees of the v2 identifier, the user's phone
        // storage has been cloned (as part of a new device set up process,
        // perhaps). In this case, we notify the caller with a special type of error.
        let existing_identifier_v2 = runtime.app_state.device_identifier().await;
        if existing_identifier_v2 != device_identifier {
            error!("device id mismatch");
            return Err(BridgeOffboardingReason::DeviceIdentifierMismatch {
                existing: existing_identifier_v2,
                new: device_identifier,
            });
        }

        // Check if bridge is ready for export
        if runtime.app_state.is_internal_bridge_export().await {
            error!("Bridge is ready for export");
            return Err(BridgeOffboardingReason::InternalBridgeExport);
        }

        // Check if a device index conflict was previously detected
        if runtime.app_state.is_device_index_conflict().await {
            error!("Device index conflict previously detected");
            return Err(BridgeOffboardingReason::DeviceIndexConflict);
        }

        match runtime.apply_scheduled_fi_client_reset().await {
            Ok(true) => tracing::warn!("cleared scheduled FI client test state"),
            Ok(false) => {}
            Err(error) => tracing::error!(%error, "failed to clear scheduled FI client test state"),
        }

        let device_registration_service = DeviceRegistrationService::new(runtime.clone()).await;

        let multispend_services = MultispendServices::new(runtime.clone());
        let multispend_notifications =
            Arc::new(MultispendNotificationsProvider(multispend_services.clone()));

        // The federations service is constructed before the FI client so the
        // FI payment adapter can hold it; joined federations still load in
        // the background below, and an FI payment against a still-loading
        // federation fails with a retryable error.
        let spt_notifier = Arc::new(SptTransferCompleteNotifier::new(runtime.clone()));
        let spt_notifications = Arc::new(SptNotificationsProvider(spt_notifier.clone()));
        let federations = Arc::new(Federations::new(
            runtime.clone(),
            multispend_notifications,
            spt_notifications,
            device_registration_service.clone(),
        ));

        let nostril = Arc::new(Nostril::new(&runtime).await);
        let push_root_secret = runtime.app_state.root_secret().await;
        let fi_push_gateway = BridgeFiPushGateway::from_parts(
            &push_root_secret,
            runtime.feature_catalog.runtime_env,
            &device_identifier,
            runtime
                .feature_catalog
                .fi_push_gateway
                .as_ref()
                .map(|config| config.api_base_url.clone()),
        )
        .map(Arc::new)
        .map_err(Arc::new);
        let fi_client = open_fi_client(&runtime, federations.clone())
            .await
            .map(Arc::new)
            .map_err(Arc::new);
        let fi_driver = fi_client.as_ref().ok().map(|client| {
            start_fi_driver(
                &runtime,
                client.clone(),
                federations.clone(),
                fi_push_gateway.clone(),
            )
        });

        // Load communities and federations services
        let communities = Communities::init(runtime.clone(), nostril.clone()).await;
        federations.load_joined_federations_in_background().await;

        let spt_provider = Arc::new(SptFederationProviderWrapper(federations.clone()));
        let sp_transfers_services = SptServices::new(runtime.clone(), spt_provider, spt_notifier);
        let fi_federation_handoff_locks = Arc::new(FiFederationHandoffLocks::default());
        if let Ok(client) = &fi_client {
            start_fi_federation_auto_join(
                &runtime,
                client.observe(),
                federations.clone(),
                sp_transfers_services.clone(),
                fi_federation_handoff_locks.clone(),
            );
        }

        let nostr_pubkey = nostril.get_pub_key().await.unwrap().npub;

        let matrix = BgMatrix::new(
            runtime.clone(),
            nostr_pubkey,
            multispend_services.clone(),
            sp_transfers_services.clone(),
        );

        let bridge = Self {
            runtime,
            federations,
            communities,
            matrix,
            device_registration_service,
            multispend_services,
            sp_transfers_services,
            nostril,
            fi_client,
            fi_push_gateway,
            fi_driver,
            fi_federation_handoff_locks,
        };

        bridge.start_bg().await;

        Ok(bridge)
    }

    pub async fn start_bg(&self) {
        let matrix = self.matrix.clone();
        let runtime = self.runtime.clone();
        let federations = self.federations.clone();
        let multispend_services = self.multispend_services.clone();
        let federation_provider = Arc::new(FederationProviderWrapper(federations));
        self.runtime
            .task_group
            .spawn_cancellable("multispend::WithdrawalService", async move {
                multispend_services
                    .withdrawal
                    .run(&runtime.multispend_db(), federation_provider.as_ref())
                    .await
            });
        let multispend_services = self.multispend_services.clone();
        self.runtime.task_group.spawn_cancellable(
            "multispend::CompletionNotificationService",
            async move {
                multispend_services
                    .completion_notification
                    .run_continuously(matrix.wait_multispend().await)
                    .await
            },
        );

        let sp_transfers_services = self.sp_transfers_services.clone();
        let matrix = self.matrix.clone();
        self.runtime.task_group.spawn_cancellable(
            "sp_transfers::TransferCompleteNotifier",
            async move {
                sp_transfers_services
                    .transfer_complete_notifier
                    .run_continuously(matrix.wait_spt().await)
                    .await
            },
        );

        let sp_transfers_services = self.sp_transfers_services.clone();
        let matrix = self.matrix.clone();
        self.runtime
            .task_group
            .spawn_cancellable("sp_transfers::AccountIdResponder", async move {
                let sp_transfers_matrix = matrix.wait_spt().await.clone();
                sp_transfers_services
                    .account_id_responder
                    .run_continuously(&sp_transfers_matrix)
                    .await;
            });

        let sp_transfers_services = self.sp_transfers_services.clone();
        self.runtime
            .task_group
            .spawn_cancellable("sp_transfers::TransferSubmitter", async move {
                sp_transfers_services
                    .transfer_submitter
                    .run_continuously()
                    .await;
            });
    }

    /// Dump the database for a given federation.
    pub async fn dump_db(
        &self,
        federation_id: &str,
        include_federation_secret: bool,
    ) -> anyhow::Result<PathBuf> {
        let db_dump_path = format!("db-{federation_id}.dump");
        let federation = self
            .federations
            .get_federation_maybe_recovering(federation_id)?;
        let federation_secret = if include_federation_secret {
            let root_mnemonic = self.runtime.app_state.root_mnemonic().await;
            let device_index = self.runtime.app_state.device_index().await;
            Some(FederationV2::client_root_secret_from_root_mnemonic(
                &root_mnemonic,
                &federation.federation_id(),
                device_index,
            ))
        } else {
            None
        };
        let db = federation.client.db().clone();
        let mut buffer = Vec::new();
        bug_report::db_dump::dump_db(&db, &DbDumpHeader { federation_secret }, &mut buffer).await?;
        self.runtime
            .storage
            .write_file(db_dump_path.as_ref(), buffer)
            .await?;
        Ok(self.runtime.storage.platform_path(db_dump_path.as_ref()))
    }

    pub async fn upload_backup_file(
        &self,
        federation_id: RpcFederationId,
        video_file_path: PathBuf,
    ) -> Result<PathBuf> {
        let federation = self.federations.get_federation(&federation_id.0)?;
        let storage = self.runtime.storage.clone();
        // if remote bridge, copy with adb? maybe storage trait could do this?
        let video_file = storage
            .read_file(&video_file_path)
            .await?
            .ok_or(anyhow!("video file not found"))?;
        let root_mnemonic = self.runtime.app_state.root_mnemonic().await;
        let recovery_file = federation
            .upload_backup_file(video_file, root_mnemonic)
            .await?;
        storage
            .write_file(RECOVERY_FILENAME.as_ref(), recovery_file)
            .await?;
        Ok(storage.platform_path(RECOVERY_FILENAME.as_ref()))
    }

    pub async fn download_verification_doc(
        &self,
        federation_id: RpcFederationId,
        recovery_id: RpcRecoveryId,
        peer_id: RpcPeerId,
        guardian_password: String,
    ) -> Result<Option<PathBuf>> {
        let federation = self.federations.get_federation(&federation_id.0)?;
        let verification_doc = federation
            .download_verification_doc(&recovery_id.0, peer_id.0, guardian_password)
            .await?;
        if let Some(verification_doc) = verification_doc {
            self.runtime
                .storage
                .write_file(VERIFICATION_FILENAME.as_ref(), verification_doc)
                .await?;
            tracing::info!("saved verificaiton doc");
            Ok(Some(
                self.runtime
                    .storage
                    .platform_path(VERIFICATION_FILENAME.as_ref()),
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
        guardian_password: String,
    ) -> Result<()> {
        let federation = self.federations.get_federation(&federation_id.0)?;
        federation
            .approve_social_recovery_request(&recovery_id.0, peer_id.0, guardian_password)
            .await
    }

    pub async fn set_guardian_password(
        &self,
        federation_id: RpcFederationId,
        peer_id: RpcPeerId,
        guardian_password: String,
    ) -> Result<()> {
        self.runtime
            .app_state
            .with_write_lock(|state| {
                state.guardian_password_map.insert(
                    format!("{}:{}", federation_id.0, peer_id),
                    guardian_password,
                );
            })
            .await
    }

    pub async fn get_guardian_password(
        &self,
        federation_id: RpcFederationId,
        peer_id: RpcPeerId,
    ) -> Result<String> {
        self.runtime
            .app_state
            .with_read_lock(|state| {
                state
                    .guardian_password_map
                    .get(&format!("{}:{}", federation_id.0, peer_id))
                    .cloned()
            })
            .await
            .ok_or(anyhow!(
                "No entry found for given federation ID and peer ID"
            ))
    }

    pub async fn set_module_fedi_fee_schedule(
        &self,
        federation_id: RpcFederationId,
        module_kind: ModuleKind,
        send_ppm: u64,
        receive_ppm: u64,
    ) -> Result<()> {
        self.federations
            .fedi_fee_helper
            .set_app_module_fee_schedule(
                federation_id.0,
                module_kind,
                ModuleFediFeeSchedule {
                    send_ppm,
                    receive_ppm,
                },
            )
            .await
    }
    pub fn on_app_foreground(&self) {
        self.communities.refresh_metas_in_background();
        // Refresh the remote feature cache on foreground so a flag flipped
        // server-side is picked up after a single cold start instead of two.
        self.runtime.remote_features.spawn_refresh();
    }
}
