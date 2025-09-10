use std::collections::BTreeMap;
use std::ops::Not;
use std::sync::Arc;
use std::{ffi, iter};

use anyhow::bail;
use async_stream::stream;
use clap::{Parser, ValueEnum};
use common::config::StabilityPoolClientConfig;
use common::{
    LiquidityStats, ProvideRequest, SeekRequest, StabilityPoolCommonGen, StabilityPoolInput,
    StabilityPoolModuleTypes, StabilityPoolOutput,
};
use db::RecordedTransferItemKey;
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
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::util::backoff_util::background_backoff;
use fedimint_core::{Amount, OutPoint, TransactionId, apply, async_trait_maybe_send};
use fedimint_derive_secret::DerivableSecret;
use futures::{Stream, StreamExt};
use rand::Rng;
use secp256k1::{Keypair, Secp256k1, schnorr};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
pub use stability_pool_common as common;
use stability_pool_common::{
    Account, AccountId, AccountType, ActiveDeposits, DepositToProvideOutput, DepositToSeekOutput,
    FeeRate, FiatAmount, FiatOrAll, KIND, SignedTransferRequest, StabilityPoolInputV0,
    StabilityPoolOutputV0, TransferOutput, TransferRequest, TransferRequestId,
    UnlockForWithdrawalInput, UnlockRequestStatus, WithdrawalInput,
};
use tracing::info;

pub mod api;
pub mod db;
mod history_service;
mod sync_service;

pub use history_service::StabilityPoolHistoryService;
pub use sync_service::StabilityPoolSyncService;

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
            module_root_secret: args.module_root_secret().to_owned(),
            module_api: args.module_api().clone(),
            client_ctx: args.context(),
            notifier: args.notifier().clone(),
            db: args.db().clone(),
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
    pub client_ctx: ClientContext<Self>,
    notifier: ModuleNotifier<StabilityPoolStateMachine>,
    db: Database,
    module_root_secret: DerivableSecret,
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
    type States = StabilityPoolStateMachine;
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
        let command = CliCommand::parse_from(
            iter::once(&ffi::OsString::from("stability-pool")).chain(args.iter()),
        );

        match command {
            CliCommand::Pubkey => Ok(serde_json::to_value(self.client_key_pair.public_key())?),

            CliCommand::AccountInfo { account_type } => {
                let sync_service = StabilityPoolSyncService::new(
                    self.module_api.clone(),
                    self.db.clone(),
                    self.our_account(account_type.into()).id(),
                )
                .await;
                let mut update_stream = sync_service.subscribe_to_updates();
                sync_service.update_once().await?;
                let sync_response = update_stream
                    .next()
                    .await
                    .unwrap()
                    .expect("must be present after calling update once");
                Ok(serde_json::to_value(sync_response.value)?)
            }

            CliCommand::ActiveDeposits { account_type } => {
                let account_id = self.our_account(account_type.into()).id();
                let active_deposits = self.active_deposits(account_id).await?;
                Ok(serde_json::to_value(active_deposits)?)
            }

            CliCommand::DepositToSeek { amount_msats } => {
                let operation_id = self.deposit_to_seek(amount_msats, ()).await?;
                let mut updates = self
                    .subscribe_deposit_operation(operation_id)
                    .await?
                    .into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolDepositOperationState::TxRejected(e) => {
                            bail!("TX rejected: {e}")
                        }
                        StabilityPoolDepositOperationState::PrimaryOutputError(e) => {
                            bail!("Change output error: {e}")
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String(
                    "deposit-to-seek success".to_string(),
                ))
            }

            CliCommand::DepositToProvide {
                amount_msats,
                fee_rate,
            } => {
                let operation_id = self.deposit_to_provide(amount_msats, fee_rate, ()).await?;
                let mut updates = self
                    .subscribe_deposit_operation(operation_id)
                    .await?
                    .into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolDepositOperationState::TxRejected(e) => {
                            bail!("TX rejected: {e}")
                        }
                        StabilityPoolDepositOperationState::PrimaryOutputError(e) => {
                            bail!("Change output error: {e}")
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String(
                    "deposit-to-provide success".to_string(),
                ))
            }

            CliCommand::Withdraw {
                account_type,
                amount,
            } => {
                let (operation_id, _) = self.withdraw(account_type.into(), amount, ()).await?;
                let mut updates = self.subscribe_withdraw(operation_id).await?.into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolWithdrawalOperationState::UnlockTxRejected(e) => {
                            bail!("Unlock TX rejected: {e}")
                        }
                        StabilityPoolWithdrawalOperationState::UnlockProcessingError(e) => {
                            bail!("Unlock processing error: {e}")
                        }
                        StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e) => {
                            bail!("Withdrawal TX rejected: {e}")
                        }
                        StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => {
                            bail!("Primary output error: {e}")
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String("withdraw success".to_string()))
            }

            CliCommand::SignTransfer { request } => {
                Ok(serde_json::to_value(self.sign_transfer_request(&request))?)
            }

            CliCommand::SimpleTransfer { to_account, amount } => {
                let request = TransferRequest::new(
                    rand::thread_rng().r#gen(),
                    self.our_account(AccountType::Seeker),
                    amount,
                    to_account,
                    vec![],
                    u64::MAX,
                    None,
                )?;

                let signature = self.sign_transfer_request(&request);
                let mut signatures = BTreeMap::new();
                signatures.insert(0, signature);

                Ok(serde_json::to_value(SignedTransferRequest::new(
                    request, signatures,
                )?)?)
            }

            CliCommand::Transfer { request } => {
                let operation_id = self.transfer(request, ()).await?;
                let mut updates = self
                    .subscribe_transfer_operation(operation_id)
                    .await?
                    .into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolTransferOperationState::TxRejected(e) => {
                            bail!("TX rejected: {e}")
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String("transfer success".to_string()))
            }

            CliCommand::WithdrawIdleBalance {
                account_type,
                amount_msats,
            } => {
                let (operation_id, _) = self
                    .withdraw_idle_balance(account_type.into(), amount_msats, ())
                    .await?;
                let mut updates = self
                    .subscribe_withdraw_idle_balance(operation_id)
                    .await?
                    .into_stream();

                while let Some(update) = updates.next().await {
                    match update {
                        StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e) => {
                            bail!("Withdrawal TX rejected: {e}")
                        }
                        StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => {
                            bail!("Primary output error: {e}")
                        }
                        _ => info!("Update: {:?}", update),
                    }
                }

                Ok(serde_json::Value::String(
                    "withdraw idle balance success".to_string(),
                ))
            }
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub enum StabilityPoolStateMachine {
    Withdrawal(StabilityPoolWithdrawalStateMachine),
}

impl IntoDynInstance for StabilityPoolStateMachine {
    type DynType = DynState;

    fn into_dyn(self, instance_id: ModuleInstanceId) -> Self::DynType {
        DynState::from_typed(instance_id, self)
    }
}

impl State for StabilityPoolStateMachine {
    type ModuleContext = StabilityPoolClientContext;

    fn transitions(
        &self,
        context: &Self::ModuleContext,
        global_context: &DynGlobalClientContext,
    ) -> Vec<StateTransition<Self>> {
        match self {
            StabilityPoolStateMachine::Withdrawal(sm) => sm_enum_variant_translation!(
                sm.transitions(context, global_context),
                StabilityPoolStateMachine::Withdrawal
            ),
        }
    }

    fn operation_id(&self) -> OperationId {
        match self {
            StabilityPoolStateMachine::Withdrawal(sm) => sm.operation_id(),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub struct StabilityPoolWithdrawalStateMachine {
    pub account: Account,
    pub operation_id: OperationId,
    pub transaction_id: TransactionId,
    pub state: StabilityPoolWithdrawalState,
}

#[derive(Debug, Clone, Eq, PartialEq, Decodable, Encodable, Hash)]
pub enum StabilityPoolWithdrawalState {
    Created,
    Accepted,
    Rejected(String),
    Processed {
        withdrawal_amount: Amount,
        withdrawal_tx_id: TransactionId,
        withdrawal_outpoints: Vec<OutPoint>,
    },
    ProcessingError(String),
}

impl State for StabilityPoolWithdrawalStateMachine {
    type ModuleContext = StabilityPoolClientContext;

    fn transitions(
        &self,
        context: &Self::ModuleContext,
        global_context: &DynGlobalClientContext,
    ) -> Vec<StateTransition<Self>> {
        let context = context.clone();
        let global_context = global_context.clone();
        match self.state {
            StabilityPoolWithdrawalState::Created => vec![StateTransition::new(
                await_tx_accepted(global_context.clone(), self.transaction_id),
                move |_, result, old_state: StabilityPoolWithdrawalStateMachine| match result {
                    Ok(_) => Box::pin(async move {
                        StabilityPoolWithdrawalStateMachine {
                            account: old_state.account,
                            operation_id: old_state.operation_id,
                            transaction_id: old_state.transaction_id,
                            state: StabilityPoolWithdrawalState::Accepted,
                        }
                    }),
                    Err(reason) => Box::pin(async move {
                        StabilityPoolWithdrawalStateMachine {
                            account: old_state.account,
                            operation_id: old_state.operation_id,
                            transaction_id: old_state.transaction_id,
                            state: StabilityPoolWithdrawalState::Rejected(reason),
                        }
                    }),
                },
            )],
            StabilityPoolWithdrawalState::Accepted => vec![StateTransition::new(
                await_unlock_request_processed(context.clone(), self.account.clone()),
                move |dbtx, result, old_state: StabilityPoolWithdrawalStateMachine| match result {
                    Ok(idle_balance) => Box::pin(claim_idle_balance_input(
                        dbtx,
                        global_context.clone(),
                        context.clone(),
                        old_state,
                        idle_balance,
                    )),
                    Err(reason) => Box::pin(async move {
                        StabilityPoolWithdrawalStateMachine {
                            account: old_state.account,
                            operation_id: old_state.operation_id,
                            transaction_id: old_state.transaction_id,
                            state: StabilityPoolWithdrawalState::ProcessingError(reason),
                        }
                    }),
                },
            )],
            StabilityPoolWithdrawalState::Rejected(_) => vec![], // terminal state
            StabilityPoolWithdrawalState::Processed { .. } => vec![], // terminal state
            StabilityPoolWithdrawalState::ProcessingError(_) => vec![], // terminal state
        }
    }

    fn operation_id(&self) -> OperationId {
        self.operation_id
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StabilityPoolMeta {
    /// Deposit given amount for seeking or providing
    Deposit {
        txid: TransactionId,
        change_outpoints: Vec<OutPoint>,
        amount: Amount,
        #[serde(default)]
        extra_meta: serde_json::Value,
    },
    /// Submit request to transfer given FiatAmount (or all) between two
    /// accounts.
    Transfer {
        txid: TransactionId,
        signed_request: SignedTransferRequest,
        #[serde(default)]
        extra_meta: serde_json::Value,
    },
    /// Submit a request to unlock the given FiatAmount (or all) followed by
    /// another TX to withdraw the unlocked idle balance.
    Withdrawal {
        txid: TransactionId,
        unlock_amount: FiatOrAll,
        #[serde(default)]
        extra_meta: serde_json::Value,
    },
    /// Withdraw accumulated idle balance.
    WithdrawIdleBalance {
        txid: TransactionId,
        amount: Amount,
        outpoints: Vec<OutPoint>,
        #[serde(default)]
        extra_meta: serde_json::Value,
    },
    /// A stable balance transfer where we are the receiver but we were not the
    /// submitter of the transaction. We become aware of the finalized
    /// transaction through server-side account history. We only store the TXID
    /// here. The rest of the details can be looked up in the local
    /// UserOperationHistory.
    ExternalTransferIn { txid: TransactionId },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StabilityPoolWithdrawalOperationState {
    Initiated,
    UnlockTxAccepted,
    UnlockTxRejected(String),
    UnlockProcessingError(String),
    WithdrawalInitiated(Amount),
    WithdrawalTxAccepted(Amount),
    WithdrawalTxRejected(String),
    PrimaryOutputError(String),
    Success(Amount),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StabilityPoolDepositOperationState {
    Initiated,
    TxAccepted,
    TxRejected(String),
    PrimaryOutputError(String),
    Success,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StabilityPoolTransferOperationState {
    Initiated,
    Success,
    TxRejected(String),
}

impl StabilityPoolClientModule {
    pub fn our_account(&self, acc_type: AccountType) -> Account {
        Account::single(self.client_key_pair.public_key(), acc_type)
    }

    /// Derive the secret for a given multispend group.
    pub fn derive_multispend_group_key(&self, group_id: String) -> Keypair {
        let secret_bytes: [u8; 32] = self.module_root_secret.to_random_bytes();
        let derived_secret = DerivableSecret::new_root(&secret_bytes, group_id.as_bytes());
        derived_secret.to_secp_key(secp256k1::SECP256K1)
    }

    /// Returns the average of the provider fee rate over the last #num_cycles
    /// cycles, including the current ongoing cycle. So if num_cycles is 1, we
    /// return the fee rate of the current ongoing cycle. If num_cycles is 2, we
    /// average the current cycle and previous cycle. If num_cyces is n, we
    /// average the current cycle and (n - 1) previous cycles.
    pub async fn average_fee_rate(
        &self,
        num_cycles: u64,
    ) -> anyhow::Result<FeeRate, FederationError> {
        self.module_api
            .request_current_consensus(
                "average_fee_rate".to_string(),
                ApiRequestErased::new(num_cycles),
            )
            .await
    }

    pub async fn active_deposits(
        &self,
        account_id: AccountId,
    ) -> anyhow::Result<ActiveDeposits, FederationError> {
        self.module_api
            .request_current_consensus(
                "active_deposits".to_string(),
                ApiRequestErased::new(account_id),
            )
            .await
    }

    /// Returns the current provider liquidity stats of the federation,
    /// including total free and used-up liquidity.
    pub async fn liquidity_stats(&self) -> anyhow::Result<LiquidityStats, FederationError> {
        self.module_api
            .request_current_consensus("liquidity_stats".to_string(), ApiRequestErased::default())
            .await
    }

    pub async fn unlock_request_status(
        &self,
        account_id: AccountId,
    ) -> anyhow::Result<UnlockRequestStatus, FederationError> {
        self.module_api
            .request_current_consensus(
                "unlock_request_status".to_string(),
                ApiRequestErased::new(account_id),
            )
            .await
    }

    pub async fn deposit_to_seek(
        &self,
        amount: Amount,
        extra_meta: impl Serialize + Clone + MaybeSend + MaybeSync + 'static,
    ) -> anyhow::Result<OperationId> {
        let (operation_id, _) = submit_tx_with_output(
            self,
            StabilityPoolOutputV0::DepositToSeek(DepositToSeekOutput {
                account_id: self.our_account(AccountType::Seeker).id(),
                seek_request: SeekRequest(amount),
            }),
            extra_meta,
        )
        .await?;
        Ok(operation_id)
    }

    pub async fn deposit_to_provide(
        &self,
        amount: Amount,
        min_fee_rate: FeeRate,
        extra_meta: impl Serialize + Clone + MaybeSend + MaybeSync + 'static,
    ) -> anyhow::Result<OperationId> {
        let (operation_id, _) = submit_tx_with_output(
            self,
            StabilityPoolOutputV0::DepositToProvide(DepositToProvideOutput {
                account_id: self.our_account(AccountType::Provider).id(),
                provide_request: ProvideRequest {
                    amount,
                    min_fee_rate,
                },
            }),
            extra_meta,
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
            _ => bail!("Operation is not of type deposit"),
        };

        let client_ctx = self.client_ctx.clone();
        Ok(
            self.client_ctx.outcome_or_updates(operation, operation_id, move || {
                stream! {
                    yield StabilityPoolDepositOperationState::Initiated;

                    let tx_updates_stream = client_ctx.transaction_updates(operation_id);
                    match tx_updates_stream.await.await_tx_accepted(txid).await {
                        Ok(_) => yield StabilityPoolDepositOperationState::TxAccepted,
                        Err(e) => {
                            yield StabilityPoolDepositOperationState::TxRejected(e);
                            return;
                        },
                    }

                    if change_outpoints.is_empty() {
                        yield StabilityPoolDepositOperationState::Success;
                        return;
                    }

                    match client_ctx.await_primary_module_outputs(operation_id, change_outpoints).await {
                        Ok(_) => yield StabilityPoolDepositOperationState::Success,
                        Err(e) => yield StabilityPoolDepositOperationState::PrimaryOutputError(e.to_string()),
                    }
                }
            }),
        )
    }

    pub fn sign_transfer_request(&self, request: &TransferRequest) -> schnorr::Signature {
        let message = secp256k1::Message::from(&TransferRequestId::from(request));
        self.client_key_pair.sign_schnorr(message)
    }

    pub async fn transfer(
        &self,
        signed_request: SignedTransferRequest,
        extra_meta: impl Serialize + Clone + MaybeSend + MaybeSync + 'static,
    ) -> anyhow::Result<OperationId> {
        let transfer_output = TransferOutput { signed_request };

        let (operation_id, txid) = submit_tx_with_output(
            self,
            StabilityPoolOutputV0::Transfer(transfer_output),
            extra_meta,
        )
        .await?;

        // Record this transfer locally since we are the one initiating it. We assume
        // that our seeker-type account is the one involved in this transfer, either as
        // sender or receiver.
        let mut dbtx = self.db.begin_transaction().await;
        dbtx.insert_entry(
            &RecordedTransferItemKey {
                account_id: self.our_account(AccountType::Seeker).id(),
                txid,
            },
            &operation_id,
        )
        .await;
        dbtx.commit_tx().await;
        Ok(operation_id)
    }

    pub async fn subscribe_transfer_operation(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<UpdateStreamOrOutcome<StabilityPoolTransferOperationState>> {
        let operation = stability_pool_operation(&self.client_ctx, operation_id).await?;
        let txid = match operation.meta::<StabilityPoolMeta>() {
            StabilityPoolMeta::Transfer { txid, .. } => txid,
            _ => bail!("Operation is not of type transfer"),
        };

        let client_ctx = self.client_ctx.clone();
        Ok(self
            .client_ctx
            .outcome_or_updates(operation, operation_id, move || {
                stream! {
                    yield StabilityPoolTransferOperationState::Initiated;

                    let tx_updates_stream = client_ctx.transaction_updates(operation_id);
                    match tx_updates_stream.await.await_tx_accepted(txid).await {
                        Ok(_) => yield StabilityPoolTransferOperationState::Success,
                        Err(e) => yield StabilityPoolTransferOperationState::TxRejected(e),
                    }
                }
            }))
    }

    pub async fn withdraw(
        &self,
        acc_type: AccountType,
        unlock_amount: FiatOrAll,
        extra_meta: impl Serialize + Clone + MaybeSend + MaybeSync + 'static,
    ) -> anyhow::Result<(OperationId, TransactionId)> {
        if let FiatOrAll::Fiat(amount) = unlock_amount {
            if amount.0 == 0 {
                bail!("Withdrawal amount must be non-0");
            }
        }

        let operation_id = OperationId::new_random();

        let account = self.our_account(acc_type);
        let input = ClientInput {
            amount: Amount::ZERO,
            input: StabilityPoolInput::V0(StabilityPoolInputV0::UnlockForWithdrawal(
                UnlockForWithdrawalInput {
                    account: account.clone(),
                    amount: unlock_amount,
                },
            )),
            keys: vec![self.client_key_pair],
        };
        let sm = ClientInputSM {
            state_machines: Arc::new(move |out_point_range| {
                vec![StabilityPoolStateMachine::Withdrawal(
                    StabilityPoolWithdrawalStateMachine {
                        account: account.clone(),
                        operation_id,
                        transaction_id: out_point_range.txid(),
                        state: StabilityPoolWithdrawalState::Created,
                    },
                )]
            }),
        };
        let tx = TransactionBuilder::new().with_inputs(
            self.client_ctx
                .make_client_inputs(ClientInputBundle::new(vec![input], vec![sm])),
        );
        let withdrawal_meta_gen =
            move |out_point_range: OutPointRange| StabilityPoolMeta::Withdrawal {
                txid: out_point_range.txid,
                unlock_amount,
                extra_meta: serde_json::to_value(extra_meta.clone())
                    .expect("to value must never fail"),
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
    }

    pub async fn subscribe_withdraw(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<UpdateStreamOrOutcome<StabilityPoolWithdrawalOperationState>> {
        let operation = stability_pool_operation(&self.client_ctx, operation_id).await?;
        if matches!(
            operation.meta::<StabilityPoolMeta>(),
            StabilityPoolMeta::Withdrawal { .. }
        )
        .not()
        {
            bail!("Operation is not of type withdrawal");
        }

        let mut operation_stream = self.notifier.subscribe(operation_id).await.peekable();
        let client_ctx = self.client_ctx.clone();

        Ok(self
            .client_ctx
            .outcome_or_updates(operation, operation_id, move || {
                stream! {
                    match next_withdrawal_state(&mut operation_stream).await {
                        StabilityPoolWithdrawalState::Created => {
                            yield StabilityPoolWithdrawalOperationState::Initiated;
                        },
                        s => panic!("Unexpected state {s:?}"),
                    }

                    match next_withdrawal_state(&mut operation_stream).await {
                        StabilityPoolWithdrawalState::Accepted => {
                            yield StabilityPoolWithdrawalOperationState::UnlockTxAccepted;
                        },
                        StabilityPoolWithdrawalState::Rejected(reason) => {
                            yield StabilityPoolWithdrawalOperationState::UnlockTxRejected(reason);
                            return;
                        },
                        s => panic!("Unexpected state {s:?}"),
                    }

                    match next_withdrawal_state(&mut operation_stream).await {
                        StabilityPoolWithdrawalState::Processed {
                            withdrawal_amount, withdrawal_tx_id, withdrawal_outpoints
                        } => {
                            yield StabilityPoolWithdrawalOperationState::WithdrawalInitiated(withdrawal_amount);

                            let tx_updates_stream = client_ctx.transaction_updates(operation_id);
                            match tx_updates_stream.await.await_tx_accepted(withdrawal_tx_id).await {
                               Ok(_) => yield StabilityPoolWithdrawalOperationState::WithdrawalTxAccepted(withdrawal_amount),
                               Err(e) => {
                                   yield StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e);
                                   return;
                               },
                            }

                            match client_ctx.await_primary_module_outputs(
                               operation_id,
                               withdrawal_outpoints,
                            ).await {
                               Ok(()) => yield StabilityPoolWithdrawalOperationState::Success(withdrawal_amount),
                               Err(e) => yield StabilityPoolWithdrawalOperationState::PrimaryOutputError(e.to_string()),
                            }
                        },
                        StabilityPoolWithdrawalState::ProcessingError(reason) => {
                            yield StabilityPoolWithdrawalOperationState::UnlockProcessingError(reason);
                            return;
                        },
                        s => panic!("Unexpected state {s:?}"),
                    }
                }
            }))
    }

    pub async fn withdraw_idle_balance(
        &self,
        acc_type: AccountType,
        amount: Amount,
        extra_meta: impl Serialize + Clone + MaybeSend + MaybeSync + 'static,
    ) -> anyhow::Result<(OperationId, TransactionId)> {
        if amount == Amount::ZERO {
            bail!("Withdrawal amount must be non-0");
        }

        let operation_id = OperationId::new_random();

        let account = self.our_account(acc_type);
        let input = ClientInput {
            amount,
            input: StabilityPoolInput::V0(StabilityPoolInputV0::Withdrawal(WithdrawalInput {
                account: account.clone(),
                amount,
            })),
            keys: vec![self.client_key_pair],
        };
        let sm = ClientInputSM {
            state_machines: Arc::new(move |_| Vec::<StabilityPoolStateMachine>::new()),
        };
        let tx = TransactionBuilder::new().with_inputs(
            self.client_ctx
                .make_client_inputs(ClientInputBundle::new(vec![input], vec![sm])),
        );
        let withdrawal_meta_gen =
            move |out_point_range: OutPointRange| StabilityPoolMeta::WithdrawIdleBalance {
                txid: out_point_range.txid,
                amount,
                outpoints: out_point_range.into_iter().collect(),
                extra_meta: serde_json::to_value(extra_meta.clone())
                    .expect("to value must never fail"),
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
    }

    pub async fn subscribe_withdraw_idle_balance(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<UpdateStreamOrOutcome<StabilityPoolWithdrawalOperationState>> {
        let operation = stability_pool_operation(&self.client_ctx, operation_id).await?;
        let (txid, amount, outpoints) = match operation.meta::<StabilityPoolMeta>() {
            StabilityPoolMeta::WithdrawIdleBalance {
                txid,
                amount,
                outpoints,
                ..
            } => (txid, amount, outpoints),
            _ => bail!("Operation is not of type withdraw idle balance"),
        };

        let client_ctx = self.client_ctx.clone();
        Ok(
            self.client_ctx.outcome_or_updates(operation, operation_id, move || {
                stream! {
                    yield StabilityPoolWithdrawalOperationState::WithdrawalInitiated(amount);

                    let tx_updates_stream = client_ctx.transaction_updates(operation_id);
                    match tx_updates_stream.await.await_tx_accepted(txid).await {
                        Ok(_) => yield StabilityPoolWithdrawalOperationState::WithdrawalTxAccepted(amount),
                        Err(e) => {
                            yield StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e);
                            return;
                        },
                    }

                    match client_ctx.await_primary_module_outputs(operation_id, outpoints).await {
                        Ok(_) => yield StabilityPoolWithdrawalOperationState::Success(amount),
                        Err(e) => yield StabilityPoolWithdrawalOperationState::PrimaryOutputError(e.to_string()),
                    }
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

async fn submit_tx_with_output(
    module: &StabilityPoolClientModule,
    output_v0: StabilityPoolOutputV0,
    extra_meta: impl Serialize + Clone + MaybeSend + MaybeSync + 'static,
) -> anyhow::Result<(OperationId, TransactionId)> {
    let operation_id = OperationId::new_random();
    let client_ctx = &module.client_ctx;
    let amount = match output_v0 {
        StabilityPoolOutputV0::DepositToSeek(ref output) => output.seek_request.0,
        StabilityPoolOutputV0::DepositToProvide(ref output) => output.provide_request.amount,
        StabilityPoolOutputV0::Transfer(_) => Amount::ZERO,
    };
    let output = ClientOutputBundle::new(
        vec![ClientOutput {
            amount,
            output: StabilityPoolOutput::V0(output_v0.clone()),
        }],
        vec![ClientOutputSM {
            state_machines: Arc::new(move |_| Vec::<StabilityPoolStateMachine>::new()),
        }],
    );
    let tx = TransactionBuilder::new().with_outputs(client_ctx.make_client_outputs(output));
    let meta_gen = move |out_point_range: OutPointRange| match output_v0.clone() {
        StabilityPoolOutputV0::Transfer(output) => StabilityPoolMeta::Transfer {
            txid: out_point_range.txid,
            signed_request: output.signed_request,
            extra_meta: serde_json::to_value(extra_meta.clone()).expect("to value must never fail"),
        },
        StabilityPoolOutputV0::DepositToSeek(..) | StabilityPoolOutputV0::DepositToProvide(..) => {
            StabilityPoolMeta::Deposit {
                txid: out_point_range.txid,
                change_outpoints: out_point_range.into_iter().collect(),
                amount,
                extra_meta: serde_json::to_value(extra_meta.clone())
                    .expect("to value must never fail"),
            }
        }
    };
    let out_point_range = client_ctx
        .finalize_and_submit_transaction(
            operation_id,
            StabilityPoolCommonGen::KIND.as_str(),
            meta_gen,
            tx,
        )
        .await?;
    Ok((operation_id, out_point_range.txid))
}

async fn await_tx_accepted(
    global_context: DynGlobalClientContext,
    transaction_id: TransactionId,
) -> Result<(), String> {
    global_context.await_tx_accepted(transaction_id).await
}

async fn await_unlock_request_processed(
    context: StabilityPoolClientContext,
    account: Account,
) -> Result<Amount, String> {
    let cycle_duration = context.module.cfg.cycle_duration;
    let mut backoff = background_backoff();
    loop {
        match context.module.unlock_request_status(account.id()).await {
            Ok(UnlockRequestStatus::NoActiveRequest { idle_balance }) => break Ok(idle_balance),
            Ok(UnlockRequestStatus::Pending {
                next_cycle_start_time,
                ..
            }) => {
                let sleep_duration = next_cycle_start_time
                    .duration_since(fedimint_core::time::now())
                    .unwrap_or_else(|_| backoff.next().unwrap_or(cycle_duration));
                fedimint_core::task::sleep(sleep_duration).await
            }
            Err(e) => {
                e.report_if_unusual("unlock request processed");
                fedimint_core::task::sleep(backoff.next().unwrap_or(cycle_duration)).await
            }
        }
    }
}

async fn claim_idle_balance_input(
    dbtx: &mut ClientSMDatabaseTransaction<'_, '_>,
    global_context: DynGlobalClientContext,
    context: StabilityPoolClientContext,
    old_state: StabilityPoolWithdrawalStateMachine,
    idle_balance: Amount,
) -> StabilityPoolWithdrawalStateMachine {
    let input = ClientInput {
        amount: idle_balance,
        input: StabilityPoolInput::V0(StabilityPoolInputV0::Withdrawal(WithdrawalInput {
            account: old_state.account.clone(),
            amount: idle_balance,
        })),
        keys: vec![context.module.client_key_pair],
    };
    let state_machines = ClientInputSM {
        state_machines: Arc::new(move |_| Vec::<StabilityPoolStateMachine>::new()),
    };

    let out_point_range = global_context
        .claim_inputs(
            dbtx,
            ClientInputBundle::new(vec![input], vec![state_machines]),
        )
        .await
        .expect("Cannot claim input, additional funding needed");

    StabilityPoolWithdrawalStateMachine {
        account: old_state.account,
        operation_id: old_state.operation_id,
        transaction_id: old_state.transaction_id,
        state: StabilityPoolWithdrawalState::Processed {
            withdrawal_amount: idle_balance,
            withdrawal_tx_id: out_point_range.txid,
            withdrawal_outpoints: out_point_range.into_iter().collect(),
        },
    }
}

async fn next_withdrawal_state<S>(stream: &mut S) -> StabilityPoolWithdrawalState
where
    S: Stream<Item = StabilityPoolStateMachine> + Unpin,
{
    let StabilityPoolStateMachine::Withdrawal(sm) =
        stream.next().await.expect("Stream must have next");
    sm.state
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize, ValueEnum)]
pub enum AccountTypeArg {
    Seeker,
    Provider,
    BtcDepositor,
}

impl From<AccountTypeArg> for AccountType {
    fn from(arg: AccountTypeArg) -> Self {
        match arg {
            AccountTypeArg::Seeker => AccountType::Seeker,
            AccountTypeArg::Provider => AccountType::Provider,
            AccountTypeArg::BtcDepositor => AccountType::BtcDepositor,
        }
    }
}

fn parse_withdrawal_amount(s: &str) -> Result<FiatOrAll, String> {
    match s.to_lowercase().as_str() {
        "all" => Ok(FiatOrAll::All),
        amount => amount
            .parse::<u64>()
            .map(|fiat| FiatOrAll::Fiat(FiatAmount(fiat)))
            .map_err(|_| format!("Invalid withdrawal amount {amount}, must be \"all\" or a u64")),
    }
}

fn parse_json_value<T: DeserializeOwned>(s: &str) -> Result<T, serde_json::Error> {
    serde_json::from_str(s)
}

#[derive(Parser, Debug, Serialize)]
pub enum CliCommand {
    /// Get the public key of this client
    Pubkey,
    /// Get account info for seeker or provider account
    AccountInfo {
        #[arg(value_enum)]
        account_type: AccountTypeArg,
    },
    /// Get active deposits (staged and locked) for seeker or provider account
    ActiveDeposits {
        #[arg(value_enum)]
        account_type: AccountTypeArg,
    },
    /// Deposit amount to seek liquidity
    DepositToSeek {
        /// Amount in msats to deposit
        amount_msats: Amount,
    },
    /// Deposit amount to provide liquidity
    DepositToProvide {
        /// Amount in msats to deposit
        amount_msats: Amount,
        /// Fee rate in parts per billion
        #[arg(value_parser = parse_json_value::<FeeRate>)]
        fee_rate: FeeRate,
    },
    /// Withdraw from seeker or provider account
    Withdraw {
        #[arg(value_enum)]
        account_type: AccountTypeArg,
        #[arg(value_parser = parse_withdrawal_amount)]
        amount: FiatOrAll,
    },
    /// Sign a transfer request
    SignTransfer {
        #[arg(value_parser = parse_json_value::<TransferRequest>)]
        request: TransferRequest,
    },
    /// Convenience CLI command to get a signed transfer request for sending
    /// amount to given account
    SimpleTransfer {
        to_account: AccountId,
        #[arg(value_parser = parse_json_value::<FiatAmount>)]
        amount: FiatAmount,
    },
    /// Submit a signed transfer request
    Transfer {
        #[arg(value_parser = parse_json_value::<SignedTransferRequest>)]
        request: SignedTransferRequest,
    },
    /// Withdraw idle balance only. This is meant for a provider to sweep their
    /// earned fees, but may also be used by seeker in case of any errors with
    /// full withdrawal flow.
    WithdrawIdleBalance {
        #[arg(value_enum)]
        account_type: AccountTypeArg,
        amount_msats: Amount,
    },
}
