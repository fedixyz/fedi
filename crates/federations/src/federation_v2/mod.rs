pub mod client;
pub mod db;
mod dev;
mod lnurl_receives_service;
mod meta;

use std::any::Any;
use std::collections::{BTreeMap, HashMap};
use std::fmt::Debug;
use std::future::Future;
use std::ops::Not as _;
use std::pin::pin;
use std::str::FromStr;
use std::sync::{Arc, Weak};
use std::time::Duration;

use ::serde::{Deserialize, Serialize};
use anyhow::{Context, Result, anyhow, bail, ensure};
use bitcoin::address::NetworkUnchecked;
use bitcoin::hex::DisplayHex;
use bitcoin::secp256k1::{self, PublicKey, schnorr};
use bitcoin::{Address, Network};
use bug_report::reused_ecash_proofs::{self, SerializedReusedEcashProofs};
use client::ClientExt;
use db::{
    FediRawClientConfigKey, InviteCodeKey, LastStabilityPoolV2DepositCycleKey,
    TotalAccruedFediFeesPerTXTypeKey, TransactionNotesKey,
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
use fedimint_core::config::{ClientConfig, FederationId};
use fedimint_core::core::{ModuleKind, OperationId};
use fedimint_core::db::{Committable, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
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
use fedimint_ln_client::pay::GatewayPayError;
use fedimint_ln_client::{
    InternalPayState, LightningClientInit, LightningOperationMeta, LightningOperationMetaPay,
    LightningOperationMetaVariant, LnPayState, LnReceiveState, OutgoingLightningPayment,
    PayBolt11InvoiceError, PayType,
};
use fedimint_ln_common::LightningGateway;
use fedimint_ln_common::config::FeeToAmount;
use fedimint_meta_client::MetaModuleMetaSourceWithFallback;
use fedimint_mint_client::api::MintFederationApi;
use fedimint_mint_client::config::MintClientConfig;
use fedimint_mint_client::{
    MintClientInit, MintClientModule, MintOperationMeta, MintOperationMetaVariant, OOBNotes,
    ReissueExternalNotesState, SelectNotesWithAtleastAmount, SelectNotesWithExactAmount,
    SpendOOBState, spendable_notes_to_operation_id,
};
use fedimint_wallet_client::{
    DepositStateV2, PegOutFees, WalletClientInit, WalletOperationMeta, WalletOperationMetaVariant,
    WithdrawState,
};
use futures::{FutureExt, Stream, StreamExt};
use lightning_invoice::{Bolt11Invoice, RoutingFees};
use lnurl_receives_service::LnurlReceivesService;
use meta::{LegacyMetaSourceWithExternalUrl, MetaEntries};
use rand::Rng;
use rpc_types::error::ErrorCode;
use rpc_types::event::{Event, RecoveryProgressEvent, TypedEventExt};
use rpc_types::matrix::RpcRoomId;
use rpc_types::spv2_transfer_meta::Spv2TransferTxMeta;
use rpc_types::{
    BaseMetadata, EcashReceiveMetadata, EcashSendMetadata, FrontendMetadata, GuardianStatus,
    LightningSendMetadata, OperationFediFeeStatus, RpcAmount, RpcEventId, RpcFederation,
    RpcFederationId, RpcFederationMaybeLoading, RpcFederationPreview, RpcFeeDetails,
    RpcGenerateEcashResponse, RpcJsonClientConfig, RpcLightningGateway, RpcOperationFediFeeStatus,
    RpcOperationId, RpcPayInvoiceResponse, RpcPeerId, RpcPrevPayInvoiceResult, RpcPublicKey,
    RpcReturningMemberStatus, RpcSPDepositState, RpcSPV2DepositState, RpcSPV2TransferInState,
    RpcSPV2TransferOutState, RpcSPV2WithdrawalState, RpcSPWithdrawState, RpcSPv2CachedSyncResponse,
    RpcTransaction, RpcTransactionDirection, RpcTransactionKind, RpcTransactionListEntry,
    SPv2DepositMetadata, SPv2TransferMetadata, SPv2WithdrawMetadata, SpMatrixTransferId,
    SpV2TransferInKind, SpV2TransferOutKind,
};
use runtime::bridge_runtime::Runtime;
use runtime::constants::{
    ECASH_AUTO_CANCEL_DURATION_MAINNET, ECASH_AUTO_CANCEL_DURATION_MUTINYNET,
    LIGHTNING_OPERATION_TYPE, MILLION, MINT_OPERATION_TYPE, RECURRINGD_API_META,
    REISSUE_ECASH_TIMEOUT, STABILITY_POOL_OPERATION_TYPE, STABILITY_POOL_V2_OPERATION_TYPE,
    WALLET_OPERATION_TYPE,
};
use runtime::db::FederationPendingRejoinFromScratchKey;
use runtime::nightly_panic;
use runtime::storage::state::{DatabaseInfo, FederationInfo, FediFeeSchedule};
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
use self::db::{
    LastStabilityPoolDepositCycleKey, OperationFediFeeStatusKey, OutstandingFediFeesPerTXTypeKey,
    OutstandingFediFeesPerTXTypeKeyPrefix, PendingFediFeesPerTXTypeKey,
    PendingFediFeesPerTXTypeKeyPrefix, TransactionDateFiatInfoKey,
};
use self::dev::{
    override_localhost, override_localhost_client_config, override_localhost_invite_code,
};
use self::ln_gateway_service::LnGatewayService;
use self::stability_pool_sweeper_service::StabilityPoolSweeperService;
use super::federations_locker::FederationLockGuard;
use crate::fedi_fee::{FediFeeHelper, FediFeeRemittanceService};

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
pub mod spv2_pay_address;
mod spv2_sweeper_service;
mod stability_pool_sweeper_service;

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
    pub recovering: bool,
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
        client_builder.with_module(LightningClientInit::default());
        client_builder.with_module(WalletClientInit(None));
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
        let federation = Arc::new_cyclic(|weak| Self {
            task_group: runtime.task_group.make_subgroup(),
            runtime,
            operation_states: Default::default(),
            auxiliary_secret,
            fedi_fee_helper,
            backup_service: BackupService::new(device_registration_service),
            fedi_fee_remittance_service: OnceCell::new(),
            recovering,
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
            spv2_sweeper_service: Default::default(),
            lnurl_receives_service: Default::default(),
            guardian_status_cache: Mutex::new(None),
        });
        if !recovering {
            federation.start_background_tasks().await;
        }
        federation
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

    /// Starts a bunch of async tasks and ensures username is
    /// saved to db (e.g. after recovery)
    async fn start_background_tasks(&self) {
        self.subscribe_balance_updates().await;
        self.spawn_cancellable("backup_service", move |fed| async move {
            fed.backup_service.run_continuously(&fed.client).await;
        });
        self.subscribe_to_all_operations().await;

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

        self.spawn_cancellable("send_meta_updates", |fed| async move {
            fed.client.meta_service().wait_initialization().await;
            fed.send_federation_event().await;
            let mut subscribe_to_updates = pin!(fed.client.meta_service().subscribe_to_updates());
            while subscribe_to_updates.next().await.is_some() {
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

        Ok(Self::new(
            runtime,
            client,
            guard,
            auxiliary_secret,
            fedi_fee_helper,
            multispend_services,
            spt_notifications,
            device_registration_service,
        )
        .await)
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
            info!("backup found {:?}", client_backup);
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
            .and_then(|n| this.fedi_fee_helper.maybe_latest_schedule(n))
            .unwrap_or_default();
        runtime
            .app_state
            .with_write_lock(|state| {
                let old_value = state.joined_federations.insert(
                    federation_id_string,
                    FederationInfo {
                        version: 2,
                        database: DatabaseInfo::DatabasePrefix(db_prefix),
                        fedi_fee_schedule,
                        network,
                    },
                );
                assert!(old_value.is_none(), "must not override a federation");
            })
            .await?;
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
            .get_federation_schedule(self.federation_id().to_string())
            .await
            .unwrap_or_default()
    }

    // Fetch which network we're using
    pub fn get_network(&self) -> Option<Network> {
        if self.recovering() {
            None
        } else {
            self.client.wallet().map(|module| module.get_network()).ok()
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

    /// Create database transaction
    pub async fn dbtx(&self) -> DatabaseTransaction<'_, Committable> {
        self.client.db().begin_transaction().await
    }

    pub async fn select_gateway(&self) -> anyhow::Result<Option<LightningGateway>> {
        let gateway = self.gateway_service()?.select_gateway(&self.client).await?;
        if self.runtime.feature_catalog.override_localhost.is_none() {
            return Ok(gateway);
        }

        Ok(gateway.map(|mut g| {
            g.api = override_localhost(&g.api);
            g
        }))
    }

    /// Fetch balance
    pub async fn get_balance(&self) -> Amount {
        if self.recovering() {
            return Amount::ZERO;
        }
        let Ok(mint_client) = self.client.mint() else {
            return Amount::ZERO;
        };
        let mut dbtx = mint_client.db.begin_transaction_nc().await;
        let raw_fedimint_balance = mint_client
            .get_note_counts_by_denomination(&mut dbtx)
            .await
            .total_amount();
        let fedi_fee_sum =
            self.get_outstanding_fedi_fees().await + self.get_pending_fedi_fees().await;
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
                        Ok(Ok(status_response)) => {
                            // Ensure you log before the match, to capture even partial responses
                            info!("Raw status response: {:?}", status_response);
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
                            info!("Error response: {:?}", error);
                            GuardianStatus::Error {
                                guardian: guardian.to_string(),
                                error: error.to_string(),
                            }
                        }
                        Err(elapsed) => {
                            info!("Timeout elapsed: {:?}", elapsed);
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

    pub async fn get_outstanding_fedi_fees(&self) -> Amount {
        self.dbtx()
            .await
            .into_nc()
            .find_by_prefix(&OutstandingFediFeesPerTXTypeKeyPrefix)
            .await
            .fold(Amount::ZERO, |acc, (_, amt)| async move { acc + amt })
            .await
    }

    pub async fn get_outstanding_fedi_fees_per_tx_type(
        &self,
    ) -> Vec<(ModuleKind, RpcTransactionDirection, Amount)> {
        self.dbtx()
            .await
            .into_nc()
            .find_by_prefix(&OutstandingFediFeesPerTXTypeKeyPrefix)
            .await
            .map(|(key, amt)| (key.0, key.1, amt))
            .collect()
            .await
    }

    pub async fn get_pending_fedi_fees(&self) -> Amount {
        self.dbtx()
            .await
            .into_nc()
            .find_by_prefix(&PendingFediFeesPerTXTypeKeyPrefix)
            .await
            .fold(Amount::ZERO, |acc, (_, amt)| async move { acc + amt })
            .await
    }

    pub async fn get_pending_fedi_fees_per_tx_type(
        &self,
    ) -> Vec<(ModuleKind, RpcTransactionDirection, Amount)> {
        self.dbtx()
            .await
            .into_nc()
            .find_by_prefix(&PendingFediFeesPerTXTypeKeyPrefix)
            .await
            .map(|(key, amt)| (key.0, key.1, amt))
            .collect()
            .await
    }

    /// Generate bitcoin address
    pub async fn generate_address(&self, frontend_meta: FrontendMetadata) -> Result<String> {
        // FIXME: add fedi fees once fedimint await primary module outputs
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let (operation_id, address, _) = self
            .client
            .wallet()?
            .allocate_deposit_address_expert_only(BaseMetadata::from(frontend_meta))
            .await?;
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;

        self.subscribe_deposit(operation_id);

        Ok(address.to_string())
    }

    /// Generate lightning invoice
    pub async fn generate_invoice(
        &self,
        amount: RpcAmount,
        description: String,
        expiry_time: Option<u64>,
        frontend_meta: FrontendMetadata,
    ) -> Result<Bolt11Invoice> {
        // some apps have issues paying invoices that are in msats
        // so round up amount to nearest sat
        let amount = Amount::from_sats(amount.0.msats.div_ceil(1000));
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let gateway = self.select_gateway().await?;
        let (operation_id, invoice, _) = self
            .client
            .ln()?
            .create_bolt11_invoice(
                amount,
                lightning_invoice::Bolt11InvoiceDescription::Direct(
                    lightning_invoice::Description::new(description)?,
                ),
                expiry_time,
                BaseMetadata::from(frontend_meta),
                gateway,
            )
            .await?;

        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;
        let _ = self.record_tx_date_fiat_info(operation_id, amount).await;
        self.subscribe_invoice(operation_id, invoice.clone())
            .await?;

        Ok(invoice)
    }

    fn subscribe_deposit(&self, operation_id: OperationId) {
        self.spawn_cancellable("subscribe deposit", move |fed| async move {
            let Ok(wallet) = fed.client.wallet() else {
                error!("Wallet module not present!");
                return;
            };
            // don't keep emit events if outcome is already cached.
            let Ok(UpdateStreamOrOutcome::UpdateStream(mut updates)) = wallet
                .subscribe_deposit(operation_id)
                .await
                .inspect_err(|e| {
                    warn!("subscribing to 0.3 deposits is not implemented: {e}");
                })
            else {
                return;
            };
            while let Some(update) = updates.next().await {
                info!("Update: {:?}", update);
                fed.update_operation_state(operation_id, update.clone())
                    .await;
                match update {
                    DepositStateV2::WaitingForConfirmation { btc_deposited, .. }
                    | DepositStateV2::Confirmed { btc_deposited, .. }
                    | DepositStateV2::Claimed { btc_deposited, .. } => {
                        let federation_fees = wallet.get_fee_consensus().peg_in_abs;
                        let amount = Amount::from_sats(btc_deposited.to_sat())
                            .saturating_sub(federation_fees);
                        // FIXME: add fedi fees once fedimint await primary module outputs
                        if let DepositStateV2::Claimed { .. } = &update {
                            fed.write_success_receive_fedi_fee(operation_id, amount)
                                .await
                                .map(|(_, status)| status)
                                .ok();
                        }
                        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
                        fed.send_transaction_event(operation_id).await;
                    }
                    DepositStateV2::Failed(reason) => {
                        let _ = fed.write_failed_receive_fedi_fee(operation_id).await;
                        // FIXME: handle this
                        error!("Failed to claim on-chain deposit: {reason}");
                    }
                    _ => {}
                }
            }
        });
    }

    pub async fn recheck_pegin_address(&self, operation_id: OperationId) -> Result<()> {
        self.client
            .wallet()?
            .recheck_pegin_address_by_op_id(operation_id)
            .await
    }
    /// Subscribe to state updates for a given lightning invoice
    pub async fn subscribe_invoice(
        &self,
        operation_id: OperationId,
        invoice: Bolt11Invoice, // TODO: fetch the invoice from the db
    ) -> Result<()> {
        self.spawn_cancellable("subscribe invoice", move |fed| async move {
            let Ok(ln) = fed.client.ln() else {
                error!("Lightning module not found!");
                return;
            };
            let Ok(updates) = ln.subscribe_ln_receive(operation_id).await else {
                error!("Lightning operation with ID {:?} not found!", operation_id);
                return;
            };
            let mut updates = updates.into_stream();
            while let Some(update) = updates.next().await {
                info!("Update: {:?}", update);
                fed.update_operation_state(operation_id, update.clone())
                    .await;
                match update {
                    LnReceiveState::Claimed => {
                        let amount = Amount {
                            msats: invoice.amount_milli_satoshis().unwrap(),
                        };
                        fed.write_success_receive_fedi_fee(operation_id, amount)
                            .await
                            .map(|(_, status)| status)
                            .ok();
                        fed.send_transaction_event(operation_id).await;
                    }
                    LnReceiveState::Canceled { reason } => {
                        let _ = fed.write_failed_receive_fedi_fee(operation_id).await;
                        // FIXME: handle this
                        error!("Failed to claim incoming contract: {reason}");
                    }
                    _ => {}
                }
            }
        });
        Ok(())
    }

    /// Estimates fees for paying a lightning invoice in this federation
    pub async fn estimate_ln_fees(&self, invoice: &Bolt11Invoice) -> Result<RpcFeeDetails> {
        let amount = Amount::from_msats(
            invoice
                .amount_milli_satoshis()
                .ok_or(anyhow!("Invoice missing amount"))?,
        );

        // Fedi app fee applies regardless of internal/external payment
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = (amount.msats * fedi_fee_ppm).div_ceil(MILLION);

        // Logic inside the if statement below is currently copied from
        // fedimint-ln-client to determine when the destination of a lightning invoice
        // is within the current federation so that we know to show a 0 gateway fee.
        let mut is_internal_payment = false;
        if let Ok(markers) = self.client.get_internal_payment_markers() {
            is_internal_payment = invoice_has_internal_payment_markers(invoice, markers);
            if !is_internal_payment {
                let gateways = self
                    .client
                    .ln()?
                    .list_gateways()
                    .await
                    .into_iter()
                    .map(|g| g.info)
                    .collect::<Vec<_>>();
                is_internal_payment = invoice_routes_back_to_federation(invoice, gateways);
            }
        }

        let network_fee = if is_internal_payment {
            RpcAmount(Amount::ZERO)
        } else {
            // External payments have a non-0 gateway fee in addition to Fedi app fee
            let gateway = self
                .select_gateway()
                .await?
                .context("No gateway available")?;
            let gateway_fees = gateway.fees;
            RpcAmount(gateway_fees.to_amount(&amount))
        };

        Ok(RpcFeeDetails {
            fedi_fee: RpcAmount(Amount::from_msats(fedi_fee)),
            network_fee,
            federation_fee: RpcAmount(Amount::ZERO),
        })
    }

    /// Pay lightning invoice
    pub async fn pay_invoice(
        &self,
        invoice: &Bolt11Invoice,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcPayInvoiceResponse> {
        // Has an amount
        let amount_msat = invoice
            .amount_milli_satoshis()
            .ok_or(anyhow!("Invoice missing amount"))?;
        let amount = Amount::from_msats(amount_msat);

        // Same network
        let federation_network = self
            .get_network()
            .context("federation is still recovering")?;
        if federation_network != invoice.network() {
            bail!(format!(
                "Invoice is for wrong network. Expected {}, got {}",
                federation_network,
                display_currency(invoice.currency())
            ))
        }

        let gateway = self.select_gateway().await?;
        let gateway_fees = gateway
            .as_ref()
            .map(|g| g.fees)
            .unwrap_or(zero_gateway_fees());
        let network_fee = gateway_fees.base_msat as u64
            + (amount.msats * gateway_fees.proportional_millionths as u64).div_ceil(MILLION);

        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = (amount.msats * fedi_fee_ppm).div_ceil(MILLION);

        let spend_guard = self.spend_guard.lock().await;
        let virtual_balance = self.get_balance().await;
        let est_total_spend = amount.msats + fedi_fee + network_fee;
        if est_total_spend > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, None, Some(gateway_fees))
            )));
        }

        let _federation_id = self.federation_id();
        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: false,
            frontend_metadata: Some(frontend_meta),
        };
        let ln = self.client.ln()?;
        let OutgoingLightningPayment { payment_type, .. } = match ln
            .pay_bolt11_invoice(gateway, invoice.to_owned(), extra_meta.clone())
            .await
        {
            Ok(v) => v,
            Err(e) => match e.downcast::<PayBolt11InvoiceError>()? {
                PayBolt11InvoiceError::PreviousPaymentAttemptStillInProgress { .. }
                // FundedContractAlreadyExists is also same but with less information.
                // see https://discord.com/channels/990354215060795454/990354215878688860/1273318556108324904
                | PayBolt11InvoiceError::FundedContractAlreadyExists { .. } => {
                    bail!(ErrorCode::PayLnInvoiceAlreadyInProgress)
                }
                PayBolt11InvoiceError::NoLnGatewayAvailable => {
                    bail!(ErrorCode::NoLnGatewayAvailable)
                }
            },
        };
        // already paid
        if self
            .client
            .operation_log()
            .get_operation(payment_type.operation_id())
            .await
            .is_some_and(|o| o.outcome::<PayState>().is_some())
        {
            bail!(ErrorCode::PayLnInvoiceAlreadyPaid);
        }

        self.write_pending_send_fedi_fee(payment_type.operation_id(), Amount::from_msats(fedi_fee))
            .await?;
        drop(spend_guard);

        let _ = self
            .record_tx_date_fiat_info(
                payment_type.operation_id(),
                Amount::from_msats(est_total_spend),
            )
            .await;
        let response = self.subscribe_to_ln_pay(payment_type, extra_meta).await?;

        Ok(response)
    }

    pub async fn get_prev_pay_invoice_result(
        &self,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcPrevPayInvoiceResult> {
        let ln = &self.client.ln()?;
        let payment_result = ln
            .get_prev_payment_result(
                invoice.payment_hash(),
                &mut ln.db.begin_transaction_nc().await,
            )
            .await;
        Ok(RpcPrevPayInvoiceResult {
            completed: payment_result.completed_payment.is_some(),
        })
    }
    // Returns the fee details for making a payment on-chain. Returns an error in
    // case the amount exceeds the max spendable amount.
    pub async fn preview_pay_address(
        &self,
        address: Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
    ) -> Result<RpcFeeDetails> {
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let network_fees = self
            .client
            .wallet()?
            .get_withdraw_fees(
                // TODO: need to verify against federation network, but where do we get it from?
                &address.assume_checked(),
                amount,
            )
            .await?;

        let amount_msat = amount.to_sat() * 1000;
        let fedi_fee = (amount_msat * fedi_fee_ppm).div_ceil(MILLION);
        let network_fees_msat = network_fees.amount().to_sat() * 1000;
        let est_total_spend = amount_msat + fedi_fee + network_fees_msat;
        let virtual_balance = self.get_balance().await;
        if est_total_spend > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, Some(network_fees), None)
            )));
        }

        Ok(RpcFeeDetails {
            fedi_fee: RpcAmount(Amount::from_msats(fedi_fee)),
            network_fee: RpcAmount(Amount::from_msats(network_fees_msat)),
            federation_fee: RpcAmount(Amount::ZERO),
        })
    }

    // Pay an onchain address
    pub async fn pay_address(
        &self,
        address: Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
        frontend_meta: FrontendMetadata,
    ) -> Result<OperationId> {
        let wallet = self.client.wallet()?;
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let network_fees = wallet
            .get_withdraw_fees(
                // TODO: verify
                &address.clone().assume_checked(),
                amount,
            )
            .await?;

        let amount_msat = amount.to_sat() * 1000;
        let fedi_fee = (amount_msat * fedi_fee_ppm).div_ceil(MILLION);
        let network_fees_msat = network_fees.amount().to_sat() * 1000;
        let est_total_spend = amount_msat + fedi_fee + network_fees_msat;

        let spend_guard = self.spend_guard.lock().await;
        let virtual_balance = self.get_balance().await;
        if est_total_spend > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, Some(network_fees), None)
            )));
        }

        let operation_id = wallet
            .withdraw(
                // TODO: verify
                &address.clone().assume_checked(),
                amount,
                network_fees,
                BaseMetadata::from(frontend_meta),
            )
            .await?;
        self.write_pending_send_fedi_fee(operation_id, Amount::from_msats(fedi_fee))
            .await?;
        drop(spend_guard);
        let _ = self
            .record_tx_date_fiat_info(operation_id, Amount::from_msats(est_total_spend))
            .await;
        self.subscribe_to_operation(operation_id).await?;
        Ok(operation_id)
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
            LIGHTNING_OPERATION_TYPE => match operation.meta() {
                LightningOperationMeta {
                    variant: LightningOperationMetaVariant::Pay(pay_meta),
                    extra_meta,
                } => {
                    let extra_meta = serde_json::from_value::<LightningSendMetadata>(extra_meta)
                        .unwrap_or(LightningSendMetadata {
                            is_fedi_fee_remittance: false,
                            frontend_metadata: None,
                        });
                    // HACK: our code accidentally subscribed using wrong function in past.
                    if pay_meta.is_internal_payment
                        && operation
                            .outcome::<serde_json::Value>()
                            .is_some_and(internal_pay_is_bad_state)
                    {
                        anyhow::bail!("not subscribe to failed transaction");
                    }
                    self.spawn_cancellable("subscribe_to_ln_pay", move |fed| async move {
                        // FIXME: what happens if it fails?
                        if let Err(e) = fed
                            .subscribe_to_ln_pay(
                                if pay_meta.is_internal_payment {
                                    PayType::Internal(operation_id)
                                } else {
                                    PayType::Lightning(operation_id)
                                },
                                extra_meta,
                            )
                            .await
                        {
                            warn!("subscribe_to_ln_pay error: {e:?}")
                        }
                    });
                }
                LightningOperationMeta {
                    variant: LightningOperationMetaVariant::Receive { invoice, .. },
                    ..
                } => {
                    self.spawn_cancellable("subscribe_to_ln_receive", move |fed| async move {
                        // FIXME: what happens if it fails?
                        if let Err(e) = fed.subscribe_invoice(operation_id, invoice).await {
                            warn!("subscribe_to_ln_receive error: {e:?}")
                        }
                    });
                }
                LightningOperationMeta {
                    variant: LightningOperationMetaVariant::RecurringPaymentReceive { .. },
                    ..
                } => {
                    // Recurring receives are handled by the
                    // lnurl_receive_service
                }
                #[allow(deprecated)]
                LightningOperationMeta {
                    variant: LightningOperationMetaVariant::Claim { .. },
                    ..
                } => unreachable!("claims and recurring payments are not supported"),
            },
            MINT_OPERATION_TYPE => {
                let meta = operation.meta::<MintOperationMeta>();
                match meta.variant {
                    MintOperationMetaVariant::SpendOOB { .. } => {
                        self.spawn_cancellable("subscribe_oob_spend", move |fed| async move {
                            // FIXME: what happens if it fails?
                            fed.subscribe_oob_spend(operation_id).await
                        });
                    }
                    MintOperationMetaVariant::Reissuance { .. } => {
                        self.spawn_cancellable(
                            "subscribe_to_ecash_reissue",
                            move |fed| async move {
                                // FIXME: what happens if it fails?
                                fed.subscribe_to_ecash_reissue(operation_id, meta.amount)
                                    .await
                            },
                        );
                    }
                }
            }
            WALLET_OPERATION_TYPE => {
                let meta = operation.meta::<WalletOperationMeta>();
                match meta.variant {
                    WalletOperationMetaVariant::Deposit { .. } => {
                        // see subscribe_to_onchain_addresses
                    }
                    WalletOperationMetaVariant::Withdraw { .. } => {
                        self.spawn_cancellable("subscribe_pay_address", move |fed| async move {
                            if let Err(e) = fed.subscribe_pay_address(operation_id).await {
                                warn!("subscribe_pay_address error: {e:?}")
                            }
                        });
                    }
                    _ => {
                        tracing::debug!(
                            "Can't subscribe to operation id: {}",
                            operation.operation_module_kind()
                        );
                    }
                }
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
                StabilityPoolMeta::Deposit { .. } => {
                    self.spawn_cancellable("subscribe_spv2_deposit", move |fed| async move {
                        fed.subscribe_spv2_deposit_to_seek(operation_id).await
                    });
                }
                StabilityPoolMeta::Withdrawal { .. } => {
                    self.spawn_cancellable("subscribe_spv2_withdraw", move |fed| async move {
                        fed.subscribe_spv2_withdraw(operation_id).await
                    });
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
        let Ok(wallet) = self.client.wallet() else {
            return;
        };
        let tweak_idxes = wallet.list_peg_in_tweak_idxes().await;

        for tweak_data in tweak_idxes.into_values() {
            self.subscribe_deposit(tweak_data.operation_id);
        }
    }

    pub async fn subscribe_pay_address(&self, op_id: OperationId) -> Result<()> {
        let mut updates = self
            .client
            .wallet()?
            .subscribe_withdraw_updates(op_id)
            .await?
            .into_stream();

        while let Some(update) = updates.next().await {
            self.update_operation_state(op_id, update.clone()).await;
            match update {
                WithdrawState::Created => (),
                WithdrawState::Succeeded(_) => {
                    let _ = self.write_success_send_fedi_fee(op_id).await;
                }
                WithdrawState::Failed(_) => {
                    let _ = self.write_failed_send_fedi_fee(op_id).await;
                }
            }
            self.send_transaction_event(op_id).await;
        }

        Ok(())
    }

    pub async fn subscribe_to_ln_pay(
        &self,
        pay_type: PayType,
        extra_meta: LightningSendMetadata,
    ) -> Result<RpcPayInvoiceResponse> {
        let ln = self.client.ln()?;
        match pay_type {
            PayType::Internal(operation_id) => {
                let mut updates = ln.subscribe_internal_pay(operation_id).await?.into_stream();

                while let Some(update) = updates.next().await {
                    // Skip updating fee status if payment is for fee remittance
                    if !extra_meta.is_fedi_fee_remittance {
                        match update {
                            InternalPayState::Preimage(_) => {
                                let _ = self.write_success_send_fedi_fee(operation_id).await;
                            }
                            InternalPayState::Funding => (),
                            _ => {
                                let _ = self.write_failed_send_fedi_fee(operation_id).await;
                            }
                        }
                    }
                    match update {
                        InternalPayState::Preimage(preimage) => {
                            updates.next().await;
                            return Ok(RpcPayInvoiceResponse {
                                // FIXME: is this correct serialization?
                                preimage: hex::encode(preimage.0),
                            });
                        }
                        InternalPayState::RefundSuccess { .. } => {
                            updates.next().await;
                            bail!("Internal lightning payment failed, got refund");
                        }
                        InternalPayState::RefundError { .. } => {
                            updates.next().await;
                            bail!("Internal lightning payment failed, didn't get refund");
                        }
                        InternalPayState::FundingFailed { .. } => {
                            updates.next().await;
                            bail!("Failed to fund internal lightning payment");
                        }
                        InternalPayState::UnexpectedError(e) => {
                            updates.next().await;
                            bail!(e);
                        }
                        _ => {}
                    }

                    info!("Update: {:?}", update);
                }
                Err(anyhow!("Internal lightning payment failed"))
            }
            PayType::Lightning(operation_id) => {
                let mut updates = ln.subscribe_ln_pay(operation_id).await?.into_stream();
                while let Some(update) = updates.next().await {
                    self.update_operation_state(operation_id, update.clone())
                        .await;
                    // Skip updating fee status if payment is for fee remittance
                    if !extra_meta.is_fedi_fee_remittance {
                        match update {
                            LnPayState::Success { .. } => {
                                let _ = self.write_success_send_fedi_fee(operation_id).await;
                            }
                            LnPayState::Refunded { .. }
                            | LnPayState::Canceled
                            | LnPayState::UnexpectedError { .. } => {
                                let _ = self.write_failed_send_fedi_fee(operation_id).await;
                            }
                            _ => (),
                        }
                    }
                    match update {
                        LnPayState::Success { preimage } => {
                            updates.next().await;
                            return Ok(RpcPayInvoiceResponse { preimage });
                        }
                        LnPayState::Refunded { .. } => {
                            // TODO: better error message
                            updates.next().await;
                            bail!("Lightning payment failed, got refund")
                        }
                        LnPayState::Canceled => {
                            updates.next().await;
                            // FIXME: is this right?
                            bail!("Lightning payment failed, got refund")
                        }
                        LnPayState::UnexpectedError { error_message } => {
                            updates.next().await;
                            bail!(error_message)
                        }
                        _ => {}
                    }

                    info!("lightning update: {:?}", update);
                }
                Err(anyhow!("lightning payment failed"))
            }
        }
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
        let had_reused_ecash = if let Ok(x) = self.client.mint() {
            x.reused_note_secrets().await.is_empty().not()
        } else {
            false
        };
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
        let gateways = self.client.ln()?.list_gateways().await;
        let bridge_gateways: Vec<RpcLightningGateway> = gateways
            .into_iter()
            .map(|gw| RpcLightningGateway {
                api: gw.info.api.to_string(),
                node_pub_key: RpcPublicKey(gw.info.node_pub_key),
                gateway_id: RpcPublicKey(gw.info.gateway_id),
            })
            .collect();
        Ok(bridge_gateways)
    }

    /// Set gateway override for this federation. Pass None to clear the
    /// override.
    pub async fn set_gateway_override(&self, gateway_id: Option<&PublicKey>) -> Result<()> {
        self.gateway_service()?
            .set_gateway_override(&self.client, gateway_id)
            .await
    }

    /// Get the current gateway override for this federation.
    pub async fn get_gateway_override(&self) -> Result<Option<PublicKey>> {
        Ok(self
            .gateway_service()?
            .get_gateway_override(&self.client)
            .await)
    }

    /// Receive ecash
    /// TODO: user a better type than String
    pub async fn receive_ecash(
        &self,
        ecash: String,
        frontend_meta: FrontendMetadata,
    ) -> Result<(Amount, OperationId)> {
        let ecash = OOBNotes::from_str(&ecash)?;
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let amount = ecash.total_amount();
        let operation_id = self
            .client
            .mint()?
            .reissue_external_notes(
                ecash,
                EcashReceiveMetadata {
                    internal: false,
                    frontend_metadata: Some(frontend_meta),
                },
            )
            .await?;
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;
        let _ = self.record_tx_date_fiat_info(operation_id, amount).await;
        self.subscribe_to_operation(operation_id).await?;
        Ok((amount, operation_id))
    }

    pub async fn subscribe_to_ecash_reissue(
        &self,
        operation_id: OperationId,
        amount: Amount,
    ) -> Result<()> {
        let op = self
            .client
            .operation_log()
            .get_operation(operation_id)
            .await
            .context("operation not found")?;
        let meta = op.meta::<MintOperationMeta>();
        let is_overissue_correction =
            serde_json::from_value::<EcashReceiveMetadata>(meta.extra_meta)
                .is_ok_and(|x| x.internal);
        let mut updates = self
            .client
            .mint()?
            .subscribe_reissue_external_notes(operation_id)
            .await
            .unwrap()
            .into_stream();

        while let Some(update) = updates.next().await {
            self.update_operation_state(operation_id, update.clone())
                .await;
            match update {
                ReissueExternalNotesState::Done => {
                    if !is_overissue_correction {
                        let _ = self
                            .write_success_receive_fedi_fee(operation_id, amount)
                            .await;
                    }
                }
                ReissueExternalNotesState::Failed(_) => {
                    if !is_overissue_correction {
                        let _ = self.write_failed_receive_fedi_fee(operation_id).await;
                    }
                }
                _ => (),
            }
            if !is_overissue_correction {
                self.send_transaction_event(operation_id).await;
            }
            if let ReissueExternalNotesState::Failed(e) = update {
                updates.next().await;
                bail!(format!("Reissue failed: {e}"));
            }
        }
        Ok(())
    }

    /// Determine the maximum actual amount of e-cash that can be generated for
    /// sending taking into account fees.
    pub async fn calculate_max_generate_ecash(&self) -> Result<RpcAmount> {
        // Let's say that amount we're looking for is max. We wish to satisfy this
        // equation: max + fedi_fee = virtual_balance
        //
        // fedi_fee is calculated as follows:
        // fedi_fee = (max * fedi_fee_ppm) / MILLION
        //
        // Plugging this into the original equation, we get:
        // max + [(max * fedi_fee_ppm) / MILLION] = virtual_balance
        //
        // We can solve this for max as follows:
        // max = (virtual_balance * MILLION) / (MILLION + fedi_fee_ppm)
        // We use floor division here

        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let virtual_balance = self.get_balance().await;
        let max = {
            let numerator = virtual_balance.mul_u64(MILLION).msats;
            let denominator = MILLION + fedi_fee_ppm;
            numerator / denominator
        };
        Ok(RpcAmount(Amount::from_msats(max)))
    }

    /// Generate ecash
    pub async fn generate_ecash(
        &self,
        amount: Amount,
        include_invite: bool,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcGenerateEcashResponse> {
        let _guard = self.generate_ecash_lock.lock().await;
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = Amount::from_msats((amount.msats * fedi_fee_ppm).div_ceil(MILLION));

        let mint = self.client.mint()?;

        // If generating EXACT amount works, use those notes. Otherwise, generate using
        // AT LEAST strategy, marking it as internal TX (so we can filter it out).
        // Immediately cancel, which will reissue the notes attempting to fill in lower
        // denominations. And then generate using AT LEAST strategy again, which
        // will now have a high chance to producing the exact amount.
        let ecash_auto_cancel_duration = match self.get_network() {
            Some(Network::Bitcoin) | None => ECASH_AUTO_CANCEL_DURATION_MAINNET,
            _ => ECASH_AUTO_CANCEL_DURATION_MUTINYNET,
        };
        let cancel_time = fedimint_core::time::now() + ecash_auto_cancel_duration;
        let (spend_guard, operation_id, notes) = loop {
            let spend_guard = self.spend_guard.lock().await;
            let virtual_balance = self.get_balance().await;
            if amount + fedi_fee > virtual_balance {
                bail!(ErrorCode::InsufficientBalance(RpcAmount(
                    get_max_spendable_amount(virtual_balance, fedi_fee_ppm, None, None)
                )));
            }

            if let Ok((operation_id, notes)) = mint
                .spend_notes_with_selector(
                    &SelectNotesWithExactAmount,
                    amount,
                    ecash_auto_cancel_duration,
                    include_invite,
                    EcashSendMetadata {
                        internal: false,
                        frontend_metadata: Some(frontend_meta.clone()),
                    },
                )
                .await
            {
                assert_eq!(notes.total_amount(), amount);
                break (spend_guard, operation_id, notes);
            };

            // Essentially a ping to the guardian servers with the "ThresholdConsensus"
            // strategy. We do not want to proceed with selecting an excess
            // amount of notes (and reissuing them) if we can already determine
            // at this step that we don't have good connectivity.
            timeout(Duration::from_secs(10), self.client.api().session_count())
                .await
                .map_err(anyhow::Error::from)
                .and_then(|inner| inner.map_err(anyhow::Error::from))
                .context(ErrorCode::OfflineExactEcashFailed)?;

            let (_, notes) = mint
                .spend_notes_with_selector(
                    &SelectNotesWithAtleastAmount,
                    amount,
                    ecash_auto_cancel_duration,
                    include_invite,
                    EcashSendMetadata {
                        internal: true,
                        frontend_metadata: None,
                    },
                )
                .await?;
            drop(spend_guard);

            // try to make change
            timeout(REISSUE_ECASH_TIMEOUT, async {
                let notes_amount = notes.total_amount();
                let operation_id = mint
                    .reissue_external_notes(
                        notes,
                        EcashReceiveMetadata {
                            internal: true,
                            frontend_metadata: None,
                        },
                    )
                    .await?;
                self.subscribe_to_ecash_reissue(operation_id, notes_amount)
                    .await
            })
            .await
            .context("Failed to select notes with correct amount")??;
            // and retry
        };

        self.write_pending_send_fedi_fee(operation_id, fedi_fee)
            .await?;
        // spend_guard must be dropped after writing fee since virtual balance only
        // updates once fee is written
        drop(spend_guard);

        let _ = self
            .record_tx_date_fiat_info(operation_id, amount + fedi_fee)
            .await;
        self.subscribe_to_operation(operation_id).await?;

        Ok(RpcGenerateEcashResponse {
            ecash: notes.to_string(),
            cancel_at: to_unix_time(cancel_time)?,
            operation_id: RpcOperationId(operation_id),
        })
    }

    pub async fn cancel_ecash(&self, ecash: OOBNotes) -> Result<()> {
        let op_id = spendable_notes_to_operation_id(ecash.notes());
        // NOTE: try_cancel_spend_notes itself is not presisted across restarts.
        // it uses inmemory channel.
        self.client.mint()?.try_cancel_spend_notes(op_id).await;
        self.subscribe_oob_spend(op_id).await?;
        Ok(())
    }

    async fn subscribe_oob_spend(&self, op_id: OperationId) -> Result<(), anyhow::Error> {
        let mut updates = self
            .client
            .mint()?
            .subscribe_spend_notes(op_id)
            .await?
            .into_stream();
        let mut err = None;
        while let Some(update) = updates.next().await {
            self.update_operation_state(op_id, update.clone()).await;
            // From the fedi fee perspective, "UserCanceledSuccess" and "Refunded"
            // states indicate that fee should be refunded since the generated ecash was
            // never used by the recipient. So we'll mark those two states
            // as "failed sends". On the other hand, "UserCanceledFailure" and "Success"
            // states indicate that e-cash was reissued by another recipient, so we'll mark
            // those two states as "successful sends". We don't really care
            // about other states for the purpose of fedi fee.
            match update {
                fedimint_mint_client::SpendOOBState::UserCanceledSuccess
                | fedimint_mint_client::SpendOOBState::Refunded => {
                    let _ = self.write_failed_send_fedi_fee(op_id).await;
                }
                fedimint_mint_client::SpendOOBState::UserCanceledFailure
                | fedimint_mint_client::SpendOOBState::Success => {
                    let _ = self.write_success_send_fedi_fee(op_id).await;
                }
                _ => (),
            }
            match update {
                // TODO: intermediate states
                fedimint_mint_client::SpendOOBState::Created => {}
                fedimint_mint_client::SpendOOBState::UserCanceledProcessing => {}
                fedimint_mint_client::SpendOOBState::UserCanceledSuccess => {}
                fedimint_mint_client::SpendOOBState::Success => {}
                fedimint_mint_client::SpendOOBState::Refunded => {}
                fedimint_mint_client::SpendOOBState::UserCanceledFailure => {
                    err = Some(anyhow!(ErrorCode::EcashCancelFailed));
                }
            }
        }

        if let Some(err) = err {
            return Err(err);
        }
        Ok(())
    }

    pub async fn repair_wallet(&self) -> Result<()> {
        let mint = self.client.mint()?;
        mint.try_repair_wallet(100).await?;
        Ok(())
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
        tracing::info!("downloading verification doc {}", recovery_id);
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
        tracing::info!("approve social recovery {}", peer_id);
        let verification_client = self.social_verification(peer_id).await?;
        verification_client
            .approve_recovery(*recovery_id, guardian_password)
            .await?;
        Ok(())
    }

    pub async fn get_deposit_outcome(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<Option<DepositStateV2>> {
        // Return our cached outcome if we find it
        if let Some(outcome) = self
            .get_operation_state::<DepositStateV2>(&operation_id)
            .await?
        {
            return Ok(Some(outcome));
        }

        let Ok(wallet) = self.client.wallet() else {
            panic!("get deposit outcome called when wallet module is absent");
        };

        match wallet.subscribe_deposit(operation_id).await {
            Err(e) => Err(e),
            Ok(UpdateStreamOrOutcome::Outcome(outcome)) => Ok(Some(outcome)),
            // first item of this stream doesn't block: WaitingForTransaction
            Ok(UpdateStreamOrOutcome::UpdateStream(mut stream)) => Ok(stream.next().await),
        }
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
        let meta = entry.meta::<serde_json::Value>();
        let module = entry.operation_module_kind().to_owned();
        timeout_log_only(
            self.get_transaction_really_inner(operation_id, entry),
            Duration::from_secs(30),
            || {
                let meta = serde_json::to_string_pretty(&meta).unwrap();
                error!(
                    op = %operation_id.fmt_short(),
                    module,
                    meta,
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
        let fedi_fee_status = self
            .client
            .db()
            .begin_transaction_nc()
            .await
            .get_value(&OperationFediFeeStatusKey(operation_id))
            .await
            .map(Into::into);
        let fedi_fee_msats = match fedi_fee_status {
            Some(
                RpcOperationFediFeeStatus::PendingSend { fedi_fee }
                | RpcOperationFediFeeStatus::Success { fedi_fee },
            ) => fedi_fee.0.msats,
            _ => 0,
        };
        let outcome_time = entry.outcome_time();
        let (transaction_amount, transaction_kind, frontend_metadata);
        match entry.operation_module_kind() {
            LIGHTNING_OPERATION_TYPE => {
                let lightning_meta: LightningOperationMeta = entry.try_meta()?;
                match lightning_meta.variant {
                    LightningOperationMetaVariant::Pay(LightningOperationMetaPay {
                        invoice,
                        fee,
                        is_internal_payment,
                        ..
                    }) => {
                        let extra_meta = serde_json::from_value::<LightningSendMetadata>(
                            lightning_meta.extra_meta,
                        )
                        .unwrap_or(LightningSendMetadata {
                            is_fedi_fee_remittance: false,
                            frontend_metadata: None,
                        });

                        // Exclude fee remittance transactions from TX list
                        if extra_meta.is_fedi_fee_remittance {
                            return Ok(None);
                        }

                        transaction_amount = RpcAmount(Amount {
                            msats: invoice.amount_milli_satoshis().unwrap()
                                + fedi_fee_msats
                                + fee.msats,
                        });
                        frontend_metadata = extra_meta.frontend_metadata;
                        let state = if is_internal_payment {
                            entry
                                .try_outcome::<InternalPayState>()
                                .inspect_err(|e| info!(%e, "Found bad internal pay TX"))?;
                            self.get_client_operation_outcome(
                                operation_id,
                                entry,
                                |op_id| async move {
                                    self.client.ln()?.subscribe_internal_pay(op_id).await
                                },
                            )
                            .await?
                            .map(|internal_pay_state| {
                                match internal_pay_state {
                                    InternalPayState::Funding => LnPayState::Created,
                                    InternalPayState::Preimage(preimage) => LnPayState::Success {
                                        preimage: preimage.0.to_lower_hex_string(),
                                    },
                                    InternalPayState::RefundSuccess { error, .. } => {
                                        LnPayState::Refunded {
                                            gateway_error: GatewayPayError::GatewayInternalError {
                                                error_code: None,
                                                error_message: error.to_string(),
                                            },
                                        }
                                    }
                                    InternalPayState::RefundError { error_message, .. } => {
                                        LnPayState::UnexpectedError { error_message }
                                    }
                                    InternalPayState::FundingFailed { .. } => LnPayState::Canceled,
                                    InternalPayState::UnexpectedError(error_message) => {
                                        LnPayState::UnexpectedError { error_message }
                                    }
                                }
                            })
                        } else {
                            entry
                                .try_outcome::<LnPayState>()
                                .inspect_err(|e| info!(%e, "Found bad LN Pay TX"))?;
                            self.get_client_operation_outcome(
                                operation_id,
                                entry,
                                |op_id| async move { self.client.ln()?.subscribe_ln_pay(op_id).await }
                            ).await?
                        };
                        transaction_kind = RpcTransactionKind::LnPay {
                            ln_invoice: invoice.to_string(),
                            lightning_fees: RpcAmount(fee),
                            state: state.map(Into::into),
                        };
                    }
                    LightningOperationMetaVariant::Receive { invoice, .. } => {
                        transaction_amount = RpcAmount(Amount {
                            msats: invoice.amount_milli_satoshis().unwrap(),
                        });
                        frontend_metadata =
                            serde_json::from_value::<BaseMetadata>(lightning_meta.extra_meta)
                                .unwrap_or_default()
                                .into();
                        transaction_kind = RpcTransactionKind::LnReceive {
                            ln_invoice: invoice.to_string(),
                            state: self
                                .get_client_operation_outcome(
                                    operation_id,
                                    entry,
                                    |op_id| async move {
                                        self.client.ln()?.subscribe_ln_receive(op_id).await
                                    },
                                )
                                .await?
                                .map(Into::into),
                        };
                    }
                    LightningOperationMetaVariant::RecurringPaymentReceive(payment) => {
                        let state = self
                            .get_client_operation_outcome_cached::<LnReceiveState>(
                                operation_id,
                                entry,
                            )
                            .await?;
                        transaction_amount = RpcAmount(Amount {
                            msats: payment.invoice.amount_milli_satoshis().unwrap(),
                        });
                        // no frontend meta for recurring payments
                        frontend_metadata = None;
                        transaction_kind = RpcTransactionKind::LnRecurringdReceive {
                            state: state.map(Into::into),
                        };
                    }
                    #[allow(deprecated)]
                    LightningOperationMetaVariant::Claim { .. } => {
                        unreachable!("claims and recurring payments are not supported")
                    }
                }
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
                    transaction_amount = RpcAmount(amount + Amount::from_msats(fedi_fee_msats));
                    frontend_metadata =
                        match serde_json::from_value::<SPv2DepositMetadata>(extra_meta) {
                            Ok(SPv2DepositMetadata::StableBalance { frontend_metadata }) => {
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
                    let sweeper_initiated =
                        matches!(typed_extra_meta, Some(SPv2WithdrawMetadata::Sweeper));
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
                            }
                        }
                        _ => RpcTransactionKind::SPV2Withdrawal {
                            state: if let Some(item) = self.spv2_user_op_history_item(txid).await {
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
            MINT_OPERATION_TYPE => {
                let mint_meta: MintOperationMeta = entry.meta();
                match mint_meta.variant {
                    MintOperationMetaVariant::Reissuance { .. } => {
                        let extra_meta =
                            serde_json::from_value::<EcashReceiveMetadata>(mint_meta.extra_meta)
                                .unwrap_or(EcashReceiveMetadata {
                                    internal: false,
                                    frontend_metadata: None,
                                });
                        if extra_meta.internal {
                            return Ok(None);
                        }
                        transaction_amount = RpcAmount(mint_meta.amount);
                        frontend_metadata = extra_meta.frontend_metadata;
                        transaction_kind = RpcTransactionKind::OobReceive {
                            state: self
                                .get_client_operation_outcome(
                                    operation_id,
                                    entry,
                                    |op_id| async move {
                                        self.client
                                            .mint()?
                                            .subscribe_reissue_external_notes(op_id)
                                            .await
                                    },
                                )
                                .await?
                                .map(ReissueExternalNotesState::into),
                        };
                    }
                    MintOperationMetaVariant::SpendOOB {
                        requested_amount, ..
                    } => {
                        let extra_meta =
                            serde_json::from_value::<EcashSendMetadata>(mint_meta.extra_meta)
                                .unwrap_or(EcashSendMetadata {
                                    internal: false,
                                    frontend_metadata: None,
                                });
                        if extra_meta.internal {
                            return Ok(None);
                        }
                        transaction_amount =
                            RpcAmount(requested_amount + Amount::from_msats(fedi_fee_msats));
                        frontend_metadata = extra_meta.frontend_metadata;
                        transaction_kind = RpcTransactionKind::OobSend {
                            state: self
                                .get_client_operation_outcome(
                                    operation_id,
                                    entry,
                                    |op_id| async move {
                                        self.client.mint()?.subscribe_spend_notes(op_id).await
                                    },
                                )
                                .await?
                                .map(SpendOOBState::into),
                        };
                    }
                }
            }
            WALLET_OPERATION_TYPE => {
                let wallet_meta: WalletOperationMeta = entry.meta();
                frontend_metadata = serde_json::from_value::<BaseMetadata>(wallet_meta.extra_meta)
                    .unwrap_or_default()
                    .into();
                match wallet_meta.variant {
                    WalletOperationMetaVariant::Deposit { address, .. } => {
                        let outcome = self.get_deposit_outcome(operation_id).await?;
                        transaction_amount = match outcome {
                            Some(
                                DepositStateV2::WaitingForConfirmation { btc_deposited, .. }
                                | DepositStateV2::Claimed { btc_deposited, .. },
                            ) => {
                                let wallet = self.client.wallet();
                                let fees = wallet
                                    .map(|w| w.get_fee_consensus().peg_in_abs)
                                    .unwrap_or(Amount::ZERO);
                                RpcAmount(
                                    Amount::from_sats(btc_deposited.to_sat()).saturating_sub(fees),
                                )
                            }
                            _ => RpcAmount(Amount::ZERO),
                        };

                        transaction_kind = RpcTransactionKind::OnchainDeposit {
                            onchain_address: address.assume_checked().to_string(),
                            state: outcome.map(Into::into),
                        };
                    }
                    WalletOperationMetaVariant::Withdraw {
                        address,
                        amount,
                        fee,
                        change: _,
                    } => {
                        let core_amount = fedimint_core::Amount {
                            msats: amount.to_sat() * 1000,
                        };
                        transaction_amount = RpcAmount(core_amount);

                        let outcome = self
                            .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                                self.client
                                    .wallet()?
                                    .subscribe_withdraw_updates(op_id)
                                    .await
                            })
                            .await?;

                        transaction_kind = RpcTransactionKind::OnchainWithdraw {
                            onchain_address: address.assume_checked().to_string(),
                            onchain_fees: RpcAmount(Amount::from_sats(fee.amount().to_sat())),
                            onchain_fee_rate: fee.fee_rate.sats_per_kvb,
                            state: outcome.map(Into::into),
                        };
                    }
                    WalletOperationMetaVariant::RbfWithdraw { .. } => return Ok(None),
                }
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
            fedi_fee_status,
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

    async fn update_operation_state<T>(&self, operation_id: OperationId, state: T)
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
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = Amount::from_msats((amount.msats * fedi_fee_ppm).div_ceil(MILLION));
        let spend_guard = self.spend_guard.lock().await;
        let virtual_balance = self.get_balance().await;
        if amount + fedi_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, None, None)
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
        self.write_pending_send_fedi_fee(operation_id, fedi_fee)
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

    async fn subscribe_spv2_deposit_to_seek(&self, operation_id: OperationId) {
        let Ok(spv2) = self.client.spv2() else {
            return;
        };

        let update_stream = spv2.subscribe_deposit_operation(operation_id).await;
        if let Ok(update_stream) = update_stream {
            let mut updates = update_stream.into_stream();
            while let Some(state) = updates.next().await {
                self.update_operation_state(operation_id, state.clone())
                    .await;
                match state {
                    StabilityPoolDepositOperationState::TxRejected(_)
                    | StabilityPoolDepositOperationState::PrimaryOutputError(_) => {
                        let _ = self.write_failed_send_fedi_fee(operation_id).await;
                    }
                    StabilityPoolDepositOperationState::Success => {
                        // Force sync spv2 once deposit op is complete
                        self.spv2_force_sync();
                        let _ = self.write_success_send_fedi_fee(operation_id).await;
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
            let _ = self.write_failed_send_fedi_fee(operation_id).await;
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
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
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
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;
        self.spawn_cancellable("subscribe_spv2_withdraw", move |fed| async move {
            fed.subscribe_spv2_withdraw(operation_id).await
        });
        Ok(operation_id)
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
                            .write_success_receive_fedi_fee(operation_id, amount)
                            .await;
                        let _ = self.record_tx_date_fiat_info(operation_id, amount).await;
                    }
                    StabilityPoolWithdrawalOperationState::UnlockTxRejected(_)
                    | StabilityPoolWithdrawalOperationState::UnlockProcessingError(_)
                    | StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(_)
                    | StabilityPoolWithdrawalOperationState::PrimaryOutputError(_) => {
                        let _ = self.write_failed_receive_fedi_fee(operation_id).await;
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

    /// Deposit the given amount of msats into the stability pool
    /// with the intention of seeking. Once the fedimint transaction
    /// is accepted, the deposit is staged (pending). When the next
    /// cycle turnover occurs, staged seeks are processed in order
    /// to produce locks.
    pub async fn stability_pool_deposit_to_seek(&self, amount: Amount) -> Result<OperationId> {
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = Amount::from_msats((amount.msats * fedi_fee_ppm).div_ceil(MILLION));
        let spend_guard = self.spend_guard.lock().await;
        let virtual_balance = self.get_balance().await;
        if amount + fedi_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, None, None)
            )));
        }

        let module = self.client.sp()?;
        let operation_id = module.deposit_to_seek(amount).await?;
        self.write_pending_send_fedi_fee(operation_id, fedi_fee)
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
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let (operation_id, _) = self
            .client
            .sp()?
            .withdraw(unlocked_amount, locked_bps)
            .await?;
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
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
                        let _ = self.write_failed_send_fedi_fee(operation_id).await;
                    }
                    stability_pool_client_old::StabilityPoolDepositOperationState::Success => {
                        let _ = self.write_success_send_fedi_fee(operation_id).await;
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
            let _ = self.write_failed_send_fedi_fee(operation_id).await;
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
                            .write_success_receive_fedi_fee(operation_id, amount)
                            .await;
                        let _ = self.record_tx_date_fiat_info(operation_id, amount).await;
                    }
                    stability_pool_client_old::StabilityPoolWithdrawalOperationState::InvalidOperationType
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::TxRejected(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::PrimaryOutputError(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::CancellationSubmissionFailure(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::AwaitCycleTurnoverError(_)
                    | stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawIdleSubmissionFailure(_) => {
                        let _ = self.write_failed_receive_fedi_fee(operation_id).await;
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
        reused_ecash_proofs::generate(&*self.client.mint()?).await
    }

    /// We record the fee within the pending counter. On success, we move the
    /// fee to the success/accrued counter. On failure, we refund the fee.
    async fn write_pending_send_fedi_fee(
        &self,
        operation_id: OperationId,
        fedi_fee: Amount,
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
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        async move {
                            let db_key =
                                PendingFediFeesPerTXTypeKey(module, RpcTransactionDirection::Send);
                            let pending_fedi_fees =
                                fedi_fee + dbtx.get_value(&db_key).await.unwrap_or(Amount::ZERO);
                            dbtx.insert_entry(
                                &OperationFediFeeStatusKey(operation_id),
                                &OperationFediFeeStatus::PendingSend { fedi_fee },
                            )
                            .await;
                            dbtx.insert_entry(&db_key, &pending_fedi_fees).await;
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            });

        match res {
            Ok(_) => info!(
                "Successfully wrote pending send fedi fee for op ID {} with amount {}",
                operation_id.fmt_short(),
                fedi_fee
            ),
            Err(ref e) => warn!(
                "Error writing pending send fedi fee for op ID {} with amount {}: {}",
                operation_id.fmt_short(),
                fedi_fee,
                e
            ),
        }

        res
    }

    /// Transitions the OperationFediFeeStatus for a send operation from pending
    /// to success, iff the status is currently pending. Therefore the
    /// transition only happens once. When this transition happens, the pending
    /// counter is reduced and the accrued counter increased by the operation's
    /// fee amount. Returns Ok((true, new_status)) if a DB write actually
    /// occurred, and Ok((false, current_status)) if no write was needed,
    /// meaning that the status has already been recorded as a success.
    async fn write_success_send_fedi_fee(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<(bool, OperationFediFeeStatus)> {
        let module = ModuleKind::clone_from_str(
            self.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .ok_or(anyhow!("operation not found!"))?
                .operation_module_kind(),
        );
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        async move {
                            let op_key = OperationFediFeeStatusKey(operation_id);
                            let (did_overwrite, status) = match dbtx.get_value(&op_key).await {
                                Some(OperationFediFeeStatus::PendingSend { fedi_fee }) => {
                                    // Transition operation status
                                    let new_status = OperationFediFeeStatus::Success { fedi_fee };
                                    dbtx.insert_entry(&op_key, &new_status).await;

                                    // Reduce pending counter
                                    let pending_key = PendingFediFeesPerTXTypeKey(
                                        module.clone(),
                                        RpcTransactionDirection::Send,
                                    );
                                    let pending_fedi_fees = dbtx
                                        .get_value(&pending_key)
                                        .await
                                        .unwrap_or(Amount::ZERO)
                                        .saturating_sub(fedi_fee);
                                    dbtx.insert_entry(&pending_key, &pending_fedi_fees).await;

                                    // Increment outstanding/success counter and total accrued
                                    // counter
                                    let outstanding_key = OutstandingFediFeesPerTXTypeKey(
                                        module.clone(),
                                        RpcTransactionDirection::Send,
                                    );
                                    let outstanding_fedi_fees = fedi_fee
                                        + dbtx
                                            .get_value(&outstanding_key)
                                            .await
                                            .unwrap_or(Amount::ZERO);
                                    let total_accrued_key = TotalAccruedFediFeesPerTXTypeKey(
                                        module,
                                        RpcTransactionDirection::Send,
                                    );
                                    let total_accrued_fees = fedi_fee
                                        + dbtx
                                            .get_value(&total_accrued_key)
                                            .await
                                            .unwrap_or(Amount::ZERO);
                                    dbtx.insert_entry(&outstanding_key, &outstanding_fedi_fees)
                                        .await;
                                    dbtx.insert_entry(&total_accrued_key, &total_accrued_fees)
                                        .await;
                                    (true, new_status)
                                }
                                Some(status @ OperationFediFeeStatus::Success { .. }) => {
                                    (false, status)
                                }
                                Some(_) => bail!("Invalid operation fedi fee status found!"),
                                None => bail!("No operation fedi fee status found!"),
                            };
                            Ok::<(bool, OperationFediFeeStatus), anyhow::Error>((
                                did_overwrite,
                                status,
                            ))
                        }
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            });

        match res {
            Ok((true, _)) => {
                info!(
                    "Successfully wrote success send fedi fee for op ID {}",
                    operation_id.fmt_short()
                );
                if let Some(service) = self.fedi_fee_remittance_service.get() {
                    service
                        .remit_fedi_fee_if_threshold_met(
                            self,
                            module,
                            RpcTransactionDirection::Send,
                        )
                        .await;
                }
            }
            Ok((false, _)) => info!(
                "Already recorded success send fedi fee for op ID {}, nothing overwritten",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing success send fedi fee for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
    }

    /// Transitions the OperationFediFeeStatus for a send operation from pending
    /// to failure, iff the status is currently pending. Therefore the
    /// transition only happens once. We also credit the fee back to the user.
    /// Returns Ok((true, new_status)) if a DB write actually occurred, and
    /// Ok((false, current_status)) if no write was needed, meaning that the
    /// status has already been recorded as a failure.
    async fn write_failed_send_fedi_fee(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<(bool, OperationFediFeeStatus)> {
        let module = ModuleKind::clone_from_str(
            self.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .ok_or(anyhow!("operation not found!"))?
                .operation_module_kind(),
        );
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        async move {
                            let op_key = OperationFediFeeStatusKey(operation_id);
                            let (did_overwrite, status) = match dbtx.get_value(&op_key).await {
                                Some(OperationFediFeeStatus::PendingSend { fedi_fee }) => {
                                    // Transition operation status
                                    let new_status =
                                        OperationFediFeeStatus::FailedSend { fedi_fee };
                                    dbtx.insert_entry(&op_key, &new_status).await;

                                    // Reduce pending counter
                                    let pending_key = PendingFediFeesPerTXTypeKey(
                                        module,
                                        RpcTransactionDirection::Send,
                                    );
                                    let pending_fedi_fees = dbtx
                                        .get_value(&pending_key)
                                        .await
                                        .unwrap_or(Amount::ZERO)
                                        .saturating_sub(fedi_fee);
                                    dbtx.insert_entry(&pending_key, &pending_fedi_fees).await;
                                    (true, new_status)
                                }
                                Some(status @ OperationFediFeeStatus::FailedSend { .. }) => {
                                    (false, status)
                                }
                                Some(_) => bail!("Invalid operation fedi fee status found!"),
                                None => bail!("No operation fedi fee status found!"),
                            };
                            Ok::<(bool, OperationFediFeeStatus), anyhow::Error>((
                                did_overwrite,
                                status,
                            ))
                        }
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            });

        match res {
            Ok((true, _)) => info!(
                "Successfully wrote failed send fedi fee for op ID {}",
                operation_id.fmt_short()
            ),
            Ok((false, _)) => info!(
                "Already recorded failed send fedi fee for op ID {}, nothing overwritten",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing failed send fedi fee for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
    }

    /// We don't always know the amount to be received (in the case of
    /// generate_address for example), and even if we do, the amount to be
    /// received (from which the fee is to be debited) is not in the user's
    /// possession until the operation completes. So for receives, we just
    /// record the ppm, and when the operation succeeds, we debit the fee.
    async fn write_pending_receive_fedi_fee_ppm(
        &self,
        operation_id: OperationId,
        fedi_fee_ppm: u64,
    ) -> anyhow::Result<()> {
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async move {
                        dbtx.insert_entry(
                            &OperationFediFeeStatusKey(operation_id),
                            &OperationFediFeeStatus::PendingReceive { fedi_fee_ppm },
                        )
                        .await;
                        Ok::<(), anyhow::Error>(())
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            });

        match res {
            Ok(_) => info!(
                "Successfully wrote pending receive fedi fee for op ID {} with ppm {}",
                operation_id.fmt_short(),
                fedi_fee_ppm
            ),
            Err(ref e) => warn!(
                "Error writing pending receive fedi fee for op ID {} with ppm {}: {}",
                operation_id.fmt_short(),
                fedi_fee_ppm,
                e
            ),
        }

        res
    }

    /// Transitions the OperationFediFeeStatus for a receive operation from
    /// pending to success, iff the status is currently pending. Therefore
    /// the transition only happens once. We also debit the fee at this
    /// point since the amount must be known now and the funds are in the user's
    /// possession. Returns Ok((true, new_status)) if a DB write actually
    /// occurred, and Ok((false, current_status)) if no write was needed,
    /// meaning that the status has already been recorded as a success.
    async fn write_success_receive_fedi_fee(
        &self,
        operation_id: OperationId,
        amount: Amount,
    ) -> anyhow::Result<(bool, OperationFediFeeStatus)> {
        let module = ModuleKind::clone_from_str(
            self.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .ok_or(anyhow!("operation not found!"))?
                .operation_module_kind(),
        );
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let module = module.clone();
                        async move {
                            let op_key = OperationFediFeeStatusKey(operation_id);
                            let (did_overwrite, status) = match dbtx.get_value(&op_key).await {
                                Some(OperationFediFeeStatus::PendingReceive { fedi_fee_ppm }) => {
                                    let fedi_fee = Amount::from_msats(
                                        (amount.msats * fedi_fee_ppm).div_ceil(MILLION),
                                    );
                                    let outstanding_key = OutstandingFediFeesPerTXTypeKey(
                                        module.clone(),
                                        RpcTransactionDirection::Receive,
                                    );
                                    let outstanding_fedi_fees = fedi_fee
                                        + dbtx
                                            .get_value(&outstanding_key)
                                            .await
                                            .unwrap_or(Amount::ZERO);
                                    let total_accrued_key = TotalAccruedFediFeesPerTXTypeKey(
                                        module,
                                        RpcTransactionDirection::Receive,
                                    );
                                    let total_accrued_fees = fedi_fee
                                        + dbtx
                                            .get_value(&total_accrued_key)
                                            .await
                                            .unwrap_or(Amount::ZERO);
                                    let new_status = OperationFediFeeStatus::Success { fedi_fee };
                                    dbtx.insert_entry(&op_key, &new_status).await;
                                    dbtx.insert_entry(&outstanding_key, &outstanding_fedi_fees)
                                        .await;
                                    dbtx.insert_entry(&total_accrued_key, &total_accrued_fees)
                                        .await;
                                    (true, new_status)
                                }
                                Some(status @ OperationFediFeeStatus::Success { .. }) => {
                                    (false, status)
                                }
                                Some(_) => bail!("Invalid operation fedi fee status found!"),
                                None => bail!("No operation fedi fee status found!"),
                            };
                            Ok::<(bool, OperationFediFeeStatus), anyhow::Error>((
                                did_overwrite,
                                status,
                            ))
                        }
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            });

        match res {
            Ok((true, _)) => {
                info!(
                    "Successfully wrote success receive fedi fee for op ID {}",
                    operation_id.fmt_short()
                );
                if let Some(service) = self.fedi_fee_remittance_service.get() {
                    service
                        .remit_fedi_fee_if_threshold_met(
                            self,
                            module,
                            RpcTransactionDirection::Receive,
                        )
                        .await;
                }
            }
            Ok((false, _)) => info!(
                "Already recorded success receive fedi fee for op ID {}, nothing overwritten",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing success receive fedi fee for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
    }

    /// Transitions the OperationFediFeeStatus for a receive operation from
    /// pending to failure, iff the status is currently pending. Therefore
    /// the transition only happens once. Returns Ok((true, new_status)) if a DB
    /// write actually occurred, and Ok((false, current_status)) if no write
    /// was needed, meaning that the status has already been recorded as a
    /// failure.
    async fn write_failed_receive_fedi_fee(
        &self,
        operation_id: OperationId,
    ) -> anyhow::Result<(bool, OperationFediFeeStatus)> {
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async move {
                        let key = OperationFediFeeStatusKey(operation_id);
                        let (did_overwrite, status) = match dbtx.get_value(&key).await {
                            Some(OperationFediFeeStatus::PendingReceive { fedi_fee_ppm }) => {
                                let new_status =
                                    OperationFediFeeStatus::FailedReceive { fedi_fee_ppm };
                                dbtx.insert_entry(&key, &new_status).await;
                                (true, new_status)
                            }
                            Some(status @ OperationFediFeeStatus::FailedReceive { .. }) => {
                                (false, status)
                            }
                            Some(_) => bail!("Invalid operation fedi fee status found!"),
                            None => bail!("No operation fedi fee status found!"),
                        };
                        Ok::<(bool, OperationFediFeeStatus), anyhow::Error>((did_overwrite, status))
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                    anyhow::anyhow!(last_error)
                }
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            });

        match res {
            Ok((true, _)) => info!(
                "Successfully wrote failed receive fedi fee for op ID {}",
                operation_id.fmt_short()
            ),
            Ok((false, _)) => info!(
                "Already recorded failed receive fedi fee for op ID {}, nothing overwritten",
                operation_id.fmt_short()
            ),
            Err(ref e) => warn!(
                "Error writing failed receive fedi fee for op ID {}: {}",
                operation_id.fmt_short(),
                e
            ),
        }

        res
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

    pub async fn get_recurringd_api(&self) -> Option<SafeUrl> {
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

    /// Either register or get the lnurl.
    pub async fn get_recurringd_lnurl(&self, recurringd_api: SafeUrl) -> anyhow::Result<String> {
        let ln = self.client.ln()?;
        if let Some(payment_code) = ln
            .list_recurring_payment_codes()
            .await
            .into_values()
            .find(|x| x.recurringd_api == recurringd_api)
        {
            return Ok(payment_code.code);
        }

        let payment_code = ln
            .register_recurring_payment_code(
                fedimint_ln_client::recurring::RecurringPaymentProtocol::LNURL,
                recurringd_api,
                "[[\"text/plain\", \"\"]]", /* TODO: set it to
                                             * something better */
            )
            .await?;

        Ok(payment_code.code)
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
            info!(%e, "failed to backfill {} network on disk for fed {}", network, federation_id);
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
    fedi_fee_ppm: u64,
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

    // Let's say the max spend is x, Fedi fee ppm is (ppm_F), and virtual balance is
    // V. Gateway fees is made up of (base) and (ppm_G).
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
    let denominator_msats = MILLION + fedi_fee_ppm + gateway_ppm;
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
        should_override_localhost: bool,
    ) -> anyhow::Result<Self> {
        let invite_code = invite_code.to_lowercase();
        let mut invite_code = InviteCode::from_str(&invite_code)?;
        if should_override_localhost {
            override_localhost_invite_code(&mut invite_code);
        }
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
        let ((mut client_config, _api), backup) = tokio::try_join!(
            fedimint_api_client::download_from_invite_code(&connectors, &invite_code),
            Client::download_backup_from_federation_static(
                &api_single_guardian,
                &client_root_sercet,
                &decoders,
            )
        )?;
        if should_override_localhost {
            override_localhost_client_config(&mut client_config);
        }
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
}
