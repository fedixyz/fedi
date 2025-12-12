use std::sync::Arc;

use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::impl_db_record;
use rpc_types::matrix::{RpcRoomId, RpcUserId};
use rpc_types::sp_transfer::{RpcSpTransferState, RpcSpTransferStatus};
use rpc_types::{RpcEventId, RpcFederationId, RpcFiatAmount, RpcTransactionId};
use runtime::bridge_runtime::Runtime;

pub mod receiver;
pub mod sender;

pub use receiver::*;
pub use sender::*;

/// DB namespace for SP Transfers within Runtime::sp_transfers_db()
enum SpTransfersDbPrefix {
    /// (pending_transfer_id) => TransferEventValue
    TransferEvent = 0x01,
    /// (room_id, federation_id) => AccountId
    KnownReceiverAccountId = 0x02,
    /// (pending_transfer_id) => RpcTransactionId
    TransferSentHint = 0x03,
    /// (pending_transfer_id) => ()
    SenderAwaitingAccountAnnounceEvent = 0x04,
    /// (pending_transfer_id) => ()
    PendingReceiverAccountIdEvent = 0x05,
    /// Queue of pending completion notifications
    PendingCompletionNotification = 0x06,
    /// (pending_transfer_id) => ()
    TransferFailed = 0x07,
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferEventValue {
    pub amount: RpcFiatAmount,
    pub federation_id: RpcFederationId,
    pub room_id: RpcRoomId,
    pub sent_by: RpcUserId,
    pub federation_invite: Option<String>,
    pub nonce: u64,
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferEventKey {
    pub pending_transfer_id: RpcEventId,
}

impl_db_record!(
    key = TransferEventKey,
    value = TransferEventValue,
    db_prefix = SpTransfersDbPrefix::TransferEvent,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferSentHintKey {
    pub pending_transfer_id: RpcEventId,
}

impl_db_record!(
    key = TransferSentHintKey,
    value = RpcTransactionId,
    db_prefix = SpTransfersDbPrefix::TransferSentHint,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferFailedKey {
    pub pending_transfer_id: RpcEventId,
}

impl_db_record!(
    key = TransferFailedKey,
    value = (),
    db_prefix = SpTransfersDbPrefix::TransferFailed,
);

pub async fn resolve_transfer_state(
    runtime: Arc<Runtime>,
    pending_transfer_id: &RpcEventId,
) -> Option<RpcSpTransferState> {
    let spt_db = runtime.sp_transfers_db();
    let mut dbtx = spt_db.begin_transaction_nc().await;

    let transfer = dbtx
        .get_value(&TransferEventKey {
            pending_transfer_id: pending_transfer_id.clone(),
        })
        .await?;

    Some(RpcSpTransferState {
        status: resolve_status_db(&mut dbtx, pending_transfer_id, &transfer).await,
        federation_id: transfer.federation_id,
        amount: transfer.amount,
        invite_code: transfer.federation_invite,
    })
}

pub(crate) async fn resolve_status_db(
    dbtx: &mut DatabaseTransaction<'_>,
    pending_transfer_id: &RpcEventId,
    _transfer: &TransferEventValue,
) -> RpcSpTransferStatus {
    if dbtx
        .get_value(&TransferFailedKey {
            pending_transfer_id: pending_transfer_id.clone(),
        })
        .await
        .is_some()
    {
        RpcSpTransferStatus::Failed
    } else if dbtx
        .get_value(&TransferSentHintKey {
            pending_transfer_id: pending_transfer_id.clone(),
        })
        .await
        .is_some()
    {
        // TODO: Calculate Complete status correctly by checking if the transfer
        // has actually been received/confirmed, not just sent
        RpcSpTransferStatus::SentHint
    } else {
        RpcSpTransferStatus::Pending
    }
}
