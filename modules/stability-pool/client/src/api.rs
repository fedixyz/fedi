use std::future::Future;
use std::ops::Range;

use fedimint_api_client::api::{FederationApiExt, FederationResult, IModuleFederationApi};
use fedimint_core::module::ApiRequestErased;
use fedimint_core::task::{MaybeSend, MaybeSync};
use stability_pool_common::{AccountHistoryItem, AccountHistoryRequest, AccountId, SyncResponse};

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
}
