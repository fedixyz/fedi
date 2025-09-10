use std::time::Duration;

use anyhow::anyhow;
use fedimint_core::Amount;
use fedimint_core::db::IDatabaseTransactionOpsCoreTyped;
use futures::StreamExt;
use rpc_types::RpcAmount;
use rpc_types::event::{Event, EventSink, TypedEventExt};
use stability_pool_client_old::{ClientAccountInfo, StabilityPoolWithdrawalOperationState};
use tracing::{error, info};

use super::FederationV2;
use super::client::ClientExt;
use super::db::LastStabilityPoolDepositCycleKey;

// A continously running background service that sweeps unfilled seeker deposits
// back into e-cash balance. Unfilled deposits could be a result of
// partial/zero-fill initial deposits, or due to decrease in provider liquidity
// in some subsequent cycle.
#[derive(Clone, Debug)]
pub struct StabilityPoolSweeperService {}

impl StabilityPoolSweeperService {
    pub fn new(fed: &FederationV2) -> Self {
        fed.spawn_cancellable("stability_pool_sweeper_service", |fed| async move {
            continuously_sweep_stability_pool(&fed.client, fed.runtime.event_sink.clone()).await
        });
        Self {}
    }
}

async fn continuously_sweep_stability_pool(
    client: &fedimint_client::Client,
    event_sink: EventSink,
) {
    loop {
        if let Err(e) = sweep_stability_pool_inner(client, &event_sink).await {
            error!(%e, "Error sweeping stability pool, will retry next cycle if needed");
        }

        let Ok(module) = client.sp() else {
            error!("stability pool module not available");
            return;
        };
        let next_cycle_start_time = module.next_cycle_start_time().await.unwrap_or(
            fedimint_core::time::duration_since_epoch().as_secs()
                + module.cfg.cycle_duration.as_secs(),
        );
        let sleep_secs = next_cycle_start_time
            .checked_sub(fedimint_core::time::duration_since_epoch().as_secs())
            .unwrap_or_default()
            + 10; // 10s buffer to ensure cycle turnover completes
        fedimint_core::task::sleep(Duration::from_secs(sleep_secs)).await;
    }
}

async fn sweep_stability_pool_inner(
    client: &fedimint_client::Client,
    event_sink: &EventSink,
) -> anyhow::Result<()> {
    // In order to sweep a staged seeker deposit back into e-cash, two
    // things must be true:
    // 1. Current stability pool cycle > last cycle in which user deposited
    // 2. User has non-0 staged deposit balance
    //
    // If the above conditions are true, we withdraw all of the user's
    // unlocked balance back to e-cash.
    let module = client.sp()?;
    let current_cycle_index = module.current_cycle_index().await?;
    let last_deposit_cycle_index = client
        .db()
        .begin_transaction_nc()
        .await
        .get_value(&LastStabilityPoolDepositCycleKey)
        .await
        .ok_or(anyhow!("Last deposit cycle index not found"))?;
    let ClientAccountInfo { account_info, .. } = module.account_info(true).await?;

    if current_cycle_index <= last_deposit_cycle_index || account_info.staged_seeks.is_empty() {
        return Ok(());
    }

    let unlocked_amount = account_info
        .staged_seeks
        .iter()
        .map(|s| s.seek.0)
        .sum::<Amount>()
        + account_info.idle_balance;
    let (operation_id, _) = module.withdraw(unlocked_amount, 0).await?;

    // Since all the balance is unlocked, the transaction should go through
    // relatively quickly. So we just subscribe in-line here since this is
    // already running on a background task.
    let mut updates = module.subscribe_withdraw(operation_id).await?.into_stream();
    while let Some(update) = updates.next().await {
        match update {
            StabilityPoolWithdrawalOperationState::TxRejected(e) => {
                return Err(anyhow!("TX rejected: {e}"));
            }
            StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => {
                return Err(anyhow!("Primary output error: {e}"));
            }
            StabilityPoolWithdrawalOperationState::Success(amount) => {
                event_sink.typed_event(&Event::stability_pool_unfilled_deposit_swept(RpcAmount(
                    amount,
                )));
                return Ok(());
            }
            _ => info!("Stability pool sweeper withdraw update: {:?}", update),
        }
    }

    Ok(())
}
