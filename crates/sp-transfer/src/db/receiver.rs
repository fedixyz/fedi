use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use rpc_types::sp_transfer::SpMatrixTransferId;

use super::SpTransfersDbPrefix;

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct PendingReceiverAccountIdEventKey(pub SpMatrixTransferId);

impl_db_record!(
    key = PendingReceiverAccountIdEventKey,
    value = (),
    db_prefix = SpTransfersDbPrefix::PendingReceiverAccountIdEvent,
);

#[derive(Debug, Clone, Encodable, Decodable)]
pub struct PendingReceiverAccountIdEventKeyPrefix;

impl_db_lookup!(
    key = PendingReceiverAccountIdEventKey,
    query_prefix = PendingReceiverAccountIdEventKeyPrefix,
);
