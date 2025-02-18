pub mod client;
pub mod db;
mod dev;
mod meta;

use std::any::Any;
use std::collections::HashMap;
use std::fmt::Debug;
use std::future::Future;
use std::pin::pin;
use std::str::FromStr;
use std::sync::{Arc, Weak};
use std::time::Duration;

use ::serde::{Deserialize, Serialize};
use anyhow::{anyhow, bail, Context, Result};
use bitcoin::address::NetworkUnchecked;
use bitcoin::secp256k1::PublicKey;
use bitcoin::{Address, Network};
use client::ClientExt;
use db::{FediRawClientConfigKey, InviteCodeKey, TransactionNotesKey};
use fedi_bug_report::reused_ecash_proofs::{self, SerializedReusedEcashProofs};
use fedi_social_client::common::VerificationDocument;
use fedi_social_client::{
    FediSocialClientInit, RecoveryFile, RecoveryId, SocialBackup, SocialRecoveryClient,
    SocialRecoveryState, SocialVerification, UserSeedPhrase, SOCIAL_RECOVERY_SECRET_CHILD_ID,
};
use fedimint_api_client::api::net::Connector;
use fedimint_api_client::api::{
    DynGlobalApi, DynModuleApi, FederationApiExt as _, StatusResponse, WsFederationApi,
};
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::db::ChronologicalOperationLogKey;
use fedimint_client::meta::{FetchKind, MetaService, MetaSource};
use fedimint_client::module::recovery::RecoveryProgress;
use fedimint_client::module::ClientModule;
use fedimint_client::oplog::{OperationLogEntry, UpdateStreamOrOutcome};
use fedimint_client::secret::RootSecretStrategy;
use fedimint_client::{Client, ClientBuilder, ClientHandle};
use fedimint_core::config::{ClientConfig, FederationId};
use fedimint_core::core::{ModuleKind, OperationId};
use fedimint_core::db::{
    Committable, Database, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped,
};
use fedimint_core::invite_code::InviteCode;
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::module::ApiRequestErased;
use fedimint_core::task::{timeout, MaybeSend, MaybeSync, TaskGroup};
use fedimint_core::timing::TimeReporter;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::{maybe_add_send_sync, Amount, PeerId};
use fedimint_derive_secret::{ChildId, DerivableSecret};
use fedimint_ln_client::{
    InternalPayState, LightningClientInit, LightningOperationMeta, LightningOperationMetaPay,
    LightningOperationMetaVariant, LnPayState, LnReceiveState, OutgoingLightningPayment,
    PayBolt11InvoiceError, PayType,
};
use fedimint_ln_common::config::FeeToAmount;
use fedimint_ln_common::LightningGateway;
use fedimint_meta_client::MetaModuleMetaSourceWithFallback;
use fedimint_mint_client::{
    spendable_notes_to_operation_id, MintClientInit, MintClientModule, MintOperationMeta,
    MintOperationMetaVariant, OOBNotes, ReissueExternalNotesState, SelectNotesWithAtleastAmount,
    SelectNotesWithExactAmount,
};
use fedimint_wallet_client::{
    DepositStateV2, PegOutFees, WalletClientInit, WalletOperationMeta, WalletOperationMetaVariant,
    WithdrawState,
};
use futures::{FutureExt, StreamExt};
use lightning_invoice::{Bolt11Invoice, RoutingFees};
use meta::{LegacyMetaSourceWithExternalUrl, MetaEntries, MetaServiceExt};
use serde::de::DeserializeOwned;
use stability_pool_client_old::{
    ClientAccountInfo, StabilityPoolClientInit, StabilityPoolDepositOperationState,
    StabilityPoolMeta, StabilityPoolWithdrawalOperationState,
};
use tokio::sync::{Mutex, OnceCell};
use tracing::{error, info, instrument, warn, Level};

use self::backup_service::BackupService;
pub use self::backup_service::BackupServiceStatus;
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
use crate::constants::{
    ECASH_AUTO_CANCEL_DURATION, LIGHTNING_OPERATION_TYPE, MILLION, MINT_OPERATION_TYPE,
    PAY_INVOICE_TIMEOUT, REISSUE_ECASH_TIMEOUT, STABILITY_POOL_OPERATION_TYPE,
    WALLET_OPERATION_TYPE,
};
use crate::error::ErrorCode;
use crate::event::{Event, EventSink, RecoveryProgressEvent, TypedEventExt};
use crate::features::FeatureCatalog;
use crate::fedi_fee::{FediFeeHelper, FediFeeRemittanceService};
use crate::storage::{AppState, FediFeeSchedule};
use crate::types::{
    federation_v2_to_rpc_federation, EcashReceiveMetadata, EcashSendMetadata, GuardianStatus,
    LightningSendMetadata, OperationFediFeeStatus, RpcAmount, RpcBitcoinDetails, RpcFederationId,
    RpcFederationMaybeLoading, RpcFederationPreview, RpcFeeDetails, RpcGenerateEcashResponse,
    RpcInvoice, RpcLightningDetails, RpcLightningGateway, RpcLnState, RpcOOBState, RpcOnchainState,
    RpcOperationFediFeeStatus, RpcPayAddressResponse, RpcPayInvoiceResponse, RpcPublicKey,
    RpcReturningMemberStatus, RpcStabilityPoolTransactionState, RpcTransaction,
    RpcTransactionDirection, WithdrawalDetails,
};
use crate::utils::{display_currency, to_unix_time, unix_now};

mod backup_service;
mod ln_gateway_service;
mod stability_pool_sweeper_service;

pub const GUARDIAN_STATUS_TIMEOUT: Duration = Duration::from_secs(10);

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

/// Federation is a wrapper of "client ng" to assist with handling RPC commands
pub struct FederationV2 {
    pub client: ClientHandle,
    pub event_sink: EventSink,
    pub task_group: TaskGroup,
    pub operation_states:
        Arc<Mutex<HashMap<OperationId, Box<maybe_add_send_sync!(dyn Any + 'static)>>>>,
    // DerivableSecret used for non-client usecases like LNURL and Nostr etc
    pub auxiliary_secret: DerivableSecret,
    // Helper object to retrieve the schedule used for charging Fedi's fee for different types of
    // transactions.
    pub fedi_fee_helper: Arc<FediFeeHelper>,
    pub backup_service: Arc<BackupService>,
    pub fedi_fee_remittance_service: OnceCell<FediFeeRemittanceService>,
    pub recovering: bool,
    pub gateway_service: OnceCell<LnGatewayService>,
    pub stability_pool_sweeper_service: OnceCell<StabilityPoolSweeperService>,
    // Mutex that is held within spending functions to ensure that virtual balance doesn't become
    // negative. That is, two concurrent spends don't accidentally spend more than the virtual
    // balance would allow. We hold the mutex over a span that covers the time of check (recording
    // virtual balance) and the time of use (spending ecash and recording fee).
    pub spend_guard: Arc<Mutex<()>>,
    // Mutex to prevent concurrent generate_ecash because logic is very fragile.
    pub generate_ecash_lock: Arc<Mutex<()>>,
    pub feature_catalog: Arc<FeatureCatalog>,
    pub app_state: Arc<AppState>,
    pub this_weak: Weak<Self>,
    pub guard: FederationLockGuard,
}

impl FederationV2 {
    /// Instantiate Federation from FediConfig
    async fn build_client_builder(db: Database) -> anyhow::Result<ClientBuilder> {
        let mut client_builder = fedimint_client::Client::builder(db).await?;
        client_builder.with_meta_service(MetaService::new(MetaModuleMetaSourceWithFallback::new(
            LegacyMetaSourceWithExternalUrl::default(),
        )));
        client_builder.with_module(MintClientInit);
        client_builder.with_module(LightningClientInit::default());
        client_builder.with_module(WalletClientInit(None));
        client_builder.with_module(FediSocialClientInit);
        client_builder.with_module(StabilityPoolClientInit);
        client_builder.with_primary_module_kind(fedimint_mint_client::KIND);
        Ok(client_builder)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn new(
        client: ClientHandle,
        guard: FederationLockGuard,
        event_sink: EventSink,
        task_group: TaskGroup,
        secret: DerivableSecret,
        fedi_fee_helper: Arc<FediFeeHelper>,
        feature_catalog: Arc<FeatureCatalog>,
        app_state: Arc<AppState>,
    ) -> Arc<Self> {
        let recovering = client.has_pending_recoveries();
        let federation = Arc::new_cyclic(|weak| Self {
            event_sink,
            task_group: task_group.clone(),
            operation_states: Default::default(),
            auxiliary_secret: secret,
            fedi_fee_helper,
            backup_service: BackupService::default().into(),
            fedi_fee_remittance_service: OnceCell::new(),
            recovering,
            gateway_service: OnceCell::new(),
            stability_pool_sweeper_service: OnceCell::new(),
            client,
            spend_guard: Default::default(),
            generate_ecash_lock: Default::default(),
            feature_catalog,
            app_state,
            this_weak: weak.clone(),
            guard,
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
        let backup_service = self.backup_service.clone();
        self.spawn_cancellable("backup_service", move |fed| async move {
            backup_service.run_continuously(&fed.client).await;
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
            let mut subscribe_to_updates =
                std::pin::pin!(fed.client.meta_service().subscribe_to_updates());
            while subscribe_to_updates.next().await.is_some() {
                fed.send_federation_event().await;
            }
        });

        // We disable the StabilityPoolSweeperService in tests to ensure that staged
        // seeks don't accidentally disappear if a test takes longer than expected and a
        // stability pool cycle elapses during the course of the test.
        #[cfg(not(test))]
        if self.client.sp().is_ok()
            && self
                .stability_pool_sweeper_service
                .set(StabilityPoolSweeperService::new(self))
                .is_err()
        {
            error!("stability pool sweeper service already initialized");
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
    #[allow(clippy::too_many_arguments)]
    pub async fn from_db(
        db: Database,
        guard: FederationLockGuard,
        event_sink: EventSink,
        task_group: TaskGroup,
        root_mnemonic: &bip39::Mnemonic,
        device_index: u8,
        fedi_fee_helper: Arc<FediFeeHelper>,
        feature_catalog: Arc<FeatureCatalog>,
        app_state: Arc<AppState>,
    ) -> anyhow::Result<Arc<Self>> {
        let client_builder = Self::build_client_builder(db.clone()).await?;
        let config = Client::get_config_from_db(&db)
            .await
            .context("config not found in database")?;
        let federation_id = config.calculate_federation_id();

        let client = {
            info!("started federation loading");
            let _g = TimeReporter::new("federation loading").level(Level::INFO);
            client_builder
                .open(Self::client_root_secret_from_root_mnemonic(
                    root_mnemonic,
                    &federation_id,
                    device_index,
                ))
                .await?
        };
        let auxiliary_secret =
            Self::auxiliary_secret_from_root_mnemonic(root_mnemonic, &federation_id, device_index);
        Ok(Self::new(
            client,
            guard,
            event_sink,
            task_group.make_subgroup(),
            auxiliary_secret,
            fedi_fee_helper,
            feature_catalog,
            app_state,
        )
        .await)
    }

    pub async fn federation_preview(
        invite_code: &str,
        root_mnemonic: &bip39::Mnemonic,
        device_index: u8,
        should_override_localhost: bool,
    ) -> Result<RpcFederationPreview> {
        let invite_code = invite_code.to_lowercase();
        let mut invite_code = InviteCode::from_str(&invite_code)?;
        if should_override_localhost {
            override_localhost_invite_code(&mut invite_code);
        }
        let api_single_gaurdian = DynGlobalApi::from_invite_code(&Connector::Tcp, &invite_code);
        let client_root_sercet = {
            let federation_id = invite_code.federation_id();
            // We do an additional derivation using `DerivableSecret::federation_key` since
            // that is what fedimint-client does internally
            Self::client_root_secret_from_root_mnemonic(root_mnemonic, &federation_id, device_index)
                .federation_key(&federation_id)
        };
        let decoders = ModuleDecoderRegistry::default().with_fallback();
        let (client_config, backup) = tokio::join!(
            download_from_invite_code(&invite_code),
            Client::download_backup_from_federation_static(
                &api_single_gaurdian,
                &client_root_sercet,
                &decoders,
            )
        );
        let config = client_config.context("failed to connect")?;

        let meta_source =
            MetaModuleMetaSourceWithFallback::new(LegacyMetaSourceWithExternalUrl::default());
        let meta = meta_source
            .fetch(&config, &api_single_gaurdian, FetchKind::Initial, None)
            .await?
            .values
            .into_iter()
            .map(|(k, v)| (k.0, v.0))
            .collect();

        Ok(RpcFederationPreview {
            id: RpcFederationId(config.global.calculate_federation_id().to_string()),
            name: config
                .global
                .federation_name()
                .map(|x| x.to_owned())
                .unwrap_or(config.global.calculate_federation_id().to_string()[0..8].to_string()),
            meta,
            invite_code: invite_code.to_string(),
            version: 2,
            returning_member_status: match backup {
                Ok(Some(_)) => RpcReturningMemberStatus::ReturningMember,
                Ok(None) => RpcReturningMemberStatus::NewMember,
                Err(_) => RpcReturningMemberStatus::Unknown,
            },
        })
    }
    /// Download federation configs using an invite code. Save client config to
    /// correct database with Storage.
    #[allow(clippy::too_many_arguments)]
    pub async fn join(
        invite_code_string: String,
        guard: FederationLockGuard,
        event_sink: EventSink,
        task_group: TaskGroup,
        db: Database,
        root_mnemonic: &bip39::Mnemonic,
        device_index: u8,
        recover_from_scratch: bool,
        fedi_fee_helper: Arc<FediFeeHelper>,
        feature_catalog: Arc<FeatureCatalog>,
        app_state: Arc<AppState>,
    ) -> Result<Arc<Self>> {
        let mut invite_code =
            InviteCode::from_str(&invite_code_string).context("invalid invite code")?;
        if feature_catalog.override_localhost.is_some() {
            override_localhost_invite_code(&mut invite_code);
        }
        let mut client_config: ClientConfig = download_from_invite_code(&invite_code).await?;
        if feature_catalog.override_localhost.is_some() {
            override_localhost_client_config(&mut client_config);
        }

        // fedimint-client will add decoders
        let mut dbtx = db.begin_transaction().await;
        let fedi_config = FediConfig {
            client_config: client_config.clone(),
        };
        dbtx.insert_entry(
            &FediRawClientConfigKey,
            &serde_json::to_string(&fedi_config)?,
        )
        .await;
        dbtx.insert_entry(&InviteCodeKey, &invite_code_string).await;
        dbtx.commit_tx().await;

        let client_builder = Self::build_client_builder(db).await?;
        let federation_id = client_config.calculate_federation_id();
        let client_secret = Self::client_root_secret_from_root_mnemonic(
            root_mnemonic,
            &federation_id,
            device_index,
        );
        let auxiliary_secret =
            Self::auxiliary_secret_from_root_mnemonic(root_mnemonic, &federation_id, device_index);
        // restore from scratch is not used because it takes too much time.
        // FIXME: api secret
        let client_backup = client_builder
            .download_backup_from_federation(&client_secret, &client_config, None)
            .await?;
        let client = if recover_from_scratch {
            info!("recovering from scratch");
            client_builder
                .recover(client_secret, client_config, None, None)
                .await?
        } else if let Some(client_backup) = client_backup {
            info!("backup found {:?}", client_backup);
            client_builder
                .recover(client_secret, client_config, None, Some(client_backup))
                .await?
        } else {
            info!("backup not found");
            // FIXME: api secret
            client_builder
                .join(client_secret, client_config, None)
                .await?
        };
        let this = Self::new(
            client,
            guard,
            event_sink,
            task_group.make_subgroup(),
            auxiliary_secret,
            fedi_fee_helper,
            feature_catalog,
            app_state,
        )
        .await;
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
            .get_meta("federation_name")
            .unwrap_or(self.federation_id().to_string()[0..8].to_string())
    }

    pub async fn get_cached_meta(&self) -> MetaEntries {
        let cfg_fetcher = async { self.client.config().await.global.meta };

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
                match self
                    .client
                    .meta_service()
                    .entries_from_db(self.client.db())
                    .await
                {
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
        if self.feature_catalog.override_localhost.is_none() {
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

    pub async fn guardian_status(&self) -> anyhow::Result<Vec<GuardianStatus>> {
        let api_secret = self.client.api_secret();
        let peer_clients: Vec<_> = self
            .client
            .get_peer_urls()
            .await
            .iter() // use iter() instead of into_iter()
            .map(|(&peer_id, endpoint)| {
                (
                    peer_id,
                    WsFederationApi::new(
                        &Connector::Tcp,
                        vec![(peer_id, endpoint.clone())],
                        api_secret,
                    ),
                )
            })
            .collect();

        let futures = peer_clients
            .into_iter()
            .map(|(guardian, client)| async move {
                let start = fedimint_core::time::now();
                match timeout(
                    GUARDIAN_STATUS_TIMEOUT,
                    client.request_current_consensus::<StatusResponse>(
                        "status".into(),
                        ApiRequestErased::default(),
                    ),
                )
                .await
                {
                    Ok(Ok(status_response)) => {
                        // Ensure you log before the match, to capture even partial responses
                        info!("Raw status response: {:?}", status_response);
                        GuardianStatus::Online {
                            guardian: guardian.to_string(),
                            latency_ms: start
                                .elapsed()
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
    pub async fn generate_address(&self) -> Result<String> {
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
            .allocate_deposit_address_expert_only(())
            .await?;
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;

        self.subscribe_deposit(operation_id, address.to_string())
            .await?;

        Ok(address.to_string())
    }

    /// Generate lightning invoice
    pub async fn generate_invoice(
        &self,
        amount: RpcAmount,
        description: String,
        expiry_time: Option<u64>,
    ) -> Result<RpcInvoice> {
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
                amount.0,
                lightning_invoice::Bolt11InvoiceDescription::Direct(
                    &lightning_invoice::Description::new(description)?,
                ),
                expiry_time,
                (),
                gateway,
            )
            .await?;

        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;
        let _ = self.record_tx_date_fiat_info(operation_id, amount.0).await;
        self.subscribe_invoice(operation_id, invoice.clone())
            .await?;

        let invoice: RpcInvoice = invoice.try_into()?;
        Ok(RpcInvoice {
            fee: Some(RpcFeeDetails {
                fedi_fee: RpcAmount(Amount::from_msats(
                    (invoice.amount.0.msats * fedi_fee_ppm).div_ceil(MILLION),
                )),
                network_fee: RpcAmount(Amount::ZERO),
                federation_fee: RpcAmount(Amount::ZERO),
            }),
            ..invoice
        })
    }

    async fn subscribe_deposit(&self, operation_id: OperationId, address: String) -> Result<()> {
        self.spawn_cancellable("subscribe deposit", move |fed| async move {
            let Ok(wallet) = fed.client.wallet() else {
                error!("Wallet module not present!");
                return;
            };
            let Ok(mut updates) = wallet
                .subscribe_deposit(operation_id)
                .await
                .map(|x| x.into_stream())
                .inspect_err(|e| {
                    warn!("subscribing to 0.3 deposits is not implemented: {e}");
                })
            else {
                return;
            };
            let pending_fedi_fee_status = fed
                .client
                .db()
                .begin_transaction_nc()
                .await
                .get_value(&OperationFediFeeStatusKey(operation_id))
                .await;
            while let Some(update) = updates.next().await {
                info!("Update: {:?}", update);
                fed.update_operation_state(operation_id, update.clone())
                    .await;
                let deposit_outcome = update.clone();
                match update {
                    DepositStateV2::WaitingForConfirmation { btc_deposited, .. }
                    | DepositStateV2::Confirmed { btc_deposited, .. }
                    | DepositStateV2::Claimed { btc_deposited, .. } => {
                        let federation_fees = wallet.get_fee_consensus().peg_in_abs;
                        let amount = Amount::from_sats(btc_deposited.to_sat()) - federation_fees;
                        // FIXME: add fedi fees once fedimint await primary module outputs
                        let fedi_fee_status = if let DepositStateV2::Claimed { .. } = &update {
                            fed.write_success_receive_fedi_fee(operation_id, amount)
                                .await
                                .map(|(_, status)| status)
                                .ok()
                        } else {
                            pending_fedi_fee_status.clone()
                        };
                        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
                        let tx_date_fiat_info = fed
                            .dbtx()
                            .await
                            .get_value(&TransactionDateFiatInfoKey(operation_id))
                            .await;
                        let transaction = RpcTransaction::new(
                            operation_id.fmt_full().to_string(),
                            unix_now().expect("unix time should exist"),
                            RpcAmount(amount),
                            RpcTransactionDirection::Receive,
                            fedi_fee_status.map(Into::into),
                            tx_date_fiat_info,
                        )
                        .with_onchain_state(RpcOnchainState::from_deposit_state(deposit_outcome))
                        .with_bitcoin(RpcBitcoinDetails {
                            address: address.clone(),
                        });
                        info!("send_transaction_event: {:?}", transaction);
                        fed.send_transaction_event(transaction);
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
        Ok(())
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
                match update {
                    LnReceiveState::Claimed => {
                        let amount = Amount {
                            msats: invoice.amount_milli_satoshis().unwrap(),
                        };
                        let fedi_fee_status = fed
                            .write_success_receive_fedi_fee(operation_id, amount)
                            .await
                            .map(|(_, status)| status)
                            .ok()
                            .map(Into::into);
                        let tx_date_fiat_info = fed
                            .dbtx()
                            .await
                            .get_value(&TransactionDateFiatInfoKey(operation_id))
                            .await;
                        let transaction = RpcTransaction::new(
                            operation_id.fmt_full().to_string(),
                            unix_now().expect("unix time should exist"),
                            RpcAmount(amount),
                            RpcTransactionDirection::Receive,
                            fedi_fee_status,
                            tx_date_fiat_info,
                        )
                        .with_ln_state(RpcLnState::from_ln_recv_state(update))
                        .with_lightning(RpcLightningDetails {
                            invoice: invoice.to_string(),
                            fee: None,
                        });
                        fed.send_transaction_event(transaction);
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

    /// Decodes the given lightning invoice (as String) into an RpcInvoice
    /// whilst attaching federation-specific fee details to the response
    pub async fn decode_invoice(&self, invoice: String) -> Result<RpcInvoice> {
        let invoice: Bolt11Invoice = invoice.trim().parse().context(ErrorCode::InvalidInvoice)?;
        let rpc_invoice: RpcInvoice = invoice.clone().try_into()?;
        let amount = rpc_invoice.amount.0;

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
            is_internal_payment = invoice_has_internal_payment_markers(&invoice, markers);
            if !is_internal_payment {
                let gateways = self
                    .client
                    .ln()?
                    .list_gateways()
                    .await
                    .into_iter()
                    .map(|g| g.info)
                    .collect::<Vec<_>>();
                is_internal_payment = invoice_routes_back_to_federation(&invoice, gateways);
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

        let fee = Some(RpcFeeDetails {
            fedi_fee: RpcAmount(Amount::from_msats(fedi_fee)),
            network_fee,
            federation_fee: RpcAmount(Amount::ZERO),
        });

        Ok(RpcInvoice { fee, ..rpc_invoice })
    }

    /// Pay lightning invoice
    pub async fn pay_invoice(&self, invoice: &Bolt11Invoice) -> Result<RpcPayInvoiceResponse> {
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
        let response = timeout(
            PAY_INVOICE_TIMEOUT,
            self.subscribe_to_ln_pay(payment_type, extra_meta, invoice.clone()),
        )
        .await
        .context(ErrorCode::Timeout)??;

        Ok(response)
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
            .get_withdraw_fees(address.clone(), amount)
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
    ) -> Result<RpcPayAddressResponse> {
        let wallet = self.client.wallet()?;
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let network_fees = wallet.get_withdraw_fees(address.clone(), amount).await?;

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

        let operation_id = wallet.withdraw(address, amount, network_fees, ()).await?;
        self.write_pending_send_fedi_fee(operation_id, Amount::from_msats(fedi_fee))
            .await?;
        drop(spend_guard);
        let _ = self
            .record_tx_date_fiat_info(operation_id, Amount::from_msats(est_total_spend))
            .await;
        let mut updates = wallet
            .subscribe_withdraw_updates(operation_id)
            .await?
            .into_stream();

        while let Some(update) = updates.next().await {
            match update {
                WithdrawState::Succeeded(txid) => {
                    // TODO shaurya "pay_address" doesn't have a subscribe_ style function
                    // and isn't included in "subscribe_to_operation". Is that ok?
                    let _ = self.write_success_send_fedi_fee(operation_id).await;
                    return Ok(RpcPayAddressResponse {
                        txid: txid.to_string(),
                    });
                }
                WithdrawState::Failed(e) => {
                    let _ = self.write_failed_send_fedi_fee(operation_id).await;
                    return Err(anyhow!("Withdraw failed: {e}"));
                }
                _ => {}
            }
        }

        unreachable!("Update stream ended without outcome");
    }

    // Get withdrawal outcome
    pub async fn get_withdrawal_outcome(
        &self,
        operation_id: OperationId,
    ) -> Option<(WithdrawState, Option<bitcoin::Txid>)> {
        let Ok(wallet) = self.client.wallet() else {
            return None;
        };
        let mut updates = match wallet.subscribe_withdraw_updates(operation_id).await {
            Err(_) => return None,
            Ok(stream) => stream.into_stream(),
        };

        while let Some(update) = updates.next().await {
            match update {
                WithdrawState::Succeeded(txid) => {
                    return Some((update, Some(txid)));
                }
                WithdrawState::Failed(_) => {
                    return Some((update, None));
                }
                _ => {}
            }
        }

        unreachable!("Update stream ended without outcome");
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
                                pay_meta.invoice,
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
                    variant: LightningOperationMetaVariant::Claim { .. },
                    ..
                } => unreachable!("claims are not supported"),
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
                match meta {
                    WalletOperationMeta {
                        variant: WalletOperationMetaVariant::Deposit { address, .. },
                        ..
                    } => {
                        self.subscribe_deposit(operation_id, address.assume_checked().to_string())
                            .await?;
                    }
                    _ => {
                        tracing::debug!(
                            "Can't subscribe to operation id: {}",
                            operation.operation_module_kind()
                        );
                    }
                }
            }
            STABILITY_POOL_OPERATION_TYPE => match operation.meta::<StabilityPoolMeta>() {
                StabilityPoolMeta::Deposit { .. } => {
                    self.spawn_cancellable(
                        "subscribe_stability_pool_deposit",
                        move |fed| async move {
                            fed.subscribe_stability_pool_deposit_to_seek(operation_id)
                                .await
                        },
                    );
                }
                StabilityPoolMeta::CancelRenewal { .. } | StabilityPoolMeta::Withdrawal { .. } => {
                    self.spawn_cancellable(
                        "subscribe_stability_pool_withdraw",
                        move |fed| async move {
                            fed.subscribe_stability_pool_withdraw(operation_id).await
                        },
                    );
                }
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

    pub async fn subscribe_to_ln_pay(
        &self,
        pay_type: PayType,
        extra_meta: LightningSendMetadata,
        _invoice: Bolt11Invoice,
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
                        LnPayState::Canceled { .. } => {
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
                let mut updates = fed.client.subscribe_balance_changes().await;
                while (updates.next().await).is_some() {
                    fed.send_balance_event().await;
                }
            },
        );
    }

    pub fn recovering(&self) -> bool {
        self.recovering
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

    fn send_transaction_event(&self, transaction: RpcTransaction) {
        let event = Event::transaction(self.federation_id().to_string(), transaction);
        self.event_sink.typed_event(&event);
    }

    fn send_recovery_progress(&self, progress: RecoveryProgress) {
        let event = Event::RecoveryProgress(RecoveryProgressEvent {
            federation_id: RpcFederationId(self.federation_id().to_string()),
            complete: progress.complete,
            total: progress.total,
        });
        self.event_sink.typed_event(&event);
    }

    /// Send whenever balance changes
    pub async fn send_balance_event(&self) {
        self.event_sink.typed_event(&Event::balance(
            self.federation_id().to_string(),
            self.get_balance().await,
        ));
    }

    /// Send whenever federation meta keys change
    pub async fn send_federation_event(&self) {
        let rpc_federation = federation_v2_to_rpc_federation(self).await;
        let event = Event::federation(RpcFederationMaybeLoading::Ready(rpc_federation));
        self.event_sink.typed_event(&event);
    }

    fn gateway_service(&self) -> anyhow::Result<&LnGatewayService> {
        self.gateway_service.get().context(ErrorCode::Recovery)
    }

    /// List all lightning gateways registered with the federation
    pub async fn list_gateways(&self) -> anyhow::Result<Vec<RpcLightningGateway>> {
        let gateways = self.client.ln()?.list_gateways().await;
        let active_gw = self
            .gateway_service()?
            .get_active_gateway(&self.client)
            .await;
        let bridge_gateways: Vec<RpcLightningGateway> = gateways
            .into_iter()
            .map(|gw| RpcLightningGateway {
                api: gw.info.api.to_string(),
                node_pub_key: RpcPublicKey(gw.info.node_pub_key),
                gateway_id: RpcPublicKey(gw.info.gateway_id),
                active: Some(gw.info.gateway_id) == active_gw,
            })
            .collect();
        Ok(bridge_gateways)
    }
    /// Switch active lightning gateway
    pub async fn switch_gateway(&self, gateway_id: &PublicKey) -> Result<()> {
        self.gateway_service()?
            .set_active_gateway(&self.client, gateway_id)
            .await
    }

    /// Receive ecash
    /// TODO: user a better type than String
    pub async fn receive_ecash(&self, ecash: String) -> Result<(Amount, OperationId)> {
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
            .reissue_external_notes(ecash, EcashReceiveMetadata { internal: false })
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
                let fedi_fee_status = self
                    .client
                    .db()
                    .begin_transaction_nc()
                    .await
                    .get_value(&OperationFediFeeStatusKey(operation_id))
                    .await
                    .map(Into::into);
                let tx_date_fiat_info = self
                    .dbtx()
                    .await
                    .get_value(&TransactionDateFiatInfoKey(operation_id))
                    .await;
                let transaction = RpcTransaction::new(
                    operation_id.fmt_full().to_string(),
                    unix_now().expect("unix time should exist"),
                    RpcAmount(meta.amount),
                    RpcTransactionDirection::Receive,
                    fedi_fee_status,
                    tx_date_fiat_info,
                )
                .with_oob_state(RpcOOBState::from_reissue_v2(update.clone()));
                self.send_transaction_event(transaction);
            }
            if let ReissueExternalNotesState::Failed(e) = update {
                updates.next().await;
                bail!(format!("Reissue failed: {e}"));
            }
        }
        Ok(())
    }

    /// Generate ecash
    pub async fn generate_ecash(
        &self,
        amount: Amount,
        include_invite: bool,
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
        let cancel_time = fedimint_core::time::now() + ECASH_AUTO_CANCEL_DURATION;
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
                    ECASH_AUTO_CANCEL_DURATION,
                    include_invite,
                    EcashSendMetadata { internal: false },
                )
                .await
            {
                assert_eq!(notes.total_amount(), amount);
                break (spend_guard, operation_id, notes);
            };

            let (_, notes) = mint
                .spend_notes_with_selector(
                    &SelectNotesWithAtleastAmount,
                    amount,
                    ECASH_AUTO_CANCEL_DURATION,
                    include_invite,
                    EcashSendMetadata { internal: true },
                )
                .await?;
            drop(spend_guard);

            // try to make change
            timeout(REISSUE_ECASH_TIMEOUT, async {
                let notes_amount = notes.total_amount();
                let operation_id = mint
                    .reissue_external_notes(notes, EcashReceiveMetadata { internal: true })
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

    pub async fn backup_status(&self) -> Result<BackupServiceStatus> {
        Ok(self.backup_service.status(&self.client).await)
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
    ) -> Result<Option<Vec<u8>>> {
        tracing::info!("downloading verification doc {}", recovery_id);
        // FIXME: maybe shouldn't download from only one peer?
        let verification_client = self.social_verification(peer_id).await?;
        let verification_doc = verification_client
            .download_verification_doc(*recovery_id)
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
        password: &str,
    ) -> Result<()> {
        tracing::info!("approve social recovery {} {}", peer_id, password);
        let verification_client = self.social_verification(peer_id).await?;
        verification_client
            .approve_recovery(*recovery_id, password)
            .await?;
        Ok(())
    }

    pub async fn get_ln_pay_outcome(
        &self,
        operation_id: OperationId,
        log_entry: OperationLogEntry,
    ) -> Option<LnPayState> {
        let outcome = log_entry.outcome::<PayState>();

        // Return client's cached outcome if we find it
        if let Some(PayState::Pay(outcome)) = outcome {
            return Some(outcome);
        } else if matches!(outcome, Some(PayState::Internal(_))) {
            return None;
        }

        // Return our cached outcome if we find it
        if let Some(outcome) = self.get_operation_state(&operation_id).await {
            return Some(outcome);
        }

        None
    }

    pub async fn get_deposit_outcome(&self, operation_id: OperationId) -> Option<DepositStateV2> {
        // Return our cached outcome if we find it
        if let Some(outcome) = self
            .get_operation_state::<DepositStateV2>(&operation_id)
            .await
        {
            return Some(outcome);
        }

        let Ok(wallet) = self.client.wallet() else {
            panic!("get deposit outcome called when wallet module is absent");
        };

        match wallet.subscribe_deposit(operation_id).await {
            Err(_) => None,
            Ok(UpdateStreamOrOutcome::Outcome(outcome)) => Some(outcome),
            // first item of this stream doesn't block: WaitingForTransaction
            Ok(UpdateStreamOrOutcome::UpdateStream(mut stream)) => stream.next().await,
        }
    }

    pub async fn get_client_operation_outcome<O: Clone + DeserializeOwned + 'static>(
        &self,
        operation_id: OperationId,
        log_entry: OperationLogEntry,
    ) -> Option<O> {
        let outcome = log_entry.outcome::<O>();

        // Return client's cached outcome if we find it
        if let Some(outcome) = outcome {
            return Some(outcome);
        }
        // Return our cached outcome if we find it
        if let Some(outcome) = self.get_operation_state::<O>(&operation_id).await {
            return Some(outcome);
        }

        None
    }

    /// Return all transactions via operation log
    pub async fn list_transactions(
        &self,
        limit: usize,
        start_after: Option<ChronologicalOperationLogKey>,
    ) -> Vec<RpcTransaction> {
        let futures = self
            .client
            .operation_log()
            .list_operations(limit, start_after)
            .await
            .into_iter()
            .map(
                |op: (ChronologicalOperationLogKey, OperationLogEntry)| async move {
                    let notes = self
                        .dbtx()
                        .await
                        .get_value(&TransactionNotesKey(op.0.operation_id))
                        .await
                        .unwrap_or_default();
                    let tx_date_fiat_info = self.dbtx().await.get_value(&TransactionDateFiatInfoKey(op.0.operation_id)).await;
                    let fedi_fee_status = self
                        .client
                        .db()
                        .begin_transaction_nc()
                        .await
                        .get_value(&OperationFediFeeStatusKey(op.0.operation_id))
                        .await
                        .map(Into::into);
                    let fedi_fee_msats = match fedi_fee_status {
                        Some(RpcOperationFediFeeStatus::PendingSend { fedi_fee } | RpcOperationFediFeeStatus::Success { fedi_fee }) => fedi_fee.0.msats,
                        _ => 0,
                    };
                    let outcome_time = op.1.outcome_time();

                    let mut transaction = match op.1.operation_module_kind() {
                        LIGHTNING_OPERATION_TYPE => {
                            let lightning_meta: LightningOperationMeta = op.1.meta();
                            match lightning_meta.variant {
                                LightningOperationMetaVariant::Pay(LightningOperationMetaPay{ invoice, fee, .. }) => {
                                    let extra_meta = serde_json::from_value::<LightningSendMetadata>(lightning_meta.extra_meta)
                                        .unwrap_or(LightningSendMetadata {
                                            is_fedi_fee_remittance: false,
                                        });
                                    // Exclude fee remittance transactions from TX list
                                    if extra_meta.is_fedi_fee_remittance {
                                        None
                                    } else {
                                        let mut transaction = RpcTransaction::new(
                                            op.0.operation_id.fmt_full().to_string(),
                                            to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                            RpcAmount(Amount {
                                                msats: invoice.amount_milli_satoshis().unwrap() + fedi_fee_msats + fee.msats,
                                            }),
                                            RpcTransactionDirection::Send,
                                            fedi_fee_status,
                                            tx_date_fiat_info
                                        )
                                        .with_notes(notes)
                                        .with_lightning(RpcLightningDetails {
                                            invoice: invoice.to_string(),
                                            fee: Some(RpcAmount(fee)),
                                        });

                                        if let Some(state) = self.get_ln_pay_outcome(op.0.operation_id, op.1).await {
                                            transaction = transaction.with_ln_state(RpcLnState::from_ln_pay_state(state));
                                        }
                                        Some(transaction)
                                    }
                                }
                                LightningOperationMetaVariant::Receive{ invoice, .. } => {
                                    let mut transaction = RpcTransaction::new(
                                        op.0.operation_id.fmt_full().to_string(),
                                        to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                        RpcAmount(Amount {
                                            msats: invoice.amount_milli_satoshis().unwrap(),
                                        }),
                                        RpcTransactionDirection::Receive,
                                        fedi_fee_status,
                                        tx_date_fiat_info
                                    )
                                    .with_notes(notes)
                                    .with_lightning(RpcLightningDetails {
                                        invoice: invoice.to_string(),
                                        fee: None,
                                    });

                                    if let Some(state) = op.1.outcome::<LnReceiveState>() {
                                        transaction = transaction.with_ln_state(RpcLnState::from_ln_recv_state(state));
                                    }
                                    Some(transaction)
                                }
                                LightningOperationMetaVariant::Claim { .. } => unreachable!("claims are not supported"),
                            }
                        },
                        STABILITY_POOL_OPERATION_TYPE => match op.1.meta() {
                            StabilityPoolMeta::Deposit { txid, amount, .. } => {
                                let mut transaction = RpcTransaction::new(
                                    op.0.operation_id.fmt_full().to_string(),
                                    to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                    RpcAmount(amount + Amount::from_msats(fedi_fee_msats)),
                                    RpcTransactionDirection::Send,
                                    fedi_fee_status,
                                    tx_date_fiat_info
                                )
                                .with_notes(notes);

                                if let Ok(ClientAccountInfo { account_info, .. }) = self.stability_pool_account_info(false).await {
                                    let state = if let Some(metadata) = account_info.seeks_metadata.get(&txid) {
                                        RpcStabilityPoolTransactionState::CompleteDeposit {
                                            initial_amount_cents: metadata.initial_amount_cents,
                                            fees_paid_so_far: RpcAmount(metadata.fees_paid_so_far)
                                        }
                                    } else {
                                        RpcStabilityPoolTransactionState::PendingDeposit
                                    };
                                    transaction = transaction.with_stability_pool_state(state);
                                }
                                Some(transaction)
                            },
                            StabilityPoolMeta::Withdrawal { estimated_withdrawal_cents, .. } | StabilityPoolMeta::CancelRenewal { estimated_withdrawal_cents, .. } => {
                                let outcome = self
                                    .get_client_operation_outcome(op.0.operation_id, op.1)
                                    .await;
                                let amount = match outcome {
                                    Some(StabilityPoolWithdrawalOperationState::WithdrawUnlockedInitiated(amount) |
                                        StabilityPoolWithdrawalOperationState::WithdrawUnlockedAccepted(amount) |
                                        StabilityPoolWithdrawalOperationState::Success(amount) |
                                        StabilityPoolWithdrawalOperationState::CancellationInitiated(Some(amount)) |
                                        StabilityPoolWithdrawalOperationState::CancellationAccepted(Some(amount)) |
                                        StabilityPoolWithdrawalOperationState::WithdrawIdleInitiated(amount) |
                                        StabilityPoolWithdrawalOperationState::WithdrawIdleAccepted(amount)) => RpcAmount(amount),
                                    _ => RpcAmount(Amount::ZERO),
                                };
                                let mut transaction = RpcTransaction::new(
                                    op.0.operation_id.fmt_full().to_string(),
                                    to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                    amount,
                                    RpcTransactionDirection::Receive,
                                    fedi_fee_status,
                                    tx_date_fiat_info
                                )
                                .with_notes(notes);

                                if let Some(outcome) = outcome {
                                    let state = match outcome {
                                        StabilityPoolWithdrawalOperationState::Success(_) => RpcStabilityPoolTransactionState::CompleteWithdrawal { estimated_withdrawal_cents },
                                        _ => RpcStabilityPoolTransactionState::PendingWithdrawal { estimated_withdrawal_cents },
                                    };
                                    transaction = transaction.with_stability_pool_state(state);
                                }
                                Some(transaction)
                            }
                        },
                        MINT_OPERATION_TYPE => {
                            let mint_meta: MintOperationMeta = op.1.meta();
                            match mint_meta.variant {
                                MintOperationMetaVariant::Reissuance { .. } => {
                                    let internal = serde_json::from_value::<EcashReceiveMetadata>(
                                        mint_meta.extra_meta,
                                    ).is_ok_and(|x| x.internal);
                                    if !internal {
                                        let mut transaction = RpcTransaction::new(
                                            op.0.operation_id.fmt_full().to_string(),
                                            to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                            RpcAmount(mint_meta.amount),
                                            RpcTransactionDirection::Receive,
                                            fedi_fee_status,
                                            tx_date_fiat_info
                                        )
                                        .with_notes(notes);

                                        if let Some(outcome) = self.get_client_operation_outcome(op.0.operation_id, op.1).await {
                                            let state = RpcOOBState::from_reissue_v2(outcome);
                                            transaction = transaction.with_oob_state(state);
                                        }
                                        Some(transaction)
                                    } else {
                                        None
                                    }
                                }
                                MintOperationMetaVariant::SpendOOB {
                                    requested_amount, ..
                                } => {
                                    let internal = serde_json::from_value::<EcashSendMetadata>(
                                        mint_meta.extra_meta,
                                    ).is_ok_and(|x| x.internal);

                                    if !internal {
                                        let mut transaction = RpcTransaction::new(
                                            op.0.operation_id.fmt_full().to_string(),
                                            to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                            RpcAmount(requested_amount + Amount::from_msats(fedi_fee_msats)),
                                            RpcTransactionDirection::Send,
                                            fedi_fee_status,
                                            tx_date_fiat_info
                                        )
                                        .with_notes(notes);

                                        if let Some(outcome) = self.get_client_operation_outcome(op.0.operation_id, op.1).await {
                                            let state = RpcOOBState::from_spend_v2(outcome);
                                            transaction = transaction.with_oob_state(state);
                                        }
                                        Some(transaction)
                                    } else {
                                        None
                                    }
                                },
                            }
                        }
                        WALLET_OPERATION_TYPE => {
                            let wallet_meta: WalletOperationMeta = op.1.meta();
                            match wallet_meta.variant {
                                WalletOperationMetaVariant::Deposit {
                                    address,
                                    ..
                                } => {
                                    let outcome = self.get_deposit_outcome(op.0.operation_id).await;
                                    let amount = match outcome {
                                        Some(
                                            DepositStateV2::WaitingForConfirmation { btc_deposited, ..}
                                            | DepositStateV2::Claimed { btc_deposited, ..},
                                        ) => {
                                            let wallet = self.client.wallet();
                                            let fees = wallet.map(|w| w.get_fee_consensus().peg_in_abs).unwrap_or(Amount::ZERO);
                                            RpcAmount(Amount::from_sats(btc_deposited.to_sat()) - fees)
                                        },
                                        _ => RpcAmount(Amount::ZERO),
                                    };
                                    let mut transaction = RpcTransaction::new(
                                        op.0.operation_id.fmt_full().to_string(),
                                        to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                        amount,
                                        RpcTransactionDirection::Receive,
                                        fedi_fee_status,
                                        tx_date_fiat_info
                                    )
                                    .with_notes(notes)
                                    .with_bitcoin(RpcBitcoinDetails {
                                        address: address.assume_checked().to_string(),
                                    });

                                    if let Some(outcome) = outcome {
                                        let state = RpcOnchainState::from_deposit_state(outcome.clone());
                                        transaction = transaction.with_onchain_state(state);
                                    }
                                    Some(transaction)
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
                                    let rpc_amount = RpcAmount(core_amount);

                                    // Todo: Figure out a where to pass back txid to client
                                    let (outcome, txid) = self
                                        .get_withdrawal_outcome(op.0.operation_id)
                                        .await
                                        .expect("Expected a withdrawal outcome but got None");

                                    let txid_str = match txid {
                                        Some(n) => n.to_string(),
                                        None => "".to_string(),
                                    };

                                    let transaction = RpcTransaction::new(
                                        op.0.operation_id.fmt_full().to_string(),
                                        to_unix_time(op.0.creation_time).expect("unix time should exist"),
                                        rpc_amount,
                                        RpcTransactionDirection::Send,
                                        fedi_fee_status,
                                        tx_date_fiat_info
                                    )
                                    .with_notes(notes)
                                    .with_onchain_state(RpcOnchainState::from_withdraw_state(outcome))
                                    .with_onchain_withdrawal_details(WithdrawalDetails {
                                        address: address.assume_checked().to_string(),
                                        txid: txid_str,
                                        fee: RpcAmount(Amount::from_sats(fee.amount().to_sat())),
                                        fee_rate: fee.fee_rate.sats_per_kvb,
                                    });
                                    Some(transaction)
                                }
                                WalletOperationMetaVariant::RbfWithdraw { rbf: _, change: _ } => None,
                            }
                        },
                        _ => {
                            panic!(
                                "Found unimplemented for module with operation type = {}",
                                op.1.operation_module_kind()
                            );
                        }
                    };
                    if let Some(transaction) = &mut transaction {
                        if let Some(outcome_time) = outcome_time {
                            if let Ok(unix_time) = to_unix_time(outcome_time) {
                                transaction.outcome_time = Some(unix_time);
                            }
                        }
                    }
                    transaction
                },
            );
        futures::future::join_all(futures)
            .await
            .into_iter()
            .flatten()
            .collect()
    }

    pub async fn update_transaction_notes(
        &self,
        transaction: OperationId,
        notes: String,
    ) -> Result<()> {
        let mut dbtx = self.dbtx().await;
        dbtx.insert_entry(&TransactionNotesKey(transaction), &notes)
            .await;
        dbtx.commit_tx_result().await
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

    async fn get_operation_state<T>(&self, operation_id: &OperationId) -> Option<T>
    where
        T: Clone + 'static,
    {
        Some(
            self.operation_states
                .lock()
                .await
                .get(operation_id)?
                .downcast_ref::<T>()
                .expect("incorrect type to get_operation_state")
                .clone(),
        )
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
                    StabilityPoolDepositOperationState::TxRejected(_)
                    | StabilityPoolDepositOperationState::PrimaryOutputError(_) => {
                        let _ = self.write_failed_send_fedi_fee(operation_id).await;
                    }
                    StabilityPoolDepositOperationState::Success => {
                        let _ = self.write_success_send_fedi_fee(operation_id).await;
                    }
                    _ => (),
                }
                self.event_sink.typed_event(&Event::stability_pool_deposit(
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
                    StabilityPoolWithdrawalOperationState::Success(amount) => {
                        let _ = self
                            .write_success_receive_fedi_fee(operation_id, amount)
                            .await;
                        let _ = self.record_tx_date_fiat_info(operation_id, amount).await;
                    }
                    StabilityPoolWithdrawalOperationState::InvalidOperationType
                    | StabilityPoolWithdrawalOperationState::TxRejected(_)
                    | StabilityPoolWithdrawalOperationState::PrimaryOutputError(_)
                    | StabilityPoolWithdrawalOperationState::CancellationSubmissionFailure(_)
                    | StabilityPoolWithdrawalOperationState::AwaitCycleTurnoverError(_)
                    | StabilityPoolWithdrawalOperationState::WithdrawIdleSubmissionFailure(_) => {
                        let _ = self.write_failed_receive_fedi_fee(operation_id).await;
                    }
                    _ => (),
                }
                self.event_sink
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
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => last_error,
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

                                    // Increment outstanding/success counter
                                    let outstanding_key = OutstandingFediFeesPerTXTypeKey(
                                        module,
                                        RpcTransactionDirection::Send,
                                    );
                                    let outstanding_fedi_fees = fedi_fee
                                        + dbtx
                                            .get_value(&outstanding_key)
                                            .await
                                            .unwrap_or(Amount::ZERO);
                                    dbtx.insert_entry(&outstanding_key, &outstanding_fedi_fees)
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
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => last_error,
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
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => last_error,
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
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => last_error,
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
                                        module,
                                        RpcTransactionDirection::Receive,
                                    );
                                    let outstanding_fedi_fees = fedi_fee
                                        + dbtx
                                            .get_value(&outstanding_key)
                                            .await
                                            .unwrap_or(Amount::ZERO);
                                    let new_status = OperationFediFeeStatus::Success { fedi_fee };
                                    dbtx.insert_entry(&op_key, &new_status).await;
                                    dbtx.insert_entry(&outstanding_key, &outstanding_fedi_fees)
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
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => last_error,
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
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => last_error,
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

        let Some(cached_fiat_fx_info) = self.app_state.get_cached_fiat_fx_info().await else {
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
        virtual_balance - on_chain_fee.map_or(Amount::ZERO, |f| f.amount().into());

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
    let numerator_msats = (virtual_balance.msats - gateway_base) * MILLION;
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

pub async fn download_from_invite_code(invite_code: &InviteCode) -> anyhow::Result<ClientConfig> {
    let connector = Connector::Tcp;
    connector.download_from_invite_code(invite_code).await
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
