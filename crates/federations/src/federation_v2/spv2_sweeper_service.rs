use std::time::Duration;

use anyhow::anyhow;
use fedimint_client::ClientModuleInstance;
use fedimint_core::Amount;
use fedimint_core::core::OperationId;
use fedimint_core::db::{
    AutocommitResultExt as _, Committable, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped,
};
use fedimint_core::util::backoff_util::custom_backoff;
use fedimint_core::util::retry;
use futures::StreamExt;
use rpc_types::event::{Event, EventSink, TypedEventExt};
use rpc_types::{RpcAmount, SPv2WithdrawMetadata};
use stability_pool_client::api::StabilityPoolApiExt as _;
use stability_pool_client::common::{AccountId, FiatAmount, FiatOrAll, SyncResponse};
use stability_pool_client::{
    OwnAccount, StabilityPoolClientModule, StabilityPoolWithdrawalOperationState,
};
use tracing::{error, info, warn};

use super::FederationV2;
use super::client::ClientExt;
use super::db::{
    LastMultispendBtcPayoutSweepKey, LastSPv2SweeperWithdrawalKey,
    LastStabilityPoolV2DepositCycleKey,
};

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
                if let Err(e) = sweep_spv2_inner(&fed, sync_response.value).await {
                    error!(%e, "Error sweeping spv2, will retry next cycle if needed");
                }
            }
        });
        Self {}
    }
}

fn spv2_sweeper_update_variant_name(
    update: &StabilityPoolWithdrawalOperationState,
) -> &'static str {
    match update {
        StabilityPoolWithdrawalOperationState::UnlockTxRejected(_) => "UnlockTxRejected",
        StabilityPoolWithdrawalOperationState::UnlockProcessingError(_) => "UnlockProcessingError",
        StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(_) => "WithdrawalTxRejected",
        StabilityPoolWithdrawalOperationState::PrimaryOutputError(_) => "PrimaryOutputError",
        StabilityPoolWithdrawalOperationState::Success(_) => "Success",
        _ => "Other",
    }
}

async fn sweep_spv2_inner(fed: &FederationV2, sync_response: SyncResponse) -> anyhow::Result<()> {
    // In order to sweep a staged seeker deposit back into e-cash, two
    // things must be true:
    // 1. Current stability pool cycle > (last cycle in which user deposited + 2)
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
    if current_cycle_index.saturating_sub(last_deposit_cycle_index) <= 2
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
        let subscribe_res =
            subscribe_withdraw(fed.client.spv2()?, op_id, &fed.runtime.event_sink).await;
        clear_sweep_op_id(fed.dbtx().await).await;
        fed.spv2_force_sync();
        return subscribe_res;
    }

    info!("Proceeding to sweep spv2 unlocked balance");

    let (operation_id, _) = fed
        .client
        .spv2()?
        .withdraw(
            OwnAccount::Seeker,
            FiatOrAll::Fiat(FiatAmount::from_btc_amount_roundtrip_safe(
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
    let subscribe_res =
        subscribe_withdraw(fed.client.spv2()?, operation_id, &fed.runtime.event_sink).await;
    clear_sweep_op_id(fed.dbtx().await).await;
    subscribe_res
}

impl FederationV2 {
    /// Sweep the payout account in the background. This runs at startup,
    /// which covers payouts that landed while the app was closed or before a
    /// restore from seed, and after each bitcoin multispend withdrawal to it,
    /// never on a timer. It does not depend on the btc_multispend feature,
    /// which only gates new groups and deposits.
    pub(super) fn spawn_multispend_btc_payout_sweep(&self) {
        self.spawn_cancellable("multispend_btc_payout_sweep", |fed| async move {
            let swept = retry(
                "multispend btc payout sweep",
                custom_backoff(Duration::from_secs(1), Duration::from_secs(60), Some(10)),
                || fed.sweep_multispend_btc_payout(),
            )
            .await;
            if let Err(error) = swept {
                warn!(%error, "multispend btc payout sweep failed");
            }
        });
    }

    /// A bitcoin multispend withdrawal paying `to` completed, whichever
    /// device of this user submitted it.
    pub fn multispend_btc_payout_received(&self, to: &AccountId) {
        if self
            .client
            .spv2()
            .is_ok_and(|spv2| *to == spv2.own_account(OwnAccount::MultispendBtcPayout).id())
        {
            self.spawn_multispend_btc_payout_sweep();
        }
    }

    /// Sweep this member's bitcoin multispend payout account to ecash and
    /// return the swept amount. A sweep left unfinished by a restart is awaited
    /// instead of starting another. The balance is read from the federation
    /// rather than a cache, so payouts that landed before a restore from seed
    /// are swept as well.
    pub async fn sweep_multispend_btc_payout(&self) -> anyhow::Result<Option<Amount>> {
        let mut total = None;
        // a payout landing during a sweep, whose trigger only joined that
        // sweep, is left for the next round; the bound stops a payout account
        // that keeps refilling from holding this task
        for _ in 0..5 {
            let operation_id = match self
                .dbtx()
                .await
                .get_value(&LastMultispendBtcPayoutSweepKey)
                .await
            {
                Some(operation_id) => operation_id,
                None => match self.start_multispend_btc_payout_sweep().await? {
                    Some(operation_id) => operation_id,
                    None => break,
                },
            };
            let swept = self.await_multispend_btc_payout_sweep(operation_id).await;
            let mut dbtx = self.dbtx().await;
            // a sweep awaited twice must not clear the marker of a later one
            if dbtx.get_value(&LastMultispendBtcPayoutSweepKey).await == Some(operation_id) {
                dbtx.remove_entry(&LastMultispendBtcPayoutSweepKey).await;
            }
            dbtx.commit_tx_result().await?;
            total = Some(total.unwrap_or(Amount::ZERO) + swept?);
        }
        Ok(total)
    }

    /// Withdraw the staged and idle balance of the payout account, or return
    /// `None` if the account is empty. The operation and its
    /// `LastMultispendBtcPayoutSweepKey` record commit together, so a crash
    /// can never leave a sweep that a restart does not see.
    pub async fn start_multispend_btc_payout_sweep(&self) -> anyhow::Result<Option<OperationId>> {
        let spv2 = self.client.spv2()?;
        self.multispend_btc_payout_syncs
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let sync = spv2
            .api
            .account_sync(spv2.own_account(OwnAccount::MultispendBtcPayout).id())
            .await?;
        if sync.staged_balance == Amount::ZERO && sync.idle_balance == Amount::ZERO {
            return Ok(None);
        }
        info!(staged_balance = %sync.staged_balance, idle_balance = %sync.idle_balance, "Sweeping multispend btc payout account");
        let spv2_instance_id = spv2.id;
        let operation_id = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    let spv2 = spv2.clone();
                    Box::pin(async move {
                        // a sweep started since the balance was read wins
                        if let Some(operation_id) =
                            dbtx.get_value(&LastMultispendBtcPayoutSweepKey).await
                        {
                            return Ok::<_, anyhow::Error>(operation_id);
                        }
                        let operation_id = OperationId::new_random();
                        let mut spv2_dbtx = dbtx.to_ref_with_prefix_module_id(spv2_instance_id).0;
                        if sync.staged_balance != Amount::ZERO {
                            // nothing locks in a btc-depositor account, so `All`
                            // unlocks the exact staged msats, and the withdrawal
                            // claims them with any idle balance
                            spv2.withdraw_dbtx(
                                &mut spv2_dbtx,
                                operation_id,
                                OwnAccount::MultispendBtcPayout,
                                FiatOrAll::All,
                                SPv2WithdrawMetadata::MultispendBtcPayout,
                            )
                            .await?;
                        } else {
                            // left by an unlock whose withdrawal never
                            // completed, such as one cut short by a restore
                            // from seed
                            spv2.withdraw_idle_balance_dbtx(
                                &mut spv2_dbtx,
                                operation_id,
                                OwnAccount::MultispendBtcPayout,
                                sync.idle_balance,
                                SPv2WithdrawMetadata::MultispendBtcPayout,
                            )
                            .await?;
                        }
                        drop(spv2_dbtx);
                        dbtx.insert_entry(&LastMultispendBtcPayoutSweepKey, &operation_id)
                            .await;
                        Ok(operation_id)
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit()?;
        Ok(Some(operation_id))
    }

    pub(super) async fn await_multispend_btc_payout_sweep(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<Amount> {
        let spv2 = self.client.spv2()?;
        // a sweep of idle balance alone is a withdraw-idle-balance operation
        let mut updates = match spv2.subscribe_withdraw(operation_id).await {
            Ok(updates) => updates,
            Err(_) => spv2.subscribe_withdraw_idle_balance(operation_id).await?,
        }
        .into_stream();
        while let Some(update) = updates.next().await {
            match update {
                StabilityPoolWithdrawalOperationState::UnlockTxRejected(e)
                | StabilityPoolWithdrawalOperationState::UnlockProcessingError(e)
                | StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e)
                | StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => {
                    return Err(anyhow!("multispend btc payout sweep error: {e}"));
                }
                StabilityPoolWithdrawalOperationState::Success(amount) => return Ok(amount),
                _ => {}
            }
        }
        Err(anyhow!(
            "multispend btc payout sweep ended without an outcome"
        ))
    }
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
                return Err(anyhow!("spv2 Sweep error: {e}"));
            }
            StabilityPoolWithdrawalOperationState::Success(amount) => {
                event_sink.typed_event(&Event::stability_pool_unfilled_deposit_swept(RpcAmount(
                    amount,
                )));
                return Ok(());
            }
            _ => info!(
                update_variant = spv2_sweeper_update_variant_name(&update),
                "Received spv2 sweeper withdraw update"
            ),
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
