pub mod api;
pub mod db;
pub mod oracle;
use std::collections::{BTreeMap, VecDeque};
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
    amount_to_cents, CancelRenewal, IntendedAction, LockedProvide, LockedSeek, Provide, Seek,
    SeekMetadata, StabilityPoolCommonGen, StabilityPoolConsensusItem, StabilityPoolInput,
    StabilityPoolInputError, StabilityPoolModuleTypes, StabilityPoolOutput,
    StabilityPoolOutputError, StabilityPoolOutputOutcome, StabilityPoolOutputOutcomeV0,
    StagedProvide, StagedSeek, BPS_UNIT, CONSENSUS_VERSION,
};
use db::{
    migrate_to_v2, CurrentCycleKey, CurrentCycleKeyPrefix, Cycle, CycleChangeVoteIndexPrefix,
    CycleChangeVoteKey, IdleBalance, IdleBalanceKey, IdleBalanceKeyPrefix, PastCycleKey,
    SeekMetadataKey, StagedCancellationKey, StagedCancellationKeyPrefix, StagedProvideSequenceKey,
    StagedProvidesKey, StagedProvidesKeyPrefix, StagedSeekSequenceKey, StagedSeeksKey,
    StagedSeeksKeyPrefix,
};
use fedimint_core::config::{
    ConfigGenModuleParams, ServerModuleConfig, ServerModuleConsensusConfig,
    TypedServerModuleConfig, TypedServerModuleConsensusConfig,
};
use fedimint_core::core::ModuleInstanceId;
use fedimint_core::db::{DatabaseTransaction, DatabaseVersion, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::module::audit::Audit;
use fedimint_core::module::{
    ApiEndpoint, CoreConsensusVersion, InputMeta, ModuleConsensusVersion, ModuleInit, PeerHandle,
    SupportedModuleApiVersions, TransactionItemAmount,
};
use fedimint_core::{Amount, InPoint, NumPeersExt, OutPoint, PeerId, TransactionId};
use fedimint_server_core::{DynServerModule, ServerModule, ServerModuleInit, ServerModuleInitArgs};
use futures::{stream, FutureExt, StreamExt};
use itertools::Itertools;
use oracle::{AggregateOracle, MockOracle, Oracle};
use secp256k1::PublicKey;
pub use stability_pool_common_old as common;
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
    ) -> anyhow::Result<ServerModuleConfig> {
        let params = params
            .to_typed::<StabilityPoolGenParams>()
            .expect("Invalid mint params");

        let server = StabilityPoolConfig {
            local: StabilityPoolConfigLocal,
            private: StabilityPoolConfigPrivate,
            consensus: StabilityPoolConfigConsensus {
                consensus_threshold: peers.num_peers().threshold() as _,
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

    fn get_database_migrations(
        &self,
    ) -> BTreeMap<DatabaseVersion, fedimint_core::db::CoreMigrationFn> {
        let mut migrations =
            BTreeMap::<DatabaseVersion, fedimint_core::db::CoreMigrationFn>::default();
        migrations.insert(DatabaseVersion(1), |ctx| migrate_to_v2(ctx).boxed());
        migrations
    }
}

/// Helper struct to encapsulate the price of Bitcoin in cents, along with the
/// time at which the price was fetched.
#[derive(Debug)]
pub struct PrefetchedPrice {
    pub time: SystemTime,
    pub price: u64,
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
        let current_cycle = dbtx.get_value(&CurrentCycleKey).await;
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
        //  - apply any staged cancellations
        //  - move remaining locks to staged
        if let Some(mut current_cycle) = current_cycle {
            dbtx.insert_entry(&PastCycleKey(current_cycle.index), &current_cycle)
                .await;
            settle_locks(
                &mut current_cycle.locked_seeks,
                &mut current_cycle.locked_provides,
                current_cycle.start_price.into(),
                new_price.into(),
                randomness,
            );
            apply_staged_cancellations(
                dbtx,
                &mut current_cycle.locked_seeks,
                &mut current_cycle.locked_provides,
                new_price.into(),
            )
            .await;
            restage_remaining_locks(
                dbtx,
                current_cycle.locked_seeks,
                current_cycle.locked_provides,
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
        )
        .await;
        dbtx.remove_by_prefix(&vote_cycle_index_prefix).await;
        Ok(())
    }

    async fn process_input<'a, 'b, 'c>(
        &'a self,
        dbtx: &mut DatabaseTransaction<'c>,
        input: &'b StabilityPoolInput,
        _in_point: InPoint,
    ) -> Result<InputMeta, StabilityPoolInputError> {
        let (account, amount) = (
            input
                .account()
                .map_err(|e| StabilityPoolInputError::UnknownInputVariant(e.to_string()))?,
            input
                .amount()
                .map_err(|e| StabilityPoolInputError::UnknownInputVariant(e.to_string()))?,
        );

        // TODO shaurya ensure amount is greater than fee
        if amount == Amount::ZERO {
            return Err(StabilityPoolInputError::InvalidWithdrawalAmount);
        }

        let (mut user_idle_balance, user_staged_seeks, user_staged_provides) = (
            dbtx.get_value(&IdleBalanceKey(account))
                .await
                .unwrap_or(IdleBalance(Amount::ZERO))
                .0,
            dbtx.get_value(&StagedSeeksKey(account))
                .await
                .unwrap_or_default(),
            dbtx.get_value(&StagedProvidesKey(account))
                .await
                .unwrap_or_default(),
        );

        let total_user_balance = user_idle_balance
            + user_staged_seeks.iter().map(|s| s.seek.0).sum()
            + user_staged_provides.iter().map(|p| p.provide.amount).sum();
        if amount > total_user_balance {
            return Err(StabilityPoolInputError::InsufficientBalance);
        }

        // First drain idle balance, then staged seeks from newest to oldest,
        // then staged provides from newest to oldest
        let mut amount_to_satisfy = amount;

        if user_idle_balance != Amount::ZERO {
            let min_extractable =
                Amount::from_msats(user_idle_balance.msats.min(amount_to_satisfy.msats));
            user_idle_balance -= min_extractable;
            amount_to_satisfy -= min_extractable;
            dbtx.insert_entry(&IdleBalanceKey(account), &IdleBalance(user_idle_balance))
                .await;
        }

        if amount_to_satisfy != Amount::ZERO && !user_staged_seeks.is_empty() {
            let user_staged_seeks = user_staged_seeks
                .into_iter()
                .rev()
                .filter_map(|s| {
                    if amount_to_satisfy == Amount::ZERO {
                        Some(s)
                    } else {
                        let min_extractable =
                            Amount::from_msats(s.seek.0.msats.min(amount_to_satisfy.msats));
                        amount_to_satisfy -= min_extractable;

                        if min_extractable == s.seek.0 {
                            None
                        } else {
                            Some(StagedSeek {
                                txid: s.txid,
                                sequence: s.sequence,
                                seek: Seek(
                                    s.seek.0.checked_sub(min_extractable).expect("Can't fail"),
                                ),
                            })
                        }
                    }
                })
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            dbtx.insert_entry(&StagedSeeksKey(account), &user_staged_seeks)
                .await;
        }

        if amount_to_satisfy != Amount::ZERO && !user_staged_provides.is_empty() {
            let user_staged_provides = user_staged_provides
                .into_iter()
                .rev()
                .filter_map(|p| {
                    if amount_to_satisfy == Amount::ZERO {
                        Some(p)
                    } else {
                        let min_extractable =
                            Amount::from_msats(p.provide.amount.msats.min(amount_to_satisfy.msats));
                        amount_to_satisfy -= min_extractable;

                        if min_extractable == p.provide.amount {
                            None
                        } else {
                            Some(StagedProvide {
                                txid: p.txid,
                                sequence: p.sequence,
                                provide: Provide {
                                    amount: p
                                        .provide
                                        .amount
                                        .checked_sub(min_extractable)
                                        .expect("Can't fail"),
                                    min_fee_rate: p.provide.min_fee_rate,
                                },
                            })
                        }
                    }
                })
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            dbtx.insert_entry(&StagedProvidesKey(account), &user_staged_provides)
                .await;
        }

        if amount_to_satisfy != Amount::ZERO {
            return Err(StabilityPoolInputError::InsufficientBalance);
        }

        // TODO shaurya decide on TX fee for withdrawals
        let fee = Amount::ZERO;
        return Ok(InputMeta {
            amount: TransactionItemAmount { amount, fee },
            pub_key: account,
        });
    }

    async fn process_output<'a, 'b>(
        &'a self,
        dbtx: &mut DatabaseTransaction<'b>,
        output: &'a StabilityPoolOutput,
        outpoint: OutPoint,
    ) -> Result<TransactionItemAmount, StabilityPoolOutputError> {
        let (account, intended_action) = (
            output
                .account()
                .map_err(|e| StabilityPoolOutputError::UnknownOutputVariant(e.to_string()))?,
            output
                .intended_action()
                .map_err(|e| StabilityPoolOutputError::UnknownOutputVariant(e.to_string()))?,
        );

        let fee = match intended_action {
            IntendedAction::Seek(Seek(amount)) => {
                if amount < self.cfg.consensus.min_allowed_seek {
                    return Err(StabilityPoolOutputError::AmountTooLow);
                }

                // TODO shaurya decide on TX fee for seeks
                Amount::ZERO
            }
            IntendedAction::Provide(Provide {
                amount,
                min_fee_rate,
            }) => {
                if amount < self.cfg.consensus.min_allowed_provide {
                    return Err(StabilityPoolOutputError::AmountTooLow);
                }

                if min_fee_rate > self.cfg.consensus.max_allowed_provide_fee_rate_ppb {
                    return Err(StabilityPoolOutputError::FeeRateTooHigh);
                }

                // TODO shaurya decide on TX fee for provides
                Amount::ZERO
            }
            IntendedAction::CancelRenewal(CancelRenewal { bps }) => {
                if bps < self.cfg.consensus.min_allowed_cancellation_bps || bps > 10_000 {
                    return Err(StabilityPoolOutputError::InvalidBPSForCancelAutoRenewal);
                }

                // TODO shaurya decide on TX fee for auto-renew cancellations
                Amount::ZERO
            }
            IntendedAction::UndoCancelRenewal => {
                // TODO shaurya decide on TX fee for undoing cancellation
                Amount::ZERO
            }
        };

        let (mut user_staged_seeks, mut user_staged_provides, user_staged_cancellation) = (
            dbtx.get_value(&StagedSeeksKey(account))
                .await
                .unwrap_or_default(),
            dbtx.get_value(&StagedProvidesKey(account))
                .await
                .unwrap_or_default(),
            dbtx.get_value(&StagedCancellationKey(account)).await,
        );

        let current_cycle = dbtx.get_value(&CurrentCycleKey).await;
        let (user_locked_seeks, user_locked_provides) = match &current_cycle {
            Some(Cycle {
                locked_seeks,
                locked_provides,
                ..
            }) => (
                locked_seeks
                    .get(&account)
                    .map(|vec| vec.as_slice())
                    .unwrap_or_default(),
                locked_provides
                    .get(&account)
                    .map(|vec| vec.as_slice())
                    .unwrap_or_default(),
            ),
            None => (&[] as &[LockedSeek], &[] as &[LockedProvide]),
        };

        match intended_action {
            IntendedAction::Seek(seek) => {
                // Must NOT have staged provides, locked provides, or staged cancellation
                if user_staged_provides.is_empty()
                    && user_locked_provides.is_empty()
                    && user_staged_cancellation.is_none()
                {
                    let sequence = dbtx
                        .get_value(&StagedSeekSequenceKey)
                        .await
                        .unwrap_or_default();
                    user_staged_seeks.push(StagedSeek {
                        txid: outpoint.txid,
                        sequence,
                        seek: seek.clone(),
                    });

                    dbtx.insert_entry(&StagedSeekSequenceKey, &(sequence + 1))
                        .await;
                    dbtx.insert_entry(&StagedSeeksKey(account), &user_staged_seeks)
                        .await;
                    Ok(TransactionItemAmount {
                        amount: seek.0,
                        fee,
                    })
                } else {
                    Err(StabilityPoolOutputError::CannotSeek)
                }
            }
            IntendedAction::Provide(provide) => {
                // Must NOT have staged seeks, locked seeks, or staged cancellation
                if user_staged_seeks.is_empty()
                    && user_locked_seeks.is_empty()
                    && user_staged_cancellation.is_none()
                {
                    let sequence = dbtx
                        .get_value(&StagedProvideSequenceKey)
                        .await
                        .unwrap_or_default();
                    user_staged_provides.push(StagedProvide {
                        txid: outpoint.txid,
                        sequence,
                        provide: provide.clone(),
                    });

                    dbtx.insert_entry(&StagedProvideSequenceKey, &(sequence + 1))
                        .await;
                    dbtx.insert_entry(&StagedProvidesKey(account), &user_staged_provides)
                        .await;
                    Ok(TransactionItemAmount {
                        amount: provide.amount,
                        fee,
                    })
                } else {
                    Err(StabilityPoolOutputError::CannotProvide)
                }
            }
            IntendedAction::CancelRenewal(cancel) => {
                // Must NOT have any staged seeks or provides or staged cancellation
                // AND must have at least one locked seek or provide (but not both)
                if user_staged_seeks.is_empty()
                    && user_staged_provides.is_empty()
                    && user_staged_cancellation.is_none()
                    && (!user_locked_seeks.is_empty() ^ !user_locked_provides.is_empty())
                {
                    dbtx.insert_entry(&StagedCancellationKey(account), &(outpoint.txid, cancel))
                        .await;
                    Ok(TransactionItemAmount {
                        amount: Amount::ZERO,
                        fee,
                    })
                } else {
                    Err(StabilityPoolOutputError::CannotCancelAutoRenewal)
                }
            }
            IntendedAction::UndoCancelRenewal => {
                // Must have a staged cancellation
                if user_staged_cancellation.is_some() {
                    dbtx.remove_entry(&StagedCancellationKey(account)).await;
                    Ok(TransactionItemAmount {
                        amount: Amount::ZERO,
                        fee,
                    })
                } else {
                    Err(StabilityPoolOutputError::CannotUndoAutoRenewalCancellation)
                }
            }
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
                |_, idle_bal| -(idle_bal.0.msats as i64),
            )
            .await;

        // Staged seeks and provides are also liabilities
        audit
            .add_items(
                dbtx,
                module_instance_id,
                &StagedSeeksKeyPrefix,
                |_, seek_list| -(seek_list.iter().fold(0, |acc, s| acc + s.seek.0.msats) as i64),
            )
            .await;
        audit
            .add_items(
                dbtx,
                module_instance_id,
                &StagedProvidesKeyPrefix,
                |_, provide_list| {
                    -(provide_list
                        .iter()
                        .fold(0, |acc, p| acc + p.provide.amount.msats)
                        as i64)
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

fn settle_locks(
    locked_seeks: &mut BTreeMap<PublicKey, Vec<LockedSeek>>,
    locked_provides: &mut BTreeMap<PublicKey, Vec<LockedProvide>>,
    start_price: u128,
    new_price: u128,
    randomness: usize,
) {
    let total_seek_msats = locked_seeks
        .values()
        .flatten()
        .fold(0u128, |acc, LockedSeek { amount, .. }| {
            acc + amount.msats as u128
        });
    let total_provide_msats = locked_provides
        .values()
        .flatten()
        .fold(0u128, |acc, LockedProvide { amount, .. }| {
            acc + amount.msats as u128
        });
    let total_msats_available = total_seek_msats + total_provide_msats;

    // To calculate the new msats needed to cover the $ value of all
    // the seeks, we multiply (total_seek_msats * start_price) and do
    // ceiling division with (new_price). We then min this with the
    // total_msats_available to ensure we don't overshoot what we have.
    // Whatever is left is what the provides get.
    let msats_needed_for_seeks = ceil_division(total_seek_msats * start_price, new_price);
    let seeks_msat_pool = msats_needed_for_seeks.min(total_msats_available);
    let provides_msat_pool = total_msats_available - seeks_msat_pool;

    // Now we distribute msats owed to the seeks based on their share
    // of total_seek_msats.
    let mut draining_seeks_msat_pool = seeks_msat_pool;
    locked_seeks
        .values_mut()
        .flatten()
        .for_each(|LockedSeek { amount, .. }| {
            let new_amount = (seeks_msat_pool * amount.msats as u128) / total_seek_msats;
            draining_seeks_msat_pool -= new_amount;
            // `seeks_msat_pool` fits in u64 since it cannot grow larger than 21 million
            // BTC. `new_amount` is less than `seeks_msat_pool`. Therefore,
            // `new_amount` must fit in u64.
            amount.msats = new_amount.try_into().unwrap();
        });

    // If there's any left over msats owed to seeks (due to rounding),
    // we allot them to an arbitrary seek.
    if draining_seeks_msat_pool != 0 {
        let mut seeks_vec = locked_seeks.values_mut().flatten().collect_vec();
        let rand_index = randomness % seeks_vec.len();
        if let Some(LockedSeek { amount, .. }) = seeks_vec.get_mut(rand_index) {
            // `draining_seeks_msat_pool` starts off as `seeks_msat_pool` and gets
            // progressively smaller. `seeks_msat_pool` fits in u64 since it
            // cannot grow larger than 21 million BTC. Therefore
            // `draining_seeks_msat_pool` must also fit in u64.
            amount.msats += TryInto::<u64>::try_into(draining_seeks_msat_pool).unwrap();
        }
    }

    // Similarly we distribute msats owed to the provides based on their share
    // of total_provide_msats.
    let mut draining_provides_msat_pool = provides_msat_pool;
    locked_provides
        .values_mut()
        .flatten()
        .for_each(|LockedProvide { amount, .. }| {
            let new_amount = (provides_msat_pool * amount.msats as u128) / total_provide_msats;
            draining_provides_msat_pool -= new_amount;
            // `provides_msat_pool` fits in u64 since it cannot grow larger than 21 million
            // BTC. `new_amount` is less than `provides_msat_pool`. Therefore,
            // `new_amount` must fit in u64.
            amount.msats = new_amount.try_into().unwrap();
        });

    // If there's any left over msats owed to provides (due to rounding),
    // we allot them to an arbitrary provide.
    if draining_provides_msat_pool != 0 {
        let mut provides_vec = locked_provides.values_mut().flatten().collect_vec();
        let rand_index = randomness % provides_vec.len();
        if let Some(LockedProvide { amount, .. }) = provides_vec.get_mut(rand_index) {
            // `draining_provides_msat_pool` starts off as `provides_msat_pool` and gets
            // progressively smaller. `provides_msat_pool` fits in u64 since it
            // cannot grow larger than 21 million BTC. Therefore
            // `draining_provides_msat_pool` must also fit in u64.
            amount.msats += TryInto::<u64>::try_into(draining_provides_msat_pool).unwrap();
        }
    }
}

async fn apply_staged_cancellations(
    dbtx: &mut DatabaseTransaction<'_>,
    locked_seeks: &mut BTreeMap<PublicKey, Vec<LockedSeek>>,
    locked_provides: &mut BTreeMap<PublicKey, Vec<LockedProvide>>,
    new_price: u128,
) {
    let staged_cancellations = dbtx
        .find_by_prefix(&StagedCancellationKeyPrefix)
        .await
        .collect::<Vec<_>>()
        .await;

    for (key, (_, CancelRenewal { bps })) in staged_cancellations {
        let mut msats_to_refund = 0;

        // If account has seeks, cancel portion of seeks
        let total_account_seeks_msat = locked_seeks
            .get(&key.0)
            .map(|vec| vec.as_slice())
            .unwrap_or_default()
            .iter()
            .fold(0u128, |acc, LockedSeek { amount, .. }| {
                acc + amount.msats as u128
            });

        if total_account_seeks_msat != 0 {
            let mut seeks_msat_to_cancel =
                ceil_division(total_account_seeks_msat * bps as u128, BPS_UNIT);

            if let Some(seeks_list) = locked_seeks.get_mut(&key.0) {
                // Iterate in reverse to ensure older sequences are preserved
                for LockedSeek {
                    amount,
                    staged_txid,
                    ..
                } in seeks_list.iter_mut().rev()
                {
                    let cancellable = seeks_msat_to_cancel.min(amount.msats.into());
                    seeks_msat_to_cancel -= cancellable;
                    msats_to_refund += cancellable;

                    // `cancellable` is the min of two valid msat values. Since an msat value is
                    // guaranteed to fit within u64, so is `cancellable`.
                    let cancellable = Amount::from_msats(cancellable.try_into().unwrap());
                    *amount -= cancellable;

                    let seek_metadata_key = SeekMetadataKey(key.0, *staged_txid);
                    if let Some(mut metadata) = dbtx.get_value(&seek_metadata_key).await {
                        metadata.withdrawn_amount += cancellable;
                        metadata.withdrawn_amount_cents += amount_to_cents(cancellable, new_price);
                        if *amount == Amount::ZERO {
                            metadata.fully_withdrawn = true;
                        }
                        dbtx.insert_entry(&seek_metadata_key, &metadata).await;
                    }

                    if seeks_msat_to_cancel == 0 {
                        break;
                    }
                }

                // Remove seeks that have been fully drained
                seeks_list.retain(|LockedSeek { amount, .. }| *amount != Amount::ZERO);
            }
        }

        // If account has provides, cancel portion of provides
        let total_account_provides_msat = locked_provides
            .get(&key.0)
            .map(|vec| vec.as_slice())
            .unwrap_or_default()
            .iter()
            .fold(0u128, |acc, LockedProvide { amount, .. }| {
                acc + amount.msats as u128
            });

        if total_account_provides_msat != 0 {
            let mut provides_msat_to_cancel =
                ceil_division(total_account_provides_msat * bps as u128, BPS_UNIT);

            if let Some(provides_list) = locked_provides.get_mut(&key.0) {
                // Iterate in reverse to ensure older sequences are preserved
                for LockedProvide { amount, .. } in provides_list.iter_mut().rev() {
                    let cancellable = provides_msat_to_cancel.min(amount.msats.into());

                    // `cancellable` is the min of two valid msat values. Since an msat value is
                    // guaranteed to fit within u64, so is `cancellable`
                    amount.msats -= TryInto::<u64>::try_into(cancellable).unwrap();
                    provides_msat_to_cancel -= cancellable;
                    msats_to_refund += cancellable;

                    if provides_msat_to_cancel == 0 {
                        break;
                    }
                }

                // Remove provides that have been fully drained
                provides_list.retain(|LockedProvide { amount, .. }| *amount != Amount::ZERO);
            }
        }

        // Refund cancelled locked amount and remove account's staged cancellation
        let idle_balance_key = IdleBalanceKey(key.0);
        let mut idle_balance = dbtx
            .get_value(&idle_balance_key)
            .await
            .unwrap_or(IdleBalance(Amount::ZERO));

        // `msats_to_refund` is an accrued value calculated by taking the user's seeks
        // (or provides) and draining the seeks according to the specified basis points.
        // Since the sum of the user's seeks cannot exceed 21 million BTC,
        // `msats_to_refund` cannot exceed 21 million BTC, and must therefore fit within
        // u64.
        idle_balance.0.msats += TryInto::<u64>::try_into(msats_to_refund).unwrap();
        dbtx.insert_entry(&idle_balance_key, &idle_balance).await;
        dbtx.remove_entry(&key).await;
    }
}

async fn restage_remaining_locks(
    dbtx: &mut DatabaseTransaction<'_>,
    locked_seeks: BTreeMap<PublicKey, Vec<LockedSeek>>,
    locked_provides: BTreeMap<PublicKey, Vec<LockedProvide>>,
) {
    for (account, account_locked_seeks) in locked_seeks {
        // If a staged seek with the same sequence exists, we just
        // increase its amount by the amount of the lock. Otherwise,
        // we insert a new staged seek.
        let new_staged_seeks = dbtx
            .get_value(&StagedSeeksKey(account))
            .await
            .unwrap_or_default()
            .into_iter()
            .chain(
                account_locked_seeks
                    .into_iter()
                    .map(|locked_seek| StagedSeek {
                        txid: locked_seek.staged_txid,
                        sequence: locked_seek.staged_sequence,
                        seek: Seek(locked_seek.amount),
                    }),
            )
            .sorted_unstable_by_key(|staged_seek| staged_seek.sequence)
            .coalesce(|prev, curr| {
                if prev.sequence == curr.sequence {
                    Ok(StagedSeek {
                        txid: prev.txid,
                        sequence: prev.sequence,
                        seek: Seek(prev.seek.0 + curr.seek.0),
                    })
                } else {
                    Err((prev, curr))
                }
            })
            .collect_vec();
        dbtx.insert_entry(&StagedSeeksKey(account), &new_staged_seeks)
            .await;
    }

    for (account, account_locked_provides) in locked_provides {
        // If a staged provide with the same sequence exists, we just
        // increase its amount by the amount of the lock. Otherwise,
        // we insert a new staged provide.
        let new_staged_provides = dbtx
            .get_value(&StagedProvidesKey(account))
            .await
            .unwrap_or_default()
            .into_iter()
            .chain(
                account_locked_provides
                    .into_iter()
                    .map(|locked_provide| StagedProvide {
                        txid: locked_provide.staged_txid,
                        sequence: locked_provide.staged_sequence,
                        provide: Provide {
                            amount: locked_provide.amount,
                            min_fee_rate: locked_provide.staged_min_fee_rate,
                        },
                    }),
            )
            .sorted_unstable_by_key(|staged_provide| staged_provide.sequence)
            .coalesce(|prev, curr| {
                if prev.sequence == curr.sequence {
                    Ok(StagedProvide {
                        txid: prev.txid,
                        sequence: prev.sequence,
                        provide: Provide {
                            amount: prev.provide.amount + curr.provide.amount,
                            min_fee_rate: prev.provide.min_fee_rate,
                        },
                    })
                } else {
                    Err((prev, curr))
                }
            })
            .collect_vec();
        dbtx.insert_entry(&StagedProvidesKey(account), &new_staged_provides)
            .await;
    }
}

async fn calculate_locks_and_write_cycle(
    dbtx: &mut DatabaseTransaction<'_>,
    collateral_ratio: &CollateralRatio,
    index: u64,
    time: SystemTime,
    price: u64,
    randomness: usize,
) {
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
    )
    .await;
}

async fn extract_sorted_staged_seeks_and_provides(
    dbtx: &mut DatabaseTransaction<'_>,
) -> (
    VecDeque<(PublicKey, StagedSeek)>,
    VecDeque<(PublicKey, StagedProvide)>,
) {
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
                StagedProvide {
                    provide: a,
                    sequence: seq_a,
                    ..
                },
            ),
             (
                _,
                StagedProvide {
                    provide: b,
                    sequence: seq_b,
                    ..
                },
            )| a.min_fee_rate.cmp(&b.min_fee_rate).then(seq_a.cmp(seq_b)),
        )
        .collect::<VecDeque<_>>();
    dbtx.remove_by_prefix(&StagedProvidesKeyPrefix).await;

    (staged_seeks, staged_provides)
}

struct LockedProvidesAndFeeRateResult {
    locked_provides: Vec<(PublicKey, LockedProvide)>,
    included_provides_sum: u128,
    fee_rate: u64,
}

fn calculate_locked_provides_and_fee_rate(
    staged_seeks: &VecDeque<(PublicKey, StagedSeek)>,
    staged_provides: &mut VecDeque<(PublicKey, StagedProvide)>,
    collateral_ratio_provider: u128,
    collateral_ratio_seeker: u128,
) -> LockedProvidesAndFeeRateResult {
    let seeks_sum = staged_seeks
        .iter()
        .fold(0u128, |acc, (_, StagedSeek { seek, .. })| {
            acc + seek.0.msats as u128
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
            account,
            StagedProvide {
                txid,
                sequence,
                provide,
            },
        ) = &mut staged_provides[0];

        // If the fee rate for the next item is the same as the current
        // fee rate, we can just include however much collateral we need from it.
        // Otherwise, we need to calculate the remaining collateral needed
        // at the fee rate of the next item. It's possible that the increased
        // fee might make the remaining collateral needed 0, in which case
        // we should stop. Otherwise, we use the new value of remaining
        // collateral needed, as well as the new fee rate.
        if provide.min_fee_rate > fee_rate {
            let new_remaining_coll_needed = remaining_provider_collateral_needed(
                seeks_sum,
                provide.min_fee_rate.into(), // use fee rate of new provide
                collateral_ratio_provider,
                collateral_ratio_seeker,
                included_provides_sum,
            );

            if new_remaining_coll_needed == 0 {
                break;
            }

            fee_rate = provide.min_fee_rate;
            remaining_coll_needed = new_remaining_coll_needed;
        }

        let amount_used = remaining_coll_needed.min(provide.amount.msats.into());
        included_provides_sum += amount_used;
        remaining_coll_needed -= amount_used;
        locked_provides.push((
            *account,
            LockedProvide {
                staged_txid: *txid,
                staged_sequence: *sequence,
                staged_min_fee_rate: provide.min_fee_rate,
                // amount_used is guaranteed to fit in u64 since it's a min(u64)
                amount: Amount::from_msats(amount_used.try_into().unwrap()),
            },
        ));

        // Modify the staged provide we just used (or remove it if exhausted)
        // amount_used is guaranteed to fit in u64 since it's a min(u64)
        provide.amount.msats -= TryInto::<u64>::try_into(amount_used).unwrap();
        if provide.amount == Amount::ZERO {
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
    staged_seeks: &mut VecDeque<(PublicKey, StagedSeek)>,
    fee_rate: u128,
    collateral_ratio_provider: u128,
    collateral_ratio_seeker: u128,
    included_provides_sum: u128,
) -> Vec<(PublicKey, LockedSeek)> {
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
            StagedSeek {
                txid,
                sequence,
                seek,
            },
        ) = &mut staged_seeks[0];

        let amount_used = included_seeks_sum_before_fees.min(seek.0.msats.into());
        included_seeks_sum_before_fees -= amount_used;
        locked_seeks.push((
            *account,
            LockedSeek {
                staged_txid: *txid,
                staged_sequence: *sequence,
                // amount_used is guaranteed to fit in u64 since it's a min(u64)
                amount: Amount::from_msats(amount_used.try_into().unwrap()),
            },
        ));

        // Modify the staged seek we just used (or remove it if exhausted)
        // amount_used is guaranteed to fit in u64 since it's a min(u64)
        seek.0.msats -= TryInto::<u64>::try_into(amount_used).unwrap();
        if seek.0 == Amount::ZERO {
            staged_seeks.pop_front();
        }
    }

    locked_seeks
}

async fn write_remaining_staged_seeks_and_provides(
    dbtx: &mut DatabaseTransaction<'_>,
    staged_seeks: VecDeque<(PublicKey, StagedSeek)>,
    staged_provides: VecDeque<(PublicKey, StagedProvide)>,
) {
    for (account, seeks) in staged_seeks.into_iter().into_group_map() {
        dbtx.insert_entry(&StagedSeeksKey(account), &seeks).await;
    }

    for (account, provides) in staged_provides.into_iter().into_group_map() {
        dbtx.insert_entry(&StagedProvidesKey(account), &provides)
            .await;
    }
}

#[allow(clippy::too_many_arguments)]
async fn distribute_fees_and_write_cycle(
    dbtx: &mut DatabaseTransaction<'_>,
    mut locked_seeks: Vec<(PublicKey, LockedSeek)>,
    locked_provides: Vec<(PublicKey, LockedProvide)>,
    fee_rate: u64,
    included_provides_sum: u128,
    cycle_index: u64,
    cycle_time: SystemTime,
    cycle_price: u64,
    randomness: usize,
) {
    #[derive(PartialOrd, Ord, PartialEq, Eq)]
    struct AmountAndFeeKey {
        pub_key: PublicKey,
        txid: TransactionId,
        sequence: u64,
    }
    struct AmountAndFeeValue {
        amount: Amount,
        fee: Amount,
    }
    let mut seek_amount_and_fee_map: BTreeMap<AmountAndFeeKey, AmountAndFeeValue> = BTreeMap::new();

    // Reduce each locked seek by fee amount and calculate total fee pool
    let mut fee_pool = 0u128;
    locked_seeks.iter_mut().for_each(
        |(
            account,
            LockedSeek {
                staged_txid,
                staged_sequence,
                amount,
            },
        )| {
            // Ceiling division to ensure fee is never undercharged
            let fee = ceil_division(amount.msats as u128 * fee_rate as u128, B);
            fee_pool += fee;

            // `fee` is calculated by taking a real msat value (which is guaranteed to fit
            // within u64) and multiplying it by a fraction smaller than 1. Therefore `fee`
            // must fit within u64.
            let fee = Amount::from_msats(fee.try_into().unwrap());
            seek_amount_and_fee_map.insert(
                AmountAndFeeKey {
                    pub_key: *account,
                    txid: *staged_txid,
                    sequence: *staged_sequence,
                },
                AmountAndFeeValue {
                    amount: *amount,
                    fee,
                },
            );
            *amount -= fee;
        },
    );

    // Update seek metadatas in database
    for (
        AmountAndFeeKey {
            pub_key,
            txid,
            sequence,
        },
        amount_and_fee,
    ) in seek_amount_and_fee_map
    {
        let seek_metadata_key = SeekMetadataKey(pub_key, txid);
        let seek_metadata = match dbtx.get_value(&seek_metadata_key).await {
            Some(existing) => SeekMetadata {
                staged_sequence: existing.staged_sequence,
                initial_amount: existing.initial_amount,
                initial_amount_cents: existing.initial_amount_cents,
                withdrawn_amount: existing.withdrawn_amount,
                withdrawn_amount_cents: existing.withdrawn_amount_cents,
                fees_paid_so_far: existing.fees_paid_so_far + amount_and_fee.fee,
                first_lock_start_time: existing.first_lock_start_time,
                fully_withdrawn: existing.fully_withdrawn,
            },
            None => {
                let amount_cents = amount_to_cents(amount_and_fee.amount, cycle_price.into());
                SeekMetadata {
                    staged_sequence: sequence,
                    initial_amount: amount_and_fee.amount,
                    initial_amount_cents: amount_cents,
                    withdrawn_amount: Amount::ZERO,
                    withdrawn_amount_cents: 0,
                    fees_paid_so_far: amount_and_fee.fee,
                    first_lock_start_time: cycle_time,
                    fully_withdrawn: false,
                }
            }
        };
        dbtx.insert_entry(&seek_metadata_key, &seek_metadata).await;
    }

    let locked_provides_map = locked_provides
        .into_iter()
        .into_group_map()
        .into_iter()
        .collect::<BTreeMap<_, _>>();

    // Calculate fee owed to each provider using their total provided amount
    let mut draining_fee_pool = fee_pool;
    let mut provider_fee_owed_map = locked_provides_map
        .iter()
        .map(|(account, provides)| {
            let account_provides_amount = provides.iter().fold(0u128, |acc, locked_provide| {
                acc + locked_provide.amount.msats as u128
            });
            let account_fee_owed = account_provides_amount * fee_pool / included_provides_sum;
            draining_fee_pool -= account_fee_owed;
            (*account, account_fee_owed)
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
    for (account, fee_owed) in provider_fee_owed_map {
        let idle_balance_key = IdleBalanceKey(account);
        let mut idle_balance = dbtx
            .get_value(&idle_balance_key)
            .await
            .unwrap_or(IdleBalance(Amount::ZERO));
        // `fee_owed` is calculated by taking the total fee amount owed to all the
        // providers which comes from all the seeks. Since the sum of seeks cannot
        // exceed 21 million BTC, the total fee amount owed to all the providers cannot
        // exceed 21 million BTC. Then to calculate `fee_owed`, we take this total fee
        // amount and multiply it by a fraction representing the provider's share of the
        // total provided liquidity. Therefore, `fee_owed` cannot exceed 21 million BTC.
        // And hence it must fit within u64.
        idle_balance.0.msats += TryInto::<u64>::try_into(fee_owed).unwrap();
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
            fee_rate,
            locked_seeks: locked_seeks_map,
            locked_provides: locked_provides_map,
        },
    )
    .await;
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
