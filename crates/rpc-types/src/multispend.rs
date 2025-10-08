use std::collections::{BTreeMap, BTreeSet};

use fedimint_core::encoding::{Decodable, Encodable};
use serde::{Deserialize, Serialize};
use stability_pool_client::common::TransferRequest;
use ts_rs::TS;

use crate::matrix::RpcUserId;
use crate::{RpcEventId, RpcFiatAmount, RpcPublicKey, RpcSignature, RpcTransactionId};

#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, TS, Encodable, Decodable,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GroupInvitation {
    pub signers: BTreeSet<RpcUserId>,
    #[ts(type = "number")]
    pub threshold: u64,
    pub federation_invite_code: String,
    pub federation_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
pub enum MultispendGroupVoteType {
    Accept { member_pubkey: RpcPublicKey },
    Reject,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
pub enum WithdrawalResponseType {
    Approve {
        signature: RpcSignature,
    },
    Reject,
    Complete {
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
    },
    /// Just because a withdrawal request attained a threshold number of
    /// approvals doesn't meant that it will be accepted as a valid TX by the
    /// federation (for example, if requested withdrawal amount > group balance
    /// at time of transaction). This variant is to broadcast such TX
    /// rejections.
    TxRejected {
        error: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
/// JSON formatted event that is sent in matrix room.
pub enum MultispendEvent {
    GroupInvitation {
        invitation: GroupInvitation,
        proposer_pubkey: RpcPublicKey,
    },

    GroupInvitationVote {
        invitation: RpcEventId,
        vote: MultispendGroupVoteType,
    },

    GroupInvitationCancel {
        invitation: RpcEventId,
    },

    /// Reannouncement of group to newly invite members.
    GroupReannounce {
        invitation_id: RpcEventId,
        invitation: GroupInvitation,
        proposer: RpcUserId,
        pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
        rejections: BTreeSet<RpcUserId>,
    },

    DepositNotification {
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
        description: String,
    },

    WithdrawalRequest {
        #[ts(type = "{ transfer_amount: RpcFiatAmount }")]
        request: TransferRequest,
        description: String,
    },

    WithdrawalResponse {
        request: RpcEventId,
        response: WithdrawalResponseType,
    },
}
