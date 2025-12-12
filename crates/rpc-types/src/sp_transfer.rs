use fedimint_core::encoding::{Decodable, Encodable};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{RpcEventId, RpcFederationId, RpcFiatAmount, RpcTransactionId};

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[ts(export)]
pub struct RpcAccountId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
pub enum RpcSpTransferEvent {
    PendingTransferStart {
        amount: RpcFiatAmount,
        federation_id: RpcFederationId,
        federation_invite: Option<String>,
        #[ts(skip)]
        nonce: u64,
    },
    TransferSentHint {
        pending_transfer_id: RpcEventId,
        transaction_id: RpcTransactionId,
    },
    TransferFailed {
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
    SentHint,
    /// TODO: this state is not reachable right now, we need to check with
    /// federation to reach this
    Complete,
    Failed,
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
