use std::collections::BTreeMap;
use std::ffi;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use anyhow::bail;
use async_stream::stream;
use common::config::StabilityPoolClientConfig;
use common::{
    AccountInfo, BPS_UNIT, CancelRenewal, IntendedAction, LiquidityStats, Provide, Seek,
    StabilityPoolCommonGen, StabilityPoolInput, StabilityPoolModuleTypes, StabilityPoolOutput,
    amount_to_cents,
};
use db::AccountInfoKey;
use fedimint_api_client::api::{DynModuleApi, FederationApiExt as _, FederationError};
use fedimint_client::module::module::init::{ClientModuleInit, ClientModuleInitArgs};
use fedimint_client::module::module::recovery::NoModuleBackup;
use fedimint_client::module::module::{ClientContext, OutPointRange};
use fedimint_client::module::oplog::{OperationLogEntry, UpdateStreamOrOutcome};
use fedimint_client::module::sm::{
    ClientSMDatabaseTransaction, Context, DynState, ModuleNotifier, State, StateTransition,
};
use fedimint_client::transaction::{
    ClientInput, ClientInputBundle, ClientInputSM, ClientOutput, ClientOutputBundle,
    ClientOutputSM, TransactionBuilder,
};
use fedimint_client::{ClientModule, DynGlobalClientContext, sm_enum_variant_translation};
use fedimint_core::core::{IntoDynInstance, ModuleInstanceId, ModuleKind, OperationId};
use fedimint_core::db::{Database, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::module::{
    ApiRequestErased, ApiVersion, CommonModuleInit, ModuleInit, MultiApiVersion,
};
use fedimint_core::task::timeout;
use fedimint_core::{Amount, OutPoint, TransactionId, apply, async_trait_maybe_send};
use futures::{Stream, StreamExt};
use secp256k1::{Keypair, Secp256k1};
use serde::{Deserialize, Serialize};
pub use stability_pool_common_old as common;
use stability_pool_common_old::KIND;
use tokio::sync::Mutex;
use tracing::{error, info};

mod db;

#[derive(Debug, Clone)]
pub struct StabilityPoolClientInit;

impl ModuleInit for StabilityPoolClientInit {
    type Common = StabilityPoolCommonGen;

    // No client-side database for stability pool
    async fn dump_database(
        &self,
        _dbtx: &mut DatabaseTransaction<'_>,
        _prefix_names: Vec<String>,
    ) -> Box<dyn Iterator<Item = (String, Box<dyn erased_serde::Serialize + Send>)> + '_> {
        Box::new(BTreeMap::new().into_iter())
    }
}

#[apply(async_trait_maybe_send!)]
impl ClientModuleInit for StabilityPoolClientInit {
    type Module = StabilityPoolClientModule;

    async fn init(&self, args: &ClientModuleInitArgs<Self>) -> anyhow::Result<Self::Module> {
        Ok(StabilityPoolClientModule {
            cfg: args.cfg().to_owned(),
            client_key_pair: args
                .module_root_secret()
                .to_owned()
                .to_secp_key(&Secp256k1::new()),
            module_api: args.module_api().clone(),
            client_ctx: args.context(),
            notifier: args.notifier().clone(),
            db: args.db().clone(),
            account_info_lock: Arc::new(Mutex::new(())),
        })
    }

    fn supported_api_versions(&self) -> MultiApiVersion {
        MultiApiVersion::try_from_iter([ApiVersion { major: 0, minor: 0 }])
            .expect("no version conflicts")
    }
}

#[derive(Debug, Clone)]
pub struct StabilityPoolClientModule {
    pub cfg: StabilityPoolClientConfig,
    client_key_pair: Keypair,
    module_api: DynModuleApi,
    client_ctx: ClientContext<Self>,
    notifier: ModuleNotifier<StabilityPoolStateMachines>,
    db: Database,
    /// Mutex to synchronize concurrent calls to the account_info method
    account_info_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone)]
pub struct StabilityPoolClientContext {
    module: StabilityPoolClientModule,
}

impl Context for StabilityPoolClientContext {
    const KIND: Option<ModuleKind> = Some(KIND);
}

#[apply(async_trait_maybe_send!)]
impl ClientModule for StabilityPoolClientModule {
    type Init = StabilityPoolClientInit;
    type Common = StabilityPoolModuleTypes;
    type ModuleStateMachineContext = StabilityPoolClientContext;
    type States = StabilityPoolStateMachines;
    type Backup = NoModuleBackup;

    fn context(&self) -> StabilityPoolClientContext {
        StabilityPoolClientContext {
            module: self.clone(),
        }
    }

    fn input_fee(
        &self,
        _amount: Amount,
        _input: &StabilityPoolInput,
    ) -> Option<fedimint_core::Amount> {
        // TODO shaurya figure out fees
        Some(Amount::ZERO)
    }

    fn output_fee(
        &self,
        _amount: Amount,
        _output: &StabilityPoolOutput,
    ) -> Option<fedimint_core::Amount> {
        // TODO shaurya figure out fees
        Some(Amount::ZERO)
    }

    async fn handle_cli_command(
        &self,
        args: &[ffi::OsString],
    ) -> anyhow::Result<serde_json::Value> {
        if args.is_empty() {
            return Err(anyhow::format_err!(
                "Expected to be called with at least 1 argument: <command> …"
            ));
        }

        let command = args[0].to_string_lossy();

        match command.as_ref() {
            "pubkey" => Ok(serde_json::to_value(self.client_key_pair.public_key())?),
            "account-info" => Ok(serde_json::to_value(self.account_info(true).await?)?),
            "deposit-to-seek" => {
                if args.len() != 2 {
                    return Err(anyhow::format_err!(
                        "`deposit-to-seek` command expects 1 argument: <amount_msats>"
                    ));
                }

                let seek_amount = args[1].to_string_lossy().parse::<Amount>()?;
                let operation_id = self.deposit_to_seek(seek_amount).await?;
                let mut updates = self
                    .subscribe_deposit_operation(operation_id)
                    .await?
                    .into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolDepositOperationState::TxRejected(e) => {
                            return Err(anyhow::Error::msg(format!("TX rejected: {e}")));
                        }
                        StabilityPoolDepositOperationState::PrimaryOutputError(e) => {
                            return Err(anyhow::Error::msg(format!("Change output error: {e}")));
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String(
                    "deposit-to-seek success".to_string(),
                ))
            }
            "deposit-to-provide" => {
                if args.len() != 3 {
                    return Err(anyhow::format_err!(
                        "`deposit-to-provide` command expects 2 arguments: <amount_msats> <fee_rate_ppb>"
                    ));
                }

                let provide_amount = args[1].to_string_lossy().parse::<Amount>()?;
                let provide_fee_rate = args[2].to_string_lossy().parse::<u64>()?;
                let operation_id = self
                    .deposit_to_provide(provide_amount, provide_fee_rate)
                    .await?;
                let mut updates = self
                    .subscribe_deposit_operation(operation_id)
                    .await?
                    .into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolDepositOperationState::TxRejected(e) => {
                            return Err(anyhow::Error::msg(format!("TX rejected: {e}")));
                        }
                        StabilityPoolDepositOperationState::PrimaryOutputError(e) => {
                            return Err(anyhow::Error::msg(format!("Change output error: {e}")));
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String(
                    "deposit-to-provide success".to_string(),
                ))
            }
            "withdraw" => {
                if args.len() != 3 {
                    return Err(anyhow::format_err!(
                        "`withdraw` command expects 2 arguments: <unlocked_msats> <locked_bps>"
                    ));
                }

                let unlocked_amount = args[1].to_string_lossy().parse::<Amount>()?;
                let cancellation_bps = args[2].to_string_lossy().parse::<u32>()?;
                let (operation_id, _) = self.withdraw(unlocked_amount, cancellation_bps).await?;
                let mut updates = self.subscribe_withdraw(operation_id).await?.into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolWithdrawalOperationState::TxRejected(e) => {
                            return Err(anyhow::Error::msg(format!("TX rejected: {e}")));
                        }
                        StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => {
                            return Err(anyhow::Error::msg(format!("Primary output error: {e}")));
                        }
                        StabilityPoolWithdrawalOperationState::CancellationSubmissionFailure(e) => {
                            return Err(anyhow::Error::msg(format!(
                                "Cancellation submission failure: {e}"
                            )));
                        }
                        StabilityPoolWithdrawalOperationState::AwaitCycleTurnoverError(e) => {
                            return Err(anyhow::Error::msg(format!(
                                "Await cycle turnover error: {e}"
                            )));
                        }
                        StabilityPoolWithdrawalOperationState::WithdrawIdleSubmissionFailure(e) => {
                            return Err(anyhow::Error::msg(format!(
                                "Withdraw idle submission failure: {e}"
                            )));
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String("withdraw success".to_string()))
            }
            command => Err(anyhow::format_err!(
                "Unknown command: {command}, supported commands: {}",
                [
                    "account-info",
                    "deposit-to-seek",
                    "deposit-to-provide",
                    "withdraw",
                ]
                .join(", ")
            )),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub enum StabilityPoolStateMachines {
    WithdrawUnlocked(StabilityPoolWithdrawUnlockedStateMachine),
    CancelLocked(StabilityPoolCancelLockedStateMachine),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StabilityPoolMeta {
    // Deposit given amount for seeking or providing
    Deposit {
        txid: TransactionId,
        change_outpoints: Vec<OutPoint>,
        amount: Amount,
    },
    // Cancel auto-renew of given BPS of locked funds
    CancelRenewal {
        txid: TransactionId,
        bps: u32,
        #[serde(default)]
        estimated_withdrawal_cents: u64,
    },
    // Withdraw given amount from unlocked balance (idle + staged)
    // followed by auto-renewal cancellation of given BPS
    // of locked funds (could be 0 BPS)
    Withdrawal {
        txid: TransactionId,
        outpoints: Vec<OutPoint>,
        unlocked_amount: Amount,
        locked_bps: u32,
        #[serde(default)]
        estimated_withdrawal_cents: u64,
    },
}

impl IntoDynInstance for StabilityPoolStateMachines {
    type DynType = DynState;

    fn into_dyn(self, instance_id: ModuleInstanceId) -> Self::DynType {
        DynState::from_typed(instance_id, self)
    }
}

impl State for StabilityPoolStateMachines {
    type ModuleContext = StabilityPoolClientContext;

    fn transitions(
        &self,
        context: &Self::ModuleContext,
        global_context: &DynGlobalClientContext,
    ) -> Vec<StateTransition<Self>> {
        match self {
            StabilityPoolStateMachines::WithdrawUnlocked(sm) => sm_enum_variant_translation!(
                sm.transitions(context, global_context),
                StabilityPoolStateMachines::WithdrawUnlocked
            ),
            StabilityPoolStateMachines::CancelLocked(sm) => sm_enum_variant_translation!(
                sm.transitions(context, global_context),
                StabilityPoolStateMachines::CancelLocked
            ),
        }
    }

    fn operation_id(&self) -> OperationId {
        match self {
            StabilityPoolStateMachines::WithdrawUnlocked(sm) => sm.operation_id(),
            StabilityPoolStateMachines::CancelLocked(sm) => sm.operation_id(),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub struct StabilityPoolWithdrawUnlockedStateMachine {
    pub operation_id: OperationId,
    pub transaction_id: TransactionId,
    pub state: StabilityPoolWithdrawUnlockedState,
    pub maybe_cancel_locked_bps: Option<u32>,
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub enum StabilityPoolWithdrawUnlockedState {
    Created,
    Accepted {
        maybe_cancellation_tx_id: Option<TransactionId>,
    },
    Rejected(String),
}

impl State for StabilityPoolWithdrawUnlockedStateMachine {
    type ModuleContext = StabilityPoolClientContext;

    fn transitions(
        &self,
        context: &Self::ModuleContext,
        global_context: &DynGlobalClientContext,
    ) -> Vec<StateTransition<Self>> {
        let context = context.clone();
        let global_context = global_context.clone();
        match self.state {
            StabilityPoolWithdrawUnlockedState::Created => vec![StateTransition::new(
                await_tx_accepted(global_context.clone(), self.transaction_id),
                move |dbtx, result, old_state: StabilityPoolWithdrawUnlockedStateMachine| {
                    match result {
                        Ok(_) => Box::pin(maybe_fund_cancellation_output(
                            dbtx,
                            global_context.clone(),
                            context.clone(),
                            old_state,
                        )),
                        Err(reason) => Box::pin(async move {
                            StabilityPoolWithdrawUnlockedStateMachine {
                                operation_id: old_state.operation_id,
                                transaction_id: old_state.transaction_id,
                                state: StabilityPoolWithdrawUnlockedState::Rejected(reason),
                                maybe_cancel_locked_bps: old_state.maybe_cancel_locked_bps,
                            }
                        }),
                    }
                },
            )],
            StabilityPoolWithdrawUnlockedState::Accepted { .. } => vec![], // terminal state
            StabilityPoolWithdrawUnlockedState::Rejected(_) => vec![],     // terminal state
        }
    }

    fn operation_id(&self) -> OperationId {
        self.operation_id
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub struct StabilityPoolCancelLockedStateMachine {
    pub operation_id: OperationId,
    pub transaction_id: TransactionId,
    pub state: StabilityPoolCancelLockedState,
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub enum StabilityPoolCancelLockedState {
    Created,
    Accepted,
    Rejected(String),
    Processed {
        withdraw_unlocked_amount: Amount,
        withdraw_unlocked_tx_id: TransactionId,
        withdraw_unlocked_outpoints: Vec<OutPoint>,
    },
    ProcessingError(String),
}

impl State for StabilityPoolCancelLockedStateMachine {
    type ModuleContext = StabilityPoolClientContext;

    fn transitions(
        &self,
        context: &Self::ModuleContext,
        global_context: &DynGlobalClientContext,
    ) -> Vec<StateTransition<Self>> {
        let context = context.clone();
        let global_context = global_context.clone();
        match self.state {
            StabilityPoolCancelLockedState::Created => vec![StateTransition::new(
                await_tx_accepted(global_context.clone(), self.transaction_id),
                move |_, result, old_state: StabilityPoolCancelLockedStateMachine| match result {
                    Ok(_) => Box::pin(async move {
                        StabilityPoolCancelLockedStateMachine {
                            operation_id: old_state.operation_id,
                            transaction_id: old_state.transaction_id,
                            state: StabilityPoolCancelLockedState::Accepted,
                        }
                    }),
                    Err(reason) => Box::pin(async move {
                        StabilityPoolCancelLockedStateMachine {
                            operation_id: old_state.operation_id,
                            transaction_id: old_state.transaction_id,
                            state: StabilityPoolCancelLockedState::Rejected(reason),
                        }
                    }),
                },
            )],
            StabilityPoolCancelLockedState::Accepted => vec![StateTransition::new(
                await_cancellation_processed(context.clone()),
                move |dbtx, result, old_state: StabilityPoolCancelLockedStateMachine| match result {
                    Ok(idle_balance) => Box::pin(claim_idle_balance_input(
                        dbtx,
                        global_context.clone(),
                        context.clone(),
                        old_state,
                        idle_balance,
                    )),
                    Err(reason) => Box::pin(async move {
                        StabilityPoolCancelLockedStateMachine {
                            operation_id: old_state.operation_id,
                            transaction_id: old_state.transaction_id,
                            state: StabilityPoolCancelLockedState::ProcessingError(reason),
                        }
                    }),
                },
            )],
            StabilityPoolCancelLockedState::Rejected(_) => vec![], // terminal state
            StabilityPoolCancelLockedState::Processed { .. } => vec![], // terminal state
            StabilityPoolCancelLockedState::ProcessingError(_) => vec![], // terminal state
        }
    }

    fn operation_id(&self) -> OperationId {
        self.operation_id
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StabilityPoolWithdrawalOperationState {
    InvalidOperationType,
    WithdrawUnlockedInitiated(Amount),
    TxRejected(String),
    WithdrawUnlockedAccepted(Amount),
    PrimaryOutputError(String),
    Success(Amount),
    CancellationSubmissionFailure(String),
    CancellationInitiated(Option<Amount>),
    CancellationAccepted(Option<Amount>),
    AwaitCycleTurnoverError(String),
    WithdrawIdleSubmissionFailure(String),
    WithdrawIdleInitiated(Amount),
    WithdrawIdleAccepted(Amount),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StabilityPoolDepositOperationState {
    Initiated,
    TxAccepted,
    TxRejected(String),
    PrimaryOutputError(String),
    Success,
}

/// Wrapper around AccountInfo for consumption on the client-side
/// that encapsulates the freshness of the data (timestamp), as well
/// as the origin of the data (local copy vs fetched from server).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientAccountInfo {
    pub account_info: AccountInfo,
    pub timestamp: SystemTime,
    pub is_fetched_from_server: bool,
}

impl StabilityPoolClientModule {
    pub async fn account_info(&self, force_update: bool) -> anyhow::Result<ClientAccountInfo> {
        let _lock = self.account_info_lock.lock().await;
        let mut dbtx = self.db.begin_transaction_nc().await;
        let db_account_info = dbtx.get_value(&AccountInfoKey).await;

        if db_account_info.is_none() || force_update {
            match self
                .fetch_account_info_from_server(Duration::from_secs(30))
                .await
            {
                Ok(account_info) => {
                    let current_time = fedimint_core::time::now();
                    let mut dbtx = self.db.begin_transaction().await;
                    dbtx.insert_entry(&AccountInfoKey, &(current_time, account_info.clone()))
                        .await;
                    dbtx.commit_tx().await;
                    return Ok(ClientAccountInfo {
                        account_info,
                        timestamp: current_time,
                        is_fetched_from_server: true,
                    });
                }
                Err(e) => {
                    error!("Failed to fetch account info from server: {:?}", e);
                }
            }
        }

        if let Some((timestamp, account_info)) = db_account_info {
            return Ok(ClientAccountInfo {
                account_info,
                timestamp,
                is_fetched_from_server: false,
            });
        }

        anyhow::bail!("No local data present")
    }

    async fn fetch_account_info_from_server(
        &self,
        timeout_duration: Duration,
    ) -> anyhow::Result<AccountInfo> {
        Ok(timeout(
            timeout_duration,
            self.module_api.request_current_consensus(
                "account_info".to_string(),
                ApiRequestErased::new(self.client_key_pair.public_key()),
            ),
        )
        .await??)
    }

    pub async fn current_cycle_index(&self) -> anyhow::Result<u64, FederationError> {
        self.module_api
            .request_current_consensus(
                "current_cycle_index".to_string(),
                ApiRequestErased::default(),
            )
            .await
    }

    pub async fn next_cycle_start_time(&self) -> anyhow::Result<u64, FederationError> {
        self.module_api
            .request_current_consensus(
                "next_cycle_start_time".to_string(),
                ApiRequestErased::default(),
            )
            .await
    }

    /// Returns the average of the provider fee rate over the last #num_cycles
    /// cycles, including the current ongoing cycle. So if num_cycles is 1, we
    /// return the fee rate of the current ongoing cycle. If num_cycles is 2, we
    /// average the current cycle and previous cycle. If num_cyces is n, we
    /// average the current cycle and (n - 1) previous cycles.
    pub async fn average_fee_rate(&self, num_cycles: u64) -> anyhow::Result<u64, FederationError> {
        self.module_api
            .request_current_consensus(
                "average_fee_rate".to_string(),
                ApiRequestErased::new(num_cycles),
            )
            .await
    }

    /// Returns the start price of current cycle in cents.
    pub async fn cycle_start_price(&self) -> anyhow::Result<u64, FederationError> {
        self.module_api
            .request_current_consensus("cycle_start_price".to_string(), ApiRequestErased::default())
            .await
    }

    /// Returns the current provider liquidity stats of the federation,
    /// including total free and used-up liquidity.
    pub async fn liquidity_stats(&self) -> anyhow::Result<LiquidityStats, FederationError> {
        self.module_api
            .request_current_consensus("liquidity_stats".to_string(), ApiRequestErased::default())
            .await
    }

    pub async fn wait_cancellation_processed(&self) -> anyhow::Result<Amount, FederationError> {
        self.module_api
            .request_current_consensus(
                "wait_cancellation_processed".to_string(),
                ApiRequestErased::new(self.client_key_pair.public_key()),
            )
            .await
    }

    pub async fn deposit_to_seek(&self, amount: Amount) -> anyhow::Result<OperationId> {
        let (operation_id, _) =
            submit_tx_with_intended_action(self, IntendedAction::Seek(Seek(amount))).await?;
        Ok(operation_id)
    }

    pub async fn deposit_to_provide(
        &self,
        amount: Amount,
        fee_rate: u64,
    ) -> anyhow::Result<OperationId> {
        let (operation_id, _) = submit_tx_with_intended_action(
            self,
            IntendedAction::Provide(Provide {
                amount,
                min_fee_rate: fee_rate,
            }),
        )
        .await?;
        Ok(operation_id)
    }

    pub async fn subscribe_deposit_operation(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<UpdateStreamOrOutcome<StabilityPoolDepositOperationState>> {
        let operation = stability_pool_operation(&self.client_ctx, operation_id).await?;
        let (txid, change_outpoints) = match operation.meta::<StabilityPoolMeta>() {
            StabilityPoolMeta::Deposit {
                txid,
                change_outpoints,
                ..
            } => (txid, change_outpoints),
            _ => bail!("Operation is not of type deposit/cancel-auto-renewal/undo-cancellation"),
        };

        let client_ctx = self.client_ctx.clone();
        Ok(
            self.client_ctx.outcome_or_updates(operation, operation_id, move || {
                stream! {
                    yield StabilityPoolDepositOperationState::Initiated;

                    let tx_updates_stream = client_ctx.transaction_updates(operation_id);
                    match tx_updates_stream.await.await_tx_accepted(txid).await {
                        Ok(_) => {
                            yield StabilityPoolDepositOperationState::TxAccepted;
                            if change_outpoints.is_empty() {
                                yield StabilityPoolDepositOperationState::Success;
                                return
                            }
                        }
                        Err(e) => { yield StabilityPoolDepositOperationState::TxRejected(e);
                            return
                        },
                    }

                    match client_ctx.await_primary_module_outputs(operation_id, change_outpoints).await {
                        Ok(_) => yield StabilityPoolDepositOperationState::Success,
                        Err(e) => yield StabilityPoolDepositOperationState::PrimaryOutputError(e.to_string()),
                    }
                }
            }),
        )
    }

    pub async fn withdraw(
        &self,
        unlocked_amount: Amount,
        locked_bps: u32,
    ) -> anyhow::Result<(OperationId, TransactionId)> {
        if unlocked_amount == Amount::ZERO && locked_bps == 0 {
            bail!("At least one of unlocked_amount and locked_bps must be non-zero");
        }

        let operation_id = OperationId::new_random();

        if unlocked_amount != Amount::ZERO {
            let input = ClientInput {
                amount: unlocked_amount,
                input: StabilityPoolInput::new_v0(
                    self.client_key_pair.public_key(),
                    unlocked_amount,
                ),
                keys: vec![self.client_key_pair],
            };
            let sm = ClientInputSM {
                state_machines: Arc::new(move |out_point_range| {
                    vec![StabilityPoolStateMachines::WithdrawUnlocked(
                        StabilityPoolWithdrawUnlockedStateMachine {
                            operation_id,
                            transaction_id: out_point_range.txid(),
                            state: StabilityPoolWithdrawUnlockedState::Created,
                            maybe_cancel_locked_bps: match locked_bps {
                                0 => None,
                                x => Some(x),
                            },
                        },
                    )]
                }),
            };
            let tx = TransactionBuilder::new().with_inputs(
                self.client_ctx
                    .make_client_inputs(ClientInputBundle::new(vec![input], vec![sm])),
            );
            let estimated_withdrawal_cents =
                estimated_withdrawal_cents(self, unlocked_amount, locked_bps).await?;
            let withdrawal_meta_gen =
                move |out_point_range: OutPointRange| StabilityPoolMeta::Withdrawal {
                    txid: out_point_range.txid,
                    outpoints: out_point_range.into_iter().collect(),
                    unlocked_amount,
                    locked_bps,
                    estimated_withdrawal_cents,
                };
            let out_point_range = self
                .client_ctx
                .finalize_and_submit_transaction(
                    operation_id,
                    StabilityPoolCommonGen::KIND.as_str(),
                    withdrawal_meta_gen,
                    tx,
                )
                .await?;
            Ok((operation_id, out_point_range.txid))
        } else {
            submit_tx_with_intended_action(
                self,
                IntendedAction::CancelRenewal(CancelRenewal { bps: locked_bps }),
            )
            .await
        }
    }

    pub async fn subscribe_withdraw(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<UpdateStreamOrOutcome<StabilityPoolWithdrawalOperationState>> {
        let operation = stability_pool_operation(&self.client_ctx, operation_id).await?;
        let operation_meta = operation.meta::<StabilityPoolMeta>();
        let mut operation_stream = self.notifier.subscribe(operation_id).await.peekable();
        let module = self.clone();

        Ok(
            self.client_ctx.outcome_or_updates(operation, operation_id, move || {
                stream! {
                    match operation_meta {
                        StabilityPoolMeta::Deposit { .. } => {
                            yield StabilityPoolWithdrawalOperationState::InvalidOperationType;
                            return
                        },
                        StabilityPoolMeta::CancelRenewal { .. } => {
                            // There was only locked balance to withdraw, so we start
                            // with a cancellation TX followed by a TX to withdraw unlocked
                            // amount.
                            match next_cancel_locked_state(&mut operation_stream).await {
                                StabilityPoolCancelLockedState::Created => {
                                    yield StabilityPoolWithdrawalOperationState::CancellationInitiated(None);
                                },
                                s => panic!("Unexpected state {s:?}"),
                            }

                            match next_cancel_locked_state(&mut operation_stream).await {
                                StabilityPoolCancelLockedState::Accepted => {
                                    yield StabilityPoolWithdrawalOperationState::CancellationAccepted(None);
                                },
                                StabilityPoolCancelLockedState::Rejected(reason) => {
                                    yield StabilityPoolWithdrawalOperationState::CancellationSubmissionFailure(reason);
                                    return
                                },
                                s => panic!("Unexpected state {s:?}"),
                            }

                            match next_cancel_locked_state(&mut operation_stream).await {
                                StabilityPoolCancelLockedState::Processed {
                                    withdraw_unlocked_amount,
                                    withdraw_unlocked_tx_id,
                                    withdraw_unlocked_outpoints,
                                } => {
                                    yield StabilityPoolWithdrawalOperationState::WithdrawIdleInitiated(withdraw_unlocked_amount);

                                    let tx_updates_stream = module.client_ctx.transaction_updates(operation_id);
                                    match tx_updates_stream.await.await_tx_accepted(withdraw_unlocked_tx_id).await {
                                        Ok(_) => yield StabilityPoolWithdrawalOperationState::WithdrawIdleAccepted(withdraw_unlocked_amount),
                                        Err(e) => {
                                            yield StabilityPoolWithdrawalOperationState::TxRejected(e);
                                            return
                                        },
                                    }

                                    match module.client_ctx.await_primary_module_outputs(
                                        operation_id,
                                        withdraw_unlocked_outpoints,
                                    ).await {
                                        Ok(()) => yield StabilityPoolWithdrawalOperationState::Success(withdraw_unlocked_amount),
                                        Err(e) => yield StabilityPoolWithdrawalOperationState::PrimaryOutputError(e.to_string()),
                                    }
                                },
                                StabilityPoolCancelLockedState::ProcessingError(reason) => {
                                    yield StabilityPoolWithdrawalOperationState::AwaitCycleTurnoverError(reason);
                                },
                                s => panic!("Unexpected state {s:?}"),
                            }
                        },
                        StabilityPoolMeta::Withdrawal { outpoints, unlocked_amount, .. } => {
                            // There was unlocked balance, and possibly locked balance, to withdraw.
                            // So we start with a TX to withdraw unlocked balance. Then we may or may not
                            // have a full cancellation processing flow (which ends with another TX to
                            // withdraw unlocked balance).

                            match next_withdraw_unlocked_state(&mut operation_stream).await {
                                StabilityPoolWithdrawUnlockedState::Created => {
                                    yield StabilityPoolWithdrawalOperationState::WithdrawUnlockedInitiated(unlocked_amount);
                                },
                                s => panic!("Unexpected state {s:?}"),
                            }

                            // When locked_bps != 0, StabilityPoolCancelLockedState::Created is emitted
                            // within the state transition from StabilityPoolWithdrawUnlockedState::Created to
                            // StabilityPoolWithdrawUnlockedState::Accepted/Rejected. So it's not deterministic whether
                            // we see StabilityPoolCancelLockedState::Created or StabilityPoolWithdrawUnlockedState::Accepted/Rejected
                            // first.
                            let premature_cancel_locked_update = match Pin::new(&mut operation_stream).peek().await {
                                Some(StabilityPoolStateMachines::WithdrawUnlocked(_)) => false,
                                Some(StabilityPoolStateMachines::CancelLocked(_)) => {
                                    yield StabilityPoolWithdrawalOperationState::CancellationInitiated(Some(unlocked_amount));
                                    true
                                },
                                None => return,
                            };

                            match next_withdraw_unlocked_state(&mut operation_stream).await {
                                StabilityPoolWithdrawUnlockedState::Accepted { maybe_cancellation_tx_id: Some(_) } => {
                                    yield StabilityPoolWithdrawalOperationState::WithdrawUnlockedAccepted(unlocked_amount);

                                    if let Err(e) = module.client_ctx.await_primary_module_outputs(
                                        operation_id,
                                        outpoints,
                                    ).await {
                                        yield StabilityPoolWithdrawalOperationState::PrimaryOutputError(e.to_string());
                                        return
                                    }

                                    if !premature_cancel_locked_update {
                                        match next_cancel_locked_state(&mut operation_stream).await {
                                            StabilityPoolCancelLockedState::Created => {
                                                yield StabilityPoolWithdrawalOperationState::CancellationInitiated(Some(unlocked_amount));
                                            },
                                            s => panic!("Unexpected state {s:?}"),
                                        }
                                    }

                                    match next_cancel_locked_state(&mut operation_stream).await {
                                        StabilityPoolCancelLockedState::Accepted => {
                                            yield StabilityPoolWithdrawalOperationState::CancellationAccepted(Some(unlocked_amount));
                                        },
                                        StabilityPoolCancelLockedState::Rejected(reason) => {
                                            yield StabilityPoolWithdrawalOperationState::CancellationSubmissionFailure(reason);
                                            return
                                        },
                                        s => panic!("Unexpected state {s:?}"),
                                    }

                                    match next_cancel_locked_state(&mut operation_stream).await {
                                        StabilityPoolCancelLockedState::Processed {
                                            withdraw_unlocked_amount,
                                            withdraw_unlocked_tx_id,
                                            withdraw_unlocked_outpoints,
                                        } => {
                                            yield StabilityPoolWithdrawalOperationState::WithdrawIdleInitiated(unlocked_amount + withdraw_unlocked_amount);

                                            let tx_updates_stream = module.client_ctx.transaction_updates(operation_id);
                                            match tx_updates_stream.await.await_tx_accepted(withdraw_unlocked_tx_id).await {
                                                Ok(_) => yield StabilityPoolWithdrawalOperationState::WithdrawIdleAccepted(unlocked_amount + withdraw_unlocked_amount),
                                                Err(e) => {
                                                    yield StabilityPoolWithdrawalOperationState::TxRejected(e);
                                                    return
                                                },
                                            }

                                            match module.client_ctx.await_primary_module_outputs(
                                                operation_id,
                                                withdraw_unlocked_outpoints,
                                            ).await {
                                                Ok(()) => yield StabilityPoolWithdrawalOperationState::Success(unlocked_amount + withdraw_unlocked_amount),
                                                Err(e) => yield StabilityPoolWithdrawalOperationState::PrimaryOutputError(e.to_string()),
                                            }
                                        },
                                        StabilityPoolCancelLockedState::ProcessingError(reason) => {
                                            yield StabilityPoolWithdrawalOperationState::AwaitCycleTurnoverError(reason);
                                        },
                                        s => panic!("Unexpected state {s:?}"),
                                    }
                                },
                                StabilityPoolWithdrawUnlockedState::Accepted { maybe_cancellation_tx_id: None } => {
                                    yield StabilityPoolWithdrawalOperationState::WithdrawUnlockedAccepted(unlocked_amount);

                                    match module.client_ctx.await_primary_module_outputs(
                                        operation_id,
                                        outpoints,
                                    ).await {
                                        Ok(()) => yield StabilityPoolWithdrawalOperationState::Success(unlocked_amount),
                                        Err(e) => yield StabilityPoolWithdrawalOperationState::PrimaryOutputError(e.to_string()),
                                    }
                                },
                                StabilityPoolWithdrawUnlockedState::Rejected(reason) => {
                                    yield StabilityPoolWithdrawalOperationState::TxRejected(reason)
                                },
                                s => panic!("Unexpected state {s:?}"),
                            }
                        },
                    };
                }
            }),
        )
    }
}

async fn stability_pool_operation(
    client_ctx: &ClientContext<StabilityPoolClientModule>,
    operation_id: OperationId,
) -> anyhow::Result<OperationLogEntry> {
    let operation = client_ctx.get_operation(operation_id).await?;

    if operation.operation_module_kind() != StabilityPoolCommonGen::KIND.as_str() {
        bail!("Operation is not a stability pool operation");
    }

    Ok(operation)
}

async fn submit_tx_with_intended_action(
    module: &StabilityPoolClientModule,
    intended_action: IntendedAction,
) -> anyhow::Result<(OperationId, TransactionId)> {
    let operation_id = OperationId::new_random();
    let client_ctx = &module.client_ctx;
    let client_pub_key = module.client_key_pair.public_key();
    let stability_pool_output =
        StabilityPoolOutput::new_v0(client_pub_key, intended_action.clone());

    let out_point_range = match intended_action {
        IntendedAction::Seek(Seek(amount)) | IntendedAction::Provide(Provide { amount, .. }) => {
            let output = ClientOutputBundle::new(
                vec![ClientOutput {
                    amount,
                    output: stability_pool_output,
                }],
                vec![ClientOutputSM {
                    state_machines: Arc::new(move |_| Vec::<StabilityPoolStateMachines>::new()),
                }],
            );
            let tx = TransactionBuilder::new().with_outputs(client_ctx.make_client_outputs(output));
            let deposit_meta_gen = move |idx_range: OutPointRange| StabilityPoolMeta::Deposit {
                txid: idx_range.txid,
                change_outpoints: idx_range.into_iter().collect(),
                amount,
            };
            client_ctx
                .finalize_and_submit_transaction(
                    operation_id,
                    StabilityPoolCommonGen::KIND.as_str(),
                    deposit_meta_gen,
                    tx,
                )
                .await?
        }
        IntendedAction::CancelRenewal(CancelRenewal { bps }) => {
            let output = ClientOutputBundle::new(
                vec![ClientOutput {
                    amount: Amount::ZERO,
                    output: stability_pool_output,
                }],
                vec![ClientOutputSM {
                    state_machines: Arc::new(move |out_point_range| {
                        vec![StabilityPoolStateMachines::CancelLocked(
                            StabilityPoolCancelLockedStateMachine {
                                operation_id,
                                transaction_id: out_point_range.txid(),
                                state: StabilityPoolCancelLockedState::Created,
                            },
                        )]
                    }),
                }],
            );
            let tx = TransactionBuilder::new().with_outputs(client_ctx.make_client_outputs(output));
            let estimated_withdrawal_cents =
                estimated_withdrawal_cents(module, Amount::ZERO, bps).await?;
            let cancellation_meta_gen =
                move |out_point_range: OutPointRange| StabilityPoolMeta::CancelRenewal {
                    txid: out_point_range.txid,
                    bps,
                    estimated_withdrawal_cents,
                };
            client_ctx
                .finalize_and_submit_transaction(
                    operation_id,
                    StabilityPoolCommonGen::KIND.as_str(),
                    cancellation_meta_gen,
                    tx,
                )
                .await?
        }
        IntendedAction::UndoCancelRenewal => bail!("Not yet supported"),
    };
    Ok((operation_id, out_point_range.txid))
}

async fn estimated_withdrawal_cents(
    module: &StabilityPoolClientModule,
    unlocked_amount: Amount,
    locked_bps: u32,
) -> anyhow::Result<u64> {
    let current_price = module.cycle_start_price().await?;
    let unlocked_amount_cents = if unlocked_amount != Amount::ZERO {
        amount_to_cents(unlocked_amount, current_price.into())
    } else {
        0
    };

    let locked_amount_cents = if locked_bps != 0 {
        let account_info = module.account_info(true).await?.account_info;
        let estimated_total_locked_cents: u64 = account_info
            .locked_seeks
            .iter()
            .map(|l| {
                if let Some(metadata) = account_info.seeks_metadata.get(&l.staged_txid) {
                    metadata.initial_amount_cents
                        - metadata.withdrawn_amount_cents
                        - amount_to_cents(metadata.fees_paid_so_far, current_price.into())
                } else {
                    0
                }
            })
            .sum();
        estimated_total_locked_cents * (locked_bps as u64) / (BPS_UNIT as u64)
    } else {
        0
    };

    Ok(unlocked_amount_cents + locked_amount_cents)
}

async fn await_tx_accepted(
    global_context: DynGlobalClientContext,
    transaction_id: TransactionId,
) -> Result<(), String> {
    global_context.await_tx_accepted(transaction_id).await
}

async fn await_cancellation_processed(
    context: StabilityPoolClientContext,
) -> Result<Amount, String> {
    loop {
        match context.module.wait_cancellation_processed().await {
            Ok(amount) => break Ok(amount),
            Err(e) => {
                e.report_if_unusual("awaiting cancellation");
                fedimint_core::task::sleep(Duration::from_secs(10)).await
            }
        }
    }
}

async fn claim_idle_balance_input(
    dbtx: &mut ClientSMDatabaseTransaction<'_, '_>,
    global_context: DynGlobalClientContext,
    context: StabilityPoolClientContext,
    old_state: StabilityPoolCancelLockedStateMachine,
    idle_balance: Amount,
) -> StabilityPoolCancelLockedStateMachine {
    let input = ClientInput {
        amount: idle_balance,
        input: StabilityPoolInput::new_v0(
            context.module.client_key_pair.public_key(),
            idle_balance,
        ),
        keys: vec![context.module.client_key_pair],
    };
    let state_machines = ClientInputSM {
        state_machines: Arc::new(move |_| Vec::<StabilityPoolStateMachines>::new()),
    };

    let out_point_range = global_context
        .claim_inputs(
            dbtx,
            ClientInputBundle::new(vec![input], vec![state_machines]),
        )
        .await
        .expect("Cannot claim input, additional funding needed");

    StabilityPoolCancelLockedStateMachine {
        operation_id: old_state.operation_id,
        transaction_id: old_state.transaction_id,
        state: StabilityPoolCancelLockedState::Processed {
            withdraw_unlocked_amount: idle_balance,
            withdraw_unlocked_tx_id: out_point_range.txid,
            withdraw_unlocked_outpoints: out_point_range.into_iter().collect(),
        },
    }
}

async fn maybe_fund_cancellation_output(
    dbtx: &mut ClientSMDatabaseTransaction<'_, '_>,
    global_context: DynGlobalClientContext,
    context: StabilityPoolClientContext,
    old_state: StabilityPoolWithdrawUnlockedStateMachine,
) -> StabilityPoolWithdrawUnlockedStateMachine {
    StabilityPoolWithdrawUnlockedStateMachine {
        operation_id: old_state.operation_id,
        transaction_id: old_state.transaction_id,
        state: match old_state.maybe_cancel_locked_bps {
            Some(bps) => {
                let output = ClientOutputBundle::new(
                    vec![ClientOutput {
                        amount: Amount::ZERO,
                        output: StabilityPoolOutput::new_v0(
                            context.module.client_key_pair.public_key(),
                            IntendedAction::CancelRenewal(CancelRenewal { bps }),
                        ),
                    }],
                    vec![ClientOutputSM {
                        state_machines: Arc::new(move |out_point_range| {
                            vec![StabilityPoolStateMachines::CancelLocked(
                                StabilityPoolCancelLockedStateMachine {
                                    operation_id: old_state.operation_id,
                                    transaction_id: out_point_range.txid(),
                                    state: StabilityPoolCancelLockedState::Created,
                                },
                            )]
                        }),
                    }],
                );

                match global_context.fund_output(dbtx, output).await {
                    Ok(out_point_range) => StabilityPoolWithdrawUnlockedState::Accepted {
                        maybe_cancellation_tx_id: Some(out_point_range.txid),
                    },
                    Err(e) => StabilityPoolWithdrawUnlockedState::Rejected(e.to_string()),
                }
            }
            None => StabilityPoolWithdrawUnlockedState::Accepted {
                maybe_cancellation_tx_id: None,
            },
        },
        maybe_cancel_locked_bps: old_state.maybe_cancel_locked_bps,
    }
}

async fn next_withdraw_unlocked_state<S>(stream: &mut S) -> StabilityPoolWithdrawUnlockedState
where
    S: Stream<Item = StabilityPoolStateMachines> + Unpin,
{
    loop {
        if let StabilityPoolStateMachines::WithdrawUnlocked(sm) =
            stream.next().await.expect("Stream must have next")
        {
            return sm.state;
        }
        tokio::task::yield_now().await;
    }
}

async fn next_cancel_locked_state<S>(stream: &mut S) -> StabilityPoolCancelLockedState
where
    S: Stream<Item = StabilityPoolStateMachines> + Unpin,
{
    loop {
        if let StabilityPoolStateMachines::CancelLocked(sm) =
            stream.next().await.expect("Stream must have next")
        {
            return sm.state;
        }
        tokio::task::yield_now().await;
    }
}
