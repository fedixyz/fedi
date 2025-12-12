use std::sync::Arc;

use federations::Federations;
use federations::federation_v2::client::ClientExt;
use federations::federation_v2::{MultispendNotifications, SptNotifications};
use fedimint_core::core::OperationId;
use fedimint_core::{TransactionId, apply, async_trait_maybe_send};
use multispend::FederationProvider;
use multispend::services::MultispendServices;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{RpcEventId, SPv2TransferMetadata};
use sp_transfer::services::SptFederationProvider;
use sp_transfer::services::transfer_complete_notifier::SptTransferCompleteNotifier;
use stability_pool_client::common::{AccountId, FiatAmount, SignedTransferRequest, SyncResponse};

/// Wrapper to implement SP Transfers notifications for Federations
pub struct SptNotificationsProvider(pub Arc<SptTransferCompleteNotifier>);

#[apply(async_trait_maybe_send!)]
impl SptNotifications for SptNotificationsProvider {
    async fn add_spt_completion_notification(
        &self,
        room: RpcRoomId,
        pending_transfer_id: RpcEventId,
        federation_id: String,
        amount: FiatAmount,
        txid: TransactionId,
    ) {
        self.0
            .add_completion_notification(room, pending_transfer_id, federation_id, amount.0, txid)
            .await;
    }

    async fn add_spt_failed_notification(&self, room: RpcRoomId, pending_transfer_id: RpcEventId) {
        self.0
            .add_failed_notification(room, pending_transfer_id)
            .await;
    }
}

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

pub struct SptFederationProviderWrapper(pub Arc<Federations>);

#[apply(async_trait_maybe_send!)]
impl SptFederationProvider for SptFederationProviderWrapper {
    async fn spv2_transfer_with_nonce(
        &self,
        federation_id: &str,
        nonce: u64,
        to_account: AccountId,
        amount: FiatAmount,
        meta: SPv2TransferMetadata,
    ) -> anyhow::Result<OperationId> {
        let federation = self.0.get_federation(federation_id)?;
        let signed_request =
            federation.spv2_build_signed_transfer_request_with_nonce(nonce, to_account, amount)?;
        federation.spv2_transfer(signed_request, meta).await
    }

    async fn our_seeker_account_id(&self, federation_id: &str) -> Option<AccountId> {
        let federation = self.0.get_federation(federation_id).ok()?;
        federation.client.spv2().ok().map(|spv2| {
            spv2.our_account(stability_pool_client::common::AccountType::Seeker)
                .id()
        })
    }
}
