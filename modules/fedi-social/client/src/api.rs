use async_trait::async_trait;
use fedi_social_common::common::SignedRecoveryRequest;
use fedi_social_common::SignedBackupRequest;
use fedimint_core::api::{FederationApiExt, FederationResult, IRawFederationApi};
use fedimint_core::core::ModuleInstanceId;
use fedimint_core::module::ApiRequestErased;
use fedimint_core::task::{MaybeSend, MaybeSync};

#[cfg_attr(target_family = "wasm", async_trait(? Send))]
#[cfg_attr(not(target_family = "wasm"), async_trait)]
pub trait FediSocialFederationApi {
    /// Upload social recovery backup for mint to safekeep
    async fn social_backup(
        &self,
        module_id: ModuleInstanceId,
        request: &SignedBackupRequest,
    ) -> FederationResult<()>;

    async fn social_recovery(
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
        self.request_current_consensus("backup".into(), ApiRequestErased::new(request))
            .await
    }

    async fn social_recovery(
        &self,
        _module_id: ModuleInstanceId,
        request: &SignedRecoveryRequest,
    ) -> FederationResult<()> {
        self.request_current_consensus("recover".into(), ApiRequestErased::new(request))
            .await
    }
}
