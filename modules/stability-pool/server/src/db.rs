use std::collections::BTreeMap;
use std::time::SystemTime;

use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record, Amount, PeerId, TransactionId};
use secp256k1_zkp::PublicKey;
use stability_pool_common::{
    CancelRenewal, LockedProvide, LockedSeek, SeekMetadata, StabilityPoolConsensusItem,
    StagedProvide, StagedSeek,
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

    /// User account => staged cancellation in BPS.
    /// If a staged cancellation exists for a user, the corresponding BPS of
    /// their locked balance gets unlocked at the next cycle turnover. This
    /// unlocked balance becomes idle balance.
    StagedCancellation,

    /// The currently ongoing system cycle containing the cycle index, start
    /// time and price, as well as the list of locked seeks and provides.
    CurrentCycle,

    /// Cycle index => cycle data.
    /// A mapping of all the past cycles keyed by the cycle index. During cycle
    /// turnover, the current (ending) cycle gets written here.
    PastCycle,

    /// An incrementing, nonce-like identifier assigned to all incoming seek
    /// requests. This sequence is used to prioritize seeks in a
    /// first-come-first-server fashion.
    StagedSeekSequence,

    /// An incrementing, nonce-like identifier assigned to all incoming provide
    /// requests. This sequence is used to prioritize provides in a
    /// first-come-first-server fashion. Provides with lower fees will
    /// always have higher priority when matching, but if two provides have
    /// the same fees, lower sequence wins.
    StagedProvideSequence,

    /// (Cycle index, peer ID) => consensus item.
    /// A mapping where a peer's vote for the next cycle is recorded. When a
    /// threshold number of votes is received, cycle turnover happens.
    CycleChangeVote,

    /// (User account, transaction ID) => seek metadata.
    /// Relevant history pertaining to the seek for client tracking purposes.
    /// Contains information such as initial value in sats and cents,
    /// withdrawn amounts in sats and cents, as well as fees debited so far.
    SeekMetadata,
}

#[derive(Debug, Encodable, Decodable)]
pub struct IdleBalanceKey(pub PublicKey);

#[derive(Debug, Encodable, Decodable)]
pub struct IdleBalanceKeyPrefix;

#[derive(Debug, Encodable, Decodable)]
pub struct IdleBalance(pub Amount);

impl_db_record!(
    key = IdleBalanceKey,
    value = IdleBalance,
    db_prefix = DbKeyPrefix::IdleBalance,
    notify_on_modify = true,
);
impl_db_lookup!(key = IdleBalanceKey, query_prefix = IdleBalanceKeyPrefix);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedSeeksKey(pub PublicKey);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedSeeksKeyPrefix;

impl_db_record!(key = StagedSeeksKey, value = Vec<StagedSeek>, db_prefix = DbKeyPrefix::StagedSeeks);
impl_db_lookup!(key = StagedSeeksKey, query_prefix = StagedSeeksKeyPrefix);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedProvidesKey(pub PublicKey);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedProvidesKeyPrefix;

impl_db_record!(key = StagedProvidesKey, value = Vec<StagedProvide>, db_prefix = DbKeyPrefix::StagedProvides);
impl_db_lookup!(
    key = StagedProvidesKey,
    query_prefix = StagedProvidesKeyPrefix
);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedCancellationKey(pub PublicKey);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedCancellationKeyPrefix;

impl_db_record!(
    key = StagedCancellationKey,
    value = (TransactionId, CancelRenewal),
    db_prefix = DbKeyPrefix::StagedCancellation
);
impl_db_lookup!(
    key = StagedCancellationKey,
    query_prefix = StagedCancellationKeyPrefix
);

#[derive(Debug, Encodable, Decodable)]
pub struct Cycle {
    pub index: u64,
    pub start_time: SystemTime,
    pub start_price: u64,
    pub fee_rate: u64,
    pub locked_seeks: BTreeMap<PublicKey, Vec<LockedSeek>>,
    pub locked_provides: BTreeMap<PublicKey, Vec<LockedProvide>>,
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
pub struct StagedSeekSequenceKey;

#[derive(Debug, Encodable, Decodable)]
pub struct StagedSeekSequenceKeyPrefix;

impl_db_record!(
    key = StagedSeekSequenceKey,
    value = u64,
    db_prefix = DbKeyPrefix::StagedSeekSequence
);

impl_db_lookup!(
    key = StagedSeekSequenceKey,
    query_prefix = StagedSeekSequenceKeyPrefix,
);

#[derive(Debug, Encodable, Decodable)]
pub struct StagedProvideSequenceKey;

#[derive(Debug, Encodable, Decodable)]
pub struct StagedProvideSequenceKeyPrefix;

impl_db_record!(
    key = StagedProvideSequenceKey,
    value = u64,
    db_prefix = DbKeyPrefix::StagedProvideSequence
);

impl_db_lookup!(
    key = StagedProvideSequenceKey,
    query_prefix = StagedProvideSequenceKeyPrefix,
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

#[derive(Debug, Encodable, Decodable)]
pub struct SeekMetadataKey(pub PublicKey, pub TransactionId);

#[derive(Debug, Encodable, Decodable)]
pub struct SeekMetadataAccountPrefix(pub PublicKey);

#[derive(Debug, Encodable, Decodable)]
pub struct SeekMetadataKeyPrefix;

impl_db_record!(
    key = SeekMetadataKey,
    value = SeekMetadata,
    db_prefix = DbKeyPrefix::SeekMetadata
);
impl_db_lookup!(
    key = SeekMetadataKey,
    query_prefix = SeekMetadataAccountPrefix,
    query_prefix = SeekMetadataKeyPrefix
);

/// Migrate DB from version 1 to version 2 by wiping everything
pub async fn migrate_to_v2(dbtx: &mut DatabaseTransaction<'_>) -> Result<(), anyhow::Error> {
    dbtx.remove_by_prefix(&IdleBalanceKeyPrefix).await;
    dbtx.remove_by_prefix(&StagedSeeksKeyPrefix).await;
    dbtx.remove_by_prefix(&StagedProvidesKeyPrefix).await;
    dbtx.remove_by_prefix(&StagedCancellationKeyPrefix).await;
    dbtx.remove_by_prefix(&CurrentCycleKeyPrefix).await;
    dbtx.remove_by_prefix(&PastCycleKeyPrefix).await;
    dbtx.remove_by_prefix(&StagedSeekSequenceKeyPrefix).await;
    dbtx.remove_by_prefix(&StagedProvideSequenceKeyPrefix).await;
    dbtx.remove_by_prefix(&CycleChangeVoteKeyPrefix).await;
    dbtx.remove_by_prefix(&SeekMetadataKeyPrefix).await;
    Ok(())
}
