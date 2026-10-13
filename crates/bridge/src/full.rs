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
use rpc_types::event::TypedEventExt as _;
use rpc_types::fa_client::{
    RpcFaClientStatus, RpcFaCurrentLiquidityOperationResult, RpcFaDecommissionRefusal,
    RpcFaDecommissionResult, RpcFaEligiblePayersResult, RpcFaErrorCode,
    RpcFaFederationMetadataUpdate, RpcFaFormationIntent, RpcFaLiquidityDiscoveryResult,
    RpcFaLiquidityNetwork, RpcFaLiquidityOperationPageResult, RpcFaLiquidityOperationResult,
    RpcFaLiquidityRequestIntent, RpcFaOperationError, RpcFaOperationResult, RpcFaPushPlatform,
    RpcFaPushRegistrationResult, RpcFaReplacementPreviewResult, RpcFaSelectionPreviewRequest,
    RpcFaSelectionPreviewResult, RpcFaSetupPaymentFederationsResult,
};
use rpc_types::{RpcFederationId, RpcPeerId, RpcRecoveryId};
use runtime::bridge_runtime::Runtime;
use runtime::features::FaManifoldEnvironment;
use runtime::storage::state::{DeviceIdentifier, ModuleFediFeeSchedule, OnboardingMethod};
use serde::Serialize;
use sp_transfer::services::SptServices;
use sp_transfer::services::transfer_complete_notifier::SptTransferCompleteNotifier;
use tracing::error;
use ts_rs::TS;

use crate::bg_matrix::BgMatrix;
use crate::fa_client::{
    BridgeFaClient, BridgeFaDriver, FaFederationHandoffLocks, FaFederationJoinReport,
    fa_client_status_to_rpc, fa_error_to_rpc, fa_push_error_to_rpc, open_fa_client,
    start_fa_driver, start_fa_federation_auto_join, suppress_fa_federation_auto_join,
};
use crate::fa_push::{BridgeFaPushGateway, FaPushError, FaPushPlatform};
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
    /// Dormant FA service. Initialization errors are retained without
    /// offboarding an otherwise healthy wallet.
    fa_client: std::result::Result<Arc<BridgeFaClient>, Arc<fa_client::FaError>>,
    /// Seed- and installation-bound client for Manifold's push gateway.
    fa_push_gateway: std::result::Result<Arc<BridgeFaPushGateway>, Arc<FaPushError>>,
    /// The sole owner of long-running FA formation, liquidity, and maintenance
    /// operations.
    pub(crate) fa_driver: Option<BridgeFaDriver>,
    fa_federation_handoff_locks: Arc<FaFederationHandoffLocks>,
    /// Last reported progress of the automatic join of the FA's federation.
    fa_federation_join_report: FaFederationJoinReport,
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
        let _handoff_guard = self.fa_federation_handoff_locks.lock(federation_id).await;
        suppress_fa_federation_auto_join(&self.runtime, federation_id).await;
        self.fa_federation_join_report.clear(federation_id);
        self.federations.leave_federation(federation_id).await
    }

    pub fn fa_status_receiver(
        &self,
    ) -> Result<tokio::sync::watch::Receiver<fa_client::FaStatus>, RpcFaOperationError> {
        self.fa_client
            .as_ref()
            .map(|client| client.observe())
            .map_err(|_| self.fa_initialization_error())
    }

    pub fn fa_client_status(&self) -> RpcFaClientStatus {
        // A status read can happen after the join event was already delivered,
        // so re-deliver the last reported join state with it.
        if let Some(event) = self.fa_federation_join_report.last() {
            self.runtime
                .event_sink
                .typed_event(&rpc_types::event::Event::FaFederationJoin(event));
        }
        fa_client_status_to_rpc(&self.fa_client)
    }

    pub async fn fa_eligible_payers(&self) -> RpcFaEligiblePayersResult {
        match &self.fa_driver {
            Some(driver) => driver.eligible_payers().await,
            None => RpcFaEligiblePayersResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_setup_payment_federations(&self) -> RpcFaSetupPaymentFederationsResult {
        match &self.fa_driver {
            Some(driver) => driver.setup_payment_federations().await,
            None => RpcFaSetupPaymentFederationsResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_register_push_installation(
        &self,
        fcm_token: String,
        platform: RpcFaPushPlatform,
    ) -> RpcFaPushRegistrationResult {
        let gateway = match &self.fa_push_gateway {
            Ok(gateway) => gateway,
            Err(error) => {
                return RpcFaPushRegistrationResult::Error {
                    error: fa_push_error_to_rpc(error),
                };
            }
        };
        let platform = match platform {
            RpcFaPushPlatform::Android => FaPushPlatform::Android,
            RpcFaPushPlatform::Ios => FaPushPlatform::Ios,
        };
        match gateway
            .register_installation(FcmRegistrationToken(fcm_token), platform)
            .await
        {
            Ok(()) => RpcFaPushRegistrationResult::Registered {
                installation_id: gateway.installation_id().to_owned(),
            },
            Err(error) => RpcFaPushRegistrationResult::Error {
                error: fa_push_error_to_rpc(&error),
            },
        }
    }

    pub async fn fa_unregister_push_installation(&self) -> RpcFaPushRegistrationResult {
        let gateway = match &self.fa_push_gateway {
            Ok(gateway) => gateway,
            Err(error) => {
                return RpcFaPushRegistrationResult::Error {
                    error: fa_push_error_to_rpc(error),
                };
            }
        };
        match gateway.unregister_installation().await {
            Ok(()) => RpcFaPushRegistrationResult::Unregistered {
                installation_id: gateway.installation_id().to_owned(),
            },
            Err(error) => RpcFaPushRegistrationResult::Error {
                error: fa_push_error_to_rpc(&error),
            },
        }
    }

    pub async fn fa_liquidity_discover(
        &self,
        intent: RpcFaLiquidityRequestIntent,
        network: RpcFaLiquidityNetwork,
    ) -> RpcFaLiquidityDiscoveryResult {
        match &self.fa_driver {
            Some(driver) => driver.discover_liquidity(intent, network).await,
            None => RpcFaLiquidityDiscoveryResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_liquidity_start(
        &self,
        formation_id: String,
        provider_pubkey: String,
        intent: RpcFaLiquidityRequestIntent,
    ) -> RpcFaLiquidityOperationResult {
        match &self.fa_driver {
            Some(driver) => {
                driver
                    .start_liquidity(formation_id, provider_pubkey, intent)
                    .await
            }
            None => RpcFaLiquidityOperationResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_liquidity_resume(&self, operation_id: String) -> RpcFaLiquidityOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.resume_liquidity(operation_id).await,
            None => RpcFaLiquidityOperationResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_liquidity_status(&self, operation_id: String) -> RpcFaLiquidityOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.liquidity_status(operation_id).await,
            None => RpcFaLiquidityOperationResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_liquidity_current(&self) -> RpcFaCurrentLiquidityOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.current_liquidity_operation().await,
            None => RpcFaCurrentLiquidityOperationResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_liquidity_list(
        &self,
        after: Option<String>,
    ) -> RpcFaLiquidityOperationPageResult {
        match &self.fa_driver {
            Some(driver) => driver.list_liquidity_operations(after).await,
            None => RpcFaLiquidityOperationPageResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_update_federation_metadata(
        &self,
        update: RpcFaFederationMetadataUpdate,
    ) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.update_federation_metadata(update).await,
            None => self.fa_initialization_failure(),
        }
    }

    pub async fn fa_set_guardian_fee(&self, guardian_fee_ppm: u32) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.set_guardian_fee(guardian_fee_ppm).await,
            None => self.fa_initialization_failure(),
        }
    }

    pub async fn fa_preview_selection(
        &self,
        request: RpcFaSelectionPreviewRequest,
    ) -> RpcFaSelectionPreviewResult {
        match &self.fa_driver {
            Some(driver) => driver.preview_selection(request).await,
            None => RpcFaSelectionPreviewResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_pay_and_create(
        &self,
        preview_id: String,
        intent: RpcFaFormationIntent,
        payment_federation_id: String,
        max_total_msats: u64,
    ) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => {
                driver
                    .pay_and_create(preview_id, intent, payment_federation_id, max_total_msats)
                    .await
            }
            None => self.fa_initialization_failure(),
        }
    }

    pub async fn fa_preview_replacements(&self) -> RpcFaReplacementPreviewResult {
        match &self.fa_driver {
            Some(driver) => driver.preview_replacements().await,
            None => RpcFaReplacementPreviewResult::Error {
                error: self.fa_initialization_error(),
            },
        }
    }

    pub async fn fa_apply_replacements(
        &self,
        preview_id: String,
        max_total_msats: u64,
    ) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.apply_replacements(preview_id, max_total_msats).await,
            None => self.fa_initialization_failure(),
        }
    }

    pub async fn fa_resume(&self) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.resume().await,
            None => self.fa_initialization_failure(),
        }
    }

    pub async fn fa_abandon(&self) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.abandon().await,
            None => self.fa_initialization_failure(),
        }
    }

    pub async fn fa_decommission(&self) -> RpcFaDecommissionResult {
        if !self.runtime.fa_client_reset_is_allowed() {
            return RpcFaDecommissionResult::Error {
                error: RpcFaOperationError {
                    code: RpcFaErrorCode::CapabilityUnavailable,
                    message: "Wallet-service decommission is only available in internal builds"
                        .to_owned(),
                    detail: None,
                },
            };
        }
        let Ok(client) = &self.fa_client else {
            return RpcFaDecommissionResult::Error {
                error: self.fa_initialization_error(),
            };
        };
        match client.decommission_seats().await {
            Ok(outcome) => RpcFaDecommissionResult::Outcome {
                decommissioned: outcome.decommissioned,
                already_decommissioned: outcome.already_decommissioned,
                refused: outcome
                    .refused
                    .into_iter()
                    .map(|(index, reason)| RpcFaDecommissionRefusal { index, reason })
                    .collect(),
            },
            Err(error) => RpcFaDecommissionResult::Error {
                error: fa_error_to_rpc(&error),
            },
        }
    }

    pub async fn fa_restart_dkg(&self) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => driver.restart_dkg().await,
            None => self.fa_initialization_failure(),
        }
    }

    pub async fn fa_schedule_reset(&self) -> RpcFaOperationResult {
        match self.runtime.schedule_fa_client_reset().await {
            Ok(()) => RpcFaOperationResult::Success,
            Err(error) => {
                tracing::warn!(%error, "failed to schedule FA client reset");
                RpcFaOperationResult::Error {
                    error: RpcFaOperationError {
                        code: if !self.runtime.fa_client_reset_is_allowed()
                            || self.runtime.fa_manifold_environment().await
                                == FaManifoldEnvironment::Production
                        {
                            RpcFaErrorCode::CapabilityUnavailable
                        } else {
                            RpcFaErrorCode::Storage
                        },
                        message: "Wallet-service test reset could not be scheduled".to_owned(),
                        detail: None,
                    },
                }
            }
        }
    }

    pub async fn fa_authorize_replacement_payments(
        &self,
        authorization_id: String,
    ) -> RpcFaOperationResult {
        match &self.fa_driver {
            Some(driver) => {
                driver
                    .authorize_replacement_payments(authorization_id)
                    .await
            }
            None => self.fa_initialization_failure(),
        }
    }

    fn fa_initialization_failure(&self) -> RpcFaOperationResult {
        RpcFaOperationResult::Error {
            error: self.fa_initialization_error(),
        }
    }

    fn fa_initialization_error(&self) -> rpc_types::fa_client::RpcFaOperationError {
        let Err(error) = &self.fa_client else {
            unreachable!("an FA driver is absent only when FA client initialization failed");
        };
        fa_error_to_rpc(error)
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

        let fa_reset_failed = match runtime.apply_scheduled_fa_client_reset().await {
            Ok(true) => {
                tracing::warn!("cleared scheduled FA client test state");
                false
            }
            Ok(false) => false,
            Err(error) => {
                tracing::error!(%error, "failed to clear scheduled FA client test state");
                true
            }
        };

        let device_registration_service = DeviceRegistrationService::new(runtime.clone()).await;

        let multispend_services = MultispendServices::new(runtime.clone());
        let multispend_notifications =
            Arc::new(MultispendNotificationsProvider(multispend_services.clone()));

        // The federations service is constructed before the FA client so the
        // FA payment adapter can hold it; joined federations still load in
        // the background below, and an FA payment against a still-loading
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
        let fa_manifold_environment = runtime.fa_manifold_environment().await;
        let fa_push_gateway = BridgeFaPushGateway::from_parts(
            &push_root_secret,
            runtime.feature_catalog.runtime_env,
            &device_identifier,
            runtime
                .feature_catalog
                .fa_push_gateway
                .as_ref()
                .map(|config| config.api_base_url.clone()),
        )
        .map(Arc::new)
        .map_err(Arc::new);
        // A failed reset or owner check leaves FA state intact. Do not open
        // it against a possibly different environment's relays and issuers.
        let fa_client = if fa_reset_failed {
            Err(Arc::new(fa_client::FaError::Storage(
                "wallet-service environment ownership or scheduled reset could not be verified"
                    .to_owned(),
            )))
        } else {
            open_fa_client(
                &runtime,
                federations.clone(),
                fa_manifold_environment,
                runtime.app_state.onboarding_method().await == Some(OnboardingMethod::Restored),
            )
            .await
            .map(Arc::new)
            .map_err(Arc::new)
        };
        let fa_driver = fa_client.as_ref().ok().map(|client| {
            start_fa_driver(
                &runtime,
                client.clone(),
                federations.clone(),
                fa_push_gateway.clone(),
                fa_manifold_environment,
            )
        });

        // Load communities and federations services
        let communities = Communities::init(runtime.clone(), nostril.clone()).await;
        federations.load_joined_federations_in_background().await;

        let spt_provider = Arc::new(SptFederationProviderWrapper(federations.clone()));
        let sp_transfers_services = SptServices::new(runtime.clone(), spt_provider, spt_notifier);
        let fa_federation_handoff_locks = Arc::new(FaFederationHandoffLocks::default());
        let fa_federation_join_report = FaFederationJoinReport::default();
        if let Ok(client) = &fa_client {
            start_fa_federation_auto_join(
                &runtime,
                client.observe(),
                federations.clone(),
                sp_transfers_services.clone(),
                fa_federation_handoff_locks.clone(),
                fa_federation_join_report.clone(),
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
            fa_client,
            fa_push_gateway,
            fa_driver,
            fa_federation_handoff_locks,
            fa_federation_join_report,
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
