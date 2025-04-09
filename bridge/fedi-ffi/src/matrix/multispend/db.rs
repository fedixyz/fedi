use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use futures::StreamExt as _;
use stability_pool_client::common::Account;

use super::{GroupInvitationWithKeys, MultispendDepositEventData, WithdrawRequestWithApprovals};
use crate::matrix::RpcRoomId;
use crate::types::RpcEventId;

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
}

/// Represents the current status of a multispend group in a room
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Encodable, Decodable)]
pub enum MultispendGroupStatus {
    Finalized {
        finalized_group: GroupInvitationWithKeys,
        sp_account: Account,
    },
    ActiveInvitation {
        active_invite_id: RpcEventId,
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
