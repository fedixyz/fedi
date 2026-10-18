use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use futures::StreamExt as _;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{RpcEventId, RpcFederationId, RpcTransactionId};
use ts_rs::TS;

use super::{
    FinalizedGroup, GroupInvitationWithKeys, MsEvent, MultispendAmount, MultispendDepositEventData,
    MultispendGroupKind, SignedMultispendTransferRequest, WithdrawRequestWithApprovals,
    WithdrawalResponseType,
};

pub enum MultispendDbPrefix {
    /// (room_id, kind) => MultispendGroupStatus
    MultispendGroupStatus = 0x01,
    /// (room_id, kind, event_id) => Invitation + accumulated state
    MultispendGroupInvitations = 0x02,
    /// (room_id, event_id) => Withdrawal request + accumulated state
    MultispendWithdrawRequests = 0x03,
    /// (room_id, event_id) => Deposit Notification
    MultispendDepositEvent = 0x04,
    /// (room_id) => Last event that was scanned. Used for incremental
    /// rescanning.
    MultispendScannerLastEvent = 0x05,
    /// (room_id, kind, counter) => (eventid, time) to have a paginated view
    /// for withdrawals and deposits of a group in the room.
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
    /// (pending_notification) => matrix transaction id used for retries.
    MultispendPendingCompletionNotificationTxnId = 0x0B,
    // 0x50 holds the version of fedimint's migration runner, see
    // `crate::migration::migrate_multispend_db`.
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
pub struct MultispendGroupStatusKey(pub RpcRoomId, pub MultispendGroupKind);

impl_db_record!(
    key = MultispendGroupStatusKey,
    value = MultispendGroupStatus,
    db_prefix = MultispendDbPrefix::MultispendGroupStatus,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendInvitationKey(pub RpcRoomId, pub MultispendGroupKind, pub RpcEventId);

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
    pub kind: MultispendGroupKind,
    pub counter: u64,
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendChronologicalEventKeyPrefix {
    pub room_id: RpcRoomId,
    pub kind: MultispendGroupKind,
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
    kind: MultispendGroupKind,
) -> u64 {
    dbtx.find_by_prefix_sorted_descending(&MultispendChronologicalEventKeyPrefix {
        room_id: room_id.clone(),
        kind,
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
    kind: MultispendGroupKind,
    event_id: &RpcEventId,
    event_time: u64,
) {
    let next_index = multispend_chronological_event_count(dbtx, room_id, kind).await;

    let data = MultispendChronologicalEventData {
        event_id: event_id.clone(),
        event_time,
    };
    let key = MultispendChronologicalEventKey {
        room_id: room_id.clone(),
        kind,
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
    pub transfer_request: SignedMultispendTransferRequest,
}

impl_db_record!(
    key = MultispendPendingApprovedWithdrawalRequestKey,
    value = (),
    db_prefix = MultispendDbPrefix::MultispendPendingApprovedWithdrawalRequests,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendPendingApprovedWithdrawalRequestKeyPrefix;

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendPendingApprovedWithdrawalRequestKeyRequestPrefix {
    pub room_id: RpcRoomId,
    pub request_event_id: RpcEventId,
}

impl_db_lookup!(
    key = MultispendPendingApprovedWithdrawalRequestKey,
    query_prefix = MultispendPendingApprovedWithdrawalRequestKeyPrefix,
    query_prefix = MultispendPendingApprovedWithdrawalRequestKeyRequestPrefix,
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
        amount: MultispendAmount,
        txid: RpcTransactionId,
    },
    /// Withdrawal Tx was rejected by the federation
    FailedWithdrawal {
        room_id: RpcRoomId,
        request_id: RpcEventId,
        group_kind: MultispendGroupKind,
        error: String,
    },
    /// Deposit Tx was successful
    Deposit {
        room_id: RpcRoomId,
        amount: MultispendAmount,
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

#[derive(Debug, Clone, Encodable, Decodable)]
pub enum MultispendPendingCompletionNotificationId {
    WithdrawalRequestId(RpcEventId),
    TransactionId(RpcTransactionId),
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct MultispendPendingCompletionNotificationTxnIdKey(
    pub MultispendPendingCompletionNotificationId,
);

impl_db_record!(
    key = MultispendPendingCompletionNotificationTxnIdKey,
    value = String,
    db_prefix = MultispendDbPrefix::MultispendPendingCompletionNotificationTxnId,
);

impl MultispendPendingCompletionNotification {
    pub fn notification_id(&self) -> MultispendPendingCompletionNotificationId {
        match self {
            MultispendPendingCompletionNotification::Withdrawal { request_id, .. }
            | MultispendPendingCompletionNotification::FailedWithdrawal { request_id, .. } => {
                MultispendPendingCompletionNotificationId::WithdrawalRequestId(request_id.clone())
            }
            MultispendPendingCompletionNotification::Deposit { txid, .. } => {
                MultispendPendingCompletionNotificationId::TransactionId(*txid)
            }
        }
    }

    pub fn room_id(&self) -> &RpcRoomId {
        match self {
            MultispendPendingCompletionNotification::Withdrawal { room_id, .. } => room_id,
            MultispendPendingCompletionNotification::FailedWithdrawal { room_id, .. } => room_id,
            MultispendPendingCompletionNotification::Deposit { room_id, .. } => room_id,
        }
    }
    pub fn multispend_event(&self) -> MsEvent {
        match self {
            MultispendPendingCompletionNotification::Withdrawal {
                request_id,
                amount,
                txid,
                ..
            } => MsEvent::WithdrawalResponse {
                group_kind: amount.kind(),
                request: request_id.clone(),
                response: WithdrawalResponseType::Complete {
                    amount: *amount,
                    txid: *txid,
                },
            },

            MultispendPendingCompletionNotification::FailedWithdrawal {
                room_id: _,
                request_id,
                group_kind,
                error,
            } => MsEvent::WithdrawalResponse {
                group_kind: *group_kind,
                request: request_id.clone(),
                response: WithdrawalResponseType::TxRejected {
                    error: error.to_string(),
                },
            },

            MultispendPendingCompletionNotification::Deposit {
                amount,
                txid,
                description,
                ..
            } => MsEvent::DepositNotification {
                amount: *amount,
                txid: *txid,
                description: description.clone(),
            },
        }
    }
}
