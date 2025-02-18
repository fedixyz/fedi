use std::time::Duration;

use async_trait::async_trait;
use fedi_social_common::common::SignedRecoveryRequest;
use fedi_social_common::SignedBackupRequest;
use fedimint_api_client::api::{FederationApiExt, FederationResult, IRawFederationApi};
use fedimint_core::core::ModuleInstanceId;
use fedimint_core::module::ApiRequestErased;
use fedimint_core::task::{MaybeSend, MaybeSync};
use futures::future::join_all;
use tracing::info;

#[cfg_attr(target_family = "wasm", async_trait(? Send))]
#[cfg_attr(not(target_family = "wasm"), async_trait)]
pub trait FediSocialFederationApi {
    /// Upload social recovery backup for mint to safekeep
    async fn social_backup(
        &self,
        module_id: ModuleInstanceId,
        request: &SignedBackupRequest,
    ) -> FederationResult<()>;

    async fn start_social_recovery(
        &self,
        module_id: ModuleInstanceId,
        request: &SignedRecoveryRequest,
    ) -> FederationResult<()>;
}

#[cfg_attr(target_family = "wasm", async_trait(? Send))]
#[cfg_attr(not(target_family = "wasm"), async_trait)]
impl<T: ?Sized> FediSocialFederationApi for T
where
    T: IRawFederationApi + MaybeSend + MaybeSync + 'static,
{
    /// Upload social recovery backup for mint to safekeep
    async fn social_backup(
        &self,
        _module_id: ModuleInstanceId,
        request: &SignedBackupRequest,
    ) -> FederationResult<()> {
        for res in join_all(self.all_peers().iter().map(|peer_id| {
            info!(%peer_id, id=%request.backup_id(), "Uploading social backup to guardian");
            self.request_single_peer_federation(
                Some(Duration::from_secs(60)),
                "backup".into(),
                ApiRequestErased::new(request),
                *peer_id,
            )
        }))
        .await
        {
            let () = res?;
        }
        Ok(())
    }

    async fn start_social_recovery(
        &self,
        _module_id: ModuleInstanceId,
        request: &SignedRecoveryRequest,
    ) -> FederationResult<()> {
        for res in join_all(self.all_peers().iter().map(|peer_id| {
            info!(%peer_id, id=%request.recovery_id(), "Uploading social backup to guardian");
            self.request_single_peer_federation(
                Some(Duration::from_secs(60)),
                "recover".into(),
                ApiRequestErased::new(request),
                *peer_id,
            )
        }))
        .await
        {
            let () = res?;
        }
        Ok(())
    }
}
