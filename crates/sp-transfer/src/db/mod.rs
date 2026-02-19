use std::time::{Duration, SystemTime};

use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::impl_db_record;
use rpc_types::matrix::RpcUserId;
use rpc_types::sp_transfer::SpMatrixTransferId;
use rpc_types::{RpcFederationId, RpcFiatAmount, RpcTransactionId};
use runtime::bridge_runtime::Runtime;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpTransferStatus {
    Pending,
    SentHint { transaction_id: RpcTransactionId },
    Failed,
    FederationInviteDenied,
    Expired,
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
    /// (pending_transfer_id) => ()
    FederationInviteDenied = 0x08,
}

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct TransferEventValue {
    pub amount: RpcFiatAmount,
    pub federation_id: RpcFederationId,
    pub sent_by: RpcUserId,
    pub federation_invite: Option<String>,
    pub nonce: u64,
    pub created_at: SystemTime,
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

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct FederationInviteDeniedKey(pub SpMatrixTransferId);

impl_db_record!(
    key = FederationInviteDeniedKey,
    value = (),
    db_prefix = SpTransfersDbPrefix::FederationInviteDenied,
);

pub(crate) async fn resolve_status_db(
    dbtx: &mut DatabaseTransaction<'_>,
    transfer_id: &SpMatrixTransferId,
    transfer: &TransferEventValue,
    runtime: &Runtime,
) -> SpTransferStatus {
    let transfer_expiry = Duration::from_secs(
        runtime
            .feature_catalog
            .sp_transfers_matrix
            .as_ref()
            .expect("sp_transfers_matrix feature must be enabled")
            .transfer_expiry_secs as u64,
    );
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
    } else if dbtx
        .get_value(&FederationInviteDeniedKey(transfer_id.clone()))
        .await
        .is_some()
    {
        SpTransferStatus::FederationInviteDenied
    } else if fedimint_core::time::now()
        .duration_since(transfer.created_at)
        .unwrap_or_default()
        >= transfer_expiry
    {
        SpTransferStatus::Expired
    } else {
        SpTransferStatus::Pending
    }
}
