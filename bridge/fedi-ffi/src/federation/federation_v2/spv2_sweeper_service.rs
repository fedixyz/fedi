use anyhow::anyhow;
use fedimint_client::ClientModuleInstance;
use fedimint_core::core::OperationId;
use fedimint_core::db::{Committable, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::Amount;
use futures::StreamExt;
use stability_pool_client::common::{AccountType, FiatAmount, FiatOrAll, SyncResponse};
use stability_pool_client::{StabilityPoolClientModule, StabilityPoolWithdrawalOperationState};
use tracing::{error, info};

use super::client::ClientExt;
use super::db::{LastSPv2SweeperWithdrawalKey, LastStabilityPoolV2DepositCycleKey};
use super::FederationV2;
use crate::event::{Event, EventSink, TypedEventExt};
use crate::types::{RpcAmount, SPv2WithdrawMetadata};

// A continously running background service that sweeps unfilled seeker deposits
// back into e-cash balance. Unfilled deposits could be a result of
// partial/zero-fill initial deposits, or due to decrease in provider liquidity
// in some subsequent cycle.
#[derive(Clone, Debug)]
pub struct SPv2SweeperService {}

impl SPv2SweeperService {
    pub fn new(fed: &FederationV2) -> Self {
        fed.spawn_cancellable("spv2_sweeper_service", |fed| async move {
            let Some(sync_service) = fed.spv2_sync_service.get() else {
                info!("spv2 sync service not available, sweep service exiting");
                return;
            };

            let mut updates = sync_service.subscribe_to_updates();

            // Keep updating based on sync updates
            while let Some(maybe_sync_response) = updates.next().await {
                let Some(sync_response) = maybe_sync_response else {
                    continue;
                };
                if let Err(e) = sweep_spv2_inner(&fed, sync_response).await {
                    error!(%e, "Error sweeping spv2, will retry next cycle if needed");
                }
            }
        });
        Self {}
    }
}

async fn sweep_spv2_inner(fed: &FederationV2, sync_response: SyncResponse) -> anyhow::Result<()> {
    // In order to sweep a staged seeker deposit back into e-cash, two
    // things must be true:
    // 1. Current stability pool cycle > last cycle in which user deposited
    // 2. User has non-0 staged deposit balance
    //
    // If the above conditions are true, we withdraw all of the user's
    // unlocked balance back to e-cash.
    let current_cycle_index = sync_response.current_cycle.idx;
    let last_deposit_cycle_index = fed
        .client
        .db()
        .begin_transaction_nc()
        .await
        .get_value(&LastStabilityPoolV2DepositCycleKey)
        .await
        .ok_or(anyhow!("Last deposit cycle index not found"))?;

    // TODO shaurya when transfers are implemented we would also want to update
    // "last_deposit_cycle_index" for any incoming staged transfers
    if current_cycle_index <= last_deposit_cycle_index
        || sync_response.staged_balance == Amount::ZERO
    {
        return Ok(());
    }

    // Before we issue a new TX, ensure last one was completed
    if let Some(op_id) = fed
        .dbtx()
        .await
        .get_value(&LastSPv2SweeperWithdrawalKey)
        .await
    {
        let subscribe_res = subscribe_withdraw(fed.client.spv2()?, op_id, &fed.event_sink).await;
        clear_sweep_op_id(fed.dbtx().await).await;
        fed.spv2_force_sync();
        return subscribe_res;
    }

    let (operation_id, _) = fed
        .client
        .spv2()?
        .withdraw(
            AccountType::Seeker,
            FiatOrAll::Fiat(FiatAmount::from_btc_amount(
                sync_response.staged_balance,
                sync_response.current_cycle.start_price,
            )?),
            SPv2WithdrawMetadata::Sweeper,
        )
        .await?;
    record_sweep_op_id(fed.dbtx().await, operation_id).await;

    // Since all the balance is unlocked, the transaction should go through
    // relatively quickly. So we just subscribe in-line here since this is
    // already running on a background task.
    let subscribe_res = subscribe_withdraw(fed.client.spv2()?, operation_id, &fed.event_sink).await;
    clear_sweep_op_id(fed.dbtx().await).await;
    subscribe_res
}

async fn subscribe_withdraw(
    spv2: ClientModuleInstance<'_, StabilityPoolClientModule>,
    op_id: OperationId,
    event_sink: &EventSink,
) -> anyhow::Result<()> {
    let mut updates = spv2.subscribe_withdraw(op_id).await?.into_stream();
    while let Some(update) = updates.next().await {
        match update {
            StabilityPoolWithdrawalOperationState::UnlockTxRejected(e)
            | StabilityPoolWithdrawalOperationState::UnlockProcessingError(e)
            | StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e)
            | StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => {
                return Err(anyhow!("spv2 Sweep error: {e}"))
            }
            StabilityPoolWithdrawalOperationState::Success(amount) => {
                event_sink.typed_event(&Event::stability_pool_unfilled_deposit_swept(RpcAmount(
                    amount,
                )));
                return Ok(());
            }
            _ => info!("spv2 sweeper withdraw update: {:?}", update),
        }
    }

    Ok(())
}

async fn record_sweep_op_id(mut dbtx: DatabaseTransaction<'_, Committable>, op_id: OperationId) {
    dbtx.insert_entry(&LastSPv2SweeperWithdrawalKey, &op_id)
        .await;
    dbtx.commit_tx().await;
}

async fn clear_sweep_op_id(mut dbtx: DatabaseTransaction<'_, Committable>) {
    dbtx.remove_entry(&LastSPv2SweeperWithdrawalKey).await;
    dbtx.commit_tx().await;
}
