#![allow(deprecated)]

use std::time::SystemTime;

use bitcoin::secp256k1;
use fedimint_core::core::{ModuleKind, OperationId};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::util::SafeUrl;
use fedimint_core::{Amount, impl_db_lookup, impl_db_record};
use fedimint_eventlog::EventLogId;
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
    #[deprecated]
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
    #[deprecated]
    PendingFediFees = 0xbc,

    // In a subsequent iteration of the app fee design, we decided to split fee collection by
    // module and then by transaction direction (send vs receive). So now we track outstanding and
    // pending Fedi fees within a map where the key is composite (module, TX direction) and the
    // value is msat. Essentially, we split up the single counters for outstanding and pending
    // Fedi fees into (2 * M) counters where M is the number of fee-relevant modules. Currently M
    // = 4 (mint, ln, wallet, stability-pool).
    #[deprecated]
    OutstandingFediFeesPerTXType = 0xbd,
    #[deprecated]
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
    #[deprecated]
    FediFeesRemittanceTimestampPerTXType = 0xc3,

    // For the Fedi gift project (iteration #1), we would also like to know the aggregate SPV2
    // balance of the reporting users. We accomplish this by storing the SPV2 balance as of the
    // last fee invoice request. The first time we send up the actual balance. Every subsequent
    // time, we send up the delta since last time.
    LastFediFeesRemittanceSPv2Balance = 0xc4,

    // Opposed to the Oustanding fedi fee which increases between remissions, and is cleared out
    // to 0 upon remission, the total accrued fedi fee only ever goes up.
    #[deprecated]
    TotalAccruedFediFeesPerTXType = 0xc5,

    // For the Fedi gift project (iteration #1), we ask for a 0-invoice amount when the
    // outstanding fee is below the threshold. However, we would still like to tell the server
    // about the additional accrued fee since last time so that TX volume can be approximated.
    #[deprecated]
    LastFediFeesRemittanceTotalAccruedFees = 0xc6,

    // Legacy lnv1 gateway override used by gateway selection.
    #[deprecated]
    GatewayOverride = 0xc7,

    // Prefix partition for all stream-era fee state. Individual fee keys live
    // under their own subprefixes inside this namespace.
    FediFeePrefix = 0xc8,

    // Canonical lightning gateway override. The deprecated GatewayOverride
    // key stored only an lnv1 gateway pubkey.
    LightningGatewayOverride = 0xc9,

    // walletv2 onchain addresses the user generated and may still receive a
    // deposit to. walletv2 creates no operation at address-generation time (the
    // scanner only makes one once it claims), so we track the address here to
    // show an "awaiting deposit" entry, mirroring v1's immediate pending tile.
    WalletV2AwaitingDeposit = 0xca,

    // 0xcb was briefly used by a pre-release iteration of the lnurl receives
    // event consumer (a permanent emitted-event marker). 0xcc below kept its
    // byte across that iteration's known-index becoming today's
    // pending-index (same encoding, narrower meaning), so a dev install
    // that ran the marker build may hold a stale entry there, worth at most
    // one duplicate event under the at-least-once contract.

    // lnv2 lnurl receives are created by the lnv2 client's own background
    // scanner, so the lnurl receives event-log consumer announces them rather
    // than any creation-time code path. This index holds the receives whose
    // terminal transaction event is still owed: inserted in the same tx that
    // advances the event-log cursor past the receive's ReceivePaymentEvent,
    // removed only once the sink has accepted the event, so delivery is
    // at-least-once -- a crash between the two re-emits once. Startup and the
    // periodic repair pass respawn subscribers from it, so recovery work
    // scales with interrupted receives, not history.
    LnurlReceivePending = 0xcc,
    // Position in the fedimint client's persistent (non-trimable) event log
    // up to which the bridge has durably consumed events. Advanced one entry
    // at a time, in the same tx as whatever that entry's handling wrote.
    // Established before the client -- and so the lnv2 scanner that writes
    // to this log -- can ever exist for the federation (see
    // FederationV2::init_event_log_cursor_if_absent): a first-ever value is
    // the log's tail at that moment, never the log's start, so an existing
    // install's upgrade never re-announces history, and a post-construction
    // snapshot can never race the scanner and skip an event. The event-log
    // consumer refuses to run if it ever finds this key absent rather than
    // defaulting it to the log's start.
    FedimintEventLogCursor = 0xcd,

    // Do not use anything after this key (inclusive)
    // see https://github.com/fedimint/fedimint/pull/4445
    #[allow(dead_code)]
    FedimintInternalReservedStart = 0xd0,
}

#[derive(Debug, Decodable, Encodable)]
pub struct LnurlReceivePendingKey(pub OperationId);

impl_db_record!(
    key = LnurlReceivePendingKey,
    value = (),
    db_prefix = BridgeDbPrefix::LnurlReceivePending,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LnurlReceivePendingKeyPrefix;

impl_db_lookup!(
    key = LnurlReceivePendingKey,
    query_prefix = LnurlReceivePendingKeyPrefix,
);

/// See [`BridgeDbPrefix::FedimintEventLogCursor`].
#[derive(Debug, Decodable, Encodable)]
pub struct FedimintEventLogCursorKey;

impl_db_record!(
    key = FedimintEventLogCursorKey,
    value = EventLogId,
    db_prefix = BridgeDbPrefix::FedimintEventLogCursor,
);

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
#[deprecated]
pub struct OutstandingFediFeesKey;

impl_db_record!(
    key = OutstandingFediFeesKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::OutstandingFediFees,
);

#[derive(Debug, Decodable, Encodable)]
#[deprecated]
pub struct OperationFediFeeStatusKey(pub OperationId);

#[derive(Debug, Encodable, Decodable)]
#[deprecated]
pub struct OperationFediFeeStatusKeyPrefix;

impl_db_record!(
    key = OperationFediFeeStatusKey,
    value = OperationFediFeeStatus,
    db_prefix = BridgeDbPrefix::OperationFediFeeStatus,
);

impl_db_lookup!(
    key = OperationFediFeeStatusKey,
    query_prefix = OperationFediFeeStatusKeyPrefix,
);

#[derive(Debug, Decodable, Encodable)]
#[deprecated]
pub struct PendingFediFeesKey;

impl_db_record!(
    key = PendingFediFeesKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::PendingFediFees,
);

/// A walletv2 onchain address the user generated, keyed so we can list the
/// still-unclaimed ones.
#[derive(Debug, Clone, Decodable, Encodable)]
pub struct WalletV2AwaitingDepositKey(pub String);

#[derive(Debug, Clone, Decodable, Encodable)]
pub struct WalletV2AwaitingDepositKeyPrefix;

#[derive(Debug, Clone, Decodable, Encodable)]
pub enum WalletV2AwaitingDeposit {
    /// Unix time (seconds) the address was generated, used to sort the
    /// synthetic "awaiting deposit" entry into the tx list.
    Awaiting(u64),
    /// walletv2 hands the same address back until its scanner advances the
    /// index, so the row has to outlive the claim: a fresh pending entry there
    /// would attach to the deposit already claimed to it.
    ///
    /// Settled without recording the claim op: that claim rendered under its
    /// own operation id and must keep it, since re-keying it would strand the
    /// id UIs already hold.
    Claimed,
    /// The claim operation that settled this address. It renders under the
    /// pending entry's address-derived id, so the awaiting entry and the
    /// claim stay one transaction.
    ClaimedBy(OperationId),
}

impl_db_record!(
    key = WalletV2AwaitingDepositKey,
    value = WalletV2AwaitingDeposit,
    db_prefix = BridgeDbPrefix::WalletV2AwaitingDeposit,
);

impl_db_lookup!(
    key = WalletV2AwaitingDepositKey,
    query_prefix = WalletV2AwaitingDepositKeyPrefix,
);

#[derive(Debug, Decodable, Encodable, Clone)]
pub enum LightningGatewayOverride {
    Lnv1(secp256k1::PublicKey),
    Lnv2(SafeUrl),
}

#[derive(Debug, Decodable, Encodable)]
#[deprecated]
pub struct GatewayOverrideKey;

impl_db_record!(
    key = GatewayOverrideKey,
    value = secp256k1::PublicKey,
    db_prefix = BridgeDbPrefix::GatewayOverride,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LightningGatewayOverrideKey;

impl_db_record!(
    key = LightningGatewayOverrideKey,
    value = LightningGatewayOverride,
    db_prefix = BridgeDbPrefix::LightningGatewayOverride,
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
#[deprecated]
pub struct OutstandingFediFeesPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

#[derive(Debug, Encodable, Decodable)]
#[deprecated]
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
#[deprecated]
pub struct PendingFediFeesPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

#[derive(Debug, Encodable, Decodable)]
#[deprecated]
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
#[deprecated]
pub struct TotalAccruedFediFeesPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

#[derive(Debug, Encodable, Decodable)]
#[deprecated]
pub struct TotalAccruedFediFeesPerTXTypeKeyPrefix;

impl_db_record!(
    key = TotalAccruedFediFeesPerTXTypeKey,
    value = Amount,
    db_prefix = BridgeDbPrefix::TotalAccruedFediFeesPerTXType,
);

impl_db_lookup!(
    key = TotalAccruedFediFeesPerTXTypeKey,
    query_prefix = TotalAccruedFediFeesPerTXTypeKeyPrefix,
);

#[derive(Debug, Decodable, Encodable)]
#[deprecated]
pub struct FediFeesRemittanceTimestampPerTXTypeKey(pub ModuleKind, pub RpcTransactionDirection);

#[derive(Debug, Encodable, Decodable)]
#[deprecated]
pub struct FediFeesRemittanceTimestampPerTXTypeKeyPrefix;

impl_db_record!(
    key = FediFeesRemittanceTimestampPerTXTypeKey,
    value = SystemTime,
    db_prefix = BridgeDbPrefix::FediFeesRemittanceTimestampPerTXType,
);

impl_db_lookup!(
    key = FediFeesRemittanceTimestampPerTXTypeKey,
    query_prefix = FediFeesRemittanceTimestampPerTXTypeKeyPrefix,
);

#[derive(Debug, Decodable, Encodable)]
pub struct LastFediFeesRemittanceSPv2BalanceKey;

impl_db_record!(
    key = LastFediFeesRemittanceSPv2BalanceKey,
    value = FiatAmount,
    db_prefix = BridgeDbPrefix::LastFediFeesRemittanceSPv2Balance,
);

#[derive(Debug, Decodable, Encodable)]
#[deprecated]
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
