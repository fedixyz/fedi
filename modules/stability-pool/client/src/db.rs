use std::time::SystemTime;

use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record, Amount, TransactionId};
use futures::StreamExt;
use stability_pool_common::{AccountHistoryItem, AccountId, CycleInfo, FiatAmount, SyncResponse};

#[repr(u8)]
#[derive(Clone, Debug)]
pub enum DbKeyPrefix {
    /// The most recently fetched sync response from the server
    SyncResponse = 0x01,
    /// Account history items fetched from server
    AccountHistory = 0x02,
    /// Latest state for each user operation based on account history items
    UserOperationHistory = 0x03,
    /// Incrementing index for ordering user operations based on ordering of
    /// account history items
    UserOperationIndex = 0x04,
    /// TXID => msat amount
    /// Seeks have to pay fees to providers for each cycle that they are locked.
    /// This is an accumulating amount for each seek that grows over its
    /// lifetime for each cycle that it is locked.
    SeekLifetimeFee = 0x05,
}

#[derive(Debug, Encodable, Decodable)]
pub struct CachedSyncResponseKey {
    pub account_id: AccountId,
}

#[derive(Debug, Encodable, Decodable)]
pub struct CachedSyncResponseValue {
    pub fetch_time: SystemTime,
    pub value: SyncResponse,
}

#[derive(Debug, Encodable, Decodable)]
pub struct AccountHistoryItemKey {
    pub account_id: AccountId,
    pub index: u64,
}

#[derive(Debug, Encodable, Decodable)]
pub struct AccountHistoryItemKeyPrefix {
    pub account_id: AccountId,
}

/// While each [`AccountHistoryItem`] represents a state transition for an
/// individual deposit, each [`UserOperationHistoryItem`] represents an action
/// initiated by the user. The list of [`UserOperationHistoryItem`] can be built
/// by taking the list of [`AccountHistoryItem`] and grouping by TX ID, and then
/// applying certain rules to each group based on the
/// [`AccountHistoryItemKind`]s noticed within the group. See
/// [`UserOperationHistoryItemKind`] for these rules.
#[derive(Debug, Encodable, Decodable)]
pub struct UserOperationHistoryItem {
    /// ID of TX submitted by the user. This can be used as a unique key to
    /// reconcile with the operation log for example.
    pub txid: TransactionId,

    /// Info of the cycle in which the user operation was initiated.
    pub cycle: CycleInfo,

    /// Amount of bitcoin involved in this transaction in msats
    pub amount: Amount,

    /// Amount of fiat involved in this transaction using the price of bitcoin
    /// from the start of the cycle in which the transaction took place.
    pub fiat_amount: FiatAmount,

    /// The kind of operation (deposit, withdrawal, or transfer)
    pub kind: UserOperationHistoryItemKind,
}

/// Once we group the [`AccountHistoryItem`]s by TX ID, we can derive the nature
/// of the user operation using the rules mentioned in each of the variants
/// below.
#[derive(Debug, Clone, Encodable, Decodable)]
pub enum UserOperationHistoryItemKind {
    /// Group of [`AccountHistoryItem`]s contains only one item of kind
    /// DepositToStaged
    PendingDeposit,

    /// Group of [`AccountHistoryItem`]s contains > 1 item with the first being
    /// of kind DepositToStaged. For now, we do not consider any subsequent
    /// state transitions such as deposit getting kicked out due to lack of
    /// liquidity and then being relocked later if more liquidity is available.
    CompletedDeposit,

    /// To determine the status of a withdrawal we also need to know if there
    /// is an active unlock request. This information is found from the cached
    /// [`SyncResponse`]. If there is no active unlock request, we do not have a
    /// pending withdrawal. But if there is an active unlock request, then we do
    /// have a pending withdrawal.
    ///
    /// Now if we have a pending withdrawal, it is possible that the latest
    /// [`AccountHistoryItem`] might be of kind StagedToIdle with a
    /// TX ID matching the TX ID of the unlock request.
    PendingWithdrawal,

    /// Group of [`AccountHistoryItem`]s looks like one of the below:
    /// - [LockedToIdle]
    /// - [StagedToIdle, LockedToIdle]
    /// - [StagedToIdle] with NO active unlock request
    CompletedWithdrawal,

    /// Group of [`AccountHistoryItem`]s looks like one of the below:
    /// - [StagedTransferIn]
    /// - [StagedTransferIn, LockedTransferIn]
    /// - [LockedTransferIn]
    TransferIn { from: AccountId, meta: Vec<u8> },

    /// Group of [`AccountHistoryItem`]s looks like one of the below:
    /// - [(StagedTransferOut)+]
    /// - [(StagedTransferOut)+, (LockedTransferOut)+]
    /// - [(LockedTransferOut)+]
    ///
    /// (X)+ means 1 or more of X
    TransferOut { to: AccountId, meta: Vec<u8> },
}

#[derive(Debug, Encodable, Decodable)]
pub struct UserOperationHistoryItemKey {
    pub account_id: AccountId,
    pub txid: TransactionId,
}

#[derive(Debug, Encodable, Decodable)]
pub struct UserOperationHistoryAccountPrefix {
    pub account_id: AccountId,
}

#[derive(Debug, Encodable, Decodable)]
pub struct UserOperationIndexItemKey {
    pub account_id: AccountId,
    pub tx_idx: u64,
}

#[derive(Debug, Encodable, Decodable)]
pub struct UserOperationIndexAccountPrefix {
    pub account_id: AccountId,
}

impl_db_record!(
    key = CachedSyncResponseKey,
    value = CachedSyncResponseValue,
    db_prefix = DbKeyPrefix::SyncResponse
);

impl_db_record!(
    key = AccountHistoryItemKey,
    value = AccountHistoryItem,
    db_prefix = DbKeyPrefix::AccountHistory
);
impl_db_lookup!(
    key = AccountHistoryItemKey,
    query_prefix = AccountHistoryItemKeyPrefix
);

impl_db_record!(
    key = UserOperationHistoryItemKey,
    value = UserOperationHistoryItem,
    db_prefix = DbKeyPrefix::UserOperationHistory
);
impl_db_lookup!(
    key = UserOperationHistoryItemKey,
    query_prefix = UserOperationHistoryAccountPrefix
);

impl_db_record!(
    key = UserOperationIndexItemKey,
    value = TransactionId,
    db_prefix = DbKeyPrefix::UserOperationIndex
);
impl_db_lookup!(
    key = UserOperationIndexItemKey,
    query_prefix = UserOperationIndexAccountPrefix
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

/// Insert the given UserOperationHistoryItem value against the given
/// UserOperationHistoryItemKey whilst ensuring that if a new TX ID is being
/// written, we also update the UserOperationIndex.
pub async fn insert_user_operation_history_item(
    dbtx: &mut DatabaseTransaction<'_>,
    key: &UserOperationHistoryItemKey,
    value: &UserOperationHistoryItem,
) {
    let old_value = dbtx.insert_entry(key, value).await;
    if old_value.is_none() {
        let next_idx = dbtx
            .find_by_prefix_sorted_descending(&UserOperationIndexAccountPrefix {
                account_id: key.account_id,
            })
            .await
            .next()
            .await
            .map_or(0, |(UserOperationIndexItemKey { tx_idx, .. }, _)| {
                tx_idx + 1
            });
        dbtx.insert_entry(
            &UserOperationIndexItemKey {
                account_id: key.account_id,
                tx_idx: next_idx,
            },
            &key.txid,
        )
        .await;
    }
}
