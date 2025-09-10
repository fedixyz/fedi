use std::sync::Arc;

use federations::Federations;
use federations::federation_v2::MultispendNotifications;
use fedimint_core::core::OperationId;
use fedimint_core::{TransactionId, apply, async_trait_maybe_send};
use multispend::FederationProvider;
use multispend::services::MultispendServices;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{RpcEventId, SPv2TransferMetadata};
use stability_pool_client::common::{AccountId, FiatAmount, SignedTransferRequest, SyncResponse};

/// Wrapper to implement MultispendNotifications for MultispendServices
pub struct MultispendNotificationsProvider(pub Arc<MultispendServices>);

#[apply(async_trait_maybe_send!)]
impl MultispendNotifications for MultispendNotificationsProvider {
    async fn add_deposit_notification(
        &self,
        room: RpcRoomId,
        amount: FiatAmount,
        txid: TransactionId,
        description: String,
    ) {
        self.0
            .completion_notification
            .add_deposit_notification(room, amount, txid, description)
            .await;
    }

    async fn add_withdrawal_notification(
        &self,
        room: RpcRoomId,
        request_id: RpcEventId,
        amount: FiatAmount,
        txid: TransactionId,
    ) {
        self.0
            .completion_notification
            .add_withdrawal_notification(room, request_id, amount, txid)
            .await;
    }

    async fn add_failed_withdrawal_notification(
        &self,
        room: RpcRoomId,
        request_id: RpcEventId,
        error: String,
    ) {
        self.0
            .completion_notification
            .add_failed_withdrawal_notification(room, request_id, error)
            .await;
    }
}

/// Wrapper to implement FederationProvider for Federations
pub struct FederationProviderWrapper(pub Arc<Federations>);

#[apply(async_trait_maybe_send!)]
impl FederationProvider for FederationProviderWrapper {
    async fn spv2_transfer(
        &self,
        federation_id: &str,
        signed_request: SignedTransferRequest,
        meta: SPv2TransferMetadata,
    ) -> anyhow::Result<OperationId> {
        let federation = self.0.get_federation(federation_id)?;
        federation.spv2_transfer(signed_request, meta).await
    }

    async fn multispend_group_sync_info(
        &self,
        federation_id: &str,
        account_id: AccountId,
    ) -> anyhow::Result<SyncResponse> {
        let federation = self.0.get_federation(federation_id)?;
        federation.multispend_group_sync_info(account_id).await
    }
}
