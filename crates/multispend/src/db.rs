use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use futures::StreamExt as _;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{RpcEventId, RpcFederationId, RpcFiatAmount, RpcTransactionId};
use stability_pool_client::common::SignedTransferRequest;
use ts_rs::TS;

use super::{
    FinalizedGroup, GroupInvitationWithKeys, MultispendDepositEventData, MultispendEvent,
    WithdrawRequestWithApprovals, WithdrawalResponseType,
};

pub enum MultispendDbPrefix {
    /// (room_id) => MultispendGroupStatus
    MultispendGroupStatus = 0x01,
    /// (room_id, event_id) => Invitation + accumulated state
    MultispendGroupInvitations = 0x02,
    /// (room_id, event_id) => Withdrawal request + accumulated state
    MultispendWithdrawRequests = 0x03,
    /// (room_id, event_id) => Deposit Notification
    MultispendDepositEvent = 0x04,
    /// (room_id) => Last event that was scanned. Used for incremental
    /// rescanning.
    MultispendScannerLastEvent = 0x05,
    /// (room_id, counter) => (eventid, time) to have a paginated view for
    /// withdrawals and deposits in the room.
    MultispendChronologicalEvent = 0x06,
    /// (room_id) => () to mark room for scanning on any event.
    MultispendMarkedForScanning = 0x07,
    /// (event_id) => () to check if a multispend event is invalid.
    MultispendInvalidEvent = 0x08,
    /// (room_id, event_id) => () list of our withdrawal requests that are not
    /// submited to federation yet
    MultispendPendingApprovedWithdrawalRequests = 0x09,
    /// (room_id, multispend_event) => () list of pending multispend events to
    /// send into group.
    MultispendPendingCompletionNotification = 0x0A,
}

/// Represents the current status of a multispend group in a room
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Encodable, Decodable, TS)]
#[serde(tag = "status")]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MultispendGroupStatus {
    Finalized {
        invite_event_id: RpcEventId,
        finalized_group: FinalizedGroup,
    },
    ActiveInvitation {
        active_invite_id: RpcEventId,
    },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Encodable, Decodable, TS)]
#[serde(tag = "status")]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcMultispendGroupStatus {
    /// Either no inviations or all invitation got aborted
    Inactive,
    /// There is an active invite
    ActiveInvitation {
        active_invite_id: RpcEventId,
        state: GroupInvitationWithKeys,
    },
    /// Group is ready.
    Finalized {
        invite_event_id: RpcEventId,
        finalized_group: FinalizedGroup,
    },
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendGroupStatusKey(pub RpcRoomId);

impl_db_record!(
    key = MultispendGroupStatusKey,
    value = MultispendGroupStatus,
    db_prefix = MultispendDbPrefix::MultispendGroupStatus,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendInvitationKey(pub RpcRoomId, pub RpcEventId);

impl_db_record!(
    key = MultispendInvitationKey,
    value = GroupInvitationWithKeys,
    db_prefix = MultispendDbPrefix::MultispendGroupInvitations,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendWithdrawRequestKey {
    pub room_id: RpcRoomId,
    pub withdraw_request_event_id: RpcEventId,
}

impl_db_record!(
    key = MultispendWithdrawRequestKey,
    value = WithdrawRequestWithApprovals,
    db_prefix = MultispendDbPrefix::MultispendWithdrawRequests,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendScannerLastEventKey(pub RpcRoomId);

impl_db_record!(
    key = MultispendScannerLastEventKey,
    value = RpcEventId,
    db_prefix = MultispendDbPrefix::MultispendScannerLastEvent,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendChronologicalEventKey {
    pub room_id: RpcRoomId,
    pub counter: u64,
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendChronologicalEventKeyPrefix {
    pub room_id: RpcRoomId,
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendChronologicalEventData {
    pub event_id: RpcEventId,
    pub event_time: u64,
}

impl_db_record!(
    key = MultispendChronologicalEventKey,
    value = MultispendChronologicalEventData,
    db_prefix = MultispendDbPrefix::MultispendChronologicalEvent,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendMarkedForScanning(pub RpcRoomId);

impl_db_record!(
    key = MultispendMarkedForScanning,
    value = (),
    db_prefix = MultispendDbPrefix::MultispendMarkedForScanning,
);

impl_db_lookup!(
    key = MultispendChronologicalEventKey,
    query_prefix = MultispendChronologicalEventKeyPrefix
);

pub async fn multispend_chronological_event_count(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
) -> u64 {
    dbtx.find_by_prefix_sorted_descending(&MultispendChronologicalEventKeyPrefix {
        room_id: room_id.clone(),
    })
    .await
    .next()
    .await
    .map_or(0, |(MultispendChronologicalEventKey { counter, .. }, _)| {
        counter + 1
    })
}

pub async fn insert_multispend_chronological_event(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    event_id: &RpcEventId,
    event_time: u64,
) {
    let next_index = multispend_chronological_event_count(dbtx, room_id).await;

    let data = MultispendChronologicalEventData {
        event_id: event_id.clone(),
        event_time,
    };
    let key = MultispendChronologicalEventKey {
        room_id: room_id.clone(),
        counter: next_index,
    };

    dbtx.insert_entry(&key, &data).await;
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendDepositEventKey {
    pub room_id: RpcRoomId,
    pub deposit_event_id: RpcEventId,
}

impl_db_record!(
    key = MultispendDepositEventKey,
    value = MultispendDepositEventData,
    db_prefix = MultispendDbPrefix::MultispendDepositEvent,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendInvalidEvent(pub RpcEventId);

impl_db_record!(
    key = MultispendInvalidEvent,
    value = (),
    db_prefix = MultispendDbPrefix::MultispendInvalidEvent,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendPendingApprovedWithdrawalRequestKey {
    pub room_id: RpcRoomId,
    pub request_event_id: RpcEventId,
    pub federation_id: RpcFederationId,
    pub transfer_request: SignedTransferRequest,
}

impl_db_record!(
    key = MultispendPendingApprovedWithdrawalRequestKey,
    value = (),
    db_prefix = MultispendDbPrefix::MultispendPendingApprovedWithdrawalRequests,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendPendingApprovedWithdrawalRequestKeyPrefix;

impl_db_lookup!(
    key = MultispendPendingApprovedWithdrawalRequestKey,
    query_prefix = MultispendPendingApprovedWithdrawalRequestKeyPrefix,
);

/// When a withdrawal request has the required number of votes, the requestor
/// "queues" it for submission to the federation by writing it with a
/// [`MultispendPendingApprovedWithdrawalRequestKey`]. From there, a background
/// service [`super::withdrawal_service::WithdrawalService`] processes these
/// queued up transactions. Finally, within the federation's subscribe_ function
/// for spv2 transfers, we read the meta to identify any multispend-group
/// deposit/withdrawal TXs, and update the final TX status by writing it here.
#[derive(Debug, Clone, Encodable, Decodable)]
pub enum MultispendPendingCompletionNotification {
    /// Withdrawal Tx was successful
    Withdrawal {
        room_id: RpcRoomId,
        request_id: RpcEventId,
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
    },
    /// Withdrawal Tx was rejected by the federation
    FailedWithdrawal {
        room_id: RpcRoomId,
        request_id: RpcEventId,
        error: String,
    },
    /// Deposit Tx was successful
    Deposit {
        room_id: RpcRoomId,
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
        description: String,
    },
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendPendingCompletionNotificationPrefix;

impl_db_record!(
    key = MultispendPendingCompletionNotification,
    value = (),
    db_prefix = MultispendDbPrefix::MultispendPendingCompletionNotification,
);

impl_db_lookup!(
    key = MultispendPendingCompletionNotification,
    query_prefix = MultispendPendingCompletionNotificationPrefix,
);

impl MultispendPendingCompletionNotification {
    pub fn room_id(&self) -> &RpcRoomId {
        match self {
            MultispendPendingCompletionNotification::Withdrawal { room_id, .. } => room_id,
            MultispendPendingCompletionNotification::FailedWithdrawal { room_id, .. } => room_id,
            MultispendPendingCompletionNotification::Deposit { room_id, .. } => room_id,
        }
    }
    pub fn multispend_event(&self) -> MultispendEvent {
        match self {
            MultispendPendingCompletionNotification::Withdrawal {
                request_id,
                fiat_amount,
                txid,
                ..
            } => MultispendEvent::WithdrawalResponse {
                request: request_id.clone(),
                response: WithdrawalResponseType::Complete {
                    fiat_amount: *fiat_amount,
                    txid: *txid,
                },
            },

            MultispendPendingCompletionNotification::FailedWithdrawal {
                request_id, error, ..
            } => MultispendEvent::WithdrawalResponse {
                request: request_id.clone(),
                response: WithdrawalResponseType::TxRejected {
                    error: error.to_string(),
                },
            },

            MultispendPendingCompletionNotification::Deposit {
                fiat_amount,
                txid,
                description,
                ..
            } => MultispendEvent::DepositNotification {
                fiat_amount: *fiat_amount,
                txid: *txid,
                description: description.clone(),
            },
        }
    }
}
