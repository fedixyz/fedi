//! Fedi-owned adapters for the consumer-neutral Federation Initiator client.
//!
//! Formation policy, post-formation metadata policy, guardian-fee recipient
//! construction, Fleet Manager authorization, and consensus convergence remain
//! in Manifold. This bridge owns app identity, wallet-backed setup payments,
//! the cancellation-independent operation driver, and typed RPC projection.
//!
//! Guardian-fee maintenance accepts only an integer PPM rate. It derives the FI
//! recipient from the current joined client's SPv2 `BtcDepositor` account in
//! the exact joined federation id that `fi-client` parses from its persisted
//! formed invite. RPC and driver messages therefore cannot redirect the FI
//! share to another account.

use std::collections::HashMap;
use std::future::Future;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Weak};
use std::time::Duration;

use bitcoin::secp256k1::{Keypair, Message, Secp256k1, XOnlyPublicKey};
use federations::Federations;
use federations::federation_sm::FederationState;
use fedi_decentralized_federation_preview::{read_consensus, read_lnv2_gateways};
use fedi_decentralized_manifold_environment::{ManifoldEnvironment, ManifoldEnvironmentProfile};
use fedi_decentralized_nostr_clients::{
    FiNostrClient, NostrClientResult, NostrFiClient, NostrRelayClient,
};
use fedi_decentralized_peer_badge_verifier::PeerBadgeVerifier;
use fedi_decentralized_service_fleet_manager::{
    DkgCompletionCallback, FLEET_MANAGER_ALPN, FederationId, FleetManagerError,
    FleetManagerServiceClient, GetAvailabilityRequest, GetAvailabilityResponse, GetQuoteRequest,
    GetQuoteResponse, InviteCode, Locator, SignedResponse,
};
use fedi_decentralized_service_liquidity_manager::{
    AllocationItemStatus, AllocationItemTarget, BitcoinNetwork, CompletionEvidence,
    ItemAllocationStatus, LiquidityAmountBounds, PUBLIC_LIQUIDITY_API_ALPN, Pubkey,
    PublicLiquidityApiClient, Sats, SourceType,
};
#[cfg(test)]
use fedi_decentralized_service_liquidity_manager::{
    GatewayCompletionEvidence, GatewayId, GatewayName, ItemId, LiquidityFailure,
    LiquidityFailureCode, Sha256Digest, Timestamp, Url, WalletOperationId,
};
use fedi_iroh_rpc::iroh::Endpoint;
use fedi_iroh_rpc::iroh::endpoint::presets;
use fedimint_connectors::ConnectorRegistry;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::invite_code::InviteCode as FedimintInviteCode;
use fedimint_core::module::serde_json;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send};
use fedimint_derive_secret::DerivableSecret;
use fi_client::{
    AbandonUnavailableReason, FI_LIQUIDITY_OPERATION_PAGE_MAX, FederationConsensusError,
    FederationConsensusReader, FederationConsensusSnapshot, FederationMetadataUpdate,
    FederationName, FederationSize, FedimintFederationId, FiClient, FiError, FiErrorCode,
    FiFeeAccountError, FiFeeAccountProvider, FiId, FiIdentity, FiResult, FiSignature, FiStatus,
    FleetManagerCallError, FleetManagerConnector, FleetManagerConnectorError, FmanDiscoveryOptions,
    FmanReplacementApproval, FmanReplacementPreview, FmanSelectionApproval, FmanSelectionPreview,
    FmanSelectionRequest, FormationActionRequired, FormationFreshness, FormationId,
    FormationIntent, FormationPhase, FormationRunOptions, FormationSnapshot, GatewayApiUrl,
    GuardianFeeAccount, GuardianFeePpm, GuardianReplacementRequirements, LiquidityDiscovery,
    LiquidityOperationId, LiquidityOperationPage, LiquidityOperationPhase,
    LiquidityOperationSnapshot, LiquidityProviderConnector, LiquidityProviderConnectorError,
    LiquidityRequestIntent, MAX_GUARDIAN_FEE_PPM, MaintenanceRunOptions, PaymentAuthorizationId,
    PlanPreference, ResolvedFormationIntent, SeatPhase, SelectionReauthorizationReason,
};
use futures::StreamExt as _;
use futures::stream::{self, BoxStream};
use nostr::{Event, Keys, PublicKey};
use rpc_types::fi_client::{
    RpcFiAbandonUnavailableReason, RpcFiClientStatus, RpcFiCurrentLiquidityOperationResult,
    RpcFiEligiblePayer, RpcFiEligiblePayersResult, RpcFiErrorCode, RpcFiFederationMetadataUpdate,
    RpcFiFormationActionRequired, RpcFiFormationFreshness, RpcFiFormationIntent,
    RpcFiFormationMilestones, RpcFiFormationPhase, RpcFiFormationSnapshot,
    RpcFiGuardianReplacementRequirements, RpcFiGuardianReplacementSeat, RpcFiLiquidityAmountBounds,
    RpcFiLiquidityCompletionEvidence, RpcFiLiquidityDiscoveryResult, RpcFiLiquidityItemPhase,
    RpcFiLiquidityItemStatus, RpcFiLiquidityItemTarget, RpcFiLiquidityNetwork,
    RpcFiLiquidityOperation, RpcFiLiquidityOperationPage as RpcLiquidityOperationPage,
    RpcFiLiquidityOperationPageResult, RpcFiLiquidityOperationPhase, RpcFiLiquidityOperationResult,
    RpcFiLiquidityProvider, RpcFiLiquidityProviderRejection, RpcFiLiquidityRequestIntent,
    RpcFiLiquiditySource, RpcFiMsats, RpcFiOperationError, RpcFiOperationErrorDetail,
    RpcFiOperationResult, RpcFiPaymentRequirements, RpcFiPlanPreference, RpcFiReplacementPreview,
    RpcFiReplacementPreviewResult, RpcFiReplacementPreviewSeat, RpcFiResolvedFormationIntent,
    RpcFiSeatPaymentRequirement, RpcFiSeatPhase, RpcFiSeatProgress, RpcFiSelectionPreview,
    RpcFiSelectionPreviewRequest, RpcFiSelectionPreviewResult, RpcFiSelectionPreviewSeat,
    RpcFiSelectionReauthorizationReason, RpcFiStatus,
};
use runtime::bridge_runtime::Runtime;
use runtime::constants::FI_CLIENT_CHILD_ID;
use runtime::db::FiFederationAutoJoinCompletedKey;
use runtime::features::RuntimeEnvironment;
use sp_transfer::services::SptServices;
use tokio::sync::{Mutex, OnceCell, OwnedMutexGuard, mpsc, oneshot, watch};
use tokio_stream::wrappers::WatchStream;

use crate::fi_payments::BridgeFiPayments;
use crate::fi_push::{BridgeFiPushGateway, FiDkgPushHook, FiPushError};

pub(crate) type BridgeFiClient = FiClient<
    BridgeFiIdentity,
    BridgeFiPayments,
    BridgeFiRegistry,
    BridgeFmanConnector,
    BridgeFederationConsensusReader,
>;

const FI_DRIVER_QUEUE_CAPACITY: usize = 1;
const FI_LIQUIDITY_PAGE_SIZE: usize = FI_LIQUIDITY_OPERATION_PAGE_MAX;
const FI_RESUME_INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const FI_RESUME_MAX_BACKOFF: Duration = Duration::from_secs(5 * 60);
const FMAN_TRANSPORT_INITIALIZATION_ERROR: &str = "Fleet Manager transport initialization failed";
const FMAN_CONNECTION_ERROR: &str = "Fleet Manager connection failed";
const FMAN_CALL_ERROR: &str = "Fleet Manager call failed";
const LIQUIDITY_TRANSPORT_INITIALIZATION_ERROR: &str =
    "Liquidity provider transport initialization failed";
const LIQUIDITY_CONNECTION_ERROR: &str = "Liquidity provider connection failed";

pub(crate) async fn open_fi_client(
    runtime: &Runtime,
    federations: Arc<Federations>,
) -> FiResult<BridgeFiClient> {
    let root_secret = runtime.app_state.root_secret().await;
    let identity = BridgeFiIdentity::from_root_secret(&root_secret);
    let environment = manifold_environment(runtime.feature_catalog.runtime_env);
    let profile = environment
        .profile()
        .map_err(|_| FiError::Registry("Manifold environment profile is unavailable".to_owned()))?;
    let registry = BridgeFiRegistry::from_profile(&profile)?;
    let peer_badge_verifier = PeerBadgeVerifier::try_from_profile(&profile)
        .map_err(|_| FiError::Registry("Manifold PeerBadge trust is unavailable".to_owned()))?;
    let consensus_reader = BridgeFederationConsensusReader {
        connectors: runtime.connectors.clone(),
    };
    // Paid formation and guardian-fee policy both depend on deployment-owned
    // authorities from this exact Manifold profile.
    FiClient::open_with_manifold_profile(
        runtime.fi_client_db(),
        identity,
        BridgeFiPayments::new(federations.clone()),
        registry,
        BridgeFmanConnector::default(),
        peer_badge_verifier,
        consensus_reader,
        BridgeFiFeeAccountProvider { federations },
        profile,
    )
    .await
}

#[derive(Clone)]
struct BridgeFiFeeAccountProvider {
    federations: Arc<Federations>,
}

impl FiFeeAccountProvider for BridgeFiFeeAccountProvider {
    fn formed_federation_fee_account(
        &self,
        federation_id: &FedimintFederationId,
    ) -> Result<GuardianFeeAccount, FiFeeAccountError> {
        let federation = self
            .federations
            .get_federation(&federation_id.to_string())
            .map_err(|_| FiFeeAccountError::new("formed federation is not joined and ready"))?;
        federation
            .spv2_our_btc_depositor_account()
            .map_err(|_| FiFeeAccountError::new("formed federation has no SPv2 BTC account"))
    }
}

#[derive(Default)]
pub(crate) struct FiFederationHandoffLocks {
    locks: Mutex<HashMap<String, Weak<Mutex<()>>>>,
}

impl FiFederationHandoffLocks {
    pub(crate) async fn lock(&self, federation_id: &str) -> OwnedMutexGuard<()> {
        let lock = {
            let mut locks = self.locks.lock().await;
            locks.retain(|_, lock| lock.strong_count() > 0);
            if let Some(lock) = locks.get(federation_id).and_then(Weak::upgrade) {
                lock
            } else {
                let lock = Arc::new(Mutex::new(()));
                locks.insert(federation_id.to_owned(), Arc::downgrade(&lock));
                lock
            }
        };
        lock.lock_owned().await
    }
}

pub(crate) fn start_fi_federation_auto_join(
    runtime: &Runtime,
    mut status: watch::Receiver<FiStatus>,
    federations: Arc<Federations>,
    sp_transfers_services: Arc<SptServices>,
    handoff_locks: Arc<FiFederationHandoffLocks>,
) {
    let database = runtime.bridge_db();
    runtime
        .task_group
        .spawn_cancellable("fi-client::federation-auto-join", async move {
            loop {
                let Some((invite_code, federation_id)) =
                    formed_federation_invite(&status.borrow().clone())
                else {
                    if status.changed().await.is_err() {
                        return;
                    }
                    continue;
                };

                let _handoff_guard = handoff_locks.lock(&federation_id).await;
                if fi_federation_auto_join_completed(&database, &federation_id).await {
                    return;
                }
                match federations.get_federation_state(&federation_id) {
                    Ok(FederationState::Loading) => return,
                    Ok(
                        FederationState::Ready(_)
                        | FederationState::Recovering(_)
                        | FederationState::Failed(_),
                    ) => {
                        complete_fi_federation_auto_join(&database, &federation_id).await;
                        return;
                    }
                    Err(_) => {}
                }

                if federations
                    .join_federation(invite_code, false)
                    .await
                    .is_ok()
                {
                    sp_transfers_services.account_id_responder.trigger();
                    complete_fi_federation_auto_join(&database, &federation_id).await;
                } else {
                    tracing::warn!(
                        %federation_id,
                        "automatic FI federation join failed"
                    );
                }
                return;
            }
        });
}

fn formed_federation_invite(status: &FiStatus) -> Option<(String, String)> {
    let FiStatus::Formation(formation) = status else {
        return None;
    };
    if formation.phase != FormationPhase::Formed || formation.freshness != FormationFreshness::Fresh
    {
        return None;
    }
    let invite_code = formation.invite_code.as_ref()?.0.clone();
    let federation_id = FedimintInviteCode::from_str(&invite_code)
        .ok()?
        .federation_id()
        .to_string();
    Some((invite_code, federation_id))
}

async fn fi_federation_auto_join_completed(database: &Database, federation_id: &str) -> bool {
    database
        .begin_transaction_nc()
        .await
        .get_value(&FiFederationAutoJoinCompletedKey {
            federation_id: federation_id.to_owned(),
        })
        .await
        .is_some()
}

async fn complete_fi_federation_auto_join(database: &Database, federation_id: &str) {
    let mut dbtx = database.begin_transaction().await;
    dbtx.insert_entry(
        &FiFederationAutoJoinCompletedKey {
            federation_id: federation_id.to_owned(),
        },
        &(),
    )
    .await;
    dbtx.commit_tx().await;
}

pub(crate) async fn suppress_fi_federation_auto_join(runtime: &Runtime, federation_id: &str) {
    complete_fi_federation_auto_join(&runtime.bridge_db(), federation_id).await;
}

fn manifold_environment(environment: RuntimeEnvironment) -> ManifoldEnvironment {
    match environment {
        RuntimeEnvironment::Dev | RuntimeEnvironment::Tests => ManifoldEnvironment::Development,
        RuntimeEnvironment::Staging => ManifoldEnvironment::Staging,
        RuntimeEnvironment::Edge | RuntimeEnvironment::Prod => ManifoldEnvironment::Production,
    }
}

/// Lazy, read-only registry adapter built from Manifold's canonical profile.
///
/// Opening the bridge never requires relay availability. The first discovery
/// or setup-payment policy request establishes one bounded connection with an
/// ephemeral key, then role-specific queries enforce their own hard bounds.
#[derive(Clone)]
pub(crate) struct BridgeFiRegistry {
    relay_url: String,
    client: Arc<OnceCell<NostrFiClient>>,
}

impl BridgeFiRegistry {
    fn from_profile(profile: &ManifoldEnvironmentProfile) -> FiResult<Self> {
        let relay_url = profile
            .nostr_relays()
            .as_urls()
            .first()
            .ok_or_else(|| FiError::Registry("Manifold relay routing is empty".to_owned()))?
            .to_string();
        Ok(Self {
            relay_url,
            client: Arc::new(OnceCell::new()),
        })
    }

    async fn client(&self, timeout: Duration) -> NostrClientResult<&NostrFiClient> {
        self.client
            .get_or_try_init(|| async {
                let relay = NostrRelayClient::connect(
                    &self.relay_url,
                    Keys::generate(),
                    timeout.min(Duration::from_secs(10)),
                )
                .await?;
                Ok(NostrFiClient::new(relay))
            })
            .await
    }
}

impl FiNostrClient for BridgeFiRegistry {
    async fn fetch_fman_advertisement(
        &self,
        fman_pubkey: PublicKey,
        timeout: Duration,
    ) -> NostrClientResult<Event> {
        self.client(timeout)
            .await?
            .fetch_fman_advertisement(fman_pubkey, timeout)
            .await
    }

    async fn fetch_setup_payment_federations(
        &self,
        publisher: PublicKey,
        timeout: Duration,
    ) -> NostrClientResult<Vec<Event>> {
        self.client(timeout)
            .await?
            .fetch_setup_payment_federations(publisher, timeout)
            .await
    }

    async fn fetch_fman_advertisements(&self, timeout: Duration) -> NostrClientResult<Vec<Event>> {
        self.client(timeout)
            .await?
            .fetch_fman_advertisements(timeout)
            .await
    }

    async fn fetch_liquidity_provider_advertisements(
        &self,
        timeout: Duration,
    ) -> NostrClientResult<Vec<Event>> {
        self.client(timeout)
            .await?
            .fetch_liquidity_provider_advertisements(timeout)
            .await
    }
}

#[derive(Clone)]
pub(crate) struct BridgeFederationConsensusReader {
    connectors: ConnectorRegistry,
}

impl FederationConsensusReader for BridgeFederationConsensusReader {
    async fn read_consensus(
        &self,
        invite_code: &InviteCode,
    ) -> Result<FederationConsensusSnapshot, FederationConsensusError> {
        let snapshot = read_consensus(&self.connectors, invite_code)
            .await
            .map_err(|_| FederationConsensusError::new("federation consensus read failed"))?;
        Ok(FederationConsensusSnapshot {
            config: snapshot.config,
            meta_value: snapshot.meta_value,
            meta_revision: snapshot.meta_revision,
            network: snapshot.network,
        })
    }

    async fn read_lnv2_gateways(
        &self,
        invite_code: &InviteCode,
    ) -> Result<Vec<GatewayApiUrl>, FederationConsensusError> {
        read_lnv2_gateways(&self.connectors, invite_code)
            .await
            .map_err(|_| FederationConsensusError::new("federation gateway consensus read failed"))
    }
}

/// Fedi's Iroh transport adapter for the Fleet Manager service.
///
/// The endpoint is bound lazily so opening an otherwise healthy wallet does
/// not require network availability. Iroh is reached through Manifold's RPC
/// crate re-export, keeping this adapter on the exact transport type used by
/// the generated service client.
#[derive(Default)]
pub(crate) struct BridgeFmanConnector {
    endpoint: OnceCell<Endpoint>,
}

impl FleetManagerConnector for BridgeFmanConnector {
    type Client = FleetManagerServiceClient;

    async fn connect(&self, locator: &Locator) -> Result<Self::Client, FleetManagerConnectorError> {
        let endpoint = self
            .endpoint
            .get_or_try_init(|| async {
                Endpoint::bind(presets::N0).await.map_err(|_| {
                    FleetManagerConnectorError::new(FMAN_TRANSPORT_INITIALIZATION_ERROR)
                })
            })
            .await?;
        endpoint
            .connect(locator.endpoint_addr.clone(), FLEET_MANAGER_ALPN)
            .await
            .map(FleetManagerServiceClient::new)
            .map_err(|_| FleetManagerConnectorError::new(FMAN_CONNECTION_ERROR))
    }

    async fn get_availability(
        &self,
        client: &Self::Client,
        request: GetAvailabilityRequest,
    ) -> Result<Result<GetAvailabilityResponse, FleetManagerError>, FleetManagerCallError> {
        client
            .transport()
            .get_availability(request)
            .await
            .map_err(|_| FleetManagerCallError::new(FMAN_CALL_ERROR))
    }

    async fn get_quote(
        &self,
        client: &Self::Client,
        request: GetQuoteRequest,
    ) -> Result<Result<SignedResponse<GetQuoteResponse>, FleetManagerError>, FleetManagerCallError>
    {
        client
            .transport()
            .get_quote(request)
            .await
            .map_err(|_| FleetManagerCallError::new(FMAN_CALL_ERROR))
    }
}

/// Fedi's Iroh transport adapter for the provider-signed FLIP endpoint.
///
/// `fi-client` admits the endpoint and independently verifies every response;
/// this adapter only binds the authenticated node id to the protocol's exact
/// ALPN and sanitizes transport failures.
#[derive(Default)]
pub(crate) struct BridgeLiquidityConnector {
    endpoint: OnceCell<Endpoint>,
}

impl LiquidityProviderConnector for BridgeLiquidityConnector {
    type Client = PublicLiquidityApiClient;

    async fn connect(
        &self,
        endpoint_addr: &fedi_iroh_rpc::iroh::EndpointAddr,
    ) -> Result<Self::Client, LiquidityProviderConnectorError> {
        let endpoint = self
            .endpoint
            .get_or_try_init(|| async {
                Endpoint::bind(presets::N0).await.map_err(|_| {
                    LiquidityProviderConnectorError::new(LIQUIDITY_TRANSPORT_INITIALIZATION_ERROR)
                })
            })
            .await?;
        endpoint
            .connect(endpoint_addr.clone(), PUBLIC_LIQUIDITY_API_ALPN)
            .await
            .map(PublicLiquidityApiClient::new)
            .map_err(|_| LiquidityProviderConnectorError::new(LIQUIDITY_CONNECTION_ERROR))
    }
}

#[apply(async_trait_maybe_send!)]
trait FormationPushGateway: Send + Sync {
    async fn create_formation_hook(&self) -> Result<FiDkgPushHook, FiPushError>;

    async fn revoke_hook(&self, hook: &FiDkgPushHook) -> Result<(), FiPushError>;
}

#[apply(async_trait_maybe_send!)]
impl FormationPushGateway for BridgeFiPushGateway {
    async fn create_formation_hook(&self) -> Result<FiDkgPushHook, FiPushError> {
        BridgeFiPushGateway::create_formation_hook(self).await
    }

    async fn revoke_hook(&self, hook: &FiDkgPushHook) -> Result<(), FiPushError> {
        BridgeFiPushGateway::revoke_hook(self, hook).await
    }
}

type FormationPushGatewayHandle = Result<Arc<dyn FormationPushGateway>, Arc<FiPushError>>;

struct FormationPushCoordinator {
    gateway: FormationPushGatewayHandle,
    state: Mutex<Option<StoredFormationPush>>,
}

struct StoredFormationPush {
    preview_id: String,
    hook: Option<FiDkgPushHook>,
}

pub(crate) struct BridgeFiIdentity {
    keypair: Keypair,
}

impl BridgeFiIdentity {
    fn from_root_secret(root_secret: &DerivableSecret) -> Self {
        let secp = Secp256k1::new();
        let keypair = root_secret.child_key(FI_CLIENT_CHILD_ID).to_secp_key(&secp);
        Self { keypair }
    }
}

impl FiIdentity for BridgeFiIdentity {
    fn public_key(&self) -> Result<FiId, String> {
        let (public_key, _) = XOnlyPublicKey::from_keypair(&self.keypair);
        // Fedi and Manifold intentionally use their respective workspace
        // secp256k1 versions. Serde crosses that crate-version boundary while
        // preserving the canonical x-only public-key representation.
        serde_json::from_value(serde_json::to_value(public_key).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())
    }

    fn sign_digest(&self, digest: [u8; 32]) -> Result<FiSignature, String> {
        let secp = Secp256k1::new();
        let message = Message::from_digest(digest);
        let signature = secp.sign_schnorr_no_aux_rand(&message, &self.keypair);
        // See `public_key`: this converts between semantically identical
        // signature types from the two workspace dependency graphs.
        serde_json::from_value(serde_json::to_value(signature).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())
    }
}

#[derive(Clone)]
pub(crate) struct BridgeFiDriver {
    commands: FiCommandSender,
    client: Arc<BridgeFiClient>,
    federations: Arc<Federations>,
    formation_state: Arc<FormationLocalState>,
}

#[derive(Clone)]
struct FiCommandSender {
    sender: mpsc::Sender<FiDriverCommand>,
    operation_active: Arc<AtomicBool>,
}

struct StoredSelection {
    preview_id: String,
    preview: Option<FmanSelectionPreview>,
    approval: Option<FmanSelectionApproval>,
}

struct StoredReplacement {
    preview_id: String,
    preview: Option<FmanReplacementPreview>,
    approval: Option<FmanReplacementApproval>,
}

struct FormationLocalState {
    formation_push: FormationPushCoordinator,
    selection: Mutex<Option<StoredSelection>>,
    replacement: Mutex<Option<StoredReplacement>>,
}

async fn ensure_formation_push_hook(
    stored_hook: &mut Option<FiDkgPushHook>,
    push_gateway: &FormationPushGatewayHandle,
) -> Result<FiDkgPushHook, RpcFiOperationError> {
    if let Some(hook) = stored_hook {
        return Ok(hook.clone());
    }
    let gateway = push_gateway
        .as_ref()
        .map_err(|error| fi_push_error_to_rpc(error))?;
    let hook = gateway
        .create_formation_hook()
        .await
        .map_err(|error| fi_push_error_to_rpc(&error))?;
    *stored_hook = Some(hook.clone());
    Ok(hook)
}

async fn discard_formation_push_if_unowned(
    hook: Option<FiDkgPushHook>,
    push_gateway: &FormationPushGatewayHandle,
    formation_started: bool,
) {
    if formation_started {
        return;
    }
    if let Some(hook) = hook
        && let Ok(gateway) = push_gateway
    {
        // Revocation is deliberately best-effort. A failed cleanup leaves an
        // expiring one-use orphan, never a reason to repeat or roll back money.
        let _ = gateway.revoke_hook(&hook).await;
    }
}

enum FiDriverOperation {
    CreatePinned {
        intent: FormationIntent,
        locators: Vec<Locator>,
    },
    PayAndCreate {
        intent: FormationIntent,
        approval: FmanSelectionApproval,
        payment_federation_id: FederationId,
        completion_callback: DkgCompletionCallback,
    },
    ApplyReplacements {
        approval: FmanReplacementApproval,
    },
    Abandon,
    Resume,
    AuthorizePayments {
        authorization_id: PaymentAuthorizationId,
    },
    StartLiquidity {
        formation_id: FormationId,
        provider_pubkey: Pubkey,
        intent: LiquidityRequestIntent,
    },
    ResumeLiquidity {
        operation_id: LiquidityOperationId,
    },
    UpdateMetadata {
        update: FederationMetadataUpdate,
    },
    SetGuardianFee {
        send_ppm: GuardianFeePpm,
    },
}

enum FiDriverResponse {
    Formation(RpcFiOperationResult),
    Liquidity(RpcFiLiquidityOperationResult),
}

struct FiDriverCommand {
    operation: FiDriverOperation,
    response: oneshot::Sender<FiDriverCompletion>,
    claim: FiDriverOperationClaim,
    retain_claim_for_handoff: bool,
}

struct FiDriverOperationClaim {
    operation_active: Arc<AtomicBool>,
}

struct FiDriverCompletion {
    response: FiDriverResponse,
    retained_claim: Option<FiDriverOperationClaim>,
}

struct LiquidityLaunchRecovery {
    read_current: bool,
    pending: Option<LiquidityOperationId>,
    last_snapshot: Option<LiquidityOperationSnapshot>,
    retry_delay: Duration,
}

enum LiquidityRecoveryStep {
    ReadCurrent,
    Resume { operation_id: LiquidityOperationId },
}

impl LiquidityLaunchRecovery {
    fn new() -> Self {
        Self {
            read_current: true,
            pending: None,
            last_snapshot: None,
            retry_delay: Duration::ZERO,
        }
    }

    fn has_work(&self) -> bool {
        self.read_current || self.pending.is_some()
    }

    fn next_delay(&self) -> Duration {
        if self.pending.is_some() {
            Duration::ZERO
        } else {
            self.retry_delay
        }
    }

    fn next_step(&mut self) -> Option<LiquidityRecoveryStep> {
        if let Some(operation_id) = self.pending.take() {
            return Some(LiquidityRecoveryStep::Resume { operation_id });
        }
        if self.read_current {
            self.read_current = false;
            return Some(LiquidityRecoveryStep::ReadCurrent);
        }
        None
    }

    fn record_current(&mut self, operation: Option<LiquidityOperationSnapshot>) {
        let Some(operation) = operation.filter(should_resume_liquidity_on_launch) else {
            self.finish();
            return;
        };
        if self
            .last_snapshot
            .as_ref()
            .is_some_and(|previous| previous != &operation)
        {
            self.retry_delay = Duration::ZERO;
        }
        self.pending = Some(operation.operation_id.clone());
        self.last_snapshot = Some(operation);
    }

    fn record_failure(&mut self) {
        self.pending = None;
        self.read_current = true;
        self.retry_delay = next_retry_delay(self.retry_delay, false);
    }

    fn record_resume_success(&mut self, operation: LiquidityOperationSnapshot) {
        if !should_resume_liquidity_on_launch(&operation) {
            self.finish();
            return;
        }
        let progress = self
            .last_snapshot
            .as_ref()
            .is_some_and(|previous| previous != &operation);
        self.last_snapshot = Some(operation);
        self.pending = None;
        self.read_current = true;
        self.retry_delay = next_retry_delay(self.retry_delay, progress);
    }

    fn finish(&mut self) {
        self.read_current = false;
        self.pending = None;
        self.last_snapshot = None;
        self.retry_delay = Duration::ZERO;
    }

    /// Re-read Manifold's canonical operation after a start or explicit resume.
    ///
    /// Manifold commits the semantic operation before the first provider
    /// mutation. Even an error response can therefore mean a durable operation
    /// exists. Re-reading is required in-process so a lost response does
    /// not strand that operation until the next app launch.
    fn rearm_after_mutation(&mut self) {
        self.read_current = true;
        self.pending = None;
        self.last_snapshot = None;
        self.retry_delay = Duration::ZERO;
    }
}

impl Drop for FiDriverOperationClaim {
    fn drop(&mut self) {
        self.operation_active.store(false, Ordering::Release);
    }
}

impl FormationPushCoordinator {
    fn new(gateway: FormationPushGatewayHandle) -> Self {
        Self {
            gateway,
            state: Mutex::new(None),
        }
    }

    async fn install_preview(&self, preview_id: String, formation_started: bool) {
        let replaced = self.state.lock().await.replace(StoredFormationPush {
            preview_id,
            hook: None,
        });
        discard_formation_push_if_unowned(
            replaced.and_then(|stored| stored.hook),
            &self.gateway,
            formation_started,
        )
        .await;
    }

    async fn invalidate_after_abandon(&self) {
        let removed = self.state.lock().await.take();
        discard_formation_push_if_unowned(
            removed.and_then(|stored| stored.hook),
            &self.gateway,
            false,
        )
        .await;
    }

    /// Prepares, dispatches, and settles the callback ownership handoff as one
    /// production coordinator.
    ///
    /// The driver returns its global mutation claim with the response. This
    /// method retains that same claim until durable status has decided whether
    /// the local retry owns the hook or Manifold owns it. A cancelled caller
    /// may leave local state behind, so the next preview also checks durable
    /// formation ownership before attempting best-effort revocation.
    async fn dispatch_paid_formation<Dispatch, DispatchFuture, FormationStarted>(
        &self,
        preview_id: &str,
        dispatch: Dispatch,
        formation_started: FormationStarted,
    ) -> RpcFiOperationResult
    where
        Dispatch: FnOnce(DkgCompletionCallback) -> DispatchFuture,
        DispatchFuture: Future<
            Output = Result<(FiDriverResponse, FiDriverOperationClaim), RpcFiOperationError>,
        >,
        FormationStarted: FnOnce() -> bool,
    {
        let callback = {
            let mut state = self.state.lock().await;
            let Some(stored) = state
                .as_mut()
                .filter(|stored| stored.preview_id == preview_id)
            else {
                return operation_error_result(
                    RpcFiErrorCode::SelectionReauthorizationRequired,
                    "The selection preview callback is no longer available",
                );
            };
            match ensure_formation_push_hook(&mut stored.hook, &self.gateway).await {
                Ok(hook) => hook.callback,
                Err(error) => return RpcFiOperationResult::Error { error },
            }
        };

        let dispatched = dispatch(callback).await;
        let (result, retained_claim) = match dispatched {
            Ok((response, claim)) => (operation_response(Ok(response)), Some(claim)),
            Err(error) => (operation_response(Err(error)), None),
        };
        let formation_started = formation_started();
        let removed = {
            let mut state = self.state.lock().await;
            if state
                .as_ref()
                .is_some_and(|stored| stored.preview_id == preview_id)
                && (!may_retry_payer(&result) || formation_started)
            {
                state.take()
            } else {
                None
            }
        };
        discard_formation_push_if_unowned(
            removed.and_then(|stored| stored.hook),
            &self.gateway,
            formation_started,
        )
        .await;
        // Release the global mutation claim only after callback ownership and
        // optional cleanup are complete. This closes the response/handoff race
        // with a new preview or replacement operation.
        drop(retained_claim);
        result
    }
}

impl FormationLocalState {
    fn new(push_gateway: FormationPushGatewayHandle) -> Self {
        Self {
            formation_push: FormationPushCoordinator::new(push_gateway),
            selection: Mutex::new(None),
            replacement: Mutex::new(None),
        }
    }

    /// Invalidate every Fedi-owned authorization before the successful
    /// abandonment mutation releases the global driver claim.
    async fn invalidate_after_abandon(&self) {
        self.selection.lock().await.take();
        self.replacement.lock().await.take();
        self.formation_push.invalidate_after_abandon().await;
    }
}

fn may_retry_payer(result: &RpcFiOperationResult) -> bool {
    matches!(
        result,
        RpcFiOperationResult::Error {
            error: RpcFiOperationError {
                code: RpcFiErrorCode::Busy,
                ..
            }
        } | RpcFiOperationResult::Error {
            error: RpcFiOperationError {
                detail: Some(
                    RpcFiOperationErrorDetail::SelectionReauthorizationRequired {
                        reason: RpcFiSelectionReauthorizationReason::SelectedPayerUnavailable
                            | RpcFiSelectionReauthorizationReason::SelectedPayerInsufficientFunds,
                    }
                ),
                ..
            }
        }
    )
}

fn operation_response(
    response: Result<FiDriverResponse, RpcFiOperationError>,
) -> RpcFiOperationResult {
    match response {
        Ok(FiDriverResponse::Formation(result)) => result,
        Ok(FiDriverResponse::Liquidity(_)) => operation_error_result(
            RpcFiErrorCode::CapabilityUnavailable,
            "FI operation driver returned an unexpected response",
        ),
        Err(error) => RpcFiOperationResult::Error { error },
    }
}

async fn reconcile_one_liquidity_step<Current, CurrentFuture, Resume, ResumeFuture>(
    recovery: &mut LiquidityLaunchRecovery,
    operation_active: &Arc<AtomicBool>,
    current: Current,
    resume: Resume,
) where
    Current: FnOnce() -> CurrentFuture,
    CurrentFuture: Future<Output = FiResult<Option<LiquidityOperationSnapshot>>>,
    Resume: FnOnce(LiquidityOperationId) -> ResumeFuture,
    ResumeFuture: Future<Output = FiResult<LiquidityOperationSnapshot>>,
{
    let Some(step) = recovery.next_step() else {
        return;
    };
    match step {
        LiquidityRecoveryStep::ReadCurrent => match current().await {
            Ok(operation) => recovery.record_current(operation),
            Err(error) => {
                tracing::debug!(
                    error_code = ?error.code(),
                    "FI current liquidity operation read will retry"
                );
                recovery.record_failure();
            }
        },
        LiquidityRecoveryStep::Resume { operation_id } => {
            let Some(claim) = operation_active
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .ok()
                .map(|_| FiDriverOperationClaim {
                    operation_active: operation_active.clone(),
                })
            else {
                recovery.record_failure();
                return;
            };
            let result = resume(operation_id).await;
            drop(claim);
            match result {
                Ok(operation) => recovery.record_resume_success(operation),
                Err(error) => {
                    tracing::debug!(
                        error_code = ?error.code(),
                        "FI liquidity reconciliation will retry"
                    );
                    recovery.record_failure();
                }
            }
        }
    }
}

impl BridgeFiDriver {
    pub(crate) async fn eligible_payers(&self) -> RpcFiEligiblePayersResult {
        let admitted = match self
            .client
            .admitted_setup_payment_federations(FormationRunOptions::default())
            .await
        {
            Ok(admitted) => admitted,
            Err(error) => {
                return RpcFiEligiblePayersResult::Error {
                    error: fi_error_to_rpc(&error),
                };
            }
        };
        let mut payers = Vec::with_capacity(admitted.len());
        for member in admitted {
            let federation_id = member.federation_id();
            // `get_federation` returns only fully loaded Ready wallets. Keep
            // admitted zero-balance wallets so the caller can route to the
            // existing refill flow before Pay-and-create.
            let Ok(federation) = self.federations.get_federation(&federation_id.0) else {
                continue;
            };
            payers.push(RpcFiEligiblePayer {
                federation_id: federation_id.0.clone(),
                balance_msats: RpcFiMsats::from(federation.get_balance().await.msats),
            });
        }
        RpcFiEligiblePayersResult::Payers { payers }
    }

    pub(crate) async fn discover_liquidity(
        &self,
        intent: RpcFiLiquidityRequestIntent,
        network: RpcFiLiquidityNetwork,
    ) -> RpcFiLiquidityDiscoveryResult {
        let intent = match liquidity_intent_from_rpc(intent) {
            Ok(intent) => intent,
            Err(error) => return RpcFiLiquidityDiscoveryResult::Error { error },
        };
        match self
            .client
            .discover_liquidity_providers(&intent, liquidity_network_from_rpc(network))
            .await
        {
            Ok(discovery) => liquidity_discovery_to_rpc(discovery),
            Err(error) => RpcFiLiquidityDiscoveryResult::Error {
                error: fi_error_to_rpc(&error),
            },
        }
    }

    pub(crate) async fn start_liquidity(
        &self,
        formation_id: String,
        provider_pubkey: String,
        intent: RpcFiLiquidityRequestIntent,
    ) -> RpcFiLiquidityOperationResult {
        let provider_pubkey = match canonical_liquidity_provider_pubkey(&provider_pubkey) {
            Ok(provider_pubkey) => provider_pubkey,
            Err(error) => return RpcFiLiquidityOperationResult::Error { error },
        };
        let intent = match liquidity_intent_from_rpc(intent) {
            Ok(intent) => intent,
            Err(error) => return RpcFiLiquidityOperationResult::Error { error },
        };
        self.commands
            .request_liquidity(FiDriverOperation::StartLiquidity {
                formation_id: FormationId(formation_id),
                provider_pubkey,
                intent,
            })
            .await
    }

    pub(crate) async fn resume_liquidity(
        &self,
        operation_id: String,
    ) -> RpcFiLiquidityOperationResult {
        self.commands
            .request_liquidity(FiDriverOperation::ResumeLiquidity {
                operation_id: LiquidityOperationId(operation_id),
            })
            .await
    }

    pub(crate) async fn liquidity_status(
        &self,
        operation_id: String,
    ) -> RpcFiLiquidityOperationResult {
        match self
            .client
            .liquidity_status(&LiquidityOperationId(operation_id))
            .await
        {
            Ok(snapshot) => liquidity_operation_result(Ok(snapshot)),
            Err(error) => liquidity_operation_result(Err(error)),
        }
    }

    pub(crate) async fn current_liquidity_operation(&self) -> RpcFiCurrentLiquidityOperationResult {
        match self.client.current_liquidity_operation().await {
            Ok(operation) => RpcFiCurrentLiquidityOperationResult::Current {
                operation: operation.map(liquidity_operation_to_rpc),
            },
            Err(error) => RpcFiCurrentLiquidityOperationResult::Error {
                error: fi_error_to_rpc(&error),
            },
        }
    }

    pub(crate) async fn list_liquidity_operations(
        &self,
        after: Option<String>,
    ) -> RpcFiLiquidityOperationPageResult {
        let after = after.map(LiquidityOperationId);
        match self
            .client
            .list_liquidity_operations(after.as_ref(), FI_LIQUIDITY_PAGE_SIZE)
            .await
        {
            Ok(page) => liquidity_operation_page_to_rpc(page),
            Err(error) => RpcFiLiquidityOperationPageResult::Error {
                error: fi_error_to_rpc(&error),
            },
        }
    }

    pub(crate) async fn update_federation_metadata(
        &self,
        update: RpcFiFederationMetadataUpdate,
    ) -> RpcFiOperationResult {
        if let Err(error) = formed_federation_id(&self.client.status()) {
            return RpcFiOperationResult::Error { error };
        }
        let update = match metadata_update_from_rpc(update) {
            Ok(update) => update,
            Err(error) => return RpcFiOperationResult::Error { error },
        };
        self.commands
            .request(FiDriverOperation::UpdateMetadata { update })
            .await
    }

    pub(crate) async fn set_guardian_fee(&self, guardian_fee_ppm: u32) -> RpcFiOperationResult {
        let send_ppm = match guardian_fee_from_rpc(guardian_fee_ppm) {
            Ok(send_ppm) => send_ppm,
            Err(error) => return RpcFiOperationResult::Error { error },
        };
        if let Err(error) = formed_federation_id(&self.client.status()) {
            return RpcFiOperationResult::Error { error };
        }
        self.commands
            .request(FiDriverOperation::SetGuardianFee { send_ppm })
            .await
    }

    pub(crate) async fn preview_selection(
        &self,
        request: RpcFiSelectionPreviewRequest,
    ) -> RpcFiSelectionPreviewResult {
        let Some(_claim) = self.commands.try_claim_operation() else {
            return RpcFiSelectionPreviewResult::Error {
                error: operation_error(
                    RpcFiErrorCode::Busy,
                    "An FI operation is already in progress",
                ),
            };
        };
        let request = match selection_request_from_rpc(request) {
            Ok(request) => request,
            Err(error) => return RpcFiSelectionPreviewResult::Error { error },
        };
        let preview = match self
            .client
            .preview_fman_selection(&request, FmanDiscoveryOptions::default())
            .await
        {
            Ok(preview) => preview,
            Err(error) => {
                return RpcFiSelectionPreviewResult::Error {
                    error: fi_error_to_rpc(&error),
                };
            }
        };
        let preview_id = hex::encode(rand::random::<[u8; 16]>());
        let response = selection_preview_to_rpc(&preview_id, &preview);
        self.formation_state
            .selection
            .lock()
            .await
            .replace(StoredSelection {
                preview_id: preview_id.clone(),
                preview: Some(preview),
                approval: None,
            });
        self.formation_state
            .formation_push
            .install_preview(
                preview_id,
                matches!(self.client.status(), FiStatus::Formation(_)),
            )
            .await;
        RpcFiSelectionPreviewResult::Preview { preview: response }
    }

    pub(crate) async fn resume(&self) -> RpcFiOperationResult {
        self.commands.request(FiDriverOperation::Resume).await
    }

    pub(crate) async fn abandon(&self) -> RpcFiOperationResult {
        self.commands.request(FiDriverOperation::Abandon).await
    }

    pub(crate) async fn preview_replacements(&self) -> RpcFiReplacementPreviewResult {
        let Some(_claim) = self.commands.try_claim_operation() else {
            return RpcFiReplacementPreviewResult::Error {
                error: operation_error(
                    RpcFiErrorCode::Busy,
                    "An FI operation is already in progress",
                ),
            };
        };
        let preview = match self
            .client
            .preview_fman_replacements(FmanDiscoveryOptions::default())
            .await
        {
            Ok(preview) => preview,
            Err(error) => {
                return RpcFiReplacementPreviewResult::Error {
                    error: fi_error_to_rpc(&error),
                };
            }
        };
        let preview_id = hex::encode(rand::random::<[u8; 16]>());
        let response = replacement_preview_to_rpc(&preview_id, &preview);
        self.formation_state
            .replacement
            .lock()
            .await
            .replace(StoredReplacement {
                preview_id,
                preview: Some(preview),
                approval: None,
            });
        RpcFiReplacementPreviewResult::Preview { preview: response }
    }

    pub(crate) async fn apply_replacements(
        &self,
        preview_id: String,
        max_total_msats: u64,
    ) -> RpcFiOperationResult {
        let Some(claim) = self.commands.try_claim_operation() else {
            return operation_error_result(
                RpcFiErrorCode::Busy,
                "An FI operation is already in progress",
            );
        };
        let approval = {
            let mut replacement = self.formation_state.replacement.lock().await;
            let Some(stored) = replacement
                .as_mut()
                .filter(|stored| stored.preview_id == preview_id)
            else {
                return preview_expired_result();
            };
            if let Some(approval) = &stored.approval {
                if approval.max_total_msats() != max_total_msats {
                    return operation_error_result(
                        RpcFiErrorCode::InvalidIntent,
                        "The approved replacement spending limit cannot be changed",
                    );
                }
                approval.clone()
            } else {
                let Some(preview) = stored.preview.as_ref() else {
                    unreachable!("stored replacement has a preview or approval");
                };
                if max_total_msats == 0 || max_total_msats < preview.total_advertised_msats() {
                    return RpcFiOperationResult::Error {
                        error: fi_error_to_rpc(&FiError::SelectionReauthorizationRequired(
                            SelectionReauthorizationReason::AdvertisementEstimateExceedsLimit,
                        )),
                    };
                }
                let preview = stored
                    .preview
                    .take()
                    .expect("replacement preview was checked before consumption");
                let approval = match preview.approve(max_total_msats) {
                    Ok(approval) => approval,
                    Err(error) => {
                        return RpcFiOperationResult::Error {
                            error: fi_error_to_rpc(&error),
                        };
                    }
                };
                stored.approval = Some(approval.clone());
                approval
            }
        };
        let result = match self
            .commands
            .request_claimed(FiDriverOperation::ApplyReplacements { approval }, claim)
            .await
        {
            Ok(FiDriverResponse::Formation(result)) => result,
            Ok(FiDriverResponse::Liquidity(_)) => operation_error_result(
                RpcFiErrorCode::CapabilityUnavailable,
                "FI operation driver returned an unexpected response",
            ),
            Err(error) => RpcFiOperationResult::Error { error },
        };
        let may_retry = matches!(
            &result,
            RpcFiOperationResult::Error {
                error: RpcFiOperationError {
                    code: RpcFiErrorCode::Busy,
                    ..
                }
            }
        );
        if !may_retry {
            let mut replacement = self.formation_state.replacement.lock().await;
            if replacement
                .as_ref()
                .is_some_and(|stored| stored.preview_id == preview_id)
            {
                *replacement = None;
            }
        }
        result
    }

    pub(crate) async fn create_pinned(
        &self,
        intent: RpcFiFormationIntent,
        locators: Vec<String>,
    ) -> RpcFiOperationResult {
        let intent = match formation_intent_from_rpc(intent) {
            Ok(intent) => intent,
            Err(error) => return RpcFiOperationResult::Error { error },
        };
        let locators = match parse_fman_locators(locators) {
            Ok(locators) => locators,
            Err(error) => return RpcFiOperationResult::Error { error },
        };
        self.commands
            .request(FiDriverOperation::CreatePinned { intent, locators })
            .await
    }

    pub(crate) async fn pay_and_create(
        &self,
        preview_id: String,
        intent: RpcFiFormationIntent,
        payment_federation_id: String,
        max_total_msats: u64,
    ) -> RpcFiOperationResult {
        let Some(claim) = self.commands.try_claim_operation() else {
            return operation_error_result(
                RpcFiErrorCode::Busy,
                "An FI operation is already in progress",
            );
        };
        let intent = match formation_intent_from_rpc(intent) {
            Ok(intent) => intent,
            Err(error) => return RpcFiOperationResult::Error { error },
        };
        let approval = {
            let mut selection = self.formation_state.selection.lock().await;
            let Some(stored) = selection
                .as_mut()
                .filter(|stored| stored.preview_id == preview_id)
            else {
                return preview_expired_result();
            };
            if let Some(approval) = &stored.approval {
                if approval.max_total_msats() != max_total_msats {
                    return operation_error_result(
                        RpcFiErrorCode::InvalidIntent,
                        "The approved setup spending limit cannot be changed",
                    );
                }
                approval.clone()
            } else {
                let Some(preview) = stored.preview.as_ref() else {
                    unreachable!("stored selection has a preview or an approval");
                };
                if max_total_msats == 0 || max_total_msats < preview.total_advertised_msats() {
                    return RpcFiOperationResult::Error {
                        error: fi_error_to_rpc(&FiError::SelectionReauthorizationRequired(
                            SelectionReauthorizationReason::AdvertisementEstimateExceedsLimit,
                        )),
                    };
                }
                let preview = stored
                    .preview
                    .take()
                    .expect("preview was checked immediately before consumption");
                let approval = match preview.approve(max_total_msats) {
                    Ok(approval) => approval,
                    Err(error) => {
                        return RpcFiOperationResult::Error {
                            error: fi_error_to_rpc(&error),
                        };
                    }
                };
                stored.approval = Some(approval.clone());
                approval
            }
        };
        let commands = self.commands.clone();
        let status_client = self.client.clone();
        let result = self
            .formation_state
            .formation_push
            .dispatch_paid_formation(
                &preview_id,
                move |completion_callback| async move {
                    commands
                        .request_claimed_retaining(
                            FiDriverOperation::PayAndCreate {
                                intent,
                                approval,
                                payment_federation_id: FederationId(payment_federation_id),
                                completion_callback,
                            },
                            claim,
                        )
                        .await
                },
                move || matches!(status_client.status(), FiStatus::Formation(_)),
            )
            .await;
        let formation_started = matches!(self.client.status(), FiStatus::Formation(_));
        let push_setup_may_retry = matches!(
            &result,
            RpcFiOperationResult::Error {
                error: RpcFiOperationError {
                    code: RpcFiErrorCode::PushNotifications,
                    ..
                }
            }
        );
        if (!may_retry_payer(&result) && !push_setup_may_retry) || formation_started {
            let mut selection = self.formation_state.selection.lock().await;
            if selection
                .as_ref()
                .is_some_and(|stored| stored.preview_id == preview_id)
            {
                selection.take();
            }
        }
        result
    }

    pub(crate) async fn authorize_replacement_payments(
        &self,
        authorization_id: String,
    ) -> RpcFiOperationResult {
        let authorization = match PaymentAuthorizationId::try_from_opaque(authorization_id.clone())
        {
            Ok(authorization) => authorization,
            Err(_) => {
                return operation_error_result(
                    RpcFiErrorCode::InvalidIntent,
                    "Replacement payment authorization is invalid",
                );
            }
        };
        let status = self.client.status();
        let is_exact_post_output_action = matches!(
            &status,
            FiStatus::Formation(formation)
                if formation.payment_outputs_started
                    && matches!(
                        &formation.action_required,
                        Some(FormationActionRequired::AuthorizePayments(requirements))
                            if requirements.authorization_id.as_str() == authorization_id
                    )
        );
        if !is_exact_post_output_action {
            return operation_error_result(
                RpcFiErrorCode::InvalidIntent,
                "No exact replacement payment authorization is pending",
            );
        }
        self.commands
            .request(FiDriverOperation::AuthorizePayments {
                authorization_id: authorization,
            })
            .await
    }
}

impl FiCommandSender {
    async fn request(&self, operation: FiDriverOperation) -> RpcFiOperationResult {
        match self.request_raw(operation).await {
            Ok(FiDriverResponse::Formation(result)) => result,
            Ok(FiDriverResponse::Liquidity(_)) => operation_error_result(
                RpcFiErrorCode::CapabilityUnavailable,
                "FI operation driver returned an unexpected response",
            ),
            Err(error) => RpcFiOperationResult::Error { error },
        }
    }

    async fn request_liquidity(
        &self,
        operation: FiDriverOperation,
    ) -> RpcFiLiquidityOperationResult {
        match self.request_raw(operation).await {
            Ok(FiDriverResponse::Liquidity(result)) => result,
            Ok(FiDriverResponse::Formation(_)) => RpcFiLiquidityOperationResult::Error {
                error: operation_error(
                    RpcFiErrorCode::CapabilityUnavailable,
                    "FI operation driver returned an unexpected response",
                ),
            },
            Err(error) => RpcFiLiquidityOperationResult::Error { error },
        }
    }

    async fn request_raw(
        &self,
        operation: FiDriverOperation,
    ) -> Result<FiDriverResponse, RpcFiOperationError> {
        let Some(claim) = self.try_claim_operation() else {
            return Err(operation_error(
                RpcFiErrorCode::Busy,
                "An FI operation is already in progress",
            ));
        };
        self.request_claimed(operation, claim).await
    }

    async fn request_claimed(
        &self,
        operation: FiDriverOperation,
        claim: FiDriverOperationClaim,
    ) -> Result<FiDriverResponse, RpcFiOperationError> {
        let completion = self.request_claimed_inner(operation, claim, false).await?;
        debug_assert!(completion.retained_claim.is_none());
        Ok(completion.response)
    }

    async fn request_claimed_retaining(
        &self,
        operation: FiDriverOperation,
        claim: FiDriverOperationClaim,
    ) -> Result<(FiDriverResponse, FiDriverOperationClaim), RpcFiOperationError> {
        let completion = self.request_claimed_inner(operation, claim, true).await?;
        let retained_claim = completion
            .retained_claim
            .ok_or_else(driver_unavailable_error)?;
        Ok((completion.response, retained_claim))
    }

    async fn request_claimed_inner(
        &self,
        operation: FiDriverOperation,
        claim: FiDriverOperationClaim,
        retain_claim_for_handoff: bool,
    ) -> Result<FiDriverCompletion, RpcFiOperationError> {
        let (response, receiver) = oneshot::channel();
        if self
            .sender
            .send(FiDriverCommand {
                operation,
                response,
                claim,
                retain_claim_for_handoff,
            })
            .await
            .is_err()
        {
            return Err(driver_unavailable_error());
        }
        receiver.await.map_err(|_| driver_unavailable_error())
    }

    fn try_claim_operation(&self) -> Option<FiDriverOperationClaim> {
        self.operation_active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| FiDriverOperationClaim {
                operation_active: self.operation_active.clone(),
            })
    }
}

/// Start the one bridge-owned FI formation and liquidity operation driver.
///
/// The task group owns the actual operation futures. Once a command has been
/// accepted, dropping its RPC response receiver does not cancel the operation.
/// Runtime shutdown cancels and drops the driver future at a durable
/// `fi-client` checkpoint.
pub(crate) fn start_fi_driver(
    runtime: &Runtime,
    client: Arc<BridgeFiClient>,
    federations: Arc<Federations>,
    push_gateway: Result<Arc<BridgeFiPushGateway>, Arc<FiPushError>>,
) -> BridgeFiDriver {
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let liquidity_connector = Arc::new(BridgeLiquidityConnector::default());
    let push_gateway: FormationPushGatewayHandle =
        push_gateway.map(|gateway| gateway as Arc<dyn FormationPushGateway>);
    let formation_state = Arc::new(FormationLocalState::new(push_gateway));
    let driver = BridgeFiDriver {
        commands: FiCommandSender {
            sender,
            operation_active: operation_active.clone(),
        },
        client: client.clone(),
        federations,
        formation_state: formation_state.clone(),
    };

    runtime
        .task_group
        .spawn_cancellable("fi-client::operation-driver", async move {
            run_supervised_driver_loop(
                client,
                liquidity_connector,
                formation_state,
                receiver,
                operation_active,
            )
            .await;
        });

    driver
}

#[apply(async_trait_maybe_send!)]
trait FiDriverBackend: MaybeSend + MaybeSync {
    fn status(&self) -> FiStatus;

    async fn execute(
        &self,
        operation: FiDriverOperation,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiDriverResponse;

    async fn current_liquidity_operation(&self) -> FiResult<Option<LiquidityOperationSnapshot>>;

    async fn resume_liquidity_on_launch(
        &self,
        operation_id: LiquidityOperationId,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiResult<LiquidityOperationSnapshot>;

    async fn sleep(&self, delay: Duration);
}

#[apply(async_trait_maybe_send!)]
impl FiDriverBackend for BridgeFiClient {
    fn status(&self) -> FiStatus {
        FiClient::status(self)
    }

    async fn execute(
        &self,
        operation: FiDriverOperation,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiDriverResponse {
        match operation {
            FiDriverOperation::CreatePinned { intent, locators } => {
                FiDriverResponse::Formation(operation_result(
                    self.create_with_pinned_fmans(intent, locators, FormationRunOptions::default())
                        .await,
                ))
            }
            FiDriverOperation::PayAndCreate {
                intent,
                approval,
                payment_federation_id,
                completion_callback,
            } => FiDriverResponse::Formation(operation_result(
                self.pay_and_create_with_callback(
                    intent,
                    approval,
                    payment_federation_id,
                    completion_callback,
                    FormationRunOptions::default(),
                )
                .await,
            )),
            FiDriverOperation::ApplyReplacements { approval } => {
                FiDriverResponse::Formation(operation_result(
                    self.apply_fman_replacements(approval, FormationRunOptions::default())
                        .await,
                ))
            }
            FiDriverOperation::Abandon => FiDriverResponse::Formation(operation_result(
                self.abandon_formation(FormationRunOptions::default()).await,
            )),
            FiDriverOperation::Resume => {
                FiDriverResponse::Formation(operation_result(self.resume().await))
            }
            FiDriverOperation::AuthorizePayments { authorization_id } => {
                FiDriverResponse::Formation(operation_result(
                    self.authorize_payments(authorization_id, FormationRunOptions::default())
                        .await,
                ))
            }
            FiDriverOperation::StartLiquidity {
                formation_id,
                provider_pubkey,
                intent,
            } => FiDriverResponse::Liquidity(liquidity_operation_result(
                self.start_liquidity(&formation_id, &provider_pubkey, intent, liquidity_connector)
                    .await,
            )),
            FiDriverOperation::ResumeLiquidity { operation_id } => {
                FiDriverResponse::Liquidity(liquidity_operation_result(
                    self.resume_liquidity(&operation_id, liquidity_connector)
                        .await,
                ))
            }
            FiDriverOperation::UpdateMetadata { update } => {
                FiDriverResponse::Formation(operation_result(
                    self.update_federation_metadata(update, MaintenanceRunOptions::default())
                        .await,
                ))
            }
            FiDriverOperation::SetGuardianFee { send_ppm } => {
                FiDriverResponse::Formation(operation_result(
                    self.propose_guardian_fees(send_ppm, FormationRunOptions::default())
                        .await,
                ))
            }
        }
    }

    async fn current_liquidity_operation(&self) -> FiResult<Option<LiquidityOperationSnapshot>> {
        FiClient::current_liquidity_operation(self).await
    }

    async fn resume_liquidity_on_launch(
        &self,
        operation_id: LiquidityOperationId,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiResult<LiquidityOperationSnapshot> {
        self.resume_liquidity(&operation_id, liquidity_connector)
            .await
    }

    async fn sleep(&self, delay: Duration) {
        fedimint_core::task::sleep(delay).await;
    }
}

async fn run_supervised_driver_loop<B: FiDriverBackend + 'static>(
    backend: Arc<B>,
    liquidity_connector: Arc<BridgeLiquidityConnector>,
    formation_state: Arc<FormationLocalState>,
    mut receiver: mpsc::Receiver<FiDriverCommand>,
    operation_active: Arc<AtomicBool>,
) {
    // Reconcile an active durable formation immediately on launch. Subsequent
    // failures use the product backoff; commands preempt only the sleep, never
    // an in-flight wallet/network effect.
    let mut formation_retry_delay = Duration::ZERO;
    let mut liquidity_recovery = LiquidityLaunchRecovery::new();
    loop {
        let command = if should_auto_resume(&backend.status()) {
            tokio::select! {
                biased;
                command = receiver.recv() => command,
                () = backend.sleep(formation_retry_delay) => {
                    let Some(claim) = operation_active
                        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                        .ok()
                        .map(|_| FiDriverOperationClaim {
                            operation_active: operation_active.clone(),
                        })
                    else {
                        continue;
                    };
                    let before = backend.status();
                    let result = backend
                        .execute(FiDriverOperation::Resume, &liquidity_connector)
                        .await;
                    let after = backend.status();
                    drop(claim);
                    if let FiDriverResponse::Formation(RpcFiOperationResult::Error { error }) =
                        &result
                    {
                        tracing::debug!(
                            error_code = ?error.code,
                            "FI formation reconciliation will retry"
                        );
                    }
                    formation_retry_delay =
                        next_retry_delay(formation_retry_delay, before != after);
                    continue;
                }
            }
        } else if liquidity_recovery.has_work() {
            tokio::select! {
                biased;
                command = receiver.recv() => command,
                () = backend.sleep(liquidity_recovery.next_delay()) => {
                    let current_backend = backend.clone();
                    let resume_backend = backend.clone();
                    let resume_connector = liquidity_connector.clone();
                    reconcile_one_liquidity_step(
                        &mut liquidity_recovery,
                        &operation_active,
                        || async move {
                            current_backend.current_liquidity_operation().await
                        },
                        |operation_id| async move {
                            resume_backend
                                .resume_liquidity_on_launch(
                                    operation_id,
                                    resume_connector.as_ref(),
                                )
                                .await
                        },
                    )
                    .await;
                    continue;
                }
            }
        } else {
            receiver.recv().await
        };

        let Some(command) = command else {
            return;
        };
        let FiDriverCommand {
            operation,
            response,
            claim,
            retain_claim_for_handoff,
        } = command;
        let rearm_liquidity = matches!(
            &operation,
            FiDriverOperation::StartLiquidity { .. } | FiDriverOperation::ResumeLiquidity { .. }
        );
        let invalidate_abandoned_formation = matches!(&operation, FiDriverOperation::Abandon);
        let before = backend.status();
        let result = backend.execute(operation, &liquidity_connector).await;
        let after = backend.status();
        let abandonment_is_durable = driver_response_is_success(&result)
            || (matches!(&before, FiStatus::Formation(_)) && matches!(&after, FiStatus::Idle));
        if invalidate_abandoned_formation && abandonment_is_durable {
            formation_state.invalidate_after_abandon().await;
        }
        if rearm_liquidity {
            liquidity_recovery.rearm_after_mutation();
        }
        formation_retry_delay = if should_auto_resume(&after) {
            next_retry_delay(
                formation_retry_delay,
                before != after || driver_response_is_success(&result),
            )
        } else {
            Duration::ZERO
        };
        let retained_claim = if retain_claim_for_handoff {
            Some(claim)
        } else {
            drop(claim);
            None
        };
        let _ = response.send(FiDriverCompletion {
            response: result,
            retained_claim,
        });
    }
}

fn should_auto_resume(status: &FiStatus) -> bool {
    matches!(
        status,
        FiStatus::Formation(formation)
            if (formation.phase == FormationPhase::Formed
                && formation.freshness == FormationFreshness::Unsynced)
                || (formation.phase != FormationPhase::Formed
                    && formation.action_required.is_none()
                    && formation.last_error
                        != Some(FiErrorCode::SelectionReauthorizationRequired))
    )
}

fn should_resume_liquidity_on_launch(snapshot: &LiquidityOperationSnapshot) -> bool {
    match snapshot.phase {
        LiquidityOperationPhase::Prepared => true,
        LiquidityOperationPhase::Rejected => false,
        LiquidityOperationPhase::Accepted => {
            let requires_operator = snapshot
                .item_statuses
                .iter()
                .any(|item| item.status == ItemAllocationStatus::ActionRequired);
            let provider_work_is_live = snapshot.item_statuses.is_empty()
                || snapshot.item_statuses.iter().any(|item| {
                    matches!(
                        item.status,
                        ItemAllocationStatus::Pending | ItemAllocationStatus::Running
                    )
                });
            let gateway_registration_is_pending = snapshot.amounts.gateway_min_amount.0 > 0
                && !snapshot.gateway_view_verified
                && snapshot.item_statuses.iter().any(|item| {
                    matches!(&item.target, AllocationItemTarget::Gateway { .. })
                        && item.status == ItemAllocationStatus::Completed
                });
            (!requires_operator && provider_work_is_live) || gateway_registration_is_pending
        }
    }
}

fn next_retry_delay(previous: Duration, progress: bool) -> Duration {
    if progress || previous.is_zero() {
        FI_RESUME_INITIAL_BACKOFF
    } else {
        previous
            .checked_mul(2)
            .unwrap_or(FI_RESUME_MAX_BACKOFF)
            .min(FI_RESUME_MAX_BACKOFF)
    }
}

#[cfg(test)]
async fn run_driver_loop<F, Fut>(mut receiver: mpsc::Receiver<FiDriverCommand>, mut execute: F)
where
    F: FnMut(FiDriverOperation) -> Fut,
    Fut: Future<Output = FiResult<()>>,
{
    while let Some(command) = receiver.recv().await {
        let FiDriverCommand {
            operation,
            response,
            claim,
            retain_claim_for_handoff,
        } = command;
        let result = FiDriverResponse::Formation(operation_result(execute(operation).await));
        let retained_claim = if retain_claim_for_handoff {
            Some(claim)
        } else {
            // Most commands release before waking the caller so a command
            // submitted in response cannot spuriously see Busy. Paid callback
            // handoff is the narrow exception and returns this claim.
            drop(claim);
            None
        };
        // The operation belongs to this driver after receipt. An RPC caller
        // disappearing only discards its response, never the operation.
        let _ = response.send(FiDriverCompletion {
            response: result,
            retained_claim,
        });
    }
}

fn driver_unavailable_error() -> RpcFiOperationError {
    operation_error(
        RpcFiErrorCode::CapabilityUnavailable,
        "FI operation driver is unavailable",
    )
}

fn operation_error_result(
    code: RpcFiErrorCode,
    message: impl Into<String>,
) -> RpcFiOperationResult {
    RpcFiOperationResult::Error {
        error: operation_error(code, message),
    }
}

fn preview_expired_result() -> RpcFiOperationResult {
    RpcFiOperationResult::Error {
        error: fi_error_to_rpc(&FiError::SelectionReauthorizationRequired(
            SelectionReauthorizationReason::PreviewExpired,
        )),
    }
}

fn operation_error(code: RpcFiErrorCode, message: impl Into<String>) -> RpcFiOperationError {
    RpcFiOperationError {
        code,
        message: message.into(),
        detail: None,
    }
}

fn driver_response_is_success(response: &FiDriverResponse) -> bool {
    matches!(
        response,
        FiDriverResponse::Formation(RpcFiOperationResult::Success)
            | FiDriverResponse::Liquidity(RpcFiLiquidityOperationResult::Operation { .. })
    )
}

fn operation_result(result: FiResult<()>) -> RpcFiOperationResult {
    match result {
        Ok(()) => RpcFiOperationResult::Success,
        Err(error) => RpcFiOperationResult::Error {
            error: fi_error_to_rpc(&error),
        },
    }
}

pub fn parse_fman_locators(locators: Vec<String>) -> Result<Vec<Locator>, RpcFiOperationError> {
    locators
        .into_iter()
        .enumerate()
        .map(|(index, locator)| {
            Locator::parse(&locator).map_err(|_| RpcFiOperationError {
                code: RpcFiErrorCode::InvalidFleetManagers,
                message: format!("Fleet Manager locator {index} is invalid"),
                detail: None,
            })
        })
        .collect()
}

pub fn formation_intent_from_rpc(
    intent: RpcFiFormationIntent,
) -> Result<FormationIntent, RpcFiOperationError> {
    let fedimintd_version = intent
        .fedimintd_version
        .parse()
        .map_err(|_| RpcFiOperationError {
            code: RpcFiErrorCode::InvalidIntent,
            message: "fedimintd version is invalid".to_owned(),
            detail: None,
        })?;

    FormationIntent::new(
        intent.federation_name.map(FederationName),
        FederationSize(intent.federation_size),
        PlanPreference::InfiniteBestEffort,
        fedimintd_version,
    )
    .map_err(|error| fi_error_to_rpc(&error))
}

fn metadata_update_from_rpc(
    update: RpcFiFederationMetadataUpdate,
) -> Result<FederationMetadataUpdate, RpcFiOperationError> {
    let update = match update {
        RpcFiFederationMetadataUpdate::Name { value } => FederationMetadataUpdate::name(value),
        RpcFiFederationMetadataUpdate::IconUrl { value } => {
            FederationMetadataUpdate::icon_url(value)
        }
        RpcFiFederationMetadataUpdate::WelcomeMessage { value } => {
            FederationMetadataUpdate::welcome_message(value)
        }
        RpcFiFederationMetadataUpdate::TermsOfService => {
            Ok(FederationMetadataUpdate::TermsOfService)
        }
    };
    update.map_err(|error| operation_error(RpcFiErrorCode::InvalidIntent, error.to_string()))
}

fn guardian_fee_from_rpc(value: u32) -> Result<GuardianFeePpm, RpcFiOperationError> {
    if value > MAX_GUARDIAN_FEE_PPM {
        return Err(operation_error(
            RpcFiErrorCode::InvalidIntent,
            format!("guardian fee ppm must not exceed {MAX_GUARDIAN_FEE_PPM}"),
        ));
    }
    GuardianFeePpm::try_from(value)
        .map_err(|error| operation_error(RpcFiErrorCode::InvalidIntent, error.to_string()))
}

fn formed_federation_id(status: &FiStatus) -> Result<String, RpcFiOperationError> {
    let FiStatus::Formation(formation) = status else {
        return Err(operation_error(
            RpcFiErrorCode::NoActiveFormation,
            "No created FI federation is available for maintenance",
        ));
    };
    if formation.phase != FormationPhase::Formed || formation.freshness != FormationFreshness::Fresh
    {
        return Err(operation_error(
            RpcFiErrorCode::InvalidIntent,
            "Federation maintenance is available only after creation",
        ));
    }
    let invite = formation.invite_code.as_ref().ok_or_else(|| {
        operation_error(
            RpcFiErrorCode::Storage,
            "The created federation has no persisted invite",
        )
    })?;
    let invite = FedimintInviteCode::from_str(&invite.0).map_err(|_| {
        operation_error(
            RpcFiErrorCode::Storage,
            "The created federation invite is invalid",
        )
    })?;
    Ok(invite.federation_id().to_string())
}

fn selection_request_from_rpc(
    request: RpcFiSelectionPreviewRequest,
) -> Result<FmanSelectionRequest, RpcFiOperationError> {
    let fedimintd_version = request
        .fedimintd_version
        .parse()
        .map_err(|_| RpcFiOperationError {
            code: RpcFiErrorCode::InvalidIntent,
            message: "fedimintd version is invalid".to_owned(),
            detail: None,
        })?;
    let plan = match request.plan {
        RpcFiPlanPreference::InfiniteBestEffort => PlanPreference::InfiniteBestEffort,
    };
    FmanSelectionRequest::new(
        FederationSize(request.federation_size),
        fedimintd_version,
        plan,
    )
    .map_err(|error| fi_error_to_rpc(&error))
}

fn selection_preview_to_rpc(
    preview_id: &str,
    preview: &FmanSelectionPreview,
) -> RpcFiSelectionPreview {
    RpcFiSelectionPreview {
        preview_id: preview_id.to_owned(),
        selected: u16::try_from(preview.selected()).expect("selected count fits u16"),
        total_advertised_msats: RpcFiMsats::from(preview.total_advertised_msats()),
        seen: u32::try_from(preview.seen()).unwrap_or(u32::MAX),
        eligible: u32::try_from(preview.eligible()).unwrap_or(u32::MAX),
        valid_until: preview.valid_until().0,
        seats: preview
            .seats()
            .iter()
            .map(|seat| RpcFiSelectionPreviewSeat {
                fman_id: seat.candidate().fman_id().to_string(),
                fman_name: seat.candidate().fman_name().to_string(),
                advertised_price_msats: RpcFiMsats::from(seat.advertised_price_msats()),
                provenance: seat.provenance().code().to_owned(),
            })
            .collect(),
    }
}

fn guardian_replacement_requirements_to_rpc(
    requirements: &GuardianReplacementRequirements,
) -> RpcFiGuardianReplacementRequirements {
    RpcFiGuardianReplacementRequirements {
        replacement_id: requirements.replacement_id.as_str().to_owned(),
        seats: requirements
            .seats
            .iter()
            .map(|seat| RpcFiGuardianReplacementSeat {
                index: seat.index,
                previous_fman_id: seat.previous_fman_id.map(|id| id.to_string()),
                previous_fman_name: seat.previous_fman_name().map(|name| name.to_string()),
                previous_quote_id: hex::encode(seat.previous_quote_id.0),
                previous_locator: seat.previous_locator.to_json(),
            })
            .collect(),
    }
}

fn replacement_preview_to_rpc(
    preview_id: &str,
    preview: &FmanReplacementPreview,
) -> RpcFiReplacementPreview {
    assert_eq!(
        preview.requirements().seats.len(),
        preview.seats().len(),
        "Manifold replacement preview keeps one verified candidate per durable row"
    );
    RpcFiReplacementPreview {
        preview_id: preview_id.to_owned(),
        requirements: guardian_replacement_requirements_to_rpc(preview.requirements()),
        total_advertised_msats: RpcFiMsats::from(preview.total_advertised_msats()),
        seats: preview
            .requirements()
            .seats
            .iter()
            .zip(preview.seats())
            .map(|(requirement, seat)| RpcFiReplacementPreviewSeat {
                index: requirement.index,
                fman_id: seat.candidate().fman_id().to_string(),
                fman_name: seat.candidate().fman_name().to_string(),
                advertised_price_msats: RpcFiMsats::from(seat.advertised_price_msats()),
                provenance: seat.provenance().code().to_owned(),
            })
            .collect(),
    }
}

fn canonical_liquidity_provider_pubkey(value: &str) -> Result<Pubkey, RpcFiOperationError> {
    value
        .parse::<PublicKey>()
        .map(|pubkey| Pubkey(pubkey.to_string()))
        .map_err(|_| {
            operation_error(
                RpcFiErrorCode::InvalidIntent,
                "The liquidity provider identity is invalid",
            )
        })
}

fn liquidity_intent_from_rpc(
    intent: RpcFiLiquidityRequestIntent,
) -> Result<LiquidityRequestIntent, RpcFiOperationError> {
    // fi-client no longer accepts a per-request provider allowlist: provider
    // trust is admitted by the Manifold registry's trust binding. Fail closed
    // rather than silently ignoring a caller-supplied restriction.
    if !intent.approved_provider_pubkeys.is_empty() {
        return Err(RpcFiOperationError {
            code: RpcFiErrorCode::InvalidIntent,
            message: "provider allowlists are no longer supported; provider trust is \
                      enforced by the Manifold registry"
                .to_owned(),
            detail: None,
        });
    }
    Ok(LiquidityRequestIntent {
        amounts: LiquidityAmountBounds {
            gateway_min_amount: Sats(intent.amounts.gateway_min_sats),
            gateway_max_amount: intent.amounts.gateway_max_sats.map(Sats),
            stability_min_amount: Sats(intent.amounts.stability_min_sats),
            stability_max_amount: intent.amounts.stability_max_sats.map(Sats),
        },
    })
}

fn liquidity_network_from_rpc(network: RpcFiLiquidityNetwork) -> BitcoinNetwork {
    match network {
        RpcFiLiquidityNetwork::Bitcoin => BitcoinNetwork::Bitcoin,
        RpcFiLiquidityNetwork::Testnet => BitcoinNetwork::Testnet,
        RpcFiLiquidityNetwork::Signet => BitcoinNetwork::Signet,
        RpcFiLiquidityNetwork::Regtest => BitcoinNetwork::Regtest,
    }
}

fn liquidity_network_to_rpc(network: BitcoinNetwork) -> RpcFiLiquidityNetwork {
    match network {
        BitcoinNetwork::Bitcoin => RpcFiLiquidityNetwork::Bitcoin,
        BitcoinNetwork::Testnet => RpcFiLiquidityNetwork::Testnet,
        BitcoinNetwork::Signet => RpcFiLiquidityNetwork::Signet,
        BitcoinNetwork::Regtest => RpcFiLiquidityNetwork::Regtest,
    }
}

fn liquidity_source_to_rpc(source: SourceType) -> RpcFiLiquiditySource {
    match source {
        SourceType::Gateway => RpcFiLiquiditySource::Gateway,
        SourceType::StabilityPool => RpcFiLiquiditySource::StabilityPool,
    }
}

fn liquidity_discovery_to_rpc(discovery: LiquidityDiscovery) -> RpcFiLiquidityDiscoveryResult {
    let providers = discovery
        .providers
        .into_iter()
        .map(|provider| {
            let advertisement = provider.advertisement();
            RpcFiLiquidityProvider {
                provider_pubkey: provider.provider_pubkey().0.clone(),
                supported_sources: advertisement
                    .supported_sources
                    .iter()
                    .copied()
                    .map(liquidity_source_to_rpc)
                    .collect(),
                supported_networks: advertisement
                    .policy
                    .supported_networks
                    .iter()
                    .copied()
                    .map(liquidity_network_to_rpc)
                    .collect(),
                display_name: advertisement
                    .display
                    .as_ref()
                    .and_then(|display| display.name.clone()),
                website: advertisement
                    .display
                    .as_ref()
                    .and_then(|display| display.website.as_ref().map(|url| url.0.clone())),
                contact: advertisement
                    .display
                    .as_ref()
                    .and_then(|display| display.contact.clone()),
                issued_at: advertisement.issued_at.0,
                expires_at: advertisement.expires_at.0,
            }
        })
        .collect();
    let rejected = discovery
        .rejected
        .into_iter()
        .map(
            |(provider_pubkey, rejection)| RpcFiLiquidityProviderRejection {
                provider_pubkey: provider_pubkey.map(|pubkey| pubkey.0),
                code: rejection.code().to_owned(),
            },
        )
        .collect();
    RpcFiLiquidityDiscoveryResult::Discovery {
        providers,
        rejected,
    }
}

fn liquidity_amounts_to_rpc(amounts: LiquidityAmountBounds) -> RpcFiLiquidityAmountBounds {
    RpcFiLiquidityAmountBounds {
        gateway_min_sats: amounts.gateway_min_amount.0,
        gateway_max_sats: amounts.gateway_max_amount.map(|amount| amount.0),
        stability_min_sats: amounts.stability_min_amount.0,
        stability_max_sats: amounts.stability_max_amount.map(|amount| amount.0),
    }
}

fn liquidity_item_phase_to_rpc(phase: ItemAllocationStatus) -> RpcFiLiquidityItemPhase {
    match phase {
        ItemAllocationStatus::Pending => RpcFiLiquidityItemPhase::Pending,
        ItemAllocationStatus::Running => RpcFiLiquidityItemPhase::Running,
        ItemAllocationStatus::ActionRequired => RpcFiLiquidityItemPhase::ActionRequired,
        ItemAllocationStatus::Completed => RpcFiLiquidityItemPhase::Completed,
        ItemAllocationStatus::Failed => RpcFiLiquidityItemPhase::Failed,
        ItemAllocationStatus::Cancelled => RpcFiLiquidityItemPhase::Cancelled,
    }
}

fn liquidity_item_to_rpc(item: AllocationItemStatus) -> RpcFiLiquidityItemStatus {
    let target = match item.target {
        AllocationItemTarget::Gateway {
            item_id,
            gateway_id,
            gateway_name,
            amount,
        } => RpcFiLiquidityItemTarget::Gateway {
            item_id: item_id.0,
            gateway_id: gateway_id.0,
            gateway_name: gateway_name.0,
            amount_sats: amount.0,
        },
        AllocationItemTarget::StabilityPool { item_id, amount } => {
            RpcFiLiquidityItemTarget::StabilityPool {
                item_id: item_id.0,
                amount_sats: amount.0,
            }
        }
    };
    let completion_evidence = item.completion_evidence.map(|evidence| match evidence {
        CompletionEvidence::Gateway(evidence) => RpcFiLiquidityCompletionEvidence::Gateway {
            gateway_id: evidence.gateway_id.0,
            fulfilled_sats: evidence.fulfilled_amount.0,
            observed_gateway_balance_sats: evidence.observed_gateway_balance.0,
            observed_at: evidence.observed_at.0,
            withdrawal_txid: evidence.withdrawal_txid,
            wallet_operation_id: evidence
                .wallet_operation_id
                .map(|operation_id| operation_id.0),
        },
        CompletionEvidence::StabilityPool(evidence) => {
            RpcFiLiquidityCompletionEvidence::StabilityPool {
                fulfilled_sats: evidence.fulfilled_amount.0,
                observed_provided_sats: evidence.observed_provided_amount.0,
                observed_at: evidence.observed_at.0,
                peg_in_operation_id: evidence.peg_in_operation_id,
                stability_pool_deposit_operation_id: evidence.stability_pool_deposit_operation_id,
            }
        }
    });
    RpcFiLiquidityItemStatus {
        target,
        phase: liquidity_item_phase_to_rpc(item.status),
        fulfilled_sats: item.fulfilled_amount.map(|amount| amount.0),
        completion_evidence,
        failure_code: item.failure.map(|failure| failure.code.to_string()),
        updated_at: item.updated_at.0,
    }
}

fn liquidity_operation_to_rpc(snapshot: LiquidityOperationSnapshot) -> RpcFiLiquidityOperation {
    RpcFiLiquidityOperation {
        operation_id: snapshot.operation_id.0,
        formation_id: snapshot.formation_id.0,
        provider_pubkey: snapshot.provider_pubkey.0,
        endpoint_hint: snapshot.endpoint_hint.0,
        details_payload_hash: hex::encode(snapshot.details_payload_hash.0),
        amounts: liquidity_amounts_to_rpc(snapshot.amounts),
        phase: match snapshot.phase {
            LiquidityOperationPhase::Prepared => RpcFiLiquidityOperationPhase::Prepared,
            LiquidityOperationPhase::Accepted => RpcFiLiquidityOperationPhase::Accepted,
            LiquidityOperationPhase::Rejected => RpcFiLiquidityOperationPhase::Rejected,
        },
        item_statuses: snapshot
            .item_statuses
            .into_iter()
            .map(liquidity_item_to_rpc)
            .collect(),
        rejection_code: snapshot.rejection_code,
        gateway_view_verified: snapshot.gateway_view_verified,
    }
}

fn liquidity_operation_result(
    result: FiResult<LiquidityOperationSnapshot>,
) -> RpcFiLiquidityOperationResult {
    match result {
        Ok(snapshot) => RpcFiLiquidityOperationResult::Operation {
            operation: liquidity_operation_to_rpc(snapshot),
        },
        Err(error) => RpcFiLiquidityOperationResult::Error {
            error: fi_error_to_rpc(&error),
        },
    }
}

fn liquidity_operation_page_to_rpc(
    page: LiquidityOperationPage,
) -> RpcFiLiquidityOperationPageResult {
    RpcFiLiquidityOperationPageResult::Page {
        page: RpcLiquidityOperationPage {
            operations: page
                .operations
                .into_iter()
                .map(liquidity_operation_to_rpc)
                .collect(),
            next_after: page.next_after.map(|operation_id| operation_id.0),
        },
    }
}

pub fn fi_status_to_rpc(status: FiStatus) -> RpcFiStatus {
    match status {
        FiStatus::Idle => RpcFiStatus::Idle,
        FiStatus::Formation(formation) => RpcFiStatus::Formation {
            formation: Box::new(formation_snapshot_to_rpc(formation)),
        },
    }
}

/// Convert the FI watch channel into the typed subscription contract.
///
/// `WatchStream` emits the receiver's current value first. An FI
/// initialization failure is likewise a first-class one-item stream value,
/// rather than a rejected registration that leaves the caller waiting.
pub fn fi_client_status_stream(
    receiver: Result<watch::Receiver<FiStatus>, RpcFiOperationError>,
) -> BoxStream<'static, RpcFiClientStatus> {
    match receiver {
        Ok(receiver) => WatchStream::new(receiver)
            .map(|status| RpcFiClientStatus::Ready {
                status: fi_status_to_rpc(status),
            })
            .boxed(),
        Err(error) => stream::once(async move { RpcFiClientStatus::Failed { error } }).boxed(),
    }
}

pub fn formation_snapshot_to_rpc(snapshot: FormationSnapshot) -> RpcFiFormationSnapshot {
    let milestones = formation_milestones(&snapshot);
    let formed_needs_reconciliation = snapshot.phase == FormationPhase::Formed
        && snapshot.freshness == FormationFreshness::Unsynced;
    let selected_post_output = snapshot.payment_outputs_started;
    RpcFiFormationSnapshot {
        formation_id: snapshot.formation_id.0,
        phase: match snapshot.phase {
            FormationPhase::Preparing => RpcFiFormationPhase::Preparing,
            FormationPhase::AwaitingPaymentReadiness => {
                RpcFiFormationPhase::AwaitingPaymentReadiness
            }
            FormationPhase::AcquiringSeats => RpcFiFormationPhase::AcquiringSeats,
            FormationPhase::PreparingDkg => RpcFiFormationPhase::PreparingDkg,
            FormationPhase::DkgUnderway => RpcFiFormationPhase::DkgUnderway,
            FormationPhase::PublishingSeatBindings => RpcFiFormationPhase::PublishingSeatBindings,
            FormationPhase::Formed if formed_needs_reconciliation => {
                RpcFiFormationPhase::PublishingSeatBindings
            }
            FormationPhase::Formed => RpcFiFormationPhase::Formed,
        },
        intent: resolved_formation_intent_to_rpc(snapshot.intent),
        seats: snapshot
            .seats
            .into_iter()
            .map(|seat| RpcFiSeatProgress {
                index: seat.index,
                fman_id: seat.fman_id.map(|id| id.to_string()),
                fman_name: seat.fman_name().map(|name| name.to_string()),
                locator: seat.locator.to_json(),
                seat_id: seat.seat_id.map(|seat_id| seat_id.to_string()),
                guardian_code: seat.guardian_code.map(|code| code.0),
                phase: match seat.phase {
                    SeatPhase::Selected => RpcFiSeatPhase::Selected,
                    SeatPhase::ReplacementRequired => RpcFiSeatPhase::ReplacementRequired,
                    SeatPhase::QuoteReady => RpcFiSeatPhase::QuoteReady,
                    SeatPhase::Acquiring => RpcFiSeatPhase::Acquiring,
                    SeatPhase::Created => RpcFiSeatPhase::Created,
                    SeatPhase::GuardianCodeReady => RpcFiSeatPhase::GuardianCodeReady,
                    SeatPhase::DkgUnderway => RpcFiSeatPhase::DkgUnderway,
                    SeatPhase::Running => RpcFiSeatPhase::Running,
                },
                freshness: formation_freshness_to_rpc(seat.freshness),
            })
            .collect(),
        freshness: formation_freshness_to_rpc(snapshot.freshness),
        action_required: snapshot.action_required.map(|action| match action {
            FormationActionRequired::AuthorizePayments(requirements) => {
                let requirements = RpcFiPaymentRequirements {
                    authorization_id: requirements.authorization_id.as_str().to_owned(),
                    total_msats: RpcFiMsats::from(requirements.total_msats),
                    max_total_msats: requirements.max_total_msats.map(RpcFiMsats::from),
                    seats: requirements
                        .seats
                        .into_iter()
                        .map(|requirement| RpcFiSeatPaymentRequirement {
                            index: requirement.index,
                            fman_id: requirement.fman_id.map(|id| id.to_string()),
                            fman_name: requirement.fman_name().map(|name| name.to_string()),
                            quote_id: hex::encode(requirement.quote_id.0),
                            payment_federation_id: requirement.payment_federation_id.0,
                            amount_msats: RpcFiMsats::from(requirement.amount_msats),
                        })
                        .collect(),
                };
                if selected_post_output {
                    RpcFiFormationActionRequired::AuthorizeReplacementPayments { requirements }
                } else {
                    RpcFiFormationActionRequired::AuthorizePayments { requirements }
                }
            }
            FormationActionRequired::ReplaceGuardians(requirements) => {
                RpcFiFormationActionRequired::ReplaceGuardians {
                    requirements: guardian_replacement_requirements_to_rpc(&requirements),
                }
            }
        }),
        payment_outputs_started: snapshot.payment_outputs_started,
        milestones,
        invite_code: snapshot.invite_code.map(|code| code.0),
        last_error: snapshot.last_error.map(fi_error_code_to_rpc),
    }
}

fn resolved_formation_intent_to_rpc(
    intent: ResolvedFormationIntent,
) -> RpcFiResolvedFormationIntent {
    RpcFiResolvedFormationIntent {
        federation_name: intent.federation_name.0,
        federation_size: intent.federation_size.0,
        // Formation is zero-fee by upstream construction: guardian fees are a
        // post-formation maintenance operation, and fi-client no longer
        // carries a per-intent fee. The field stays for binding stability.
        guardian_fee_ppm: 0,
        plan: match intent.plan {
            PlanPreference::InfiniteBestEffort => RpcFiPlanPreference::InfiniteBestEffort,
        },
        fedimintd_version: intent.fedimintd_version.to_string(),
        max_total_msats: intent.max_total_msats.map(RpcFiMsats::from),
    }
}

fn formation_milestones(snapshot: &FormationSnapshot) -> RpcFiFormationMilestones {
    let ecash_sent = !snapshot.seats.is_empty()
        && snapshot.seats.iter().all(|seat| {
            matches!(
                seat.phase,
                SeatPhase::Created
                    | SeatPhase::GuardianCodeReady
                    | SeatPhase::DkgUnderway
                    | SeatPhase::Running
            )
        });
    let guardians_confirmed = !snapshot.seats.is_empty()
        && snapshot.seats.iter().all(|seat| {
            matches!(
                seat.phase,
                SeatPhase::GuardianCodeReady | SeatPhase::DkgUnderway | SeatPhase::Running
            )
        });
    RpcFiFormationMilestones {
        ecash_sent,
        guardians_confirmed,
        wallet_service_created: snapshot.phase == FormationPhase::Formed
            && snapshot.freshness == FormationFreshness::Fresh,
    }
}

fn formation_freshness_to_rpc(freshness: FormationFreshness) -> RpcFiFormationFreshness {
    match freshness {
        FormationFreshness::Fresh => RpcFiFormationFreshness::Fresh,
        FormationFreshness::Unsynced => RpcFiFormationFreshness::Unsynced,
    }
}

pub(crate) fn fi_error_to_rpc(error: &FiError) -> RpcFiOperationError {
    let code = fi_error_code_to_rpc(error.code());
    RpcFiOperationError {
        code,
        message: fi_error_message(code).to_owned(),
        detail: fi_error_detail_to_rpc(error),
    }
}

pub(crate) fn fi_push_error_to_rpc(error: &FiPushError) -> RpcFiOperationError {
    RpcFiOperationError {
        code: RpcFiErrorCode::PushNotifications,
        message: error.to_string(),
        detail: None,
    }
}

fn fi_error_detail_to_rpc(error: &FiError) -> Option<RpcFiOperationErrorDetail> {
    match error {
        FiError::InsufficientFmanSeats {
            requested,
            selected,
            seen,
            eligible,
        } => Some(RpcFiOperationErrorDetail::InsufficientFmanSeats {
            requested: *requested,
            selected: *selected,
            seen: u32::try_from(*seen).unwrap_or(u32::MAX),
            eligible: u32::try_from(*eligible).unwrap_or(u32::MAX),
        }),
        FiError::SelectionReauthorizationRequired(reason) => Some(
            RpcFiOperationErrorDetail::SelectionReauthorizationRequired {
                reason: selection_reauthorization_reason_to_rpc(*reason),
            },
        ),
        FiError::AbandonUnavailable(reason) => {
            Some(RpcFiOperationErrorDetail::AbandonUnavailable {
                reason: match reason {
                    AbandonUnavailableReason::PaymentOutputsStarted => {
                        RpcFiAbandonUnavailableReason::PaymentOutputsStarted
                    }
                    AbandonUnavailableReason::AlreadyFormed => {
                        RpcFiAbandonUnavailableReason::AlreadyFormed
                    }
                },
            })
        }
        _ => None,
    }
}

fn selection_reauthorization_reason_to_rpc(
    reason: SelectionReauthorizationReason,
) -> RpcFiSelectionReauthorizationReason {
    match reason {
        SelectionReauthorizationReason::PreviewExpired => {
            RpcFiSelectionReauthorizationReason::PreviewExpired
        }
        SelectionReauthorizationReason::AdvertisementEstimateExceedsLimit => {
            RpcFiSelectionReauthorizationReason::AdvertisementEstimateExceedsLimit
        }
        SelectionReauthorizationReason::SelectedFmanUnavailable => {
            RpcFiSelectionReauthorizationReason::SelectedFmanUnavailable
        }
        SelectionReauthorizationReason::QuoteTotalExceedsLimit => {
            RpcFiSelectionReauthorizationReason::QuoteTotalExceedsLimit
        }
        SelectionReauthorizationReason::QuoteTermsChanged => {
            RpcFiSelectionReauthorizationReason::QuoteTermsChanged
        }
        SelectionReauthorizationReason::SelectedPayerUnavailable => {
            RpcFiSelectionReauthorizationReason::SelectedPayerUnavailable
        }
        SelectionReauthorizationReason::PaymentFederationRequired => {
            RpcFiSelectionReauthorizationReason::PaymentFederationRequired
        }
        SelectionReauthorizationReason::SelectedPayerInsufficientFunds => {
            RpcFiSelectionReauthorizationReason::SelectedPayerInsufficientFunds
        }
        SelectionReauthorizationReason::VerifierEnvironmentChanged => {
            RpcFiSelectionReauthorizationReason::VerifierEnvironmentChanged
        }
    }
}

fn fi_error_message(code: RpcFiErrorCode) -> &'static str {
    match code {
        RpcFiErrorCode::InvalidIntent => "The federation formation request is invalid",
        RpcFiErrorCode::InvalidOptions => "The FI operation options are invalid",
        RpcFiErrorCode::Storage => "FI storage is unavailable",
        RpcFiErrorCode::Identity => "FI identity is unavailable",
        RpcFiErrorCode::Busy => "An FI operation is already in progress",
        RpcFiErrorCode::NoActiveFormation => "There is no active FI formation",
        RpcFiErrorCode::AbandonUnavailable => "The formation can no longer be abandoned",
        RpcFiErrorCode::Registry => "The Fleet Manager registry is unavailable",
        RpcFiErrorCode::Selection => "A verified Fleet Manager set could not be selected",
        RpcFiErrorCode::SelectionReauthorizationRequired => {
            "Fresh federation setup authorization is required"
        }
        RpcFiErrorCode::CapabilityUnavailable => "A required FI capability is unavailable",
        RpcFiErrorCode::InvalidFleetManagers => "The Fleet Manager set is invalid",
        RpcFiErrorCode::FleetManager => "A Fleet Manager operation failed",
        RpcFiErrorCode::Payment => "An FI payment operation failed",
        RpcFiErrorCode::Liquidity => "An FI liquidity operation failed",
        RpcFiErrorCode::MaintenanceWrongState => {
            "Federation maintenance is unavailable in the current state"
        }
        RpcFiErrorCode::MaintenanceRejected => "A guardian rejected the maintenance request",
        RpcFiErrorCode::MaintenanceConsensusTooLarge => {
            "The federation metadata exceeds the allowed size"
        }
        RpcFiErrorCode::MaintenanceConsensusInvalid => "The federation metadata is invalid",
        RpcFiErrorCode::MaintenanceConvergence => {
            "Federation maintenance did not reach consensus in time"
        }
        RpcFiErrorCode::PushNotifications => "FI push notification setup failed",
        RpcFiErrorCode::Timeout => "The FI operation timed out",
    }
}

fn fi_error_code_to_rpc(error: FiErrorCode) -> RpcFiErrorCode {
    match error {
        FiErrorCode::InvalidIntent => RpcFiErrorCode::InvalidIntent,
        FiErrorCode::InvalidOptions => RpcFiErrorCode::InvalidOptions,
        FiErrorCode::Storage => RpcFiErrorCode::Storage,
        FiErrorCode::Identity => RpcFiErrorCode::Identity,
        FiErrorCode::Busy => RpcFiErrorCode::Busy,
        FiErrorCode::NoActiveFormation => RpcFiErrorCode::NoActiveFormation,
        FiErrorCode::AbandonUnavailable => RpcFiErrorCode::AbandonUnavailable,
        FiErrorCode::Registry => RpcFiErrorCode::Registry,
        FiErrorCode::Selection => RpcFiErrorCode::Selection,
        FiErrorCode::SelectionReauthorizationRequired => {
            RpcFiErrorCode::SelectionReauthorizationRequired
        }
        FiErrorCode::CapabilityUnavailable => RpcFiErrorCode::CapabilityUnavailable,
        FiErrorCode::InvalidFleetManagers => RpcFiErrorCode::InvalidFleetManagers,
        FiErrorCode::FleetManager => RpcFiErrorCode::FleetManager,
        FiErrorCode::Payment => RpcFiErrorCode::Payment,
        FiErrorCode::Liquidity => RpcFiErrorCode::Liquidity,
        FiErrorCode::MaintenanceWrongState => RpcFiErrorCode::MaintenanceWrongState,
        FiErrorCode::MaintenanceRejected => RpcFiErrorCode::MaintenanceRejected,
        FiErrorCode::MaintenanceConsensusTooLarge => RpcFiErrorCode::MaintenanceConsensusTooLarge,
        FiErrorCode::MaintenanceConsensusInvalid => RpcFiErrorCode::MaintenanceConsensusInvalid,
        FiErrorCode::MaintenanceConvergence => RpcFiErrorCode::MaintenanceConvergence,
        FiErrorCode::Timeout => RpcFiErrorCode::Timeout,
    }
}

pub(crate) fn fi_client_status_to_rpc(
    client: &Result<Arc<BridgeFiClient>, Arc<FiError>>,
) -> RpcFiClientStatus {
    match client {
        Ok(client) => RpcFiClientStatus::Ready {
            status: fi_status_to_rpc(client.status()),
        },
        Err(error) => RpcFiClientStatus::Failed {
            error: fi_error_to_rpc(error),
        },
    }
}

#[cfg(test)]
mod tests;
