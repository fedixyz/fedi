use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use rpc_types::matrix::RpcRoomId;
use rpc_types::sp_transfer::SpMatrixTransferId;
use rpc_types::{RpcFederationId, RpcFiatAmount, RpcTransactionId};
use stability_pool_client::common::AccountId;

use super::SpTransfersDbPrefix;

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct KnownReceiverAccountIdKey {
    pub room_id: RpcRoomId,
    pub federation_id: RpcFederationId,
}

impl_db_record!(
    key = KnownReceiverAccountIdKey,
    value = AccountId,
    db_prefix = SpTransfersDbPrefix::KnownReceiverAccountId,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub enum SptPendingCompletionNotification {
    Success {
        transfer_id: SpMatrixTransferId,
        federation_id: RpcFederationId,
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
    },
    Failed {
        transfer_id: SpMatrixTransferId,
    },
}

impl SptPendingCompletionNotification {
    pub fn room_id(&self) -> &RpcRoomId {
        match self {
            Self::Success { transfer_id, .. } | Self::Failed { transfer_id, .. } => {
                &transfer_id.room_id
            }
        }
    }
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct SptPendingCompletionNotificationPrefix;

impl_db_record!(
    key = SptPendingCompletionNotification,
    value = (),
    db_prefix = SpTransfersDbPrefix::PendingCompletionNotification,
);

impl_db_lookup!(
    key = SptPendingCompletionNotification,
    query_prefix = SptPendingCompletionNotificationPrefix,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct SenderAwaitingAccountAnnounceEventKey(pub SpMatrixTransferId);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct SenderAwaitingAccountAnnounceEventKeyPrefix;

impl_db_record!(
    key = SenderAwaitingAccountAnnounceEventKey,
    value = (),
    db_prefix = SpTransfersDbPrefix::SenderAwaitingAccountAnnounceEvent,
);

impl_db_lookup!(
    key = SenderAwaitingAccountAnnounceEventKey,
    query_prefix = SenderAwaitingAccountAnnounceEventKeyPrefix,
);
