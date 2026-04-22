use std::future::Future;
use std::ops::Range;

use fedimint_api_client::api::{FederationApiExt, FederationResult, IModuleFederationApi};
use fedimint_core::module::{ApiAuth, ApiRequestErased, ModuleConsensusVersion};
use fedimint_core::task::{MaybeSend, MaybeSync};
use stability_pool_common::endpoint_constants::{
    ACTIVATE_CONSENSUS_VERSION_VOTING_ENDPOINT, MODULE_CONSENSUS_VERSION_ENDPOINT,
};
use stability_pool_common::{
    AccountHistoryItem, AccountHistoryRequest, AccountId, INITIAL_MODULE_CONSENSUS_VERSION,
    SyncResponse,
};

pub trait StabilityPoolApiExt {
    fn account_sync(
        &self,
        account_id: AccountId,
    ) -> impl Future<Output = FederationResult<SyncResponse>> + MaybeSend;

    fn account_history(
        &self,
        account_id: AccountId,
        range: Range<u64>,
    ) -> impl Future<Output = FederationResult<Vec<AccountHistoryItem>>> + MaybeSend;

    fn module_consensus_version(
        &self,
    ) -> impl Future<Output = FederationResult<ModuleConsensusVersion>> + MaybeSend;

    fn activate_consensus_version_voting(
        &self,
        auth: ApiAuth,
    ) -> impl Future<Output = FederationResult<()>> + MaybeSend;
}

impl<T: ?Sized> StabilityPoolApiExt for T
where
    T: IModuleFederationApi + MaybeSend + MaybeSync + 'static,
{
    async fn account_sync(&self, account_id: AccountId) -> FederationResult<SyncResponse> {
        self.request_current_consensus("sync".to_string(), ApiRequestErased::new(account_id))
            .await
    }

    async fn account_history(
        &self,
        account_id: AccountId,
        range: Range<u64>,
    ) -> FederationResult<Vec<AccountHistoryItem>> {
        self.request_current_consensus(
            "account_history".to_string(),
            ApiRequestErased::new(AccountHistoryRequest { account_id, range }),
        )
        .await
    }

    async fn module_consensus_version(&self) -> FederationResult<ModuleConsensusVersion> {
        let response = self
            .request_current_consensus(
                MODULE_CONSENSUS_VERSION_ENDPOINT.to_string(),
                ApiRequestErased::default(),
            )
            .await;

        if let Err(e) = &response
            && e.any_peer_error_method_not_found()
        {
            return Ok(INITIAL_MODULE_CONSENSUS_VERSION);
        }

        response
    }

    async fn activate_consensus_version_voting(&self, auth: ApiAuth) -> FederationResult<()> {
        self.request_admin(
            ACTIVATE_CONSENSUS_VERSION_VOTING_ENDPOINT,
            ApiRequestErased::default(),
            auth,
        )
        .await
    }
}
