use std::collections::BTreeMap;
use std::ops::Range;
use std::time::SystemTime;

use anyhow::ensure;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record, Amount, PeerId, TransactionId};
use futures::StreamExt;
use stability_pool_common::{
    AccountHistoryItem, AccountId, CycleInfo, FeeRate, FiatAmount, Provide, Seek,
    StabilityPoolConsensusItem, TransferRequestId, UnlockRequest,
};

#[repr(u8)]
#[derive(Clone, Debug)]
pub enum DbKeyPrefix {
    /// User account => idle (neither staged nor locked) balance in msats.
    /// Idle balance is produced from locks that are cancelled during cycle
    /// turnover.
    IdleBalance = 0x01,

    /// User account => list of staged seeks.
    /// A staged seek is the equivalent of a "pending" deposit, waiting to be
    /// matched at the next cycle turnover.
    StagedSeeks,

    /// User account => list of staged provides.
    /// A staged provide is the equivalent of a "pending" deposit, waiting to be
    /// matched at the next cycle turnover.
    StagedProvides,

    /// User account => unlock request amount
    /// When a user wishes to withdraw their funds from the stability pool, the
    /// first step is to submit a request to unlock msats corresponding to the
    /// provided fiat amount (or ALL). This unlock request may be fully
    /// completed immediately (in case there are enough funds in staged state),
    /// or it may only be partially completed immediately and then need to
    /// wait for the next cycle turnover.
    UnlockRequests,

    /// The currently ongoing system cycle containing the cycle index, start
    /// time and price, as well as the list of locked seeks and provides.
    CurrentCycle,

    /// Cycle index => cycle data.
    /// A mapping of all the past cycles keyed by the cycle index. During cycle
    /// turnover, the current (ending) cycle gets written here.
    PastCycle,

    /// An incrementing, nonce-like identifier assigned to all incoming
    /// deposits. This sequence is used to prioritize deposits in
    /// first-come-first-server fashion.
    ///
    /// Provides with lower fees will always have higher priority when matching,
    /// but if two provides have the same fees, lower sequence wins.
    DepositSequence,

    /// TXID => msat amount
    /// Seeks have to pay fees to providers for each cycle that they are locked.
    /// This is an accumulating amount for each seek that grows over its
    /// lifetime for each cycle that it is locked.
    SeekLifetimeFee,

    /// (Cycle index, peer ID) => consensus item.
    /// A mapping where a peer's vote for the next cycle is recorded. When a
    /// threshold number of votes is received, cycle turnover happens.
    CycleChangeVote,

    /// (Account, serial) => AccountHistoryItemDb
    ///
    /// Account transaction history.
    AccountHistory,

    /// TransferRequestId => ()
    /// Every [`TransferRequest`] coming to the client is hashed and stored in
    /// the server DB to guard against replay attacks.
    TransferRequests,
}

#[derive(Debug, Encodable, Decodable)]
pub struct IdleBalanceKey(pub AccountId);

#[derive(Debug, Encodable, Decodable)]
pub struct IdleBalanceKeyPrefix;

impl_db_record!(
    key = IdleBalanceKey,
    value = Amount,
    db_prefix = DbKeyPrefix::IdleBalance,
    notify_on_modify = true,
);
impl_db_lookup!(key = IdleBalanceKey, query_prefix = IdleBalanceKeyPrefix);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedSeeksKey(pub AccountId);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedSeeksKeyPrefix;

impl_db_record!(key = StagedSeeksKey, value = Vec<Seek>, db_prefix = DbKeyPrefix::StagedSeeks);
impl_db_lookup!(key = StagedSeeksKey, query_prefix = StagedSeeksKeyPrefix);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedProvidesKey(pub AccountId);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedProvidesKeyPrefix;

impl_db_record!(key = StagedProvidesKey, value = Vec<Provide>, db_prefix = DbKeyPrefix::StagedProvides);
impl_db_lookup!(
    key = StagedProvidesKey,
    query_prefix = StagedProvidesKeyPrefix
);

#[derive(Debug, Encodable, Decodable)]
pub struct UnlockRequestKey(pub AccountId);

#[derive(Debug, Encodable, Decodable)]
pub struct UnlockRequestsKeyPrefix;

impl_db_record!(
    key = UnlockRequestKey,
    value = UnlockRequest,
    db_prefix = DbKeyPrefix::UnlockRequests,
);

impl_db_lookup!(
    key = UnlockRequestKey,
    query_prefix = UnlockRequestsKeyPrefix,
);

#[derive(Debug, Encodable, Decodable)]
pub struct Cycle {
    pub index: u64,
    pub start_time: SystemTime,
    pub start_price: FiatAmount,
    pub fee_rate: FeeRate,
    pub locked_seeks: BTreeMap<AccountId, Vec<Seek>>,
    pub locked_provides: BTreeMap<AccountId, Vec<Provide>>,
}

#[derive(Debug, Encodable, Decodable)]
pub struct CurrentCycleKey;

#[derive(Debug, Encodable, Decodable)]
pub struct CurrentCycleKeyPrefix;

impl_db_record!(
    key = CurrentCycleKey,
    value = Cycle,
    db_prefix = DbKeyPrefix::CurrentCycle
);
impl_db_lookup!(key = CurrentCycleKey, query_prefix = CurrentCycleKeyPrefix);

#[derive(Debug, Encodable, Decodable)]
pub struct PastCycleKey(pub u64);

#[derive(Debug, Encodable, Decodable)]
pub struct PastCycleKeyPrefix;

impl_db_record!(
    key = PastCycleKey,
    value = Cycle,
    db_prefix = DbKeyPrefix::PastCycle
);
impl_db_lookup!(key = PastCycleKey, query_prefix = PastCycleKeyPrefix);

#[derive(Debug, Encodable, Decodable)]
pub struct DepositSequenceKey;

#[derive(Debug, Encodable, Decodable)]
pub struct DepositSequenceKeyPrefix;

impl_db_record!(
    key = DepositSequenceKey,
    value = u64,
    db_prefix = DbKeyPrefix::DepositSequence,
);

impl_db_lookup!(
    key = DepositSequenceKey,
    query_prefix = DepositSequenceKeyPrefix,
);

#[derive(Debug, Encodable, Decodable)]
pub struct SeekLifetimeFeeKey(pub TransactionId);

#[derive(Debug, Encodable, Decodable)]
pub struct SeekLifetimeFeeKeyPrefix;

impl_db_record!(
    key = SeekLifetimeFeeKey,
    value = Amount,
    db_prefix = DbKeyPrefix::SeekLifetimeFee,
);

impl_db_lookup!(
    key = SeekLifetimeFeeKey,
    query_prefix = SeekLifetimeFeeKeyPrefix,
);

#[derive(Debug, Encodable, Decodable)]
pub struct CycleChangeVoteKey(pub u64, pub PeerId);

#[derive(Debug, Encodable, Decodable)]
pub struct CycleChangeVoteIndexPrefix(pub u64);

#[derive(Debug, Encodable, Decodable)]
pub struct CycleChangeVoteKeyPrefix;

impl_db_record!(
    key = CycleChangeVoteKey,
    value = StabilityPoolConsensusItem,
    db_prefix = DbKeyPrefix::CycleChangeVote
);

impl_db_lookup!(
    key = CycleChangeVoteKey,
    query_prefix = CycleChangeVoteIndexPrefix,
    query_prefix = CycleChangeVoteKeyPrefix,
);

/// AccountId and serial counter.
#[derive(Debug, Encodable, Decodable)]
pub struct AccountHistoryItemKey(pub AccountId, pub u64);

#[derive(Debug, Encodable, Decodable)]
pub struct AccountHistoryItemPrefixAccount(pub AccountId);

impl_db_record!(
    key = AccountHistoryItemKey,
    value = AccountHistoryItem,
    db_prefix = DbKeyPrefix::AccountHistory
);

impl_db_lookup!(
    key = AccountHistoryItemKey,
    query_prefix = AccountHistoryItemPrefixAccount,
);

#[derive(Debug, Encodable, Decodable)]
pub struct TransferRequestsKey(pub TransferRequestId);

impl_db_record!(
    key = TransferRequestsKey,
    value = (),
    db_prefix = DbKeyPrefix::TransferRequests
);

/// Insert new account history items for an account.
pub async fn add_account_history_items<'a, 'b>(
    dbtx: &mut DatabaseTransaction<'a>,
    account_id: AccountId,
    items: impl IntoIterator<Item = AccountHistoryItem> + 'b,
) {
    let mut next_idx = account_history_count(dbtx, account_id).await;
    for item in items {
        dbtx.insert_entry(&AccountHistoryItemKey(account_id, next_idx), &item)
            .await;
        next_idx += 1;
    }
}

/// Find total number of account history items for an account.
pub async fn account_history_count(
    dbtx: &mut DatabaseTransaction<'_>,
    account_id: AccountId,
) -> u64 {
    dbtx.find_by_prefix_sorted_descending(&AccountHistoryItemPrefixAccount(account_id))
        .await
        .next()
        .await
        .map_or(0, |(AccountHistoryItemKey(_, idx), _)| idx + 1)
}

impl From<Cycle> for CycleInfo {
    fn from(value: Cycle) -> Self {
        CycleInfo::from(&value)
    }
}

impl From<&Cycle> for CycleInfo {
    fn from(value: &Cycle) -> Self {
        CycleInfo {
            idx: value.index,
            start_price: value.start_price,
            start_time: value.start_time,
        }
    }
}

pub async fn get_account_history_items(
    dbtx: &mut DatabaseTransaction<'_>,
    account_id: AccountId,
    items_range: Range<u64>,
) -> Vec<AccountHistoryItem> {
    dbtx.find_by_range(
        AccountHistoryItemKey(account_id, items_range.start)
            ..AccountHistoryItemKey(account_id, items_range.end),
    )
    .await
    .map(|(_, val)| val)
    .collect()
    .await
}

/// Given a dbtx, ensures that `id` hasn't been registered before as a
/// TransferRequestId. After successful verification, registers `id` in
/// the DB before returning Ok.
pub async fn ensure_unique_transfer_request_and_log(
    id: &TransferRequestId,
    dbtx: &mut DatabaseTransaction<'_>,
) -> anyhow::Result<()> {
    let db_key = TransferRequestsKey(id.clone());
    ensure!(
        dbtx.get_value(&db_key).await.is_none(),
        "Transfer request re-used!"
    );

    dbtx.insert_entry(&db_key, &()).await;
    Ok(())
}

/// Given a dbtx, return the next deposit sequence (nonce) to be assigned to an
/// incoming deposit.
pub async fn next_deposit_sequence(dbtx: &mut DatabaseTransaction<'_>) -> u64 {
    let sequence = dbtx
        .get_value(&DepositSequenceKey)
        .await
        .unwrap_or_default();

    dbtx.insert_entry(&DepositSequenceKey, &(sequence + 1))
        .await;

    sequence
}
