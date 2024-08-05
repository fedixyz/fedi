use std::time::SystemTime;

use bitcoin::secp256k1;
use fedimint_core::core::{ModuleKind, OperationId};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record, Amount};

use crate::types::{OperationFediFeeStatus, RpcTransactionDirection};

#[repr(u8)]
pub enum BridgeDbPrefix {
    // Do not use RN, but we should migrate everything to this prefix
    // (after fedimint adds proper support for it)
    // see https://github.com/fedimint/fedimint/pull/4445
    #[allow(dead_code)]
    FedimintUserData = 0xb0,
    ClientConfig = 0xb1,
    XmppUsername = 0xb2,
    InviteCode = 0xb3,
    LastBackupTimestamp = 0xb4,
    TransactionNote = 0xb7,
    OutstandingFediFees = 0xb8,
    OperationFediFeeStatus = 0xb9,
    LastActiveGateway = 0xba,

    // Index of the stability pool cycle during which the last deposit was made. We track this so
    // we can determine when user's deposit(s) are unfilled. Any staged/pending seeks that exist
    // in a cycle after this last recorded cycle are by definition unfilled and therefore may be
    // withdrawn back as e-cash.
    LastStabilityPoolDepositCycle = 0xbb,

    // We need to track pending accrued Fedi app fees separately from outstanding/successfully
    // accrued Fedi app fees. As pending operations succeed, we move their share of the pending
    // Fedi app fees to the oustanding Fedi app fees.
    PendingFediFees = 0xbc,

    // In a subsequent iteration of the app fee design, we decided to split fee collection by
    // module and then by transaction direction (send vs receive). So now we track outstanding and
    // pending Fedi fees within a map where the key is composite (module, TX direction) and the
    // value is msat. Essentially, we split up the single counters for outstanding and pending
    // Fedi fees into (2 * M) counters where M is the number of fee-relevant modules. Currently M
    // = 4 (mint, ln, wallet, stability-pool).
    OutstandingFediFeesPerTXType = 0xbd,
    PendingFediFeesPerTXType = 0xbe,

    // Do not use anything after this key (inclusive)
    // see https://github.com/fedimint/fedimint/pull/4445
    #[allow(dead_code)]
    FedimintInternalReservedStart = 0xd0,
}

#[derive(Debug, Decodable, Encodable)]
pub struct FediRawClientConfigKey;

impl_db_record!(
    key = FediRawClientConfigKey,
    value = String,
    db_prefix = BridgeDbPrefix::ClientConfig,
);

#[derive(Debug, Decodable, Encodable)]
pub struct XmppUsernameKey;

impl_db_record!(
    key = XmppUsernameKey,
    value = String,
    db_prefix = BridgeDbPrefix::XmppUsername,
);

#[derive(Debug, Decodable, Encodable)]
pub struct InviteCodeKey;

impl_db_record!(
    key = InviteCodeKey,
    value = String,
    db_prefix = BridgeDbPrefix::InviteCode,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastBackupTimestampKey;

impl fedimint_core::db::DatabaseRecord for LastBackupTimestampKey {
    const DB_PREFIX: u8 = BridgeDbPrefix::LastBackupTimestamp as u8;
    type Key = Self;
    type Value = SystemTime;
}

#[derive(Debug, Decodable, Encodable)]
pub struct TransactionNotesKey(pub OperationId);

impl_db_record!(
    key = TransactionNotesKey,
    value = String,
    db_prefix = BridgeDbPrefix::TransactionNote,
);

#[derive(Debug, Decodable, Encodable)]
pub struct OutstandingFediFeesKey;

impl_db_record!(
    key = OutstandingFediFeesKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::OutstandingFediFees,
);

#[derive(Debug, Decodable, Encodable)]
pub struct OperationFediFeeStatusKey(pub OperationId);

impl_db_record!(
    key = OperationFediFeeStatusKey,
    value = OperationFediFeeStatus,
    db_prefix = BridgeDbPrefix::OperationFediFeeStatus,
);

#[derive(Debug, Decodable, Encodable)]
pub struct PendingFediFeesKey;

impl_db_record!(
    key = PendingFediFeesKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::PendingFediFees,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastActiveGatewayKey;

impl_db_record!(
    key = LastActiveGatewayKey,
    value = secp256k1::PublicKey,
    db_prefix = BridgeDbPrefix::LastActiveGateway,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastStabilityPoolDepositCycleKey;

impl_db_record!(
    key = LastStabilityPoolDepositCycleKey,
    value = u64,
    db_prefix = BridgeDbPrefix::LastStabilityPoolDepositCycle,
);

#[derive(Debug, Decodable, Encodable)]
pub struct OutstandingFediFeesPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

#[derive(Debug, Encodable, Decodable)]
pub struct OutstandingFediFeesPerTXTypeKeyPrefix;

impl_db_record!(
    key = OutstandingFediFeesPerTXTypeKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::OutstandingFediFeesPerTXType,
);

impl_db_lookup!(
    key = OutstandingFediFeesPerTXTypeKey,
    query_prefix = OutstandingFediFeesPerTXTypeKeyPrefix,
);

#[derive(Debug, Decodable, Encodable)]
pub struct PendingFediFeesPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

#[derive(Debug, Encodable, Decodable)]
pub struct PendingFediFeesPerTXTypeKeyPrefix;

impl_db_record!(
    key = PendingFediFeesPerTXTypeKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::PendingFediFeesPerTXType,
);

impl_db_lookup!(
    key = PendingFediFeesPerTXTypeKey,
    query_prefix = PendingFediFeesPerTXTypeKeyPrefix,
);
