use std::fmt::Display;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Result, anyhow};
use communities::Communities;
use device_registration::DeviceRegistrationService;
use federations::Federations;
use fedimint_core::core::ModuleKind;
use multispend::services::MultispendServices;
use nostril::Nostril;
use rpc_types::{RpcFederationId, RpcPeerId, RpcRecoveryId};
use runtime::bridge_runtime::Runtime;
use runtime::storage::state::{DeviceIdentifier, ModuleFediFeeSchedule};
use serde::Serialize;
use sp_transfer::services::SptServices;
use sp_transfer::services::transfer_complete_notifier::SptTransferCompleteNotifier;
use tracing::error;
use ts_rs::TS;

use crate::bg_matrix::BgMatrix;
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
}

impl Display for BridgeOffboardingReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DeviceIdentifierMismatch { existing, new } => write!(
                f,
                "Expected device ID {existing} but received {new}. Likely app has been cloned on a new device."
            ),
            Self::InternalBridgeExport => write!(f, "Bridge is ready for export"),
        }
    }
}

impl BridgeFull {
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
            error!(%existing_identifier_v2, %device_identifier, "device id mismatch");
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

        let device_registration_service = DeviceRegistrationService::new(runtime.clone()).await;

        let multispend_services = MultispendServices::new(runtime.clone());
        let multispend_notifications =
            Arc::new(MultispendNotificationsProvider(multispend_services.clone()));

        let nostril = Arc::new(Nostril::new(&runtime).await);

        // Load communities and federations services
        let communities = Communities::init(runtime.clone(), nostril.clone()).await;
        let spt_notifier = Arc::new(SptTransferCompleteNotifier::new(runtime.clone()));
        let spt_notifications = Arc::new(SptNotificationsProvider(spt_notifier.clone()));
        let federations = Arc::new(Federations::new(
            runtime.clone(),
            multispend_notifications,
            spt_notifications,
            device_registration_service.clone(),
        ));
        federations.load_joined_federations_in_background().await;

        let spt_provider = Arc::new(SptFederationProviderWrapper(federations.clone()));
        let sp_transfers_services = SptServices::new(runtime.clone(), spt_provider, spt_notifier);

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
    pub async fn dump_db(&self, federation_id: &str) -> anyhow::Result<PathBuf> {
        let db_dump_path = format!("db-{federation_id}.dump");
        let federation = self
            .federations
            .get_federation_maybe_recovering(federation_id)?;
        let db = federation.client.db().clone();
        let mut buffer = Vec::new();
        bug_report::db_dump::dump_db(&db, &mut buffer).await?;
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
    ) -> Result<Option<PathBuf>> {
        let federation = self.federations.get_federation(&federation_id.0)?;
        let verification_doc = federation
            .download_verification_doc(&recovery_id.0, peer_id.0)
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
        password: String,
    ) -> Result<()> {
        let federation = self.federations.get_federation(&federation_id.0)?;
        federation
            .approve_social_recovery_request(&recovery_id.0, peer_id.0, &password)
            .await
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
    pub fn on_app_foreground(&self) {
        self.communities.refresh_metas_in_background();
    }
}
