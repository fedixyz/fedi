use std::time::SystemTime;

use bitcoin::secp256k1;
use fedimint_core::core::{ModuleKind, OperationId};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{Amount, impl_db_lookup, impl_db_record};
use rpc_types::{OperationFediFeeStatus, RpcTransactionDirection};
use runtime::storage::state::FiatFXInfo;
use stability_pool_client::common::FiatAmount;

#[repr(u8)]
pub enum BridgeDbPrefix {
    // Do not use RN, but we should migrate everything to this prefix
    // (after fedimint adds proper support for it)
    // see https://github.com/fedimint/fedimint/pull/4445
    #[allow(dead_code)]
    FedimintUserData = 0xb0,
    ClientConfig = 0xb1,
    #[deprecated]
    XmppUsername = 0xb2,
    InviteCode = 0xb3,
    LastBackupTimestamp = 0xb4,
    TransactionNote = 0xb7,
    OutstandingFediFees = 0xb8,
    OperationFediFeeStatus = 0xb9,
    #[deprecated]
    LastUsedGateway = 0xba,

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

    // For each TX, we record the fiat display currency and the fiat value at the time of the TX.
    // This is so that we can display historical values in the TX list as opposed to constantly
    // updating live fiat values.
    TransactionDateFiatInfo = 0xc0,
    // Old one had absolute fiat transaction value.
    #[deprecated]
    TransactionDateFiatInfoOld = 0xbf,

    // Same as [`LastStabilityPoolDepositCycle`] but for the v2 stability pool module.
    LastStabilityPoolV2DepositCycle = 0xc1,

    // The stability pool v2 sweeper service will automatically withdraw deposits that could not
    // be locked. However, if the app crashes before the transaction state machine could actually
    // submit the TX to the servers, then we might accidentally issue another withdrawal on
    // app-restart. So to guard against a repeated withdrawal TX, we store the operation ID and
    // check it first.
    LastSPv2SweeperWithdrawal = 0xc2,

    // For the Fedi Gift project (iteration #1), we decided to include all the relevant data
    // reporting together with the Fedi fee invoice generator endpoint. Fedi fee invoice currently
    // only works with a remittance threshold amount, which can lead to long time periods in
    // between queries. To somewhat normalize the reporting frequency for Fedi gift data, we also
    // decide to introduce a time-based check to trigger Fedi fee invoice generation.
    FediFeesRemittanceTimestampPerTXType = 0xc3,

    // For the Fedi gift project (iteration #1), we would also like to know the aggregate SPV2
    // balance of the reporting users. We accomplish this by storing the SPV2 balance as of the
    // last fee invoice request. The first time we send up the actual balance. Every subsequent
    // time, we send up the delta since last time.
    LastFediFeesRemittanceSPv2Balance = 0xc4,

    // Opposed to the Oustanding fedi fee which increases between remissions, and is cleared out
    // to 0 upon remission, the total accrued fedi fee only ever goes up.
    TotalAccruedFediFeesPerTXType = 0xc5,

    // For the Fedi gift project (iteration #1), we ask for a 0-invoice amount when the
    // outstanding fee is below the threshold. However, we would still like to tell the server
    // about the additional accrued fee since last time so that TX volume can be approximated.
    LastFediFeesRemittanceTotalAccruedFees = 0xc6,

    // Gateway override used by gateway selection
    GatewayOverride = 0xc7,

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
pub struct GatewayOverrideKey;

impl_db_record!(
    key = GatewayOverrideKey,
    value = secp256k1::PublicKey,
    db_prefix = BridgeDbPrefix::GatewayOverride,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastStabilityPoolDepositCycleKey;

impl_db_record!(
    key = LastStabilityPoolDepositCycleKey,
    value = u64,
    db_prefix = BridgeDbPrefix::LastStabilityPoolDepositCycle,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastStabilityPoolV2DepositCycleKey;

impl_db_record!(
    key = LastStabilityPoolV2DepositCycleKey,
    value = u64,
    db_prefix = BridgeDbPrefix::LastStabilityPoolV2DepositCycle,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastSPv2SweeperWithdrawalKey;

impl_db_record!(
    key = LastSPv2SweeperWithdrawalKey,
    value = OperationId,
    db_prefix = BridgeDbPrefix::LastSPv2SweeperWithdrawal,
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

#[derive(Debug, Decodable, Encodable)]
pub struct TotalAccruedFediFeesPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

impl_db_record!(
    key = TotalAccruedFediFeesPerTXTypeKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::TotalAccruedFediFeesPerTXType,
);

#[derive(Debug, Decodable, Encodable)]
pub struct FediFeesRemittanceTimestampPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

impl_db_record!(
    key = FediFeesRemittanceTimestampPerTXTypeKey,
    value = SystemTime,
    db_prefix = BridgeDbPrefix::FediFeesRemittanceTimestampPerTXType,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastFediFeesRemittanceSPv2BalanceKey;

impl_db_record!(
    key = LastFediFeesRemittanceSPv2BalanceKey,
    value = FiatAmount,
    db_prefix = BridgeDbPrefix::LastFediFeesRemittanceSPv2Balance,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastFediFeesRemittanceTotalAccruedFeesKey(pub ModuleKind, pub RpcTransactionDirection);

impl_db_record!(
    key = LastFediFeesRemittanceTotalAccruedFeesKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::LastFediFeesRemittanceTotalAccruedFees,
);

#[derive(Debug, Decodable, Encodable)]
pub struct TransactionDateFiatInfoKey(pub OperationId);

impl_db_record!(
    key = TransactionDateFiatInfoKey,
    value = FiatFXInfo,
    db_prefix = BridgeDbPrefix::TransactionDateFiatInfo,
);
