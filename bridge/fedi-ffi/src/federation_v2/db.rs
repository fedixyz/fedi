use std::time::SystemTime;

use bitcoin::secp256k1;
use fedimint_core::core::OperationId;
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_record, Amount};

use crate::types::OperationFediFeeStatus;

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
pub struct LastActiveGatewayKey;

impl_db_record!(
    key = LastActiveGatewayKey,
    value = secp256k1::PublicKey,
    db_prefix = BridgeDbPrefix::LastActiveGateway,
);
