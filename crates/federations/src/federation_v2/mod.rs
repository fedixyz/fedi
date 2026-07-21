pub mod client;
pub mod db;
mod guardian_remittance;
mod ln_ops;
mod lnurl_receives_service;
mod meta;

use std::any::Any;
use std::collections::{BTreeMap, HashMap};
use std::fmt::Debug;
use std::future::Future;
use std::pin::pin;
use std::str::FromStr;
use std::sync::{Arc, Weak};
use std::time::Duration;

use ::serde::{Deserialize, Serialize};
use anyhow::{Context, Result, anyhow, bail, ensure};
use bitcoin::address::NetworkUnchecked;
use bitcoin::secp256k1::{self, PublicKey, schnorr};
use bitcoin::{Address, Network};
use bug_report::reused_ecash_proofs::SerializedReusedEcashProofs;
use client::ClientExt;
use db::{
    FediRawClientConfigKey, InviteCodeKey, LastStabilityPoolV2DepositCycleKey,
    LightningGatewayOverride, LightningGatewayOverrideKey, TransactionNotesKey,
};
use device_registration::DeviceRegistrationService;
use fedi_social_client::common::VerificationDocument;
use fedi_social_client::{
    FediSocialClientInit, RecoveryFile, RecoveryId, SOCIAL_RECOVERY_SECRET_CHILD_ID, SocialBackup,
    SocialRecoveryClient, SocialRecoveryState, SocialVerification, UserSeedPhrase,
};
use fedimint_api_client::api::{DynGlobalApi, DynModuleApi, FederationApiExt as _, StatusResponse};
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::backup::ClientBackup;
use fedimint_client::db::{CachedApiVersionSetKey, ChronologicalOperationLogKey};
use fedimint_client::meta::MetaService;
use fedimint_client::module::ClientModule;
use fedimint_client::module::meta::{FetchKind, MetaSource};
use fedimint_client::module::module::recovery::RecoveryProgress;
use fedimint_client::module::oplog::{OperationLogEntry, UpdateStreamOrOutcome};
use fedimint_client::secret::RootSecretStrategy;
use fedimint_client::{Client, ClientBuilder, ClientHandle};
use fedimint_connectors::ConnectorRegistry;
use fedimint_connectors::error::ServerError;
use fedimint_core::config::{ClientConfig, FederationId};
use fedimint_core::core::{ModuleKind, OperationId};
use fedimint_core::db::{
    AutocommitResultExt, Committable, Database, DatabaseTransaction,
    IDatabaseTransactionOpsCoreTyped,
};
use fedimint_core::encoding::Encodable;
use fedimint_core::invite_code::InviteCode;
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::module::{AmountUnit, ApiRequestErased, ApiVersion};
use fedimint_core::task::{MaybeSend, MaybeSync, TaskGroup, timeout};
use fedimint_core::timing::TimeReporter;
use fedimint_core::util::backoff_util::{aggressive_backoff, background_backoff};
use fedimint_core::util::{SafeUrl, retry};
use fedimint_core::{
    Amount, PeerId, TransactionId, apply, async_trait_maybe_send, maybe_add_send_sync,
};
use fedimint_derive_secret::{ChildId, DerivableSecret};
use fedimint_ln_client::incoming::IncomingSmError;
use fedimint_ln_client::pay::GatewayPayError;
use fedimint_ln_client::receive::LightningReceiveError;
use fedimint_ln_client::{
    InternalPayState, LightningClientInit, LnPayState, LnReceiveState, OutgoingLightningPayment,
    PayBolt11InvoiceError,
};
use fedimint_ln_common::LightningGateway;
use fedimint_meta_client::MetaModuleMetaSourceWithFallback;
use fedimint_mint_client::api::MintFederationApi;
use fedimint_mint_client::config::MintClientConfig;
use fedimint_mint_client::{MintClientInit, MintClientModule};
use fedimint_mintv2_client::MintClientModule as MintV2ClientModule;
use fedimint_wallet_client::{DepositStateV2, PegOutFees, WalletClientInit};
use fedimint_walletv2_client::WalletClientModule as WalletV2ClientModule;
use futures::{FutureExt, Stream, StreamExt};
use guardian_remittance::GuardianRemittanceAccount;
use lightning_invoice::{Bolt11Invoice, RoutingFees};
pub use ln_ops::LnOpsV1;
use lnurl_receives_service::LnurlReceivesService;
use meta::{LegacyMetaSourceWithExternalUrl, MetaEntries};
use rand::Rng;
use rpc_types::error::ErrorCode;
use rpc_types::event::{Event, RecoveryProgressEvent, TypedEventExt};
use rpc_types::matrix::RpcRoomId;
use rpc_types::spv2_transfer_meta::Spv2TransferTxMeta;
use rpc_types::{
    FrontendMetadata, GuardianStatus, OperationFediFeeStatus, RpcAmount, RpcEventId, RpcFederation,
    RpcFederationId, RpcFederationMaybeLoading, RpcFederationPreview, RpcFeeDetails,
    RpcGenerateEcashResponse, RpcGuardianRemittanceAccountInfo, RpcGuardianRemittanceDashboard,
    RpcJsonClientConfig, RpcLightningGateway, RpcLightningGatewayId, RpcOperationFediFeeStatus,
    RpcPayInvoiceResponse, RpcPeerId, RpcPrevPayInvoiceResult, RpcPublicKey,
    RpcReclaimLnReceiveOutcome, RpcReturningMemberStatus, RpcSPDepositState, RpcSPV2DepositState,
    RpcSPV2TransferInState, RpcSPV2TransferOutState, RpcSPV2WithdrawalState, RpcSPWithdrawState,
    RpcSPv2CachedSyncResponse, RpcTransaction, RpcTransactionDirection, RpcTransactionKind,
    RpcTransactionListEntry, SPv2DepositMetadata, SPv2TransferMetadata, SPv2WithdrawMetadata,
    SpMatrixTransferId, SpV2TransferInKind, SpV2TransferOutKind,
};
use runtime::bridge_runtime::Runtime;
use runtime::constants::{
    ECASH_INTERNAL_CHANGE_TIMEOUT_MAINNET, ECASH_INTERNAL_CHANGE_TIMEOUT_MUTINYNET,
    LIGHTNING_OPERATION_TYPE, LIGHTNINGV2_OPERATION_TYPE, MILLION, MINT_OPERATION_TYPE,
    MINTV2_OPERATION_TYPE, RECURRINGD_API_META, REISSUE_ECASH_TIMEOUT,
    STABILITY_POOL_OPERATION_TYPE, STABILITY_POOL_V2_OPERATION_TYPE, WALLET_OPERATION_TYPE,
    WALLETV2_OPERATION_TYPE,
};
use runtime::db::FederationPendingRejoinFromScratchKey;
use runtime::nightly_panic;
use runtime::storage::state::{
    DatabaseInfo, FederationInfo, FediFeeSchedule, FediGuardianFeeConfig,
};
use runtime::utils::{display_currency, timeout_log_only, to_unix_time};
use serde::de::DeserializeOwned;
use spv2_sweeper_service::SPv2SweeperService;
use stability_pool_client::api::StabilityPoolApiExt as _;
use stability_pool_client::common::{
    Account, AccountId, AccountType, FiatAmount, FiatOrAll, SignedTransferRequest, SyncResponse,
    TransferRequest, TransferRequestId,
};
use stability_pool_client::db::{
    CachedSyncResponseKey, CachedSyncResponseValue, SeekLifetimeFeeKey, UserOperationHistoryItem,
    UserOperationHistoryItemKey, UserOperationHistoryItemKind,
};
use stability_pool_client::{
    StabilityPoolClientInit, StabilityPoolDepositOperationState, StabilityPoolHistoryService,
    StabilityPoolMeta, StabilityPoolSyncService, StabilityPoolTransferOperationState,
    StabilityPoolWithdrawalOperationState,
};
use stability_pool_client_old::ClientAccountInfo;
use tokio::sync::{Mutex, OnceCell};
use tracing::{Level, error, info, instrument, warn};

use self::backup_service::BackupService;
#[allow(deprecated)]
use self::db::{
    LastStabilityPoolDepositCycleKey, OperationFediFeeStatusKey, OperationFediFeeStatusKeyPrefix,
    OutstandingFediFeesPerTXTypeKeyPrefix, PendingFediFeesPerTXTypeKeyPrefix,
    TransactionDateFiatInfoKey,
};
use self::ln_gateway_service::LnGatewayService;
use self::ln_ops::LnOpsRouter;
use self::mint_ops::{MintOpsV1, MintOpsV2};
use self::stability_pool_sweeper_service::StabilityPoolSweeperService;
use self::wallet_ops::WalletOpsV1;
use super::federations_locker::FederationLockGuard;
use crate::federation_v2::wallet_ops::WalletOpsV2;
use crate::fedi_fee::db::{
    AppFeeStreamStateInitializedKey, NextFediFeeRemittanceDueAtByStreamKey,
    OperationFediFeeStatusByStreamKey, OutstandingFediFeesByStreamKey,
    OutstandingFediFeesByStreamPerTXTypeKey, OutstandingFediFeesByStreamPerTXTypeKeyPrefix,
    PendingFediFeesByStreamKey, PendingFediFeesByStreamPerTXTypeKey,
    PendingFediFeesByStreamPerTXTypeKeyPrefix, TotalAccruedFediFeesByStreamKey,
};
use crate::fedi_fee::{
    FediFeeHelper, FediFeeRemittanceService, FediFeeStream, GuardianFeeRemittanceService,
    parse_fedi_guardian_fee_config,
};

// Trait for multispend notifications required by federation
#[apply(async_trait_maybe_send!)]
pub trait MultispendNotifications: MaybeSend + MaybeSync {
    async fn add_deposit_notification(
        &self,
        room: RpcRoomId,
        amount: FiatAmount,
        txid: TransactionId,
        description: String,
    );

    async fn add_withdrawal_notification(
        &self,
        room: RpcRoomId,
        request_id: RpcEventId,
        amount: FiatAmount,
        txid: TransactionId,
    );

    async fn add_failed_withdrawal_notification(
        &self,
        room: RpcRoomId,
        request_id: RpcEventId,
        error: String,
    );
}

#[apply(async_trait_maybe_send!)]
pub trait SptNotifications: MaybeSend + MaybeSync {
    async fn add_spt_completion_notification(
        &self,
        transfer_id: SpMatrixTransferId,
        federation_id: String,
        amount: FiatAmount,
        txid: TransactionId,
    );
    async fn add_spt_failed_notification(&self, transfer_id: SpMatrixTransferId);
}

mod backup_service;
mod ln_gateway_service;
mod mint_ops;
pub mod spv2_pay_address;
mod spv2_sweeper_service;
mod stability_pool_sweeper_service;
mod wallet_ops;

pub const GUARDIAN_STATUS_TIMEOUT: Duration = Duration::from_secs(10);
pub const GUARDIAN_STATUS_CACHE_TTL_SECS: u64 = 30;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FediConfig {
    pub client_config: ClientConfig,
}

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum PayState {
    Pay(LnPayState),
    Internal(InternalPayState),
}

pub(crate) struct FederationTransactionParts {
    pub amount: RpcAmount,
    pub kind: RpcTransactionKind,
    pub frontend_metadata: Option<FrontendMetadata>,
}

macro_rules! log_update {
    ($runtime:expr, $update:expr, $msg:literal, $sanitized:expr $(,)?) => {{
        if $runtime.sensitive_log().await {
            tracing::info!(update = ?$update, $msg);
        } else {
            tracing::info!(update_variant = %$sanitized, $msg);
        }
    }};
}
pub(crate) use log_update;

fn deposit_update_sanitized_log(update: &DepositStateV2) -> String {
    match update {
        DepositStateV2::WaitingForTransaction => "WaitingForTransaction".to_string(),
        DepositStateV2::WaitingForConfirmation { btc_deposited, .. } => {
            format!(
                "WaitingForConfirmation btc_deposited_sat={}",
                btc_deposited.to_sat()
            )
        }
        DepositStateV2::Confirmed { btc_deposited, .. } => {
            format!("Confirmed btc_deposited_sat={}", btc_deposited.to_sat())
        }
        DepositStateV2::Claimed { btc_deposited, .. } => {
            format!("Claimed btc_deposited_sat={}", btc_deposited.to_sat())
        }
        DepositStateV2::Failed(_) => "Failed".to_string(),
    }
}

fn lightning_receive_error_variant_name(reason: &LightningReceiveError) -> &'static str {
    match reason {
        LightningReceiveError::Rejected => "Rejected",
        LightningReceiveError::Timeout => "Timeout",
        LightningReceiveError::ClaimRejected => "ClaimRejected",
        LightningReceiveError::InvalidPreimage => "InvalidPreimage",
    }
}

fn ln_receive_update_sanitized_log(update: &LnReceiveState) -> String {
    match update {
        LnReceiveState::Created => "Created".to_string(),
        LnReceiveState::WaitingForPayment { timeout, .. } => {
            format!("WaitingForPayment timeout_secs={}", timeout.as_secs())
        }
        LnReceiveState::Funded => "Funded".to_string(),
        LnReceiveState::AwaitingFunds => "AwaitingFunds".to_string(),
        LnReceiveState::Claimed => "Claimed".to_string(),
        LnReceiveState::Canceled { reason } => {
            format!(
                "Canceled reason={}",
                lightning_receive_error_variant_name(reason)
            )
        }
    }
}

fn incoming_sm_error_variant_name(error: &IncomingSmError) -> &'static str {
    match error {
        IncomingSmError::ViolatedFeePolicy { .. } => "ViolatedFeePolicy",
        IncomingSmError::InvalidOffer { .. } => "InvalidOffer",
        IncomingSmError::TimeoutFetchingOffer { .. } => "TimeoutFetchingOffer",
        IncomingSmError::FetchContractError { .. } => "FetchContractError",
        IncomingSmError::InvalidPreimage { .. } => "InvalidPreimage",
        IncomingSmError::FailedToFundContract { .. } => "FailedToFundContract",
        IncomingSmError::AmountError { .. } => "AmountError",
    }
}

fn internal_pay_update_sanitized_log(update: &InternalPayState) -> String {
    match update {
        InternalPayState::Funding => "Funding".to_string(),
        InternalPayState::Preimage(_) => "Preimage".to_string(),
        InternalPayState::RefundSuccess { out_points, error } => {
            format!(
                "RefundSuccess out_points_count={} error_kind={}",
                out_points.len(),
                incoming_sm_error_variant_name(error)
            )
        }
        InternalPayState::RefundError {
            error_message: _,
            error,
        } => format!(
            "RefundError error_kind={}",
            incoming_sm_error_variant_name(error)
        ),
        InternalPayState::FundingFailed { error } => {
            format!(
                "FundingFailed error_kind={}",
                incoming_sm_error_variant_name(error)
            )
        }
        InternalPayState::UnexpectedError(_) => "UnexpectedError".to_string(),
    }
}

fn gateway_pay_error_variant_name(error: &GatewayPayError) -> (&'static str, Option<u16>) {
    match error {
        GatewayPayError::GatewayInternalError { error_code, .. } => {
            ("GatewayInternalError", *error_code)
        }
        GatewayPayError::OutgoingContractError => ("OutgoingContractError", None),
    }
}

fn ln_pay_update_sanitized_log(update: &LnPayState) -> String {
    match update {
        LnPayState::Created => "Created".to_string(),
        LnPayState::Canceled => "Canceled".to_string(),
        LnPayState::Funded { block_height } => format!("Funded block_height={block_height}"),
        LnPayState::WaitingForRefund { .. } => "WaitingForRefund".to_string(),
        LnPayState::AwaitingChange => "AwaitingChange".to_string(),
        LnPayState::Success { .. } => "Success".to_string(),
        LnPayState::Refunded { gateway_error } => {
            let (kind, code) = gateway_pay_error_variant_name(gateway_error);
            format!("Refunded gateway_error_kind={kind} gateway_error_code={code:?}")
        }
        LnPayState::UnexpectedError { .. } => "UnexpectedError".to_string(),
    }
}

pub fn invite_code_from_client_confing(config: &ClientConfig) -> InviteCode {
    let (peer, endpoint) = config
        .global
        .api_endpoints
        .iter()
        .next()
        .expect("client config must have one api endpoint");

    InviteCode::new(
        endpoint.url.clone(),
        *peer,
        config.global.calculate_federation_id(),
        None, // FIXME: api secret
    )
}

impl std::fmt::Debug for FederationV2 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Federation")
            .field("id", &self.client.federation_id())
            .finish()
    }
}

/// Federation is a wrapper of "client ng" to assist with handling RPC commands
pub struct FederationV2 {
    pub runtime: Arc<Runtime>,
    pub client: ClientHandle,
    pub task_group: TaskGroup,
    pub operation_states: Mutex<HashMap<OperationId, Box<maybe_add_send_sync!(dyn Any + 'static)>>>,
    // DerivableSecret used for non-client usecases like LNURL and Nostr etc
    pub auxiliary_secret: DerivableSecret,
    // Helper object to retrieve the schedule used for charging Fedi's fee for different types of
    // transactions.
    pub fedi_fee_helper: Arc<FediFeeHelper>,
    pub backup_service: BackupService,
    pub fedi_fee_remittance_service: OnceCell<FediFeeRemittanceService>,
    pub guardian_fee_remittance_service: OnceCell<GuardianFeeRemittanceService>,
    pub recovering: bool,
    ln_ops: Box<dyn ln_ops::LnOps>,
    mint_ops: Box<dyn mint_ops::MintOps>,
    wallet_ops: Box<dyn wallet_ops::WalletOps>,
    pub gateway_service: OnceCell<LnGatewayService>,
    pub stability_pool_sweeper_service: OnceCell<StabilityPoolSweeperService>,
    // Mutex that is held within spending functions to ensure that virtual balance doesn't become
    // negative. That is, two concurrent spends don't accidentally spend more than the virtual
    // balance would allow. We hold the mutex over a span that covers the time of check (recording
    // virtual balance) and the time of use (spending ecash and recording fee).
    pub spend_guard: Mutex<()>,
    // Mutex to prevent concurrent generate_ecash because logic is very fragile.
    pub generate_ecash_lock: Mutex<()>,
    pub this_weak: Weak<Self>,
    pub guard: FederationLockGuard,
    // Stability pool v2 services for syncing accout history between client and server
    pub spv2_sync_service: OnceCell<StabilityPoolSyncService>,
    pub spv2_history_service: OnceCell<StabilityPoolHistoryService>,
    pub guardian_remittance_account: OnceCell<GuardianRemittanceAccount>,
    pub spv2_sweeper_service: OnceCell<SPv2SweeperService>,
    pub multispend_services: Arc<dyn MultispendNotifications>,
    pub lnurl_receives_service: OnceCell<LnurlReceivesService>,
    /// Cache for guardian status to prevent spamming servers
    #[allow(clippy::type_complexity)]
    pub guardian_status_cache:
        Mutex<Option<(std::time::SystemTime, Result<Vec<GuardianStatus>, String>)>>,
    pub spt_notifications: Arc<dyn SptNotifications>,
}

/// Info about a federation fetching during preview. it is used during joining
/// to avoid fetching it again
pub struct FederationPrefetchedInfo {
    pub(crate) federation_id: FederationId,
    client_config: ClientConfig,
    backup: Option<ClientBackup>,
    invite_code: InviteCode,
}

impl FederationV2 {
    /// Instantiate Federation from FediConfig
    async fn build_client_builder() -> anyhow::Result<ClientBuilder> {
        let mut client_builder = fedimint_client::Client::builder().await?;
        client_builder.with_meta_service(MetaService::new(MetaModuleMetaSourceWithFallback::new(
            LegacyMetaSourceWithExternalUrl::default(),
        )));
        client_builder.with_module(MintClientInit);
        client_builder.with_module(fedimint_mintv2_client::MintClientInit);
        client_builder.with_module(LightningClientInit::default());
        client_builder.with_module(fedimint_lnv2_client::LightningClientInit::default());
        client_builder.with_module(WalletClientInit(None));
        client_builder.with_module(fedimint_walletv2_client::WalletClientInit);
        client_builder.with_module(FediSocialClientInit);
        client_builder.with_module(StabilityPoolClientInit);
        client_builder.with_module(stability_pool_client_old::StabilityPoolClientInit);
        let client_builder = client_builder
            .with_iroh_enable_dht(false)
            .with_iroh_enable_next(false);
        Ok(client_builder)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn new(
        runtime: Arc<Runtime>,
        client: ClientHandle,
        guard: FederationLockGuard,
        auxiliary_secret: DerivableSecret,
        fedi_fee_helper: Arc<FediFeeHelper>,
        multispend_services: Arc<dyn MultispendNotifications>,
        spt_notifications: Arc<dyn SptNotifications>,
        device_registration_service: Arc<DeviceRegistrationService>,
    ) -> Arc<Self> {
        let recovering = client.has_pending_recoveries();
        // Lightning is the odd one out. Kind-one federations have mintv1,
        // walletv1, lnv1, and lnv2; kind-two federations have mintv2,
        // walletv2, and lnv2. Keep all lightning dispatch/fallback rules in
        // one router.
        let ln_ops: Box<dyn ln_ops::LnOps> = Box::new(LnOpsRouter);
        let client_config = client.config().await;
        let has_mintv2 = client_config
            .modules
            .values()
            .any(|config| config.is_kind(&MintV2ClientModule::kind()));
        let has_walletv2 = client_config
            .modules
            .values()
            .any(|config| config.is_kind(&WalletV2ClientModule::kind()));
        let mint_ops: Box<dyn mint_ops::MintOps> = if has_mintv2 {
            Box::new(MintOpsV2)
        } else {
            Box::new(MintOpsV1)
        };
        let wallet_ops: Box<dyn wallet_ops::WalletOps> = if has_walletv2 {
            Box::new(WalletOpsV2)
        } else {
            Box::new(WalletOpsV1)
        };
        Arc::new_cyclic(|weak| Self {
            task_group: runtime.task_group.make_subgroup(),
            runtime,
            operation_states: Default::default(),
            auxiliary_secret,
            fedi_fee_helper,
            backup_service: BackupService::new(device_registration_service),
            fedi_fee_remittance_service: OnceCell::new(),
            guardian_fee_remittance_service: OnceCell::new(),
            recovering,
            ln_ops,
            mint_ops,
            wallet_ops,
            gateway_service: OnceCell::new(),
            stability_pool_sweeper_service: OnceCell::new(),
            client,
            spend_guard: Default::default(),
            generate_ecash_lock: Default::default(),
            this_weak: weak.clone(),
            guard,
            multispend_services,
            spt_notifications,
            spv2_sync_service: Default::default(),
            spv2_history_service: Default::default(),
            guardian_remittance_account: Default::default(),
            spv2_sweeper_service: Default::default(),
            lnurl_receives_service: Default::default(),
            guardian_status_cache: Mutex::new(None),
        })
    }

    pub fn spawn_cancellable<Fut>(
        &self,
        task: impl Into<String>,
        f: impl FnOnce(Arc<Self>) -> Fut + MaybeSend + 'static,
    ) where
        Fut: Future + MaybeSend + 'static,
        Fut::Output: MaybeSend + 'static,
    {
        let weak = self.this_weak.clone();
        self.task_group.spawn_cancellable(task, async move {
            let Some(this) = weak.upgrade() else {
                return;
            };
            f(this).await;
        });
    }

    async fn start_background_tasks_if_ready(&self) {
        if self.recovering() {
            return;
        }
        self.start_background_tasks().await;
    }

    /// Starts a bunch of async tasks and ensures username is
    /// saved to db.
    async fn start_background_tasks(&self) {
        self.subscribe_balance_updates().await;
        self.spawn_cancellable("backup_service", move |fed| async move {
            fed.backup_service.run_continuously(&fed.client).await;
        });
        self.initialize_app_fee_stream_state().await;
        self.migrate_legacy_gateway_override().await;

        if self
            .gateway_service
            .set(LnGatewayService::new(self))
            .is_err()
        {
            error!("ln gateway service already initialized");
        }

        // This needs to be initialized after LnGatewayService since remitting fees
        // happens through lightning and we need a gateway for that.
        if self
            .fedi_fee_remittance_service
            .set(FediFeeRemittanceService::init(self))
            .is_err()
        {
            error!("fedi fee remittance service already initialized");
        }

        if self
            .guardian_fee_remittance_service
            .set(GuardianFeeRemittanceService::init(self))
            .is_err()
        {
            error!("guardian fee remittance service already initialized");
        }

        // Replay existing operations only after fee/remittance services are
        // initialized, so recovered in-flight fee remittances can hand off to
        // their reconciliation services immediately.
        self.subscribe_to_all_operations().await;

        let cached_meta = self.get_cached_meta().await;
        self.sync_guardian_fee_config_from_meta(&cached_meta).await;

        self.spawn_cancellable("send_meta_updates", |fed| async move {
            fed.client.meta_service().wait_initialization().await;
            let meta = fed.get_cached_meta().await;
            fed.sync_guardian_fee_config_from_meta(&meta).await;
            fed.send_federation_event().await;
            let mut subscribe_to_updates = pin!(fed.client.meta_service().subscribe_to_updates());
            while subscribe_to_updates.next().await.is_some() {
                let meta = fed.get_cached_meta().await;
                fed.sync_guardian_fee_config_from_meta(&meta).await;
                fed.send_federation_event().await;
            }
        });

        // If SPv2 is enabled and the module is available, we initialize the sync
        // service and the history service.
        if let Ok(spv2) = self.client.spv2() {
            let account = spv2.our_account(AccountType::Seeker);
            if self
                .spv2_sync_service
                .set(
                    StabilityPoolSyncService::new(spv2.api.clone(), spv2.db.clone(), account.id())
                        .await,
                )
                .is_err()
            {
                error!("spv2 sync service already initialized");
            }

            if self
                .spv2_history_service
                .set(StabilityPoolHistoryService::new(
                    spv2.client_ctx.clone(),
                    spv2.api.clone(),
                    account.id(),
                ))
                .is_err()
            {
                error!("spv2 history service already initialized");
            }

            self.spawn_cancellable("spv2_sync", |fed| async move {
                let sync_service = fed.spv2_sync_service.get().expect("init above");
                let config = &fed.client.spv2().expect("checked above").cfg;
                sync_service.update_continuously(config).await
            });
            self.spawn_cancellable("spv2_history", |fed| async move {
                let sync_service = fed.spv2_sync_service.get().expect("init above");
                let history_service = fed.spv2_history_service.get().expect("init above");
                history_service.update_continuously(sync_service).await
            });

            if self.guardian_remittance_account_enabled().await
                && let Err(error) = self.start_guardian_remittance_account().await
            {
                error!(?error, "failed to initialize guardian remittance subsystem");
            }

            #[cfg(not(feature = "test-support"))]
            if self
                .spv2_sweeper_service
                .set(SPv2SweeperService::new(self))
                .is_err()
            {
                error!("spv2 sweeper service already initialized");
            }
        } else {
            #[cfg(not(feature = "test-support"))]
            if self.client.sp().is_ok()
                && self
                    .stability_pool_sweeper_service
                    .set(StabilityPoolSweeperService::new(self))
                    .is_err()
            {
                error!("stability pool sweeper service already initialized");
            }
        }

        if self
            .lnurl_receives_service
            .set(LnurlReceivesService::new(self))
            .is_err()
        {
            error!("lnurl receives service already initialized");
        }
    }

    pub fn client_root_secret_from_root_mnemonic(
        root_mnemonic: &bip39::Mnemonic,
        federation_id: &FederationId,
        device_index: u8,
    ) -> DerivableSecret {
        let global_root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(root_mnemonic);
        get_default_client_secret(&global_root_secret, federation_id, device_index.into())
    }

    pub fn auxiliary_secret_from_root_mnemonic(
        root_mnemonic: &bip39::Mnemonic,
        federation_id: &FederationId,
        device_index: u8,
    ) -> DerivableSecret {
        let global_root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(root_mnemonic);
        get_default_auxiliary_secret(&global_root_secret, federation_id, device_index.into())
    }

    /// Instantiate Federation from FediConfig
    pub async fn from_db(
        runtime: Arc<Runtime>,
        federation_info: FederationInfo,
        guard: FederationLockGuard,
        fedi_fee_helper: Arc<FediFeeHelper>,
        multispend_services: Arc<dyn MultispendNotifications>,
        spt_notifications: Arc<dyn SptNotifications>,
        device_registration_service: Arc<DeviceRegistrationService>,
    ) -> anyhow::Result<Arc<Self>> {
        let root_mnemonic = runtime.app_state.root_mnemonic().await;
        let device_index = runtime.app_state.device_index().await;
        let federation_db = match &federation_info.database {
            DatabaseInfo::DatabaseName(db_name) => {
                runtime.storage.federation_database_v2(db_name).await?
            }
            DatabaseInfo::DatabasePrefix(prefix) => runtime
                .global_db
                .with_prefix(prefix.consensus_encode_to_vec()),
        };
        let client_builder = Self::build_client_builder().await?;
        let config = Client::get_config_from_db(&federation_db)
            .await
            .context("config not found in database")?;
        let federation_id = config.calculate_federation_id();

        let client = {
            info!("started federation loading");
            let _g = TimeReporter::new("federation loading").level(Level::INFO);
            client_builder
                .open(
                    runtime.connectors.clone(),
                    federation_db.clone(),
                    fedimint_client::RootSecret::Custom(
                        Self::client_root_secret_from_root_mnemonic(
                            &root_mnemonic,
                            &federation_id,
                            device_index,
                        ),
                    ),
                )
                .await?
        };
        let auxiliary_secret =
            Self::auxiliary_secret_from_root_mnemonic(&root_mnemonic, &federation_id, device_index);

        maybe_backfill_federation_network(&runtime, federation_id, &client).await;

        let federation = Self::new(
            runtime,
            client,
            guard,
            auxiliary_secret,
            fedi_fee_helper,
            multispend_services,
            spt_notifications,
            device_registration_service,
        )
        .await;
        federation.start_background_tasks_if_ready().await;
        Ok(federation)
    }

    pub async fn federation_preview(
        info: &FederationPrefetchedInfo,
        connectors: ConnectorRegistry,
    ) -> Result<RpcFederationPreview> {
        let api = DynGlobalApi::new(
            connectors.clone(),
            // TODO: change join logic to use FederationId v2
            info.client_config
                .global
                .api_endpoints
                .iter()
                .map(|(peer_id, peer_url)| (*peer_id, peer_url.url.clone()))
                .collect(),
            info.invite_code.api_secret().as_deref(),
        )?;

        let meta_source =
            MetaModuleMetaSourceWithFallback::new(LegacyMetaSourceWithExternalUrl::default());

        let meta = meta_source
            .fetch(&info.client_config, &api, FetchKind::Initial, None)
            .await?
            .values
            .into_iter()
            .map(|(k, v)| (k.0, v.0.to_string()))
            .collect();

        Ok(RpcFederationPreview {
            id: RpcFederationId(info.federation_id.to_string()),
            name: info
                .client_config
                .global
                .federation_name()
                .map(|x| x.to_owned())
                .unwrap_or(
                    info.client_config
                        .global
                        .calculate_federation_id()
                        .to_string()[0..8]
                        .to_string(),
                ),
            meta,
            invite_code: info.invite_code.to_string(),
            returning_member_status: match info.backup {
                Some(_) => RpcReturningMemberStatus::ReturningMember,
                None => RpcReturningMemberStatus::NewMember,
            },
        })
    }

    /// Download federation configs using an invite code. Save client config to
    /// correct database with Storage.
    #[allow(clippy::too_many_arguments)]
    pub async fn join(
        runtime: Arc<Runtime>,
        federation_id_string: String,
        info: FederationPrefetchedInfo,
        guard: FederationLockGuard,
        recover_from_scratch: bool,
        fedi_fee_helper: Arc<FediFeeHelper>,
        multispend_services: Arc<dyn MultispendNotifications>,
        spt_notifications: Arc<dyn SptNotifications>,
        device_registration_service: Arc<DeviceRegistrationService>,
    ) -> Result<Arc<Self>> {
        let db_prefix = runtime
            .app_state
            .new_federation_db_prefix()
            .await
            .context("failed to write AppState")?;
        let federation_db = runtime
            .global_db
            .with_prefix(db_prefix.consensus_encode_to_vec());
        let root_mnemonic = runtime.app_state.root_mnemonic().await;
        let device_index = runtime.app_state.device_index().await;

        // fedimint-client will add decoders
        let mut dbtx = federation_db.begin_transaction().await;
        let fedi_config = FediConfig {
            client_config: info.client_config.clone(),
        };
        dbtx.insert_entry(
            &FediRawClientConfigKey,
            &serde_json::to_string(&fedi_config)?,
        )
        .await;
        let invite_code_string = info.invite_code.to_string();
        dbtx.insert_entry(&InviteCodeKey, &invite_code_string).await;
        dbtx.commit_tx().await;

        let client_builder = Self::build_client_builder().await?;
        let federation_id = info.federation_id;
        let client_secret =
            fedimint_client::RootSecret::Custom(Self::client_root_secret_from_root_mnemonic(
                &root_mnemonic,
                &federation_id,
                device_index,
            ));
        let auxiliary_secret =
            Self::auxiliary_secret_from_root_mnemonic(&root_mnemonic, &federation_id, device_index);
        // restore from scratch is not used because it takes too much time.
        // FIXME: api secret
        let client_preview = client_builder
            .preview_with_existing_config(
                runtime.connectors.clone(),
                info.client_config.clone(),
                info.invite_code.api_secret(),
            )
            .await?;
        let client = if recover_from_scratch {
            info!("recovering from scratch");
            client_preview
                .recover(federation_db.clone(), client_secret, None)
                .await?
        } else if let Some(client_backup) = info.backup {
            // Ensure that rejoin attempt after nonce reuse check failure can never enter
            // this branch
            if runtime
                .bridge_db()
                .begin_transaction_nc()
                .await
                .get_value(&FederationPendingRejoinFromScratchKey {
                    invite_code_str: invite_code_string.clone(),
                })
                .await
                .is_some()
            {
                return Err(
                    ErrorCode::FederationPendingRejoinFromScratch(invite_code_string).into(),
                );
            }
            info!("backup found");
            client_preview
                .recover(federation_db.clone(), client_secret, Some(client_backup))
                .await?
        } else {
            info!("backup not found");
            // FIXME: api secret
            client_preview
                .join(federation_db.clone(), client_secret)
                .await?
        };
        let network = client.wallet().ok().map(|wallet| wallet.get_network());
        let this = Self::new(
            runtime.clone(),
            client,
            guard,
            auxiliary_secret,
            fedi_fee_helper,
            multispend_services,
            spt_notifications,
            device_registration_service,
        )
        .await;

        // If the phone dies here, it's still ok because the federation wouldn't
        // exist in the app_state, and we'd reattempt to join it. And the name of the
        // DB file is random so there shouldn't be any collisions.
        let fedi_fee_schedule = network
            .and_then(|n| this.fedi_fee_helper.maybe_latest_app_fee_schedule(n))
            .unwrap_or_default();
        let cached_meta = this.get_cached_meta().await;
        let guardian_fee_config = parse_fedi_guardian_fee_config(&cached_meta).ok().flatten();
        runtime
            .app_state
            .with_write_lock(|state| {
                let old_value = state.joined_federations.insert(
                    federation_id_string,
                    FederationInfo {
                        version: 2,
                        database: DatabaseInfo::DatabasePrefix(db_prefix),
                        fedi_fee_schedule,
                        guardian_fee_config,
                        guardian_remittance_account_enabled: false,
                        network,
                        join_timestamp_secs_since_epoch: Some(
                            fedimint_core::time::duration_since_epoch().as_secs(),
                        ),
                    },
                );
                assert!(old_value.is_none(), "must not override a federation");
            })
            .await?;
        this.start_background_tasks_if_ready().await;
        Ok(this)
    }

    /// Get federation ID
    pub fn federation_id(&self) -> FederationId {
        self.client.federation_id()
    }

    /// Get rpc federation ID
    pub fn rpc_federation_id(&self) -> RpcFederationId {
        RpcFederationId(self.federation_id().to_string())
    }

    /// Get full Fedi fee schedule. This is made to be infallible so that
    /// consumers can always get a valid fee schedule back.
    pub async fn fedi_fee_schedule(&self) -> FediFeeSchedule {
        self.fedi_fee_helper
            .get_app_fee_schedule(self.federation_id().to_string())
            .await
            .unwrap_or_default()
    }

    pub async fn guardian_fee_config(&self) -> Option<FediGuardianFeeConfig> {
        self.runtime
            .app_state
            .with_read_lock(|state| {
                state
                    .joined_federations
                    .get(&self.federation_id().to_string())
                    .and_then(|fed_info| fed_info.guardian_fee_config.clone())
            })
            .await
    }

    pub async fn guardian_remittance_account_enabled(&self) -> bool {
        self.runtime
            .app_state
            .with_read_lock(|state| {
                state
                    .joined_federations
                    .get(&self.federation_id().to_string())
                    .is_some_and(|fed_info| fed_info.guardian_remittance_account_enabled)
            })
            .await
    }

    async fn start_guardian_remittance_account(
        &self,
    ) -> anyhow::Result<&GuardianRemittanceAccount> {
        self.client.spv2()?;
        self.guardian_remittance_account
            .get_or_try_init(|| async { GuardianRemittanceAccount::new(self).await })
            .await
    }

    fn guardian_remittance_account(&self) -> anyhow::Result<&GuardianRemittanceAccount> {
        self.guardian_remittance_account
            .get()
            .context("guardian remittance account is not initialized")
    }

    // Fetch which network we're using
    pub fn get_network(&self) -> Option<Network> {
        if self.recovering() {
            None
        } else {
            Some(self.wallet_ops.get_network(self))
        }
    }

    /// Return federation name from meta, or take first 8 characters of
    /// federation ID
    pub fn federation_name(&self) -> String {
        self.client
            .get_config_meta("federation_name")
            .unwrap_or(self.federation_id().to_string()[0..8].to_string())
    }

    pub async fn get_cached_meta(&self) -> MetaEntries {
        let cfg_fetcher = async { self.client.config().await.global.meta.into_iter().collect() };

        // Wait at most 2s for very first meta fetching
        match timeout(
            Duration::from_secs(2),
            self.client.meta_service().entries(self.client.db()),
        )
        .await
        {
            Ok(Some(entries)) => entries,
            Ok(None) => cfg_fetcher.await,
            Err(_) => {
                warn!(
                    "Timeout when fetching meta for federation ID {}",
                    self.federation_id()
                );
                match self.client.meta_service().entries(self.client.db()).await {
                    Some(entries) => entries,
                    None => cfg_fetcher.await,
                }
            }
        }
    }

    async fn sync_guardian_fee_config_from_meta(&self, meta: &MetaEntries) {
        let parsed_config = match parse_fedi_guardian_fee_config(meta) {
            Ok(config) => config,
            Err(error) => {
                // Keep the last valid cached config on malformed meta. We only
                // clear the cache when guardian fee config is actually absent.
                // Guardians that want to disable new accrual while still
                // draining existing outstanding fee should set send_ppm = 0
                // rather than removing the config entirely.
                warn!(?error, "Invalid guardian fee config in federation meta");
                return;
            }
        };

        let federation_id = self.federation_id().to_string();
        if let Err(error) = self
            .runtime
            .app_state
            .with_write_lock(move |state| {
                if let Some(fed_info) = state.joined_federations.get_mut(&federation_id) {
                    fed_info.guardian_fee_config = parsed_config;
                }
            })
            .await
        {
            warn!(?error, "Failed to sync guardian fee config into app state");
        }
    }

    /// Seeds the stream-scoped app-fee keys from the legacy app-fee schema.
    /// This is intentionally one-way and idempotent: the method only copies
    /// legacy state into the stream-scoped keys when those keys are still
    /// absent.
    #[allow(deprecated)]
    async fn initialize_app_fee_stream_state(&self) {
        let stream = FediFeeStream::App;
        let outstanding_by_type = self
            .dbtx()
            .await
            .into_nc()
            .find_by_prefix(&OutstandingFediFeesPerTXTypeKeyPrefix)
            .await
            .collect::<Vec<_>>()
            .await;
        let pending_by_type = self
            .dbtx()
            .await
            .into_nc()
            .find_by_prefix(&PendingFediFeesPerTXTypeKeyPrefix)
            .await
            .collect::<Vec<_>>()
            .await;
        let total_accrued_by_type = self
            .dbtx()
            .await
            .into_nc()
            .find_by_prefix(&db::TotalAccruedFediFeesPerTXTypeKeyPrefix)
            .await
            .collect::<Vec<_>>()
            .await;
        let remittance_timestamps_by_type = self
            .dbtx()
            .await
            .into_nc()
            .find_by_prefix(&db::FediFeesRemittanceTimestampPerTXTypeKeyPrefix)
            .await
            .collect::<Vec<_>>()
            .await;
        let operation_statuses: Vec<(OperationFediFeeStatusKey, OperationFediFeeStatus)> = self
            .dbtx()
            .await
            .into_nc()
            .find_by_prefix(&OperationFediFeeStatusKeyPrefix)
            .await
            .collect::<Vec<_>>()
            .await;
        let fedi_fee_db = self.fedi_fee_db();
        let mut dbtx = fedi_fee_db.begin_transaction().await;
        if dbtx
            .get_value(&AppFeeStreamStateInitializedKey)
            .await
            .is_some()
        {
            return;
        }

        let outstanding_total = outstanding_by_type
            .iter()
            .fold(Amount::ZERO, |acc, (_, amount)| acc + *amount);
        let pending_total = pending_by_type
            .iter()
            .fold(Amount::ZERO, |acc, (_, amount)| acc + *amount);
        let total_accrued = total_accrued_by_type
            .iter()
            .fold(Amount::ZERO, |acc, (_, amount)| acc + *amount);
        let remittance_delay = Duration::from_secs(
            self.runtime
                .feature_catalog
                .fedi_fee
                .remittance_max_delay_secs
                .into(),
        );
        let next_due_at = remittance_timestamps_by_type
            .iter()
            .filter_map(|(_, last_remitted_at)| last_remitted_at.checked_add(remittance_delay))
            .min()
            .unwrap_or_else(|| fedimint_core::time::now() + remittance_delay);

        dbtx.insert_entry(&OutstandingFediFeesByStreamKey(stream), &outstanding_total)
            .await;
        dbtx.insert_entry(&PendingFediFeesByStreamKey(stream), &pending_total)
            .await;
        dbtx.insert_entry(&TotalAccruedFediFeesByStreamKey(stream), &total_accrued)
            .await;
        dbtx.insert_entry(&NextFediFeeRemittanceDueAtByStreamKey(stream), &next_due_at)
            .await;
        for (key, amount) in outstanding_by_type {
            dbtx.insert_entry(
                &OutstandingFediFeesByStreamPerTXTypeKey(stream, key.0, key.1),
                &amount,
            )
            .await;
        }
        for (key, amount) in pending_by_type {
            dbtx.insert_entry(
                &PendingFediFeesByStreamPerTXTypeKey(stream, key.0, key.1),
                &amount,
            )
            .await;
        }
        for (key, status) in operation_statuses {
            dbtx.insert_entry(
                &OperationFediFeeStatusByStreamKey(key.0, FediFeeStream::App),
                &status,
            )
            .await;
            dbtx.remove_entry(&key).await;
        }
        dbtx.insert_entry(&AppFeeStreamStateInitializedKey, &())
            .await;
        dbtx.commit_tx().await;
    }

    #[allow(deprecated)]
    async fn migrate_legacy_gateway_override(&self) {
        let mut dbtx = self.client.db().begin_transaction().await;
        let canonical_override = dbtx.get_value(&LightningGatewayOverrideKey).await;
        let legacy_v1_override = dbtx.get_value(&db::GatewayOverrideKey).await;
        match (canonical_override, legacy_v1_override) {
            (None, Some(pubkey)) => {
                dbtx.insert_entry(
                    &LightningGatewayOverrideKey,
                    &LightningGatewayOverride::Lnv1(pubkey),
                )
                .await;
                dbtx.remove_entry(&db::GatewayOverrideKey).await;
            }
            (Some(_), Some(_)) => {
                dbtx.remove_entry(&db::GatewayOverrideKey).await;
            }
            _ => {}
        }
        dbtx.commit_tx().await;
    }

    /// Create database transaction
    pub async fn dbtx(&self) -> DatabaseTransaction<'_, Committable> {
        self.client.db().begin_transaction().await
    }

    /// Returns the prefixed database view that owns stream-era fee state.
    pub fn fedi_fee_db(&self) -> Database {
        self.client
            .db()
            .with_prefix(vec![db::BridgeDbPrefix::FediFeePrefix as u8])
    }

    pub async fn select_gateway(&self) -> anyhow::Result<Option<LightningGateway>> {
        let gateway = self.gateway_service()?.select_gateway(&self.client).await?;
        Ok(gateway)
    }

    pub(crate) async fn select_gateway_with_override(
        &self,
        gateway_override: Option<PublicKey>,
    ) -> anyhow::Result<Option<LightningGateway>> {
        let gateway = self
            .gateway_service()?
            .select_gateway_with_override(&self.client, gateway_override)
            .await?;
        Ok(gateway)
    }

    async fn refresh_cache_and_select_gateway_excluding(
        &self,
        excluded_gateway_id: Option<secp256k1::PublicKey>,
    ) -> anyhow::Result<Option<LightningGateway>> {
        let gateway = self
            .gateway_service()?
            .refresh_cache_and_select_gateway_excluding(&self.client, excluded_gateway_id)
            .await?;
        Ok(gateway)
    }

    pub async fn balance_after_mint_fees(&self, raw_fedimint_balance: Amount) -> Amount {
        if self.recovering() {
            return Amount::ZERO;
        }
        let fedi_fee_sum = [FediFeeStream::App, FediFeeStream::Guardian]
            .into_iter()
            .map(|stream| async move {
                self.get_outstanding_fedi_fees_by_stream(stream).await
                    + self.get_pending_fedi_fees_by_stream(stream).await
            })
            .collect::<futures::stream::FuturesOrdered<_>>()
            .fold(Amount::ZERO, |acc, fee| async move { acc + fee })
            .await;
        if raw_fedimint_balance < fedi_fee_sum {
            warn!(
                "Fee {} is somehow greater than fm balance {} for federation {}",
                fedi_fee_sum,
                raw_fedimint_balance,
                self.federation_id()
            );
        }
        raw_fedimint_balance.saturating_sub(fedi_fee_sum)
    }

    /// Fetch balance
    pub async fn get_balance(&self) -> Amount {
        if self.recovering() {
            return Amount::ZERO;
        }
        self.balance_after_mint_fees(self.mint_ops.get_raw_balance(self).await)
            .await
    }

    pub async fn guardian_status_no_cache(&self) -> anyhow::Result<Vec<GuardianStatus>> {
        let futures =
            self.client
                .get_peer_urls()
                .await
                .into_iter()
                .map(|(peer_id, guardian)| async move {
                    let start = fedimint_core::time::now();
                    match timeout(
                        GUARDIAN_STATUS_TIMEOUT,
                        self.client
                            .api()
                            .request_single_peer_federation::<StatusResponse>(
                                "status".into(),
                                ApiRequestErased::default(),
                                peer_id,
                            ),
                    )
                    .await
                    {
                        Ok(Ok(_status_response)) => {
                            info!("Received guardian status response");
                            GuardianStatus::Online {
                                guardian: guardian.to_string(),
                                latency_ms: fedimint_core::time::now()
                                    .duration_since(start)
                                    .unwrap_or_default()
                                    .as_millis()
                                    .try_into()
                                    .unwrap_or(u32::MAX),
                            }
                        }
                        Ok(Err(error)) => {
                            info!("Guardian status request failed");
                            GuardianStatus::Error {
                                guardian: guardian.to_string(),
                                error: error.to_string(),
                            }
                        }
                        Err(elapsed) => {
                            info!("Guardian status request timed out");
                            GuardianStatus::Timeout {
                                guardian: guardian.to_string(),
                                elapsed: elapsed.to_string(),
                            }
                        }
                    }
                });
        let guardians_status = futures::future::join_all(futures).await;
        Ok(guardians_status)
    }

    pub async fn guardian_status(&self) -> anyhow::Result<Vec<GuardianStatus>> {
        let now = fedimint_core::time::now();

        // Check if we have a valid cached result
        {
            let cache = self.guardian_status_cache.lock().await;
            if let Some((cached_time, cached_result)) = &*cache {
                let age = now.duration_since(*cached_time).unwrap_or_default();
                if age.as_secs() < GUARDIAN_STATUS_CACHE_TTL_SECS {
                    // Return cached result (clone the error or success)
                    return match cached_result {
                        Ok(status) => Ok(status.clone()),
                        Err(e) => Err(anyhow::anyhow!("{}", e)),
                    };
                }
            }
        }

        // Cache is expired or doesn't exist, fetch new result
        let result = self.guardian_status_no_cache().await;

        // Cache the result (both success and error cases)
        {
            let mut cache = self.guardian_status_cache.lock().await;
            let cached_result = match &result {
                Ok(status) => Ok(status.clone()),
                Err(e) => Err(e.to_string()),
            };
            *cache = Some((now, cached_result));
        }

        result
    }

    /// Reads the outstanding fees for a given stream from the stream-scoped
    /// ledger.
    pub async fn get_outstanding_fedi_fees_by_stream(&self, stream: FediFeeStream) -> Amount {
        self.fedi_fee_db()
            .begin_transaction_nc()
            .await
            .get_value(&OutstandingFediFeesByStreamKey(stream))
            .await
            .unwrap_or(Amount::ZERO)
    }

    /// Reads the outstanding per-(module, tx_direction) breakdown for a given
    /// stream from the stream-scoped ledger.
    pub async fn get_outstanding_fedi_fees_per_tx_type_by_stream(
        &self,
        stream: FediFeeStream,
    ) -> Vec<(ModuleKind, RpcTransactionDirection, Amount)> {
        self.fedi_fee_db()
            .begin_transaction_nc()
            .await
            .find_by_prefix(&OutstandingFediFeesByStreamPerTXTypeKeyPrefix(stream))
            .await
            .map(|(key, amt)| (key.1, key.2, amt))
            .collect()
            .await
    }

    /// Reads the pending fees for a given stream from the stream-scoped
    /// ledger.
    pub async fn get_pending_fedi_fees_by_stream(&self, stream: FediFeeStream) -> Amount {
        self.fedi_fee_db()
            .begin_transaction_nc()
            .await
            .get_value(&PendingFediFeesByStreamKey(stream))
            .await
            .unwrap_or(Amount::ZERO)
    }

    /// Reads the pending per-(module, tx_direction) breakdown for a given
    /// stream from the stream-scoped ledger.
    pub async fn get_pending_fedi_fees_per_tx_type_by_stream(
        &self,
        stream: FediFeeStream,
    ) -> Vec<(ModuleKind, RpcTransactionDirection, Amount)> {
        self.fedi_fee_db()
            .begin_transaction_nc()
            .await
            .find_by_prefix(&PendingFediFeesByStreamPerTXTypeKeyPrefix(stream))
            .await
            .map(|(key, amt)| (key.1, key.2, amt))
            .collect()
            .await
    }

    async fn get_fee_ppms_by_stream(
        &self,
        module: ModuleKind,
        direction: RpcTransactionDirection,
    ) -> anyhow::Result<Vec<(FediFeeStream, u64)>> {
        let mut fee_ppms = Vec::with_capacity(2);
        for stream in [FediFeeStream::App, FediFeeStream::Guardian] {
            let fee_ppm = self
                .fedi_fee_helper
                .get_fee_ppm(
                    stream,
                    self.federation_id().to_string(),
                    module.clone(),
                    direction.clone(),
                )
                .await?;
            fee_ppms.push((stream, fee_ppm));
        }
        Ok(fee_ppms)
    }

    async fn get_fee_amounts_by_stream(
        &self,
        module: ModuleKind,
        direction: RpcTransactionDirection,
        amount: Amount,
    ) -> anyhow::Result<Vec<(FediFeeStream, Amount)>> {
        Ok(self
            .get_fee_ppms_by_stream(module, direction)
            .await?
            .into_iter()
            .map(|(stream, fee_ppm)| {
                (
                    stream,
                    Amount::from_msats((amount.msats * fee_ppm).div_ceil(MILLION)),
                )
            })
            .collect())
    }

    fn total_fedi_fee_amount(fees_by_stream: &[(FediFeeStream, Amount)]) -> Amount {
        fees_by_stream
            .iter()
            .fold(Amount::ZERO, |total, (_, fee)| total + *fee)
    }

    fn fedi_fee_amount_for_stream(
        fees_by_stream: &[(FediFeeStream, Amount)],
        stream: FediFeeStream,
    ) -> Amount {
        fees_by_stream
            .iter()
            .find_map(|(fee_stream, fee)| (*fee_stream == stream).then_some(*fee))
            .unwrap_or(Amount::ZERO)
    }

    fn fedi_fee_details_from_streams(fees_by_stream: &[(FediFeeStream, Amount)]) -> RpcFeeDetails {
        let fedi_app_fee = Self::fedi_fee_amount_for_stream(fees_by_stream, FediFeeStream::App);
        let fedi_guardian_fee =
            Self::fedi_fee_amount_for_stream(fees_by_stream, FediFeeStream::Guardian);

        RpcFeeDetails {
            fedi_app_fee: RpcAmount(fedi_app_fee),
            fedi_guardian_fee: RpcAmount(fedi_guardian_fee),
            network_fee: RpcAmount(Amount::ZERO),
            federation_fee: RpcAmount(Amount::ZERO),
        }
    }

    fn total_fedi_fee_ppm(fee_ppms: &[(FediFeeStream, u64)]) -> u64 {
        fee_ppms.iter().map(|(_, fee_ppm)| *fee_ppm).sum()
    }

    pub async fn generate_address(&self, frontend_meta: FrontendMetadata) -> Result<String> {
        self.wallet_ops.generate_address(self, frontend_meta).await
    }

    pub async fn supports_safe_deposit(&self) -> Result<bool> {
        self.wallet_ops.supports_safe_deposit(self).await
    }

    /// Generate lightning invoice
    pub async fn generate_invoice(
        &self,
        amount: RpcAmount,
        description: String,
        expiry_time: Option<u64>,
        frontend_meta: FrontendMetadata,
    ) -> Result<Bolt11Invoice> {
        self.ln_ops
            .generate_invoice(self, amount, description, expiry_time, frontend_meta)
            .await
    }

    pub async fn recheck_pegin_address(&self, operation_id: OperationId) -> Result<()> {
        self.wallet_ops
            .recheck_pegin_address(self, operation_id)
            .await
    }
    /// Estimates fees for paying a lightning invoice in this federation
    pub async fn estimate_ln_fees(&self, invoice: &Bolt11Invoice) -> Result<RpcFeeDetails> {
        self.ln_ops.estimate_ln_fees(self, invoice).await
    }

    /// Pay lightning invoice
    pub async fn pay_invoice(
        &self,
        invoice: &Bolt11Invoice,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcPayInvoiceResponse> {
        self.ln_ops.pay_invoice(self, invoice, frontend_meta).await
    }

    pub(crate) async fn prepare_fee_remittance(
        &self,
        outstanding_fees_total: Amount,
    ) -> Result<ln_ops::FeeRemittance> {
        let gateway_override = self.get_fee_remittance_gateway_override().await?;
        self.ln_ops
            .prepare_fee_remittance(self, outstanding_fees_total, gateway_override)
            .await
    }

    pub(crate) async fn pay_fee_remittance(
        &self,
        invoice: &Bolt11Invoice,
        remittance: ln_ops::FeeRemittance,
    ) -> Result<RpcPayInvoiceResponse> {
        self.ln_ops
            .pay_fee_remittance(self, invoice, remittance)
            .await
    }

    pub async fn get_prev_pay_invoice_result(
        &self,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcPrevPayInvoiceResult> {
        self.ln_ops.get_prev_pay_invoice_result(self, invoice).await
    }
    pub async fn preview_pay_address(
        &self,
        address: Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
    ) -> Result<RpcFeeDetails> {
        self.wallet_ops
            .preview_pay_address(self, address, amount)
            .await
    }

    pub async fn pay_address(
        &self,
        address: Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
        frontend_meta: FrontendMetadata,
    ) -> Result<OperationId> {
        self.wallet_ops
            .pay_address(self, address, amount, frontend_meta)
            .await
    }

    /// Subscribe to updates on all active operations
    ///
    /// This currently doesn't have a way to filter out in-active operations ...
    pub async fn subscribe_to_all_operations(&self) {
        let start = fedimint_core::time::now();
        let operations = self.client.get_active_operations().await;
        for operation_id in operations.iter() {
            // FIXME: upstream bug, get_active_operation returns operation id that doesn't
            // have an operation
            if operation_id == &OperationId([0x01; 32]) {
                continue;
            }
            if let Err(e) = self.subscribe_to_operation(*operation_id).await {
                warn!(
                    "failed to subscribe to operation: {:?} {:?}",
                    operation_id, e
                );
            }
        }
        self.subscribe_to_onchain_addresses().await;
        info!(
            "subscribe_to_all_operations took {:?}",
            fedimint_core::time::now().duration_since(start)
        );
    }

    /// Listen for state machine transitions in order to emit events to frontend
    ///
    /// Called after starting re-client or after spawning new state machine
    pub async fn subscribe_to_operation(&self, operation_id: OperationId) -> Result<()> {
        // get operation
        let operation = self
            .client
            .operation_log()
            .get_operation(operation_id)
            .await
            .ok_or(anyhow::anyhow!("Operation not found"))?;
        match operation.operation_module_kind() {
            LIGHTNING_OPERATION_TYPE | LIGHTNINGV2_OPERATION_TYPE => {
                self.ln_ops
                    .subscribe_operation(self, operation_id, operation)
                    .await;
            }
            MINT_OPERATION_TYPE | MINTV2_OPERATION_TYPE => {
                self.mint_ops
                    .subscribe_operation(self, operation_id, operation)
                    .await;
            }
            WALLET_OPERATION_TYPE | WALLETV2_OPERATION_TYPE => {
                self.wallet_ops
                    .subscribe_operation(self, operation_id, operation)
                    .await;
            }
            STABILITY_POOL_OPERATION_TYPE => {
                match operation.meta::<stability_pool_client_old::StabilityPoolMeta>() {
                    stability_pool_client_old::StabilityPoolMeta::Deposit { .. } => {
                        self.spawn_cancellable(
                            "subscribe_stability_pool_deposit",
                            move |fed| async move {
                                fed.subscribe_stability_pool_deposit_to_seek(operation_id)
                                    .await
                            },
                        );
                    }
                    stability_pool_client_old::StabilityPoolMeta::CancelRenewal { .. }
                    | stability_pool_client_old::StabilityPoolMeta::Withdrawal { .. } => {
                        self.spawn_cancellable(
                            "subscribe_stability_pool_withdraw",
                            move |fed| async move {
                                fed.subscribe_stability_pool_withdraw(operation_id).await
                            },
                        );
                    }
                }
            }
            STABILITY_POOL_V2_OPERATION_TYPE => match operation.meta::<StabilityPoolMeta>() {
                StabilityPoolMeta::Deposit { extra_meta, .. } => {
                    // Guardian fee remittances are internal maintenance
                    // operations. The dedicated remittance service owns their
                    // recovery and re-subscription.
                    if !matches!(
                        serde_json::from_value::<SPv2DepositMetadata>(extra_meta).ok(),
                        Some(SPv2DepositMetadata::GuardianFeeRemittance { .. })
                    ) {
                        self.spawn_cancellable("subscribe_spv2_deposit", move |fed| async move {
                            fed.subscribe_spv2_deposit_to_seek(operation_id).await
                        });
                    }
                }
                StabilityPoolMeta::Withdrawal { extra_meta, .. } => {
                    if matches!(
                        serde_json::from_value::<SPv2WithdrawMetadata>(extra_meta).ok(),
                        Some(SPv2WithdrawMetadata::GuardianRemittanceAccount)
                    ) {
                        self.spawn_cancellable(
                            "subscribe_guardian_remittance_withdraw",
                            move |fed| async move {
                                fed.subscribe_guardian_remittance_withdraw(operation_id)
                                    .await
                            },
                        );
                    } else {
                        self.spawn_cancellable("subscribe_spv2_withdraw", move |fed| async move {
                            fed.subscribe_spv2_withdraw(operation_id).await
                        });
                    }
                }
                StabilityPoolMeta::Transfer {
                    extra_meta,
                    signed_request,
                    txid,
                } => {
                    self.spawn_cancellable("subscribe_spv2_transfer", move |fed| async move {
                        fed.subscribe_spv2_transfer(operation_id, txid, signed_request, extra_meta)
                            .await
                    });
                }
                StabilityPoolMeta::WithdrawIdleBalance {
                    txid: _,
                    amount: _,
                    outpoints: _,
                    extra_meta: _,
                } => todo!("Implement with sweeper service for spv2, no FE events required"),
                // No subscription necessary for variant ExternalTransferIn, since we only become
                // aware of the transfer after it has already been completed
                StabilityPoolMeta::ExternalTransferIn { .. } => (),
            },
            // FIXME: should I return an error or just log something?
            _ => {
                tracing::debug!(
                    "Can't subscribe to operation id: {}",
                    operation.operation_module_kind()
                );
            }
        }

        Ok(())
    }

    pub async fn subscribe_to_onchain_addresses(&self) {
        self.wallet_ops.subscribe_to_onchain_addresses(self).await;
    }

    pub async fn subscribe_pay_address(&self, op_id: OperationId) -> Result<()> {
        self.wallet_ops.subscribe_pay_address(self, op_id).await
    }

    /// Start background task to listen for balance updates and emit
    /// "federation" events when one is observed
    async fn subscribe_balance_updates(&self) {
        self.spawn_cancellable(
            format!("{:?} balance subscription", self.federation_name()),
            |fed| async move {
                // always send an initial balance event
                fed.send_balance_event().await;
                let mut updates = fed
                    .client
                    .subscribe_balance_changes(AmountUnit::BITCOIN)
                    .await;
                while (updates.next().await).is_some() {
                    fed.send_balance_event().await;
                }
            },
        );
    }

    pub fn recovering(&self) -> bool {
        self.recovering
    }

    // Ensure that after recovering from backup, the e-cash nonces will not be
    // reused, which could lead to loss of funds. Note that we do this on a
    // best-effort basis. The user would have just joined the federation, and
    // recovery would have just completed, so very likely the user is online. But if
    // we timeout after a reasonably long duration, we just skip this check.
    pub async fn perform_nonce_reuse_check(&self) -> bool {
        assert!(!self.recovering());

        let client_config = self.client.config().await;
        let (mint_instance, cfg) = client_config
            .get_first_module_by_kind::<MintClientConfig>(fedimint_mint_client::KIND)
            .expect("mint module must be present in config");

        let mut dbtx = self.client.db().begin_transaction().await;
        let Some(version_set) = dbtx.get_value(&CachedApiVersionSetKey).await else {
            info!("Skipping nonce check due to absent cache api versions");
            // no caching here so we will retry on next startup
            return true;
        };

        const VERSION_THAT_INTRODUCED_BLIND_NONCE_USED: ApiVersion = ApiVersion::new(0, 1);

        let api_version = version_set
            .0
            .modules
            .get(&mint_instance)
            .copied()
            .unwrap_or(ApiVersion::new(0, 0));

        if api_version < VERSION_THAT_INTRODUCED_BLIND_NONCE_USED {
            info!("Skipping nonce check due to low api version");
            return true;
        }

        let mint = self
            .client
            .mint()
            .expect("recovery has completed so mint module must be present");
        let blind_nonces = {
            let mut dbtx = mint.db.begin_transaction_nc().await;
            dbtx.ignore_uncommitted();
            let mut blind_nonces = vec![];
            for amt in cfg.tbs_pks.tiers().copied() {
                let blind_nonce = mint.new_ecash_note(amt, &mut dbtx).await.1;
                blind_nonces.push(blind_nonce);
            }
            blind_nonces
        };

        // what is a good timeout here?
        let Ok(all_results) = fedimint_core::task::timeout(
            Duration::from_secs(120),
            futures::future::join_all(blind_nonces.iter().map(|blind_nonce| async {
                retry("check blind nonce", background_backoff(), || async {
                    let nonce_used = mint.api.check_blind_nonce_used(*blind_nonce).await?;
                    Ok(!nonce_used)
                })
                .await
                .expect("infinite retry")
            })),
        )
        .await
        else {
            info!("Skipping nonce check due to timeout");
            return true;
        };
        all_results.into_iter().all(|nonce_ok| nonce_ok)
    }

    pub async fn wait_for_recovery(&self) -> Result<()> {
        info!("waiting for recovering");
        let mut recovery_complete = pin!(self.client.wait_for_all_recoveries().fuse());
        let client_config = self.client.config().await;
        let mint_instance_id = client_config
            .modules
            .iter()
            .find(|(_, config)| config.is_kind(&MintClientModule::kind()))
            .map(|(id, _)| id);
        let mut stream = pin!(self.client.subscribe_to_recovery_progress().fuse());
        loop {
            futures::select_biased! {
                result = recovery_complete => {
                    info!("recovery completed");
                    return result;
                }
                value = stream.next() => {
                    if let Some((instance_id, progress)) = value {
                        info!("recover progress {instance_id:?} {progress}");
                        if mint_instance_id == Some(&instance_id) {
                            self.send_recovery_progress(progress);
                        }
                    }
                }
            }
        }
    }

    async fn send_transaction_event(&self, operation_id: OperationId) {
        match self.get_transaction(operation_id).await {
            Ok(transaction) => {
                let event = Event::transaction(self.federation_id().to_string(), transaction);
                self.runtime.event_sink.typed_event(&event);
            }
            Err(e) => {
                tracing::error!("Failed to get transaction details: {}", e);
            }
        }
    }

    fn send_recovery_progress(&self, progress: RecoveryProgress) {
        let event = Event::RecoveryProgress(RecoveryProgressEvent {
            federation_id: RpcFederationId(self.federation_id().to_string()),
            complete: progress.complete,
            total: progress.total,
        });
        self.runtime.event_sink.typed_event(&event);
    }

    /// Send whenever balance changes
    pub async fn send_balance_event(&self) {
        self.runtime.event_sink.typed_event(&Event::balance(
            self.federation_id().to_string(),
            self.get_balance().await,
        ));
    }

    pub async fn to_rpc_federation(&self) -> RpcFederation {
        let id = RpcFederationId(self.federation_id().to_string());
        let name = self.federation_name();
        let network = self.get_network().map(Into::into);
        let client_config = self.client.config().await;
        let meta = self.get_cached_meta().await;
        let nodes = client_config
            .global
            .api_endpoints
            .clone()
            .iter()
            .map(|(peer_id, peer_url)| (RpcPeerId(*peer_id), peer_url.clone()))
            .collect();
        let client_config_json = self.client.get_config_json().await;
        let (invite_code, fedi_fee_schedule, balance) = futures::join!(
            self.get_invite_code(),
            self.fedi_fee_schedule(),
            self.get_balance(),
        );
        let had_reused_ecash = self.mint_ops.had_reused_ecash(self).await;
        RpcFederation {
            balance: RpcAmount(balance),
            id,
            network,
            name,
            invite_code,
            meta,
            nodes,
            recovering: self.recovering(),
            client_config: Some(RpcJsonClientConfig {
                global: client_config_json.global,
                modules: client_config_json.modules,
            }),
            fedi_fee_schedule: fedi_fee_schedule.into(),
            had_reused_ecash,
        }
    }

    /// Send whenever federation meta keys change
    pub async fn send_federation_event(&self) {
        let rpc_federation = self.to_rpc_federation().await;
        let event = Event::federation(RpcFederationMaybeLoading::Ready(rpc_federation));
        self.runtime.event_sink.typed_event(&event);
    }

    fn gateway_service(&self) -> anyhow::Result<&LnGatewayService> {
        self.gateway_service.get().context(ErrorCode::Recovery)
    }

    /// List all lightning gateways registered with the federation
    pub async fn list_gateways(&self) -> anyhow::Result<Vec<RpcLightningGateway>> {
        self.ln_ops.list_gateways(self).await
    }

    /// Set gateway override for this federation. Pass None to clear the
    /// override.
    pub async fn set_gateway_override(
        &self,
        gateway_id: Option<RpcLightningGatewayId>,
    ) -> Result<()> {
        let gateway_override = match gateway_id {
            Some(RpcLightningGatewayId::Lnv1 { pubkey }) => {
                Some(LightningGatewayOverride::Lnv1(pubkey.0))
            }
            Some(RpcLightningGatewayId::Lnv2 { url }) => {
                let safe_url = SafeUrl::parse(&url).context("invalid lnv2 gateway override url")?;
                Some(LightningGatewayOverride::Lnv2(safe_url))
            }
            None => None,
        };
        self.client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let gateway_override = gateway_override.clone();
                        async move {
                            match gateway_override {
                                Some(gateway_override) => {
                                    dbtx.insert_entry(
                                        &LightningGatewayOverrideKey,
                                        &gateway_override,
                                    )
                                    .await;
                                }
                                None => {
                                    dbtx.remove_entry(&LightningGatewayOverrideKey).await;
                                }
                            }
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit()?;
        Ok(())
    }

    /// Get the current gateway override for this federation.
    pub async fn get_gateway_override(&self) -> Result<Option<RpcLightningGatewayId>> {
        let mut dbtx = self.client.db().begin_transaction_nc().await;
        Ok(dbtx
            .get_value(&LightningGatewayOverrideKey)
            .await
            .map(|gateway_override| match gateway_override {
                LightningGatewayOverride::Lnv1(pubkey) => RpcLightningGatewayId::Lnv1 {
                    pubkey: RpcPublicKey(pubkey),
                },
                LightningGatewayOverride::Lnv2(url) => RpcLightningGatewayId::Lnv2 {
                    url: url.to_string(),
                },
            }))
    }

    pub(crate) async fn get_lnv2_gateway_override(&self) -> Result<Option<SafeUrl>> {
        let mut dbtx = self.client.db().begin_transaction_nc().await;
        match dbtx.get_value(&LightningGatewayOverrideKey).await {
            Some(LightningGatewayOverride::Lnv2(url)) => Ok(Some(url)),
            _ => Ok(None),
        }
    }

    pub(crate) async fn get_fee_remittance_gateway_override(
        &self,
    ) -> Result<Option<ln_ops::FeeRemittanceGatewayOverride>> {
        let mut dbtx = self.client.db().begin_transaction_nc().await;
        match dbtx.get_value(&LightningGatewayOverrideKey).await {
            Some(LightningGatewayOverride::Lnv1(pubkey)) => {
                Ok(Some(ln_ops::FeeRemittanceGatewayOverride::Lnv1 { pubkey }))
            }
            Some(LightningGatewayOverride::Lnv2(url)) => {
                Ok(Some(ln_ops::FeeRemittanceGatewayOverride::Lnv2 { url }))
            }
            None => Ok(None),
        }
    }

    /// Receive ecash
    /// TODO: user a better type than String
    pub async fn receive_ecash(
        &self,
        ecash: String,
        frontend_meta: FrontendMetadata,
    ) -> Result<(Amount, OperationId)> {
        self.mint_ops
            .receive_ecash(self, ecash, frontend_meta)
            .await
    }

    pub async fn subscribe_to_ecash_reissue(
        &self,
        operation_id: OperationId,
        amount: Amount,
    ) -> Result<()> {
        self.mint_ops
            .subscribe_to_ecash_reissue(self, operation_id, amount)
            .await
    }

    /// Determine the maximum actual amount of e-cash that can be generated for
    /// sending taking into account fees.
    pub async fn calculate_max_generate_ecash(&self) -> Result<RpcAmount> {
        // Let's say that amount we're looking for is max. We wish to satisfy this
        // equation: max + fedi_fee = virtual_balance
        //
        // total_fedi_fee is calculated as follows:
        // total_fedi_fee = (max * total_fedi_fee_ppm) / MILLION
        //
        // Plugging this into the original equation, we get:
        // max + [(max * total_fedi_fee_ppm) / MILLION] = virtual_balance
        //
        // We can solve this for max as follows:
        // max = (virtual_balance * MILLION) / (MILLION + total_fedi_fee_ppm)
        // We use floor division here
        let fee_ppms = self
            .get_fee_ppms_by_stream(fedimint_mint_client::KIND, RpcTransactionDirection::Send)
            .await?;
        let virtual_balance = self.get_balance().await;
        let max = {
            let numerator = virtual_balance.mul_u64(MILLION).msats;
            let denominator = MILLION + FederationV2::total_fedi_fee_ppm(&fee_ppms);
            numerator / denominator
        };
        Ok(RpcAmount(Amount::from_msats(max)))
    }

    /// Estimates fees for generating e-cash in this federation.
    pub async fn estimate_ecash_fees(&self, amount: Amount) -> Result<RpcFeeDetails> {
        let fees_by_stream = self
            .get_fee_amounts_by_stream(
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        Ok(FederationV2::fedi_fee_details_from_streams(&fees_by_stream))
    }

    /// Generate ecash
    pub async fn generate_ecash(
        &self,
        amount: Amount,
        include_invite: bool,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcGenerateEcashResponse> {
        self.mint_ops
            .generate_ecash(self, amount, include_invite, frontend_meta)
            .await
    }

    pub async fn cancel_ecash(&self, ecash: String) -> Result<()> {
        self.mint_ops.cancel_ecash(self, ecash).await
    }

    async fn subscribe_oob_spend(&self, op_id: OperationId) -> Result<(), anyhow::Error> {
        self.mint_ops.subscribe_oob_spend(self, op_id).await
    }

    pub async fn repair_wallet(&self) -> Result<()> {
        self.mint_ops.repair_wallet(self).await
    }

    /// Manually reclaim a stuck lightning receive.
    ///
    /// Break-glass recovery for the case where an incoming lightning contract
    /// was funded but the original receive operation already reached a terminal
    /// state (e.g. the invoice expired before the contract was funded), leaving
    /// the funds unclaimed.
    ///
    /// This is fund-safe in every other case. The reclaim spawns a fresh claim
    /// attempt against the *same* incoming contract, and the federation rejects
    /// the claim if the contract was never funded or was already claimed, so it
    /// can only ever recover the user's own stuck funds: it never double-spends
    /// or mints new funds. The original operation is left untouched; a new
    /// operation is created for the attempt.
    ///
    /// Requires the original receive's local state history (not seed-only
    /// restore safe).
    pub async fn reclaim_ln_receive(
        &self,
        original_operation_id: OperationId,
    ) -> Result<RpcReclaimLnReceiveOutcome> {
        let ln = self.client.ln()?;
        let reclaim_operation_id = ln.reclaim_ln_receive(original_operation_id).await?;

        // Track the reclaim operation like any other receive so the balance,
        // fees and transaction list update, and the attempt resumes if the app
        // restarts.
        self.subscribe_to_operation(reclaim_operation_id).await?;

        // Observe the attempt briefly so we can give the user a definitive
        // result instead of a fire-and-forget. The claim against an
        // already-funded contract resolves in a few seconds; if it has not
        // reached a terminal state by then it keeps running in the background.
        let mut updates = ln
            .subscribe_ln_receive(reclaim_operation_id)
            .await?
            .into_stream();
        let observed = fedimint_core::task::timeout(Duration::from_secs(20), async {
            while let Some(update) = updates.next().await {
                match update {
                    LnReceiveState::Claimed => {
                        return Some(RpcReclaimLnReceiveOutcome::Reclaimed);
                    }
                    LnReceiveState::Canceled { reason } => {
                        return Some(RpcReclaimLnReceiveOutcome::NothingToReclaim {
                            reason: reason.to_string(),
                        });
                    }
                    _ => {}
                }
            }
            None
        })
        .await;

        Ok(match observed {
            Ok(Some(outcome)) => outcome,
            // Timed out, or the stream ended before a terminal state.
            Ok(None) | Err(_) => RpcReclaimLnReceiveOutcome::Pending,
        })
    }

    // FIXME: get rid of this method and just access self.secret directly
    /// Get client root secret
    fn root_secret(&self) -> DerivableSecret {
        self.auxiliary_secret.clone()
    }

    /// Backup all ecash and username with the federation
    pub async fn backup(&self) -> Result<()> {
        // not block ui for too long, just return error. background service will
        // continue retry.
        fedimint_core::task::timeout(
            Duration::from_secs(60),
            self.backup_service
                .backup(&self.client, aggressive_backoff()),
        )
        .await
        .context(ErrorCode::Timeout)??;
        Ok(())
    }

    //
    // Social Recovery
    //

    /// Generate social recovery secret from root secret
    pub fn social_recovery_secret_static(root_secret: &DerivableSecret) -> DerivableSecret {
        // It's level 1 because we're using client.external_secret()
        assert_eq!(root_secret.level(), 2);
        root_secret.child_key(SOCIAL_RECOVERY_SECRET_CHILD_ID)
    }

    fn social_api(&self) -> anyhow::Result<DynModuleApi> {
        let social_module = self
            .client
            .get_first_module::<fedi_social_client::FediSocialClientModule>()?;
        Ok(social_module.api)
    }

    pub async fn decoded_config(&self) -> Result<ClientConfig> {
        let client_config = self.client.config().await.clone();
        Ok(client_config.redecode_raw(self.client.decoders())?)
    }

    pub async fn raw_config(&self) -> Result<ClientConfig> {
        let mut dbtx = self.dbtx().await;
        let config = dbtx
            .get_value(&FediRawClientConfigKey)
            .await
            .context("config not found in db")?;
        let fed_config: FediConfig = serde_json::from_str(&config)?;
        Ok(fed_config.client_config)
    }

    // Create social backup client
    pub async fn social_backup(&self) -> Result<SocialBackup> {
        let client_config = self.decoded_config().await?;
        let (module_id, cfg) = client_config
            .get_first_module_by_kind::<fedi_social_client::config::FediSocialClientConfig>(
                "fedi-social",
            )
            .map_err(|_| {
                anyhow!(ErrorCode::ModuleNotFound(
                    fedi_social_client::KIND.to_string()
                ))
            })?;
        Ok(SocialBackup {
            module_secret: Self::social_recovery_secret_static(&self.root_secret()),
            module_id,
            config: cfg.clone(),
            api: self.social_api()?,
        })
    }

    /// Start social recovery session
    pub async fn social_recovery_start(
        &self,
        recovery_file: RecoveryFile,
    ) -> anyhow::Result<SocialRecoveryClient> {
        let client_config = self.decoded_config().await?;
        let (module_id, cfg) = client_config
            .get_first_module_by_kind::<fedi_social_client::config::FediSocialClientConfig>(
                "fedi-social",
            )
            .map_err(|_| {
                anyhow!(ErrorCode::ModuleNotFound(
                    fedi_social_client::KIND.to_string()
                ))
            })?;
        SocialRecoveryClient::new_start(module_id, cfg.clone(), self.social_api()?, recovery_file)
    }

    /// Continue social recovery session
    pub async fn social_recovery_continue_inner(
        &self,
        prev_state: SocialRecoveryState,
    ) -> Result<SocialRecoveryClient> {
        let client_config = self.decoded_config().await?;
        let (module_id, cfg) = client_config
            .get_first_module_by_kind::<fedi_social_client::config::FediSocialClientConfig>(
                "fedi-social",
            )
            .map_err(|_| {
                anyhow!(ErrorCode::ModuleNotFound(
                    fedi_social_client::KIND.to_string()
                ))
            })?;
        Ok(SocialRecoveryClient::new_continue(
            module_id,
            cfg.clone(),
            self.social_api()?,
            prev_state,
        ))
    }

    /// Get social verification client for a guardian
    pub async fn social_verification(&self, peer_id: PeerId) -> Result<SocialVerification> {
        Ok(SocialVerification::new(self.social_api()?, peer_id))
    }

    /// Upload social recovery recovery file to federation given a recovery
    /// video
    pub async fn upload_backup_file(
        &self,
        video_file: Vec<u8>,
        root_seed: bip39::Mnemonic,
    ) -> Result<Vec<u8>> {
        let verification_doc = VerificationDocument::from_raw(&video_file);

        let seed_phrase = UserSeedPhrase::from(
            root_seed
                .words()
                .map(|x| x.to_string())
                .collect::<Vec<_>>()
                .join(" "),
        );

        let backup_client = self.social_backup().await?;
        let recovery_file = backup_client.prepare_recovery_file(
            verification_doc.clone(),
            seed_phrase.clone(),
            self.raw_config().await?,
        );
        backup_client
            .upload_backup_to_federation(&recovery_file)
            .await?;
        Ok(recovery_file.to_bytes())
    }

    /// Download social recovery video to `data_dir`
    pub async fn download_verification_doc(
        &self,
        recovery_id: &RecoveryId,
        peer_id: PeerId,
        guardian_password: String,
    ) -> Result<Option<Vec<u8>>> {
        tracing::info!("downloading verification doc");
        // FIXME: maybe shouldn't download from only one peer?
        let verification_client = self.social_verification(peer_id).await?;
        let verification_doc = verification_client
            .download_verification_doc(*recovery_id, guardian_password)
            .await?;
        if let Some(verification_doc) = verification_doc {
            tracing::info!("downloaded verification doc");
            return Ok(Some(verification_doc.to_raw()?));
        };
        tracing::info!("no verificaiton doc found");

        Ok(None)
    }

    /// Approve social recovery request
    pub async fn approve_social_recovery_request(
        &self,
        recovery_id: &RecoveryId,
        peer_id: PeerId,
        guardian_password: String,
    ) -> Result<()> {
        tracing::info!("approve social recovery");
        let verification_client = self.social_verification(peer_id).await?;
        verification_client
            .approve_recovery(*recovery_id, guardian_password)
            .await?;
        Ok(())
    }

    // Initiates new subscription to operation updates/outcome if no cached outcome
    // found
    pub async fn get_client_operation_outcome<O, F, Fut>(
        &self,
        operation_id: OperationId,
        log_entry: OperationLogEntry,
        subscribe_fn: F,
    ) -> anyhow::Result<Option<O>>
    where
        O: Clone + DeserializeOwned + 'static,
        F: Fn(OperationId) -> Fut,
        Fut: Future<Output = anyhow::Result<UpdateStreamOrOutcome<O>>>,
    {
        let outcome = log_entry.try_outcome::<O>()?;

        // Return client's cached outcome if we find it
        if let Some(outcome) = outcome {
            return Ok(Some(outcome));
        }
        // Return our cached outcome if we find it
        if let Some(outcome) = self.get_operation_state::<O>(&operation_id).await? {
            return Ok(Some(outcome));
        }

        match subscribe_fn(operation_id).await {
            Ok(UpdateStreamOrOutcome::Outcome(outcome)) => Ok(Some(outcome)),
            Ok(UpdateStreamOrOutcome::UpdateStream(mut stream)) => Ok(stream.next().await),
            Err(e) => Err(e),
        }
    }

    // Returns None if no cached outcome found
    async fn get_client_operation_outcome_cached<O>(
        &self,
        operation_id: OperationId,
        log_entry: OperationLogEntry,
    ) -> anyhow::Result<Option<O>>
    where
        O: Clone + DeserializeOwned + 'static,
    {
        // Return client's cached outcome if we find it
        if let Some(outcome) = log_entry.try_outcome::<O>()? {
            return Ok(Some(outcome));
        }
        // Return our cached outcome if we find it
        if let Some(outcome) = self.get_operation_state::<O>(&operation_id).await? {
            return Ok(Some(outcome));
        }

        Ok(None)
    }

    /// Return all transactions via operation log
    pub async fn list_transactions(
        &self,
        limit: usize,
        start_after: Option<ChronologicalOperationLogKey>,
    ) -> Vec<Result<RpcTransactionListEntry, String>> {
        let futures = self
            .client
            .operation_log()
            .paginate_operations_rev(limit, start_after)
            .await
            .into_iter()
            .map(|(op_key, entry)| async move {
                let Ok(created_at) = to_unix_time(op_key.creation_time) else {
                    return None;
                };

                match self.get_transaction_inner(op_key.operation_id, entry).await {
                    Ok(Some(transaction)) => Some(Ok(RpcTransactionListEntry {
                        created_at,
                        transaction,
                    })),
                    Ok(None) => None,
                    Err(e) => Some(Err(e.to_string())),
                }
            });
        futures::future::join_all(futures)
            .await
            .into_iter()
            .flatten()
            .collect()
    }

    pub async fn get_transaction(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<RpcTransaction> {
        let entry = self
            .client
            .operation_log()
            .get_operation(operation_id)
            .await
            .context("transaction not found")?;

        match self
            .get_transaction_inner(operation_id, entry)
            .await
            .context("internal transaction")
        {
            Ok(maybe_tx) => match maybe_tx {
                Some(tx) => Ok(tx),
                None => bail!("Tx not found {:?}", operation_id),
            },
            Err(e) => Err(e),
        }
    }

    async fn get_transaction_inner(
        &self,
        operation_id: OperationId,
        entry: OperationLogEntry,
    ) -> anyhow::Result<Option<RpcTransaction>> {
        let module = entry.operation_module_kind().to_owned();
        timeout_log_only(
            self.get_transaction_really_inner(operation_id, entry),
            Duration::from_secs(30),
            || {
                error!(
                    op = %operation_id.fmt_short(),
                    module,
                    "found transaction slow culprit"
                );
            },
        )
        .await
    }

    async fn get_transaction_really_inner(
        &self,
        operation_id: OperationId,
        entry: OperationLogEntry,
    ) -> anyhow::Result<Option<RpcTransaction>> {
        let notes = self
            .dbtx()
            .await
            .get_value(&TransactionNotesKey(operation_id))
            .await;
        let tx_date_fiat_info = self
            .dbtx()
            .await
            .get_value(&TransactionDateFiatInfoKey(operation_id))
            .await;
        let app_fedi_fee_status = self
            .fedi_fee_db()
            .begin_transaction_nc()
            .await
            .get_value(&OperationFediFeeStatusByStreamKey(
                operation_id,
                FediFeeStream::App,
            ))
            .await
            .map(Into::into);
        let guardian_fedi_fee_status = self
            .fedi_fee_db()
            .begin_transaction_nc()
            .await
            .get_value(&OperationFediFeeStatusByStreamKey(
                operation_id,
                FediFeeStream::Guardian,
            ))
            .await
            .map(Into::into);
        let app_fedi_fee_msats = match app_fedi_fee_status {
            Some(
                RpcOperationFediFeeStatus::PendingSend { fedi_fee }
                | RpcOperationFediFeeStatus::Success { fedi_fee },
            ) => fedi_fee.0.msats,
            _ => 0,
        };
        let guardian_fedi_fee_msats = match guardian_fedi_fee_status {
            Some(
                RpcOperationFediFeeStatus::PendingSend { fedi_fee }
                | RpcOperationFediFeeStatus::Success { fedi_fee },
            ) => fedi_fee.0.msats,
            _ => 0,
        };
        let fedi_fee_msats = app_fedi_fee_msats + guardian_fedi_fee_msats;
        let outcome_time = entry.outcome_time();
        let (transaction_amount, transaction_kind, frontend_metadata);
        match entry.operation_module_kind() {
            LIGHTNING_OPERATION_TYPE | LIGHTNINGV2_OPERATION_TYPE => {
                let Some(transaction) = self
                    .ln_ops
                    .get_transaction(self, operation_id, entry, fedi_fee_msats)
                    .await?
                else {
                    return Ok(None);
                };
                transaction_amount = transaction.amount;
                frontend_metadata = transaction.frontend_metadata;
                transaction_kind = transaction.kind;
            }
            STABILITY_POOL_OPERATION_TYPE => match entry.meta() {
                stability_pool_client_old::StabilityPoolMeta::Deposit { txid, amount, .. } => {
                    transaction_amount = RpcAmount(amount + Amount::from_msats(fedi_fee_msats));
                    frontend_metadata = None;
                    transaction_kind = RpcTransactionKind::SpDeposit {
                        state: if let Ok(ClientAccountInfo { account_info, .. }) =
                            // FIXME: remove network request from here
                            self.stability_pool_account_info(false).await
                        {
                            if let Some(metadata) = account_info.seeks_metadata.get(&txid) {
                                RpcSPDepositState::CompleteDeposit {
                                    initial_amount_cents: metadata.initial_amount_cents,
                                    fees_paid_so_far: RpcAmount(metadata.fees_paid_so_far),
                                }
                            } else {
                                RpcSPDepositState::PendingDeposit
                            }
                        } else {
                            RpcSPDepositState::DataNotInCache
                        },
                    }
                }
                stability_pool_client_old::StabilityPoolMeta::Withdrawal {
                    estimated_withdrawal_cents,
                    ..
                }
                | stability_pool_client_old::StabilityPoolMeta::CancelRenewal {
                    estimated_withdrawal_cents,
                    ..
                } => {
                    let outcome = self
                        .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                            self.client.sp()?.subscribe_withdraw(op_id).await
                        })
                        .await?;

                    frontend_metadata = None;
                    transaction_amount = match outcome {
                        Some(
                            stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawUnlockedInitiated(
                                amount,
                            )
                            | stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawUnlockedAccepted(amount)
                            | stability_pool_client_old::StabilityPoolWithdrawalOperationState::Success(amount)
                            | stability_pool_client_old::StabilityPoolWithdrawalOperationState::CancellationInitiated(Some(
                                amount,
                            ))
                            | stability_pool_client_old::StabilityPoolWithdrawalOperationState::CancellationAccepted(Some(
                                amount,
                            ))
                            | stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawIdleInitiated(amount)
                            | stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawIdleAccepted(amount),
                        ) => RpcAmount(amount),
                        _ => RpcAmount(Amount::ZERO),
                    };

                    transaction_kind = RpcTransactionKind::SpWithdraw {
                        state: match outcome {
                            Some(stability_pool_client_old::StabilityPoolWithdrawalOperationState::Success(_)) => {
                                Some(RpcSPWithdrawState::CompleteWithdrawal {
                                    estimated_withdrawal_cents,
                                })
                            }
                            Some(_) => Some(RpcSPWithdrawState::PendingWithdrawal {
                                estimated_withdrawal_cents,
                            }),
                            None => None,
                        },
                    };
                }
            },
            STABILITY_POOL_V2_OPERATION_TYPE => match entry.meta() {
                StabilityPoolMeta::Deposit {
                    txid,
                    amount,
                    extra_meta,
                    ..
                } => {
                    let typed_extra_meta =
                        serde_json::from_value::<SPv2DepositMetadata>(extra_meta.clone()).ok();
                    if matches!(
                        typed_extra_meta,
                        Some(SPv2DepositMetadata::GuardianFeeRemittance { .. })
                    ) {
                        // Guardian fee remittance deposits are internal bridge
                        // maintenance operations and should not surface in the
                        // normal transaction list.
                        return Ok(None);
                    }
                    transaction_amount = RpcAmount(amount + Amount::from_msats(fedi_fee_msats));
                    frontend_metadata = match typed_extra_meta {
                        Some(SPv2DepositMetadata::StableBalance { frontend_metadata }) => {
                            frontend_metadata
                        }
                        _ => None,
                    };
                    let outcome = self
                        .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                            self.client.spv2()?.subscribe_deposit_operation(op_id).await
                        })
                        .await?;
                    transaction_kind = match outcome {
                        Some(
                            StabilityPoolDepositOperationState::TxRejected(e)
                            | StabilityPoolDepositOperationState::PrimaryOutputError(e),
                        ) => RpcTransactionKind::SPV2Deposit {
                            state: RpcSPV2DepositState::FailedDeposit {
                                error: e.to_string(),
                            },
                        },
                        _ => RpcTransactionKind::SPV2Deposit {
                            state: if let Some(item) = self.spv2_user_op_history_item(txid).await {
                                match item.kind {
                                    UserOperationHistoryItemKind::PendingDeposit => {
                                        RpcSPV2DepositState::PendingDeposit {
                                            amount: RpcAmount(item.amount),
                                            fiat_amount: item.fiat_amount.0,
                                        }
                                    }

                                    UserOperationHistoryItemKind::CompletedDeposit => {
                                        let fees_paid_so_far = RpcAmount(
                                            self.spv2_seek_lifetime_fee(txid)
                                                .await
                                                .unwrap_or(Amount::ZERO),
                                        );
                                        RpcSPV2DepositState::CompletedDeposit {
                                            amount: RpcAmount(item.amount),
                                            fiat_amount: item.fiat_amount.0,
                                            fees_paid_so_far,
                                        }
                                    }
                                    _ => panic!(
                                        "SPV2 meta does not match user operation kind for {txid}"
                                    ),
                                }
                            } else {
                                RpcSPV2DepositState::DataNotInCache
                            },
                        },
                    }
                }
                StabilityPoolMeta::Withdrawal {
                    txid, extra_meta, ..
                } => {
                    let typed_extra_meta =
                        serde_json::from_value::<SPv2WithdrawMetadata>(extra_meta).ok();
                    let guardian_remittance = matches!(
                        &typed_extra_meta,
                        Some(SPv2WithdrawMetadata::GuardianRemittanceAccount)
                    );
                    let sweeper_initiated =
                        matches!(&typed_extra_meta, Some(SPv2WithdrawMetadata::Sweeper));
                    frontend_metadata =
                        if let Some(SPv2WithdrawMetadata::StableBalance { frontend_metadata }) =
                            typed_extra_meta
                        {
                            frontend_metadata
                        } else {
                            None
                        };
                    let outcome = self
                        .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                            self.client.spv2()?.subscribe_withdraw(op_id).await
                        })
                        .await?;
                    transaction_kind = match outcome {
                        Some(
                            StabilityPoolWithdrawalOperationState::UnlockTxRejected(e)
                            | StabilityPoolWithdrawalOperationState::UnlockProcessingError(e)
                            | StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e)
                            | StabilityPoolWithdrawalOperationState::PrimaryOutputError(e),
                        ) => {
                            transaction_amount = RpcAmount(Amount::ZERO);
                            RpcTransactionKind::SPV2Withdrawal {
                                state: RpcSPV2WithdrawalState::FailedWithdrawal {
                                    error: e.to_string(),
                                },
                                sweeper_initiated,
                                guardian_remittance,
                            }
                        }
                        _ => RpcTransactionKind::SPV2Withdrawal {
                            state: if let Some(item) = if guardian_remittance {
                                self.spv2_guardian_remittance_op_history_item(txid).await
                            } else {
                                self.spv2_user_op_history_item(txid).await
                            } {
                                transaction_amount = RpcAmount(item.amount);
                                match item.kind {
                                    UserOperationHistoryItemKind::PendingWithdrawal => {
                                        RpcSPV2WithdrawalState::PendingWithdrawal {
                                            amount: RpcAmount(item.amount),
                                            fiat_amount: item.fiat_amount.0,
                                        }
                                    }
                                    UserOperationHistoryItemKind::CompletedWithdrawal => {
                                        RpcSPV2WithdrawalState::CompletedWithdrawal {
                                            amount: RpcAmount(item.amount),
                                            fiat_amount: item.fiat_amount.0,
                                        }
                                    }
                                    _ => panic!(
                                        "SPV2 meta does not match user operation kind for {txid}"
                                    ),
                                }
                            } else {
                                transaction_amount = RpcAmount(Amount::ZERO);
                                RpcSPV2WithdrawalState::DataNotInCache
                            },
                            sweeper_initiated,
                            guardian_remittance,
                        },
                    }
                }
                StabilityPoolMeta::Transfer {
                    txid,
                    signed_request,
                    extra_meta,
                    ..
                } => {
                    let transfer_meta =
                        serde_json::from_value::<SPv2TransferMetadata>(extra_meta).ok();
                    frontend_metadata = match &transfer_meta {
                        Some(
                            SPv2TransferMetadata::StableBalance { frontend_metadata }
                            | SPv2TransferMetadata::MultispendDeposit {
                                frontend_metadata, ..
                            },
                        ) => frontend_metadata.clone(),
                        _ => None,
                    };
                    // We must either be the sender or the recipient of the
                    // transfer, otherwise we can ignore it for our own personal
                    // operation history
                    if let Some(account) = self.spv2_our_seeker_account() {
                        if account.id() == signed_request.details().from().id() {
                            // Case 1: we were the sender
                            let transfer_out_kind = match &transfer_meta {
                                Some(SPv2TransferMetadata::MultispendDeposit { .. }) => {
                                    SpV2TransferOutKind::Multispend
                                }
                                Some(SPv2TransferMetadata::MatrixSpTransfer { .. }) => {
                                    SpV2TransferOutKind::MatrixSpTransfer
                                }
                                Some(SPv2TransferMetadata::StableBalance { .. }) => {
                                    SpV2TransferOutKind::SpTransferUi
                                }
                                other => {
                                    nightly_panic!(
                                        self.runtime,
                                        "unexpected transfer out meta: {:?}",
                                        other
                                    );
                                    SpV2TransferOutKind::Unknown
                                }
                            };
                            transaction_kind = RpcTransactionKind::SPV2TransferOut {
                                state: if let Some(item) =
                                    self.spv2_user_op_history_item(txid).await
                                {
                                    transaction_amount = RpcAmount(item.amount);
                                    RpcSPV2TransferOutState::CompletedTransfer {
                                        to_account_id: signed_request.details().to().to_string(),
                                        amount: RpcAmount(item.amount),
                                        fiat_amount: item.fiat_amount.0,
                                        kind: transfer_out_kind,
                                    }
                                } else {
                                    transaction_amount = RpcAmount(Amount::ZERO);
                                    RpcSPV2TransferOutState::DataNotInCache
                                },
                            }
                        } else if account.id() == *signed_request.details().to() {
                            // Case 2: we were the recipient
                            let transfer_in_kind = match &transfer_meta {
                                Some(SPv2TransferMetadata::MultispendWithdrawal { .. }) => {
                                    SpV2TransferInKind::Multispend
                                }
                                other => {
                                    nightly_panic!(
                                        self.runtime,
                                        "unexpected transfer in meta: {:?}",
                                        other
                                    );
                                    SpV2TransferInKind::Unknown
                                }
                            };
                            transaction_kind = RpcTransactionKind::SPV2TransferIn {
                                state: if let Some(item) =
                                    self.spv2_user_op_history_item(txid).await
                                {
                                    transaction_amount = RpcAmount(item.amount);
                                    RpcSPV2TransferInState::CompletedTransfer {
                                        from_account_id: signed_request
                                            .details()
                                            .from()
                                            .id()
                                            .to_string(),
                                        amount: RpcAmount(item.amount),
                                        fiat_amount: item.fiat_amount.0,
                                        kind: transfer_in_kind,
                                    }
                                } else {
                                    transaction_amount = RpcAmount(Amount::ZERO);
                                    RpcSPV2TransferInState::DataNotInCache
                                },
                            }
                        } else {
                            let details = signed_request.details();
                            bail!("Unexpected transfer in TX history {:?}", details);
                        }
                    } else {
                        return Ok(None);
                    }
                }
                StabilityPoolMeta::WithdrawIdleBalance { .. } => {
                    // TXs to sweep idle balance shouldn't log in history
                    return Ok(None);
                }
                StabilityPoolMeta::ExternalTransferIn { txid } => {
                    frontend_metadata = None;
                    transaction_kind = RpcTransactionKind::SPV2TransferIn {
                        state: if let Some(UserOperationHistoryItem {
                            amount,
                            fiat_amount,
                            kind: UserOperationHistoryItemKind::TransferIn { from, .. },
                            ..
                        }) = self.spv2_user_op_history_item(txid).await
                        {
                            transaction_amount = RpcAmount(amount);
                            RpcSPV2TransferInState::CompletedTransfer {
                                from_account_id: from.to_string(),
                                amount: RpcAmount(amount),
                                fiat_amount: fiat_amount.0,
                                kind: SpV2TransferInKind::Unknown,
                            }
                        } else {
                            transaction_amount = RpcAmount(Amount::ZERO);
                            RpcSPV2TransferInState::DataNotInCache
                        },
                    }
                }
            },
            MINT_OPERATION_TYPE | MINTV2_OPERATION_TYPE => {
                let Some(transaction) = self
                    .mint_ops
                    .get_transaction(self, operation_id, entry, fedi_fee_msats)
                    .await?
                else {
                    return Ok(None);
                };
                transaction_amount = transaction.amount;
                frontend_metadata = transaction.frontend_metadata;
                transaction_kind = transaction.kind;
            }
            WALLET_OPERATION_TYPE | WALLETV2_OPERATION_TYPE => {
                let Some(transaction) = self
                    .wallet_ops
                    .get_transaction(self, operation_id, entry, fedi_fee_msats)
                    .await?
                else {
                    return Ok(None);
                };
                transaction_amount = transaction.amount;
                frontend_metadata = transaction.frontend_metadata;
                transaction_kind = transaction.kind;
            }
            _ => {
                bail!(
                    "Found unimplemented for module with operation type = {}",
                    entry.operation_module_kind()
                );
            }
        }
        let frontend_metadata = frontend_metadata.unwrap_or_default();
        Ok(Some(RpcTransaction {
            id: operation_id.fmt_full().to_string(),
            amount: transaction_amount,
            fedi_app_fee_status: app_fedi_fee_status,
            fedi_guardian_fee_status: guardian_fedi_fee_status,
            txn_notes: notes.or_else(|| frontend_metadata.initial_notes.clone()),
            tx_date_fiat_info,
            frontend_metadata,
            kind: transaction_kind,
            outcome_time: outcome_time.and_then(|x| to_unix_time(x).ok()),
        }))
    }

    pub async fn update_transaction_notes(
        &self,
        transaction: OperationId,
        notes: String,
    ) -> Result<()> {
        let mut dbtx = self.dbtx().await;
        dbtx.insert_entry(&TransactionNotesKey(transaction), &notes)
            .await;
        dbtx.commit_tx_result().await.context("DbError")
    }

    // FIXME this is busted in social recovery
    pub async fn get_invite_code(&self) -> String {
        self.dbtx()
            .await
            .get_value(&InviteCodeKey)
            .await
            .expect("invite code must exist")
    }

    pub(crate) async fn update_operation_state<T>(&self, operation_id: OperationId, state: T)
    where
        T: MaybeSend + MaybeSync + 'static,
    {
        self.operation_states
            .lock()
            .await
            .insert(operation_id, Box::new(state));
    }

    async fn get_operation_state<T>(&self, operation_id: &OperationId) -> anyhow::Result<Option<T>>
    where
        T: Clone + 'static,
    {
        match self.operation_states.lock().await.get(operation_id) {
            Some(state) => match state.downcast_ref::<T>() {
                Some(state) => Ok(Some(state.clone())),
                None => bail!("Incorrect type for {:?}", operation_id),
            },
            None => Ok(None),
        }
    }

    /// Returns the latest cached sync response representing the seeker's last
    /// know SPv2 state. Getting the cached response should be sufficient
    /// because the value only updates once per cycle, and we already have a
    /// background service that automatically fetches and caches the state every
    /// cycle.
    pub async fn spv2_account_info(&self) -> Result<CachedSyncResponseValue> {
        let spv2 = self.client.spv2()?;
        let account_id = spv2.our_account(AccountType::Seeker).id();

        spv2.db
            .clone()
            .begin_transaction_nc()
            .await
            .get_value(&CachedSyncResponseKey { account_id })
            .await
            .ok_or(ErrorCode::BadRequest.into())
    }

    /// Same as [`spv2_account_info`] except that it returns an Observable that
    /// emits new values whenever the CachedSyncResponse in the DB updates.
    pub async fn spv2_subscribe_account_info(
        &self,
    ) -> Result<impl Stream<Item = RpcSPv2CachedSyncResponse> + use<>> {
        self.client.spv2()?;
        let Some(sync_service) = self.spv2_sync_service.get() else {
            bail!("Unexpected: sync service must have been initialized");
        };

        Ok(sync_service
            .subscribe_to_updates()
            .filter_map(|sync| async { sync.map(|sync| sync.into()) }))
    }

    pub fn spv2_start_fast_sync(&self) -> Result<()> {
        self.client.spv2()?;
        let Some(sync_service) = self.spv2_sync_service.get() else {
            bail!("Unexpected: sync service must have been initialized");
        };
        sync_service.start_fast_syncing();
        Ok(())
    }

    /// Returns the start time of the next cycle by adding cycle duration to the
    /// start time of the last known cycle as recorded in the cached sync
    /// response.
    pub async fn spv2_next_cycle_start_time(&self) -> Result<u64> {
        let sync_response = self.spv2_account_info().await?;
        let config = &self.client.spv2()?.cfg;

        let next_time = sync_response
            .value
            .current_cycle
            .start_time
            .checked_add(config.cycle_duration)
            .ok_or(anyhow!(ErrorCode::BadRequest))?;
        to_unix_time(next_time)
    }

    /// Returns the average fee rate over the last x cycles. Server enforces a
    /// cap on x, but perhaps going back 10-50 cycles is good enough.
    pub async fn spv2_average_fee_rate(&self, num_cycles: u64) -> Result<u64> {
        let spv2 = self.client.spv2()?;
        spv2.average_fee_rate(num_cycles)
            .await
            .map(|rate| rate.0)
            .context("Error when fetching average fee rate")
    }

    /// Returns the staged provider liquidity currently available to satisfy new
    /// seeks. Allows blocking seeks that we know up-front will not be satisfied
    /// at this time.
    pub async fn spv2_available_liquidity(&self) -> Result<RpcAmount> {
        let spv2 = self.client.spv2()?;
        let stats = spv2
            .liquidity_stats()
            .await
            .context("Error when fetching liquidity stats")?;
        Ok(RpcAmount(Amount::from_msats(
            stats.staged_provides_sum_msat,
        )))
    }

    /// Estimates fees for depositing into the v2 stability pool module.
    pub async fn estimate_spv2_deposit_fees(&self, amount: Amount) -> Result<RpcFeeDetails> {
        let fees_by_stream = self
            .get_fee_amounts_by_stream(
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        Ok(Self::fedi_fee_details_from_streams(&fees_by_stream))
    }

    /// Deposit the given amount of msats into the stability pool
    /// with the intention of seeking. Once the fedimint transaction
    /// is accepted, the deposit is staged (pending). When the next
    /// cycle turnover occurs, staged seeks are processed in order
    /// to produce locks.
    pub async fn spv2_deposit_to_seek(
        &self,
        amount: Amount,
        frontend_meta: FrontendMetadata,
    ) -> Result<OperationId> {
        let spv2 = self.client.spv2()?;
        let fee_ppms = self
            .get_fee_ppms_by_stream(
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fees_by_stream = self
            .get_fee_amounts_by_stream(
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let fedi_fee = Self::total_fedi_fee_amount(&fees_by_stream);
        let spend_guard = self.spend_guard.lock().await;
        let virtual_balance = self.get_balance().await;
        if amount + fedi_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(
                    virtual_balance,
                    Self::total_fedi_fee_ppm(&fee_ppms),
                    None,
                    None,
                )
            )));
        }

        let operation_id = spv2
            .deposit_to_seek(
                amount,
                SPv2DepositMetadata::StableBalance {
                    frontend_metadata: Some(frontend_meta),
                },
            )
            .await?;
        self.write_pending_send_fedi_fees(operation_id, &fees_by_stream)
            .await?;
        let _ = self
            .record_tx_date_fiat_info(operation_id, amount + fedi_fee)
            .await;
        drop(spend_guard);

        if let Ok(index) = self
            .spv2_account_info()
            .await
            .map(|info| info.value.current_cycle.idx)
        {
            // This is not critical so we ignore the result
            let autocommit_res = self
                .client
                .db()
                .autocommit(
                    |dbtx, _| {
                        Box::pin(async move {
                            dbtx.insert_entry(&LastStabilityPoolV2DepositCycleKey, &index)
                                .await;
                            Ok::<(), anyhow::Error>(())
                        })
                    },
                    Some(100),
                )
                .await;

            if let Err(e) = autocommit_res {
                error!(?e, "Error while writing last SP deposit cycle");
            }
        }

        self.spawn_cancellable("subscribe_spv2_deposit", move |fed| async move {
            fed.subscribe_spv2_deposit_to_seek(operation_id).await
        });
        Ok(operation_id)
    }

    pub(crate) async fn subscribe_spv2_deposit_to_seek(&self, operation_id: OperationId) {
        let Ok(spv2) = self.client.spv2() else {
            return;
        };

        let Some(operation) = self
            .client
            .operation_log()
            .get_operation(operation_id)
            .await
        else {
            return;
        };
        let update_stream = match operation.meta::<StabilityPoolMeta>() {
            StabilityPoolMeta::Deposit { .. } => {
                spv2.subscribe_deposit_operation(operation_id).await
            }
            _ => return,
        };
        if let Ok(update_stream) = update_stream {
            let mut updates = update_stream.into_stream();
            while let Some(state) = updates.next().await {
                self.update_operation_state(operation_id, state.clone())
                    .await;
                match state {
                    StabilityPoolDepositOperationState::TxRejected(_)
                    | StabilityPoolDepositOperationState::PrimaryOutputError(_) => {
                        let _ = self.write_failed_send_fedi_fees(operation_id).await;
                    }
                    StabilityPoolDepositOperationState::Success => {
                        // Force sync spv2 once deposit op is complete
                        self.spv2_force_sync();
                        let _ = self.write_success_send_fedi_fees(operation_id).await;
                    }
                    _ => (),
                }
                self.runtime.event_sink.typed_event(&Event::spv2_deposit(
                    self.federation_id().to_string(),
                    operation_id,
                    state,
                ));
            }
        } else {
            // TODO shaurya ok to ignore result? Or should bridge panic if error?
            let _ = self.write_failed_send_fedi_fees(operation_id).await;
        }
    }

    /// Starting with staged seeks, withdraw from both staged and locked seeks,
    /// by implicitly waiting for cycle turnover for the locked seeks to be
    /// freed up. The overall operation only completes when both parts have
    /// completed.
    pub async fn spv2_withdraw(
        &self,
        amount: FiatOrAll,
        frontend_meta: FrontendMetadata,
    ) -> Result<OperationId> {
        let spv2 = self.client.spv2()?;
        let fee_ppms = self
            .get_fee_ppms_by_stream(
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let (operation_id, _) = spv2
            .withdraw(
                AccountType::Seeker,
                amount,
                SPv2WithdrawMetadata::StableBalance {
                    frontend_metadata: Some(frontend_meta),
                },
            )
            .await?;
        self.write_pending_receive_fedi_fee_ppms(operation_id, &fee_ppms)
            .await?;
        self.spawn_cancellable("subscribe_spv2_withdraw", move |fed| async move {
            fed.subscribe_spv2_withdraw(operation_id).await
        });
        Ok(operation_id)
    }

    async fn enable_guardian_remittance_account(&self) -> anyhow::Result<()> {
        let federation_id = self.federation_id().to_string();
        self.runtime
            .app_state
            .with_write_lock(move |state| {
                let Some(fed_info) = state.joined_federations.get_mut(&federation_id) else {
                    bail!("federation not found in app state");
                };
                fed_info.guardian_remittance_account_enabled = true;
                Ok(())
            })
            .await??;
        self.start_guardian_remittance_account().await?;
        Ok(())
    }

    pub async fn spv2_guardian_remittance_account_info(
        &self,
    ) -> anyhow::Result<RpcGuardianRemittanceAccountInfo> {
        let spv2 = self.client.spv2()?;
        let account = spv2.our_account(AccountType::BtcDepositor);
        Ok(RpcGuardianRemittanceAccountInfo {
            serialized_account: serde_json::to_string(&account)?,
        })
    }

    pub async fn spv2_withdraw_guardian_remittance_all(&self) -> Result<()> {
        let spv2 = self.client.spv2()?;
        let (operation_id, _) = spv2
            .withdraw(
                stability_pool_client::common::AccountType::BtcDepositor,
                stability_pool_client::common::FiatOrAll::All,
                SPv2WithdrawMetadata::GuardianRemittanceAccount,
            )
            .await?;
        self.subscribe_guardian_remittance_withdraw(operation_id)
            .await;
        Ok(())
    }

    pub async fn spv2_subscribe_guardian_remittance_dashboard(
        &self,
    ) -> anyhow::Result<impl Stream<Item = RpcGuardianRemittanceDashboard> + use<>> {
        self.enable_guardian_remittance_account().await?;
        self.guardian_remittance_account()?
            .subscribe_dashboard(self)
    }

    pub async fn spv2_subscribe_guardian_remittance_balance(
        &self,
    ) -> anyhow::Result<impl Stream<Item = RpcAmount> + use<>> {
        self.enable_guardian_remittance_account().await?;
        Ok(self.guardian_remittance_account()?.subscribe_balance())
    }

    async fn subscribe_spv2_withdraw(&self, operation_id: OperationId) {
        let Ok(spv2) = self.client.spv2() else {
            return;
        };

        let update_stream = spv2.subscribe_withdraw(operation_id).await;
        if let Ok(update_stream) = update_stream {
            let mut updates = update_stream.into_stream();
            while let Some(state) = updates.next().await {
                self.update_operation_state(operation_id, state.clone())
                    .await;
                match state {
                    StabilityPoolWithdrawalOperationState::Success(amount) => {
                        // Force sync spv2 once withdrawal op is complete
                        self.spv2_force_sync();

                        let _ = self
                            .write_success_receive_fedi_fees(operation_id, amount)
                            .await;
                        let _ = self.record_tx_date_fiat_info(operation_id, amount).await;
                    }
                    StabilityPoolWithdrawalOperationState::UnlockTxRejected(_)
                    | StabilityPoolWithdrawalOperationState::UnlockProcessingError(_)
                    | StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(_)
                    | StabilityPoolWithdrawalOperationState::PrimaryOutputError(_) => {
                        let _ = self.write_failed_receive_fedi_fees(operation_id).await;
                    }
                    StabilityPoolWithdrawalOperationState::UnlockTxAccepted => {
                        // Force sync spv2 once unlock TX is accepted
                        self.spv2_force_sync();
                    }
                    _ => (),
                }
                self.runtime.event_sink.typed_event(&Event::spv2_withdrawal(
                    self.federation_id().to_string(),
                    operation_id,
                    state,
                ))
            }
        }
    }

    async fn subscribe_guardian_remittance_withdraw(&self, operation_id: OperationId) {
        let Ok(spv2) = self.client.spv2() else {
            return;
        };
        let Ok(account) = self.start_guardian_remittance_account().await else {
            error!("failed to initialize guardian remittance account for withdrawal subscription");
            return;
        };

        let update_stream = spv2.subscribe_withdraw(operation_id).await;
        if let Ok(update_stream) = update_stream {
            let mut updates = update_stream.into_stream();
            while let Some(state) = updates.next().await {
                self.update_operation_state(operation_id, state.clone())
                    .await;
                match state {
                    StabilityPoolWithdrawalOperationState::Success(_)
                    | StabilityPoolWithdrawalOperationState::UnlockTxAccepted => {
                        let res = account.update_once().await;
                        if let Err(e) = res {
                            error!(%e, "Error syncing guardian remittance account");
                        }
                    }
                    _ => {}
                }
                self.runtime.event_sink.typed_event(&Event::spv2_withdrawal(
                    self.federation_id().to_string(),
                    operation_id,
                    state,
                ));
            }
        }
    }

    /// See [`Self::spv2_transfer`]
    pub async fn spv2_simple_transfer(
        &self,
        to_account: AccountId,
        amount: FiatAmount,
        meta: SPv2TransferMetadata,
        transfer_meta: Spv2TransferTxMeta,
    ) -> Result<OperationId> {
        ensure!(to_account.acc_type() == AccountType::Seeker);
        let request = self.spv2_build_signed_transfer_request_with_nonce(
            rand::random(),
            to_account,
            amount,
            transfer_meta,
        )?;
        self.spv2_transfer(request, meta).await
    }

    /// Submit the given [`SignedTransferRequest`] for processing. Like
    /// withdrawals, transfer first use staged deposits, and then locked
    /// deposits (if needed). However, unlike withdrawals, transfers are
    /// "instant" in that they do not need to await any cycle turnover.
    /// Transfers are considered completed as soon as the initial transaction is
    /// accepted and processed by the server. For the basic use case of
    /// transferring to another account ID from this client's seeker
    /// account, use the helper method [`Self::spv2_simple_transfer`].
    pub async fn spv2_transfer(
        &self,
        signed_request: SignedTransferRequest,
        meta: SPv2TransferMetadata,
    ) -> Result<OperationId> {
        let spv2 = self.client.spv2()?;

        // TODO shaurya skipping fee for now as it's unclear how to charge fee for
        // transfers. We cannot simply a charge a portion of the amount being
        // transferred since:
        // 1. We don't always know the amount (it could be ALL)
        // 2. The submitter of the TX might not be the sender or the recipient

        let operation_id = spv2.transfer(signed_request, meta).await?;
        self.subscribe_to_operation(operation_id).await?;
        Ok(operation_id)
    }

    /// Build a SignedTransferRequest using an explicit nonce for idempotency.
    pub fn spv2_build_signed_transfer_request_with_nonce(
        &self,
        nonce: u64,
        to_account: AccountId,
        amount: FiatAmount,
        transfer_meta: Spv2TransferTxMeta,
    ) -> anyhow::Result<SignedTransferRequest> {
        let spv2 = self.client.spv2()?;
        let request = TransferRequest::new(
            nonce,
            spv2.our_account(AccountType::Seeker),
            amount,
            to_account,
            transfer_meta.encode(),
            u64::MAX,
            None,
        )?;
        let signature = spv2.sign_transfer_request(&request);
        let mut signatures = BTreeMap::new();
        signatures.insert(0, signature);
        SignedTransferRequest::new(request, signatures)
    }

    async fn subscribe_spv2_transfer(
        &self,
        operation_id: OperationId,
        txid: TransactionId,
        signed_request: SignedTransferRequest,
        extra_meta: serde_json::Value,
    ) {
        let Ok(spv2) = self.client.spv2() else {
            return;
        };

        let update_stream = spv2.subscribe_transfer_operation(operation_id).await;
        if let Ok(update_stream) = update_stream {
            let mut updates = update_stream.into_stream();
            while let Some(state) = updates.next().await {
                match state {
                    StabilityPoolTransferOperationState::Initiated => (),
                    StabilityPoolTransferOperationState::Success => {
                        // Force sync spv2 once TX is accepted
                        self.spv2_force_sync();
                        // send multispend completion notification
                        match serde_json::from_value::<SPv2TransferMetadata>(extra_meta.clone()) {
                            Ok(SPv2TransferMetadata::MultispendDeposit {
                                room,
                                description,
                                ..
                            }) => {
                                self.multispend_services
                                    .add_deposit_notification(
                                        room,
                                        signed_request.details().amount(),
                                        txid,
                                        description,
                                    )
                                    .await;
                            }
                            Ok(SPv2TransferMetadata::MultispendWithdrawal { room, request_id }) => {
                                self.multispend_services
                                    .add_withdrawal_notification(
                                        room,
                                        request_id,
                                        signed_request.details().amount(),
                                        txid,
                                    )
                                    .await;
                            }
                            Ok(SPv2TransferMetadata::MatrixSpTransfer { transfer_id }) => {
                                self.spt_notifications
                                    .add_spt_completion_notification(
                                        transfer_id,
                                        self.federation_id().to_string(),
                                        signed_request.details().amount(),
                                        txid,
                                    )
                                    .await;
                            }
                            Ok(SPv2TransferMetadata::StableBalance { .. }) | Err(_) => {}
                        }
                    }
                    StabilityPoolTransferOperationState::TxRejected(ref error) => {
                        match serde_json::from_value::<SPv2TransferMetadata>(extra_meta.clone()) {
                            Ok(SPv2TransferMetadata::MultispendWithdrawal { room, request_id }) => {
                                self.multispend_services
                                    .add_failed_withdrawal_notification(
                                        room,
                                        request_id,
                                        error.to_string(),
                                    )
                                    .await;
                            }
                            Ok(SPv2TransferMetadata::MatrixSpTransfer { transfer_id }) => {
                                self.spt_notifications
                                    .add_spt_failed_notification(transfer_id)
                                    .await;
                            }
                            Ok(
                                SPv2TransferMetadata::StableBalance { .. }
                                | SPv2TransferMetadata::MultispendDeposit { .. },
                            )
                            | Err(_) => {}
                        }
                    }
                }

                self.update_operation_state(operation_id, state.clone())
                    .await;
                self.runtime.event_sink.typed_event(&Event::spv2_transfer(
                    self.federation_id().to_string(),
                    operation_id,
                    state,
                ));
            }
        }
    }

    pub async fn spv2_user_op_history_item(
        &self,
        txid: TransactionId,
    ) -> Option<UserOperationHistoryItem> {
        let spv2 = self.client.spv2().ok()?;
        let account_id = spv2.our_account(AccountType::Seeker).id();

        spv2.db
            .clone()
            .begin_transaction_nc()
            .await
            .get_value(&UserOperationHistoryItemKey { account_id, txid })
            .await
    }

    async fn spv2_guardian_remittance_op_history_item(
        &self,
        txid: TransactionId,
    ) -> Option<UserOperationHistoryItem> {
        let spv2 = self.client.spv2().ok()?;
        let account_id = spv2.our_account(AccountType::BtcDepositor).id();

        spv2.db
            .clone()
            .begin_transaction_nc()
            .await
            .get_value(&UserOperationHistoryItemKey { account_id, txid })
            .await
    }

    async fn spv2_seek_lifetime_fee(&self, txid: TransactionId) -> Option<Amount> {
        let spv2 = self.client.spv2().ok()?;

        spv2.db
            .clone()
            .begin_transaction_nc()
            .await
            .get_value(&SeekLifetimeFeeKey(txid))
            .await
    }

    fn spv2_our_seeker_account(&self) -> Option<Account> {
        let spv2 = self.client.spv2().ok()?;
        Some(spv2.our_account(AccountType::Seeker))
    }

    pub fn spv2_force_sync(&self) {
        self.spawn_cancellable("spv2_force_sync", |fed| async move {
            if let Some(sync_service) = fed.spv2_sync_service.get() {
                let res = sync_service.update_once().await;
                if let Err(e) = res {
                    error!(%e, "Error syncing spv2 state");
                }
            }
        });
    }

    /// Stability Pool
    ///
    /// Get user's stability pool account info
    pub async fn stability_pool_account_info(
        &self,
        force_update: bool,
    ) -> Result<ClientAccountInfo> {
        self.client
            .sp()?
            .account_info(force_update)
            .await
            .context("Error when fetching account info")
    }

    pub async fn stability_pool_next_cycle_start_time(&self) -> Result<u64> {
        self.client
            .sp()?
            .next_cycle_start_time()
            .await
            .context("Error when fetching next cycle start time")
    }

    pub async fn stability_pool_cycle_start_price(&self) -> Result<u64> {
        self.client
            .sp()?
            .cycle_start_price()
            .await
            .context("Error when fetching cycle start price")
    }

    pub async fn stability_pool_average_fee_rate(&self, num_cycles: u64) -> Result<u64> {
        self.client
            .sp()?
            .average_fee_rate(num_cycles)
            .await
            .context("Error when fetching average fee rate")
    }

    pub async fn stability_pool_available_liquidity(&self) -> Result<RpcAmount> {
        let stats = self
            .client
            .sp()?
            .liquidity_stats()
            .await
            .context("Error when fetching liquidity stats")?;
        Ok(RpcAmount(Amount::from_msats(
            stats.staged_provides_sum_msat,
        )))
    }

    /// Estimates fees for depositing into the v1 stability pool module.
    pub async fn estimate_stability_pool_deposit_fees(
        &self,
        amount: Amount,
    ) -> Result<RpcFeeDetails> {
        let fees_by_stream = self
            .get_fee_amounts_by_stream(
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        Ok(Self::fedi_fee_details_from_streams(&fees_by_stream))
    }

    /// Deposit the given amount of msats into the stability pool
    /// with the intention of seeking. Once the fedimint transaction
    /// is accepted, the deposit is staged (pending). When the next
    /// cycle turnover occurs, staged seeks are processed in order
    /// to produce locks.
    pub async fn stability_pool_deposit_to_seek(&self, amount: Amount) -> Result<OperationId> {
        let fee_ppms = self
            .get_fee_ppms_by_stream(
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fees_by_stream = self
            .get_fee_amounts_by_stream(
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let fedi_fee = Self::total_fedi_fee_amount(&fees_by_stream);
        let spend_guard = self.spend_guard.lock().await;
        let virtual_balance = self.get_balance().await;
        if amount + fedi_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(
                    virtual_balance,
                    Self::total_fedi_fee_ppm(&fee_ppms),
                    None,
                    None,
                )
            )));
        }

        let module = self.client.sp()?;
        let operation_id = module.deposit_to_seek(amount).await?;
        self.write_pending_send_fedi_fees(operation_id, &fees_by_stream)
            .await?;
        let _ = self
            .record_tx_date_fiat_info(operation_id, amount + fedi_fee)
            .await;
        drop(spend_guard);

        if let Ok(index) = module.current_cycle_index().await {
            // This is not critical so we ignore the result
            let autocommit_res = self
                .client
                .db()
                .autocommit(
                    |dbtx, _| {
                        Box::pin(async move {
                            dbtx.insert_entry(&LastStabilityPoolDepositCycleKey, &index)
                                .await;
                            Ok::<(), anyhow::Error>(())
                        })
                    },
                    Some(100),
                )
                .await;

            if let Err(e) = autocommit_res {
                error!(?e, "Error while writing last SP deposit cycle");
            }
        }

        self.spawn_cancellable("subscribe_stability_pool_deposit", move |fed| async move {
            fed.subscribe_stability_pool_deposit_to_seek(operation_id)
                .await
        });
        Ok(operation_id)
    }

    /// Withdraw both unlocked and locked balances, by implicitly waiting for
    /// cycle turnover for the locked balances to be freed up.
    /// `unlocked_amount` is extracted from staged seeks (pending deposits).
    /// `locked_bps` is extracted from locked seeks (completed deposits). The
    /// overall operation only completes when both parts have completed.
    /// Note that we can't delay withdrawing staged balance under the hood
    /// as it may otherwise become locked. Instead we focus on the overall
    /// operation lifecycle as far as UX is concerned.
    pub async fn stability_pool_withdraw(
        &self,
        unlocked_amount: Amount,
        locked_bps: u32,
    ) -> Result<OperationId> {
        let fee_ppms = self
            .get_fee_ppms_by_stream(
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let (operation_id, _) = self
            .client
            .sp()?
            .withdraw(unlocked_amount, locked_bps)
            .await?;
        self.write_pending_receive_fedi_fee_ppms(operation_id, &fee_ppms)
            .await?;
        self.spawn_cancellable("subscribe_stability_pool_withdraw", move |fed| async move {
            fed.subscribe_stability_pool_withdraw(operation_id).await
        });
        Ok(operation_id)
    }

    async fn subscribe_stability_pool_deposit_to_seek(&self, operation_id: OperationId) {
        let Ok(stability_pool) = self.client.sp() else {
            return;
        };

        let update_stream = stability_pool
            .subscribe_deposit_operation(operation_id)
            .await;
        if let Ok(update_stream) = update_stream {
            let mut updates = update_stream.into_stream();
            while let Some(state) = updates.next().await {
                self.update_operation_state(operation_id, state.clone())
                    .await;
                match state {
                    stability_pool_client_old::StabilityPoolDepositOperationState::TxRejected(_)
                    | stability_pool_client_old::StabilityPoolDepositOperationState::PrimaryOutputError(_) => {
                        let _ = self.write_failed_send_fedi_fees(operation_id).await;
                    }
                    stability_pool_client_old::StabilityPoolDepositOperationState::Success => {
                        let _ = self.write_success_send_fedi_fees(operation_id).await;
                    }
                    _ => (),
                }
                self.runtime
                    .event_sink
                    .typed_event(&Event::stability_pool_deposit(
                        self.federation_id().to_string(),
                        operation_id,
                        state,
                    ));
            }
        } else {
            // TODO shaurya ok to ignore result? Or should bridge panic if error?
            let _ = self.write_failed_send_fedi_fees(operation_id).await;
        }
    }

    async fn subscribe_stability_pool_withdraw(&self, operation_id: OperationId) {
        let Ok(stability_pool) = self.client.sp() else {
            return;
        };

        let update_stream = stability_pool.subscribe_withdraw(operation_id).await;
        if let Ok(update_stream) = update_stream {
            let mut updates = update_stream.into_stream();
            while let Some(state) = updates.next().await {
                self.update_operation_state(operation_id, state.clone())
                    .await;
                match state {
                    stability_pool_client_old::StabilityPoolWithdrawalOperationState::Success(amount) => {
                        let _ = self
                            .write_success_receive_fedi_fees(operation_id, amount)
                            .await;
                        let _ = self.record_tx_date_fiat_info(operation_id, amount).await;
                    }
                    stability_pool_client_old::StabilityPoolWithdrawalOperationState::InvalidOperationType
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::TxRejected(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::PrimaryOutputError(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::CancellationSubmissionFailure(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::AwaitCycleTurnoverError(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawIdleSubmissionFailure(_) => {
                        let _ = self.write_failed_receive_fedi_fees(operation_id).await;
                    }
                    _ => (),
                }
                self.runtime
                    .event_sink
                    .typed_event(&Event::stability_pool_withdrawal(
                        self.federation_id().to_string(),
                        operation_id,
                        state,
                    ))
            }
        }
    }

    pub async fn generate_reused_ecash_proofs(
        &self,
    ) -> anyhow::Result<SerializedReusedEcashProofs> {
        self.mint_ops.generate_reused_ecash_proofs(self).await
    }

    async fn write_pending_send_fedi_fees(
        &self,
        operation_id: OperationId,
        fees_by_stream: &[(FediFeeStream, Amount)],
    ) -> anyhow::Result<()> {
        let module = ModuleKind::clone_from_str(
            self.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .ok_or(anyhow!("operation not found!"))?
                .operation_module_kind(),
        );
        let res = self
            .fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        let fees_by_stream = fees_by_stream.to_vec();
                        async move {
                            for (stream, fedi_fee) in fees_by_stream {
                                Self::insert_pending_send_fedi_fee_in_db(
                                    dbtx,
                                    stream,
                                    operation_id,
                                    module.clone(),
                                    fedi_fee,
                                )
                                .await?;
                            }
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit();

        match res {
            Ok(_) => info!(
                "Successfully wrote pending send fedi fees for op ID {}",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing pending send fedi fees for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
    }

    async fn write_success_send_fedi_fees(&self, operation_id: OperationId) -> anyhow::Result<()> {
        let module = ModuleKind::clone_from_str(
            self.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .ok_or(anyhow!("operation not found!"))?
                .operation_module_kind(),
        );
        let res = self
            .fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        async move {
                            let app_changed = Self::transition_success_send_fedi_fee_in_db(
                                dbtx,
                                FediFeeStream::App,
                                operation_id,
                                module.clone(),
                            )
                            .await?;
                            Self::transition_success_send_fedi_fee_in_db(
                                dbtx,
                                FediFeeStream::Guardian,
                                operation_id,
                                module,
                            )
                            .await?;
                            Ok::<bool, anyhow::Error>(app_changed)
                        }
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit();

        match res {
            Ok(app_changed) => {
                if app_changed && let Some(service) = self.fedi_fee_remittance_service.get() {
                    service.remit_fedi_fee_if_threshold_met(self).await;
                }
                info!(
                    "Successfully wrote success send fedi fees for op ID {}",
                    operation_id.fmt_short()
                );
                Ok(())
            }
            Err(e) => {
                warn!(
                    "Error writing success send fedi fees for op ID {}: {}",
                    operation_id.fmt_short(),
                    e
                );
                Err(e)
            }
        }
    }

    async fn write_failed_send_fedi_fees(&self, operation_id: OperationId) -> anyhow::Result<()> {
        let module = ModuleKind::clone_from_str(
            self.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .ok_or(anyhow!("operation not found!"))?
                .operation_module_kind(),
        );
        let res = self
            .fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        async move {
                            Self::transition_failed_send_fedi_fee_in_db(
                                dbtx,
                                FediFeeStream::App,
                                operation_id,
                                module.clone(),
                            )
                            .await?;
                            Self::transition_failed_send_fedi_fee_in_db(
                                dbtx,
                                FediFeeStream::Guardian,
                                operation_id,
                                module,
                            )
                            .await?;
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit();

        match res {
            Ok(_) => info!(
                "Successfully wrote failed send fedi fees for op ID {}",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing failed send fedi fees for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
    }

    async fn write_pending_receive_fedi_fee_ppms(
        &self,
        operation_id: OperationId,
        fee_ppms: &[(FediFeeStream, u64)],
    ) -> anyhow::Result<()> {
        let res = self
            .fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let fee_ppms = fee_ppms.to_vec();
                        async move {
                            for (stream, fedi_fee_ppm) in fee_ppms {
                                Self::insert_pending_receive_fedi_fee_ppm_in_db(
                                    dbtx,
                                    stream,
                                    operation_id,
                                    fedi_fee_ppm,
                                )
                                .await?;
                            }
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit();

        match res {
            Ok(_) => info!(
                "Successfully wrote pending receive fedi fees for op ID {}",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing pending receive fedi fees for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
    }

    async fn write_success_receive_fedi_fees(
        &self,
        operation_id: OperationId,
        amount: Amount,
    ) -> anyhow::Result<()> {
        let module = ModuleKind::clone_from_str(
            self.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .ok_or(anyhow!("operation not found!"))?
                .operation_module_kind(),
        );
        let res = self
            .fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        async move {
                            let app_changed = Self::transition_success_receive_fedi_fee_in_db(
                                dbtx,
                                FediFeeStream::App,
                                operation_id,
                                module.clone(),
                                amount,
                            )
                            .await?;
                            Self::transition_success_receive_fedi_fee_in_db(
                                dbtx,
                                FediFeeStream::Guardian,
                                operation_id,
                                module,
                                amount,
                            )
                            .await?;
                            Ok::<bool, anyhow::Error>(app_changed)
                        }
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit();

        match res {
            Ok(app_changed) => {
                if app_changed && let Some(service) = self.fedi_fee_remittance_service.get() {
                    service.remit_fedi_fee_if_threshold_met(self).await;
                }
                info!(
                    "Successfully wrote success receive fedi fees for op ID {}",
                    operation_id.fmt_short()
                );
                Ok(())
            }
            Err(e) => {
                warn!(
                    "Error writing success receive fedi fees for op ID {}: {}",
                    operation_id.fmt_short(),
                    e
                );
                Err(e)
            }
        }
    }

    async fn write_failed_receive_fedi_fees(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<()> {
        let res = self
            .fedi_fee_db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async move {
                        Self::transition_failed_receive_fedi_fee_in_db(
                            dbtx,
                            FediFeeStream::App,
                            operation_id,
                        )
                        .await?;
                        Self::transition_failed_receive_fedi_fee_in_db(
                            dbtx,
                            FediFeeStream::Guardian,
                            operation_id,
                        )
                        .await?;
                        Ok::<(), anyhow::Error>(())
                    })
                },
                None,
            )
            .await
            .unwrap_autocommit();

        match res {
            Ok(_) => info!(
                "Successfully wrote failed receive fedi fees for op ID {}",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing failed receive fedi fees for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
    }

    async fn insert_pending_send_fedi_fee_in_db(
        dbtx: &mut DatabaseTransaction<'_>,
        stream: FediFeeStream,
        operation_id: OperationId,
        module: ModuleKind,
        fedi_fee: Amount,
    ) -> anyhow::Result<()> {
        let pending_tx_type_key =
            PendingFediFeesByStreamPerTXTypeKey(stream, module, RpcTransactionDirection::Send);
        let pending_key = PendingFediFeesByStreamKey(stream);
        let pending_tx_type_fees = fedi_fee
            + dbtx
                .get_value(&pending_tx_type_key)
                .await
                .unwrap_or(Amount::ZERO);
        let pending_fees = fedi_fee + dbtx.get_value(&pending_key).await.unwrap_or(Amount::ZERO);
        dbtx.insert_entry(
            &OperationFediFeeStatusByStreamKey(operation_id, stream),
            &OperationFediFeeStatus::PendingSend { fedi_fee },
        )
        .await;
        dbtx.insert_entry(&pending_tx_type_key, &pending_tx_type_fees)
            .await;
        dbtx.insert_entry(&pending_key, &pending_fees).await;
        Ok(())
    }

    /// Transitions the OperationFediFeeStatus for a send operation from pending
    /// to success, iff the status is currently pending. Therefore the
    /// transition only happens once. When this transition happens, the pending
    /// counter is reduced and the accrued counter increased by the operation's
    /// fee amount. Returns Ok((true, new_status)) if a DB write actually
    /// occurred, and Ok((false, current_status)) if no write was needed,
    /// meaning that the status has already been recorded as a success.
    async fn transition_success_send_fedi_fee_in_db(
        dbtx: &mut DatabaseTransaction<'_>,
        stream: FediFeeStream,
        operation_id: OperationId,
        module: ModuleKind,
    ) -> anyhow::Result<bool> {
        let op_key = OperationFediFeeStatusByStreamKey(operation_id, stream);
        match dbtx.get_value(&op_key).await {
            Some(OperationFediFeeStatus::PendingSend { fedi_fee }) => {
                let new_status = OperationFediFeeStatus::Success { fedi_fee };
                dbtx.insert_entry(&op_key, &new_status).await;

                let pending_tx_type_key = PendingFediFeesByStreamPerTXTypeKey(
                    stream,
                    module.clone(),
                    RpcTransactionDirection::Send,
                );
                let pending_key = PendingFediFeesByStreamKey(stream);
                let pending_tx_type_fees = dbtx
                    .get_value(&pending_tx_type_key)
                    .await
                    .unwrap_or(Amount::ZERO)
                    .saturating_sub(fedi_fee);
                let pending_fees = dbtx
                    .get_value(&pending_key)
                    .await
                    .unwrap_or(Amount::ZERO)
                    .saturating_sub(fedi_fee);
                dbtx.insert_entry(&pending_tx_type_key, &pending_tx_type_fees)
                    .await;
                dbtx.insert_entry(&pending_key, &pending_fees).await;

                let outstanding_tx_type_key = OutstandingFediFeesByStreamPerTXTypeKey(
                    stream,
                    module.clone(),
                    RpcTransactionDirection::Send,
                );
                let outstanding_key = OutstandingFediFeesByStreamKey(stream);
                let outstanding_tx_type_fees = fedi_fee
                    + dbtx
                        .get_value(&outstanding_tx_type_key)
                        .await
                        .unwrap_or(Amount::ZERO);
                let outstanding_fees = fedi_fee
                    + dbtx
                        .get_value(&outstanding_key)
                        .await
                        .unwrap_or(Amount::ZERO);
                dbtx.insert_entry(&outstanding_tx_type_key, &outstanding_tx_type_fees)
                    .await;
                dbtx.insert_entry(&outstanding_key, &outstanding_fees).await;
                if stream == FediFeeStream::App {
                    let total_accrued_key = TotalAccruedFediFeesByStreamKey(FediFeeStream::App);
                    let total_accrued_fees = fedi_fee
                        + dbtx
                            .get_value(&total_accrued_key)
                            .await
                            .unwrap_or(Amount::ZERO);
                    dbtx.insert_entry(&total_accrued_key, &total_accrued_fees)
                        .await;
                }
                Ok(true)
            }
            Some(OperationFediFeeStatus::Success { .. }) => Ok(false),
            Some(_) => bail!("Invalid operation fedi fee status found!"),
            // Operations that were started before guardian fees existed will not
            // have a guardian fee-status row. Treat that as a no-op on upgrade.
            None if stream == FediFeeStream::Guardian => Ok(false),
            None => bail!("No operation fedi fee status found!"),
        }
    }

    /// Transitions the OperationFediFeeStatus for a send operation from pending
    /// to failure, iff the status is currently pending. Therefore the
    /// transition only happens once. We also credit the fee back to the user.
    /// Returns Ok((true, new_status)) if a DB write actually occurred, and
    /// Ok((false, current_status)) if no write was needed, meaning that the
    /// status has already been recorded as a failure.
    async fn transition_failed_send_fedi_fee_in_db(
        dbtx: &mut DatabaseTransaction<'_>,
        stream: FediFeeStream,
        operation_id: OperationId,
        module: ModuleKind,
    ) -> anyhow::Result<bool> {
        let op_key = OperationFediFeeStatusByStreamKey(operation_id, stream);
        match dbtx.get_value(&op_key).await {
            Some(OperationFediFeeStatus::PendingSend { fedi_fee }) => {
                let new_status = OperationFediFeeStatus::FailedSend { fedi_fee };
                dbtx.insert_entry(&op_key, &new_status).await;

                let pending_tx_type_key = PendingFediFeesByStreamPerTXTypeKey(
                    stream,
                    module,
                    RpcTransactionDirection::Send,
                );
                let pending_key = PendingFediFeesByStreamKey(stream);
                let pending_tx_type_fees = dbtx
                    .get_value(&pending_tx_type_key)
                    .await
                    .unwrap_or(Amount::ZERO)
                    .saturating_sub(fedi_fee);
                let pending_fees = dbtx
                    .get_value(&pending_key)
                    .await
                    .unwrap_or(Amount::ZERO)
                    .saturating_sub(fedi_fee);
                dbtx.insert_entry(&pending_tx_type_key, &pending_tx_type_fees)
                    .await;
                dbtx.insert_entry(&pending_key, &pending_fees).await;
                Ok(true)
            }
            Some(OperationFediFeeStatus::FailedSend { .. }) => Ok(false),
            Some(_) => bail!("Invalid operation fedi fee status found!"),
            // Operations that were started before guardian fees existed will not
            // have a guardian fee-status row. Treat that as a no-op on upgrade.
            None if stream == FediFeeStream::Guardian => Ok(false),
            None => bail!("No operation fedi fee status found!"),
        }
    }

    /// We don't always know the amount to be received (in the case of
    /// generate_address for example), and even if we do, the amount to be
    /// received (from which the fee is to be debited) is not in the user's
    /// possession until the operation completes. So for receives, we just
    /// record the ppm, and when the operation succeeds, we debit the fee.
    async fn insert_pending_receive_fedi_fee_ppm_in_db(
        dbtx: &mut DatabaseTransaction<'_>,
        stream: FediFeeStream,
        operation_id: OperationId,
        fedi_fee_ppm: u64,
    ) -> anyhow::Result<()> {
        dbtx.insert_entry(
            &OperationFediFeeStatusByStreamKey(operation_id, stream),
            &OperationFediFeeStatus::PendingReceive { fedi_fee_ppm },
        )
        .await;
        Ok(())
    }

    /// Transitions the OperationFediFeeStatus for a receive operation from
    /// pending to success, iff the status is currently pending. Therefore
    /// the transition only happens once. We also debit the fee at this
    /// point since the amount must be known now and the funds are in the user's
    /// possession. Returns Ok((true, new_status)) if a DB write actually
    /// occurred, and Ok((false, current_status)) if no write was needed,
    /// meaning that the status has already been recorded as a success.
    async fn transition_success_receive_fedi_fee_in_db(
        dbtx: &mut DatabaseTransaction<'_>,
        stream: FediFeeStream,
        operation_id: OperationId,
        module: ModuleKind,
        amount: Amount,
    ) -> anyhow::Result<bool> {
        let op_key = OperationFediFeeStatusByStreamKey(operation_id, stream);
        match dbtx.get_value(&op_key).await {
            Some(OperationFediFeeStatus::PendingReceive { fedi_fee_ppm }) => {
                let fedi_fee = Amount::from_msats((amount.msats * fedi_fee_ppm).div_ceil(MILLION));
                let outstanding_tx_type_key = OutstandingFediFeesByStreamPerTXTypeKey(
                    stream,
                    module.clone(),
                    RpcTransactionDirection::Receive,
                );
                let outstanding_key = OutstandingFediFeesByStreamKey(stream);
                let outstanding_tx_type_fees = fedi_fee
                    + dbtx
                        .get_value(&outstanding_tx_type_key)
                        .await
                        .unwrap_or(Amount::ZERO);
                let outstanding_fees = fedi_fee
                    + dbtx
                        .get_value(&outstanding_key)
                        .await
                        .unwrap_or(Amount::ZERO);
                let new_status = OperationFediFeeStatus::Success { fedi_fee };
                dbtx.insert_entry(&op_key, &new_status).await;
                dbtx.insert_entry(&outstanding_tx_type_key, &outstanding_tx_type_fees)
                    .await;
                dbtx.insert_entry(&outstanding_key, &outstanding_fees).await;
                if stream == FediFeeStream::App {
                    let total_accrued_key = TotalAccruedFediFeesByStreamKey(FediFeeStream::App);
                    let total_accrued_fees = fedi_fee
                        + dbtx
                            .get_value(&total_accrued_key)
                            .await
                            .unwrap_or(Amount::ZERO);
                    dbtx.insert_entry(&total_accrued_key, &total_accrued_fees)
                        .await;
                }
                Ok(true)
            }
            Some(OperationFediFeeStatus::Success { .. }) => Ok(false),
            Some(_) => bail!("Invalid operation fedi fee status found!"),
            // Operations that were started before guardian fees existed will not
            // have a guardian fee-status row. Treat that as a no-op on upgrade.
            None if stream == FediFeeStream::Guardian => Ok(false),
            None => bail!("No operation fedi fee status found!"),
        }
    }

    /// Transitions the OperationFediFeeStatus for a receive operation from
    /// pending to failure, iff the status is currently pending. Therefore
    /// the transition only happens once. Returns Ok((true, new_status)) if a DB
    /// write actually occurred, and Ok((false, current_status)) if no write
    /// was needed, meaning that the status has already been recorded as a
    /// failure.
    async fn transition_failed_receive_fedi_fee_in_db(
        dbtx: &mut DatabaseTransaction<'_>,
        stream: FediFeeStream,
        operation_id: OperationId,
    ) -> anyhow::Result<bool> {
        let key = OperationFediFeeStatusByStreamKey(operation_id, stream);
        match dbtx.get_value(&key).await {
            Some(OperationFediFeeStatus::PendingReceive { fedi_fee_ppm }) => {
                let new_status = OperationFediFeeStatus::FailedReceive { fedi_fee_ppm };
                dbtx.insert_entry(&key, &new_status).await;
                Ok(true)
            }
            Some(OperationFediFeeStatus::FailedReceive { .. }) => Ok(false),
            Some(_) => bail!("Invalid operation fedi fee status found!"),
            // Operations that were started before guardian fees existed will not
            // have a guardian fee-status row. Treat that as a no-op on upgrade.
            None if stream == FediFeeStream::Guardian => Ok(false),
            None => bail!("No operation fedi fee status found!"),
        }
    }

    #[instrument(skip(self), err, ret)]
    async fn record_tx_date_fiat_info(
        &self,
        operation_id: OperationId,
        amount: Amount,
    ) -> anyhow::Result<()> {
        // Early return if we've already recorded the fiat info for given operation
        let mut dbtx = self.dbtx().await;
        let op_db_key = TransactionDateFiatInfoKey(operation_id);
        if dbtx.get_value(&op_db_key).await.is_some() {
            info!("Transaction date fiat info already exists for given OP ID, not overwriting");
            return Ok(());
        }

        let Some(cached_fiat_fx_info) = self.runtime.app_state.get_cached_fiat_fx_info().await
        else {
            bail!("No cached fiat FX info present");
        };
        dbtx.insert_entry(
            &TransactionDateFiatInfoKey(operation_id),
            &cached_fiat_fx_info,
        )
        .await;
        match dbtx.commit_tx_result().await {
            Ok(_) => info!("Successfully logged transaction date fiat info"),
            Err(e) => error!(?e, "Error logging transaction date fiat info"),
        };

        Ok(())
    }

    pub fn multispend_public_key(&self, group_id: String) -> anyhow::Result<PublicKey> {
        let spv2 = self.client.spv2()?;
        let pubkey = spv2.derive_multispend_group_key(group_id).public_key();
        Ok(pubkey)
    }

    pub async fn multispend_deposit(
        &self,
        amount: FiatAmount,
        group_account: AccountId,
        room: RpcRoomId,
        description: String,
        frontend_meta: FrontendMetadata,
    ) -> anyhow::Result<()> {
        self.spv2_simple_transfer(
            group_account,
            amount,
            SPv2TransferMetadata::MultispendDeposit {
                room,
                description,
                frontend_metadata: Some(frontend_meta),
            },
            Spv2TransferTxMeta::default(),
        )
        .await?;
        Ok(())
    }

    pub fn multispend_create_transfer_request(
        &self,
        amount: FiatAmount,
        group_account: Account,
    ) -> anyhow::Result<TransferRequest> {
        let spv2 = self.client.spv2()?;
        let transfer_request = TransferRequest::new(
            rand::thread_rng().r#gen(),
            group_account,
            FiatAmount(amount.0),
            spv2.our_account(AccountType::Seeker).id(),
            vec![],
            u64::MAX,
            None,
        )?;
        Ok(transfer_request)
    }

    pub fn multispend_approve_withdrawal(
        &self,
        group_id: String,
        transfer_request: &TransferRequest,
    ) -> anyhow::Result<schnorr::Signature> {
        let spv2 = self.client.spv2()?;
        let key = spv2.derive_multispend_group_key(group_id);
        let message = secp256k1::Message::from(&TransferRequestId::from(transfer_request));
        Ok(key.sign_schnorr(message))
    }

    pub async fn multispend_group_sync_info(
        &self,
        account_id: AccountId,
    ) -> anyhow::Result<SyncResponse> {
        let spv2 = self.client.spv2()?;
        Ok(spv2.api.account_sync(account_id).await?)
    }

    /// v1 lightning's recurringd URL — only used when the federation has
    /// explicitly configured one (env var or meta field). v1 has no
    /// safe default; if none is configured, lnurl is not available on
    /// the v1 path.
    pub async fn get_recurringd_api_v1(&self) -> Option<SafeUrl> {
        if let Ok(url) = std::env::var("TEST_BRIDGE_RECURRINGD_API")
            && let Ok(url) = SafeUrl::from_str(&url)
        {
            return Some(url);
        }

        self.client
            .meta_service()
            .get_field::<SafeUrl>(self.client.db(), RECURRINGD_API_META)
            .await
            .and_then(|x| x.value)
    }

    /// v2 lightning's recurringd URL — always the Fedi-operated v2
    /// service. Federation meta/env overrides do not apply on the v2
    /// path because they point at v1-protocol recurringd instances.
    pub fn get_recurringd_api_v2() -> SafeUrl {
        SafeUrl::from_str("https://lnurl.fedimint.org/")
            .expect("hardcoded recurringd v2 URL is valid")
    }

    /// True if either lightning module can produce an lnurl right now:
    /// v2 is always able to (uses the hardcoded default); v1 only when
    /// the federation has configured a recurringd URL.
    pub async fn supports_recurringd_lnurl(&self) -> bool {
        if self.client.lnv2().is_ok() {
            return true;
        }
        self.get_recurringd_api_v1().await.is_some()
    }

    /// Either register or get the lnurl. Picks the v2 path (with the
    /// hardcoded v2 recurringd URL) when lnv2 is present, falling back
    /// to v1 only when the federation has explicitly configured a v1
    /// recurringd URL via meta/env.
    pub async fn get_recurringd_lnurl(&self) -> anyhow::Result<String> {
        self.ln_ops.get_recurringd_lnurl(self).await
    }
}

// Backfill federation's network on disk if missing
async fn maybe_backfill_federation_network(
    runtime: &Arc<Runtime>,
    federation_id: FederationId,
    client: &ClientHandle,
) {
    if let Ok(network) = client.wallet().map(|wallet| wallet.get_network()) {
        let network_backfill_res = runtime
            .app_state
            .with_write_lock(|state| {
                if let Some(fed_info) = state.joined_federations.get_mut(&federation_id.to_string())
                    && fed_info.network.is_none()
                {
                    fed_info.network = Some(network);
                }
            })
            .await;

        if let Err(e) = network_backfill_res {
            info!(%e, "failed to backfill {} network on disk", network);
        }
    }
}

#[inline(always)]
pub fn zero_gateway_fees() -> RoutingFees {
    RoutingFees {
        base_msat: 0,
        proportional_millionths: 0,
    }
}

fn is_gateway_availability_error(error: &anyhow::Error) -> bool {
    error
        .chain()
        .any(|cause| cause.downcast_ref::<ServerError>().is_some())
}

fn handle_pay_bolt11_invoice_error(error: anyhow::Error) -> Result<OutgoingLightningPayment> {
    match error.downcast::<PayBolt11InvoiceError>()? {
        PayBolt11InvoiceError::PreviousPaymentAttemptStillInProgress { .. }
        // FundedContractAlreadyExists is also same but with less information.
        // see https://discord.com/channels/990354215060795454/990354215878688860/1273318556108324904
        | PayBolt11InvoiceError::FundedContractAlreadyExists { .. } => {
            bail!(ErrorCode::PayLnInvoiceAlreadyInProgress)
        }
        PayBolt11InvoiceError::NoLnGatewayAvailable => {
            bail!(ErrorCode::NoLnGatewayAvailable)
        }
    }
}

// root/<key-type=per-federation=0>/<federation-id>/<wallet-number>/
// <key-type=fedimint-client=0>
fn get_default_client_secret(
    global_root_secret: &DerivableSecret,
    federation_id: &FederationId,
    wallet_number: u64,
) -> DerivableSecret {
    get_per_federation_secret(global_root_secret, federation_id, wallet_number, 0)
}

// root/<key-type=per-federation=0>/<federation-id>/<wallet-number>/
// <key-type=aux=1>
fn get_default_auxiliary_secret(
    global_root_secret: &DerivableSecret,
    federation_id: &FederationId,
    wallet_number: u64,
) -> DerivableSecret {
    get_per_federation_secret(global_root_secret, federation_id, wallet_number, 1)
}

// Based on derivation scheme used by fedimint-client
fn get_per_federation_secret(
    global_root_secret: &DerivableSecret,
    federation_id: &FederationId,
    wallet_number: u64,
    key_type: u64,
) -> DerivableSecret {
    let multi_federation_root_secret = global_root_secret.child_key(ChildId(0));
    let federation_root_secret = multi_federation_root_secret.federation_key(federation_id);
    let federation_wallet_root_secret = federation_root_secret.child_key(ChildId(wallet_number));
    federation_wallet_root_secret.child_key(ChildId(key_type))
}

// Given the current virtual balance and the Fedi fee ppm for a spend operation,
// as well an optional gateway fee and an optional on-chain fee, returns the max
// amount of the spend transaction such that:
//
// (  max spend  ) + (total fee)      <=        virtual balance
// ^return value^                ^really "=="^
fn get_max_spendable_amount(
    virtual_balance: Amount,
    total_fedi_fee_ppm: u64,
    on_chain_fee: Option<PegOutFees>,
    gateway_fee: Option<RoutingFees>,
) -> Amount {
    // The on-chain fee depends on the spend amount, and the maximum spend amount
    // depends on the on-chain fee. So to avoid this chicken-and-egg problem, we
    // assume the on-chain fee to be constant since this function is really only
    // called when the user-specified amount exceeds the max spendable amount. It is
    // an imperfect assumption, but good enough for our use case. So at the
    // start, we can just deduct the on-chain fee from the virtual balance and
    // reassign the difference to virtual balance.
    let virtual_balance =
        virtual_balance.saturating_sub(on_chain_fee.map_or(Amount::ZERO, |f| f.amount().into()));

    let gateway_base = gateway_fee.map_or(0, |f| f.base_msat as u64);
    let gateway_ppm = gateway_fee.map_or(0, |f| f.proportional_millionths as u64);

    // Let's say the max spend is x, total Fedi fee ppm is (ppm_F), and virtual
    // balance is V. Gateway fees is made up of (base) and (ppm_G).
    //
    // Then:
    // x + [(x * ppm_F) / M] + base + [(X * ppm_G) / M] = V, where M is the constant
    // for million
    //
    // Solving for x:
    // x[1 + (ppm_F/M) + (ppm_G/M)] = V - base
    //
    // Finally:
    // x = [(V - base) * M]/(M + ppm_F + ppm_G)
    let numerator_msats = (virtual_balance.msats.saturating_sub(gateway_base)) * MILLION;
    let denominator_msats = MILLION + total_fedi_fee_ppm + gateway_ppm;
    Amount::from_msats(numerator_msats / denominator_msats)
}

// Function below is currently copied from
// fedimint-ln-client to determine when the destination of a lightning invoice
// is within the current federation so that we know to show a 0 gateway fee.
fn invoice_has_internal_payment_markers(
    invoice: &Bolt11Invoice,
    markers: (PublicKey, u64),
) -> bool {
    // Asserts that the invoice src_node_id and short_channel_id match known
    // values used as internal payment markers
    invoice
        .route_hints()
        .first()
        .and_then(|rh| rh.0.last())
        .map(|hop| (hop.src_node_id, hop.short_channel_id))
        == Some(markers)
}

// Function below is currently copied from
// fedimint-ln-client to determine when the destination of a lightning invoice
// is within the current federation so that we know to show a 0 gateway fee.
fn invoice_routes_back_to_federation(
    invoice: &Bolt11Invoice,
    gateways: Vec<LightningGateway>,
) -> bool {
    gateways.into_iter().any(|gateway| {
        invoice
            .route_hints()
            .first()
            .and_then(|rh| rh.0.last())
            .map(|hop| (hop.src_node_id, hop.short_channel_id))
            == Some((gateway.node_pub_key, gateway.federation_index))
    })
}

fn internal_pay_is_bad_state(outcome: serde_json::Value) -> bool {
    serde_json::from_value::<InternalPayState>(outcome).is_err()
}

impl FederationPrefetchedInfo {
    pub async fn fetch(
        connectors: ConnectorRegistry,
        invite_code: &str,
        root_mnemonic: &bip39::Mnemonic,
        device_index: u8,
    ) -> anyhow::Result<Self> {
        let invite_code = invite_code.to_lowercase();
        let invite_code = InviteCode::from_str(&invite_code)?;
        let api_single_guardian = DynGlobalApi::new(
            connectors.clone(),
            invite_code.peers(),
            invite_code.api_secret().as_deref(),
        )?;
        let federation_id = invite_code.federation_id();
        let client_root_sercet = {
            // We do an additional derivation using `DerivableSecret::federation_key` since
            // that is what fedimint-client does internally
            FederationV2::client_root_secret_from_root_mnemonic(
                root_mnemonic,
                &federation_id,
                device_index,
            )
            .federation_key(&federation_id)
        };

        // TODO: we should be using upstream preview functionality instead of
        // replicating it. let client_preview = Client::builder()
        //     .await?
        //     .preview(connectors.clone(), &invite_code)
        //     .await?;

        let decoders = ModuleDecoderRegistry::default().with_fallback();
        // Fedi still relies on federation backups for device recovery, so we
        // intentionally keep using this API until we migrate off of it.
        #[allow(deprecated)]
        let ((client_config, _api), backup) = tokio::try_join!(
            fedimint_api_client::download_from_invite_code(&connectors, &invite_code),
            Client::download_backup_from_federation_static(
                &api_single_guardian,
                &client_root_sercet,
                &decoders,
            )
        )?;
        Ok(Self {
            federation_id,
            client_config,
            backup,
            invite_code,
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pay_state_is_getting_parsed() {
        let state = LnPayState::Canceled;
        let json = serde_json::to_string(&state).unwrap();
        let value = serde_json::from_str::<serde_json::Value>(&json).unwrap();
        assert!(internal_pay_is_bad_state(value));
    }

    #[test]
    fn test_detects_gateway_availability_errors() {
        let error = anyhow!(ServerError::Connection(anyhow!("gateway offline")))
            .context("pay invoice failed");

        assert!(is_gateway_availability_error(&error));
    }

    #[test]
    fn test_ignores_non_gateway_availability_payment_errors() {
        let error = anyhow!(PayBolt11InvoiceError::NoLnGatewayAvailable);

        assert!(!is_gateway_availability_error(&error));
    }

    #[test]
    fn test_ignores_federation_peer_server_errors_as_gateway_availability_errors() {
        let error = anyhow!(fedimint_api_client::api::FederationError::new_one_peer(
            0_u16.into(),
            "fetch_consensus_block_count",
            (),
            ServerError::Connection(anyhow!("guardian offline")),
        ));

        assert!(!is_gateway_availability_error(&error));
    }
}
