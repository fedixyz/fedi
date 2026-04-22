#![allow(deprecated)]

use std::time::SystemTime;

use fedimint_core::core::{ModuleKind, OperationId};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{Amount, impl_db_lookup, impl_db_record};
use rpc_types::{OperationFediFeeStatus, RpcTransactionDirection};

use super::FediFeeStream;

#[repr(u8)]
pub enum FediFeeDbPrefix {
    // Stream-scoped total outstanding fees.
    OutstandingByStream = 0x01,
    // Stream-scoped total pending fees.
    PendingByStream = 0x02,
    // Outstanding fees broken down by `(stream, module, direction)`.
    OutstandingByStreamPerTxType = 0x03,
    // Pending fees broken down by `(stream, module, direction)`.
    PendingByStreamPerTxType = 0x04,
    // Next federation-scoped remittance due timestamp for each stream.
    NextRemittanceDueAtByStream = 0x05,
    // One-time marker for migrating legacy app-fee state into stream keys.
    AppFeeStreamStateInitialized = 0x06,
    // Per-operation fee status keyed by `(operation_id, stream)`.
    OperationStatusByStream = 0x07,
    // Current in-flight guardian remittance operation id.
    GuardianRemittanceOperation = 0x08,
    // Last total accrued fee checkpoint used for stream-scoped remittance reporting.
    LastAccruedTotalByStream = 0x09,
    // Total accrued fee counter per stream.
    TotalAccruedByStream = 0x0A,
}

#[derive(Debug, Decodable, Encodable)]
pub struct OperationFediFeeStatusByStreamKey(pub OperationId, pub FediFeeStream);

impl_db_record!(
    key = OperationFediFeeStatusByStreamKey,
    value = OperationFediFeeStatus,
    db_prefix = FediFeeDbPrefix::OperationStatusByStream,
);

#[derive(Debug, Decodable, Encodable)]
pub struct OutstandingFediFeesByStreamKey(pub FediFeeStream);

impl_db_record!(
    key = OutstandingFediFeesByStreamKey,
    value = Amount,
    db_prefix = FediFeeDbPrefix::OutstandingByStream,
);

#[derive(Debug, Decodable, Encodable)]
pub struct PendingFediFeesByStreamKey(pub FediFeeStream);

impl_db_record!(
    key = PendingFediFeesByStreamKey,
    value = Amount,
    db_prefix = FediFeeDbPrefix::PendingByStream,
);

#[derive(Debug, Decodable, Encodable)]
pub struct OutstandingFediFeesByStreamPerTXTypeKey(
    pub FediFeeStream,
    pub ModuleKind,
    pub RpcTransactionDirection,
);

#[derive(Debug, Decodable, Encodable)]
pub struct OutstandingFediFeesByStreamPerTXTypeKeyPrefix(pub FediFeeStream);

impl_db_record!(
    key = OutstandingFediFeesByStreamPerTXTypeKey,
    value = Amount,
    db_prefix = FediFeeDbPrefix::OutstandingByStreamPerTxType,
);

impl_db_lookup!(
    key = OutstandingFediFeesByStreamPerTXTypeKey,
    query_prefix = OutstandingFediFeesByStreamPerTXTypeKeyPrefix,
);

#[derive(Debug, Decodable, Encodable)]
pub struct PendingFediFeesByStreamPerTXTypeKey(
    pub FediFeeStream,
    pub ModuleKind,
    pub RpcTransactionDirection,
);

#[derive(Debug, Decodable, Encodable)]
pub struct PendingFediFeesByStreamPerTXTypeKeyPrefix(pub FediFeeStream);

impl_db_record!(
    key = PendingFediFeesByStreamPerTXTypeKey,
    value = Amount,
    db_prefix = FediFeeDbPrefix::PendingByStreamPerTxType,
);

impl_db_lookup!(
    key = PendingFediFeesByStreamPerTXTypeKey,
    query_prefix = PendingFediFeesByStreamPerTXTypeKeyPrefix,
);

#[derive(Debug, Decodable, Encodable)]
pub struct NextFediFeeRemittanceDueAtByStreamKey(pub FediFeeStream);

impl_db_record!(
    key = NextFediFeeRemittanceDueAtByStreamKey,
    value = SystemTime,
    db_prefix = FediFeeDbPrefix::NextRemittanceDueAtByStream,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastRemittedTotalAccruedFeesByStreamKey(pub FediFeeStream);

impl_db_record!(
    key = LastRemittedTotalAccruedFeesByStreamKey,
    value = Amount,
    db_prefix = FediFeeDbPrefix::LastAccruedTotalByStream,
);

#[derive(Debug, Decodable, Encodable)]
pub struct TotalAccruedFediFeesByStreamKey(pub FediFeeStream);

impl_db_record!(
    key = TotalAccruedFediFeesByStreamKey,
    value = Amount,
    db_prefix = FediFeeDbPrefix::TotalAccruedByStream,
);

// Tracks the current in-flight guardian remittance operation so the background
// service can avoid submitting a second remittance and can recover
// subscriptions across restarts.
#[derive(Debug, Decodable, Encodable)]
pub struct CurrentGuardianFeeRemittanceOperationKey;

impl_db_record!(
    key = CurrentGuardianFeeRemittanceOperationKey,
    value = OperationId,
    db_prefix = FediFeeDbPrefix::GuardianRemittanceOperation,
);

#[derive(Debug, Decodable, Encodable)]
pub struct AppFeeStreamStateInitializedKey;

impl_db_record!(
    key = AppFeeStreamStateInitializedKey,
    value = (),
    db_prefix = FediFeeDbPrefix::AppFeeStreamStateInitialized,
);
