//! Fedi bridge types for the consumer-facing Federation Ambassador API.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Exact millisatoshi quantity at the JSON/JavaScript boundary.
///
/// The bridge serializes every FA monetary value as a base-10 string so values
/// above JavaScript's safe integer limit cannot be rounded before a consumer
/// converts them to `bigint`.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, TS)]
#[ts(export, type = "string")]
pub struct RpcFaMsats(pub u64);

impl From<u64> for RpcFaMsats {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

impl Serialize for RpcFaMsats {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.0.to_string())
    }
}

impl<'de> Deserialize<'de> for RpcFaMsats {
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
pub enum RpcFaPlanPreference {
    InfiniteBestEffort,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaFormationIntent {
    pub federation_name: Option<String>,
    pub federation_size: u16,
    pub plan: RpcFaPlanPreference,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaSelectionPreviewRequest {
    pub federation_size: u16,
    pub plan: RpcFaPlanPreference,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaSelectionPreviewSeat {
    pub mg_id: String,
    /// Two-word display name derived from `fman_id`; names can collide and
    /// never substitute for the id.
    pub mg_name: String,
    pub advertised_price_msats: RpcFaMsats,
    pub provenance: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaSelectionPreview {
    /// Opaque, process-local handle to the sealed verified selection.
    pub preview_id: String,
    pub selected: u16,
    pub total_advertised_msats: RpcFaMsats,
    pub seen: u32,
    pub eligible: u32,
    #[ts(type = "number")]
    pub valid_until: u64,
    pub seats: Vec<RpcFaSelectionPreviewSeat>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaSelectionPreviewResult {
    Preview { preview: RpcFaSelectionPreview },
    Error { error: RpcFaOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaGuardianReplacementSeat {
    pub index: u16,
    /// Badge-vouched identity of the outgoing MG; absent for pinned MGs.
    pub previous_mg_id: Option<String>,
    /// Two-word display name derived from `previous_fman_id`.
    pub previous_mg_name: Option<String>,
    pub previous_quote_id: String,
    /// Canonical versioned Manifold Guardian locator JSON retained for audit.
    pub previous_locator: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaGuardianReplacementRequirements {
    /// Opaque binding to exactly the durable rows proven safe to replace.
    pub replacement_id: String,
    pub seats: Vec<RpcFaGuardianReplacementSeat>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaReplacementPreviewSeat {
    /// Stable formation row this verified MG will replace.
    pub index: u16,
    pub mg_id: String,
    /// Two-word display name derived from `fman_id`; names can collide and
    /// never substitute for the id.
    pub mg_name: String,
    pub advertised_price_msats: RpcFaMsats,
    pub provenance: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaReplacementPreview {
    /// Opaque process-local handle to this fresh verified replacement subset.
    pub preview_id: String,
    pub requirements: RpcFaGuardianReplacementRequirements,
    pub total_advertised_msats: RpcFaMsats,
    pub seats: Vec<RpcFaReplacementPreviewSeat>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaReplacementPreviewResult {
    Preview { preview: RpcFaReplacementPreview },
    Error { error: RpcFaOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaEligiblePayer {
    /// A federation is eligible only when Manifold's authenticated setup-
    /// payment policy admits it and Fedi has the joined wallet fully loaded in
    /// `Ready` state. Joined zero-balance wallets remain present so callers can
    /// route through the existing refill flow; loading, recovering, and
    /// unadmitted federations are omitted.
    pub federation_id: String,
    /// Current joined-wallet balance. Zero does not remove an admitted payer.
    pub balance_msats: RpcFaMsats,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaEligiblePayersResult {
    Payers { payers: Vec<RpcFaEligiblePayer> },
    Error { error: RpcFaOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaSetupPaymentFederation {
    /// Canonical id Manifold derived from `invite_code` when it admitted the
    /// signed setup-payment publication.
    pub federation_id: String,
    /// The signed public invite this federation is admitted under. Present for
    /// every member, joined or not, because a caller offering an unjoined
    /// federation needs join material and an id cannot be turned back into one.
    pub invite_code: String,
    /// Whether Fedi already holds a wallet for this federation. A joined member
    /// is a payer candidate; an unjoined one is a join candidate. Joined here
    /// says nothing about balance — use `faClientEligiblePayers` for that.
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
pub enum RpcFaSetupPaymentFederationsResult {
    Federations {
        federations: Vec<RpcFaSetupPaymentFederation>,
    },
    Error {
        error: RpcFaOperationError,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
/// One FA-authorized, post-formation federation metadata mutation.
///
/// Values are validated again by Manifold before any guardian is contacted.
/// `WelcomeMessage` is also the federation description shown by Fedi.
/// Fedi supplies the URL for both ready-made and custom terms.
pub enum RpcFaFederationMetadataUpdate {
    Name {
        value: String,
    },
    IconUrl {
        value: String,
    },
    WelcomeMessage {
        value: String,
    },
    TermsOfService {
        value: String,
    },
    /// Exact metadata text: JSON arrays for lists, `true`/`false` for flags,
    /// decimal msats for limits, and plain text for currency and pinned
    /// message. Clear lists with `[]` and the pinned message with an empty
    /// string.
    AppSetting {
        setting: RpcFaAppSetting,
        value: String,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaAppSetting {
    AutojoinCommunities,
    DefaultGroupChats,
    PinnedMessage,
    DefaultCurrency,
    StabilityPoolDisabled,
    MultispendDisabled,
    InviteCodesDisabled,
    NewMembersDisabled,
    OfflineWalletDisabled,
    OnchainDepositsDisabled,
    MaxBalanceMsats,
    MaxInvoiceMsats,
    MaxStableBalanceMsats,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaFormationPhase {
    Preparing,
    AwaitingPaymentReadiness,
    AcquiringSeats,
    PreparingDkg,
    DkgUnderway,
    DkgComplete,
    PublishingSeatBindings,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaFormationFreshness {
    Fresh,
    Unsynced,
}

/// Where this device got a formed federation.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaFormedOrigin {
    /// A formation on this device.
    ThisDevice,
    /// A backup imported on this device.
    Backup,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaSeatPhase {
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
pub enum RpcFaErrorCode {
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
    InvalidManifoldGuardians,
    ManifoldGuardian,
    Payment,
    Liquidity,
    MaintenanceWrongState,
    MaintenanceRejected,
    MaintenanceConsensusTooLarge,
    MaintenanceConsensusInvalid,
    MaintenanceConvergence,
    PushNotifications,
    Timeout,
    /// The guardian is not, or no longer, a replacement candidate of the
    /// latest check, or the check is from an earlier opening of the client.
    ReplacementNotEligible,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaLiquidityNetwork {
    Bitcoin,
    Testnet,
    Signet,
    Regtest,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaLiquiditySource {
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
pub struct RpcFaLiquidityAmountBounds {
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
pub struct RpcFaLiquidityRequestIntent {
    pub amounts: RpcFaLiquidityAmountBounds,
    pub approved_provider_pubkeys: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaLiquidityProvider {
    pub provider_pubkey: String,
    pub supported_sources: Vec<RpcFaLiquiditySource>,
    pub supported_networks: Vec<RpcFaLiquidityNetwork>,
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
pub struct RpcFaLiquidityProviderRejection {
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
pub enum RpcFaLiquidityDiscoveryResult {
    Discovery {
        providers: Vec<RpcFaLiquidityProvider>,
        rejected: Vec<RpcFaLiquidityProviderRejection>,
    },
    Error {
        error: RpcFaOperationError,
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
pub enum RpcFaLiquidityOperationPhase {
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
pub enum RpcFaLiquidityItemPhase {
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
pub enum RpcFaLiquidityItemTarget {
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
pub enum RpcFaLiquidityCompletionEvidence {
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
pub struct RpcFaLiquidityItemStatus {
    pub target: RpcFaLiquidityItemTarget,
    pub phase: RpcFaLiquidityItemPhase,
    #[ts(type = "number | null")]
    pub fulfilled_sats: Option<u64>,
    pub completion_evidence: Option<RpcFaLiquidityCompletionEvidence>,
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
pub struct RpcFaLiquidityOperation {
    pub operation_id: String,
    pub formation_id: String,
    pub provider_pubkey: String,
    pub endpoint_hint: Option<String>,
    pub details_payload_hash: String,
    pub amounts: RpcFaLiquidityAmountBounds,
    pub phase: RpcFaLiquidityOperationPhase,
    pub item_statuses: Vec<RpcFaLiquidityItemStatus>,
    pub rejection_code: Option<String>,
    /// True only after FA has found the completed FLIP gateway in a fresh,
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
pub enum RpcFaLiquidityOperationResult {
    Operation { operation: RpcFaLiquidityOperation },
    Error { error: RpcFaOperationError },
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
pub enum RpcFaCurrentLiquidityOperationResult {
    Current {
        operation: Option<RpcFaLiquidityOperation>,
    },
    Error {
        error: RpcFaOperationError,
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
pub struct RpcFaLiquidityOperationPage {
    pub operations: Vec<RpcFaLiquidityOperation>,
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
pub enum RpcFaLiquidityOperationPageResult {
    Page { page: RpcFaLiquidityOperationPage },
    Error { error: RpcFaOperationError },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaSelectionReauthorizationReason {
    PreviewExpired,
    AdvertisementEstimateExceedsLimit,
    SelectedMgUnavailable,
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
pub enum RpcFaAbandonUnavailableReason {
    PaymentOutputsStarted,
    DkgComplete,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaOperationErrorDetail {
    LiquidityOperationExists,
    /// Too few guardians support this setting to reach consensus.
    MaintenanceUnsupported,
    InsufficientMgSeats {
        requested: u16,
        selected: u16,
        seen: u32,
        eligible: u32,
    },
    SelectionReauthorizationRequired {
        reason: RpcFaSelectionReauthorizationReason,
    },
    AbandonUnavailable {
        reason: RpcFaAbandonUnavailableReason,
    },
}

/// The MG a guardian transfer would buy its new seat on.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaTransferDestinationPreview {
    /// Opaque, process-local handle to the sealed verified selection.
    pub preview_id: String,
    pub mg_id: String,
    /// Two-word display name derived from `mg_id`; names can collide and
    /// never substitute for the id.
    pub mg_name: String,
    pub advertised_price_msats: RpcFaMsats,
    pub provenance: String,
    #[ts(type = "number")]
    pub valid_until: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaTransferDestinationPreviewResult {
    Preview {
        preview: RpcFaTransferDestinationPreview,
    },
    Error {
        error: RpcFaOperationError,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaGuardianTransferPhase {
    /// The FA buys the new seat. A resume finishes the purchase.
    BuyingSeat,
    /// The new host waits for the old host to hand over the guardian.
    AwaitingSource,
    /// The guardian runs on the new host; consensus does not name it yet.
    PublishingBinding,
    /// Consensus names the new host; the old host has not deleted the
    /// guardian data yet.
    RemovingSource,
    Completed,
}

/// One guardian moving from its Manifold Guardian onto a new seat.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaGuardianTransfer {
    /// Position of the moved guardian in the status seat list.
    pub seat_index: u16,
    pub source_mg_id: String,
    /// Two-word display name derived from `source_mg_id`.
    pub source_mg_name: String,
    pub source_seat_id: String,
    pub destination_mg_id: String,
    /// Two-word display name derived from `destination_mg_id`.
    pub destination_mg_name: String,
    /// Absent until the new seat is bought.
    pub destination_seat_id: Option<String>,
    pub phase: RpcFaGuardianTransferPhase,
}

/// `None` means no transfer is open.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaGuardianTransferResult {
    Transfer {
        transfer: Option<RpcFaGuardianTransfer>,
    },
    Error {
        error: RpcFaOperationError,
    },
}

/// Evidence that a guardian should be replaced. Missing reports never become
/// a reason.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaReplacementReason {
    /// Last seen by the other guardians at this Unix time, longer ago than
    /// the policy allows.
    Offline {
        #[ts(type = "number")]
        last_seen_secs: u64,
    },
    /// Missed this many completed consensus sessions.
    MissedSessions {
        #[ts(type = "number")]
        sessions: u64,
    },
    /// Enough other guardians report it disconnected; how long is unknown.
    Disconnected,
    /// Uptime over the last week, in basis points, below the policy minimum.
    LowWeekScore { basis_points: u16 },
    /// Uptime over the last month, in basis points, below the policy minimum.
    LowMonthScore { basis_points: u16 },
    /// The operator holding the guardian's seat lost its verification.
    HolderRevoked,
}

/// A guardian that met at least one replacement condition.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaReplacementCandidate {
    /// Position in the status seat list, the index a replacement takes.
    pub seat_index: u16,
    pub mg_id: String,
    /// Two-word display name derived from `mg_id`.
    pub mg_name: String,
    pub reasons: Vec<RpcFaReplacementReason>,
}

/// One complete replacement check of the formed federation. An empty list
/// does not assert that every guardian is healthy.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaReplacementCheck {
    pub federation_id: String,
    #[ts(type = "number")]
    pub checked_at: u64,
    pub candidates: Vec<RpcFaReplacementCandidate>,
    pub blocking_liquidity_operation: Option<String>,
}

/// The latest replacement check. `check` is absent until a check of the
/// ready federation succeeds.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaReplacementCandidates {
    Ready {
        check: Option<RpcFaReplacementCheck>,
    },
    Failed {
        error: RpcFaOperationError,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaOperationError {
    pub code: RpcFaErrorCode,
    pub message: String,
    pub detail: Option<RpcFaOperationErrorDetail>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaOperationResult {
    Success,
    Error { error: RpcFaOperationError },
}

/// One seat a decommission pass could not end, and what its Manifold Guardian
/// said.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaDecommissionRefusal {
    pub index: u16,
    pub reason: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaDecommissionResult {
    Outcome {
        decommissioned: Vec<u16>,
        already_decommissioned: Vec<u16>,
        refused: Vec<RpcFaDecommissionRefusal>,
    },
    Error {
        error: RpcFaOperationError,
    },
}

/// Native FCM platform attached to one installation registration.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFaPushPlatform {
    Android,
    Ios,
}

/// Result of an FA push-gateway installation lifecycle operation.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaPushRegistrationResult {
    Registered { installation_id: String },
    Unregistered { installation_id: String },
    Error { error: RpcFaOperationError },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaSeatPaymentRequirement {
    pub index: u16,
    /// Badge-vouched identity of the MG the quote pays; absent for pinned
    /// MGs.
    pub mg_id: Option<String>,
    /// Two-word display name derived from `fman_id`.
    pub mg_name: Option<String>,
    pub quote_id: String,
    pub payment_federation_id: String,
    pub amount_msats: RpcFaMsats,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaPaymentRequirements {
    pub authorization_id: String,
    pub total_msats: RpcFaMsats,
    pub max_total_msats: Option<RpcFaMsats>,
    pub seats: Vec<RpcFaSeatPaymentRequirement>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaFormationActionRequired {
    AuthorizePayments {
        requirements: RpcFaPaymentRequirements,
    },
    /// Rare post-output replacement quote total above the renewed preview cap.
    /// Only the exact displayed replacement subset can satisfy this action.
    AuthorizeReplacementPayments {
        requirements: RpcFaPaymentRequirements,
    },
    ReplaceGuardians {
        requirements: RpcFaGuardianReplacementRequirements,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaSeatProgress {
    pub index: u16,
    /// Badge-vouched identity of the currently assigned MG; absent for
    /// pinned MGs.
    pub mg_id: Option<String>,
    /// Two-word display name derived from `fman_id`; names can collide and
    /// never substitute for the id.
    pub mg_name: Option<String>,
    /// Canonical versioned Manifold Guardian locator JSON.
    pub locator: String,
    pub seat_id: Option<String>,
    pub guardian_code: Option<String>,
    pub phase: RpcFaSeatPhase,
    pub freshness: RpcFaFormationFreshness,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaResolvedFormationIntent {
    pub federation_name: String,
    pub federation_size: u16,
    pub guardian_fee_ppm: u32,
    pub plan: RpcFaPlanPreference,
    pub max_total_msats: Option<RpcFaMsats>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaFormationMilestones {
    pub ecash_sent: bool,
    pub guardians_confirmed: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaFormationSnapshot {
    pub formation_id: String,
    pub phase: RpcFaFormationPhase,
    pub intent: RpcFaResolvedFormationIntent,
    pub seats: Vec<RpcFaSeatProgress>,
    pub freshness: RpcFaFormationFreshness,
    pub action_required: Option<RpcFaFormationActionRequired>,
    pub payment_outputs_started: bool,
    pub milestones: RpcFaFormationMilestones,
    pub invite_code: Option<String>,
    pub last_error: Option<RpcFaErrorCode>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFaFormedSeat {
    pub mg_id: String,
    /// Two-word display name derived from `mg_id`; names can collide and
    /// never substitute for the id.
    pub mg_name: String,
    pub seat_id: String,
    /// Canonical versioned Manifold Guardian locator JSON.
    pub locator: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// A formed federation, from a formation on this device or from a backup.
pub struct RpcFaFormedFederation {
    pub formation_id: String,
    pub federation_invite: String,
    pub federation_name: Option<String>,
    pub seats: Vec<RpcFaFormedSeat>,
    /// `unsynced` until this run checked the seats against consensus.
    pub freshness: RpcFaFormationFreshness,
    /// Whether this device checked the seats against the federation at
    /// least once.
    pub backup_eligible: bool,
    pub origin: RpcFaFormedOrigin,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaStatus {
    Idle,
    /// A restored mnemonic is still checking the selected Manifold deployment.
    /// An error is retryable; FA creation remains gated until completion.
    Recovery {
        error: Option<RpcFaOperationError>,
    },
    Formation {
        formation: Box<RpcFaFormationSnapshot>,
    },
    Formed {
        federation: Box<RpcFaFormedFederation>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum RpcFaClientStatus {
    Ready { status: RpcFaStatus },
    Failed { error: RpcFaOperationError },
}

#[cfg(test)]
mod tests;
