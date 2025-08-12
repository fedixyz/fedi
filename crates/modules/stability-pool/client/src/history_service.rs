use std::cmp::Ordering;
use std::ops::Range;

use anyhow::bail;
use fedimint_api_client::api::DynModuleApi;
use fedimint_client::module::module::ClientContext;
use fedimint_client::OperationId;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::util::backoff_util::{self};
use fedimint_core::util::retry;
use fedimint_core::{Amount, TransactionId};
use futures::{Stream, StreamExt};
use stability_pool_common::{
    AccountHistoryItem, AccountHistoryItemKind, AccountId, FiatAmount, SyncResponse, UnlockRequest,
};
use tokio::sync::watch;
use tokio_stream::wrappers::WatchStream;
use tracing::error;

use crate::api::StabilityPoolApiExt;
use crate::db::{
    self, AccountHistoryItemKey, AccountHistoryItemKeyPrefix, DepositSequenceTransactionLookupKey,
    DepositSequenceTransactionLookupValue, RecordedTransferItemKey, UserOperationHistoryItem,
    UserOperationHistoryItemKey, UserOperationHistoryItemKind, UserOperationIndexAccountPrefix,
};
use crate::{StabilityPoolClientModule, StabilityPoolMeta, StabilityPoolSyncService};

/// Service that syncs account history from server in the background
#[derive(Debug)]
pub struct StabilityPoolHistoryService {
    is_fetching: watch::Sender<bool>,
    client_ctx: ClientContext<StabilityPoolClientModule>,
    module_api: DynModuleApi,
    account_id: AccountId,
}

impl StabilityPoolHistoryService {
    pub fn new(
        client_ctx: ClientContext<StabilityPoolClientModule>,
        module_api: DynModuleApi,
        account_id: AccountId,
    ) -> Self {
        Self {
            is_fetching: watch::Sender::new(false),
            client_ctx,
            module_api,
            account_id,
        }
    }

    /// Update history data in background.
    ///
    /// Caller should run this method in a task.
    pub async fn update_continuously(&self, sync_service: &StabilityPoolSyncService) {
        let mut updates = sync_service.subscribe_to_updates();

        // Keep updating based on sync updates
        while let Some(maybe_sync) = updates.next().await {
            let Some(sync) = maybe_sync else {
                continue;
            };
            retry("history fetch", backoff_util::background_backoff(), || {
                self.update_once(&sync.value)
            })
            .await
            .expect("inifinite retry");
        }
    }

    async fn update_once(&self, sync_response: &SyncResponse) -> anyhow::Result<()> {
        let local_count = get_account_history_count(
            &mut self.client_ctx.module_db().begin_transaction_nc().await,
            self.account_id,
        )
        .await;

        let should_fetch = match sync_response.account_history_count.cmp(&local_count) {
            Ordering::Equal => false,
            Ordering::Less => {
                error!(?sync_response, "server account history should not lag!");
                bail!("server error: incorrect sync response");
            }
            Ordering::Greater => true,
        };

        // If we don't need to fetch new history items, we still need to account for any
        // new unlock requests
        if !should_fetch {
            let mut dbtx = self.client_ctx.module_db().begin_transaction().await;
            ensure_unlock_request_registered(&mut dbtx.to_ref_nc(), self.account_id, sync_response)
                .await;
            dbtx.commit_tx().await;
            return Ok(());
        }

        self.is_fetching.send_replace(true);
        let result = async {
            let new_history_items = self
                .module_api
                .account_history(
                    self.account_id,
                    local_count..sync_response.account_history_count,
                )
                .await?;

            let mut dbtx = self.client_ctx.module_db().begin_transaction().await;
            // Store each new item individually
            for (i, item) in new_history_items.into_iter().enumerate() {
                let key = AccountHistoryItemKey {
                    account_id: self.account_id,
                    index: local_count + i as u64,
                };
                dbtx.insert_entry(&key, &item).await;
                update_user_operation_history(
                    &self.client_ctx,
                    &mut dbtx.to_ref_nc(),
                    self.account_id,
                    sync_response,
                    &item,
                )
                .await;
            }

            ensure_unlock_request_registered(&mut dbtx.to_ref_nc(), self.account_id, sync_response)
                .await;

            dbtx.commit_tx().await;
            Ok(())
        }
        .await;
        self.is_fetching.send_replace(false);
        result
    }

    /// Get all history items for the given account, ordered by index
    pub async fn get_account_history(
        &self,
        range: Range<u64>,
    ) -> anyhow::Result<Vec<AccountHistoryItem>> {
        let mut dbtx = self.client_ctx.module_db().begin_transaction().await;
        Ok(dbtx
            .find_by_range(
                AccountHistoryItemKey {
                    account_id: self.account_id,
                    index: range.start,
                }..AccountHistoryItemKey {
                    account_id: self.account_id,
                    index: range.end,
                },
            )
            .await
            .map(|(_key, value)| value)
            .collect()
            .await)
    }

    /// Subscribe to history fetch updates to show a loading.
    pub fn subscribe_to_fetches(&self) -> impl Stream<Item = bool> {
        WatchStream::new(self.is_fetching.subscribe())
    }

    /// Returns the last `limit` user operations as tuples of (index, item). To
    /// fetch the next page, pass the last operation's index as
    /// `start_after`.
    pub async fn list_user_operations(
        &self,
        limit: usize,
        start_after: Option<u64>,
    ) -> Vec<(u64, UserOperationHistoryItem)> {
        let mut dbtx = self.client_ctx.module_db().begin_transaction_nc().await;
        let operations: Vec<(u64, TransactionId)> = dbtx
            .find_by_prefix_sorted_descending(&UserOperationIndexAccountPrefix {
                account_id: self.account_id,
            })
            .await
            .skip_while(|(key, _)| {
                let skip = if let Some(start_after) = start_after {
                    key.tx_idx >= start_after
                } else {
                    false
                };

                std::future::ready(skip)
            })
            .map(|(key, txid)| (key.tx_idx, txid))
            .take(limit)
            .collect::<Vec<_>>()
            .await;

        let mut operation_entries = Vec::with_capacity(operations.len());
        for operation in operations {
            let entry = dbtx
                .get_value(&UserOperationHistoryItemKey {
                    account_id: self.account_id,
                    txid: operation.1,
                })
                .await
                .expect("Inconsistent DB");
            operation_entries.push((operation.0, entry));
        }

        operation_entries
    }
}

async fn get_account_history_count(
    dbtx: &mut DatabaseTransaction<'_>,
    account_id: AccountId,
) -> u64 {
    dbtx.find_by_prefix_sorted_descending(&AccountHistoryItemKeyPrefix { account_id })
        .await
        .next()
        .await
        .map_or(0, |k| k.0.index + 1)
}

// Given the [`AccountHistoryItem`] just received from the server, update the
// on-disk user operation history.
async fn update_user_operation_history(
    client_ctx: &ClientContext<StabilityPoolClientModule>,
    dbtx: &mut DatabaseTransaction<'_>,
    account_id: AccountId,
    sync_response: &SyncResponse,
    acc_history_item: &AccountHistoryItem,
) {
    let user_op_key = UserOperationHistoryItemKey {
        account_id,
        txid: acc_history_item.txid,
    };
    let current_user_op_history_item = dbtx.get_value(&user_op_key).await;

    // Initialize the new msat and fiat amounts using the account history item's
    // data
    let mut new_amount = acc_history_item.amount;
    let mut new_fiat_amount =
        FiatAmount::from_btc_amount(acc_history_item.amount, acc_history_item.cycle.start_price)
            .unwrap_or_default();

    let mut add_current_state_amounts = || {
        new_amount += current_user_op_history_item
            .as_ref()
            .map_or(Amount::ZERO, |c| c.amount);
        new_fiat_amount = FiatAmount(
            new_fiat_amount.0
                + current_user_op_history_item
                    .as_ref()
                    .map_or(FiatAmount(0), |c| c.fiat_amount)
                    .0,
        );
    };

    let new_user_op_state = match (
        &acc_history_item.kind,
        current_user_op_history_item.as_ref().map(|c| &c.kind),
        sync_response.unlock_request.as_ref(),
    ) {
        // Deposit-related account history items. We only care about the initial deposit and
        // locking. We don't care about deposits getting kicked out (due to low liquidity) and then
        // getting relocked -- for now.
        (AccountHistoryItemKind::DepositToStaged, None, _) => {
            // The first time the server sends us details on a user-initiated deposit (in
            // pending state), we populate our local deposit_sequence=>(account_id, txid)
            // mapping.
            dbtx.insert_entry(
                &DepositSequenceTransactionLookupKey {
                    deposit_sequence: acc_history_item.deposit_sequence,
                },
                &DepositSequenceTransactionLookupValue {
                    account_id,
                    txid: acc_history_item.txid,
                    original_amount: acc_history_item.amount,
                    drained_amount: Amount::ZERO,
                },
            )
            .await;
            UserOperationHistoryItemKind::PendingDeposit
        }
        (AccountHistoryItemKind::DepositToStaged, Some(_), _) => {
            panic!("DepositToStaged must create new user op history item")
        }
        (AccountHistoryItemKind::StagedToLocked, None, _) => {
            panic!("StagedToLocked cannot create new user op history item")
        }
        (AccountHistoryItemKind::StagedToLocked, Some(state), _) => match state {
            UserOperationHistoryItemKind::PendingDeposit => {
                // When a PendingDeposit undergoes a StagedToLocked transition, we clear our
                // local deposit_sequence=>(account_id, txid) mapping.
                dbtx.remove_entry(&DepositSequenceTransactionLookupKey {
                    deposit_sequence: acc_history_item.deposit_sequence,
                })
                .await;
                UserOperationHistoryItemKind::CompletedDeposit
            }
            UserOperationHistoryItemKind::CompletedDeposit => return,
            UserOperationHistoryItemKind::TransferIn { .. } => return,
            _ => panic!("StagedToLocked can only override existing PendingWithdrawal"),
        },
        (AccountHistoryItemKind::LockedToStaged, _, _) => return,

        // Withdrawal-related account history items that pertain to staged deposits. If StagedToIdle
        // matches existing unlock request, we add the amounts from the unlock request. Otherwise,
        // it is a completed withdrawal.
        (AccountHistoryItemKind::StagedToIdle, None, Some(UnlockRequest { txid, .. }))
            if *txid == acc_history_item.txid =>
        {
            let (msat, fiat) = sync_response
                .amount_from_unlock_request()
                .unwrap_or((Amount::ZERO, Default::default()));
            new_amount += msat;
            new_fiat_amount = FiatAmount(new_fiat_amount.0 + fiat.0);
            UserOperationHistoryItemKind::PendingWithdrawal
        }
        (AccountHistoryItemKind::StagedToIdle, None, _) => {
            // (still possible to see a follow-up LockedToIdle)
            UserOperationHistoryItemKind::CompletedWithdrawal
        }
        (
            AccountHistoryItemKind::StagedToIdle,
            Some(
                state @ UserOperationHistoryItemKind::PendingWithdrawal
                | state @ UserOperationHistoryItemKind::CompletedWithdrawal,
            ),
            _,
        ) => {
            add_current_state_amounts();
            state.to_owned()
        }
        (AccountHistoryItemKind::StagedToIdle, Some(_), _) => {
            panic!(
                "StagedToIdle can only override existing PendingWithdrawal or CompletedWithdrawal"
            )
        }

        // Withdrawal-related account history items that pertain to locked deposits.
        // - If starting state is None, it was a locked-deposits-only withdrawal that we didn't
        //   track in-flight and we can just use the amounts from the new account history item.
        // - If starting state is Some(PendingWithdrawal), we were tracking the withdrawal in-flight
        //   and the OLD state already has the FULL withdrawal amounts (across both locked and
        //   staged).
        // - If starting state is Some(CompletedWithdrawal), this is a follow-up LockedToIdle after
        //   a previous StagedToIdle. Only in this case do we need to add amounts.
        (AccountHistoryItemKind::LockedToIdle, None, _) => {
            UserOperationHistoryItemKind::CompletedWithdrawal
        }
        (
            AccountHistoryItemKind::LockedToIdle,
            Some(UserOperationHistoryItemKind::PendingWithdrawal),
            _,
        ) => {
            new_amount = current_user_op_history_item
                .as_ref()
                .map_or(Amount::ZERO, |c| c.amount);
            new_fiat_amount = current_user_op_history_item
                .as_ref()
                .map_or(Default::default(), |c| c.fiat_amount);
            UserOperationHistoryItemKind::CompletedWithdrawal
        }
        (
            AccountHistoryItemKind::LockedToIdle,
            Some(UserOperationHistoryItemKind::CompletedWithdrawal),
            _,
        ) => {
            add_current_state_amounts();
            UserOperationHistoryItemKind::CompletedWithdrawal
        }
        (AccountHistoryItemKind::LockedToIdle, Some(_), _) => panic!(
            "LockedToIdle can only override existing PendingWithdrawal or CompletedWithdrawal"
        ),

        // Transfer-in related account history items. For a staged or locked transfer in item,
        // existing state must either be None, or "Transfer In". Amounts across items must be added
        // up to get the total transfer-in amount.
        (
            AccountHistoryItemKind::StagedTransferIn { from, meta }
            | AccountHistoryItemKind::LockedTransferIn { from, meta },
            None | Some(UserOperationHistoryItemKind::TransferIn { .. }),
            _,
        ) => {
            add_current_state_amounts();
            ensure_transfer_in_recorded(client_ctx, dbtx, account_id, acc_history_item.txid).await;
            UserOperationHistoryItemKind::TransferIn {
                from: *from,
                meta: meta.to_vec(),
            }
        }
        (
            AccountHistoryItemKind::StagedTransferIn { .. }
            | AccountHistoryItemKind::LockedTransferIn { .. },
            Some(_),
            _,
        ) => {
            panic!("StagedTransferIn/LockedTransferIn can only override TransferIn");
        }

        // Transfer-out related account history items. For a staged or locked transfer out item,
        // existing state must either be None, or "Transfer Out". Amounts across items must be added
        // up to get the total transfer-out amount.
        (
            AccountHistoryItemKind::StagedTransferOut { to, meta }
            | AccountHistoryItemKind::LockedTransferOut { to, meta },
            None | Some(UserOperationHistoryItemKind::TransferOut { .. }),
            _,
        ) => {
            add_current_state_amounts();
            UserOperationHistoryItemKind::TransferOut {
                to: *to,
                meta: meta.to_vec(),
            }
        }
        (
            AccountHistoryItemKind::StagedTransferOut { .. }
            | AccountHistoryItemKind::LockedTransferOut { .. },
            Some(_),
            _,
        ) => {
            panic!("StagedTransferOut/LockedTransferOut can only override TransferOut")
        }
    };

    // If the account_history_item kind is "StagedToIdle", and we have knowledge of
    // the pending deposit that is being drained, we want to mark that deposit as
    // "completed" iff it is fully drained. Otherwise, we will have a perpetual
    // pending deposit.
    if acc_history_item.kind == AccountHistoryItemKind::StagedToIdle {
        maybe_mark_pending_deposit_as_completed(
            dbtx,
            acc_history_item.deposit_sequence,
            acc_history_item.amount,
        )
        .await;
    }

    db::insert_user_operation_history_item(
        dbtx,
        &user_op_key,
        &UserOperationHistoryItem {
            txid: acc_history_item.txid,
            cycle: acc_history_item.cycle,
            amount: new_amount,
            fiat_amount: new_fiat_amount,
            kind: new_user_op_state,
        },
    )
    .await;
}

async fn ensure_unlock_request_registered(
    dbtx: &mut DatabaseTransaction<'_>,
    account_id: AccountId,
    sync_response: &SyncResponse,
) {
    // If we see a pending unlock request that we are not already tracking, add a
    // user operation history item for it
    if let Some(unlock_request) = sync_response.unlock_request.as_ref() {
        let user_op_key = UserOperationHistoryItemKey {
            account_id,
            txid: unlock_request.txid,
        };
        if dbtx.get_value(&user_op_key).await.is_none() {
            let (amount, fiat_amount) = sync_response
                .amount_from_unlock_request()
                .unwrap_or((Amount::ZERO, Default::default()));
            db::insert_user_operation_history_item(
                &mut dbtx.to_ref_nc(),
                &user_op_key,
                &UserOperationHistoryItem {
                    txid: unlock_request.txid,
                    cycle: sync_response.current_cycle,
                    amount,
                    fiat_amount,
                    kind: UserOperationHistoryItemKind::PendingWithdrawal,
                },
            )
            .await;
        }
    }
}

// If we see an AccountHistoryItem of kind StagedTransferIn or LockedTransferIn,
// we check if we already have a local operation corresponding to the
// AccountHistoryItem's TXID. If we don't, it means that someone else
// transferred stable balance to us without our client's involvement. In this
// case, we backfill an entry into our local operation log so that we can keep
// an accurate local history.
async fn ensure_transfer_in_recorded(
    client_ctx: &ClientContext<StabilityPoolClientModule>,
    dbtx: &mut DatabaseTransaction<'_>,
    account_id: AccountId,
    txid: TransactionId,
) {
    let db_key = RecordedTransferItemKey { account_id, txid };
    if dbtx.get_value(&db_key).await.is_some() {
        return;
    }

    let new_op_id = OperationId::new_random();
    // No point storing extra data in the operation log such as amount etc. since we
    // could potentially have many AccountHistoryItems corresponding to a single
    // transfer-in. We already use accrual logic to update
    // UserOperationHistoryItems, and it is straightforward to look it up using the
    // TXID from the operation log.
    client_ctx
        .add_operation_log_entry_dbtx(
            dbtx,
            new_op_id,
            stability_pool_common::KIND.as_str(),
            StabilityPoolMeta::ExternalTransferIn { txid },
        )
        .await;
    dbtx.insert_entry(&db_key, &new_op_id).await;
}

// Mark that deposit as "completed" iff it is fully drained. Otherwise, we will
// have a perpetual pending deposit.
async fn maybe_mark_pending_deposit_as_completed(
    dbtx: &mut DatabaseTransaction<'_>,
    deposit_sequence: u64,
    to_drain: Amount,
) {
    let sequence_db_key = DepositSequenceTransactionLookupKey { deposit_sequence };
    let Some(DepositSequenceTransactionLookupValue {
        account_id,
        txid,
        original_amount,
        drained_amount,
    }) = dbtx.get_value(&sequence_db_key).await
    else {
        return;
    };

    let user_op_db_key = UserOperationHistoryItemKey { account_id, txid };
    let Some(UserOperationHistoryItem {
        txid,
        cycle,
        amount,
        fiat_amount,
        kind: UserOperationHistoryItemKind::PendingDeposit,
    }) = dbtx.get_value(&user_op_db_key).await
    else {
        // If a valid user operation history item doesn't exist, remove sequence_db_key
        // as well
        dbtx.remove_entry(&sequence_db_key).await;
        return;
    };

    // If we are now fully draining the pending deposit, remove sequence_db_key and
    // mark the deposit as completed
    if drained_amount + to_drain >= original_amount {
        dbtx.remove_entry(&sequence_db_key).await;
        dbtx.insert_entry(
            &user_op_db_key,
            &UserOperationHistoryItem {
                txid,
                cycle,
                amount,
                fiat_amount,
                kind: UserOperationHistoryItemKind::CompletedDeposit,
            },
        )
        .await;
    } else {
        // Otherwise, just update sequence_db_key's drained_amount
        dbtx.insert_entry(
            &sequence_db_key,
            &DepositSequenceTransactionLookupValue {
                account_id,
                txid,
                original_amount,
                drained_amount: drained_amount + to_drain,
            },
        )
        .await;
    }
}
