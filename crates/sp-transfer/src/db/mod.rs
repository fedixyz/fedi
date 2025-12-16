use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::impl_db_record;
use rpc_types::matrix::RpcUserId;
use rpc_types::sp_transfer::SpMatrixTransferId;
use rpc_types::{RpcFederationId, RpcFiatAmount, RpcTransactionId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpTransferStatus {
    Pending,
    SentHint { transaction_id: RpcTransactionId },
    Failed,
}

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
    pub sent_by: RpcUserId,
    pub federation_invite: Option<String>,
    pub nonce: u64,
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferEventKey(pub SpMatrixTransferId);

impl_db_record!(
    key = TransferEventKey,
    value = TransferEventValue,
    db_prefix = SpTransfersDbPrefix::TransferEvent,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferSentHintKey(pub SpMatrixTransferId);

impl_db_record!(
    key = TransferSentHintKey,
    value = RpcTransactionId,
    db_prefix = SpTransfersDbPrefix::TransferSentHint,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferFailedKey(pub SpMatrixTransferId);

impl_db_record!(
    key = TransferFailedKey,
    value = (),
    db_prefix = SpTransfersDbPrefix::TransferFailed,
);

pub(crate) async fn resolve_status_db(
    dbtx: &mut DatabaseTransaction<'_>,
    transfer_id: &SpMatrixTransferId,
) -> SpTransferStatus {
    if dbtx
        .get_value(&TransferFailedKey(transfer_id.clone()))
        .await
        .is_some()
    {
        SpTransferStatus::Failed
    } else if let Some(transaction_id) = dbtx
        .get_value(&TransferSentHintKey(transfer_id.clone()))
        .await
    {
        SpTransferStatus::SentHint { transaction_id }
    } else {
        SpTransferStatus::Pending
    }
}
