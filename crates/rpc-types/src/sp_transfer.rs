use fedimint_core::encoding::{Decodable, Encodable};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{RpcEventId, RpcFederationId, RpcFiatAmount, RpcRoomId, RpcTransactionId};

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[ts(export)]
pub struct RpcAccountId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[ts(export)]
pub struct SpMatrixTransferId {
    pub room_id: RpcRoomId,
    pub event_id: RpcEventId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum RpcSpTransferEvent {
    PendingTransferStart {
        amount: RpcFiatAmount,
        federation_id: RpcFederationId,
        federation_invite: Option<String>,
        nonce: u64,
    },
    TransferSentHint {
        pending_transfer_id: RpcEventId,
        transaction_id: RpcTransactionId,
    },
    TransferFailed {
        pending_transfer_id: RpcEventId,
    },
    FederationInviteDenied {
        pending_transfer_id: RpcEventId,
    },
    AnnounceAccount {
        account_id: RpcAccountId,
        federation_id: RpcFederationId,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "status")]
#[ts(export)]
pub enum RpcSpTransferStatus {
    Pending,
    Complete,
    Failed,
    FederationInviteDenied,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcSpTransferState {
    pub federation_id: RpcFederationId,
    pub amount: RpcFiatAmount,
    pub status: RpcSpTransferStatus,
    pub invite_code: Option<String>,
}
