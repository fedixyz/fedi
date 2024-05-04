pub mod db;
mod dev;

use std::any::Any;
use std::collections::HashMap;
use std::pin::pin;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use ::serde::{Deserialize, Serialize};
use anyhow::{anyhow, bail, Context, Result};
use bitcoin::secp256k1::{self, PublicKey, Secp256k1};
use bitcoin::{Address, Network};
use db::{FediRawClientConfigKey, InviteCodeKey, TransactionNotesKey, XmppUsernameKey};
use fedi_social_client::common::VerificationDocument;
use fedi_social_client::{FediSocialClientInit, RecoveryId};
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::backup::Metadata;
use fedimint_client::db::ChronologicalOperationLogKey;
use fedimint_client::module::recovery::RecoveryProgress;
use fedimint_client::module::ClientModule;
use fedimint_client::oplog::OperationLogEntry;
use fedimint_client::secret::{
    get_default_client_secret, DeriveableSecretClientExt, RootSecretStrategy,
};
use fedimint_client::{Client, ClientBuilder, ClientHandle, ClientHandleArc};
use fedimint_core::api::{
    DynGlobalApi, DynModuleApi, FederationApiExt, FederationResult, InviteCode, StatusResponse,
    WsFederationApi,
};
use fedimint_core::backup::ClientBackupSnapshot;
use fedimint_core::config::{ClientConfig, FederationId};
use fedimint_core::core::OperationId;
use fedimint_core::db::{
    Committable, Database, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped,
};
use fedimint_core::module::ApiRequestErased;
use fedimint_core::task::{timeout, MaybeSend, MaybeSync, TaskGroup};
use fedimint_core::{maybe_add_send_sync, Amount, PeerId};
use fedimint_derive_secret::{ChildId, DerivableSecret};
use fedimint_ln_client::{
    InternalPayState, LightningClientInit, LightningClientModule, LightningOperationMeta,
    LightningOperationMetaPay, LightningOperationMetaVariant, LnPayState, LnReceiveState,
    OutgoingLightningPayment, PayType,
};
use fedimint_ln_common::LightningGateway;
use fedimint_mint_client::{
    spendable_notes_to_operation_id, MintClientInit, MintClientModule, MintOperationMeta,
    MintOperationMetaVariant, OOBNotes, ReissueExternalNotesState,
};
use fedimint_wallet_client::{
    DepositState, PegOutFees, WalletClientInit, WalletClientModule, WalletOperationMeta,
    WalletOperationMetaVariant, WithdrawState,
};
use futures::{FutureExt, StreamExt};
use lightning_invoice::{Bolt11Invoice, RoutingFees};
use serde::de::DeserializeOwned;
use stability_pool_client::{
    ClientAccountInfo, StabilityPoolClientInit, StabilityPoolClientModule,
    StabilityPoolDepositOperationState, StabilityPoolMeta, StabilityPoolWithdrawalOperationState,
};
use tokio::sync::{Mutex, OnceCell};
use tracing::{error, info, warn};

use self::backup_service::BackupService;
pub use self::backup_service::BackupServiceStatus;
use self::db::{OperationFediFeeStatusKey, OutstandingFediFeesKey};
use self::dev::{
    override_localhost, override_localhost_client_config, override_localhost_invite_code,
};
use self::ln_gateway_service::LnGatewayService;
use super::constants::{
    LIGHTNING_OPERATION_TYPE, MILLION, MINT_OPERATION_TYPE, ONE_WEEK, PAY_INVOICE_TIMEOUT,
    REISSUE_ECASH_TIMEOUT, STABILITY_POOL_OPERATION_TYPE, WALLET_OPERATION_TYPE, XMPP_CHILD_ID,
    XMPP_KEYPAIR_SEED, XMPP_PASSWORD,
};
use super::event::{Event, EventSink, TypedEventExt};
use super::social::{
    RecoveryFile, SocialBackup, SocialRecoveryClient, SocialRecoveryState, SocialVerification,
    UserSeedPhrase,
};
use super::types::{
    federation_v2_to_rpc_federation, FediBackupMetadata, RpcAmount, RpcInvoice,
    RpcLightningGateway, RpcPayInvoiceResponse, RpcPublicKey, RpcXmppCredentials,
};
use crate::error::ErrorCode;
use crate::event::RecoveryProgressEvent;
use crate::fedi_fee::{FediFeeHelper, FediFeeRemittanceService};
use crate::social::SOCIAL_RECOVERY_SECRET_CHILD_ID;
use crate::storage::FediFeeSchedule;
use crate::types::{
    EcashReceiveMetadata, GuardianStatus, LightningSendMetadata, OperationFediFeeStatus,
    RpcBitcoinDetails, RpcEcashInfo, RpcFederationId, RpcFeeDetails, RpcGenerateEcashResponse,
    RpcLightningDetails, RpcLnState, RpcOOBState, RpcOnchainState, RpcPayAddressResponse,
    RpcStabilityPoolTransactionState, RpcTransaction, RpcTransactionDirection, WithdrawalDetails,
};
use crate::utils::{display_currency, to_unix_time, unix_now};

mod backup_service;
mod ln_gateway_service;

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
    )
}

/// Federation is a wrapper of "client ng" to assist with handling RPC commands
#[derive(Clone)]
pub struct FederationV2 {
    pub client: ClientHandleArc,
    pub event_sink: EventSink,
    pub task_group: TaskGroup,
    pub operation_states:
        Arc<Mutex<HashMap<OperationId, Box<maybe_add_send_sync!(dyn Any + 'static)>>>>,
    // DerivableSecret used for non-client usecases like LNURL and Nostr etc
    pub auxiliary_secret: DerivableSecret,
    // Helper object to retrieve the schedule used for charging Fedi's fee for different types of
    // transactions.
    pub fedi_fee_helper: Arc<FediFeeHelper>,
    pub backup_service: OnceCell<BackupService>,
    pub fedi_fee_remittance_service: OnceCell<FediFeeRemittanceService>,
    pub recovering: bool,
    pub gateway_service: OnceCell<LnGatewayService>,
}

impl FederationV2 {
    /// Instantiate Federation from FediConfig
    async fn build_client_builder(db: Database) -> anyhow::Result<ClientBuilder> {
        let mut client_builder = fedimint_client::Client::builder(db);
        client_builder.with_module(MintClientInit);
        client_builder.with_module(LightningClientInit);
        client_builder.with_module(WalletClientInit(None));
        client_builder.with_module(FediSocialClientInit);
        client_builder.with_module(StabilityPoolClientInit);
        client_builder.with_primary_module(1);
        Ok(client_builder)
    }

    pub async fn new(
        ng: ClientHandle,
        event_sink: EventSink,
        task_group: TaskGroup,
        secret: DerivableSecret,
        fedi_fee_helper: Arc<FediFeeHelper>,
    ) -> Self {
        let recovering = ng.has_pending_recoveries().await;
        let client = Arc::new(ng);
        let mut federation = Self {
            event_sink,
            task_group: task_group.clone(),
            operation_states: Default::default(),
            auxiliary_secret: secret,
            fedi_fee_helper,
            backup_service: OnceCell::new(),
            fedi_fee_remittance_service: OnceCell::new(),
            recovering,
            gateway_service: OnceCell::new(),
            client,
        };
        if !recovering {
            federation.start_background_tasks().await;
        }
        federation
    }

    /// Starts a bunch of async tasks and ensures username is
    /// saved to db (e.g. after recovery)
    async fn start_background_tasks(&mut self) {
        self.subscribe_balance_updates().await;
        if self
            .backup_service
            .set(BackupService::new(self.client.clone(), &mut self.task_group).await)
            .is_err()
        {
            panic!("backup service already initialized");
        }
        self.subscribe_to_all_operations().await;

        if self
            .fedi_fee_remittance_service
            .set(FediFeeRemittanceService::default())
            .is_err()
        {
            error!("fedi fee remittance service already initialized");
        }
        if self
            .gateway_service
            .set(LnGatewayService::new(Arc::downgrade(&self.client), &self.task_group).await)
            .is_err()
        {
            error!("ln gateway service already initialized");
        }
    }

    pub fn client_root_secret_from_root_mnemonic(
        root_mnemonic: &bip39::Mnemonic,
        federation_id: &FederationId,
    ) -> DerivableSecret {
        let global_root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(root_mnemonic);
        get_default_client_secret(&global_root_secret, federation_id)
    }

    pub fn auxiliary_secret_from_root_mnemonic(
        root_mnemonic: &bip39::Mnemonic,
        federation_id: &FederationId,
    ) -> DerivableSecret {
        let global_root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(root_mnemonic);
        get_default_auxiliary_secret(&global_root_secret, federation_id)
    }

    /// Instantiate Federation from FediConfig
    pub async fn from_db(
        db: Database,
        event_sink: EventSink,
        task_group: TaskGroup,
        root_mnemonic: &bip39::Mnemonic,
        fedi_fee_helper: Arc<FediFeeHelper>,
    ) -> anyhow::Result<Self> {
        let client_builder = Self::build_client_builder(db.clone()).await?;
        let config = Client::get_config_from_db(&db)
            .await
            .context("config not found in database")?;
        let federation_id = config.calculate_federation_id();
        let client = client_builder
            .open(Self::client_root_secret_from_root_mnemonic(
                root_mnemonic,
                &federation_id,
            ))
            .await?;
        let auxiliary_secret =
            Self::auxiliary_secret_from_root_mnemonic(root_mnemonic, &federation_id);
        Ok(Self::new(
            client,
            event_sink,
            task_group.make_subgroup().await,
            auxiliary_secret,
            fedi_fee_helper,
        )
        .await)
    }

    pub async fn download_client_config(
        invite_code_string: &str,
        root_mnemonic: &bip39::Mnemonic,
    ) -> anyhow::Result<(ClientConfig, FederationResult<Vec<ClientBackupSnapshot>>)> {
        let mut invite_code: InviteCode = InviteCode::from_str(invite_code_string)?;
        override_localhost_invite_code(&mut invite_code);
        let api = DynGlobalApi::from_invite_code(&[invite_code.clone()]);
        let backup_id_pub_key = {
            let federation_id = invite_code.federation_id();
            // We do an additional derivation using `DerivableSecret::federation_key` since
            // that is what fedimint-client does internally
            let client_root_secret =
                Self::client_root_secret_from_root_mnemonic(root_mnemonic, &federation_id)
                    .federation_key(&federation_id);
            client_root_secret
                .derive_backup_secret()
                .to_secp_key(&Secp256k1::<secp256k1::SignOnly>::gen_new())
                .public_key()
        };

        let (client_config, backup) = tokio::join!(
            ClientConfig::download_from_invite_code(&invite_code),
            api.download_backup(&backup_id_pub_key)
        );

        Ok((client_config?, backup))
    }

    /// Download federation configs using an invite code. Save client config to
    /// correct database with Storage.
    pub async fn join(
        invite_code_string: String,
        event_sink: EventSink,
        task_group: TaskGroup,
        db: Database,
        root_mnemonic: &bip39::Mnemonic,
        fedi_fee_helper: Arc<FediFeeHelper>,
    ) -> Result<Self> {
        let mut invite_code =
            InviteCode::from_str(&invite_code_string).context("invalid invite code")?;
        override_localhost_invite_code(&mut invite_code);
        let mut client_config: ClientConfig =
            ClientConfig::download_from_invite_code(&invite_code).await?;
        override_localhost_client_config(&mut client_config);

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
        let client_secret =
            Self::client_root_secret_from_root_mnemonic(root_mnemonic, &federation_id);
        let auxiliary_secret =
            Self::auxiliary_secret_from_root_mnemonic(root_mnemonic, &federation_id);
        // restore from scratch is not used because it takes too much time.
        if let Some(backup) = client_builder
            .download_backup_from_federation(&client_secret, &client_config)
            .await?
        {
            // TODO: ensure that if user exists app and re-opens during the restoration,
            // they will still see a spinner
            info!("backup found {:?}", backup);
            let client = client_builder
                .recover(client_secret, client_config, Some(backup))
                .await?;
            let metadata = client.get_metadata().await;
            let this = Self::new(
                client,
                event_sink,
                task_group.make_subgroup().await,
                auxiliary_secret,
                fedi_fee_helper,
            )
            .await;
            this.save_restored_metadata(metadata).await?;
            Ok(this)
        } else {
            info!("backup not found");
            let client = client_builder.join(client_secret, client_config).await?;
            Ok(Self::new(
                client,
                event_sink,
                task_group.make_subgroup().await,
                auxiliary_secret,
                fedi_fee_helper,
            )
            .await)
        }
    }

    /// Get federation ID
    pub fn federation_id(&self) -> FederationId {
        self.client.federation_id()
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
            Some(
                self.client
                    .get_first_module::<WalletClientModule>()
                    .get_network(),
            )
        }
    }

    /// Return federation name from meta, or take first 8 characters of
    /// federation ID
    pub fn federation_name(&self) -> String {
        self.client
            .get_meta("federation_name")
            .unwrap_or(self.federation_id().to_string()[0..8].to_string())
    }

    /// Create database transaction
    pub async fn dbtx(&self) -> DatabaseTransaction<'_, Committable> {
        self.client.db().begin_transaction().await
    }

    pub async fn select_gateway(&self) -> anyhow::Result<Option<LightningGateway>> {
        let gateway = self.gateway_service()?.select_gateway(&self.client).await?;
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
        let mint_client = self.client.get_first_module::<MintClientModule>();
        let mut dbtx = mint_client.db.begin_transaction_nc().await;
        mint_client
            .get_wallet_summary(&mut dbtx)
            .await
            .total_amount()
            - self.get_outstanding_fedi_fees().await
    }

    pub async fn guardian_status(&self) -> anyhow::Result<Vec<GuardianStatus>> {
        let peer_clients: Vec<_> = self
            .client
            .get_config()
            .global
            .api_endpoints
            .iter() // use iter() instead of into_iter()
            .map(|(&peer_id, endpoint)| {
                (
                    peer_id,
                    WsFederationApi::new(vec![(peer_id, endpoint.url.clone())]),
                )
            })
            .collect();

        let futures = peer_clients
            .into_iter()
            .map(|(guardian, client)| async move {
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
            .get_value(&OutstandingFediFeesKey)
            .await
            .unwrap_or(Amount::ZERO)
    }

    /// Generate bitcoin address
    pub async fn generate_address(&self) -> Result<String> {
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_wallet_client::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let expires_at = fedimint_core::time::now() + Duration::from_secs(86400 * 365);
        let (operation_id, address) = self
            .client
            .get_first_module::<WalletClientModule>()
            .get_deposit_address(expires_at, ())
            .await?;
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;

        self.subscribe_deposit(operation_id, address.to_string(), expires_at)
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
            .get_first_module::<LightningClientModule>()
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

    async fn subscribe_deposit(
        &self,
        operation_id: OperationId,
        address: String,
        expires_at: SystemTime,
    ) -> Result<()> {
        let fed = self.clone();
        fed.task_group
            .clone()
            .spawn("subscribe deposit", move |_| async move {
                let mut updates = fed
                    .client
                    .get_first_module::<WalletClientModule>()
                    .subscribe_deposit_updates(operation_id)
                    .await
                    .unwrap() // FIXME
                    .into_stream();
                while let Some(update) = updates.next().await {
                    info!("Update: {:?}", update);
                    fed.update_operation_state(operation_id, update.clone())
                        .await;
                    let deposit_outcome = update.clone();
                    match update {
                        DepositState::WaitingForConfirmation(data)
                        | DepositState::Claimed(data)
                        | DepositState::Confirmed(data) => {
                            let amount = Amount::from_sats(
                                data.btc_transaction.output[data.out_idx as usize].value,
                            );
                            let fedi_fee_status = fed
                                .write_success_receive_fedi_fee(operation_id, amount)
                                .await
                                .map(|(_, status)| status)
                                .ok()
                                .map(Into::into);
                            let onchain_details = Some(RpcBitcoinDetails {
                                address: address.clone(),
                                expires_at: to_unix_time(expires_at)
                                    .expect("unix time should exist"),
                            });
                            let transaction = RpcTransaction {
                                id: operation_id.to_string(),
                                created_at: unix_now().expect("unix time should exist"),
                                amount: RpcAmount(amount),
                                fedi_fee_status,
                                direction: RpcTransactionDirection::Receive,
                                notes: "".into(),
                                onchain_state: RpcOnchainState::from_deposit_state(Some(
                                    deposit_outcome,
                                )),
                                bitcoin: onchain_details,
                                ln_state: None,
                                lightning: None,
                                oob_state: None,
                                onchain_withdrawal_details: None,
                                stability_pool_state: None,
                            };
                            info!("send_transaction_event: {:?}", transaction);
                            fed.send_transaction_event(transaction);
                        }
                        DepositState::Failed(reason) => {
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

    /// Subscribe to state updates for a given lightning invoice
    pub async fn subscribe_invoice(
        &self,
        operation_id: OperationId,
        invoice: Bolt11Invoice, // TODO: fetch the invoice from the db
    ) -> Result<()> {
        let fed = self.clone();
        self.task_group
            .clone()
            .spawn("subscribe invoice", move |_| async move {
                let mut updates = fed
                    .client
                    .get_first_module::<LightningClientModule>()
                    .subscribe_ln_receive(operation_id)
                    .await
                    .unwrap() // FIXME
                    .into_stream();
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
                            let transaction = RpcTransaction {
                                id: operation_id.to_string(),
                                created_at: unix_now().expect("unix time should exist"),
                                amount: RpcAmount(amount),
                                fedi_fee_status,
                                direction: RpcTransactionDirection::Receive,
                                notes: "".into(),
                                bitcoin: None,
                                onchain_state: None,
                                ln_state: RpcLnState::from_ln_recv_state(Some(update)),
                                lightning: Some(RpcLightningDetails {
                                    invoice: invoice.to_string(),
                                    fee: None, // TODO: to be implemented on the fedimint side
                                }),
                                oob_state: None,
                                onchain_withdrawal_details: None,
                                stability_pool_state: None,
                            };
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
        let invoice: RpcInvoice = invoice.try_into()?;
        let amount = invoice.amount.0;

        // Calculate the different fee components
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = (amount.msats * fedi_fee_ppm).div_ceil(MILLION);

        let gateway = self
            .select_gateway()
            .await?
            .context("No gateway available")?;
        let gateway_fees = gateway.fees;
        let network_fee = gateway_fees.base_msat as u64
            + (amount.msats * gateway_fees.proportional_millionths as u64).div_ceil(MILLION);
        let fee = Some(RpcFeeDetails {
            fedi_fee: RpcAmount(Amount::from_msats(fedi_fee)),
            network_fee: RpcAmount(Amount::from_msats(network_fee)),
            federation_fee: RpcAmount(Amount::ZERO),
        });

        Ok(RpcInvoice { fee, ..invoice })
    }

    /// Pay lightning invoice
    pub async fn pay_invoice(&self, invoice: &Bolt11Invoice) -> Result<RpcPayInvoiceResponse> {
        // Has an amount
        let amount_msat = invoice
            .amount_milli_satoshis()
            .ok_or(anyhow!("Invoice missing amount"))?;
        let amount = Amount::from_msats(amount_msat);

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
        let virtual_balance = self.get_balance().await;
        if amount.msats + fedi_fee + network_fee > virtual_balance.msats {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, None, Some(gateway_fees))
            )));
        }

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

        let _federation_id = self.federation_id();
        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: false,
        };
        let ln = self.client.get_first_module::<LightningClientModule>();
        let OutgoingLightningPayment { payment_type, .. } = ln
            .pay_bolt11_invoice(gateway, invoice.to_owned(), extra_meta.clone())
            .await?;
        self.write_pending_send_fedi_fee(payment_type.operation_id(), Amount::from_msats(fedi_fee))
            .await?;

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
        address: Address,
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
            .get_first_module::<WalletClientModule>()
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
        address: Address,
        amount: bitcoin::Amount,
    ) -> Result<RpcPayAddressResponse> {
        let fee_details = self.preview_pay_address(address.clone(), amount).await?;
        let network_fees = self
            .client
            .get_first_module::<WalletClientModule>()
            .get_withdraw_fees(address.clone(), amount)
            .await?;

        let operation_id = self
            .client
            .get_first_module::<WalletClientModule>()
            .withdraw(address, amount, network_fees, ())
            .await?;
        self.write_pending_send_fedi_fee(operation_id, fee_details.fedi_fee.0)
            .await?;
        let mut updates = self
            .client
            .get_first_module::<WalletClientModule>()
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
        let mut updates = match self
            .client
            .get_first_module::<WalletClientModule>()
            .subscribe_withdraw_updates(operation_id)
            .await
        {
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
                    let fed = self.clone();
                    let extra_meta = serde_json::from_value::<LightningSendMetadata>(extra_meta)
                        .unwrap_or(LightningSendMetadata {
                            is_fedi_fee_remittance: false,
                        });
                    self.task_group
                        .clone()
                        .spawn("subscribe_to_ln_pay", move |_| async move {
                            // FIXME: what happens if it fails?
                            if let Err(e) = fed
                                .subscribe_to_ln_pay(
                                    PayType::Lightning(operation_id),
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
                    let fed = self.clone();
                    self.task_group
                        .clone()
                        .spawn("subscribe_to_ln_receive", move |_| async move {
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
                        let fed = self.clone();
                        self.task_group
                            .clone()
                            .spawn("subscribe_oob_spend", move |_| async move {
                                // FIXME: what happens if it fails?
                                fed.subscribe_oob_spend(operation_id).await
                            });
                    }
                    MintOperationMetaVariant::Reissuance { .. } => {
                        let fed = self.clone();
                        self.task_group.clone().spawn(
                            "subscribe_to_ecash_reissue",
                            move |_| async move {
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
                        variant:
                            WalletOperationMetaVariant::Deposit {
                                address,
                                expires_at,
                            },
                        ..
                    } => {
                        self.subscribe_deposit(operation_id, address.to_string(), expires_at)
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
            STABILITY_POOL_OPERATION_TYPE => {
                let fed = self.clone();
                match operation.meta::<StabilityPoolMeta>() {
                    StabilityPoolMeta::Deposit { .. } => {
                        self.task_group.clone().spawn(
                            "subscribe_stability_pool_deposit",
                            move |_| async move {
                                fed.subscribe_stability_pool_deposit_to_seek(operation_id)
                                    .await
                            },
                        );
                    }
                    StabilityPoolMeta::CancelRenewal { .. }
                    | StabilityPoolMeta::Withdrawal { .. } => {
                        self.task_group.clone().spawn(
                            "subscribe_stability_pool_withdraw",
                            move |_| async move {
                                fed.subscribe_stability_pool_withdraw(operation_id).await
                            },
                        );
                    }
                }
            }
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
        match pay_type {
            PayType::Internal(operation_id) => {
                let mut updates = self
                    .client
                    .get_first_module::<LightningClientModule>()
                    .subscribe_internal_pay(operation_id)
                    .await?
                    .into_stream();

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
                let mut updates = self
                    .client
                    .get_first_module::<LightningClientModule>()
                    .subscribe_ln_pay(operation_id)
                    .await?
                    .into_stream();
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
    async fn subscribe_balance_updates(&mut self) {
        let federation = self.clone();
        self.task_group.spawn(
            format!("{:?} balance subscription", federation.federation_name()),
            |_| async move {
                // always send an initial balance event
                federation.send_balance_event().await;
                let mut updates = federation.client.subscribe_balance_changes().await;
                while (updates.next().await).is_some() {
                    federation.send_balance_event().await;
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
        let mint_instance_id = self
            .client
            .get_config()
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

    /// Send whenever social recovery state changes
    pub async fn send_federation_event(&self) {
        let rpc_federation = federation_v2_to_rpc_federation(&Arc::new(self.clone())).await;
        let event = Event::federation(rpc_federation);
        self.event_sink.typed_event(&event);
    }

    fn gateway_service(&self) -> anyhow::Result<&LnGatewayService> {
        self.gateway_service.get().context(ErrorCode::Recovery)
    }

    /// List all lightning gateways registered with the federation
    pub async fn list_gateways(&self) -> anyhow::Result<Vec<RpcLightningGateway>> {
        self.gateway_service()?.update(&self.client).await?;
        let gateways = self
            .client
            .get_first_module::<LightningClientModule>()
            .list_gateways()
            .await;
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

    pub async fn receive_ecash_with_meta(
        &self,
        ecash: OOBNotes,
        meta: EcashReceiveMetadata,
        fedi_fee_ppm: u64,
    ) -> Result<Amount> {
        let amount = ecash.total_amount();
        // TODO: include metadata as 2nd argument
        let operation_id = self
            .client
            .get_first_module::<MintClientModule>()
            .reissue_external_notes(ecash, meta)
            .await?;
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;
        self.subscribe_to_operation(operation_id).await?;
        Ok(amount)
    }

    /// Receive ecash
    /// TODO: user a better type than String
    pub async fn receive_ecash(&self, ecash: String) -> Result<Amount> {
        let ecash = OOBNotes::from_str(&ecash)?;
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let amt = self
            .receive_ecash_with_meta(
                ecash,
                EcashReceiveMetadata { internal: false },
                fedi_fee_ppm,
            )
            .await?;
        Ok(amt)
    }

    pub fn validate_ecash(ecash: String) -> Result<RpcEcashInfo> {
        let oob = OOBNotes::from_str(&ecash)?;
        Ok(RpcEcashInfo {
            amount: RpcAmount(oob.total_amount()),
            // FIXME: change this type? Make `federation_id` optional? Add optional
            // `federation_id_prefix`? Or enum
            federation_id: None,
        })
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
                .map_or(false, |x| x.internal);
        let mut updates = self
            .client
            .get_first_module::<MintClientModule>()
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
                self.send_transaction_event(RpcTransaction {
                    id: operation_id.to_string(),
                    created_at: unix_now().expect("unix time should exist"),
                    direction: RpcTransactionDirection::Receive,
                    notes: "".into(),
                    onchain_state: None,
                    bitcoin: None,
                    ln_state: None,
                    amount: RpcAmount(meta.amount),
                    lightning: None,
                    oob_state: Some(RpcOOBState::from_reissue_v2(update.clone())),
                    onchain_withdrawal_details: None,
                    stability_pool_state: None,
                    fedi_fee_status,
                });
            }
            if let ReissueExternalNotesState::Failed(e) = update {
                updates.next().await;
                bail!(format!("Reissue failed: {e}"));
            }
        }
        Ok(())
    }

    /// Generate ecash
    pub async fn generate_ecash(&self, amount: Amount) -> Result<RpcGenerateEcashResponse> {
        let fedi_fee_ppm = self
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                self.federation_id().to_string(),
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = Amount::from_msats((amount.msats * fedi_fee_ppm).div_ceil(MILLION));
        let virtual_balance = self.get_balance().await;
        if amount + fedi_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, None, None)
            )));
        }

        let cancel_time = fedimint_core::time::now() + ONE_WEEK;
        let (operation_id, notes) = self
            .client
            .get_first_module::<MintClientModule>()
            .spend_notes(amount, ONE_WEEK, false, ())
            .await?;
        self.write_pending_send_fedi_fee(operation_id, fedi_fee)
            .await?;
        self.subscribe_to_operation(operation_id).await?;
        let notes = if amount != notes.total_amount() {
            // try to make change (exempt this from fedi app fee)
            timeout(REISSUE_ECASH_TIMEOUT, async {
                let notes_amount = notes.total_amount();
                let operation_id = self
                    .client
                    .get_first_module::<MintClientModule>()
                    .reissue_external_notes(notes, EcashReceiveMetadata { internal: true })
                    .await?;
                self.subscribe_to_ecash_reissue(operation_id, notes_amount)
                    .await
            })
            .await
            .context("Failed to select notes with correct amount")??;
            let (operation_id, new_notes) = self
                .client
                .get_first_module::<MintClientModule>()
                .spend_notes(amount, ONE_WEEK, false, ())
                .await?;
            self.subscribe_to_operation(operation_id).await?;
            new_notes
        } else {
            notes
        };
        Ok(RpcGenerateEcashResponse {
            ecash: notes.to_string(),
            cancel_at: to_unix_time(cancel_time)?,
        })
    }

    pub async fn cancel_ecash(&self, ecash: OOBNotes) -> Result<()> {
        let op_id = spendable_notes_to_operation_id(ecash.notes());
        // NOTE: try_cancel_spend_notes itself is not presisted across restarts.
        // it uses inmemory channel.
        self.client
            .get_first_module::<MintClientModule>()
            .try_cancel_spend_notes(op_id)
            .await;
        self.subscribe_oob_spend(op_id).await?;
        Ok(())
    }

    async fn subscribe_oob_spend(&self, op_id: OperationId) -> Result<(), anyhow::Error> {
        let mut updates = self
            .client
            .get_first_module::<MintClientModule>()
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
        self.backup_service
            .get()
            .context("backup not intialized")?
            .trigger_manual_backup()
            .await;
        Ok(())
    }

    pub async fn backup_status(&self) -> Result<BackupServiceStatus> {
        Ok(self
            .backup_service
            .get()
            .context("backup not intialized")?
            .status()
            .await)
    }

    /// Extract username (and potentially more in future) from recovered
    /// metadata and save it to database
    pub async fn save_restored_metadata(&self, metadata: Metadata) -> Result<()> {
        if let Ok(fedi_backup_metadata) = metadata.to_json_deserialized::<FediBackupMetadata>() {
            if let Some(username) = fedi_backup_metadata.username {
                self.save_xmpp_username(&username).await?;
            }
        } else {
            warn!("failed to parse metadata");
        };
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

    fn social_api(&self) -> DynModuleApi {
        let social_module = self
            .client
            .get_first_module::<fedi_social_client::FediSocialClientModule>();
        social_module.api
    }

    pub async fn decoded_config(&self) -> Result<ClientConfig> {
        let client_config = self.client.get_config().clone();
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
            .expect("needs social recovery module client config");
        Ok(SocialBackup {
            module_secret: Self::social_recovery_secret_static(&self.root_secret()),
            module_id,
            config: cfg.clone(),
            api: self.social_api(),
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
            .expect("needs social recovery module client config");
        SocialRecoveryClient::new_start(module_id, cfg.clone(), self.social_api(), recovery_file)
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
            .expect("needs social recovery module client config");
        Ok(SocialRecoveryClient::new_continue(
            module_id,
            cfg.clone(),
            self.social_api(),
            prev_state,
        ))
    }

    /// Get social verification client for a guardian
    pub async fn social_verification(&self, peer_id: PeerId) -> Result<SocialVerification> {
        Ok(SocialVerification::new(self.social_api(), peer_id))
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
                .word_iter()
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
    ) -> Result<Option<Vec<u8>>> {
        tracing::info!("downloading verification doc {}", recovery_id);
        // FIXME: maybe shouldn't download from only one peer?
        let verification_client = self.social_verification(PeerId::from(0)).await?;
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

    /// Returns an XMPP password derived from client secret. This enables
    /// recovery of XMPP account after recovering wallet.
    pub async fn get_xmpp_credentials(&self) -> RpcXmppCredentials {
        let root_secret = self.root_secret();
        let xmpp_secret = root_secret.child_key(ChildId(XMPP_CHILD_ID));
        let password_bytes: [u8; 16] = xmpp_secret
            .child_key(ChildId(XMPP_PASSWORD))
            .to_random_bytes();
        let keypair_seed_bytes: [u8; 32] = xmpp_secret
            .child_key(ChildId(XMPP_KEYPAIR_SEED))
            .to_random_bytes();
        let username = self.get_xmpp_username().await;

        RpcXmppCredentials {
            password: hex::encode(password_bytes),
            keypair_seed: hex::encode(keypair_seed_bytes),
            username,
        }
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

    pub async fn get_deposit_outcome(
        &self,
        operation_id: OperationId,
        log_entry: OperationLogEntry,
    ) -> Option<DepositState> {
        let outcome = log_entry.outcome::<DepositState>();

        // Return client's cached outcome if we find it
        if let Some(outcome) = outcome {
            return Some(outcome);
        }
        // Return our cached outcome if we find it
        if let Some(outcome) = self.get_operation_state(&operation_id).await {
            return Some(outcome);
        }

        // If no cached outcomes, consume the stream to get the outcome and populate
        // client's cache in future This is only useful for outgoing lightning
        // payments which fail due to timeout and nothing is subscribed to them
        let mut updates = match self
            .client
            .get_first_module::<WalletClientModule>()
            .subscribe_deposit_updates(operation_id)
            .await
        {
            Err(_) => return None,
            Ok(stream) => stream.into_stream(),
        };

        let mut last_state = None;
        while let Some(update) = updates.next().await {
            tracing::info!("update {:?}", update);
            last_state = Some(update);
        }
        last_state
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
                    let fedi_fee_status = self
                        .client
                        .db()
                        .begin_transaction_nc()
                        .await
                        .get_value(&OperationFediFeeStatusKey(op.0.operation_id))
                        .await
                        .map(Into::into);

                    match op.1.operation_module_kind() {
                        LIGHTNING_OPERATION_TYPE => {
                            let lightning_meta: LightningOperationMeta = op.1.meta();
                            match lightning_meta.variant {
                                LightningOperationMetaVariant::Pay(LightningOperationMetaPay{ invoice, .. }) => {
                                    let extra_meta = serde_json::from_value::<LightningSendMetadata>(lightning_meta.extra_meta)
                                        .unwrap_or(LightningSendMetadata {
                                            is_fedi_fee_remittance: false,
                                        });
                                    // Exclude fee remittance transactions from TX list
                                    if extra_meta.is_fedi_fee_remittance {
                                        None
                                    } else {
                                        Some(RpcTransaction {
                                            id: op.0.operation_id.to_string(),
                                            created_at: to_unix_time(op.0.creation_time)
                                                .expect("unix time should exist"),
                                            amount: RpcAmount(Amount {
                                                msats: invoice.amount_milli_satoshis().unwrap(),
                                            }),
                                            fedi_fee_status,
                                            direction: RpcTransactionDirection::Send,
                                            notes,
                                            onchain_state: None,
                                            bitcoin: None,
                                            ln_state: RpcLnState::from_ln_pay_state(
                                                self.get_ln_pay_outcome(op.0.operation_id, op.1).await,
                                            ),
                                            lightning: Some(RpcLightningDetails {
                                                invoice: invoice.to_string(),
                                                fee: None, // TODO: to be implemented on the fedimint side
                                            }),
                                            oob_state: None,
                                            onchain_withdrawal_details: None,
                                            stability_pool_state: None,
                                        })
                                    }
                                }
                                LightningOperationMetaVariant::Receive{ invoice, .. } => {
                                    let ln_state = RpcLnState::from_ln_recv_state(
                                        op.1.outcome::<LnReceiveState>(),
                                    );
                                    Some(RpcTransaction {
                                        id: op.0.operation_id.to_string(),
                                        created_at: to_unix_time(op.0.creation_time)
                                            .expect("unix time should exist"),
                                        amount: RpcAmount(Amount {
                                            msats: invoice.amount_milli_satoshis().unwrap(),
                                        }),
                                        fedi_fee_status,
                                        direction: RpcTransactionDirection::Receive,
                                        notes,
                                        onchain_state: None,
                                        bitcoin: None,
                                        ln_state,
                                        lightning: Some(RpcLightningDetails {
                                            invoice: invoice.to_string(),
                                            fee: None, /* TODO: to be implemented on the fedimint
                                                        * side */
                                        }),
                                        oob_state: None,
                                        onchain_withdrawal_details: None,
                                        stability_pool_state: None,
                                    })
                                }
                                LightningOperationMetaVariant::Claim { .. } => unreachable!("claims are not supported"),
                            }
                        },
                        STABILITY_POOL_OPERATION_TYPE => match op.1.meta() {
                            StabilityPoolMeta::Deposit { txid, amount, .. } => {
                                let stability_pool_state = match self.stability_pool_account_info(false).await {
                                    Ok(ClientAccountInfo { account_info, .. }) => if let Some(metadata) = account_info.seeks_metadata.get(&txid) {
                                        Some(RpcStabilityPoolTransactionState::CompleteDeposit { initial_amount_cents: metadata.initial_amount_cents, fees_paid_so_far: RpcAmount(metadata.fees_paid_so_far) })
                                    } else {
                                        Some(RpcStabilityPoolTransactionState::PendingDeposit)
                                    },
                                    Err(_) => None,
                                };
                                Some(RpcTransaction {
                                id: op.0.operation_id.to_string(),
                                created_at: to_unix_time(op.0.creation_time)
                                    .expect("unix time should exist"),
                                amount: RpcAmount(amount),
                                fedi_fee_status,
                                direction: RpcTransactionDirection::Send,
                                notes,
                                onchain_state: None,
                                bitcoin: None,
                                ln_state: None,
                                lightning: None,
                                oob_state: None,
                                onchain_withdrawal_details: None,
                                stability_pool_state,
                            })},
                            StabilityPoolMeta::Withdrawal { estimated_withdrawal_cents, .. } | StabilityPoolMeta::CancelRenewal { estimated_withdrawal_cents, .. } => {
                                let outcome = self
                                    .get_client_operation_outcome(op.0.operation_id, op.1)
                                    .await;
                                Some(RpcTransaction {
                                    id: op.0.operation_id.to_string(),
                                    created_at: to_unix_time(op.0.creation_time)
                                        .expect("unix time should exist"),
                                    amount: match outcome {
                                        Some(StabilityPoolWithdrawalOperationState::WithdrawUnlockedInitiated(amount) |
                                            StabilityPoolWithdrawalOperationState::WithdrawUnlockedAccepted(amount) |
                                            StabilityPoolWithdrawalOperationState::Success(amount) |
                                            StabilityPoolWithdrawalOperationState::CancellationInitiated(Some(amount)) |
                                            StabilityPoolWithdrawalOperationState::CancellationAccepted(Some(amount)) |
                                            StabilityPoolWithdrawalOperationState::WithdrawIdleInitiated(amount) |
                                            StabilityPoolWithdrawalOperationState::WithdrawIdleAccepted(amount)) => RpcAmount(amount),
                                        _ => RpcAmount(Amount::ZERO),
                                    },
                                    fedi_fee_status,
                                    direction: RpcTransactionDirection::Receive,
                                    notes,
                                    onchain_state: None,
                                    bitcoin: None,
                                    ln_state: None,
                                    lightning: None,
                                    oob_state: None,
                                    onchain_withdrawal_details: None,
                                    stability_pool_state: match outcome {
                                        Some(StabilityPoolWithdrawalOperationState::Success(_)) => Some(RpcStabilityPoolTransactionState::CompleteWithdrawal { estimated_withdrawal_cents }),
                                        Some(_) => Some(RpcStabilityPoolTransactionState::PendingWithdrawal { estimated_withdrawal_cents }),
                                        None => None,
                                    }
                                })
                            }
                        },
                        MINT_OPERATION_TYPE => {
                            let mint_meta: MintOperationMeta = op.1.meta();
                            match mint_meta.variant {
                                MintOperationMetaVariant::Reissuance { .. } => {
                                    let internal = serde_json::from_value::<EcashReceiveMetadata>(
                                        mint_meta.extra_meta,
                                    )
                                    .map_or(false, |x| x.internal);
                                    if !internal {
                                        Some(RpcTransaction {
                                            id: op.0.operation_id.to_string(),
                                            created_at: to_unix_time(op.0.creation_time)
                                                .expect("unix time should exist"),
                                            direction: RpcTransactionDirection::Receive,
                                            notes,
                                            onchain_state: None,
                                            bitcoin: None,
                                            ln_state: None,
                                            amount: RpcAmount(mint_meta.amount),
                                            fedi_fee_status,
                                            lightning: None,
                                            oob_state: self
                                                .get_client_operation_outcome(op.0.operation_id, op.1)
                                                .await
                                                .map(RpcOOBState::from_reissue_v2),
                                            onchain_withdrawal_details: None,
                                            stability_pool_state: None,
                                        })
                                    } else {
                                        None
                                    }
                                }
                                MintOperationMetaVariant::SpendOOB {
                                    requested_amount, ..
                                } => Some(RpcTransaction {
                                    id: op.0.operation_id.to_string(),
                                    created_at: to_unix_time(op.0.creation_time)
                                        .expect("unix time should exist"),
                                    direction: RpcTransactionDirection::Send,
                                    notes,
                                    onchain_state: None,
                                    bitcoin: None,
                                    ln_state: None,
                                    amount: RpcAmount(requested_amount),
                                    fedi_fee_status,
                                    lightning: None,
                                    oob_state: self
                                        .get_client_operation_outcome(op.0.operation_id, op.1)
                                        .await
                                        .map(RpcOOBState::from_spend_v2),
                                    onchain_withdrawal_details: None,
                                    stability_pool_state: None,
                                }),
                            }
                        }
                        WALLET_OPERATION_TYPE => {
                            let wallet_meta: WalletOperationMeta = op.1.meta();
                            match wallet_meta.variant {
                                WalletOperationMetaVariant::Deposit {
                                    address,
                                    expires_at,
                                } => {
                                    let outcome =
                                        self.get_deposit_outcome(op.0.operation_id, op.1).await;
                                    let onchain_state =
                                        RpcOnchainState::from_deposit_state(outcome.clone());

                                    Some(RpcTransaction {
                                        id: op.0.operation_id.to_string(),
                                        created_at: to_unix_time(op.0.creation_time)
                                            .expect("unix time should exist"),
                                        direction: RpcTransactionDirection::Receive,
                                        notes,
                                        onchain_state: onchain_state.clone(),
                                        bitcoin: Some(RpcBitcoinDetails {
                                            address: address.to_string(),
                                            expires_at: to_unix_time(expires_at)
                                                .expect("unix time should exist"),
                                        }),
                                        ln_state: None,
                                        amount: match outcome {
                                            Some(
                                                DepositState::WaitingForConfirmation(data)
                                                | DepositState::Confirmed(data)
                                                | DepositState::Claimed(data),
                                            ) => RpcAmount(Amount::from_sats(
                                                data.btc_transaction.output[data.out_idx as usize]
                                                    .value,
                                            )),
                                            _ => RpcAmount(Amount::ZERO),
                                        },
                                        fedi_fee_status,
                                        lightning: None,
                                        oob_state: None,
                                        onchain_withdrawal_details: None,
                                        stability_pool_state: None,
                                    })
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

                                    let onchain_state =
                                        RpcOnchainState::from_withdraw_state(Some(outcome));

                                    let txid_str = match txid {
                                        Some(n) => n.to_string(),
                                        None => "".to_string(),
                                    };

                                    Some(RpcTransaction {
                                        id: op.0.operation_id.to_string(),
                                        created_at: to_unix_time(op.0.creation_time)
                                            .expect("unix time should exist"),
                                        amount: rpc_amount,
                                        fedi_fee_status,
                                        direction: RpcTransactionDirection::Send,
                                        notes,
                                        onchain_state,
                                        bitcoin: None,
                                        ln_state: None,
                                        lightning: None,
                                        oob_state: None,
                                        onchain_withdrawal_details: Some(WithdrawalDetails {
                                            address: address.to_string(),
                                            txid: txid_str,
                                            fee: fee.amount().to_sat(),
                                            fee_rate: fee.fee_rate.sats_per_kvb,
                                        }),
                                        stability_pool_state: None,
                                    })
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
                    }
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

    // Database

    pub async fn get_xmpp_username(&self) -> Option<String> {
        self.dbtx().await.get_value(&XmppUsernameKey).await
    }

    pub async fn save_xmpp_username(&self, username: &str) -> Result<()> {
        let mut dbtx = self.dbtx().await;
        dbtx.insert_entry(&XmppUsernameKey, &username.to_owned())
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

    /// Get user's stability pool account info
    pub async fn stability_pool_account_info(
        &self,
        force_update: bool,
    ) -> Result<ClientAccountInfo> {
        self.client
            .get_first_module::<StabilityPoolClientModule>()
            .account_info(force_update)
            .await
            .context("Error when fetching account info")
    }

    pub async fn stability_pool_next_cycle_start_time(&self) -> Result<u64> {
        self.client
            .get_first_module::<StabilityPoolClientModule>()
            .next_cycle_start_time()
            .await
            .context("Error when fetching next cycle start time")
    }

    pub async fn stability_pool_cycle_start_price(&self) -> Result<u64> {
        self.client
            .get_first_module::<StabilityPoolClientModule>()
            .cycle_start_price()
            .await
            .context("Error when fetching cycle start price")
    }

    pub async fn stability_pool_average_fee_rate(&self, num_cycles: u64) -> Result<u64> {
        self.client
            .get_first_module::<StabilityPoolClientModule>()
            .average_fee_rate(num_cycles)
            .await
            .context("Error when fetching average fee rate")
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
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let fedi_fee = Amount::from_msats((amount.msats * fedi_fee_ppm).div_ceil(MILLION));
        let virtual_balance = self.get_balance().await;
        if amount + fedi_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, fedi_fee_ppm, None, None)
            )));
        }

        let operation_id = self
            .client
            .get_first_module::<StabilityPoolClientModule>()
            .deposit_to_seek(amount)
            .await?;
        self.write_pending_send_fedi_fee(operation_id, fedi_fee)
            .await?;
        let fed = self.clone();
        self.task_group
            .clone()
            .spawn("subscribe_stability_pool_deposit", move |_| async move {
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
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Receive,
            )
            .await?;
        let (operation_id, _) = self
            .client
            .get_first_module::<StabilityPoolClientModule>()
            .withdraw(unlocked_amount, locked_bps)
            .await?;
        self.write_pending_receive_fedi_fee_ppm(operation_id, fedi_fee_ppm)
            .await?;
        let fed = self.clone();
        self.task_group
            .clone()
            .spawn("subscribe_stability_pool_withdraw", move |_| async move {
                fed.subscribe_stability_pool_withdraw(operation_id).await
            });
        Ok(operation_id)
    }

    async fn subscribe_stability_pool_deposit_to_seek(&self, operation_id: OperationId) {
        let update_stream = self
            .client
            .get_first_module::<StabilityPoolClientModule>()
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
        let update_stream = self
            .client
            .get_first_module::<StabilityPoolClientModule>()
            .subscribe_withdraw(operation_id)
            .await;
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

    /// We optimistically charge the fee from the send amount (since the amount
    /// + fee must already be in the user's possession) and refund the fee
    /// in case the operation ends up failing.
    async fn write_pending_send_fedi_fee(
        &self,
        operation_id: OperationId,
        fedi_fee: Amount,
    ) -> anyhow::Result<()> {
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async move {
                        let outstanding_fedi_fees = fedi_fee
                            + dbtx
                                .get_value(&OutstandingFediFeesKey)
                                .await
                                .unwrap_or(Amount::ZERO);
                        dbtx.insert_entry(
                            &OperationFediFeeStatusKey(operation_id),
                            &OperationFediFeeStatus::PendingSend { fedi_fee },
                        )
                        .await;
                        dbtx.insert_entry(&OutstandingFediFeesKey, &outstanding_fedi_fees)
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
                "Successfully wrote pending send fedi fee for op ID {} with amount {}",
                operation_id, fedi_fee
            ),
            Err(ref e) => warn!(
                "Error writing pending send fedi fee for op ID {} with amount {}: {}",
                operation_id, fedi_fee, e
            ),
        }

        res
    }

    /// Transitions the OperationFediFeeStatus for a send operation from pending
    /// to success, iff the status is currently pending. Therefore the
    /// transition only happens once. Returns Ok((true, new_status)) if a DB
    /// write actually occurred, and Ok((false, current_status)) if no write
    /// was needed, meaning that the status has already been recorded as a
    /// success.
    async fn write_success_send_fedi_fee(
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
                            Some(OperationFediFeeStatus::PendingSend { fedi_fee }) => {
                                let new_status = OperationFediFeeStatus::Success { fedi_fee };
                                dbtx.insert_entry(&key, &new_status).await;
                                (true, new_status)
                            }
                            Some(status @ OperationFediFeeStatus::Success { .. }) => {
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
            Ok((true, _)) => {
                info!(
                    "Successfully wrote success send fedi fee for op ID {}",
                    operation_id
                );
                if let Some(service) = self.fedi_fee_remittance_service.get() {
                    service.remit_fedi_fee_if_threshold_met(self).await;
                }
            }
            Ok((false, _)) => info!(
                "Already recorded success send fedi fee for op ID {}, nothing overwritten",
                operation_id
            ),
            Err(ref e) => warn!(
                "Error writing success send fedi fee for op ID {}: {}",
                operation_id, e
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
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async move {
                        let key = OperationFediFeeStatusKey(operation_id);
                        let (did_overwrite, status) = match dbtx.get_value(&key).await {
                            Some(OperationFediFeeStatus::PendingSend { fedi_fee }) => {
                                let new_status = OperationFediFeeStatus::FailedSend { fedi_fee };
                                dbtx.insert_entry(&key, &new_status).await;
                                let outstanding_fedi_fees = dbtx
                                    .get_value(&OutstandingFediFeesKey)
                                    .await
                                    .unwrap_or(Amount::ZERO);
                                let outstanding_fedi_fees = if outstanding_fedi_fees > fedi_fee {
                                    outstanding_fedi_fees - fedi_fee
                                } else {
                                    Amount::ZERO
                                };
                                dbtx.insert_entry(&OutstandingFediFeesKey, &outstanding_fedi_fees)
                                    .await;
                                (true, new_status)
                            }
                            Some(status @ OperationFediFeeStatus::FailedSend { .. }) => {
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
                "Successfully wrote failed send fedi fee for op ID {}",
                operation_id
            ),
            Ok((false, _)) => info!(
                "Already recorded failed send fedi fee for op ID {}, nothing overwritten",
                operation_id
            ),
            Err(ref e) => warn!(
                "Error writing failed send fedi fee for op ID {}: {}",
                operation_id, e
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
                operation_id, fedi_fee_ppm
            ),
            Err(ref e) => warn!(
                "Error writing pending receive fedi fee for op ID {} with ppm {}: {}",
                operation_id, fedi_fee_ppm, e
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
        let res = self
            .client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async move {
                        let key = OperationFediFeeStatusKey(operation_id);
                        let (did_overwrite, status) = match dbtx.get_value(&key).await {
                            Some(OperationFediFeeStatus::PendingReceive { fedi_fee_ppm }) => {
                                let fedi_fee = Amount::from_msats(
                                    (amount.msats * fedi_fee_ppm).div_ceil(MILLION),
                                );
                                let outstanding_fedi_fees = fedi_fee
                                    + dbtx
                                        .get_value(&OutstandingFediFeesKey)
                                        .await
                                        .unwrap_or(Amount::ZERO);
                                let new_status = OperationFediFeeStatus::Success { fedi_fee };
                                dbtx.insert_entry(&key, &new_status).await;
                                dbtx.insert_entry(&OutstandingFediFeesKey, &outstanding_fedi_fees)
                                    .await;
                                (true, new_status)
                            }
                            Some(status @ OperationFediFeeStatus::Success { .. }) => {
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
            Ok((true, _)) => {
                info!(
                    "Successfully wrote success receive fedi fee for op ID {}",
                    operation_id
                );
                if let Some(service) = self.fedi_fee_remittance_service.get() {
                    service.remit_fedi_fee_if_threshold_met(self).await;
                }
            }
            Ok((false, _)) => info!(
                "Already recorded success receive fedi fee for op ID {}, nothing overwritten",
                operation_id
            ),
            Err(ref e) => warn!(
                "Error writing success receive fedi fee for op ID {}: {}",
                operation_id, e
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
                operation_id
            ),
            Ok((false, _)) => info!(
                "Already recorded failed receive fedi fee for op ID {}, nothing overwritten",
                operation_id
            ),
            Err(ref e) => warn!(
                "Error writing failed receive fedi fee for op ID {}: {}",
                operation_id, e
            ),
        }

        res
    }
}

#[inline(always)]
pub fn zero_gateway_fees() -> RoutingFees {
    RoutingFees {
        base_msat: 0,
        proportional_millionths: 0,
    }
}

// root/<key-type=per-federation=0>/<federation-id>/<wallet-number=0>/
// <key-type=aux=1>
fn get_default_auxiliary_secret(
    global_root_secret: &DerivableSecret,
    federation_id: &FederationId,
) -> DerivableSecret {
    get_per_federation_secret(global_root_secret, federation_id, 0, 1)
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
