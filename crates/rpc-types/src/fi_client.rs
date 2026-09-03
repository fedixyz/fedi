//! Fedi bridge types for the consumer-facing Federation Initiator API.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Exact millisatoshi quantity at the JSON/JavaScript boundary.
///
/// The bridge serializes every FI monetary value as a base-10 string so values
/// above JavaScript's safe integer limit cannot be rounded before a consumer
/// converts them to `bigint`.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, TS)]
#[ts(export, type = "string")]
pub struct RpcFiMsats(pub u64);

impl From<u64> for RpcFiMsats {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

impl Serialize for RpcFiMsats {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.0.to_string())
    }
}

impl<'de> Deserialize<'de> for RpcFiMsats {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        value
            .parse::<u64>()
            .map(Self)
            .map_err(serde::de::Error::custom)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiPlanPreference {
    InfiniteBestEffort,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiFormationIntent {
    pub federation_name: Option<String>,
    pub federation_size: u16,
    pub plan: RpcFiPlanPreference,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiSelectionPreviewRequest {
    pub federation_size: u16,
    pub plan: RpcFiPlanPreference,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiSelectionPreviewSeat {
    pub fman_id: String,
    /// Two-word display name derived from `fman_id`; names can collide and
    /// never substitute for the id.
    pub fman_name: String,
    pub advertised_price_msats: RpcFiMsats,
    pub provenance: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiSelectionPreview {
    /// Opaque, process-local handle to the sealed verified selection.
    pub preview_id: String,
    pub selected: u16,
    pub total_advertised_msats: RpcFiMsats,
    pub seen: u32,
    pub eligible: u32,
    #[ts(type = "number")]
    pub valid_until: u64,
    pub seats: Vec<RpcFiSelectionPreviewSeat>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiSelectionPreviewResult {
    Preview { preview: RpcFiSelectionPreview },
    Error { error: RpcFiOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiGuardianReplacementSeat {
    pub index: u16,
    /// Badge-vouched identity of the outgoing FMan; absent for pinned FMans.
    pub previous_fman_id: Option<String>,
    /// Two-word display name derived from `previous_fman_id`.
    pub previous_fman_name: Option<String>,
    pub previous_quote_id: String,
    /// Canonical versioned Fleet Manager locator JSON retained for audit.
    pub previous_locator: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiGuardianReplacementRequirements {
    /// Opaque binding to exactly the durable rows proven safe to replace.
    pub replacement_id: String,
    pub seats: Vec<RpcFiGuardianReplacementSeat>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiReplacementPreviewSeat {
    /// Stable formation row this verified FMan will replace.
    pub index: u16,
    pub fman_id: String,
    /// Two-word display name derived from `fman_id`; names can collide and
    /// never substitute for the id.
    pub fman_name: String,
    pub advertised_price_msats: RpcFiMsats,
    pub provenance: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiReplacementPreview {
    /// Opaque process-local handle to this fresh verified replacement subset.
    pub preview_id: String,
    pub requirements: RpcFiGuardianReplacementRequirements,
    pub total_advertised_msats: RpcFiMsats,
    pub seats: Vec<RpcFiReplacementPreviewSeat>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiReplacementPreviewResult {
    Preview { preview: RpcFiReplacementPreview },
    Error { error: RpcFiOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiEligiblePayer {
    /// A federation is eligible only when Manifold's authenticated setup-
    /// payment policy admits it and Fedi has the joined wallet fully loaded in
    /// `Ready` state. Joined zero-balance wallets remain present so callers can
    /// route through the existing refill flow; loading, recovering, and
    /// unadmitted federations are omitted.
    pub federation_id: String,
    /// Current joined-wallet balance. Zero does not remove an admitted payer.
    pub balance_msats: RpcFiMsats,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiEligiblePayersResult {
    Payers { payers: Vec<RpcFiEligiblePayer> },
    Error { error: RpcFiOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiSetupPaymentFederation {
    /// Canonical id Manifold derived from `invite_code` when it admitted the
    /// signed setup-payment publication.
    pub federation_id: String,
    /// The signed public invite this federation is admitted under. Present for
    /// every member, joined or not, because a caller offering an unjoined
    /// federation needs join material and an id cannot be turned back into one.
    pub invite_code: String,
    /// Whether Fedi already holds a wallet for this federation. A joined member
    /// is a payer candidate; an unjoined one is a join candidate. Joined here
    /// says nothing about balance — use `fiClientEligiblePayers` for that.
    pub joined: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
/// Manifold's authenticated setup-payment federation set.
///
/// `Federations` may be empty and that is a valid authenticated answer: it is
/// the publisher stopping all new paid setup, not a failure. Callers must not
/// substitute any other federation list when it is empty.
pub enum RpcFiSetupPaymentFederationsResult {
    Federations {
        federations: Vec<RpcFiSetupPaymentFederation>,
    },
    Error {
        error: RpcFiOperationError,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
/// One FI-authorized, post-formation federation metadata mutation.
///
/// Values are validated again by Manifold before any guardian is contacted.
/// `WelcomeMessage` is also the federation description shown by Fedi.
/// `TermsOfService` selects Guardianito's fixed approved document; callers
/// cannot provide an arbitrary terms URL.
pub enum RpcFiFederationMetadataUpdate {
    Name { value: String },
    IconUrl { value: String },
    WelcomeMessage { value: String },
    TermsOfService,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiFormationPhase {
    Preparing,
    AwaitingPaymentReadiness,
    AcquiringSeats,
    PreparingDkg,
    DkgUnderway,
    PublishingSeatBindings,
    Formed,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiFormationFreshness {
    Fresh,
    Unsynced,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiSeatPhase {
    Selected,
    ReplacementRequired,
    QuoteReady,
    Acquiring,
    Created,
    GuardianCodeReady,
    DkgUnderway,
    Running,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiErrorCode {
    InvalidIntent,
    InvalidOptions,
    Storage,
    Identity,
    Busy,
    NoActiveFormation,
    AbandonUnavailable,
    Registry,
    Selection,
    SelectionReauthorizationRequired,
    CapabilityUnavailable,
    InvalidFleetManagers,
    FleetManager,
    Payment,
    Liquidity,
    MaintenanceWrongState,
    MaintenanceRejected,
    MaintenanceConsensusTooLarge,
    MaintenanceConsensusInvalid,
    MaintenanceConvergence,
    PushNotifications,
    Timeout,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiLiquidityNetwork {
    Bitcoin,
    Testnet,
    Signet,
    Regtest,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiLiquiditySource {
    Gateway,
    StabilityPool,
}

/// Exact source bounds for one post-formation liquidity request.
///
/// At least one minimum must be positive. A source with a zero minimum must
/// have no maximum; when present, a maximum must be at least its minimum.
/// Gateway-only is the Fedi MVP flow. Stability-pool amounts are retained for
/// a separately authorized administrative operation, never formation itself.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiLiquidityAmountBounds {
    #[ts(type = "number")]
    pub gateway_min_sats: u64,
    #[ts(type = "number | null")]
    pub gateway_max_sats: Option<u64>,
    #[ts(type = "number")]
    pub stability_min_sats: u64,
    #[ts(type = "number | null")]
    pub stability_max_sats: Option<u64>,
}

/// Consumer policy for fresh provider discovery and one exact request.
///
/// Provider keys are canonical Nostr public keys. An empty allowlist permits
/// any provider admitted by the selected Manifold environment; a non-empty
/// list adds an application policy restriction after Manifold's trust checks.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiLiquidityRequestIntent {
    pub amounts: RpcFiLiquidityAmountBounds,
    pub approved_provider_pubkeys: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiLiquidityProvider {
    pub provider_pubkey: String,
    pub supported_sources: Vec<RpcFiLiquiditySource>,
    pub supported_networks: Vec<RpcFiLiquidityNetwork>,
    pub display_name: Option<String>,
    pub website: Option<String>,
    pub contact: Option<String>,
    #[ts(type = "number")]
    pub issued_at: u64,
    #[ts(type = "number")]
    pub expires_at: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiLiquidityProviderRejection {
    pub provider_pubkey: Option<String>,
    pub code: String,
}

/// Result of fresh, uncached, no-private-data provider discovery.
///
/// Re-entering a flow should discover again. Rejected candidates are safe
/// policy diagnostics; no federation invite has been disclosed at this point.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiLiquidityDiscoveryResult {
    Discovery {
        providers: Vec<RpcFiLiquidityProvider>,
        rejected: Vec<RpcFiLiquidityProviderRejection>,
    },
    Error {
        error: RpcFiOperationError,
    },
}

/// Provider decision for this exact semantic request.
///
/// `Prepared` is durable and recoverable, `Accepted` exposes per-item progress,
/// and `Rejected` is terminal for this exact intent but never a formation
/// failure.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiLiquidityOperationPhase {
    Prepared,
    Accepted,
    Rejected,
}

/// Provider-authoritative progress for one requested source.
///
/// Consumers may derive ready only after every requested item is `Completed`
/// and its evidence has been independently checked through the federation.
/// `ActionRequired` remains visible for an operator decision and is not an
/// automatic-retry signal.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiLiquidityItemPhase {
    Pending,
    Running,
    ActionRequired,
    Completed,
    Failed,
    Cancelled,
}

/// Provider allocation target.
///
/// A gateway id is the provider protocol's opaque allocation identity. It is
/// not the identity returned by the app's existing `listGateways` RPC; verify
/// the resulting gateway independently through the joined federation.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiLiquidityItemTarget {
    Gateway {
        item_id: String,
        gateway_id: String,
        gateway_name: String,
        #[ts(type = "number")]
        amount_sats: u64,
    },
    StabilityPool {
        item_id: String,
        #[ts(type = "number")]
        amount_sats: u64,
    },
}

/// Provider-authored completion evidence for independent federation checks.
///
/// Presence is not proof that the app-visible gateway or stability balance is
/// ready. Consumers must verify the claimed result through the joined
/// federation before presenting completion to the user.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiLiquidityCompletionEvidence {
    Gateway {
        gateway_id: String,
        #[ts(type = "number")]
        fulfilled_sats: u64,
        #[ts(type = "number")]
        observed_gateway_balance_sats: u64,
        #[ts(type = "number")]
        observed_at: u64,
        withdrawal_txid: Option<String>,
        wallet_operation_id: Option<String>,
    },
    StabilityPool {
        #[ts(type = "number")]
        fulfilled_sats: u64,
        #[ts(type = "number")]
        observed_provided_sats: u64,
        #[ts(type = "number")]
        observed_at: u64,
        peg_in_operation_id: Option<String>,
        stability_pool_deposit_operation_id: Option<String>,
    },
}

/// Latest provider-authoritative state for one requested item.
///
/// `ActionRequired` is an operator decision point. Do not automatically retry
/// it: the provider may be reconciling an irreversible send-once operation.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiLiquidityItemStatus {
    pub target: RpcFiLiquidityItemTarget,
    pub phase: RpcFiLiquidityItemPhase,
    #[ts(type = "number | null")]
    pub fulfilled_sats: Option<u64>,
    pub completion_evidence: Option<RpcFiLiquidityCompletionEvidence>,
    pub failure_code: Option<String>,
    #[ts(type = "number")]
    pub updated_at: u64,
}

/// Durable snapshot of one semantic post-formation liquidity request.
///
/// `status` reads this local durable projection; it does not perform fresh
/// discovery. The semantic id and payload hash must be resumed as-is after a
/// lost response rather than replaced with a new request.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiLiquidityOperation {
    pub operation_id: String,
    pub formation_id: String,
    pub provider_pubkey: String,
    pub endpoint_hint: String,
    pub details_payload_hash: String,
    pub amounts: RpcFiLiquidityAmountBounds,
    pub phase: RpcFiLiquidityOperationPhase,
    pub item_statuses: Vec<RpcFiLiquidityItemStatus>,
    pub rejection_code: Option<String>,
    /// True only after FI has found the completed FLIP gateway in a fresh,
    /// threshold-aggregated LNv2 gateway view from the formed federation.
    pub gateway_view_verified: bool,
}

/// Result of a mutating start or resume reconciliation.
///
/// A returned error can follow a durable checkpoint. Callers recover by
/// listing/status and resuming the same semantic operation, never by assuming
/// the original request did not exist.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiLiquidityOperationResult {
    Operation { operation: RpcFiLiquidityOperation },
    Error { error: RpcFiOperationError },
}

/// Canonical live liquidity operation for the active formation.
///
/// `operation` is absent when no active formation has a non-terminal request.
/// Reading this value performs no provider or guardian network work.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiCurrentLiquidityOperationResult {
    Current {
        operation: Option<RpcFiLiquidityOperation>,
    },
    Error {
        error: RpcFiOperationError,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// Bounded, read-only page of durable operations used after a crash or lost
/// start response.
///
/// Pages are ordered by opaque semantic id. Pass `next_after` unchanged as the
/// exclusive cursor for the next page. A missing cursor means enumeration is
/// complete. Listing performs no provider network work.
pub struct RpcFiLiquidityOperationPage {
    pub operations: Vec<RpcFiLiquidityOperation>,
    pub next_after: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
/// Result of bounded durable-operation enumeration.
pub enum RpcFiLiquidityOperationPageResult {
    Page { page: RpcFiLiquidityOperationPage },
    Error { error: RpcFiOperationError },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiSelectionReauthorizationReason {
    PreviewExpired,
    AdvertisementEstimateExceedsLimit,
    SelectedFmanUnavailable,
    QuoteTotalExceedsLimit,
    QuoteTermsChanged,
    SelectedPayerUnavailable,
    SelectedPayerInsufficientFunds,
    VerifierEnvironmentChanged,
    PaymentFederationRequired,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiAbandonUnavailableReason {
    PaymentOutputsStarted,
    AlreadyFormed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiOperationErrorDetail {
    InsufficientFmanSeats {
        requested: u16,
        selected: u16,
        seen: u32,
        eligible: u32,
    },
    SelectionReauthorizationRequired {
        reason: RpcFiSelectionReauthorizationReason,
    },
    AbandonUnavailable {
        reason: RpcFiAbandonUnavailableReason,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiOperationError {
    pub code: RpcFiErrorCode,
    pub message: String,
    pub detail: Option<RpcFiOperationErrorDetail>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiOperationResult {
    Success,
    Error { error: RpcFiOperationError },
}

/// Native FCM platform attached to one installation registration.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFiPushPlatform {
    Android,
    Ios,
}

/// Result of an FI push-gateway installation lifecycle operation.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiPushRegistrationResult {
    Registered { installation_id: String },
    Unregistered { installation_id: String },
    Error { error: RpcFiOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiSeatPaymentRequirement {
    pub index: u16,
    /// Badge-vouched identity of the FMan the quote pays; absent for pinned
    /// FMans.
    pub fman_id: Option<String>,
    /// Two-word display name derived from `fman_id`.
    pub fman_name: Option<String>,
    pub quote_id: String,
    pub payment_federation_id: String,
    pub amount_msats: RpcFiMsats,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiPaymentRequirements {
    pub authorization_id: String,
    pub total_msats: RpcFiMsats,
    pub max_total_msats: Option<RpcFiMsats>,
    pub seats: Vec<RpcFiSeatPaymentRequirement>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiFormationActionRequired {
    AuthorizePayments {
        requirements: RpcFiPaymentRequirements,
    },
    /// Rare post-output replacement quote total above the renewed preview cap.
    /// Only the exact displayed replacement subset can satisfy this action.
    AuthorizeReplacementPayments {
        requirements: RpcFiPaymentRequirements,
    },
    ReplaceGuardians {
        requirements: RpcFiGuardianReplacementRequirements,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiSeatProgress {
    pub index: u16,
    /// Badge-vouched identity of the currently assigned FMan; absent for
    /// pinned FMans.
    pub fman_id: Option<String>,
    /// Two-word display name derived from `fman_id`; names can collide and
    /// never substitute for the id.
    pub fman_name: Option<String>,
    /// Canonical versioned Fleet Manager locator JSON.
    pub locator: String,
    pub seat_id: Option<String>,
    pub guardian_code: Option<String>,
    pub phase: RpcFiSeatPhase,
    pub freshness: RpcFiFormationFreshness,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiResolvedFormationIntent {
    pub federation_name: String,
    pub federation_size: u16,
    pub guardian_fee_ppm: u32,
    pub plan: RpcFiPlanPreference,
    pub max_total_msats: Option<RpcFiMsats>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiFormationMilestones {
    pub ecash_sent: bool,
    pub guardians_confirmed: bool,
    pub wallet_service_created: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFiFormationSnapshot {
    pub formation_id: String,
    pub phase: RpcFiFormationPhase,
    pub intent: RpcFiResolvedFormationIntent,
    pub seats: Vec<RpcFiSeatProgress>,
    pub freshness: RpcFiFormationFreshness,
    pub action_required: Option<RpcFiFormationActionRequired>,
    pub payment_outputs_started: bool,
    pub milestones: RpcFiFormationMilestones,
    pub invite_code: Option<String>,
    pub last_error: Option<RpcFiErrorCode>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiStatus {
    Idle,
    Formation {
        formation: Box<RpcFiFormationSnapshot>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFiClientStatus {
    Ready { status: RpcFiStatus },
    Failed { error: RpcFiOperationError },
}

#[cfg(test)]
mod tests;
