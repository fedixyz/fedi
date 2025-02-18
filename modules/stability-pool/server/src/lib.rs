pub mod api;
pub mod db;
pub mod oracle;
use std::cmp::Ordering;
use std::collections::{BTreeMap, VecDeque};
use std::ops::Not;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::bail;
use async_trait::async_trait;
use common::config::{
    CollateralRatio, OracleConfig, StabilityPoolClientConfig, StabilityPoolConfig,
    StabilityPoolConfigConsensus, StabilityPoolConfigLocal, StabilityPoolConfigPrivate,
    StabilityPoolGenParams,
};
use common::{
    Provide, Seek, StabilityPoolCommonGen, StabilityPoolConsensusItem, StabilityPoolInput,
    StabilityPoolInputError, StabilityPoolModuleTypes, StabilityPoolOutput,
    StabilityPoolOutputError, StabilityPoolOutputOutcome, StabilityPoolOutputOutcomeV0,
    CONSENSUS_VERSION,
};
use db::{
    CurrentCycleKey, CurrentCycleKeyPrefix, Cycle, CycleChangeVoteIndexPrefix, CycleChangeVoteKey,
    IdleBalanceKey, IdleBalanceKeyPrefix, PastCycleKey, StagedProvidesKey, StagedProvidesKeyPrefix,
    StagedSeeksKey, StagedSeeksKeyPrefix, UnlockRequestKey, UnlockRequestsKeyPrefix,
};
use fedimint_core::config::{
    ConfigGenModuleParams, DkgResult, ServerModuleConfig, ServerModuleConsensusConfig,
    TypedServerModuleConfig, TypedServerModuleConsensusConfig,
};
use fedimint_core::core::ModuleInstanceId;
use fedimint_core::db::{
    DatabaseKey, DatabaseRecord, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped,
};
use fedimint_core::module::audit::Audit;
use fedimint_core::module::{
    ApiEndpoint, CoreConsensusVersion, InputMeta, ModuleConsensusVersion, ModuleInit, PeerHandle,
    ServerModuleInit, ServerModuleInitArgs, SupportedModuleApiVersions, TransactionItemAmount,
};
use fedimint_core::server::DynServerModule;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{Amount, NumPeersExt, OutPoint, PeerId, ServerModule};
use futures::{stream, StreamExt};
use itertools::Itertools;
use oracle::{AggregateOracle, MockOracle, Oracle};
pub use stability_pool_common as common;
use stability_pool_common::{
    AccountHistoryItem, AccountHistoryItemKind, AccountId, AccountType, CycleInfo, Deposit,
    DepositToProvideOutput, DepositToSeekOutput, FeeRate, FiatAmount, FiatOrAll,
    SignedTransferRequest, StabilityPoolInputV0, StabilityPoolOutputV0, TransferOutput,
    TransferRequestId, UnlockForWithdrawalInput, WithdrawalInput,
};
use tokio::sync::{Mutex, RwLock};
use tracing::{info, warn};

/// PPB unit for fee-related calculations.
const B: u128 = 1_000_000_000;

#[derive(Debug, Clone)]
pub struct StabilityPoolInit;

impl ModuleInit for StabilityPoolInit {
    type Common = StabilityPoolCommonGen;

    // TODO shaurya handle stability pool DB dump
    async fn dump_database(
        &self,
        _dbtx: &mut DatabaseTransaction<'_>,
        _prefix_names: Vec<String>,
    ) -> Box<dyn Iterator<Item = (String, Box<dyn erased_serde::Serialize + Send>)> + '_> {
        Box::new(BTreeMap::new().into_iter())
    }
}

#[async_trait]
impl ServerModuleInit for StabilityPoolInit {
    type Params = StabilityPoolGenParams;

    fn versions(&self, _core: CoreConsensusVersion) -> &[ModuleConsensusVersion] {
        &[CONSENSUS_VERSION]
    }

    fn supported_api_versions(&self) -> SupportedModuleApiVersions {
        SupportedModuleApiVersions::from_raw((2, 0), (2, 0), &[(0, 0)])
    }

    async fn init(&self, args: &ServerModuleInitArgs<Self>) -> anyhow::Result<DynServerModule> {
        Ok(StabilityPool::new(args.cfg().to_typed()?).into())
    }

    fn trusted_dealer_gen(
        &self,
        peers: &[PeerId],
        params: &ConfigGenModuleParams,
    ) -> BTreeMap<PeerId, ServerModuleConfig> {
        let params = params
            .to_typed::<StabilityPoolGenParams>()
            .expect("Invalid mint params");

        let mint_cfg: BTreeMap<_, StabilityPoolConfig> = peers
            .iter()
            .map(|&peer| {
                let config = StabilityPoolConfig {
                    local: StabilityPoolConfigLocal,
                    private: StabilityPoolConfigPrivate,
                    consensus: StabilityPoolConfigConsensus {
                        consensus_threshold: peers.to_num_peers().threshold() as _,
                        oracle_config: params.consensus.oracle_config.clone(),
                        cycle_duration: params.consensus.cycle_duration,
                        collateral_ratio: params.consensus.collateral_ratio.clone(),
                        min_allowed_seek: params.consensus.min_allowed_seek,
                        min_allowed_provide: params.consensus.min_allowed_provide,
                        max_allowed_provide_fee_rate_ppb: params
                            .consensus
                            .max_allowed_provide_fee_rate_ppb,
                        min_allowed_cancellation_bps: params.consensus.min_allowed_cancellation_bps,
                    },
                };
                (peer, config)
            })
            .collect();

        mint_cfg
            .into_iter()
            .map(|(k, v)| (k, v.to_erased()))
            .collect()
    }

    async fn distributed_gen(
        &self,
        peers: &PeerHandle,
        params: &ConfigGenModuleParams,
    ) -> DkgResult<ServerModuleConfig> {
        let params = params
            .to_typed::<StabilityPoolGenParams>()
            .expect("Invalid mint params");

        let server = StabilityPoolConfig {
            local: StabilityPoolConfigLocal,
            private: StabilityPoolConfigPrivate,
            consensus: StabilityPoolConfigConsensus {
                consensus_threshold: peers.peers.to_num_peers().threshold() as _,
                oracle_config: params.consensus.oracle_config,
                cycle_duration: params.consensus.cycle_duration,
                collateral_ratio: params.consensus.collateral_ratio,
                min_allowed_seek: params.consensus.min_allowed_seek,
                min_allowed_provide: params.consensus.min_allowed_provide,
                max_allowed_provide_fee_rate_ppb: params.consensus.max_allowed_provide_fee_rate_ppb,
                min_allowed_cancellation_bps: params.consensus.min_allowed_cancellation_bps,
            },
        };

        Ok(server.to_erased())
    }

    fn validate_config(
        &self,
        _identity: &PeerId,
        config: ServerModuleConfig,
    ) -> anyhow::Result<()> {
        let _ = config.to_typed::<StabilityPoolConfig>()?;
        Ok(())
    }

    fn get_client_config(
        &self,
        config: &ServerModuleConsensusConfig,
    ) -> anyhow::Result<StabilityPoolClientConfig> {
        let config = StabilityPoolConfigConsensus::from_erased(config)?;
        Ok(StabilityPoolClientConfig {
            cycle_duration: config.cycle_duration,
            min_allowed_seek: config.min_allowed_seek,
            max_allowed_provide_fee_rate_ppb: config.max_allowed_provide_fee_rate_ppb,
            min_allowed_cancellation_bps: config.min_allowed_cancellation_bps,
        })
    }
}

/// Helper struct to encapsulate the price of Bitcoin in cents, along with the
/// time at which the price was fetched.
#[derive(Debug)]
pub struct PrefetchedPrice {
    pub time: SystemTime,
    pub price: FiatAmount,
}

#[derive(Debug)]
pub struct StabilityPool {
    pub cfg: StabilityPoolConfig,
    pub prefetched_price: Arc<RwLock<Option<PrefetchedPrice>>>,
    pub last_consensus_proposal: Mutex<Option<StabilityPoolConsensusItem>>,
}

impl StabilityPool {
    pub fn new(cfg: StabilityPoolConfig) -> Self {
        let oracle: Box<dyn Oracle> = match cfg.consensus.oracle_config {
            OracleConfig::Mock => Box::new(MockOracle::new()),
            OracleConfig::Aggregate => Box::new(AggregateOracle::new_with_default_sources()),
        };
        let prefetched_price = Arc::new(RwLock::new(None));
        let prefetched_price_copy = Arc::clone(&prefetched_price);
        fedimint_core::task::spawn("oracle price fetch", async move {
            // To speed up consensus_proposal(), we pre-fetch the price from the
            // oracle in a separate task. The price fetch happens
            // every 30s, or at an interval which is 10% of the cycle duration,
            // whichever is shorter.
            //
            // In case the price fetch fails, we retry again after waiting half
            // the time and record a "None". If consensus_proposal() sees that the
            // prefetched price is recorded as "None" it will abstain from
            // proposing any consensus items. This ensures that outdated
            // prices don't accidentally lead to stale consensus items.
            let price_fetch_interval =
                Duration::from_secs(30.min(cfg.consensus.cycle_duration.as_secs().div_ceil(10)));

            loop {
                match oracle.get_price().await {
                    Ok(price) => {
                        *prefetched_price_copy.write().await = Some(PrefetchedPrice {
                            time: fedimint_core::time::now(),
                            price,
                        });
                        fedimint_core::task::sleep(price_fetch_interval).await;
                    }
                    Err(e) => {
                        warn!("oracle price fetch error: {e}");
                        *prefetched_price_copy.write().await = None;
                        fedimint_core::task::sleep(price_fetch_interval / 2).await;
                    }
                }
            }
        });
        StabilityPool {
            cfg,
            prefetched_price,
            last_consensus_proposal: Mutex::new(None),
        }
    }
}

#[async_trait]
impl ServerModule for StabilityPool {
    type Init = StabilityPoolInit;
    type Common = StabilityPoolModuleTypes;

    async fn consensus_proposal(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
    ) -> Vec<StabilityPoolConsensusItem> {
        // Below we use some calculations to determine if enough time has passed since
        // the last recorded consensus proposal. Here we define "enough time" as 15s or
        // 5% of the cycle duration, whichever is shorter.
        let enough_time_duration =
            Duration::from_secs(15.min(self.cfg.consensus.cycle_duration.as_secs().div_ceil(20)));

        let current_cycle = dbtx.get_value(&CurrentCycleKey).await;
        let last_cp_v0 = self
            .last_consensus_proposal
            .lock()
            .await
            .clone()
            .map(|cp| cp.maybe_v0_ref().cloned())
            .unwrap_or_default();
        let should_propose_new_cycle = match (&current_cycle, last_cp_v0) {
            (None, None) => {
                // If no current cycle logged, and no recorded last consensus proposal,
                // we should propose a consensus item immediately.
                //
                // This should only happen on the very first run with a fresh DB.
                true
            }
            (None, Some(last_cp_v0)) => {
                // If no current cycle logged, but a record of the last consensus proposal
                // exists, we should propose a consensus item only if "enough time" has passed
                // since the last consensus proposal.
                //
                // This should only happen when the DB is fresh (no stability pool cycles
                // logged) and the guardians are trying to arrive at consensus regarding the
                // first cycle.
                match last_cp_v0.time.elapsed() {
                    Ok(duration) => duration > enough_time_duration,
                    Err(_) => false,
                }
            }
            (Some(current_cycle), None) => {
                // If a current cycle exists, but no record of the last consensus proposal
                // exists, we should propose a consensus item only if cycle_duration time has
                // passed since the beginning of the current cycle.
                //
                // This should only happen when an upgraded fedimintd binary is run for the
                // first time where stability pool cycles already exist in the DB.
                match current_cycle.start_time.elapsed() {
                    Ok(duration) => duration > self.cfg.consensus.cycle_duration,
                    Err(_) => false,
                }
            }
            (Some(current_cycle), Some(last_cp_v0)) => {
                // If a current cycle exists, and a record of the last consensus proposal exists
                // we should propose a consensus item only if cycle_duration has passed since
                // the beginning of the current cycle AND:
                // - if (last_cp_v0's index == current_cycle's index + 1), then "enough time"
                //   has passed since the last CP
                // - if the indices don't respect this equality, propose immediately
                //
                // This should be the usual case whereby stability pool cycles already exist in
                // the DB and consensus items have been proposed by this module in the past.
                match current_cycle.start_time.elapsed() {
                    Ok(duration) if duration > self.cfg.consensus.cycle_duration => {
                        if last_cp_v0.next_cycle_index == current_cycle.index + 1 {
                            match last_cp_v0.time.elapsed() {
                                Ok(duration) => duration > enough_time_duration,
                                Err(_) => false,
                            }
                        } else {
                            true
                        }
                    }
                    _ => false,
                }
            }
        };

        if should_propose_new_cycle {
            match *self.prefetched_price.read().await {
                None => {
                    warn!("prefetched price absent, cannot propose CI");
                    vec![]
                }
                Some(PrefetchedPrice { price, .. }) => {
                    let new_cp = StabilityPoolConsensusItem::new_v0(
                        current_cycle
                            .map(|Cycle { index, .. }| index + 1)
                            .unwrap_or_default(),
                        fedimint_core::time::now(),
                        price,
                    );
                    *self.last_consensus_proposal.lock().await = Some(new_cp.clone());
                    vec![new_cp]
                }
            }
        } else {
            vec![]
        }
    }

    async fn process_consensus_item<'a, 'b>(
        &'a self,
        dbtx: &mut DatabaseTransaction<'b>,
        consensus_item: StabilityPoolConsensusItem,
        peer_id: PeerId,
    ) -> anyhow::Result<()> {
        let next_cycle_index = consensus_item.next_cycle_index()?;

        // Bail if vote is not for next cycle
        let mut current_cycle = dbtx.get_value(&CurrentCycleKey).await;
        if let Some(Cycle { index, .. }) = current_cycle {
            if next_cycle_index != index + 1 {
                bail!("Vote is not for next cycle");
            }
        }

        // Bail if already received peer's vote for cycle
        let vote_key = CycleChangeVoteKey(next_cycle_index, peer_id);
        if dbtx.get_value(&vote_key).await.is_some() {
            bail!("Already received peer's vote for cycle {next_cycle_index}");
        }

        // Record peer's vote
        dbtx.insert_new_entry(&vote_key, &consensus_item).await;

        // Return early if threshold not reached yet
        let vote_cycle_index_prefix = CycleChangeVoteIndexPrefix(next_cycle_index);
        let mut cycle_change_votes = dbtx
            .find_by_prefix(&vote_cycle_index_prefix)
            .await
            .map(|(_, vote)| vote)
            .collect::<Vec<_>>()
            .await;
        if cycle_change_votes.len() < self.cfg.consensus.consensus_threshold as usize {
            return Ok(());
        }

        info!("new cycle");

        // Take time from vote with median time, and price from vote with median price
        cycle_change_votes.sort_unstable_by_key(|vote| vote.time().map_err(|e| e.to_string()));
        let new_time = cycle_change_votes[cycle_change_votes.len() / 2].time()?;
        cycle_change_votes.sort_unstable_by_key(|vote| vote.price().map_err(|e| e.to_string()));
        let new_price = cycle_change_votes[cycle_change_votes.len() / 2].price()?;

        // Use value derived from cycle start time as randomness.
        // This will be the same for all the guardians.
        // We avoid using a seedable PRNG as its behavior could implicitly
        // change depending on rust compiler / stdlib version.
        let randomness = new_time
            .duration_since(UNIX_EPOCH)
            .expect("Consensus cycle time must be after EPOCH")
            .subsec_nanos() as usize;

        // When threshold reached:
        //  If current_cycle exists
        //  - write current_cycle to PastCycle key store
        //  - settle locks using new price
        //  - process any unlock requests
        //  - move remaining locks to staged
        if let Some(current_cycle) = &mut current_cycle {
            dbtx.insert_entry(&PastCycleKey(current_cycle.index), current_cycle)
                .await;
            settle_locks(
                &mut current_cycle.locked_seeks,
                &mut current_cycle.locked_provides,
                current_cycle.start_price,
                new_price,
                randomness,
            );
            process_unlock_requests(
                dbtx,
                &mut current_cycle.locked_seeks,
                &mut current_cycle.locked_provides,
                CycleInfo {
                    idx: next_cycle_index,
                    start_time: new_time,
                    start_price: new_price,
                },
            )
            .await?;
            restage_remaining_locks(
                dbtx,
                &current_cycle.locked_seeks,
                &current_cycle.locked_provides,
            )
            .await;
        }

        //  Then
        //  - calculate new locks and write new current cycle
        //  - clear peer votes
        calculate_locks_and_write_cycle(
            dbtx,
            &self.cfg.consensus.collateral_ratio,
            next_cycle_index,
            new_time,
            new_price,
            randomness,
            current_cycle.as_ref(),
        )
        .await?;
        dbtx.remove_by_prefix(&vote_cycle_index_prefix).await;
        Ok(())
    }

    async fn process_input<'a, 'b, 'c>(
        &'a self,
        dbtx: &mut DatabaseTransaction<'c>,
        input: &'b StabilityPoolInput,
    ) -> Result<InputMeta, StabilityPoolInputError> {
        let v0 = input
            .ensure_v0_ref()
            .map_err(|e| StabilityPoolInputError::UnknownInputVariant(e.to_string()))?;

        // multi sig not allowed as input.
        if v0.account().as_single().is_none() {
            return Err(StabilityPoolInputError::MultiSigNotAllowed);
        };

        match v0 {
            StabilityPoolInputV0::UnlockForWithdrawal(unlock) => {
                process_unlock_input(dbtx, unlock).await
            }
            StabilityPoolInputV0::Withdrawal(withdrawal) => {
                process_withdrawal_input(dbtx, withdrawal).await
            }
        }
    }

    async fn process_output<'a, 'b>(
        &'a self,
        dbtx: &mut DatabaseTransaction<'b>,
        output: &'a StabilityPoolOutput,
        _outpoint: OutPoint,
    ) -> Result<TransactionItemAmount, StabilityPoolOutputError> {
        let v0 = output
            .ensure_v0_ref()
            .map_err(|e| StabilityPoolOutputError::UnknownOutputVariant(e.to_string()))?;

        let account_id = match v0 {
            StabilityPoolOutputV0::DepositToSeek(s) => s.account_id,
            StabilityPoolOutputV0::DepositToProvide(p) => p.account_id,
            StabilityPoolOutputV0::Transfer(t) => t.signed_request.details().from().id(),
        };

        if dbtx
            .get_value(&UnlockRequestKey(account_id))
            .await
            .is_some()
        {
            return Err(StabilityPoolOutputError::PreviousIntentionNotFullyProcessed);
        }

        match v0 {
            StabilityPoolOutputV0::DepositToSeek(deposit_to_seek)
                if account_id.acc_type() == AccountType::Seeker =>
            {
                process_deposit_to_seek_output(self.cfg.clone(), dbtx, deposit_to_seek).await
            }
            StabilityPoolOutputV0::DepositToProvide(deposit_to_provide)
                if account_id.acc_type() == AccountType::Provider =>
            {
                process_deposit_to_provide_output(self.cfg.clone(), dbtx, deposit_to_provide).await
            }
            StabilityPoolOutputV0::Transfer(transfer) => {
                process_transfer_output(self.cfg.clone(), dbtx, transfer).await
            }
            _ => Err(StabilityPoolOutputError::InvalidAccountTypeForOperation),
        }
    }

    async fn output_status(
        &self,
        _dbtx: &mut DatabaseTransaction<'_>,
        _out_point: OutPoint,
    ) -> Option<StabilityPoolOutputOutcome> {
        Some(StabilityPoolOutputOutcome::V0(StabilityPoolOutputOutcomeV0))
    }

    /// Queries the database and returns all assets and liabilities of the
    /// module.
    ///
    /// Summing over all modules, if liabilities > assets then an error has
    /// occurred in the database and consensus should halt.
    async fn audit(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        audit: &mut Audit,
        module_instance_id: ModuleInstanceId,
    ) {
        // All recorded idle balance is a liability
        audit
            .add_items(
                dbtx,
                module_instance_id,
                &IdleBalanceKeyPrefix,
                |_, idle_bal| -(idle_bal.msats as i64),
            )
            .await;

        // Staged seeks and provides are also liabilities
        audit
            .add_items(
                dbtx,
                module_instance_id,
                &StagedSeeksKeyPrefix,
                |_, seek_list| -(seek_list.iter().fold(0, |acc, s| acc + s.amount.msats) as i64),
            )
            .await;
        audit
            .add_items(
                dbtx,
                module_instance_id,
                &StagedProvidesKeyPrefix,
                |_, provide_list| {
                    -(provide_list.iter().fold(0, |acc, p| acc + p.amount.msats) as i64)
                },
            )
            .await;

        // Finally, the combined amount of locked seeks and provides in the
        // current cycle is also a liability. Locked seeks and provides are born
        // out of staged seeks and provides, respectively, leaving behind any "unused"
        // portions as still staged.
        audit
            .add_items(
                dbtx,
                module_instance_id,
                &CurrentCycleKeyPrefix,
                |_, current_cycle| {
                    let all_locked_seeks = current_cycle
                        .locked_seeks
                        .iter()
                        .flat_map(|(_, seek_list)| seek_list)
                        .fold(0, |acc, s| acc + s.amount.msats);
                    let all_locked_provides = current_cycle
                        .locked_provides
                        .iter()
                        .flat_map(|(_, provide_list)| provide_list)
                        .fold(0, |acc, p| acc + p.amount.msats);
                    -((all_locked_seeks + all_locked_provides) as i64)
                },
            )
            .await;
    }

    fn api_endpoints(&self) -> Vec<ApiEndpoint<Self>> {
        api::endpoints()
    }
}

async fn process_unlock_input_inner<K, M>(
    dbtx: &mut DatabaseTransaction<'_>,
    input: &UnlockForWithdrawalInput,
    staged_key: &K,
    locked_deposits: &[Deposit<M>],
    current_cycle: &Cycle,
) -> Result<InputMeta, StabilityPoolInputError>
where
    M: MaybeSend + MaybeSync + Clone,
    K: DatabaseKey + DatabaseRecord<Value = Vec<Deposit<M>>> + MaybeSend + MaybeSync,
{
    let btc_price = current_cycle.start_price;
    let unlock_key = UnlockRequestKey(input.account.id());
    if dbtx.get_value(&unlock_key).await.is_some() {
        return Err(StabilityPoolInputError::DuplicateUnlockRequest);
    }

    let mut staged_deposits = dbtx.get_value(staged_key).await.unwrap_or_default();
    let locked_deposits_sum = locked_deposits.iter().map(|d| d.amount).sum();

    let mut drained_staged_deposits = vec![];
    match input.amount {
        FiatOrAll::Fiat(fiat_amount) => {
            let amount = fiat_amount
                .to_btc_amount(btc_price)
                .map_err(|_| StabilityPoolInputError::TemporaryError)?;
            let staged_deposits_sum = staged_deposits.iter().map(|d| d.amount).sum::<Amount>();
            let total_deposits_sum = staged_deposits_sum + locked_deposits_sum;

            if total_deposits_sum < amount {
                return Err(StabilityPoolInputError::InsufficientBalance);
            }

            // Drain staged deposits in reverse (newest to oldest).
            let mut amount_needed = amount;
            if staged_deposits.is_empty().not() {
                drained_staged_deposits = drain_in_reverse(&mut staged_deposits, amount_needed);
                amount_needed -= drained_staged_deposits.iter().map(|d| d.amount).sum();
                dbtx.insert_entry(staged_key, &staged_deposits).await;
            }

            // If staged deposits were not enough, register an unlock
            // request for the leftover fiat amount
            if amount_needed != Amount::ZERO {
                let leftover_fiat = FiatAmount::from_btc_amount(amount_needed, btc_price)
                    .map_err(|_| StabilityPoolInputError::TemporaryError)?;
                dbtx.insert_entry(&unlock_key, &FiatOrAll::Fiat(leftover_fiat))
                    .await;
            }
        }
        FiatOrAll::All => {
            // If there are no staged or locked deposits, report error
            if staged_deposits.is_empty() && locked_deposits_sum == Amount::ZERO {
                return Err(StabilityPoolInputError::InsufficientBalance);
            }

            // If applicable, clear all staged deposits and credit idle balance
            if staged_deposits.is_empty().not() {
                drained_staged_deposits = staged_deposits;
                dbtx.remove_entry(staged_key).await;
            }

            // If there are locked deposits present, register an unlock request for ALL
            if locked_deposits_sum != Amount::ZERO {
                dbtx.insert_entry(&unlock_key, &FiatOrAll::All).await;
            }
        }
    }

    let idle_balance_credit = drained_staged_deposits.iter().map(|d| d.amount).sum();
    if idle_balance_credit != Amount::ZERO {
        let idle_bal_key = IdleBalanceKey(input.account.id());
        let idle_balance = dbtx.get_value(&idle_bal_key).await.unwrap_or(Amount::ZERO);
        dbtx.insert_entry(&idle_bal_key, &(idle_balance + idle_balance_credit))
            .await;
    }

    db::add_account_history_items(
        dbtx,
        input.account.id(),
        drained_staged_deposits
            .into_iter()
            .map(|drained| AccountHistoryItem {
                cycle: current_cycle.into(),
                kind: AccountHistoryItemKind::StagedToIdle {
                    amount_withdrawn: drained.amount,
                    desposit_sequence: drained.sequence,
                },
            }),
    )
    .await;

    Ok(InputMeta {
        amount: TransactionItemAmount {
            amount: Amount::ZERO,
            fee: Amount::ZERO,
        },
        pub_key: *input
            .account
            .as_single()
            .ok_or(StabilityPoolInputError::MultiSigNotAllowed)?,
    })
}

async fn process_unlock_input(
    dbtx: &mut DatabaseTransaction<'_>,
    input: &UnlockForWithdrawalInput,
) -> Result<InputMeta, StabilityPoolInputError> {
    let current_cycle = dbtx
        .get_value(&CurrentCycleKey)
        .await
        .ok_or(StabilityPoolInputError::TemporaryError)?;

    match input.account.acc_type() {
        AccountType::Seeker => {
            let staged_key = StagedSeeksKey(input.account.id());
            process_unlock_input_inner(
                dbtx,
                input,
                &staged_key,
                current_cycle
                    .locked_seeks
                    .get(&input.account.id())
                    .unwrap_or(&vec![]),
                &current_cycle,
            )
            .await
        }
        AccountType::Provider => {
            let staged_key = StagedProvidesKey(input.account.id());
            process_unlock_input_inner(
                dbtx,
                input,
                &staged_key,
                current_cycle
                    .locked_provides
                    .get(&input.account.id())
                    .unwrap_or(&vec![]),
                &current_cycle,
            )
            .await
        }
    }
}

async fn process_withdrawal_input(
    dbtx: &mut DatabaseTransaction<'_>,
    input: &WithdrawalInput,
) -> Result<InputMeta, StabilityPoolInputError> {
    if input.amount == Amount::ZERO {
        return Err(StabilityPoolInputError::InvalidWithdrawalAmount);
    }

    let idle_balance = dbtx
        .get_value(&IdleBalanceKey(input.account.id()))
        .await
        .unwrap_or(Amount::ZERO);

    if input.amount < idle_balance {
        return Err(StabilityPoolInputError::InsufficientBalance);
    }

    let new_idle_balance = idle_balance - input.amount;
    dbtx.insert_entry(&IdleBalanceKey(input.account.id()), &new_idle_balance)
        .await;

    Ok(InputMeta {
        amount: TransactionItemAmount {
            amount: input.amount,
            fee: Amount::ZERO,
        },
        pub_key: *input
            .account
            .as_single()
            .ok_or(StabilityPoolInputError::MultiSigNotAllowed)?,
    })
}

async fn process_deposit_to_seek_output(
    config: StabilityPoolConfig,
    dbtx: &mut DatabaseTransaction<'_>,
    output: &DepositToSeekOutput,
) -> Result<TransactionItemAmount, StabilityPoolOutputError> {
    if output.seek_request.0 < config.consensus.min_allowed_seek {
        return Err(StabilityPoolOutputError::AmountTooLow);
    }
    let Some(current_cycle) = dbtx.get_value(&CurrentCycleKey).await else {
        return Err(StabilityPoolOutputError::NoCycle);
    };

    let mut user_staged_seeks = dbtx
        .get_value(&StagedSeeksKey(output.account_id))
        .await
        .unwrap_or_default();

    let sequence = db::next_deposit_sequence(dbtx).await;
    user_staged_seeks.push(Seek {
        sequence,
        amount: output.seek_request.0,
        meta: (),
    });

    dbtx.insert_entry(&StagedSeeksKey(output.account_id), &user_staged_seeks)
        .await;
    db::add_account_history_items(
        dbtx,
        output.account_id,
        [AccountHistoryItem {
            cycle: current_cycle.into(),
            kind: AccountHistoryItemKind::DepositToStaged {
                deposit_sequence: sequence,
                amount: output.seek_request.0,
            },
        }],
    )
    .await;
    Ok(TransactionItemAmount {
        amount: output.seek_request.0,
        fee: Amount::ZERO,
    })
}

async fn process_deposit_to_provide_output(
    config: StabilityPoolConfig,
    dbtx: &mut DatabaseTransaction<'_>,
    output: &DepositToProvideOutput,
) -> Result<TransactionItemAmount, StabilityPoolOutputError> {
    if output.provide_request.amount < config.consensus.min_allowed_provide {
        return Err(StabilityPoolOutputError::AmountTooLow);
    }

    if config.consensus.max_allowed_provide_fee_rate_ppb < output.provide_request.min_fee_rate.0 {
        return Err(StabilityPoolOutputError::FeeRateTooHigh);
    }

    let Some(current_cycle) = dbtx.get_value(&CurrentCycleKey).await else {
        return Err(StabilityPoolOutputError::NoCycle);
    };

    let mut user_staged_provides = dbtx
        .get_value(&StagedProvidesKey(output.account_id))
        .await
        .unwrap_or_default();

    let sequence = db::next_deposit_sequence(dbtx).await;
    user_staged_provides.push(Provide {
        sequence,
        amount: output.provide_request.amount,
        meta: output.provide_request.min_fee_rate,
    });

    dbtx.insert_entry(&StagedProvidesKey(output.account_id), &user_staged_provides)
        .await;
    db::add_account_history_items(
        dbtx,
        output.account_id,
        [AccountHistoryItem {
            cycle: current_cycle.into(),
            kind: AccountHistoryItemKind::DepositToStaged {
                deposit_sequence: sequence,
                amount: output.provide_request.amount,
            },
        }],
    )
    .await;
    Ok(TransactionItemAmount {
        amount: output.provide_request.amount,
        fee: Amount::ZERO,
    })
}

async fn process_transfer_output_inner<M, K>(
    dbtx: &mut DatabaseTransaction<'_>,
    signed_request: &SignedTransferRequest,
    cycle_info: CycleInfo,
    locked_deposits_map: &mut BTreeMap<AccountId, Vec<Deposit<M>>>,
    from_staged_deposits_key: K,
    to_staged_deposits_key: K,
    new_deposit_meta: M,
) -> Result<(), StabilityPoolOutputError>
where
    M: MaybeSend + MaybeSync + Clone,
    K: DatabaseKey + DatabaseRecord<Value = Vec<Deposit<M>>> + MaybeSend + MaybeSync,
{
    // Ensure signatures are valid
    signed_request
        .validate_signatures()
        .map_err(|e| StabilityPoolOutputError::InvalidTransferRequest(e.to_string()))?;

    // Prevent replay attacks
    db::ensure_unique_transfer_request_and_log(
        &TransferRequestId::from(signed_request.details()),
        dbtx,
    )
    .await
    .map_err(|e| StabilityPoolOutputError::InvalidTransferRequest(e.to_string()))?;

    // Calculate the total btc amount to transfer
    let mut from_staged_deposits = dbtx
        .get_value(&from_staged_deposits_key)
        .await
        .unwrap_or_default();
    let from_staged_deposits_sum = from_staged_deposits
        .iter()
        .map(|d| d.amount)
        .sum::<Amount>();
    let from_locked_deposits_sum = locked_deposits_map
        .get(&signed_request.details().from().id())
        .unwrap_or(&vec![])
        .iter()
        .map(|d| d.amount)
        .sum::<Amount>();
    let total_to_transfer = match signed_request.details().amount() {
        FiatOrAll::Fiat(fiat_amount) => {
            let amount = fiat_amount
                .to_btc_amount(cycle_info.start_price)
                .map_err(|e| StabilityPoolOutputError::InvalidTransferRequest(e.to_string()))?;

            if amount > from_staged_deposits_sum + from_locked_deposits_sum {
                return Err(StabilityPoolOutputError::InvalidTransferRequest(
                    "Insufficient from account balance".to_string(),
                ));
            }

            amount
        }
        FiatOrAll::All => {
            if from_staged_deposits_sum == Amount::ZERO && from_locked_deposits_sum == Amount::ZERO
            {
                return Err(StabilityPoolOutputError::InvalidTransferRequest(
                    "From account has 0 balance".to_string(),
                ));
            }

            from_staged_deposits_sum + from_locked_deposits_sum
        }
    };

    // We can use the same sequence for both staged and locked deposit in case both
    // get created for "to" account. This just simulates a split, something we
    // already do when a staged deposit was only partially locked.
    let next_sequence = db::next_deposit_sequence(dbtx).await;

    // Start by draining staged deposits in reverse.
    let mut left_to_transfer = total_to_transfer;
    let drained_staged_deposits = drain_in_reverse(&mut from_staged_deposits, left_to_transfer);
    left_to_transfer -= drained_staged_deposits.iter().map(|d| d.amount).sum();

    let mut from_account_history_items = vec![];
    let mut to_account_history_items = vec![];
    if drained_staged_deposits.is_empty().not() {
        // Write updated staged deposits for "from"
        dbtx.insert_entry(&from_staged_deposits_key, &from_staged_deposits)
            .await;

        // Write updated staged deposits for "to"
        let mut to_staged_deposits = dbtx
            .get_value(&to_staged_deposits_key)
            .await
            .unwrap_or_default();
        let new_to_staged_deposit = Deposit {
            sequence: next_sequence,
            amount: drained_staged_deposits.iter().map(|d| d.amount).sum(),
            meta: new_deposit_meta.clone(),
        };
        to_staged_deposits.push(new_to_staged_deposit.clone());
        dbtx.insert_entry(&to_staged_deposits_key, &to_staged_deposits)
            .await;

        // Add account history items for "from" and "to"
        from_account_history_items.extend(&mut drained_staged_deposits.into_iter().map(|d| {
            AccountHistoryItem {
                cycle: cycle_info,
                kind: AccountHistoryItemKind::StagedTransferOut {
                    desposit_sequence: d.sequence,
                    amount: d.amount,
                    to: *signed_request.details().to(),
                    meta: signed_request.details().meta().to_vec(),
                },
            }
        }));
        to_account_history_items.push(AccountHistoryItem {
            cycle: cycle_info,
            kind: AccountHistoryItemKind::StagedTransferIn {
                desposit_sequence: new_to_staged_deposit.sequence,
                amount: new_to_staged_deposit.amount,
                from: signed_request.details().from().id(),
                meta: signed_request.details().meta().to_vec(),
            },
        });
    }

    // If needed, drain locked deposits in reverse as well.
    if left_to_transfer != Amount::ZERO {
        let drained_locked_deposits = drain_in_reverse(
            locked_deposits_map
                .get_mut(&signed_request.details().from().id())
                .unwrap_or(&mut vec![]),
            left_to_transfer,
        );
        let amount = drained_locked_deposits.iter().map(|d| d.amount).sum();
        debug_assert!(amount != Amount::ZERO, "Transfer amount validated above");
        let new_to_locked_deposit = Deposit {
            sequence: next_sequence,
            amount,
            meta: new_deposit_meta,
        };
        locked_deposits_map
            .entry(*signed_request.details().to())
            .or_default()
            .push(new_to_locked_deposit.clone());

        // Add account history items for "from" and "to"
        from_account_history_items.extend(&mut drained_locked_deposits.into_iter().map(|d| {
            AccountHistoryItem {
                cycle: cycle_info,
                kind: AccountHistoryItemKind::LockedTransferOut {
                    desposit_sequence: d.sequence,
                    amount: d.amount,
                    to: *signed_request.details().to(),
                    meta: signed_request.details().meta().to_vec(),
                },
            }
        }));
        to_account_history_items.push(AccountHistoryItem {
            cycle: cycle_info,
            kind: AccountHistoryItemKind::LockedTransferIn {
                desposit_sequence: new_to_locked_deposit.sequence,
                amount: new_to_locked_deposit.amount,
                from: signed_request.details().from().id(),
                meta: signed_request.details().meta().to_vec(),
            },
        });
    }

    db::add_account_history_items(
        dbtx,
        signed_request.details().from().id(),
        from_account_history_items,
    )
    .await;
    db::add_account_history_items(
        dbtx,
        *signed_request.details().to(),
        to_account_history_items,
    )
    .await;

    Ok(())
}

async fn process_transfer_output(
    config: StabilityPoolConfig,
    dbtx: &mut DatabaseTransaction<'_>,
    output: &TransferOutput,
) -> Result<TransactionItemAmount, StabilityPoolOutputError> {
    let TransferOutput { signed_request } = output;
    // Ensure account types match
    if signed_request.details().from().acc_type() != signed_request.details().to().acc_type() {
        return Err(StabilityPoolOutputError::InvalidTransferRequest(
            "Cannot cross-transfer between seeker and provider".to_string(),
        ));
    }

    let current_cycle = dbtx.get_value(&CurrentCycleKey).await;
    debug_assert!(
        current_cycle.is_some(),
        "Transfer impossible without active cycle"
    );
    let Some(mut current_cycle) = current_cycle else {
        return Err(StabilityPoolOutputError::InvalidTransferRequest(
            "Try again later".to_string(),
        ));
    };
    let cycle_info = CycleInfo::from(&current_cycle);

    if signed_request.details().valid_until_cycle() < current_cycle.index {
        return Err(StabilityPoolOutputError::InvalidTransferRequest(
            "Transfer request has expired".to_string(),
        ));
    }

    // Handle provider and seeker separately
    match signed_request.details().from().acc_type() {
        AccountType::Seeker => {
            process_transfer_output_inner(
                dbtx,
                signed_request,
                cycle_info,
                &mut current_cycle.locked_seeks,
                StagedSeeksKey(signed_request.details().from().id()),
                StagedSeeksKey(*signed_request.details().to()),
                (),
            )
            .await
        }
        AccountType::Provider => {
            if let Some(fee_rate) = signed_request.details().new_fee_rate() {
                if config.consensus.max_allowed_provide_fee_rate_ppb < fee_rate.0 {
                    return Err(StabilityPoolOutputError::FeeRateTooHigh);
                }
                process_transfer_output_inner(
                    dbtx,
                    signed_request,
                    cycle_info,
                    &mut current_cycle.locked_provides,
                    StagedProvidesKey(signed_request.details().from().id()),
                    StagedProvidesKey(*signed_request.details().to()),
                    fee_rate,
                )
                .await
            } else {
                return Err(StabilityPoolOutputError::InvalidTransferRequest(
                    "Missing fee rate for provider-to-provider transfer".to_string(),
                ));
            }
        }
    }?;

    // If call to inner function was successful, write the updated current cycle
    // to the DB
    dbtx.insert_entry(&CurrentCycleKey, &current_cycle).await;
    Ok(TransactionItemAmount {
        amount: Amount::ZERO,
        fee: Amount::ZERO,
    })
}

// Starting with an msat pool, distribute amounts to every deposit based on the
// deposit's stake. Here a deposit's "stake" is defined as its ratio of the
// total deposits sum. If the pool is not fully drained by the end due to
// rounding errors, randomly distribute any leftover msats.
fn distribute_from_pool<M>(
    deposits: &mut [&mut Deposit<M>],
    distribution_msat_pool: u128,
    randomness: usize,
) {
    let total_deposits_msats = u128::from(deposits.iter().map(|d| d.amount.msats).sum::<u64>());

    // Now we distribute msats owed to the deposits based on their share
    // of distribution_msat_pool.
    let mut draining_msat_pool = distribution_msat_pool;
    for d in deposits.iter_mut() {
        let new_amount = (distribution_msat_pool * d.amount.msats as u128) / total_deposits_msats;
        draining_msat_pool -= new_amount;
        // `distribution_msat_pool` fits in u64 since it cannot grow larger than 21
        // million BTC. `new_amount` is less than `distribution_msat_pool`.
        // Therefore, `new_amount` must fit in u64.
        d.amount.msats = new_amount.try_into().unwrap();
    }

    // If there's any left over msats owed to seeks (due to rounding),
    // we allot them to an arbitrary seek.
    if draining_msat_pool != 0 {
        let rand_index = randomness % deposits.len();
        if let Some(d) = deposits.get_mut(rand_index) {
            // `draining_msat_pool` starts off as `distribution_msat_pool` and gets
            // progressively smaller. `distribution_msat_pool` fits in u64 since it
            // cannot grow larger than 21 million BTC. Therefore
            // `draining_msat_pool` must also fit in u64.
            d.amount.msats += TryInto::<u64>::try_into(draining_msat_pool).unwrap();
        }
    }
}

fn settle_locks(
    locked_seeks: &mut BTreeMap<AccountId, Vec<Seek>>,
    locked_provides: &mut BTreeMap<AccountId, Vec<Provide>>,
    start_price: FiatAmount,
    new_price: FiatAmount,
    randomness: usize,
) {
    let total_seek_msats = locked_seeks
        .values()
        .flatten()
        .fold(0u128, |acc, Seek { amount, .. }| acc + amount.msats as u128);
    let total_provide_msats = locked_provides
        .values()
        .flatten()
        .fold(0u128, |acc, Provide { amount, .. }| {
            acc + amount.msats as u128
        });
    let total_msats_available = total_seek_msats + total_provide_msats;

    // To calculate the new msats needed to cover the $ value of all
    // the seeks, we multiply (total_seek_msats * start_price) and do
    // ceiling division with (new_price). We then min this with the
    // total_msats_available to ensure we don't overshoot what we have.
    // Whatever is left is what the provides get.
    let msats_needed_for_seeks = ceil_division(
        total_seek_msats * u128::from(start_price.0),
        u128::from(new_price.0),
    );
    let seeks_msat_pool = msats_needed_for_seeks.min(total_msats_available);
    let provides_msat_pool = total_msats_available - seeks_msat_pool;

    // Now we distribute msats owed to the seeks based on their share
    // of total_seek_msats.
    // Similarly we distribute msats owed to the provides based on their share
    // of total_provide_msats.
    distribute_from_pool(
        &mut locked_seeks.values_mut().flatten().collect_vec(),
        seeks_msat_pool,
        randomness,
    );
    distribute_from_pool(
        &mut locked_provides.values_mut().flatten().collect_vec(),
        provides_msat_pool,
        randomness,
    );
}

async fn process_unlock_requests_inner<M>(
    dbtx: &mut DatabaseTransaction<'_>,
    account_id: AccountId,
    unlock_amount: FiatOrAll,
    locked_deposits: &mut Vec<Deposit<M>>,
    new_cycle_info: &CycleInfo,
) -> anyhow::Result<()>
where
    M: MaybeSend + MaybeSync + Clone,
{
    let drained_locked_deposits = match unlock_amount {
        FiatOrAll::Fiat(fiat_amount) => {
            let amount_to_unlock = fiat_amount.to_btc_amount(new_cycle_info.start_price)?;
            drain_in_reverse(locked_deposits, amount_to_unlock)
        }
        FiatOrAll::All => locked_deposits.drain(..).collect_vec(),
    };

    // Move unlocked msats to idle balance and remove account's unlock request
    let amount_unlocked = drained_locked_deposits.iter().map(|d| d.amount).sum();
    let idle_balance_key = IdleBalanceKey(account_id);
    let idle_balance = dbtx
        .get_value(&idle_balance_key)
        .await
        .unwrap_or(Amount::ZERO);

    dbtx.insert_entry(&idle_balance_key, &(idle_balance + amount_unlocked))
        .await;
    dbtx.remove_entry(&UnlockRequestKey(account_id)).await;

    // Register account history items for each unlocked deposit
    db::add_account_history_items(
        dbtx,
        account_id,
        drained_locked_deposits
            .into_iter()
            .map(|drained| AccountHistoryItem {
                cycle: *new_cycle_info,
                kind: AccountHistoryItemKind::LockedToIdle {
                    amount_withdrawn: drained.amount,
                    deposit_sequence: drained.sequence,
                },
            }),
    )
    .await;

    Ok(())
}

async fn process_unlock_requests(
    dbtx: &mut DatabaseTransaction<'_>,
    locked_seeks: &mut BTreeMap<AccountId, Vec<Seek>>,
    locked_provides: &mut BTreeMap<AccountId, Vec<Provide>>,
    new_cycle_info: CycleInfo,
) -> anyhow::Result<()> {
    let unlock_requests = dbtx
        .find_by_prefix(&UnlockRequestsKeyPrefix)
        .await
        .collect::<Vec<_>>()
        .await;

    for (UnlockRequestKey(account_id), unlock_amount) in unlock_requests {
        match account_id.acc_type() {
            AccountType::Seeker => {
                process_unlock_requests_inner(
                    dbtx,
                    account_id,
                    unlock_amount,
                    locked_seeks.get_mut(&account_id).unwrap_or(&mut vec![]),
                    &new_cycle_info,
                )
                .await?
            }
            AccountType::Provider => {
                process_unlock_requests_inner(
                    dbtx,
                    account_id,
                    unlock_amount,
                    locked_provides.get_mut(&account_id).unwrap_or(&mut vec![]),
                    &new_cycle_info,
                )
                .await?
            }
        }
    }

    Ok(())
}

async fn restage_remaining_locks_inner<K, M>(
    dbtx: &mut DatabaseTransaction<'_>,
    staged_key: K,
    locked_deposits: Vec<Deposit<M>>,
) where
    M: MaybeSend + MaybeSync + Clone,
    K: DatabaseKey + DatabaseRecord<Value = Vec<Deposit<M>>> + MaybeSend + MaybeSync,
{
    // If a staged deposit with the same sequence exists, we just
    // increase its amount by the amount of the lock. Otherwise,
    // we insert a new staged deposit.
    let new_staged_deposits = dbtx
        .get_value(&staged_key)
        .await
        .unwrap_or_default()
        .into_iter()
        .chain(locked_deposits)
        .sorted_unstable_by_key(|d| d.sequence)
        .coalesce(|prev, curr| {
            if prev.sequence == curr.sequence {
                Ok(Deposit {
                    sequence: prev.sequence,
                    amount: prev.amount + curr.amount,
                    meta: prev.meta,
                })
            } else {
                Err((prev, curr))
            }
        })
        .collect_vec();
    dbtx.insert_entry(&staged_key, &new_staged_deposits).await;
}

async fn restage_remaining_locks(
    dbtx: &mut DatabaseTransaction<'_>,
    locked_seeks: &BTreeMap<AccountId, Vec<Seek>>,
    locked_provides: &BTreeMap<AccountId, Vec<Provide>>,
) {
    for (&account_id, locked_seeks) in locked_seeks {
        restage_remaining_locks_inner(dbtx, StagedSeeksKey(account_id), locked_seeks.clone()).await;
    }

    for (&account_id, locked_provides) in locked_provides {
        restage_remaining_locks_inner(dbtx, StagedProvidesKey(account_id), locked_provides.clone())
            .await;
    }
}

async fn calculate_locks_and_write_cycle(
    dbtx: &mut DatabaseTransaction<'_>,
    collateral_ratio: &CollateralRatio,
    index: u64,
    time: SystemTime,
    price: FiatAmount,
    randomness: usize,
    current_cycle: Option<&Cycle>,
) -> anyhow::Result<()> {
    let (mut staged_seeks, mut staged_provides) =
        extract_sorted_staged_seeks_and_provides(dbtx).await;
    let LockedProvidesAndFeeRateResult {
        locked_provides,
        included_provides_sum,
        fee_rate,
    } = calculate_locked_provides_and_fee_rate(
        &staged_seeks,
        &mut staged_provides,
        collateral_ratio.provider.into(),
        collateral_ratio.seeker.into(),
    );
    let locked_seeks = calculate_locked_seeks(
        &mut staged_seeks,
        fee_rate.into(),
        collateral_ratio.provider.into(),
        collateral_ratio.seeker.into(),
        included_provides_sum,
    );

    // At this point, we have calculated the seeker and provider locks to include
    // in the new cycle. We can now write back the remaining staged seeks and
    // provides, as well as distribute fees to providers from the seeker locks.
    write_remaining_staged_seeks_and_provides(dbtx, staged_seeks, staged_provides).await;
    distribute_fees_and_write_cycle(
        dbtx,
        locked_seeks,
        locked_provides,
        fee_rate,
        included_provides_sum,
        index,
        time,
        price,
        randomness,
        current_cycle,
    )
    .await
}

async fn extract_sorted_staged_seeks_and_provides(
    dbtx: &mut DatabaseTransaction<'_>,
) -> (VecDeque<(AccountId, Seek)>, VecDeque<(AccountId, Provide)>) {
    // Sort all staged seeks by sequence
    let staged_seeks = dbtx
        .find_by_prefix(&StagedSeeksKeyPrefix)
        .await
        .flat_map(|(key, list)| stream::iter(list.into_iter().map(move |seek| (key.0, seek))))
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .sorted_unstable_by_key(|(_, seek)| seek.sequence)
        .collect::<VecDeque<_>>();
    dbtx.remove_by_prefix(&StagedSeeksKeyPrefix).await;

    // Sort all staged provides by fee rate, and then by sequence
    let staged_provides = dbtx
        .find_by_prefix(&StagedProvidesKeyPrefix)
        .await
        .flat_map(|(key, list)| stream::iter(list.into_iter().map(move |provide| (key.0, provide))))
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .sorted_unstable_by(
            |(
                _,
                Provide {
                    sequence: seq_a,
                    meta: fee_a,
                    ..
                },
            ),
             (
                _,
                Provide {
                    sequence: seq_b,
                    meta: fee_b,
                    ..
                },
            )| fee_a.cmp(fee_b).then(seq_a.cmp(seq_b)),
        )
        .collect::<VecDeque<_>>();
    dbtx.remove_by_prefix(&StagedProvidesKeyPrefix).await;

    (staged_seeks, staged_provides)
}

struct LockedProvidesAndFeeRateResult {
    locked_provides: Vec<(AccountId, Provide)>,
    included_provides_sum: u128,
    fee_rate: u64,
}

fn calculate_locked_provides_and_fee_rate(
    staged_seeks: &VecDeque<(AccountId, Seek)>,
    staged_provides: &mut VecDeque<(AccountId, Provide)>,
    collateral_ratio_provider: u128,
    collateral_ratio_seeker: u128,
) -> LockedProvidesAndFeeRateResult {
    let seeks_sum = staged_seeks
        .iter()
        .fold(0u128, |acc, (_, Seek { amount, .. })| {
            acc + amount.msats as u128
        });
    let mut fee_rate = 0u64;
    let mut included_provides_sum = 0u128;

    let mut remaining_coll_needed = remaining_provider_collateral_needed(
        seeks_sum,
        fee_rate.into(),
        collateral_ratio_provider,
        collateral_ratio_seeker,
        included_provides_sum,
    );

    // Keep including more provides while more collateral is needed
    // and while there are unused provides left.
    let mut locked_provides = vec![];
    while remaining_coll_needed > 0 && !staged_provides.is_empty() {
        let (
            account_id,
            Provide {
                sequence,
                amount,
                meta: min_fee_rate,
            },
        ) = &mut staged_provides[0];

        // If the fee rate for the next item is the same as the current
        // fee rate, we can just include however much collateral we need from it.
        // Otherwise, we need to calculate the remaining collateral needed
        // at the fee rate of the next item. It's possible that the increased
        // fee might make the remaining collateral needed 0, in which case
        // we should stop. Otherwise, we use the new value of remaining
        // collateral needed, as well as the new fee rate.
        if min_fee_rate.0 > fee_rate {
            let new_remaining_coll_needed = remaining_provider_collateral_needed(
                seeks_sum,
                min_fee_rate.0.into(), // use fee rate of new provide
                collateral_ratio_provider,
                collateral_ratio_seeker,
                included_provides_sum,
            );

            if new_remaining_coll_needed == 0 {
                break;
            }

            fee_rate = min_fee_rate.0;
            remaining_coll_needed = new_remaining_coll_needed;
        }

        let amount_used = remaining_coll_needed.min(amount.msats.into());
        included_provides_sum += amount_used;
        remaining_coll_needed -= amount_used;
        locked_provides.push((
            *account_id,
            Provide {
                sequence: *sequence,
                amount: Amount::from_msats(amount_used.try_into().unwrap()),
                meta: *min_fee_rate,
            },
        ));

        // Modify the staged provide we just used (or remove it if exhausted)
        // amount_used is guaranteed to fit in u64 since it's a min(u64)
        amount.msats -= TryInto::<u64>::try_into(amount_used).unwrap();
        if *amount == Amount::ZERO {
            staged_provides.pop_front();
        }
    }

    LockedProvidesAndFeeRateResult {
        locked_provides,
        included_provides_sum,
        fee_rate,
    }
}

fn calculate_locked_seeks(
    staged_seeks: &mut VecDeque<(AccountId, Seek)>,
    fee_rate: u128,
    collateral_ratio_provider: u128,
    collateral_ratio_seeker: u128,
    included_provides_sum: u128,
) -> Vec<(AccountId, Seek)> {
    let mut included_seeks_sum_before_fees = included_seeks_sum_before_fees(
        fee_rate,
        collateral_ratio_provider,
        collateral_ratio_seeker,
        included_provides_sum,
    );

    // Keep including more seeks while the draining seeks sum hasn't
    // been exhausted and while there are unused seeks left.
    let mut locked_seeks = vec![];
    while included_seeks_sum_before_fees > 0 && !staged_seeks.is_empty() {
        let (
            account,
            Seek {
                sequence, amount, ..
            },
        ) = &mut staged_seeks[0];

        let amount_used = included_seeks_sum_before_fees.min(amount.msats.into());
        included_seeks_sum_before_fees -= amount_used;
        locked_seeks.push((
            *account,
            Seek {
                sequence: *sequence,
                amount: Amount::from_msats(amount_used.try_into().unwrap()),
                meta: (),
            },
        ));

        // Modify the staged seek we just used (or remove it if exhausted)
        // amount_used is guaranteed to fit in u64 since it's a min(u64)
        amount.msats -= TryInto::<u64>::try_into(amount_used).unwrap();
        if *amount == Amount::ZERO {
            staged_seeks.pop_front();
        }
    }

    locked_seeks
}

async fn write_remaining_staged_seeks_and_provides(
    dbtx: &mut DatabaseTransaction<'_>,
    staged_seeks: VecDeque<(AccountId, Seek)>,
    staged_provides: VecDeque<(AccountId, Provide)>,
) {
    for (account_id, seeks) in staged_seeks.into_iter().into_group_map() {
        dbtx.insert_entry(&StagedSeeksKey(account_id), &seeks).await;
    }

    for (account_id, provides) in staged_provides.into_iter().into_group_map() {
        dbtx.insert_entry(&StagedProvidesKey(account_id), &provides)
            .await;
    }
}

async fn update_history_for_locks<M>(
    dbtx: &mut DatabaseTransaction<'_>,
    old_cycle_locks: &BTreeMap<AccountId, Vec<Deposit<M>>>,
    new_locks: &[(AccountId, Deposit<M>)],
    cycle_info: &CycleInfo,
) -> anyhow::Result<()> {
    // Build a unified map of (account_id, sequence) -> (old_amount, new_amount)
    let amount_map = {
        let mut amount_map: BTreeMap<(AccountId, u64), (Option<Amount>, Option<Amount>)> =
            BTreeMap::new();

        // First populate old amounts
        for (account_id, old_items) in old_cycle_locks {
            for old_item in old_items {
                amount_map.insert(
                    (*account_id, old_item.sequence),
                    (Some(old_item.amount), None),
                );
            }
        }

        // Then populate new amounts
        for (account_id, item) in new_locks {
            let key = (*account_id, item.sequence);
            if let Some((_, new_amount)) = amount_map.get_mut(&key) {
                *new_amount = Some(item.amount);
            } else {
                amount_map.insert(key, (None, Some(item.amount)));
            }
        }
        amount_map
    };

    // Process all entries to determine changes
    for ((account_id, sequence), (old_amount, new_amount)) in amount_map {
        assert!(
            old_amount.is_some() || new_amount.is_some(),
            "invariant: atleast one must be set"
        );
        let old_amount = old_amount.unwrap_or(Amount::ZERO);
        let new_amount = new_amount.unwrap_or(Amount::ZERO);

        match new_amount.cmp(&old_amount) {
            Ordering::Less => {
                // Some was unlocked back to staged
                db::add_account_history_items(
                    dbtx,
                    account_id,
                    [AccountHistoryItem {
                        cycle: *cycle_info,
                        kind: AccountHistoryItemKind::LockedToStaged {
                            deposit_sequence: sequence,
                            amount_moved: old_amount - new_amount,
                        },
                    }],
                )
                .await;
            }
            // no changes
            Ordering::Equal => (),
            Ordering::Greater => {
                // More was locked than before
                db::add_account_history_items(
                    dbtx,
                    account_id,
                    [AccountHistoryItem {
                        cycle: *cycle_info,
                        kind: AccountHistoryItemKind::StagedToLocked {
                            deposit_sequence: sequence,
                            amount_moved: new_amount - old_amount,
                        },
                    }],
                )
                .await;
            }
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn distribute_fees_and_write_cycle(
    dbtx: &mut DatabaseTransaction<'_>,
    mut locked_seeks: Vec<(AccountId, Seek)>,
    locked_provides: Vec<(AccountId, Provide)>,
    fee_rate: u64,
    included_provides_sum: u128,
    cycle_index: u64,
    cycle_time: SystemTime,
    cycle_price: FiatAmount,
    randomness: usize,
    old_cycle: Option<&Cycle>,
) -> anyhow::Result<()> {
    let cycle_info = CycleInfo {
        idx: cycle_index,
        start_price: cycle_price,
        start_time: cycle_time,
    };

    // Update history for both seeks and provides
    update_history_for_locks(
        dbtx,
        &old_cycle.map_or_else(BTreeMap::new, |c| c.locked_seeks.clone()),
        &locked_seeks,
        &cycle_info,
    )
    .await?;
    update_history_for_locks(
        dbtx,
        &old_cycle.map_or_else(BTreeMap::new, |c| c.locked_provides.clone()),
        &locked_provides,
        &cycle_info,
    )
    .await?;

    // Reduce each locked seek by fee amount and calculate total fee pool
    let mut fee_pool = 0u128;
    locked_seeks
        .iter_mut()
        .for_each(|(_account_id, Seek { amount, .. })| {
            // Ceiling division to ensure fee is never undercharged
            let fee = ceil_division(amount.msats as u128 * fee_rate as u128, B);
            fee_pool += fee;

            // `fee` is calculated by taking a real msat value (which is guaranteed to fit
            // within u64) and multiplying it by a fraction smaller than 1. Therefore `fee`
            // must fit within u64.
            let fee = Amount::from_msats(fee.try_into().unwrap());
            *amount -= fee;
        });

    let locked_provides_map = locked_provides
        .into_iter()
        .into_group_map()
        .into_iter()
        .collect::<BTreeMap<_, _>>();

    // Calculate fee owed to each provider using their total provided amount
    let mut draining_fee_pool = fee_pool;
    let mut provider_fee_owed_map = locked_provides_map
        .iter()
        .map(|(account_id, provides)| {
            let account_provides_amount = provides.iter().fold(0u128, |acc, locked_provide| {
                acc + locked_provide.amount.msats as u128
            });
            let account_fee_owed = account_provides_amount * fee_pool / included_provides_sum;
            draining_fee_pool -= account_fee_owed;
            (*account_id, account_fee_owed)
        })
        .collect::<BTreeMap<_, _>>();

    // If there's any fee left due to rounding errors, give it to arbitrary provider
    if draining_fee_pool != 0 {
        let mut fee_owed_vec = provider_fee_owed_map.values_mut().collect_vec();
        let rand_index = randomness % fee_owed_vec.len();
        if let Some(amount) = fee_owed_vec.get_mut(rand_index) {
            **amount += draining_fee_pool;
        }
    }

    // Update idle balances of providers to reflect fees paid
    for (account_id, fee_owed) in provider_fee_owed_map {
        let idle_balance_key = IdleBalanceKey(account_id);
        let mut idle_balance = dbtx
            .get_value(&idle_balance_key)
            .await
            .unwrap_or(Amount::ZERO);
        // `fee_owed` is calculated by taking the total fee amount owed to all the
        // providers which comes from all the seeks. Since the sum of seeks cannot
        // exceed 21 million BTC, the total fee amount owed to all the providers cannot
        // exceed 21 million BTC. Then to calculate `fee_owed`, we take this total fee
        // amount and multiply it by a fraction representing the provider's share of the
        // total provided liquidity. Therefore, `fee_owed` cannot exceed 21 million BTC.
        // And hence it must fit within u64.
        idle_balance.msats += TryInto::<u64>::try_into(fee_owed).unwrap();
        dbtx.insert_entry(&idle_balance_key, &idle_balance).await;
    }

    // Finally, transform locked_seeks into a BTreeMap and write new cycle
    let locked_seeks_map = locked_seeks
        .into_iter()
        .into_group_map()
        .into_iter()
        .collect();

    dbtx.insert_entry(
        &CurrentCycleKey,
        &Cycle {
            index: cycle_index,
            start_time: cycle_time,
            start_price: cycle_price,
            fee_rate: FeeRate(fee_rate),
            locked_seeks: locked_seeks_map,
            locked_provides: locked_provides_map,
        },
    )
    .await;

    Ok(())
}

/// Returns the remaining collateral provider needed
/// to cover the total amount across all seeks.
///
/// #Parameters
/// - `seeks_sum`: Sum of all the seek amounts.
/// - `fee_rate`: Current effective fee rate in ppb.
/// - `coll_p`: Provider side of the collateral ratio.
/// - `coll_s`: Seeker side of the collateral ratio.
/// - `included_provides_sum`: Sum of provider collateral already included.
fn remaining_provider_collateral_needed(
    seeks_sum: u128,
    fee_rate: u128,
    coll_p: u128,
    coll_s: u128,
    included_provides_sum: u128,
) -> u128 {
    // R: remaining provider collateral needed
    // S_s: sum of all seeks
    // f: current effective fee rate
    // B: ppb unit (1_000_000_000)
    // C_p: provider side of collateral ratio
    // C_s: seeker side of collateral ratio
    // P: provider collateral already included
    //
    // Given the above symbols, we have the following equation:
    // R = [     S_s      * [  1 - (f/B) ] *       C_p/C_s     ] - P
    //      (total seeks)   (take out fee)   (collateral ratio)
    //
    // This can further written as:
    // R = [(S_s * (B - f) * C_p) / (B * C_s)] - P
    //
    // And finally as:
    // R = [(S_s * (B - f) * C_p) - (P * B * C_s)] / (B * C_s)
    //
    // The point of transforming the equation is to ensure that
    // division is the last operation, which allows us to retain
    // the most precision. We guarantee that our precision loss
    // would be smaller than 1 millisat, and since we will use
    // ceiling division in the end, we will always overcollateralize
    // as opposed to falling short.
    //
    // Also note that the numerator is produced by subtracting two terms.
    // If the left term happens to be less than the right term, our final
    // result would be negative. In that case we just return 0,
    // which should signify that we shouldn't include any more provider
    // collateral.
    let numerator_term_1 = seeks_sum * (B - fee_rate) * coll_p;
    let numerator_term_2 = included_provides_sum * B * coll_s;
    if numerator_term_1 < numerator_term_2 {
        return 0;
    }

    let denominator = B * coll_s;
    ceil_division(numerator_term_1 - numerator_term_2, denominator)
}

/// Calculates the sum of included seeks before fees is deducted
/// from the total. This calculation allows us to go "backwards"
/// from the sum of included provides, because that sum collateralizes
/// seeks AFTER fees is deducted (since it wouldn't make sense to
/// collateralize fees--which is a fixed amount paid up front to the
/// provider).
///
/// #Parameters
/// - `fee_rate`: Current effective fee rate in ppb.
/// - `coll_p`: Provider side of the collateral ratio.
/// - `coll_s`: Seeker side of the collateral ratio.
/// - `included_provides_sum`: Sum of provider collateral already included.
fn included_seeks_sum_before_fees(
    fee_rate: u128,
    coll_p: u128,
    coll_s: u128,
    included_provides_sum: u128,
) -> u128 {
    // S: Included seeks sum before fees
    // f: current effective fee rate
    // B: ppb unit (1_000_000_000)
    // C_p: provider side of collateral ratio
    // C_s: seeker side of collateral ratio
    // P: provider collateral already included
    //
    // Given the above symbols, we have the following equation:
    // S * [  1 - (f/B) ] = P * (         C_s/C_p        )
    //     (take out fee)       (inverse collateral ratio)
    //
    // This can further written as:
    // [S * (B - f)] / B = (P * C_s) / C_p
    //
    // Solving for S:
    // S = (P * C_s * B) / [(B - f) * C_p]
    //
    // The point of transforming the equation is to ensure that
    // division is the last operation, which allows us to retain
    // the most precision. We guarantee that our precision loss
    // would be smaller than 1 millisat, and since we will use
    // floor division in the end, we will always overcollateralize
    // as opposed to falling short.
    let numerator = included_provides_sum * coll_s * B;
    let denominator = (B - fee_rate) * coll_p;
    numerator / denominator
}

fn ceil_division(dividend: u128, divisor: u128) -> u128 {
    if dividend % divisor == 0 {
        dividend / divisor
    } else {
        dividend / divisor + 1
    }
}

/// Remove amount from items in reverse order. If an item's amount hits 0, the
/// item itself is removed. Returns the actual drained items (with the partial
/// or exact amounts that were taken).
fn drain_in_reverse<M>(items: &mut Vec<Deposit<M>>, total_to_drain: Amount) -> Vec<Deposit<M>>
where
    M: Clone,
{
    let mut drained_items = Vec::new();

    if total_to_drain == Amount::ZERO {
        return drained_items;
    }

    let mut left_to_drain = total_to_drain;
    while let Some(mut item) = items.pop() {
        assert_ne!(left_to_drain, Amount::ZERO);
        let min_extractable = item.amount.min(left_to_drain);

        // Clone the item to represent the portion drained
        let mut drained_clone = item.clone();
        drained_clone.amount = min_extractable;
        drained_items.push(drained_clone);

        item.amount -= min_extractable;
        left_to_drain -= min_extractable;

        // reinsert not completely drained value
        if item.amount != Amount::ZERO {
            items.push(item);
        }

        if left_to_drain == Amount::ZERO {
            break;
        }
    }
    drained_items
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seek(sequence: u64, msats: u64) -> Seek {
        Seek {
            sequence,
            amount: Amount::from_msats(msats),
            meta: (),
        }
    }

    #[test]
    fn test_drain_in_reverse() {
        // Define test scenarios as (initial_items, drain_amount,
        // expected_remaining_items, expected_drained_items)
        let test_scenarios = vec![
            // Zero drain scenario
            (
                vec![seek(1, 1000), seek(2, 2000), seek(3, 3000)],
                Amount::ZERO,
                vec![seek(1, 1000), seek(2, 2000), seek(3, 3000)],
                Vec::<Seek>::new(),
            ),
            // Partial last item drain scenario
            (
                vec![seek(1, 1000), seek(2, 2000), seek(3, 3000)],
                Amount::from_msats(1500),
                vec![seek(1, 1000), seek(2, 2000), seek(3, 1500)],
                vec![seek(3, 1500)],
            ),
            // Multiple items drain scenario
            (
                vec![seek(1, 1000), seek(2, 2000), seek(3, 3000), seek(4, 4000)],
                Amount::from_msats(6500),
                vec![seek(1, 1000), seek(2, 2000), seek(3, 500)],
                vec![seek(4, 4000), seek(3, 2500)],
            ),
            // Exact items drain scenario
            (
                vec![seek(1, 1000), seek(2, 2000), seek(3, 3000)],
                Amount::from_msats(5000),
                vec![seek(1, 1000)],
                vec![seek(3, 3000), seek(2, 2000)],
            ),
            // More than total drain scenario
            (
                vec![seek(1, 1000), seek(2, 2000), seek(3, 3000)],
                Amount::from_msats(10000),
                vec![],
                vec![seek(3, 3000), seek(2, 2000), seek(1, 1000)],
            ),
            // Single item partial drain scenario
            (
                vec![seek(1, 1000)],
                Amount::from_msats(600),
                vec![seek(1, 400)],
                vec![seek(1, 600)],
            ),
            // Single item exact drain scenario
            (
                vec![seek(1, 1000)],
                Amount::from_msats(1000),
                vec![],
                vec![seek(1, 1000)],
            ),
            // Single item over drain scenario
            (
                vec![seek(1, 1000)],
                Amount::from_msats(1500),
                vec![],
                vec![seek(1, 1000)],
            ),
            // empty and no amount
            (vec![], Amount::ZERO, vec![], vec![]),
            // empty and with amount
            (vec![], Amount::from_msats(1000), vec![], vec![]),
        ];

        // Run all test scenarios
        for (initial_items, drain_amount, expected_remaining, expected_drained) in test_scenarios {
            let mut items = initial_items;
            let drained = drain_in_reverse(&mut items, drain_amount);
            assert_eq!(
                drained, expected_drained,
                "Drained items didn't match expected"
            );
            assert_eq!(
                items, expected_remaining,
                "Remaining items didn't match expected"
            );
        }
    }
}
