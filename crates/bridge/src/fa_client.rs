//! Fedi-owned adapters for the consumer-neutral Federation Ambassador client.
//!
//! Formation policy, post-formation metadata policy, guardian-fee recipient
//! construction, Manifold Guardian authorization, and consensus convergence
//! remain in Manifold. This bridge owns app identity, wallet-backed setup
//! payments, the cancellation-independent operation driver, and typed RPC
//! projection.
//!
//! Guardian-fee maintenance accepts only an integer PPM rate. It derives the FA
//! recipient from the current joined client's SPv2 `BtcDepositor` account in
//! the exact joined federation id that `fa-client` parses from its persisted
//! formed invite. RPC and driver messages therefore cannot redirect the FA
//! share to another account.

use std::collections::HashMap;
use std::future::Future;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Weak};
use std::time::Duration;

#[cfg(test)]
use fa_client::FaId;
use fa_client::{
    AbandonUnavailableReason, BackupRecoveryHint, ConnectorsConsensusReader, DkgRestartResult,
    FA_LIQUIDITY_OPERATION_PAGE_MAX, FaClient, FaError, FaErrorCode, FaFeeAccountError,
    FaFeeAccountProvider, FaIdentity, FaResult, FaStatus, FederationAppSetting,
    FederationMetadataUpdate, FederationName, FederationSize, FedimintFederationId,
    FedimintdVersion, FedimintdVersionRange, FormationActionRequired, FormationFreshness,
    FormationId, FormationIntent, FormationPhase, FormationRunOptions, FormationSnapshot,
    FormedFederationSnapshot, FormedOrigin, GuardianFeeAccount, GuardianFeePpm,
    GuardianReplacementRequirements, GuardianTransfer, GuardianTransferPhase, LiquidityDiscovery,
    LiquidityOperationId, LiquidityOperationPage, LiquidityOperationPhase,
    LiquidityOperationSnapshot, LiquidityProviderConnector, LiquidityProviderConnectorError,
    LiquidityRequestIntent, MAX_GUARDIAN_FEE_PPM, MaintenanceRunOptions, ManifoldGuardianCallError,
    ManifoldGuardianConnector, ManifoldGuardianConnectorError, MgDiscoveryOptions, MgName,
    MgReplacementApproval, MgReplacementPreview, MgSelectionApproval, MgSelectionPreview,
    MgSelectionRequest, PaymentAuthorizationId, PlanPreference, ReplacementCandidate,
    ReplacementCheck, ReplacementReason, ReplacementReceipt, ReplacementStartError,
    ResolvedFormationIntent, SeatPhase, SelectionReauthorizationReason, TransferDestinationPreview,
};
use federations::Federations;
use federations::federation_sm::FederationState;
use fedi_decentralized_manifold_environment::{ManifoldEnvironment, ManifoldEnvironmentProfile};
use fedi_decentralized_nostr_clients::{
    FaNostrClient, NostrClientResult, NostrFaClient, NostrRelayClient,
};
use fedi_decentralized_peer_badge_verifier::PeerBadgeVerifier;
use fedi_decentralized_service_liquidity_manager::{
    AllocationItemStatus, AllocationItemTarget, BitcoinNetwork, CompletionEvidence,
    ItemAllocationStatus, LiquidityAmountBounds, LiquidityFailureCode, PUBLIC_LIQUIDITY_API_ALPN,
    Pubkey, PublicLiquidityApiClient, Sats, SourceType,
};
#[cfg(test)]
use fedi_decentralized_service_liquidity_manager::{
    GatewayCompletionEvidence, GatewayId, GatewayName, ItemId, LiquidityFailure, Sha256Digest,
    Timestamp, Url, WalletOperationId,
};
use fedi_decentralized_service_manifold_guardian::{
    DkgCompletionCallback, FederationId, GetAvailabilityRequest, GetAvailabilityResponse,
    GetQuoteRequest, GetQuoteResponse, Locator, MANIFOLD_GUARDIAN_ALPN, ManifoldGuardianError,
    ManifoldGuardianServiceClient, ServiceStatus, SignedResponse,
};
use fedi_iroh_rpc::iroh::Endpoint;
#[cfg(target_os = "ios")]
use fedi_iroh_rpc::iroh::endpoint::PortmapperConfig;
use fedi_iroh_rpc::iroh::endpoint::presets;
use fedimint_core::db::{
    Database, IDatabaseTransactionOpsCore as _, IDatabaseTransactionOpsCoreTyped as _,
};
use fedimint_core::invite_code::InviteCode as FedimintInviteCode;
use fedimint_core::module::serde_json;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send};
use fedimint_derive_secret::DerivableSecret;
use futures::StreamExt as _;
use futures::stream::{self, BoxStream};
use nostr::{Event, Keys, PublicKey};
use rpc_types::RpcFederationId;
use rpc_types::event::{
    Event as BridgeEvent, EventSink, FaFederationJoinEvent, RpcFaFederationJoinState,
    TypedEventExt as _,
};
use rpc_types::fa_client::{
    RpcFaAbandonUnavailableReason, RpcFaAppSetting, RpcFaClientStatus,
    RpcFaCurrentLiquidityOperationResult, RpcFaEligiblePayer, RpcFaEligiblePayersResult,
    RpcFaErrorCode, RpcFaFederationMetadataUpdate, RpcFaFormationActionRequired,
    RpcFaFormationFreshness, RpcFaFormationIntent, RpcFaFormationMilestones, RpcFaFormationPhase,
    RpcFaFormationSnapshot, RpcFaFormedFederation, RpcFaFormedOrigin, RpcFaFormedSeat,
    RpcFaGuardianReplacementRequirements, RpcFaGuardianReplacementSeat, RpcFaGuardianTransfer,
    RpcFaGuardianTransferPhase, RpcFaGuardianTransferResult, RpcFaLiquidityAmountBounds,
    RpcFaLiquidityCompletionEvidence, RpcFaLiquidityDiscoveryResult, RpcFaLiquidityItemPhase,
    RpcFaLiquidityItemStatus, RpcFaLiquidityItemTarget, RpcFaLiquidityNetwork,
    RpcFaLiquidityOperation, RpcFaLiquidityOperationPage as RpcLiquidityOperationPage,
    RpcFaLiquidityOperationPageResult, RpcFaLiquidityOperationPhase, RpcFaLiquidityOperationResult,
    RpcFaLiquidityProvider, RpcFaLiquidityProviderRejection, RpcFaLiquidityRequestIntent,
    RpcFaLiquiditySource, RpcFaMsats, RpcFaOperationError, RpcFaOperationErrorDetail,
    RpcFaOperationResult, RpcFaPaymentRequirements, RpcFaPlanPreference, RpcFaReplacementCandidate,
    RpcFaReplacementCandidates, RpcFaReplacementCheck, RpcFaReplacementPreview,
    RpcFaReplacementPreviewResult, RpcFaReplacementPreviewSeat, RpcFaReplacementReason,
    RpcFaResolvedFormationIntent, RpcFaSeatPaymentRequirement, RpcFaSeatPhase, RpcFaSeatProgress,
    RpcFaSelectionPreview, RpcFaSelectionPreviewRequest, RpcFaSelectionPreviewResult,
    RpcFaSelectionPreviewSeat, RpcFaSelectionReauthorizationReason, RpcFaSetupPaymentFederation,
    RpcFaSetupPaymentFederationsResult, RpcFaStatus, RpcFaTransferDestinationPreview,
    RpcFaTransferDestinationPreviewResult,
};
use runtime::bridge_runtime::Runtime;
use runtime::constants::FA_CLIENT_CHILD_ID;
use runtime::db::{FaFederationAutoJoinCompletedKey, FederationPendingRejoinFromScratchKeyPrefix};
use runtime::features::FaManifoldEnvironment;
use sp_transfer::services::SptServices;
use tokio::sync::{Mutex, Notify, OnceCell, OwnedMutexGuard, mpsc, oneshot, watch};
use tokio_stream::wrappers::WatchStream;

use crate::fa_payments::BridgeFaPayments;
use crate::fa_push::{BridgeFaPushGateway, FaDkgPushHook, FaPushError};

pub(crate) type BridgeFaClient = FaClient<
    BridgeFaIdentity,
    BridgeFaPayments,
    BridgeFaRegistry,
    BridgeMgConnector,
    ConnectorsConsensusReader,
>;

const FA_DRIVER_QUEUE_CAPACITY: usize = 1;
const FA_LIQUIDITY_PAGE_SIZE: usize = FA_LIQUIDITY_OPERATION_PAGE_MAX;
const FA_ACTIVE_FORMATION_KEY: &[u8] = &[0x00];
// Fedi supports compatible 0.11 patches from the first approved 0.11.2 release.
const FEDIMINTD_MINIMUM: &str = "0.11.2";
// The ceiling runs ahead of the pinned Fedimint release on purpose: guardians
// upgrade before the app does, and an exclusive bound one patch above the pin
// strands the whole fleet.
const FEDIMINTD_MAXIMUM_EXCLUSIVE: &str = "0.14.0";
const FA_RESUME_INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const FA_RESUME_MAX_BACKOFF: Duration = Duration::from_secs(5 * 60);
// Each poll is a provider discovery fetch plus one status RPC. An operator
// retry can take hours, so poll an `ActionRequired` operation slowly.
const FA_LIQUIDITY_OPERATOR_POLL_INTERVAL: Duration = Duration::from_secs(15 * 60);
const FA_RESTART_ATTEMPTS: u32 = 40;
const FA_RESTART_RETRY_DELAY: Duration = Duration::from_millis(50);
const MG_TRANSPORT_INITIALIZATION_ERROR: &str = "Manifold Guardian transport initialization failed";
const MG_CONNECTION_ERROR: &str = "Manifold Guardian connection failed";
const MG_CALL_ERROR: &str = "Manifold Guardian call failed";
const LIQUIDITY_TRANSPORT_INITIALIZATION_ERROR: &str =
    "Liquidity provider transport initialization failed";
const LIQUIDITY_CONNECTION_ERROR: &str = "Liquidity provider connection failed";

pub(crate) async fn open_fa_client(
    runtime: &Runtime,
    federations: Arc<Federations>,
    environment: FaManifoldEnvironment,
    restored_mnemonic: bool,
) -> FaResult<BridgeFaClient> {
    let database = runtime.fa_client_db();
    migrate_fa_guardian_fee_field(&database).await?;
    let root_secret = runtime.app_state.root_secret().await;
    let identity = BridgeFaIdentity::from_root_secret(&root_secret);
    let environment = manifold_environment(environment);
    tracing::info!(?environment, "opening the FA client");
    let profile = environment
        .profile()
        .map_err(|_| FaError::Registry("Manifold environment profile is unavailable".to_owned()))?;
    let registry = BridgeFaRegistry::from_profile(&profile)?;
    let peer_badge_verifier = PeerBadgeVerifier::try_from_profile(&profile)
        .map_err(|_| FaError::Registry("Manifold PeerBadge trust is unavailable".to_owned()))?;
    let consensus_reader = ConnectorsConsensusReader::new(runtime.connectors.clone());
    // Paid formation and guardian-fee policy both depend on deployment-owned
    // authorities from this exact Manifold profile.
    FaClient::open_with_manifold_profile_and_recovery(
        database,
        identity,
        BridgeFaPayments::new(federations.clone()),
        registry,
        BridgeMgConnector::default(),
        peer_badge_verifier,
        consensus_reader,
        BridgeFaFeeAccountProvider { federations },
        profile,
        if restored_mnemonic {
            BackupRecoveryHint::RestoredMnemonic
        } else {
            BackupRecoveryHint::Skip
        },
    )
    .await
}

/// Repair formations written before Manifold renamed its guardian-fee field.
///
/// TODO: Remove after nightly installations have opened a build containing
/// this migration.
async fn migrate_fa_guardian_fee_field(database: &Database) -> FaResult<()> {
    let mut dbtx = database.begin_transaction().await;
    let Some(bytes) = dbtx
        .raw_get_bytes(FA_ACTIVE_FORMATION_KEY)
        .await
        .map_err(|_| FaError::Storage("reading the FA formation migration failed".to_owned()))?
    else {
        return Ok(());
    };
    let mut formation: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| FaError::Storage("decoding the FA formation migration failed".to_owned()))?;
    let Some(target) = formation
        .get_mut("formation_meta_target")
        .and_then(serde_json::Value::as_object_mut)
    else {
        return Ok(());
    };
    if target.contains_key("guardian_verification_fee_account") {
        return Ok(());
    }
    let Some(account) = target.remove("fedi_fee_account") else {
        return Ok(());
    };
    target.insert("guardian_verification_fee_account".to_owned(), account);
    let bytes = serde_json::to_vec(&formation)
        .map_err(|_| FaError::Storage("encoding the FA formation migration failed".to_owned()))?;
    dbtx.raw_insert_bytes(FA_ACTIVE_FORMATION_KEY, &bytes)
        .await
        .map_err(|_| FaError::Storage("writing the FA formation migration failed".to_owned()))?;
    dbtx.commit_tx_result()
        .await
        .map_err(|_| FaError::Storage("committing the FA formation migration failed".to_owned()))
}

#[derive(Clone)]
struct BridgeFaFeeAccountProvider {
    federations: Arc<Federations>,
}

impl FaFeeAccountProvider for BridgeFaFeeAccountProvider {
    fn formed_federation_fee_account(
        &self,
        federation_id: &FedimintFederationId,
    ) -> Result<GuardianFeeAccount, FaFeeAccountError> {
        // Manifold maps every error from this provider to
        // CapabilityUnavailable(FeeArrangement), so the specific cause only
        // survives if it is logged here.
        let federation = self
            .federations
            .get_federation(&federation_id.to_string())
            .map_err(|error| {
                tracing::warn!(
                    %federation_id,
                    %error,
                    "the formed federation is not joined and ready"
                );
                FaFeeAccountError::new("formed federation is not joined and ready")
            })?;
        federation
            .spv2_our_btc_depositor_account()
            .map_err(|error| {
                tracing::warn!(
                    %federation_id,
                    %error,
                    "the formed federation has no SPv2 BTC account"
                );
                FaFeeAccountError::new("formed federation has no SPv2 BTC account")
            })
    }
}

#[derive(Default)]
pub(crate) struct FaFederationHandoffLocks {
    locks: Mutex<HashMap<String, Weak<Mutex<()>>>>,
}

impl FaFederationHandoffLocks {
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

/// How often the auto-join task re-reads the federation state while it waits
/// for the joined federation to become usable.
const FA_FEDERATION_AUTO_JOIN_POLL_INTERVAL: Duration = Duration::from_secs(2);

/// The state of the FA's federation that the auto-join task acts on.
///
/// It mirrors [`FederationState`] without the client handles, so the join
/// sequence can be driven by a test double.
#[derive(Debug, Clone, PartialEq, Eq)]
enum AutoJoinFederationState {
    Loading,
    Ready,
    Recovering,
    Failed(String),
}

/// The federation service as the auto-join task uses it.
#[apply(async_trait_maybe_send!)]
trait AutoJoinTarget: MaybeSend + MaybeSync {
    /// `Err` means the federation is not joined, or was left again.
    fn state(&self, federation_id: &str) -> anyhow::Result<AutoJoinFederationState>;
    async fn join(&self, invite_code: String) -> anyhow::Result<()>;
}

#[apply(async_trait_maybe_send!)]
impl AutoJoinTarget for Arc<Federations> {
    fn state(&self, federation_id: &str) -> anyhow::Result<AutoJoinFederationState> {
        Ok(match self.get_federation_state(federation_id)? {
            FederationState::Loading => AutoJoinFederationState::Loading,
            FederationState::Ready(_) => AutoJoinFederationState::Ready,
            FederationState::Recovering(_) => AutoJoinFederationState::Recovering,
            FederationState::Failed(error) => AutoJoinFederationState::Failed(error.to_string()),
        })
    }

    async fn join(&self, invite_code: String) -> anyhow::Result<()> {
        Federations::join_federation(self, invite_code, false)
            .await
            .map(|_| ())
    }
}

/// The last auto-join state the bridge reported, shared with the RPC handler.
///
/// The app can read the FA client status after the auto-join event was already
/// delivered, so the status handler re-emits the retained state.
#[derive(Clone, Default)]
pub(crate) struct FaFederationJoinReport(Arc<std::sync::Mutex<Option<FaFederationJoinEvent>>>);

impl FaFederationJoinReport {
    fn record(&self, event: FaFederationJoinEvent) {
        *self.0.lock().expect("join report lock is healthy") = Some(event);
    }

    pub(crate) fn last(&self) -> Option<FaFederationJoinEvent> {
        self.0.lock().expect("join report lock is healthy").clone()
    }

    /// Forgets the retained state of one federation. Leaving that federation
    /// makes the last reported state wrong; without this, every later status
    /// read would re-announce a join the bridge no longer holds. Leaving any
    /// other federation must not erase the FA federation's state.
    pub(crate) fn clear(&self, federation_id: &str) {
        let mut retained = self.0.lock().expect("join report lock is healthy");
        if retained
            .as_ref()
            .is_some_and(|event| event.federation_id.0 == federation_id)
        {
            *retained = None;
        }
    }
}

/// Reports each new auto-join state once. Waiting for recovery re-reads the
/// state every few seconds; the app must not see one event per read.
struct JoinStateEmitter<'a, R: Fn(RpcFaFederationJoinState)> {
    report: &'a R,
    last: std::sync::Mutex<Option<RpcFaFederationJoinState>>,
}

impl<'a, R: Fn(RpcFaFederationJoinState)> JoinStateEmitter<'a, R> {
    fn new(report: &'a R) -> Self {
        Self {
            report,
            last: std::sync::Mutex::new(None),
        }
    }

    fn emit(&self, state: RpcFaFederationJoinState) {
        let mut last = self.last.lock().expect("emitter lock is healthy");
        if last.as_ref() == Some(&state) {
            return;
        }
        (self.report)(state.clone());
        *last = Some(state);
    }
}

pub(crate) fn start_fa_federation_auto_join(
    runtime: &Runtime,
    mut status: watch::Receiver<FaStatus>,
    federations: Arc<Federations>,
    sp_transfers_services: Arc<SptServices>,
    handoff_locks: Arc<FaFederationHandoffLocks>,
    join_report: FaFederationJoinReport,
) {
    let database = runtime.bridge_db();
    let event_sink: EventSink = runtime.event_sink.clone();
    runtime
        .task_group
        .spawn_cancellable("fa-client::federation-auto-join", async move {
            loop {
                let Some((invite_code, federation_id)) =
                    formed_federation_invite(&status.borrow().clone())
                else {
                    if status.changed().await.is_err() {
                        return;
                    }
                    continue;
                };

                let report = |state: RpcFaFederationJoinState| {
                    let event = FaFederationJoinEvent {
                        federation_id: RpcFederationId(federation_id.clone()),
                        state,
                    };
                    join_report.record(event.clone());
                    event_sink.typed_event(&BridgeEvent::FaFederationJoin(event));
                };
                let on_joined = || sp_transfers_services.account_id_responder.trigger();
                run_fa_federation_auto_join(
                    &federations,
                    &database,
                    &handoff_locks,
                    invite_code,
                    &federation_id,
                    FA_FEDERATION_AUTO_JOIN_POLL_INTERVAL,
                    &report,
                    &on_joined,
                )
                .await;
                let formed = status.wait_for(|s| formed_federation_id(s).is_ok());
                if formed.await.is_ok()
                    && let Ok(federation) = federations.get_federation(&federation_id)
                {
                    federation.meta_source.refresh.notify_one();
                }
                return;
            }
        });
}

/// Joins the FA's federation if needed, and reports how far it got.
///
/// The handoff lock only has to keep the join and its marker write apart from
/// a concurrent `leave_federation`, which suppresses the auto-join under the
/// same lock. Waiting for a joined federation to become usable takes minutes
/// for a recovery and never ends for a stuck federation, so the wait itself
/// holds no lock: a leave that arrives during the wait must be able to run.
#[allow(clippy::too_many_arguments)]
async fn run_fa_federation_auto_join(
    target: &dyn AutoJoinTarget,
    database: &Database,
    handoff_locks: &FaFederationHandoffLocks,
    invite_code: String,
    federation_id: &str,
    poll_interval: Duration,
    report: &(impl Fn(RpcFaFederationJoinState) + MaybeSend + MaybeSync),
    on_joined: &(impl Fn() + MaybeSend + MaybeSync),
) {
    let emitter = JoinStateEmitter::new(report);
    let mut retry_delay = Duration::ZERO;
    loop {
        let handoff_guard = handoff_locks.lock(federation_id).await;
        // The marker alone cannot answer "is this federation joined". A
        // deliberate `leave_federation` suppresses the auto-join by writing the
        // same marker, so on the next launch a marker-only `Ready` would claim
        // a federation the bridge is not in — which `event.rs` forbids. The
        // live state decides; the marker only decides what an *absent*
        // federation means.
        let auto_join_suppressed = fa_federation_auto_join_completed(database, federation_id).await;
        match target.state(federation_id) {
            Ok(AutoJoinFederationState::Ready) => {
                complete_fa_federation_auto_join(database, federation_id).await;
                emitter.emit(RpcFaFederationJoinState::Ready);
                return;
            }
            // `Loading` is also reported while the state lock is write-held, so
            // it says nothing about this federation. Waiting decides it either
            // way, and the app gets a state instead of silence.
            Ok(AutoJoinFederationState::Recovering | AutoJoinFederationState::Loading) => {}
            Ok(AutoJoinFederationState::Failed(message)) => {
                emitter.emit(RpcFaFederationJoinState::Failed { message });
                return;
            }
            // absent *and* marked: the user left this federation on purpose,
            // and the marker is the record of that. Rejoining would undo the
            // leave and any state would misdescribe it, so say nothing.
            Err(_) if auto_join_suppressed => {
                tracing::debug!(
                    %federation_id,
                    "FA federation auto-join is suppressed and the federation is absent; not rejoining"
                );
                return;
            }
            Err(_) => {
                emitter.emit(RpcFaFederationJoinState::Joining);
                match target.join(invite_code.clone()).await {
                    Ok(()) => on_joined(),
                    Err(error) => {
                        tracing::warn!(
                            %federation_id,
                            %error,
                            "automatic FA federation join failed; retrying"
                        );
                        // Let a leave run during the delay, then recheck its
                        // marker and the wallet state before trying again.
                        drop(handoff_guard);
                        retry_delay = next_retry_delay(retry_delay, false);
                        fedimint_core::task::sleep(retry_delay).await;
                        continue;
                    }
                }
            }
        }
        break;
    }

    mark_complete_once_ready(
        target,
        database,
        handoff_locks,
        federation_id,
        poll_interval,
        &emitter,
    )
    .await;
}

/// The completion marker means "this federation is joined and past its
/// nonce-reuse check". Writing it any earlier lets a check that leaves the
/// federation strand the Wallet Service behind a marker that says done.
///
/// The wait holds no handoff lock, so a `leave_federation` can run at any
/// point of it. Only the marker write takes the lock, and it re-reads the live
/// state under it: a leave that won the lock has already left the federation
/// by the time the lock is free.
async fn mark_complete_once_ready(
    target: &dyn AutoJoinTarget,
    database: &Database,
    handoff_locks: &FaFederationHandoffLocks,
    federation_id: &str,
    poll_interval: Duration,
    emitter: &JoinStateEmitter<'_, impl Fn(RpcFaFederationJoinState) + MaybeSend + MaybeSync>,
) {
    loop {
        match target.state(federation_id) {
            Ok(AutoJoinFederationState::Ready) => {
                let _handoff_guard = handoff_locks.lock(federation_id).await;
                match target.state(federation_id) {
                    Ok(AutoJoinFederationState::Ready) => {
                        complete_fa_federation_auto_join(database, federation_id).await;
                        emitter.emit(RpcFaFederationJoinState::Ready);
                        return;
                    }
                    // The federation went away while this task waited for the
                    // lock.
                    Err(_) => match absent_during_wait(database, federation_id, emitter).await {
                        AbsentDuringWait::Stop => return,
                        AbsentDuringWait::KeepWaiting => {}
                    },
                    Ok(AutoJoinFederationState::Failed(message)) => {
                        emitter.emit(RpcFaFederationJoinState::Failed { message });
                        return;
                    }
                    // It stopped being ready again; keep waiting for an answer.
                    Ok(AutoJoinFederationState::Recovering | AutoJoinFederationState::Loading) => {
                        emitter.emit(RpcFaFederationJoinState::Recovering);
                    }
                }
            }
            Ok(AutoJoinFederationState::Recovering | AutoJoinFederationState::Loading) => {
                emitter.emit(RpcFaFederationJoinState::Recovering);
            }
            Ok(AutoJoinFederationState::Failed(message)) => {
                emitter.emit(RpcFaFederationJoinState::Failed { message });
                return;
            }
            Err(_) => match absent_during_wait(database, federation_id, emitter).await {
                AbsentDuringWait::Stop => return,
                AbsentDuringWait::KeepWaiting => {}
            },
        }
        fedimint_core::task::sleep(poll_interval).await;
    }
}

/// What the wait does after the federation it waits for went absent.
enum AbsentDuringWait {
    /// The federation is gone for good, or gone on purpose.
    Stop,
    /// The federation is expected back; keep polling for it.
    KeepWaiting,
}

/// Decides how the wait reacts to an absent federation, and reports it.
///
/// Both places the wait can see the federation disappear — the poll itself, and
/// the re-read under the handoff lock — must answer this the same way. A
/// `Failed` here is retained by the join report and re-delivered to every later
/// status read, so it must only be emitted when the recovery really did fail.
async fn absent_during_wait(
    database: &Database,
    federation_id: &str,
    emitter: &JoinStateEmitter<'_, impl Fn(RpcFaFederationJoinState) + MaybeSend + MaybeSync>,
) -> AbsentDuringWait {
    // A marker this task did not write is the record of a deliberate leave.
    // `leave_federation` writes it and clears the retained report under the
    // handoff lock, so a `Failed` after it would outlive the federation.
    if fa_federation_auto_join_completed(database, federation_id).await {
        tracing::debug!(
            %federation_id,
            "FA federation was left before the auto-join could mark it ready"
        );
        return AbsentDuringWait::Stop;
    }
    // The nonce-reuse check leaves the federation and records that it must be
    // rejoined from scratch. The user did not leave it, and the app rejoins it,
    // so this is still a recovery in progress.
    if federation_pending_rejoin_from_scratch(database, federation_id).await {
        tracing::debug!(
            %federation_id,
            "FA federation is pending a rejoin from scratch; the auto-join keeps waiting for it"
        );
        emitter.emit(RpcFaFederationJoinState::Recovering);
        return AbsentDuringWait::KeepWaiting;
    }
    emitter.emit(RpcFaFederationJoinState::Failed {
        message: "federation left during recovery".to_owned(),
    });
    AbsentDuringWait::Stop
}

/// True when the bridge recorded that this federation must be rejoined from
/// scratch. The record is keyed by invite code, so the federation id it carries
/// decides, not the exact string the FA holds.
async fn federation_pending_rejoin_from_scratch(database: &Database, federation_id: &str) -> bool {
    database
        .begin_transaction_nc()
        .await
        .find_by_prefix(&FederationPendingRejoinFromScratchKeyPrefix)
        .await
        .any(|(key, ())| async move {
            FedimintInviteCode::from_str(&key.invite_code_str)
                .is_ok_and(|invite| invite.federation_id().to_string() == federation_id)
        })
        .await
}

fn formed_federation_invite(status: &FaStatus) -> Option<(String, String)> {
    let invite_code = match status {
        // Waiting for Formed deadlocks: publish_seat_bindings has to read the
        // formed federation's SPv2 account to assemble the fee recipients, and
        // that federation only becomes readable once this join has run. The
        // invite is durable from DkgComplete onwards.
        FaStatus::Formation(formation)
            if matches!(
                formation.phase,
                FormationPhase::DkgComplete | FormationPhase::PublishingSeatBindings
            ) =>
        {
            formation.invite_code.as_ref()?.0.clone()
        }
        // A federation this device never checked, such as one from a
        // backup, waits for its first reconciliation.
        FaStatus::Formed(federation)
            if federation.freshness == FormationFreshness::Fresh || federation.backup_eligible =>
        {
            federation.federation_invite.0.clone()
        }
        FaStatus::Idle
        | FaStatus::Recovery { .. }
        | FaStatus::Formation(_)
        | FaStatus::Formed(_) => return None,
    };
    let federation_id = FedimintInviteCode::from_str(&invite_code)
        .ok()?
        .federation_id()
        .to_string();
    Some((invite_code, federation_id))
}

async fn fa_federation_auto_join_completed(database: &Database, federation_id: &str) -> bool {
    database
        .begin_transaction_nc()
        .await
        .get_value(&FaFederationAutoJoinCompletedKey {
            federation_id: federation_id.to_owned(),
        })
        .await
        .is_some()
}

async fn complete_fa_federation_auto_join(database: &Database, federation_id: &str) {
    let mut dbtx = database.begin_transaction().await;
    dbtx.insert_entry(
        &FaFederationAutoJoinCompletedKey {
            federation_id: federation_id.to_owned(),
        },
        &(),
    )
    .await;
    dbtx.commit_tx().await;
}

pub(crate) async fn suppress_fa_federation_auto_join(runtime: &Runtime, federation_id: &str) {
    complete_fa_federation_auto_join(&runtime.bridge_db(), federation_id).await;
}

fn manifold_environment(environment: FaManifoldEnvironment) -> ManifoldEnvironment {
    match environment {
        FaManifoldEnvironment::Development => ManifoldEnvironment::Development,
        FaManifoldEnvironment::Staging => ManifoldEnvironment::Staging,
        FaManifoldEnvironment::Production => ManifoldEnvironment::Production,
    }
}

/// Lazy, read-only registry adapter built from Manifold's canonical profile.
///
/// Opening the bridge never requires relay availability. The first discovery
/// or setup-payment policy request establishes one bounded connection with an
/// ephemeral key, then role-specific queries enforce their own hard bounds.
#[derive(Clone)]
pub(crate) struct BridgeFaRegistry {
    relay_url: String,
    client: Arc<OnceCell<NostrFaClient>>,
}

impl BridgeFaRegistry {
    fn from_profile(profile: &ManifoldEnvironmentProfile) -> FaResult<Self> {
        let relay_url = profile
            .nostr_relays()
            .as_urls()
            .first()
            .ok_or_else(|| FaError::Registry("Manifold relay routing is empty".to_owned()))?
            .to_string();
        Ok(Self {
            relay_url,
            client: Arc::new(OnceCell::new()),
        })
    }

    async fn client(&self, timeout: Duration) -> NostrClientResult<&NostrFaClient> {
        self.client
            .get_or_try_init(|| async {
                let relay = NostrRelayClient::connect(
                    &self.relay_url,
                    Keys::generate(),
                    timeout.min(Duration::from_secs(10)),
                )
                .await?;
                Ok(NostrFaClient::new(relay))
            })
            .await
    }
}

impl FaNostrClient for BridgeFaRegistry {
    async fn fetch_mg_advertisement(
        &self,
        mg_pubkey: PublicKey,
        timeout: Duration,
    ) -> NostrClientResult<Event> {
        self.client(timeout)
            .await?
            .fetch_mg_advertisement(mg_pubkey, timeout)
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

    async fn fetch_mg_advertisements(&self, timeout: Duration) -> NostrClientResult<Vec<Event>> {
        self.client(timeout)
            .await?
            .fetch_mg_advertisements(timeout)
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

pub async fn bind_n0_endpoint() -> Result<Endpoint, fedi_iroh_rpc::iroh::endpoint::BindError> {
    let builder = Endpoint::builder(presets::N0);
    #[cfg(target_os = "ios")]
    let builder = builder.portmapper_config(PortmapperConfig::Disabled);
    builder.bind().await
}

/// Fedi's Iroh transport adapter for the Manifold Guardian service.
///
/// The endpoint is bound lazily so opening an otherwise healthy wallet does
/// not require network availability. Iroh is reached through Manifold's RPC
/// crate re-export, keeping this adapter on the exact transport type used by
/// the generated service client.
#[derive(Default)]
pub(crate) struct BridgeMgConnector {
    endpoint: OnceCell<Endpoint>,
}

impl ManifoldGuardianConnector for BridgeMgConnector {
    type Client = ManifoldGuardianServiceClient;

    async fn connect(
        &self,
        locator: &Locator,
    ) -> Result<Self::Client, ManifoldGuardianConnectorError> {
        let endpoint = self
            .endpoint
            .get_or_try_init(|| async {
                bind_n0_endpoint().await.map_err(|_| {
                    ManifoldGuardianConnectorError::new(MG_TRANSPORT_INITIALIZATION_ERROR)
                })
            })
            .await?;
        endpoint
            .connect(locator.endpoint_addr.clone(), MANIFOLD_GUARDIAN_ALPN)
            .await
            .map(ManifoldGuardianServiceClient::new)
            .map_err(|_| ManifoldGuardianConnectorError::new(MG_CONNECTION_ERROR))
    }

    async fn get_availability(
        &self,
        client: &Self::Client,
        request: GetAvailabilityRequest,
    ) -> Result<Result<GetAvailabilityResponse, ManifoldGuardianError>, ManifoldGuardianCallError>
    {
        client
            .transport()
            .get_availability(request)
            .await
            .map_err(|_| ManifoldGuardianCallError::new(MG_CALL_ERROR))
    }

    async fn get_quote(
        &self,
        client: &Self::Client,
        request: GetQuoteRequest,
    ) -> Result<
        Result<SignedResponse<GetQuoteResponse>, ManifoldGuardianError>,
        ManifoldGuardianCallError,
    > {
        client
            .transport()
            .get_quote(request)
            .await
            .map_err(|_| ManifoldGuardianCallError::new(MG_CALL_ERROR))
    }
}

/// Fedi's Iroh transport adapter for the provider-signed FLIP endpoint.
///
/// `fa-client` admits the endpoint and independently verifies every response;
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
                bind_n0_endpoint().await.map_err(|_| {
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
    async fn create_formation_hook(&self) -> Result<FaDkgPushHook, FaPushError>;

    async fn revoke_hook(&self, hook: &FaDkgPushHook) -> Result<(), FaPushError>;
}

#[apply(async_trait_maybe_send!)]
impl FormationPushGateway for BridgeFaPushGateway {
    async fn create_formation_hook(&self) -> Result<FaDkgPushHook, FaPushError> {
        BridgeFaPushGateway::create_formation_hook(self).await
    }

    async fn revoke_hook(&self, hook: &FaDkgPushHook) -> Result<(), FaPushError> {
        BridgeFaPushGateway::revoke_hook(self, hook).await
    }
}

type FormationPushGatewayHandle = Result<Arc<dyn FormationPushGateway>, Arc<FaPushError>>;

struct FormationPushCoordinator {
    environment: FaManifoldEnvironment,
    gateway: FormationPushGatewayHandle,
    state: Mutex<Option<StoredFormationPush>>,
}

struct StoredFormationPush {
    preview_id: String,
    hook: Option<FaDkgPushHook>,
}

pub(crate) struct BridgeFaIdentity {
    scoped_root: DerivableSecret,
}

impl BridgeFaIdentity {
    fn from_root_secret(root_secret: &DerivableSecret) -> Self {
        Self {
            scoped_root: root_secret.child_key(FA_CLIENT_CHILD_ID),
        }
    }
}

impl FaIdentity for BridgeFaIdentity {
    fn scoped_root(&self) -> DerivableSecret {
        self.scoped_root.clone()
    }
}

#[derive(Clone)]
pub(crate) struct BridgeFaDriver {
    commands: FaCommandSender,
    client: Arc<BridgeFaClient>,
    federations: Arc<Federations>,
    formation_state: Arc<FormationLocalState>,
}

#[derive(Clone)]
struct FaCommandSender {
    sender: mpsc::Sender<FaDriverCommand>,
    operation_active: Arc<AtomicBool>,
}

struct StoredSelection {
    preview_id: String,
    preview: Option<MgSelectionPreview>,
    approval: Option<MgSelectionApproval>,
}

struct StoredReplacement {
    preview_id: String,
    preview: Option<MgReplacementPreview>,
    approval: Option<MgReplacementApproval>,
}

struct StoredTransferPreview {
    preview_id: String,
    /// The decision shown when the user picked the guardian. A later check
    /// cannot take it back.
    receipt: ReplacementReceipt,
    preview: TransferDestinationPreview,
}

struct FormationLocalState {
    formation_push: FormationPushCoordinator,
    selection: Mutex<Option<StoredSelection>>,
    replacement: Mutex<Option<StoredReplacement>>,
    transfer_destination: Mutex<Option<StoredTransferPreview>>,
    dkg_restart_requested: Notify,
}

/// Best-effort: a missing or failing push gateway must not block formation.
/// Launch reconciliation already resumes an active formation without a push,
/// so the only cost of `None` is the "ready" notification while the app is
/// closed — never correctness or funds.
async fn ensure_formation_push_hook(
    stored_hook: &mut Option<FaDkgPushHook>,
    push_gateway: &FormationPushGatewayHandle,
    // The selected environment must not impose callback policy here. The
    // environment-scoped gateway cache already decides whether a usable client
    // is available for that Manifold deployment.
    _environment: FaManifoldEnvironment,
) -> Option<FaDkgPushHook> {
    if let Some(hook) = stored_hook {
        return Some(hook.clone());
    }
    let gateway = match push_gateway {
        Ok(gateway) => gateway,
        Err(error) => {
            tracing::info!(%error, "formation proceeds without a push hook");
            return None;
        }
    };
    match gateway.create_formation_hook().await {
        Ok(hook) => {
            *stored_hook = Some(hook.clone());
            Some(hook)
        }
        Err(error) => {
            tracing::warn!(%error, "formation proceeds without a push hook");
            None
        }
    }
}

async fn discard_formation_push_if_unowned(
    hook: Option<FaDkgPushHook>,
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

enum FaDriverOperation {
    PayAndCreate {
        intent: FormationIntent,
        approval: Box<MgSelectionApproval>,
        payment_federation_id: FederationId,
        /// `None` when no push hook could be arranged; the formation then
        /// relies on launch reconciliation instead of a completion push.
        completion_callback: Option<DkgCompletionCallback>,
    },
    ApplyReplacements {
        approval: MgReplacementApproval,
    },
    Abandon,
    Resume,
    RestartDkg,
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

enum FaDriverResponse {
    Formation(RpcFaOperationResult),
    Liquidity(RpcFaLiquidityOperationResult),
}

struct FaDriverCommand {
    operation: FaDriverOperation,
    response: oneshot::Sender<FaDriverCompletion>,
    claim: FaDriverOperationClaim,
    retain_claim_for_handoff: bool,
}

struct FaDriverOperationClaim {
    operation_active: Arc<AtomicBool>,
}

struct FaDriverCompletion {
    response: FaDriverResponse,
    retained_claim: Option<FaDriverOperationClaim>,
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
        let Some(operation) = operation.filter(|operation| {
            !matches!(
                liquidity_recovery_poll(operation),
                LiquidityRecoveryPoll::Done
            )
        }) else {
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
        self.retry_delay = match liquidity_recovery_poll(&operation) {
            LiquidityRecoveryPoll::Done => {
                self.finish();
                return;
            }
            LiquidityRecoveryPoll::Active => {
                let progress = self
                    .last_snapshot
                    .as_ref()
                    .is_some_and(|previous| previous != &operation);
                next_retry_delay(self.retry_delay, progress)
            }
            LiquidityRecoveryPoll::AwaitingProviderOperator => FA_LIQUIDITY_OPERATOR_POLL_INTERVAL,
        };
        self.last_snapshot = Some(operation);
        self.pending = None;
        self.read_current = true;
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

impl Drop for FaDriverOperationClaim {
    fn drop(&mut self) {
        self.operation_active.store(false, Ordering::Release);
    }
}

impl FormationPushCoordinator {
    fn new(gateway: FormationPushGatewayHandle, environment: FaManifoldEnvironment) -> Self {
        Self {
            environment,
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
    ) -> RpcFaOperationResult
    where
        Dispatch: FnOnce(Option<DkgCompletionCallback>) -> DispatchFuture,
        DispatchFuture: Future<
            Output = Result<(FaDriverResponse, FaDriverOperationClaim), RpcFaOperationError>,
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
                    RpcFaErrorCode::SelectionReauthorizationRequired,
                    "The selection preview callback is no longer available",
                );
            };
            ensure_formation_push_hook(&mut stored.hook, &self.gateway, self.environment)
                .await
                .map(|hook| hook.callback)
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
    fn new(push_gateway: FormationPushGatewayHandle, environment: FaManifoldEnvironment) -> Self {
        Self {
            formation_push: FormationPushCoordinator::new(push_gateway, environment),
            selection: Mutex::new(None),
            replacement: Mutex::new(None),
            transfer_destination: Mutex::new(None),
            dkg_restart_requested: Notify::new(),
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

fn may_retry_payer(result: &RpcFaOperationResult) -> bool {
    matches!(
        result,
        RpcFaOperationResult::Error {
            error: RpcFaOperationError {
                code: RpcFaErrorCode::Busy,
                ..
            }
        } | RpcFaOperationResult::Error {
            error: RpcFaOperationError {
                detail: Some(
                    RpcFaOperationErrorDetail::SelectionReauthorizationRequired {
                        reason: RpcFaSelectionReauthorizationReason::SelectedPayerUnavailable
                            | RpcFaSelectionReauthorizationReason::SelectedPayerInsufficientFunds,
                    }
                ),
                ..
            }
        }
    )
}

fn operation_response(
    response: Result<FaDriverResponse, RpcFaOperationError>,
) -> RpcFaOperationResult {
    match response {
        Ok(FaDriverResponse::Formation(result)) => result,
        Ok(_) => operation_error_result(
            RpcFaErrorCode::CapabilityUnavailable,
            "FA operation driver returned an unexpected response",
        ),
        Err(error) => RpcFaOperationResult::Error { error },
    }
}

async fn reconcile_one_liquidity_step<Current, CurrentFuture, Resume, ResumeFuture>(
    recovery: &mut LiquidityLaunchRecovery,
    operation_active: &Arc<AtomicBool>,
    current: Current,
    resume: Resume,
) where
    Current: FnOnce() -> CurrentFuture,
    CurrentFuture: Future<Output = FaResult<Option<LiquidityOperationSnapshot>>>,
    Resume: FnOnce(LiquidityOperationId) -> ResumeFuture,
    ResumeFuture: Future<Output = FaResult<LiquidityOperationSnapshot>>,
{
    let Some(step) = recovery.next_step() else {
        return;
    };
    match step {
        LiquidityRecoveryStep::ReadCurrent => match current().await {
            Ok(operation) => recovery.record_current(operation),
            Err(error) => {
                tracing::warn!(
                    error_code = ?error.code(),
                    "FA current liquidity operation read will retry"
                );
                recovery.record_failure();
            }
        },
        LiquidityRecoveryStep::Resume { operation_id } => {
            let Some(claim) = operation_active
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .ok()
                .map(|_| FaDriverOperationClaim {
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
                    tracing::warn!(
                        error_code = ?error.code(),
                        "FA liquidity reconciliation will retry"
                    );
                    recovery.record_failure();
                }
            }
        }
    }
}

impl BridgeFaDriver {
    pub(crate) async fn eligible_payers(&self) -> RpcFaEligiblePayersResult {
        let admitted = match self
            .client
            .admitted_setup_payment_federations(FormationRunOptions::default())
            .await
        {
            Ok(admitted) => admitted,
            Err(error) => {
                return RpcFaEligiblePayersResult::Error {
                    error: fa_error_to_rpc(&error),
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
            payers.push(RpcFaEligiblePayer {
                federation_id: federation_id.0.clone(),
                balance_msats: RpcFaMsats::from(federation.get_balance().await.msats),
            });
        }
        RpcFaEligiblePayersResult::Payers { payers }
    }

    /// Manifold's authenticated setup-payment set, with join material.
    ///
    /// `eligible_payers` answers "which of my wallets may pay". This answers
    /// the prior question — "which federations may pay at all, and am I in
    /// one" — which a caller offering a join needs and cannot derive from ids.
    pub(crate) async fn setup_payment_federations(&self) -> RpcFaSetupPaymentFederationsResult {
        let admitted = match self
            .client
            .admitted_setup_payment_federations(FormationRunOptions::default())
            .await
        {
            Ok(admitted) => admitted,
            Err(error) => {
                return RpcFaSetupPaymentFederationsResult::Error {
                    error: fa_error_to_rpc(&error),
                };
            }
        };
        let federations = admitted
            .into_iter()
            .map(|member| RpcFaSetupPaymentFederation {
                // Deliberately looser than `eligible_payers`, which needs a
                // fully loaded Ready wallet to read a balance. Here a wallet
                // that exists at all is joined: offering to join a federation
                // the user is already in would be wrong even while it loads.
                joined: self
                    .federations
                    .get_federation(&member.federation_id().0)
                    .is_ok(),
                federation_id: member.federation_id().0.clone(),
                invite_code: member.invite_code().0.clone(),
            })
            .collect();
        RpcFaSetupPaymentFederationsResult::Federations { federations }
    }

    pub(crate) async fn discover_liquidity(
        &self,
        intent: RpcFaLiquidityRequestIntent,
        network: RpcFaLiquidityNetwork,
    ) -> RpcFaLiquidityDiscoveryResult {
        let intent = match liquidity_intent_from_rpc(intent) {
            Ok(intent) => intent,
            Err(error) => return RpcFaLiquidityDiscoveryResult::Error { error },
        };
        match self
            .client
            .discover_liquidity_providers(&intent, liquidity_network_from_rpc(network))
            .await
        {
            Ok(discovery) => liquidity_discovery_to_rpc(discovery),
            Err(error) => RpcFaLiquidityDiscoveryResult::Error {
                error: fa_error_to_rpc(&error),
            },
        }
    }

    pub(crate) async fn start_liquidity(
        &self,
        formation_id: String,
        provider_pubkey: String,
        intent: RpcFaLiquidityRequestIntent,
    ) -> RpcFaLiquidityOperationResult {
        let provider_pubkey = match canonical_liquidity_provider_pubkey(&provider_pubkey) {
            Ok(provider_pubkey) => provider_pubkey,
            Err(error) => return RpcFaLiquidityOperationResult::Error { error },
        };
        let intent = match liquidity_intent_from_rpc(intent) {
            Ok(intent) => intent,
            Err(error) => return RpcFaLiquidityOperationResult::Error { error },
        };
        self.commands
            .request_liquidity(FaDriverOperation::StartLiquidity {
                formation_id: FormationId(formation_id),
                provider_pubkey,
                intent,
            })
            .await
    }

    pub(crate) async fn resume_liquidity(
        &self,
        operation_id: String,
    ) -> RpcFaLiquidityOperationResult {
        self.commands
            .request_liquidity(FaDriverOperation::ResumeLiquidity {
                operation_id: LiquidityOperationId(operation_id),
            })
            .await
    }

    pub(crate) async fn liquidity_status(
        &self,
        operation_id: String,
    ) -> RpcFaLiquidityOperationResult {
        match self
            .client
            .liquidity_status(&LiquidityOperationId(operation_id))
            .await
        {
            Ok(snapshot) => liquidity_operation_result(Ok(snapshot)),
            Err(error) => liquidity_operation_result(Err(error)),
        }
    }

    pub(crate) async fn current_liquidity_operation(&self) -> RpcFaCurrentLiquidityOperationResult {
        match self.client.current_liquidity_operation().await {
            Ok(operation) => RpcFaCurrentLiquidityOperationResult::Current {
                operation: operation.map(liquidity_operation_to_rpc),
            },
            Err(error) => RpcFaCurrentLiquidityOperationResult::Error {
                error: fa_error_to_rpc(&error),
            },
        }
    }

    pub(crate) async fn list_liquidity_operations(
        &self,
        after: Option<String>,
    ) -> RpcFaLiquidityOperationPageResult {
        let after = after.map(LiquidityOperationId);
        match self
            .client
            .list_liquidity_operations(after.as_ref(), FA_LIQUIDITY_PAGE_SIZE)
            .await
        {
            Ok(page) => liquidity_operation_page_to_rpc(page),
            Err(error) => RpcFaLiquidityOperationPageResult::Error {
                error: fa_error_to_rpc(&error),
            },
        }
    }

    pub(crate) async fn update_federation_metadata(
        &self,
        update: RpcFaFederationMetadataUpdate,
    ) -> RpcFaOperationResult {
        if let Err(error) = formed_federation_id(&self.client.status()) {
            return RpcFaOperationResult::Error { error };
        }
        let update = match metadata_update_from_rpc(update) {
            Ok(update) => update,
            Err(error) => return RpcFaOperationResult::Error { error },
        };
        self.commands
            .request(FaDriverOperation::UpdateMetadata { update })
            .await
    }

    pub(crate) async fn set_guardian_fee(&self, guardian_fee_ppm: u32) -> RpcFaOperationResult {
        let send_ppm = match guardian_fee_from_rpc(guardian_fee_ppm) {
            Ok(send_ppm) => send_ppm,
            Err(error) => return RpcFaOperationResult::Error { error },
        };
        if let Err(error) = formed_federation_id(&self.client.status()) {
            return RpcFaOperationResult::Error { error };
        }
        self.commands
            .request(FaDriverOperation::SetGuardianFee { send_ppm })
            .await
    }

    pub(crate) async fn preview_selection(
        &self,
        request: RpcFaSelectionPreviewRequest,
    ) -> RpcFaSelectionPreviewResult {
        let Some(_claim) = self.commands.try_claim_operation() else {
            return RpcFaSelectionPreviewResult::Error {
                error: operation_error(
                    RpcFaErrorCode::Busy,
                    "An FA operation is already in progress",
                ),
            };
        };
        let request = match selection_request_from_rpc(request) {
            Ok(request) => request,
            Err(error) => return RpcFaSelectionPreviewResult::Error { error },
        };
        let preview = match self
            .client
            .preview_mg_selection(&request, MgDiscoveryOptions::default())
            .await
        {
            Ok(preview) => preview,
            Err(error) => {
                return RpcFaSelectionPreviewResult::Error {
                    error: fa_error_to_rpc(&error),
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
                matches!(self.client.status(), FaStatus::Formation(_)),
            )
            .await;
        RpcFaSelectionPreviewResult::Preview { preview: response }
    }

    pub(crate) async fn resume(&self) -> RpcFaOperationResult {
        self.commands.request(FaDriverOperation::Resume).await
    }

    pub(crate) async fn abandon(&self) -> RpcFaOperationResult {
        self.commands.request(FaDriverOperation::Abandon).await
    }

    pub(crate) async fn restart_dkg(&self) -> RpcFaOperationResult {
        self.commands
            .request_restart_dkg(&self.formation_state.dkg_restart_requested)
            .await
    }

    pub(crate) async fn preview_replacements(&self) -> RpcFaReplacementPreviewResult {
        let Some(_claim) = self.commands.try_claim_operation() else {
            return RpcFaReplacementPreviewResult::Error {
                error: operation_error(
                    RpcFaErrorCode::Busy,
                    "An FA operation is already in progress",
                ),
            };
        };
        let preview = match self
            .client
            .preview_mg_replacements(MgDiscoveryOptions::default())
            .await
        {
            Ok(preview) => preview,
            Err(error) => {
                return RpcFaReplacementPreviewResult::Error {
                    error: fa_error_to_rpc(&error),
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
        RpcFaReplacementPreviewResult::Preview { preview: response }
    }

    pub(crate) async fn apply_replacements(
        &self,
        preview_id: String,
        max_total_msats: u64,
    ) -> RpcFaOperationResult {
        let Some(claim) = self.commands.try_claim_operation() else {
            return operation_error_result(
                RpcFaErrorCode::Busy,
                "An FA operation is already in progress",
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
                        RpcFaErrorCode::InvalidIntent,
                        "The approved replacement spending limit cannot be changed",
                    );
                }
                approval.clone()
            } else {
                let Some(preview) = stored.preview.as_ref() else {
                    unreachable!("stored replacement has a preview or approval");
                };
                if max_total_msats == 0 || max_total_msats < preview.total_advertised_msats() {
                    return RpcFaOperationResult::Error {
                        error: fa_error_to_rpc(&FaError::SelectionReauthorizationRequired {
                            reason:
                                SelectionReauthorizationReason::AdvertisementEstimateExceedsLimit,
                            failure: None,
                        }),
                    };
                }
                let preview = stored
                    .preview
                    .take()
                    .expect("replacement preview was checked before consumption");
                let approval = match preview.approve(max_total_msats) {
                    Ok(approval) => approval,
                    Err(error) => {
                        return RpcFaOperationResult::Error {
                            error: fa_error_to_rpc(&error),
                        };
                    }
                };
                stored.approval = Some(approval.clone());
                approval
            }
        };
        let result = match self
            .commands
            .request_claimed(FaDriverOperation::ApplyReplacements { approval }, claim)
            .await
        {
            Ok(FaDriverResponse::Formation(result)) => result,
            Ok(_) => operation_error_result(
                RpcFaErrorCode::CapabilityUnavailable,
                "FA operation driver returned an unexpected response",
            ),
            Err(error) => RpcFaOperationResult::Error { error },
        };
        let may_retry = matches!(
            &result,
            RpcFaOperationResult::Error {
                error: RpcFaOperationError {
                    code: RpcFaErrorCode::Busy,
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

    pub(crate) async fn pay_and_create(
        &self,
        preview_id: String,
        intent: RpcFaFormationIntent,
        payment_federation_id: String,
        max_total_msats: u64,
    ) -> RpcFaOperationResult {
        let Some(claim) = self.commands.try_claim_operation() else {
            return operation_error_result(
                RpcFaErrorCode::Busy,
                "An FA operation is already in progress",
            );
        };
        let intent = match formation_intent_from_rpc(intent) {
            Ok(intent) => intent,
            Err(error) => return RpcFaOperationResult::Error { error },
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
                        RpcFaErrorCode::InvalidIntent,
                        "The approved setup spending limit cannot be changed",
                    );
                }
                approval.clone()
            } else {
                let Some(preview) = stored.preview.as_ref() else {
                    unreachable!("stored selection has a preview or an approval");
                };
                if max_total_msats == 0 || max_total_msats < preview.total_advertised_msats() {
                    return RpcFaOperationResult::Error {
                        error: fa_error_to_rpc(&FaError::SelectionReauthorizationRequired {
                            reason:
                                SelectionReauthorizationReason::AdvertisementEstimateExceedsLimit,
                            failure: None,
                        }),
                    };
                }
                let preview = stored
                    .preview
                    .take()
                    .expect("preview was checked immediately before consumption");
                let approval = match preview.approve(max_total_msats) {
                    Ok(approval) => approval,
                    Err(error) => {
                        return RpcFaOperationResult::Error {
                            error: fa_error_to_rpc(&error),
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
                            FaDriverOperation::PayAndCreate {
                                intent,
                                approval: Box::new(approval),
                                payment_federation_id: FederationId(payment_federation_id),
                                completion_callback,
                            },
                            claim,
                        )
                        .await
                },
                move || matches!(status_client.status(), FaStatus::Formation(_)),
            )
            .await;
        let formation_started = matches!(self.client.status(), FaStatus::Formation(_));
        if !may_retry_payer(&result) || formation_started {
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
    ) -> RpcFaOperationResult {
        let authorization = match PaymentAuthorizationId::try_from_opaque(authorization_id.clone())
        {
            Ok(authorization) => authorization,
            Err(_) => {
                return operation_error_result(
                    RpcFaErrorCode::InvalidIntent,
                    "Replacement payment authorization is invalid",
                );
            }
        };
        let status = self.client.status();
        let is_exact_post_output_action = matches!(
            &status,
            FaStatus::Formation(formation)
                if formation.payment_outputs_started
                    && matches!(
                        &formation.action_required,
                        Some(FormationActionRequired::AuthorizePayments(requirements))
                            if requirements.authorization_id.as_str() == authorization_id
                    )
        );
        if !is_exact_post_output_action {
            return operation_error_result(
                RpcFaErrorCode::InvalidIntent,
                "No exact replacement payment authorization is pending",
            );
        }
        self.commands
            .request(FaDriverOperation::AuthorizePayments {
                authorization_id: authorization,
            })
            .await
    }
}

impl BridgeFaDriver {
    /// Preview a new host for the guardian at `seat_index`, which the
    /// latest replacement check must name.
    pub(crate) async fn preview_transfer_destination(
        &self,
        seat_index: u16,
    ) -> RpcFaTransferDestinationPreviewResult {
        let receipt = self
            .client
            .observe_replacement_candidates()
            .borrow()
            .as_ref()
            .and_then(|check| check.receipt(seat_index).cloned());
        let Some(receipt) = receipt else {
            return RpcFaTransferDestinationPreviewResult::Error {
                error: replacement_not_eligible_error(),
            };
        };
        let preview = match self
            .client
            .preview_transfer_destination(MgDiscoveryOptions::default())
            .await
        {
            Ok(preview) => preview,
            Err(error) => {
                return RpcFaTransferDestinationPreviewResult::Error {
                    error: fa_error_to_rpc(&error),
                };
            }
        };
        let preview_id = hex::encode(rand::random::<[u8; 16]>());
        let response = transfer_destination_preview_to_rpc(&preview_id, &preview);
        self.formation_state
            .transfer_destination
            .lock()
            .await
            .replace(StoredTransferPreview {
                preview_id,
                receipt,
                preview,
            });
        RpcFaTransferDestinationPreviewResult::Preview { preview: response }
    }

    /// Approve the previewed destination with `max_msats` and start to move
    /// the guardian the preview was for onto a new seat there. A start uses
    /// the preview up, so a failed start needs a new preview.
    /// Approve the previewed destination with `max_msats` and start to move
    /// the guardian the preview was for onto a new seat there. A start uses
    /// the preview up, so a failed start needs a new preview. fa-client
    /// serializes the start with its other operations, so it does not take
    /// the driver's operation slot.
    pub(crate) async fn start_guardian_transfer(
        &self,
        preview_id: String,
        payment_federation_id: String,
        max_msats: u64,
    ) -> RpcFaGuardianTransferResult {
        let stored = {
            let mut stored = self.formation_state.transfer_destination.lock().await;
            match stored.take_if(|stored| stored.preview_id == preview_id) {
                Some(stored) => stored,
                None => {
                    return RpcFaGuardianTransferResult::Error {
                        error: preview_expired_error(),
                    };
                }
            }
        };
        // a zero limit approves a free seat, and only that
        if max_msats < stored.preview.advertised_price_msats() {
            return RpcFaGuardianTransferResult::Error {
                error: fa_error_to_rpc(&FaError::SelectionReauthorizationRequired {
                    reason: SelectionReauthorizationReason::AdvertisementEstimateExceedsLimit,
                    failure: None,
                }),
            };
        }
        let approval = match stored.preview.approve(max_msats) {
            Ok(approval) => approval,
            Err(error) => {
                return RpcFaGuardianTransferResult::Error {
                    error: fa_error_to_rpc(&error),
                };
            }
        };
        match self
            .client
            .request_guardian_replacement(
                &stored.receipt,
                approval,
                Some(FederationId(payment_federation_id)),
                None,
            )
            .await
        {
            Ok(transfer) => guardian_transfer_result(Ok(Some(transfer))),
            Err(ReplacementStartError::InvalidReceipt) => RpcFaGuardianTransferResult::Error {
                error: replacement_not_eligible_error(),
            },
            Err(ReplacementStartError::Transfer(error)) => guardian_transfer_result(Err(error)),
        }
    }
}

impl FaCommandSender {
    async fn request(&self, operation: FaDriverOperation) -> RpcFaOperationResult {
        match self.request_raw(operation).await {
            Ok(FaDriverResponse::Formation(result)) => result,
            Ok(_) => operation_error_result(
                RpcFaErrorCode::CapabilityUnavailable,
                "FA operation driver returned an unexpected response",
            ),
            Err(error) => RpcFaOperationResult::Error { error },
        }
    }

    async fn request_restart_dkg(&self, dkg_restart_requested: &Notify) -> RpcFaOperationResult {
        let mut attempt = 1;
        loop {
            dkg_restart_requested.notify_waiters();
            let result = self.request(FaDriverOperation::RestartDkg).await;
            // a cancelled resume releases its claim and driver lease a moment later
            let busy = matches!(
                &result,
                RpcFaOperationResult::Error { error } if matches!(error.code, RpcFaErrorCode::Busy)
            );
            if !busy || attempt == FA_RESTART_ATTEMPTS {
                return result;
            }
            attempt += 1;
            fedimint_core::task::sleep(FA_RESTART_RETRY_DELAY).await;
        }
    }

    async fn request_liquidity(
        &self,
        operation: FaDriverOperation,
    ) -> RpcFaLiquidityOperationResult {
        match self.request_raw(operation).await {
            Ok(FaDriverResponse::Liquidity(result)) => result,
            Ok(_) => RpcFaLiquidityOperationResult::Error {
                error: operation_error(
                    RpcFaErrorCode::CapabilityUnavailable,
                    "FA operation driver returned an unexpected response",
                ),
            },
            Err(error) => RpcFaLiquidityOperationResult::Error { error },
        }
    }

    async fn request_raw(
        &self,
        operation: FaDriverOperation,
    ) -> Result<FaDriverResponse, RpcFaOperationError> {
        let Some(claim) = self.try_claim_operation() else {
            return Err(operation_error(
                RpcFaErrorCode::Busy,
                "An FA operation is already in progress",
            ));
        };
        self.request_claimed(operation, claim).await
    }

    async fn request_claimed(
        &self,
        operation: FaDriverOperation,
        claim: FaDriverOperationClaim,
    ) -> Result<FaDriverResponse, RpcFaOperationError> {
        let completion = self.request_claimed_inner(operation, claim, false).await?;
        debug_assert!(completion.retained_claim.is_none());
        Ok(completion.response)
    }

    async fn request_claimed_retaining(
        &self,
        operation: FaDriverOperation,
        claim: FaDriverOperationClaim,
    ) -> Result<(FaDriverResponse, FaDriverOperationClaim), RpcFaOperationError> {
        let completion = self.request_claimed_inner(operation, claim, true).await?;
        let retained_claim = completion
            .retained_claim
            .ok_or_else(driver_unavailable_error)?;
        Ok((completion.response, retained_claim))
    }

    async fn request_claimed_inner(
        &self,
        operation: FaDriverOperation,
        claim: FaDriverOperationClaim,
        retain_claim_for_handoff: bool,
    ) -> Result<FaDriverCompletion, RpcFaOperationError> {
        let (response, receiver) = oneshot::channel();
        if self
            .sender
            .send(FaDriverCommand {
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

    fn try_claim_operation(&self) -> Option<FaDriverOperationClaim> {
        self.operation_active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| FaDriverOperationClaim {
                operation_active: self.operation_active.clone(),
            })
    }
}

/// Start the one bridge-owned FA formation and liquidity operation driver.
///
/// The task group owns the actual operation futures. Once a command has been
/// accepted, dropping its RPC response receiver does not cancel the operation.
/// Runtime shutdown cancels and drops the driver future at a durable
/// `fa-client` checkpoint.
pub(crate) fn start_fa_driver(
    runtime: &Runtime,
    client: Arc<BridgeFaClient>,
    federations: Arc<Federations>,
    push_gateway: Result<Arc<BridgeFaPushGateway>, Arc<FaPushError>>,
    environment: FaManifoldEnvironment,
) -> BridgeFaDriver {
    let (sender, receiver) = mpsc::channel(FA_DRIVER_QUEUE_CAPACITY);
    let liquidity_connector = Arc::new(BridgeLiquidityConnector::default());
    let push_gateway: FormationPushGatewayHandle =
        push_gateway.map(|gateway| gateway as Arc<dyn FormationPushGateway>);
    let formation_state = Arc::new(FormationLocalState::new(push_gateway, environment));
    // Manifold claims its own mutation guard before `open` returns. The
    // bridge claims its command queue synchronously before exposing the driver.
    let mut status = client.observe();
    let operation_active = Arc::new(AtomicBool::new(matches!(
        &*status.borrow(),
        FaStatus::Recovery { .. }
    )));
    let driver = BridgeFaDriver {
        commands: FaCommandSender {
            sender,
            operation_active: operation_active.clone(),
        },
        client: client.clone(),
        federations,
        formation_state: formation_state.clone(),
    };

    runtime
        .task_group
        .spawn_cancellable("fa-client::replacement-checks", {
            let client = client.clone();
            async move { client.run_replacement_checks().await }
        });
    runtime
        .task_group
        .spawn_cancellable("fa-client::guardian-transfer", {
            let client = client.clone();
            async move { client.run_guardian_transfer().await }
        });

    let app_state = runtime.app_state.clone();
    runtime
        .task_group
        .spawn_cancellable("fa-client::operation-driver", async move {
            if operation_active.load(Ordering::Acquire) {
                // Manifold owns lookup, backoff, and durable completion. Keep
                // the bridge command queue closed until FA status is ready.
                let _claim = FaDriverOperationClaim {
                    operation_active: operation_active.clone(),
                };
                while matches!(&*status.borrow(), FaStatus::Recovery { .. }) {
                    if status.changed().await.is_err() {
                        return;
                    }
                }
            }
            run_supervised_driver_loop(
                Arc::new(FaBackend { client, app_state }),
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
trait FaDriverBackend: MaybeSend + MaybeSync {
    fn status(&self) -> FaStatus;

    async fn execute(
        &self,
        operation: FaDriverOperation,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaDriverResponse;

    async fn current_liquidity_operation(&self) -> FaResult<Option<LiquidityOperationSnapshot>>;

    async fn resume_liquidity_on_launch(
        &self,
        operation_id: LiquidityOperationId,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaResult<LiquidityOperationSnapshot>;

    async fn sleep(&self, delay: Duration);
}

struct FaBackend {
    client: Arc<BridgeFaClient>,
    app_state: runtime::storage::AppState,
}

impl std::ops::Deref for FaBackend {
    type Target = BridgeFaClient;

    fn deref(&self) -> &Self::Target {
        &self.client
    }
}

#[apply(async_trait_maybe_send!)]
impl FaDriverBackend for FaBackend {
    fn status(&self) -> FaStatus {
        FaClient::status(self)
    }

    async fn execute(
        &self,
        operation: FaDriverOperation,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaDriverResponse {
        match operation {
            FaDriverOperation::PayAndCreate {
                intent,
                approval,
                payment_federation_id,
                completion_callback,
            } => FaDriverResponse::Formation(operation_result(match completion_callback {
                Some(completion_callback) => {
                    self.pay_and_create_with_callback(
                        intent,
                        *approval,
                        payment_federation_id,
                        completion_callback,
                        FormationRunOptions::default(),
                    )
                    .await
                }
                // no hook could be arranged: the fa-cli path, which watches
                // formation in the foreground and resumes on launch
                None => {
                    self.pay_and_create(
                        intent,
                        *approval,
                        payment_federation_id,
                        FormationRunOptions::default(),
                    )
                    .await
                }
            })),
            FaDriverOperation::ApplyReplacements { approval } => {
                FaDriverResponse::Formation(operation_result(
                    self.apply_mg_replacements(approval, FormationRunOptions::default())
                        .await,
                ))
            }
            FaDriverOperation::Abandon => FaDriverResponse::Formation(operation_result(
                self.abandon_formation(FormationRunOptions::default()).await,
            )),
            FaDriverOperation::Resume => {
                let started = fedimint_core::runtime::Instant::now();
                tracing::info!("FA resume started");
                let result = self.resume().await;
                let elapsed_ms = started.elapsed().as_millis();
                match &result {
                    Ok(()) => tracing::info!(elapsed_ms, "FA resume completed"),
                    Err(error) => {
                        let sensitive = self
                            .app_state
                            .with_read_lock(|state| state.sensitive_log.unwrap_or(false))
                            .await;
                        tracing::warn!(
                            elapsed_ms,
                            error_code = ?error.code(),
                            details = ?sensitive.then(|| error.to_string()),
                            "FA resume failed"
                        );
                    }
                }
                FaDriverResponse::Formation(operation_result(result))
            }
            FaDriverOperation::RestartDkg => FaDriverResponse::Formation(restart_dkg_result(
                self.restart_dkg(FormationRunOptions::default()).await,
            )),
            FaDriverOperation::AuthorizePayments { authorization_id } => {
                FaDriverResponse::Formation(operation_result(
                    self.authorize_payments(authorization_id, FormationRunOptions::default())
                        .await,
                ))
            }
            FaDriverOperation::StartLiquidity {
                formation_id,
                provider_pubkey,
                intent,
            } => FaDriverResponse::Liquidity(liquidity_operation_result(
                self.start_liquidity(&formation_id, &provider_pubkey, intent, liquidity_connector)
                    .await,
            )),
            FaDriverOperation::ResumeLiquidity { operation_id } => {
                FaDriverResponse::Liquidity(liquidity_operation_result(
                    self.resume_liquidity(&operation_id, liquidity_connector)
                        .await,
                ))
            }
            FaDriverOperation::UpdateMetadata { update } => {
                FaDriverResponse::Formation(operation_result(
                    self.update_federation_metadata(update, MaintenanceRunOptions::default())
                        .await,
                ))
            }
            FaDriverOperation::SetGuardianFee { send_ppm } => {
                FaDriverResponse::Formation(operation_result(
                    self.propose_guardian_fees(send_ppm, FormationRunOptions::default())
                        .await,
                ))
            }
        }
    }

    async fn current_liquidity_operation(&self) -> FaResult<Option<LiquidityOperationSnapshot>> {
        FaClient::current_liquidity_operation(self).await
    }

    async fn resume_liquidity_on_launch(
        &self,
        operation_id: LiquidityOperationId,
        liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaResult<LiquidityOperationSnapshot> {
        self.resume_liquidity(&operation_id, liquidity_connector)
            .await
    }

    async fn sleep(&self, delay: Duration) {
        fedimint_core::task::sleep(delay).await;
    }
}

async fn run_supervised_driver_loop<B: FaDriverBackend + 'static>(
    backend: Arc<B>,
    liquidity_connector: Arc<BridgeLiquidityConnector>,
    formation_state: Arc<FormationLocalState>,
    mut receiver: mpsc::Receiver<FaDriverCommand>,
    operation_active: Arc<AtomicBool>,
) {
    // Reconcile an active durable formation immediately on launch. Subsequent
    // failures use the product backoff; commands preempt only the sleep, never
    // an in-flight wallet/network effect. The one exception is a DKG restart,
    // which cancels a resume that is only polling a stuck DKG.
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
                        .map(|_| FaDriverOperationClaim {
                            operation_active: operation_active.clone(),
                        })
                    else {
                        continue;
                    };
                    let before = backend.status();
                    let result = resume_unless_dkg_restart_requested(
                        backend.as_ref(),
                        &liquidity_connector,
                        &formation_state.dkg_restart_requested,
                    )
                    .await;
                    let after = backend.status();
                    drop(claim);
                    let Some(result) = result else {
                        tracing::info!("FA formation reconciliation gave way to a DKG restart");
                        formation_retry_delay = next_retry_delay(formation_retry_delay, true);
                        continue;
                    };
                    if let FaDriverResponse::Formation(RpcFaOperationResult::Error { error }) =
                        &result
                    {
                        tracing::debug!(
                            error_code = ?error.code,
                            "FA formation reconciliation will retry"
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
        let FaDriverCommand {
            operation,
            response,
            claim,
            retain_claim_for_handoff,
        } = command;
        let rearm_liquidity = matches!(
            &operation,
            FaDriverOperation::StartLiquidity { .. } | FaDriverOperation::ResumeLiquidity { .. }
        );
        let invalidate_abandoned_formation = matches!(&operation, FaDriverOperation::Abandon);
        let before = backend.status();
        let result = backend.execute(operation, &liquidity_connector).await;
        let after = backend.status();
        let abandonment_is_durable = driver_response_is_success(&result)
            || (matches!(&before, FaStatus::Formation(_)) && matches!(&after, FaStatus::Idle));
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
        let _ = response.send(FaDriverCompletion {
            response: result,
            retained_claim,
        });
    }
}

fn should_auto_resume(status: &FaStatus) -> bool {
    match status {
        FaStatus::Formed(federation) => federation.freshness == FormationFreshness::Unsynced,
        FaStatus::Formation(formation) => {
            formation.action_required.is_none()
                && formation.last_error != Some(FaErrorCode::SelectionReauthorizationRequired)
        }
        FaStatus::Idle | FaStatus::Recovery { .. } => false,
    }
}

/// How launch recovery should keep following one liquidity operation.
enum LiquidityRecoveryPoll {
    /// Nothing more for the app to fetch or register.
    Done,
    /// Provider work or our gateway registration is in progress.
    Active,
    /// Every unfinished item is `ActionRequired`. The provider operator can
    /// still retry it to completion, so keep polling status, but slowly. On an
    /// accepted operation a resume is a signed status read (plus gateway
    /// registration once completed), never a replay of the request.
    AwaitingProviderOperator,
}

fn liquidity_recovery_poll(snapshot: &LiquidityOperationSnapshot) -> LiquidityRecoveryPoll {
    match snapshot.phase {
        LiquidityOperationPhase::Prepared => LiquidityRecoveryPoll::Active,
        LiquidityOperationPhase::Rejected => LiquidityRecoveryPoll::Done,
        LiquidityOperationPhase::Accepted => {
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
            if provider_work_is_live || gateway_registration_is_pending {
                LiquidityRecoveryPoll::Active
            } else if snapshot
                .item_statuses
                .iter()
                .any(|item| item.status == ItemAllocationStatus::ActionRequired)
            {
                LiquidityRecoveryPoll::AwaitingProviderOperator
            } else {
                LiquidityRecoveryPoll::Done
            }
        }
    }
}

/// Manifold's DKG restart takes the same run guard as resume, and a resume
/// polling a stuck DKG holds it until its run timeout.
async fn resume_unless_dkg_restart_requested<B: FaDriverBackend>(
    backend: &B,
    liquidity_connector: &BridgeLiquidityConnector,
    dkg_restart_requested: &Notify,
) -> Option<FaDriverResponse> {
    let mut resume =
        std::pin::pin!(backend.execute(FaDriverOperation::Resume, liquidity_connector));
    loop {
        tokio::select! {
            biased;
            response = &mut resume => return Some(response),
            () = dkg_restart_requested.notified() => {
                if is_waiting_on_dkg(&backend.status()) {
                    return None;
                }
            }
        }
    }
}

fn is_waiting_on_dkg(status: &FaStatus) -> bool {
    matches!(
        status,
        FaStatus::Formation(formation)
            if matches!(formation.phase, FormationPhase::PreparingDkg | FormationPhase::DkgUnderway)
                && formation.action_required.is_none()
    )
}

fn next_retry_delay(previous: Duration, progress: bool) -> Duration {
    if progress || previous.is_zero() {
        FA_RESUME_INITIAL_BACKOFF
    } else {
        previous
            .checked_mul(2)
            .unwrap_or(FA_RESUME_MAX_BACKOFF)
            .min(FA_RESUME_MAX_BACKOFF)
    }
}

#[cfg(test)]
async fn run_driver_loop<F, Fut>(mut receiver: mpsc::Receiver<FaDriverCommand>, mut execute: F)
where
    F: FnMut(FaDriverOperation) -> Fut,
    Fut: Future<Output = FaResult<()>>,
{
    while let Some(command) = receiver.recv().await {
        let FaDriverCommand {
            operation,
            response,
            claim,
            retain_claim_for_handoff,
        } = command;
        let result = FaDriverResponse::Formation(operation_result(execute(operation).await));
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
        let _ = response.send(FaDriverCompletion {
            response: result,
            retained_claim,
        });
    }
}

fn driver_unavailable_error() -> RpcFaOperationError {
    operation_error(
        RpcFaErrorCode::CapabilityUnavailable,
        "FA operation driver is unavailable",
    )
}

fn operation_error_result(
    code: RpcFaErrorCode,
    message: impl Into<String>,
) -> RpcFaOperationResult {
    RpcFaOperationResult::Error {
        error: operation_error(code, message),
    }
}

fn preview_expired_result() -> RpcFaOperationResult {
    RpcFaOperationResult::Error {
        error: preview_expired_error(),
    }
}

fn replacement_not_eligible_error() -> RpcFaOperationError {
    operation_error(
        RpcFaErrorCode::ReplacementNotEligible,
        fa_error_message(RpcFaErrorCode::ReplacementNotEligible),
    )
}

fn preview_expired_error() -> RpcFaOperationError {
    fa_error_to_rpc(&FaError::SelectionReauthorizationRequired {
        reason: SelectionReauthorizationReason::PreviewExpired,
        failure: None,
    })
}

fn operation_error(code: RpcFaErrorCode, message: impl Into<String>) -> RpcFaOperationError {
    RpcFaOperationError {
        code,
        message: message.into(),
        detail: None,
    }
}

fn driver_response_is_success(response: &FaDriverResponse) -> bool {
    matches!(
        response,
        FaDriverResponse::Formation(RpcFaOperationResult::Success)
            | FaDriverResponse::Liquidity(RpcFaLiquidityOperationResult::Operation { .. })
    )
}

fn restart_dkg_result(result: FaResult<Vec<DkgRestartResult>>) -> RpcFaOperationResult {
    operation_result(result.and_then(|seats| {
        seats.into_iter().try_for_each(|seat| match seat.result? {
            ServiceStatus::DkgInProcess | ServiceStatus::Running => Ok(()),
            status => Err(FaError::ManifoldGuardian {
                index: seat.index,
                message: format!("guardian reported {status}"),
            }),
        })
    }))
}

fn operation_result(result: FaResult<()>) -> RpcFaOperationResult {
    match result {
        Ok(()) => RpcFaOperationResult::Success,
        Err(error) => RpcFaOperationResult::Error {
            error: fa_error_to_rpc(&error),
        },
    }
}

pub fn formation_intent_from_rpc(
    intent: RpcFaFormationIntent,
) -> Result<FormationIntent, RpcFaOperationError> {
    FormationIntent::new(
        intent.federation_name.map(FederationName),
        FederationSize(intent.federation_size),
        PlanPreference::InfiniteBestEffort,
        supported_fedimintd_versions(),
    )
    .map_err(|error| fa_error_to_rpc(&error))
}

fn supported_fedimintd_versions() -> FedimintdVersionRange {
    let minimum = FEDIMINTD_MINIMUM
        .parse::<FedimintdVersion>()
        .expect("the supported minimum is a valid Fedimint version");
    let maximum = FEDIMINTD_MAXIMUM_EXCLUSIVE
        .parse::<FedimintdVersion>()
        .expect("the supported maximum is a valid Fedimint version");
    FedimintdVersionRange::new(minimum, maximum)
        .expect("the supported Fedimint version range is valid")
}

fn metadata_update_from_rpc(
    update: RpcFaFederationMetadataUpdate,
) -> Result<FederationMetadataUpdate, RpcFaOperationError> {
    let update = match update {
        RpcFaFederationMetadataUpdate::Name { value } => FederationMetadataUpdate::name(value),
        RpcFaFederationMetadataUpdate::IconUrl { value } => {
            FederationMetadataUpdate::icon_url(value)
        }
        RpcFaFederationMetadataUpdate::WelcomeMessage { value } => {
            FederationMetadataUpdate::welcome_message(value)
        }
        RpcFaFederationMetadataUpdate::TermsOfService { value } => {
            FederationMetadataUpdate::terms_of_service_url(value)
        }
        RpcFaFederationMetadataUpdate::AppSetting { setting, value } => {
            let setting = match setting {
                RpcFaAppSetting::AutojoinCommunities => FederationAppSetting::AutojoinCommunities,
                RpcFaAppSetting::DefaultGroupChats => FederationAppSetting::DefaultGroupChats,
                RpcFaAppSetting::PinnedMessage => FederationAppSetting::PinnedMessage,
                RpcFaAppSetting::DefaultCurrency => FederationAppSetting::DefaultCurrency,
                RpcFaAppSetting::StabilityPoolDisabled => {
                    FederationAppSetting::StabilityPoolDisabled
                }
                RpcFaAppSetting::MultispendDisabled => FederationAppSetting::MultispendDisabled,
                RpcFaAppSetting::InviteCodesDisabled => FederationAppSetting::InviteCodesDisabled,
                RpcFaAppSetting::NewMembersDisabled => FederationAppSetting::NewMembersDisabled,
                RpcFaAppSetting::OfflineWalletDisabled => {
                    FederationAppSetting::OfflineWalletDisabled
                }
                RpcFaAppSetting::OnchainDepositsDisabled => {
                    FederationAppSetting::OnchainDepositsDisabled
                }
                RpcFaAppSetting::MaxBalanceMsats => FederationAppSetting::MaxBalanceMsats,
                RpcFaAppSetting::MaxInvoiceMsats => FederationAppSetting::MaxInvoiceMsats,
                RpcFaAppSetting::MaxStableBalanceMsats => {
                    FederationAppSetting::MaxStableBalanceMsats
                }
            };
            FederationMetadataUpdate::app_setting(setting, value)
        }
    };
    update.map_err(|error| operation_error(RpcFaErrorCode::InvalidIntent, error.to_string()))
}

fn guardian_fee_from_rpc(value: u32) -> Result<GuardianFeePpm, RpcFaOperationError> {
    if value > MAX_GUARDIAN_FEE_PPM {
        return Err(operation_error(
            RpcFaErrorCode::InvalidIntent,
            format!("guardian fee ppm must not exceed {MAX_GUARDIAN_FEE_PPM}"),
        ));
    }
    GuardianFeePpm::try_from(value)
        .map_err(|error| operation_error(RpcFaErrorCode::InvalidIntent, error.to_string()))
}

fn formed_federation_id(status: &FaStatus) -> Result<String, RpcFaOperationError> {
    let invite = match status {
        FaStatus::Idle | FaStatus::Recovery { .. } => {
            return Err(operation_error(
                RpcFaErrorCode::NoActiveFormation,
                "No created FA federation is available for maintenance",
            ));
        }
        FaStatus::Formed(federation) if federation.freshness == FormationFreshness::Fresh => {
            &federation.federation_invite
        }
        FaStatus::Formation(_) | FaStatus::Formed(_) => {
            return Err(operation_error(
                RpcFaErrorCode::InvalidIntent,
                "Federation maintenance is available only after setup or recovery completes",
            ));
        }
    };
    let invite = FedimintInviteCode::from_str(&invite.0).map_err(|_| {
        operation_error(
            RpcFaErrorCode::Storage,
            "The created federation invite is invalid",
        )
    })?;
    Ok(invite.federation_id().to_string())
}

fn selection_request_from_rpc(
    request: RpcFaSelectionPreviewRequest,
) -> Result<MgSelectionRequest, RpcFaOperationError> {
    let plan = match request.plan {
        RpcFaPlanPreference::InfiniteBestEffort => PlanPreference::InfiniteBestEffort,
    };
    MgSelectionRequest::new(
        FederationSize(request.federation_size),
        supported_fedimintd_versions(),
        plan,
    )
    .map_err(|error| fa_error_to_rpc(&error))
}

fn selection_preview_to_rpc(
    preview_id: &str,
    preview: &MgSelectionPreview,
) -> RpcFaSelectionPreview {
    RpcFaSelectionPreview {
        preview_id: preview_id.to_owned(),
        selected: u16::try_from(preview.selected()).expect("selected count fits u16"),
        total_advertised_msats: RpcFaMsats::from(preview.total_advertised_msats()),
        seen: u32::try_from(preview.seen()).unwrap_or(u32::MAX),
        eligible: u32::try_from(preview.eligible()).unwrap_or(u32::MAX),
        valid_until: preview.valid_until().0,
        seats: preview
            .seats()
            .iter()
            .map(|seat| RpcFaSelectionPreviewSeat {
                mg_id: seat.candidate().mg_id().to_string(),
                mg_name: seat.candidate().mg_name().to_string(),
                advertised_price_msats: RpcFaMsats::from(seat.advertised_price_msats()),
                provenance: seat.provenance().code().to_owned(),
            })
            .collect(),
    }
}

fn guardian_replacement_requirements_to_rpc(
    requirements: &GuardianReplacementRequirements,
) -> RpcFaGuardianReplacementRequirements {
    RpcFaGuardianReplacementRequirements {
        replacement_id: requirements.replacement_id.as_str().to_owned(),
        seats: requirements
            .seats
            .iter()
            .map(|seat| RpcFaGuardianReplacementSeat {
                index: seat.index,
                previous_mg_id: Some(seat.previous_mg_id.to_string()),
                previous_mg_name: Some(seat.previous_mg_name().to_string()),
                previous_quote_id: hex::encode(seat.previous_quote_id.0),
                previous_locator: seat.previous_locator.to_json(),
            })
            .collect(),
    }
}

fn transfer_destination_preview_to_rpc(
    preview_id: &str,
    preview: &TransferDestinationPreview,
) -> RpcFaTransferDestinationPreview {
    let seat = preview.seat();
    RpcFaTransferDestinationPreview {
        preview_id: preview_id.to_owned(),
        mg_id: seat.candidate().mg_id().to_string(),
        mg_name: seat.candidate().mg_name().to_string(),
        advertised_price_msats: RpcFaMsats::from(preview.advertised_price_msats()),
        provenance: seat.provenance().code().to_owned(),
        valid_until: preview.valid_until().0,
    }
}

fn guardian_transfer_to_rpc(transfer: GuardianTransfer) -> RpcFaGuardianTransfer {
    RpcFaGuardianTransfer {
        seat_index: transfer.seat_index,
        source_mg_id: transfer.source_mg_id.to_string(),
        source_mg_name: MgName::from_mg_id(transfer.source_mg_id).to_string(),
        source_seat_id: transfer.source_seat_id.to_string(),
        destination_mg_id: transfer.destination_mg_id.to_string(),
        destination_mg_name: MgName::from_mg_id(transfer.destination_mg_id).to_string(),
        destination_seat_id: transfer
            .destination_seat_id
            .map(|seat_id| seat_id.to_string()),
        phase: match transfer.phase {
            GuardianTransferPhase::BuyingSeat => RpcFaGuardianTransferPhase::BuyingSeat,
            GuardianTransferPhase::AwaitingSource => RpcFaGuardianTransferPhase::AwaitingSource,
            GuardianTransferPhase::PublishingBinding => {
                RpcFaGuardianTransferPhase::PublishingBinding
            }
            GuardianTransferPhase::RemovingSource => RpcFaGuardianTransferPhase::RemovingSource,
            GuardianTransferPhase::Completed => RpcFaGuardianTransferPhase::Completed,
        },
    }
}

fn guardian_transfer_result(
    result: FaResult<Option<GuardianTransfer>>,
) -> RpcFaGuardianTransferResult {
    match result {
        Ok(transfer) => RpcFaGuardianTransferResult::Transfer {
            transfer: transfer.map(guardian_transfer_to_rpc),
        },
        Err(error) => RpcFaGuardianTransferResult::Error {
            error: fa_error_to_rpc(&error),
        },
    }
}

fn replacement_preview_to_rpc(
    preview_id: &str,
    preview: &MgReplacementPreview,
) -> RpcFaReplacementPreview {
    assert_eq!(
        preview.requirements().seats.len(),
        preview.seats().len(),
        "Manifold replacement preview keeps one verified candidate per durable row"
    );
    RpcFaReplacementPreview {
        preview_id: preview_id.to_owned(),
        requirements: guardian_replacement_requirements_to_rpc(preview.requirements()),
        total_advertised_msats: RpcFaMsats::from(preview.total_advertised_msats()),
        seats: preview
            .requirements()
            .seats
            .iter()
            .zip(preview.seats())
            .map(|(requirement, seat)| RpcFaReplacementPreviewSeat {
                index: requirement.index,
                mg_id: seat.candidate().mg_id().to_string(),
                mg_name: seat.candidate().mg_name().to_string(),
                advertised_price_msats: RpcFaMsats::from(seat.advertised_price_msats()),
                provenance: seat.provenance().code().to_owned(),
            })
            .collect(),
    }
}

fn canonical_liquidity_provider_pubkey(value: &str) -> Result<Pubkey, RpcFaOperationError> {
    value
        .parse::<PublicKey>()
        .map(|pubkey| Pubkey(pubkey.to_string()))
        .map_err(|_| {
            operation_error(
                RpcFaErrorCode::InvalidIntent,
                "The liquidity provider identity is invalid",
            )
        })
}

fn liquidity_intent_from_rpc(
    intent: RpcFaLiquidityRequestIntent,
) -> Result<LiquidityRequestIntent, RpcFaOperationError> {
    // fa-client no longer accepts a per-request provider allowlist: provider
    // trust is admitted by the Manifold registry's trust binding. Fail closed
    // rather than silently ignoring a caller-supplied restriction.
    if !intent.approved_provider_pubkeys.is_empty() {
        return Err(RpcFaOperationError {
            code: RpcFaErrorCode::InvalidIntent,
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

fn liquidity_network_from_rpc(network: RpcFaLiquidityNetwork) -> BitcoinNetwork {
    match network {
        RpcFaLiquidityNetwork::Bitcoin => BitcoinNetwork::Bitcoin,
        RpcFaLiquidityNetwork::Testnet => BitcoinNetwork::Testnet,
        RpcFaLiquidityNetwork::Signet => BitcoinNetwork::Signet,
        RpcFaLiquidityNetwork::Regtest => BitcoinNetwork::Regtest,
    }
}

fn liquidity_network_to_rpc(network: BitcoinNetwork) -> RpcFaLiquidityNetwork {
    match network {
        BitcoinNetwork::Bitcoin => RpcFaLiquidityNetwork::Bitcoin,
        BitcoinNetwork::Testnet => RpcFaLiquidityNetwork::Testnet,
        BitcoinNetwork::Signet => RpcFaLiquidityNetwork::Signet,
        BitcoinNetwork::Regtest => RpcFaLiquidityNetwork::Regtest,
    }
}

fn liquidity_source_to_rpc(source: SourceType) -> RpcFaLiquiditySource {
    match source {
        SourceType::Gateway => RpcFaLiquiditySource::Gateway,
        SourceType::StabilityPool => RpcFaLiquiditySource::StabilityPool,
    }
}

fn liquidity_discovery_to_rpc(discovery: LiquidityDiscovery) -> RpcFaLiquidityDiscoveryResult {
    let providers = discovery
        .providers
        .into_iter()
        .map(|provider| {
            let advertisement = provider.advertisement();
            RpcFaLiquidityProvider {
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
            |(provider_pubkey, rejection)| RpcFaLiquidityProviderRejection {
                provider_pubkey: provider_pubkey.map(|pubkey| pubkey.0),
                code: rejection.code().to_owned(),
            },
        )
        .collect();
    RpcFaLiquidityDiscoveryResult::Discovery {
        providers,
        rejected,
    }
}

fn liquidity_amounts_to_rpc(amounts: LiquidityAmountBounds) -> RpcFaLiquidityAmountBounds {
    RpcFaLiquidityAmountBounds {
        gateway_min_sats: amounts.gateway_min_amount.0,
        gateway_max_sats: amounts.gateway_max_amount.map(|amount| amount.0),
        stability_min_sats: amounts.stability_min_amount.0,
        stability_max_sats: amounts.stability_max_amount.map(|amount| amount.0),
    }
}

fn liquidity_item_phase_to_rpc(phase: ItemAllocationStatus) -> RpcFaLiquidityItemPhase {
    match phase {
        ItemAllocationStatus::Pending => RpcFaLiquidityItemPhase::Pending,
        ItemAllocationStatus::Running => RpcFaLiquidityItemPhase::Running,
        ItemAllocationStatus::ActionRequired => RpcFaLiquidityItemPhase::ActionRequired,
        ItemAllocationStatus::Completed => RpcFaLiquidityItemPhase::Completed,
        ItemAllocationStatus::Failed => RpcFaLiquidityItemPhase::Failed,
        ItemAllocationStatus::Cancelled => RpcFaLiquidityItemPhase::Cancelled,
    }
}

fn liquidity_item_to_rpc(item: AllocationItemStatus) -> RpcFaLiquidityItemStatus {
    let target = match item.target {
        AllocationItemTarget::Gateway {
            item_id,
            gateway_id,
            gateway_name,
            amount,
        } => RpcFaLiquidityItemTarget::Gateway {
            item_id: item_id.0,
            gateway_id: gateway_id.0,
            gateway_name: gateway_name.0,
            amount_sats: amount.0,
        },
        AllocationItemTarget::StabilityPool { item_id, amount } => {
            RpcFaLiquidityItemTarget::StabilityPool {
                item_id: item_id.0,
                amount_sats: amount.0,
            }
        }
    };
    let completion_evidence = item.completion_evidence.map(|evidence| match evidence {
        CompletionEvidence::Gateway(evidence) => RpcFaLiquidityCompletionEvidence::Gateway {
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
            RpcFaLiquidityCompletionEvidence::StabilityPool {
                fulfilled_sats: evidence.fulfilled_amount.0,
                observed_provided_sats: evidence.observed_provided_amount.0,
                observed_at: evidence.observed_at.0,
                peg_in_operation_id: evidence.peg_in_operation_id,
                stability_pool_deposit_operation_id: evidence.stability_pool_deposit_operation_id,
            }
        }
    });
    RpcFaLiquidityItemStatus {
        target,
        phase: liquidity_item_phase_to_rpc(item.status),
        fulfilled_sats: item.fulfilled_amount.map(|amount| amount.0),
        completion_evidence,
        failure_code: item.failure.map(|failure| failure.code.to_string()),
        updated_at: item.updated_at.0,
    }
}

fn liquidity_failure_log_code(code: &LiquidityFailureCode) -> &str {
    match code {
        // Future codes are opaque remote text, not safe diagnostic fields.
        LiquidityFailureCode::Unknown(_) => "unknown",
        known => known.as_str(),
    }
}

fn liquidity_operation_to_rpc(snapshot: LiquidityOperationSnapshot) -> RpcFaLiquidityOperation {
    if let Some(code) = &snapshot.rejection_code {
        tracing::warn!(request_id = %snapshot.operation_id.0, provider = %snapshot.provider_pubkey.0,
            rejection_code = %code, "FLIP rejected liquidity request");
    }
    for item in &snapshot.item_statuses {
        if matches!(
            item.status,
            ItemAllocationStatus::Failed
                | ItemAllocationStatus::ActionRequired
                | ItemAllocationStatus::Cancelled
        ) {
            tracing::warn!(request_id = %snapshot.operation_id.0, provider = %snapshot.provider_pubkey.0,
                status = ?item.status, failure_code = ?item.failure.as_ref().map(|failure| liquidity_failure_log_code(&failure.code)),
                "FLIP liquidity provisioning needs attention");
        }
    }
    RpcFaLiquidityOperation {
        operation_id: snapshot.operation_id.0,
        formation_id: snapshot.formation_id.0,
        provider_pubkey: snapshot.provider_pubkey.0,
        endpoint_hint: snapshot.endpoint_hint.map(|url| url.0),
        details_payload_hash: hex::encode(snapshot.details_payload_hash.0),
        amounts: liquidity_amounts_to_rpc(snapshot.amounts),
        phase: match snapshot.phase {
            LiquidityOperationPhase::Prepared => RpcFaLiquidityOperationPhase::Prepared,
            LiquidityOperationPhase::Accepted => RpcFaLiquidityOperationPhase::Accepted,
            LiquidityOperationPhase::Rejected => RpcFaLiquidityOperationPhase::Rejected,
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
    result: FaResult<LiquidityOperationSnapshot>,
) -> RpcFaLiquidityOperationResult {
    match result {
        Ok(snapshot) => RpcFaLiquidityOperationResult::Operation {
            operation: liquidity_operation_to_rpc(snapshot),
        },
        Err(error) => {
            tracing::warn!(error_code = ?error.code(), "an FA liquidity operation failed");
            RpcFaLiquidityOperationResult::Error {
                error: fa_error_to_rpc(&error),
            }
        }
    }
}

fn liquidity_operation_page_to_rpc(
    page: LiquidityOperationPage,
) -> RpcFaLiquidityOperationPageResult {
    RpcFaLiquidityOperationPageResult::Page {
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

pub fn fa_status_to_rpc(status: FaStatus) -> RpcFaStatus {
    match status {
        FaStatus::Idle => RpcFaStatus::Idle,
        FaStatus::Recovery { last_error } => RpcFaStatus::Recovery {
            error: last_error.map(|code| {
                let code = fa_error_code_to_rpc(code);
                operation_error(code, fa_error_message(code))
            }),
        },
        FaStatus::Formation(formation) => RpcFaStatus::Formation {
            formation: Box::new(formation_snapshot_to_rpc(formation)),
        },
        FaStatus::Formed(federation) => RpcFaStatus::Formed {
            federation: Box::new(formed_federation_to_rpc(federation)),
        },
    }
}

fn formed_federation_to_rpc(federation: FormedFederationSnapshot) -> RpcFaFormedFederation {
    RpcFaFormedFederation {
        formation_id: federation.formation_id.0,
        federation_invite: federation.federation_invite.0,
        federation_name: federation.federation_name.map(|name| name.0),
        seats: federation
            .seats
            .into_iter()
            .map(|seat| RpcFaFormedSeat {
                mg_id: seat.mg_identity.to_string(),
                mg_name: fa_client::MgName::from_mg_id(seat.mg_identity).to_string(),
                seat_id: seat.seat_id.to_string(),
                locator: seat.locator.to_json(),
            })
            .collect(),
        freshness: formation_freshness_to_rpc(federation.freshness),
        backup_eligible: federation.backup_eligible,
        origin: match federation.origin {
            FormedOrigin::ThisDevice => RpcFaFormedOrigin::ThisDevice,
            FormedOrigin::Backup => RpcFaFormedOrigin::Backup,
        },
    }
}

/// Convert the FA watch channel into the typed subscription contract.
///
/// `WatchStream` emits the receiver's current value first. An FA
/// initialization failure is likewise a first-class one-item stream value,
/// rather than a rejected registration that leaves the caller waiting.
pub fn fa_client_status_stream(
    receiver: Result<watch::Receiver<FaStatus>, RpcFaOperationError>,
) -> BoxStream<'static, RpcFaClientStatus> {
    match receiver {
        Ok(receiver) => WatchStream::new(receiver)
            .map(|status| RpcFaClientStatus::Ready {
                status: fa_status_to_rpc(status),
            })
            .boxed(),
        Err(error) => stream::once(async move { RpcFaClientStatus::Failed { error } }).boxed(),
    }
}

pub fn fa_replacement_candidates_stream(
    receiver: Result<watch::Receiver<Option<Arc<ReplacementCheck>>>, RpcFaOperationError>,
) -> BoxStream<'static, RpcFaReplacementCandidates> {
    match receiver {
        Ok(receiver) => WatchStream::new(receiver)
            .map(|check| RpcFaReplacementCandidates::Ready {
                check: check.as_deref().map(replacement_check_to_rpc),
            })
            .boxed(),
        Err(error) => {
            stream::once(async move { RpcFaReplacementCandidates::Failed { error } }).boxed()
        }
    }
}

/// The open guardian transfer, then every change. A completed move stays
/// `completed` until the next start.
pub fn fa_guardian_transfer_stream(
    receiver: Result<watch::Receiver<Option<GuardianTransfer>>, RpcFaOperationError>,
) -> BoxStream<'static, RpcFaGuardianTransferResult> {
    match receiver {
        Ok(receiver) => WatchStream::new(receiver)
            .map(|transfer| guardian_transfer_result(Ok(transfer)))
            .boxed(),
        Err(error) => {
            stream::once(async move { RpcFaGuardianTransferResult::Error { error } }).boxed()
        }
    }
}

fn replacement_check_to_rpc(check: &ReplacementCheck) -> RpcFaReplacementCheck {
    RpcFaReplacementCheck {
        blocking_liquidity_operation: check
            .blocking_liquidity_operation
            .as_ref()
            .map(|id| id.0.clone()),
        federation_id: check.federation_id.0.clone(),
        checked_at: check.checked_at,
        candidates: check
            .candidates
            .iter()
            .map(replacement_candidate_to_rpc)
            .collect(),
    }
}

fn replacement_candidate_to_rpc(candidate: &ReplacementCandidate) -> RpcFaReplacementCandidate {
    RpcFaReplacementCandidate {
        seat_index: candidate.seat_index,
        mg_id: candidate.mg_id.to_string(),
        mg_name: MgName::from_mg_id(candidate.mg_id).to_string(),
        reasons: candidate
            .reasons
            .iter()
            .map(|reason| match *reason {
                ReplacementReason::Offline { last_seen_secs } => {
                    RpcFaReplacementReason::Offline { last_seen_secs }
                }
                ReplacementReason::MissedSessions { sessions } => {
                    RpcFaReplacementReason::MissedSessions { sessions }
                }
                ReplacementReason::Disconnected => RpcFaReplacementReason::Disconnected,
                ReplacementReason::LowWeekScore { basis_points } => {
                    RpcFaReplacementReason::LowWeekScore { basis_points }
                }
                ReplacementReason::LowMonthScore { basis_points } => {
                    RpcFaReplacementReason::LowMonthScore { basis_points }
                }
                ReplacementReason::HolderRevoked => RpcFaReplacementReason::HolderRevoked,
            })
            .collect(),
    }
}

pub fn formation_snapshot_to_rpc(snapshot: FormationSnapshot) -> RpcFaFormationSnapshot {
    let milestones = formation_milestones(&snapshot);
    let selected_post_output = snapshot.payment_outputs_started;
    RpcFaFormationSnapshot {
        formation_id: snapshot.formation_id.0,
        phase: match snapshot.phase {
            FormationPhase::Preparing => RpcFaFormationPhase::Preparing,
            FormationPhase::AwaitingPaymentReadiness => {
                RpcFaFormationPhase::AwaitingPaymentReadiness
            }
            FormationPhase::AcquiringSeats => RpcFaFormationPhase::AcquiringSeats,
            FormationPhase::PreparingDkg => RpcFaFormationPhase::PreparingDkg,
            FormationPhase::DkgUnderway => RpcFaFormationPhase::DkgUnderway,
            FormationPhase::DkgComplete => RpcFaFormationPhase::DkgComplete,
            FormationPhase::PublishingSeatBindings => RpcFaFormationPhase::PublishingSeatBindings,
        },
        intent: resolved_formation_intent_to_rpc(snapshot.intent),
        seats: snapshot
            .seats
            .into_iter()
            .map(|seat| RpcFaSeatProgress {
                index: seat.index,
                mg_id: Some(seat.mg_id.to_string()),
                mg_name: Some(seat.mg_name().to_string()),
                locator: seat.locator.to_json(),
                seat_id: seat.seat_id.map(|seat_id| seat_id.to_string()),
                guardian_code: seat.guardian_code.map(|code| code.0),
                phase: match seat.phase {
                    SeatPhase::Selected => RpcFaSeatPhase::Selected,
                    SeatPhase::ReplacementRequired => RpcFaSeatPhase::ReplacementRequired,
                    SeatPhase::QuoteReady => RpcFaSeatPhase::QuoteReady,
                    SeatPhase::Acquiring => RpcFaSeatPhase::Acquiring,
                    SeatPhase::Created => RpcFaSeatPhase::Created,
                    SeatPhase::GuardianCodeReady => RpcFaSeatPhase::GuardianCodeReady,
                    SeatPhase::DkgUnderway => RpcFaSeatPhase::DkgUnderway,
                    SeatPhase::Running => RpcFaSeatPhase::Running,
                },
                freshness: formation_freshness_to_rpc(seat.freshness),
            })
            .collect(),
        freshness: formation_freshness_to_rpc(snapshot.freshness),
        action_required: snapshot.action_required.map(|action| match action {
            FormationActionRequired::AuthorizePayments(requirements) => {
                let requirements = RpcFaPaymentRequirements {
                    authorization_id: requirements.authorization_id.as_str().to_owned(),
                    total_msats: RpcFaMsats::from(requirements.total_msats),
                    max_total_msats: requirements.max_total_msats.map(RpcFaMsats::from),
                    seats: requirements
                        .seats
                        .into_iter()
                        .map(|requirement| RpcFaSeatPaymentRequirement {
                            index: requirement.index,
                            mg_id: Some(requirement.mg_id.to_string()),
                            mg_name: Some(requirement.mg_name().to_string()),
                            quote_id: hex::encode(requirement.quote_id.0),
                            payment_federation_id: requirement.payment_federation_id.0,
                            amount_msats: RpcFaMsats::from(requirement.amount_msats),
                        })
                        .collect(),
                };
                if selected_post_output {
                    RpcFaFormationActionRequired::AuthorizeReplacementPayments { requirements }
                } else {
                    RpcFaFormationActionRequired::AuthorizePayments { requirements }
                }
            }
            FormationActionRequired::ReplaceGuardians(requirements) => {
                RpcFaFormationActionRequired::ReplaceGuardians {
                    requirements: guardian_replacement_requirements_to_rpc(&requirements),
                }
            }
        }),
        payment_outputs_started: snapshot.payment_outputs_started,
        milestones,
        invite_code: snapshot.invite_code.map(|code| code.0),
        last_error: snapshot.last_error.map(fa_error_code_to_rpc),
    }
}

fn resolved_formation_intent_to_rpc(
    intent: ResolvedFormationIntent,
) -> RpcFaResolvedFormationIntent {
    RpcFaResolvedFormationIntent {
        federation_name: intent.federation_name.0,
        federation_size: intent.federation_size.0,
        // Formation is zero-fee by upstream construction: guardian fees are a
        // post-formation maintenance operation, and fa-client no longer
        // carries a per-intent fee. The field stays for binding stability.
        guardian_fee_ppm: 0,
        plan: match intent.plan {
            PlanPreference::InfiniteBestEffort => RpcFaPlanPreference::InfiniteBestEffort,
        },
        max_total_msats: intent.max_total_msats.map(RpcFaMsats::from),
    }
}

fn formation_milestones(snapshot: &FormationSnapshot) -> RpcFaFormationMilestones {
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
    RpcFaFormationMilestones {
        ecash_sent,
        guardians_confirmed,
    }
}

fn formation_freshness_to_rpc(freshness: FormationFreshness) -> RpcFaFormationFreshness {
    match freshness {
        FormationFreshness::Fresh => RpcFaFormationFreshness::Fresh,
        FormationFreshness::Unsynced => RpcFaFormationFreshness::Unsynced,
    }
}

pub(crate) fn fa_error_to_rpc(error: &FaError) -> RpcFaOperationError {
    let code = fa_error_code_to_rpc(error.code());
    RpcFaOperationError {
        code,
        message: fa_error_message(code).to_owned(),
        detail: fa_error_detail_to_rpc(error),
    }
}

pub(crate) fn fa_push_error_to_rpc(error: &FaPushError) -> RpcFaOperationError {
    RpcFaOperationError {
        code: RpcFaErrorCode::PushNotifications,
        message: error.to_string(),
        detail: None,
    }
}

fn fa_error_detail_to_rpc(error: &FaError) -> Option<RpcFaOperationErrorDetail> {
    match error {
        FaError::LiquidityOperationExists { .. } => {
            Some(RpcFaOperationErrorDetail::LiquidityOperationExists)
        }
        FaError::MaintenanceUnsupported { .. } => {
            Some(RpcFaOperationErrorDetail::MaintenanceUnsupported)
        }
        FaError::InsufficientMgSeats {
            requested,
            selected,
            seen,
            eligible,
        } => Some(RpcFaOperationErrorDetail::InsufficientMgSeats {
            requested: *requested,
            selected: *selected,
            seen: u32::try_from(*seen).unwrap_or(u32::MAX),
            eligible: u32::try_from(*eligible).unwrap_or(u32::MAX),
        }),
        FaError::SelectionReauthorizationRequired { reason, .. } => Some(
            RpcFaOperationErrorDetail::SelectionReauthorizationRequired {
                reason: selection_reauthorization_reason_to_rpc(*reason),
            },
        ),
        FaError::AbandonUnavailable(reason) => {
            Some(RpcFaOperationErrorDetail::AbandonUnavailable {
                reason: match reason {
                    AbandonUnavailableReason::PaymentOutputsStarted => {
                        RpcFaAbandonUnavailableReason::PaymentOutputsStarted
                    }
                    AbandonUnavailableReason::DkgComplete => {
                        RpcFaAbandonUnavailableReason::DkgComplete
                    }
                },
            })
        }
        _ => None,
    }
}

fn selection_reauthorization_reason_to_rpc(
    reason: SelectionReauthorizationReason,
) -> RpcFaSelectionReauthorizationReason {
    match reason {
        SelectionReauthorizationReason::PreviewExpired => {
            RpcFaSelectionReauthorizationReason::PreviewExpired
        }
        SelectionReauthorizationReason::AdvertisementEstimateExceedsLimit => {
            RpcFaSelectionReauthorizationReason::AdvertisementEstimateExceedsLimit
        }
        SelectionReauthorizationReason::SelectedMgUnavailable => {
            RpcFaSelectionReauthorizationReason::SelectedMgUnavailable
        }
        SelectionReauthorizationReason::QuoteTotalExceedsLimit => {
            RpcFaSelectionReauthorizationReason::QuoteTotalExceedsLimit
        }
        SelectionReauthorizationReason::QuoteTermsChanged => {
            RpcFaSelectionReauthorizationReason::QuoteTermsChanged
        }
        SelectionReauthorizationReason::SelectedPayerUnavailable => {
            RpcFaSelectionReauthorizationReason::SelectedPayerUnavailable
        }
        SelectionReauthorizationReason::PaymentFederationRequired => {
            RpcFaSelectionReauthorizationReason::PaymentFederationRequired
        }
        SelectionReauthorizationReason::SelectedPayerInsufficientFunds => {
            RpcFaSelectionReauthorizationReason::SelectedPayerInsufficientFunds
        }
        SelectionReauthorizationReason::VerifierEnvironmentChanged => {
            RpcFaSelectionReauthorizationReason::VerifierEnvironmentChanged
        }
    }
}

fn fa_error_message(code: RpcFaErrorCode) -> &'static str {
    match code {
        RpcFaErrorCode::InvalidIntent => "The federation formation request is invalid",
        RpcFaErrorCode::InvalidOptions => "The FA operation options are invalid",
        RpcFaErrorCode::Storage => "FA storage is unavailable",
        RpcFaErrorCode::Identity => "FA identity is unavailable",
        RpcFaErrorCode::Busy => "An FA operation is already in progress",
        RpcFaErrorCode::NoActiveFormation => "There is no active FA formation",
        RpcFaErrorCode::AbandonUnavailable => "The formation can no longer be abandoned",
        RpcFaErrorCode::Registry => "The Manifold Guardian registry is unavailable",
        RpcFaErrorCode::Selection => "A verified Manifold Guardian set could not be selected",
        RpcFaErrorCode::SelectionReauthorizationRequired => {
            "Fresh federation setup authorization is required"
        }
        RpcFaErrorCode::CapabilityUnavailable => "A required FA capability is unavailable",
        RpcFaErrorCode::InvalidManifoldGuardians => "The Manifold Guardian set is invalid",
        RpcFaErrorCode::ManifoldGuardian => "A Manifold Guardian operation failed",
        RpcFaErrorCode::Payment => "An FA payment operation failed",
        RpcFaErrorCode::Liquidity => "An FA liquidity operation failed",
        RpcFaErrorCode::MaintenanceWrongState => {
            "Federation maintenance is unavailable in the current state"
        }
        RpcFaErrorCode::MaintenanceRejected => "A guardian rejected the maintenance request",
        RpcFaErrorCode::MaintenanceConsensusTooLarge => {
            "The federation metadata exceeds the allowed size"
        }
        RpcFaErrorCode::MaintenanceConsensusInvalid => "The federation metadata is invalid",
        RpcFaErrorCode::MaintenanceConvergence => {
            "Could not confirm the change; it may still take effect. Retry to check."
        }
        RpcFaErrorCode::PushNotifications => "FA push notification setup failed",
        RpcFaErrorCode::Timeout => "The FA operation timed out",
        RpcFaErrorCode::ReplacementNotEligible => {
            "The guardian is not a replacement candidate of the latest check"
        }
    }
}

fn fa_error_code_to_rpc(error: FaErrorCode) -> RpcFaErrorCode {
    match error {
        FaErrorCode::InvalidIntent => RpcFaErrorCode::InvalidIntent,
        FaErrorCode::InvalidOptions => RpcFaErrorCode::InvalidOptions,
        FaErrorCode::Storage => RpcFaErrorCode::Storage,
        FaErrorCode::Identity => RpcFaErrorCode::Identity,
        FaErrorCode::Busy => RpcFaErrorCode::Busy,
        FaErrorCode::NoActiveFormation => RpcFaErrorCode::NoActiveFormation,
        FaErrorCode::AbandonUnavailable => RpcFaErrorCode::AbandonUnavailable,
        FaErrorCode::Registry => RpcFaErrorCode::Registry,
        FaErrorCode::Selection => RpcFaErrorCode::Selection,
        FaErrorCode::SelectionReauthorizationRequired => {
            RpcFaErrorCode::SelectionReauthorizationRequired
        }
        FaErrorCode::CapabilityUnavailable => RpcFaErrorCode::CapabilityUnavailable,
        FaErrorCode::InvalidManifoldGuardians => RpcFaErrorCode::InvalidManifoldGuardians,
        FaErrorCode::ManifoldGuardian => RpcFaErrorCode::ManifoldGuardian,
        FaErrorCode::Payment => RpcFaErrorCode::Payment,
        FaErrorCode::Liquidity => RpcFaErrorCode::Liquidity,
        FaErrorCode::MaintenanceWrongState => RpcFaErrorCode::MaintenanceWrongState,
        FaErrorCode::MaintenanceRejected => RpcFaErrorCode::MaintenanceRejected,
        FaErrorCode::MaintenanceConsensusTooLarge => RpcFaErrorCode::MaintenanceConsensusTooLarge,
        FaErrorCode::MaintenanceConsensusInvalid => RpcFaErrorCode::MaintenanceConsensusInvalid,
        FaErrorCode::MaintenanceConvergence => RpcFaErrorCode::MaintenanceConvergence,
        FaErrorCode::Timeout => RpcFaErrorCode::Timeout,
    }
}

pub(crate) fn fa_client_status_to_rpc(
    client: &Result<Arc<BridgeFaClient>, Arc<FaError>>,
) -> RpcFaClientStatus {
    match client {
        Ok(client) => RpcFaClientStatus::Ready {
            status: fa_status_to_rpc(client.status()),
        },
        Err(error) => RpcFaClientStatus::Failed {
            error: fa_error_to_rpc(error),
        },
    }
}

#[cfg(test)]
mod tests;
