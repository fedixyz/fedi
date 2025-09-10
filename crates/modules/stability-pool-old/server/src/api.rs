use std::time::UNIX_EPOCH;

use fedimint_core::Amount;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::module::{ApiEndpoint, ApiEndpointContext, ApiError, ApiVersion, api_endpoint};
use futures::{StreamExt, stream};
use secp256k1::PublicKey;
use stability_pool_common_old::{AccountInfo, LiquidityStats};

use crate::StabilityPool;
use crate::db::{
    CurrentCycleKey, Cycle, IdleBalance, IdleBalanceKey, PastCycleKeyPrefix,
    SeekMetadataAccountPrefix, StagedCancellationKey, StagedProvidesKey, StagedProvidesKeyPrefix,
    StagedSeeksKey, StagedSeeksKeyPrefix,
};

pub fn endpoints() -> Vec<ApiEndpoint<StabilityPool>> {
    vec![
        api_endpoint! {
            "account_info",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, request: PublicKey| -> AccountInfo {
                Ok(account_info(&mut context.dbtx().into_nc(), request).await)
            }
        },
        api_endpoint! {
            "current_cycle_index",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, _request: ()| -> u64 {
                Ok(current_cycle_index(&mut context.dbtx().into_nc()).await?)
            }
        },
        api_endpoint! {
            "next_cycle_start_time",
            ApiVersion::new(0, 0),
            async |module: &StabilityPool, context, _request: ()| -> u64 {
                Ok(next_cycle_start_time(&mut context.dbtx().into_nc(), module).await?)
            }
        },
        api_endpoint! {
            "cycle_start_price",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, _request: ()| -> u64 {
                Ok(cycle_start_price(&mut context.dbtx().into_nc()).await?)
            }
        },
        api_endpoint! {
            "wait_cancellation_processed",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, request: PublicKey| -> Amount {
                Ok(wait_cancellation_processed(context, request).await?)
            }
        },
        api_endpoint! {
            "liquidity_stats",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, _request: ()| -> LiquidityStats {
                Ok(liquidity_stats(&mut context.dbtx().into_nc()).await?)
            }
        },
        api_endpoint! {
            "average_fee_rate",
            ApiVersion::new(0, 0),
            async |_module: &StabilityPool, context, request: u64| -> u64 {
                Ok(average_fee_rate(&mut context.dbtx().into_nc(), request).await?)
            }
        },
    ]
}

pub async fn account_info(dbtx: &mut DatabaseTransaction<'_>, account: PublicKey) -> AccountInfo {
    let (locked_seeks, locked_provides) = match dbtx.get_value(&CurrentCycleKey).await {
        Some(Cycle {
            locked_seeks: seeker_locks,
            locked_provides: provider_locks,
            ..
        }) => (
            seeker_locks
                .get(&account)
                .map(|v| v.to_vec())
                .unwrap_or_default(),
            provider_locks
                .get(&account)
                .map(|v| v.to_vec())
                .unwrap_or_default(),
        ),
        None => (vec![], vec![]),
    };

    let seeks_metadata = dbtx
        .find_by_prefix(&SeekMetadataAccountPrefix(account))
        .await
        .map(|(key, metadata)| (key.1, metadata))
        .collect()
        .await;

    AccountInfo {
        idle_balance: dbtx
            .get_value(&IdleBalanceKey(account))
            .await
            .unwrap_or(IdleBalance(Amount::ZERO))
            .0,
        staged_seeks: dbtx
            .get_value(&StagedSeeksKey(account))
            .await
            .unwrap_or_default(),
        staged_provides: dbtx
            .get_value(&StagedProvidesKey(account))
            .await
            .unwrap_or_default(),
        staged_cancellation: dbtx
            .get_value(&StagedCancellationKey(account))
            .await
            .map(|(_, cancel)| cancel),
        locked_seeks,
        locked_provides,
        seeks_metadata,
    }
}

pub async fn current_cycle_index(
    dbtx: &mut DatabaseTransaction<'_>,
) -> anyhow::Result<u64, ApiError> {
    let current_cycle_index = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or(ApiError::server_error(
            "First cycle not yet started".to_owned(),
        ))?
        .index;

    Ok(current_cycle_index)
}

pub async fn next_cycle_start_time(
    dbtx: &mut DatabaseTransaction<'_>,
    stability_pool: &StabilityPool,
) -> anyhow::Result<u64, ApiError> {
    let current_cycle_start_time = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or(ApiError::server_error(
            "First cycle not yet started".to_owned(),
        ))?
        .start_time;

    let cycle_duration = stability_pool.cfg.consensus.cycle_duration;
    let next_cycle_start_time = current_cycle_start_time + cycle_duration;
    Ok(next_cycle_start_time
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ApiError::server_error("Server system clock error".to_owned()))?
        .as_secs())
}

pub async fn cycle_start_price(
    dbtx: &mut DatabaseTransaction<'_>,
) -> anyhow::Result<u64, ApiError> {
    let current_cycle_start_price = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or(ApiError::server_error(
            "First cycle not yet started".to_owned(),
        ))?
        .start_price;

    Ok(current_cycle_start_price)
}

/// Wait until the given account's staged cancellation is processed
/// and return the amount of idle balance that can be withdrawn.
pub async fn wait_cancellation_processed(
    context: &mut ApiEndpointContext<'_>,
    account: PublicKey,
) -> anyhow::Result<Amount, ApiError> {
    let mut dbtx = context.dbtx().into_nc();
    let starting_idle_balance = match dbtx.get_value(&IdleBalanceKey(account)).await {
        Some(IdleBalance(amt)) => amt,
        None => Amount::ZERO,
    };

    let staged_cancellation = dbtx.get_value(&StagedCancellationKey(account)).await;
    drop(dbtx);

    match staged_cancellation {
        Some(_) => {
            // Cancellation is successfully processed when a higher idle balance exists than
            // the one we initially recorded.
            let future = context
                .wait_value_matches(IdleBalanceKey(account), |IdleBalance(new_idle_balance)| {
                    *new_idle_balance > starting_idle_balance
                });
            Ok(future.await.0)
        }
        None => {
            // If there's no staged cancellation but idle balance exists,
            // it's possible that the staged cancellation was already processed.
            // So we just return the amount of the idle balance.
            if starting_idle_balance != Amount::ZERO {
                Ok(starting_idle_balance)
            } else {
                Err(ApiError::bad_request(
                    "No staged cancellation or idle balance for account".to_owned(),
                ))
            }
        }
    }
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
        .map(|s| s.seek.0.msats)
        .sum();
    let staged_provides_sum_msat: u64 = dbtx
        .find_by_prefix(&StagedProvidesKeyPrefix)
        .await
        .flat_map(|(_, provides)| stream::iter(provides))
        .collect::<Vec<_>>()
        .await
        .iter()
        .map(|p| p.provide.amount.msats)
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
) -> anyhow::Result<u64, ApiError> {
    if num_cycles == 0 {
        return Err(ApiError::bad_request("num_cycles must be non-0".to_owned()));
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
    let fee_rate_sum = current_cycle.fee_rate
        + dbtx
            .find_by_prefix_sorted_descending(&PastCycleKeyPrefix)
            .await
            .take(num_prev_cycles)
            .fold(0, |acc, (_, cycle)| async move { acc + cycle.fee_rate })
            .await;
    Ok(fee_rate_sum / num_cycles)
}
