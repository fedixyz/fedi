use std::collections::BTreeMap;
use std::time::SystemTime;

use fedimint_core::Amount;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::module::{ApiEndpoint, ApiEndpointContext, ApiError, ApiVersion, api_endpoint};
use futures::{StreamExt, stream};
use stability_pool_common::{
    AccountHistoryItem, AccountHistoryRequest, AccountId, AccountType, ActiveDeposits, FeeRate,
    LiquidityStats, SyncResponse, UnlockRequestStatus,
};

use crate::StabilityPool;
use crate::db::{
    CurrentCycleKey, IdleBalanceKey, PastCycleKeyPrefix, SeekLifetimeFeeKey, StagedProvidesKey,
    StagedProvidesKeyPrefix, StagedSeeksKey, StagedSeeksKeyPrefix, UnlockRequestKey,
    account_history_count, get_account_history_items,
};

pub fn endpoints() -> Vec<ApiEndpoint<StabilityPool>> {
    vec![
        api_endpoint! {
            "account_history",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, request: AccountHistoryRequest| -> Vec<AccountHistoryItem> {
                Ok(get_account_history_items(&mut context.db().begin_transaction_nc().await, request.account_id, request.range.start..request.range.end).await)
            }
        },
        api_endpoint! {
            "sync",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, request: AccountId| -> SyncResponse {
                sync(&mut context.db().begin_transaction_nc().await, request).await
            }
        },
        api_endpoint! {
            "active_deposits",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, request: AccountId| -> ActiveDeposits {
                active_deposits(&mut context.db().begin_transaction_nc().await, request).await
            }
        },
        api_endpoint! {
            "unlock_request_status",
            ApiVersion::new(0, 0),
            async |module: &StabilityPool, context, request: AccountId| -> UnlockRequestStatus {
                Ok(unlock_request_status(context, request, module).await?)
            }
        },
        api_endpoint! {
            "liquidity_stats",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, _request: ()| -> LiquidityStats {
                Ok(liquidity_stats(&mut context.db().begin_transaction_nc().await).await?)
            }
        },
        api_endpoint! {
            "average_fee_rate",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, request: u64| -> FeeRate {
                Ok(average_fee_rate(&mut context.db().begin_transaction_nc().await, request).await?)
            }
        },
    ]
}

/// See [`SyncResponse`]
pub async fn sync(
    dbtx: &mut DatabaseTransaction<'_>,
    account: AccountId,
) -> Result<SyncResponse, ApiError> {
    let current_cycle = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or_else(|| ApiError::bad_request("disallowed before first cycle".to_owned()))?;

    let locked_balance;
    let staged_balance;
    let locked_seeks_lifetime_fee;
    match account.acc_type() {
        AccountType::Seeker => {
            let locked_seeks = current_cycle.locked_seeks.get(&account);
            let staged_seeks = dbtx
                .get_value(&StagedSeeksKey(account))
                .await
                .unwrap_or_default();

            locked_balance = if let Some(locked_seeks) = locked_seeks {
                locked_seeks.iter().map(|locked| locked.amount).sum()
            } else {
                Amount::ZERO
            };
            staged_balance = staged_seeks.iter().map(|staged| staged.amount).sum();
            locked_seeks_lifetime_fee = Some({
                let mut fee_map = BTreeMap::new();
                for seek in locked_seeks.unwrap_or(&vec![]) {
                    fee_map.insert(
                        seek.txid,
                        dbtx.get_value(&SeekLifetimeFeeKey(seek.txid))
                            .await
                            .unwrap_or(Amount::ZERO),
                    );
                }
                fee_map
            });
        }
        AccountType::Provider => {
            let locked_provides = current_cycle.locked_provides.get(&account);
            let staged_provides = dbtx
                .get_value(&StagedProvidesKey(account))
                .await
                .unwrap_or_default();

            locked_balance = if let Some(locked_provides) = locked_provides {
                locked_provides.iter().map(|locked| locked.amount).sum()
            } else {
                Amount::ZERO
            };
            staged_balance = staged_provides.iter().map(|staged| staged.amount).sum();
            locked_seeks_lifetime_fee = None;
        }
        AccountType::BtcDepositor => {
            let staged_seeks = dbtx
                .get_value(&StagedSeeksKey(account))
                .await
                .unwrap_or_default();

            locked_balance = Amount::ZERO;
            staged_balance = staged_seeks.iter().map(|staged| staged.amount).sum();
            locked_seeks_lifetime_fee = None;
        }
    }

    Ok(SyncResponse {
        current_cycle: current_cycle.into(),
        idle_balance: dbtx
            .get_value(&IdleBalanceKey(account))
            .await
            .unwrap_or(Amount::ZERO),
        staged_balance,
        locked_balance,
        unlock_request: dbtx.get_value(&UnlockRequestKey(account)).await,
        account_history_count: account_history_count(dbtx, account).await,
        locked_seeks_lifetime_fee,
    })
}

/// See [`ActiveDeposits`]
pub async fn active_deposits(
    dbtx: &mut DatabaseTransaction<'_>,
    account: AccountId,
) -> Result<ActiveDeposits, ApiError> {
    let current_cycle = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or_else(|| ApiError::bad_request("disallowed before first cycle".to_owned()))?;
    Ok(match account.acc_type() {
        AccountType::Seeker | AccountType::BtcDepositor => ActiveDeposits::Seeker {
            staged: dbtx
                .get_value(&StagedSeeksKey(account))
                .await
                .unwrap_or_default(),
            locked: current_cycle
                .locked_seeks
                .get(&account)
                .cloned()
                .unwrap_or_default(),
        },
        AccountType::Provider => ActiveDeposits::Provider {
            staged: dbtx
                .get_value(&StagedProvidesKey(account))
                .await
                .unwrap_or_default(),
            locked: current_cycle
                .locked_provides
                .get(&account)
                .cloned()
                .unwrap_or_default(),
        },
    })
}

async fn next_cycle_start_time(
    dbtx: &mut DatabaseTransaction<'_>,
    stability_pool: &StabilityPool,
) -> anyhow::Result<SystemTime, ApiError> {
    let current_cycle_start_time = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or(ApiError::server_error(
            "First cycle not yet started".to_owned(),
        ))?
        .start_time;

    let cycle_duration = stability_pool.cfg.consensus.cycle_duration;
    let next_cycle_start_time = current_cycle_start_time + cycle_duration;
    Ok(next_cycle_start_time)
}

/// See [`stability_pool_common::UnlockRequestStatus`]
pub async fn unlock_request_status(
    context: &mut ApiEndpointContext,
    account: AccountId,
    stability_pool: &StabilityPool,
) -> anyhow::Result<UnlockRequestStatus, ApiError> {
    let db = context.db();
    let mut dbtx = db.begin_transaction_nc().await;
    Ok(match dbtx.get_value(&UnlockRequestKey(account)).await {
        Some(request) => UnlockRequestStatus::Pending {
            request,
            next_cycle_start_time: next_cycle_start_time(&mut dbtx, stability_pool).await?,
        },
        None => UnlockRequestStatus::NoActiveRequest {
            idle_balance: dbtx
                .get_value(&IdleBalanceKey(account))
                .await
                .unwrap_or(Amount::ZERO),
        },
    })
}

/// Return a snapshot of the current aggregate liquidity stats including
/// - sum of currently locked seeks
/// - sum of currently locked provides
/// - sum of currently staged seeks
/// - sum of currently staged provides
pub async fn liquidity_stats(
    dbtx: &mut DatabaseTransaction<'_>,
) -> anyhow::Result<LiquidityStats, ApiError> {
    let current_cycle = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or(ApiError::server_error(
            "First cycle not yet started".to_owned(),
        ))?;
    let locked_seeks_sum_msat: u64 = current_cycle
        .locked_seeks
        .values()
        .flatten()
        .map(|s| s.amount.msats)
        .sum();
    let locked_provides_sum_msat: u64 = current_cycle
        .locked_provides
        .values()
        .flatten()
        .map(|p| p.amount.msats)
        .sum();
    let staged_seeks_sum_msat: u64 = dbtx
        .find_by_prefix(&StagedSeeksKeyPrefix)
        .await
        .flat_map(|(_, seeks)| stream::iter(seeks))
        .collect::<Vec<_>>()
        .await
        .iter()
        .map(|s| s.amount.msats)
        .sum();
    let staged_provides_sum_msat: u64 = dbtx
        .find_by_prefix(&StagedProvidesKeyPrefix)
        .await
        .flat_map(|(_, provides)| stream::iter(provides))
        .collect::<Vec<_>>()
        .await
        .iter()
        .map(|p| p.amount.msats)
        .sum();

    Ok(LiquidityStats {
        locked_seeks_sum_msat,
        locked_provides_sum_msat,
        staged_seeks_sum_msat,
        staged_provides_sum_msat,
    })
}

/// Returns the average of the provider fee rate over the last #num_cycles
/// cycles, including the current ongoing cycle. So if num_cycles is 1, we
/// return the fee rate of the current ongoing cycle. If num_cycles is 2, we
/// average the current cycle and previous cycle. If num_cyces is n, we average
/// the current cycle and (n - 1) previous cycles.
pub async fn average_fee_rate(
    dbtx: &mut DatabaseTransaction<'_>,
    num_cycles: u64,
) -> anyhow::Result<FeeRate, ApiError> {
    if num_cycles == 0 {
        return Err(ApiError::bad_request("num_cycles must be non-0".to_owned()));
    }

    if num_cycles > 2100 {
        return Err(ApiError::bad_request(
            "num_cycles cannot exceed 2100".to_owned(),
        ));
    }

    let current_cycle = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or(ApiError::server_error(
            "First cycle not yet started".to_owned(),
        ))?;

    // Cycle indices are 0-based
    if num_cycles > current_cycle.index + 1 {
        return Err(ApiError::bad_request(format!(
            "num_cycles cannot exceed {}",
            current_cycle.index + 1
        )));
    }

    // We take num_cycles - 1 previous cycles since current cycles counts for 1
    // cycle
    let num_prev_cycles = match usize::try_from(num_cycles) {
        Ok(val) => val - 1,
        Err(e) => return Err(ApiError::bad_request(format!("invalid num_cycles: {e:?}"))),
    };
    let fee_rate_sum = current_cycle.fee_rate.0
        + dbtx
            .find_by_prefix_sorted_descending(&PastCycleKeyPrefix)
            .await
            .take(num_prev_cycles)
            .fold(0, |acc, (_, cycle)| async move { acc + cycle.fee_rate.0 })
            .await;
    Ok(FeeRate(fee_rate_sum / num_cycles))
}
