//! Fedi wallet adapter for the Federation Initiator payment port
//! ([`fi_client::FiPayments`]).
//!
//! The adapter funds Fleet-Manager-quoted key-locked mint issuance sets from
//! a joined federation and collects the aggregate blinded signatures the FMan
//! requires as payment evidence. Its safety spine is a *seat-payment journal*
//! in the paying federation's own client database (the tagged
//! [`BridgeDbPrefix::FiSeatPayment`] namespace), keyed by the FMan quote id:
//!
//! - [`FiPayments::create_seat_payment`] writes the journal record and the
//!   funding transaction's submission state machines in ONE database
//!   transaction ([`Client::finalize_and_submit_transaction_dbtx`]). The
//!   state-machine executor only runs post-commit, so recoverability is durable
//!   strictly before any network submission can happen.
//! - The operation log records the exact balancing-change range in that same
//!   transaction. Both create and recovery validate that metadata and wait
//!   until every payer change output is spendable before returning
//!   [`PreparedSeatPayment`].
//! - [`FiPayments::recover_seat_payment`] therefore treats an absent journal
//!   record as proof that no funding began (`NotStarted`) — but only in a
//!   client database that never went through a recovery path; a recovered
//!   database refuses the absence proof outright. A present record is probed
//!   with a BOUNDED wait: consensus acceptance replays the exact evidence
//!   (`Prepared`), while consensus rejection becomes terminal (`Rejected`) only
//!   after exact automatic input refunds are accepted and spendable. A timeout
//!   is a retryable error — a timeout is NEVER mapped to `Rejected`, because
//!   misreading a pending spend or refund as terminal would let `fi-client`
//!   replace the quote before the wallet owns the value again.
//!
//! Refund issuance ([`FiPayments::prepare_quote_refund`]) is derived
//! deterministically from the paying federation's auxiliary secret and the
//! quote request's public `refund_nonce`
//! ([`runtime::constants::FI_SEAT_REFUND_CHILD_ID`]). No refund secret is
//! ever persisted — an exact retry or recovery re-derives byte-identical
//! issuance requests from the quote alone, and nothing about refunds enters
//! the FI database (see `SECURITY.md`). This mirrors the FI payer reference
//! implementation in Manifold's `fleet-manager-wallet::payer`.
//!
//! Fee semantics: both mint generations charge a base fee (100 msat at the
//! pinned Fedimint) plus an optional relative fee per transaction input and
//! output. The FMan's quoted price equals the issuance total only; the mint
//! fees for the quoted outputs, the funding inputs, and any change outputs
//! are auto-funded from the paying federation's balance on top of
//! `PaymentTerms::total_msats`. Each seat's durable hold is its quoted
//! amount plus a worst-case fee bound over the notes actually in the
//! wallet, so the reserved balance tracks the real cost of the payment
//! instead of a fragmented-wallet fantasy. Refund transactions are fee-balanced
//! by the FMan against our refund issuance, so a refund credits the paid total
//! minus the refund transaction's own input and output fees.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context as _, anyhow, bail, ensure};
use bitcoin::hashes::{Hash as _, HashEngine as _, sha256, sha256t};
use federations::Federations;
use federations::federation_v2::client::ClientExt as _;
use federations::federation_v2::db::{
    BridgeDbPrefix, FiFundingFingerprint, FiFundingQuoteId, FiFundingReservationMember,
    FiFundingReservationToken,
};
use federations::federation_v2::{FederationV2, FiSeatPaymentOperationMeta};
use fedi_decentralized_service_fleet_manager::{
    FederationId as WireFederationId, GetQuoteResponse, LockedBlindedSignature,
    LockedIssuanceRequest, LockedIssuanceRequestV2, MintGeneration, PaymentTerms, Plan, QuoteId,
    RefundIssuance, RefundTransaction, SignatureVerified,
};
use fedimint_api_client::api::{FederationApiExt as _, ServerError};
use fedimint_api_client::query::FilterMapThreshold;
use fedimint_client::ClientHandle;
use fedimint_client::db::{ClientInitStateKey, InitMode, InitModeComplete, InitState};
use fedimint_client_module::TransactionUpdates;
use fedimint_client_module::module::ClientModule as _;
use fedimint_client_module::transaction::{ClientOutput, ClientOutputBundle, TransactionBuilder};
use fedimint_core::core::{IntoDynInstance as _, ModuleInstanceId, OperationId};
use fedimint_core::db::{AutocommitError, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::module::{Amounts, ApiRequestErased};
use fedimint_core::task::timeout;
use fedimint_core::{
    Amount, IdxRange, NumPeersExt as _, OutPoint, OutPointRange, TieredMulti, TransactionId,
    impl_db_record,
};
use fedimint_derive_secret::{ChildId, DerivableSecret};
use fedimint_mint_client::common::endpoint_constants::AWAIT_OUTPUT_OUTCOME_ENDPOINT;
use fedimint_mint_client::output::{
    NoteIssuanceRequest as MintV1IssuanceRequest, verify_blind_share,
};
use fedimint_mint_client::{
    BlindNonce, MintInput as MintV1Input, MintOutput as MintV1Output, Nonce as MintV1Nonce,
    Note as MintV1Note, OOBNotes, ReissueExternalNotesError, ReissueExternalNotesState,
};
use fedimint_mintv2_client::common::config::{
    MintClientConfig as MintV2ClientConfig, consensus_denominations,
};
use fedimint_mintv2_client::common::endpoint_constants::SIGNATURE_SHARES_ENDPOINT as MINT_V2_SIGNATURE_SHARES_ENDPOINT;
use fedimint_mintv2_client::common::{
    Denomination, MintInput as MintV2Input, MintOutput as MintV2Output, Note as MintV2Note,
    verify_note as verify_mint_v2_note,
};
use fedimint_mintv2_client::issuance::NoteIssuanceRequest as MintV2IssuanceRequest;
use fedimint_mintv2_client::{ECash as MintV2ECash, FinalReceiveOperationState};
use fi_client::{
    ExactPaymentPreflight, FiPaymentError, FiPayments, PaymentReservationId,
    PaymentReservationRecovery, PreparedSeatPayment, SeatPaymentRecovery, SettledSeatRefund,
};
use futures::StreamExt as _;
use rpc_types::{EcashReceiveMetadata, EcashReceiveReason};
use runtime::constants::{FI_SEAT_PAYMENT_OPERATION_TYPE, FI_SEAT_REFUND_CHILD_ID};
use tbs::{BlindedMessage, BlindedSignature, BlindedSignatureShare};

/// Domain separator hashed with the quote id into the funding transaction's
/// operation id. One quote maps to exactly one wallet operation.
const FI_SEAT_PAYMENT_OPERATION_ID_DOMAIN: &[u8] = b"fedi/fi-seat-payment-operation/v1";
/// Domain separator for Manifold's opaque deterministic aggregate reservation
/// id in the paying federation's durable wallet database.
const FI_FUNDING_RESERVATION_TOKEN_DOMAIN: &[u8] = b"fedi/fi-funding-reservation-token/v1";
/// Domain separator for the exact signed-quote fingerprint stored under a
/// reservation token. Same-id replay with changed signed inputs fails
/// closed. Wallet-side hold amounts are outside the fingerprint: they come
/// from the note inventory at authorization time, and the durable
/// reservation row is their authority.
const FI_FUNDING_RESERVATION_FINGERPRINT_DOMAIN: &[u8] =
    b"fedi/fi-funding-reservation-fingerprint/v1";
const FI_SEAT_PAYMENT_JOURNAL_VERSION: u8 = 1;
const FI_SEAT_PAYMENT_OPERATION_META_VERSION: u8 = 1;

/// How long a fresh funding submission waits for consensus acceptance before
/// returning a retryable error. Recovery replays the wait from the journal.
const ACCEPTANCE_TIMEOUT: Duration = Duration::from_secs(120);
/// Bounded recovery probe. Elapsing maps to a retryable error, never to
/// `SeatPaymentRecovery::Rejected`.
const RECOVERY_PROBE_TIMEOUT: Duration = Duration::from_secs(30);
/// Bounded wait for threshold output-signature collection.
const EVIDENCE_TIMEOUT: Duration = Duration::from_secs(120);
/// Bounded wait for the payer's balancing mint outputs to become spendable.
const CHANGE_SETTLE_TIMEOUT: Duration = Duration::from_secs(120);
/// Bounded wait for a refund transaction to settle into wallet balance.
const REFUND_SETTLE_TIMEOUT: Duration = Duration::from_secs(120);

const MINT_V1_GENERATION: u8 = 1;
const MINT_V2_GENERATION: u8 = 2;

/// Hard ceiling on any FMan-supplied seat price: 100 million sats (1 BTC).
///
/// Real seat prices are on the order of sats to thousands of sats, so the
/// cap never rejects a legitimate quote. It exists because the price is
/// remote input that feeds denomination splitting
/// ([`quote_denominations`] / [`refund_denominations`]), which materializes
/// one entry per selected note: an adversarial price near `u64::MAX` split
/// over a small tier would allocate an effectively unbounded `Vec` and
/// abort the process (crash DoS). Every price must pass
/// [`CheckedSeatPrice`] BEFORE any splitting or fee summation.
const MAX_SEAT_PRICE_MSATS: u64 = 100_000_000_000;

/// A remote seat price that has passed the allocation-safety ceiling.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct CheckedSeatPrice(u64);

impl CheckedSeatPrice {
    fn msats(self) -> u64 {
        self.0
    }
}

impl TryFrom<u64> for CheckedSeatPrice {
    type Error = FiPaymentError;

    fn try_from(price_msats: u64) -> Result<Self, Self::Error> {
        if price_msats <= MAX_SEAT_PRICE_MSATS {
            return Ok(Self(price_msats));
        }
        Err(FiPaymentError::new(
            "quoted seat price exceeds the supported maximum",
        ))
    }
}

/// Mint-v2 denominations small enough to be uneconomical: the pinned base
/// fee is 100 msat per input/output, so both protocol sides quote only
/// denominations strictly above it. Mirrors Manifold's FMan wallet.
const UNECONOMICAL_DENOMINATION_MSATS: u64 = 100;

/// Fedi's wallet-side implementation of the FI payment port.
///
/// Holds the federations service; every operation resolves the paying
/// federation at call time so a federation joined after the FI client opened
/// is immediately usable.
pub(crate) struct BridgeFiPayments {
    federations: Arc<Federations>,
}

/// Wallet-private proof that one exact aggregate is durably reserved.
#[derive(Clone)]
pub(crate) struct BridgePaymentReservation {
    federation_id: String,
    token: FiFundingReservationToken,
}

fn payment_reservation_token(reservation_id: &PaymentReservationId) -> FiFundingReservationToken {
    let mut engine = sha256::Hash::engine();
    engine.input(FI_FUNDING_RESERVATION_TOKEN_DOMAIN);
    engine.input(reservation_id.as_str().as_bytes());
    FiFundingReservationToken::from_bytes(sha256::Hash::from_engine(engine).to_byte_array())
}

// SAFETY: wasm32-unknown-unknown is single-threaded, so the value can never
// be observed from another thread. The Fedi/fedimint stack encodes that fact
// through `maybe_add_send_sync`, which strips `Send`/`Sync` bounds on wasm
// (making `Federations` neither), while `fi-client` requires
// `FiPayments: Send + Sync` unconditionally. Same rationale as
// `fedi-wasm::logging::WasmLogFile`.
//
// TODO(manifold-upstream): ask Manifold to relax `FiPayments` (and the other
// fi-client ports) to maybe-Send/maybe-Sync bounds on wasm, mirroring
// fedimint's `maybe_add_send_sync`; these unsafe impls then disappear.
#[cfg(target_family = "wasm")]
unsafe impl Send for BridgeFiPayments {}
#[cfg(target_family = "wasm")]
unsafe impl Sync for BridgeFiPayments {}

impl BridgeFiPayments {
    pub(crate) fn new(federations: Arc<Federations>) -> Self {
        Self { federations }
    }

    fn federation(&self, federation_id: &str) -> Result<Arc<FederationV2>, FiPaymentError> {
        self.federations
            .get_federation(federation_id)
            .map_err(|error| payment_error("payment federation is unavailable", error))
    }
}

/// Durable per-quote record binding a funding transaction to its exact
/// quoted issuance set. Lives in the paying federation's client database,
/// never in the FI database.
///
/// Journal rows are retained forever (never pruned): they are tiny, and each
/// is the permanent proof of what a quote's funding and refund settled to.
#[derive(Debug, Clone, Eq, PartialEq, Encodable, Decodable)]
struct FiSeatPaymentJournal {
    version: u8,
    /// [`MINT_V1_GENERATION`] or [`MINT_V2_GENERATION`].
    generation: u8,
    mint_module: ModuleInstanceId,
    txid: TransactionId,
    output_count: u64,
    /// SHA-256 over the canonical quoted issuance bytes; recovery refuses a
    /// journal row whose issuance differs from the presented quote.
    issuance_hash: [u8; 32],
    /// Aggregate blinded signatures (consensus-encoded), persisted on first
    /// successful collection so replays present byte-identical evidence
    /// without re-contacting the federation.
    payment_signatures: Option<Vec<Vec<u8>>>,
    /// SHA-256 over the canonical refund issuance settled for this quote,
    /// recorded strictly before the refund is credited. A refund issuance
    /// may settle under exactly one quote: the refund nonce is public and
    /// the derivation check in [`rebuild_refund_context`] passes for any
    /// quote that copies it, so a malicious FMan could reuse one quote's
    /// refund issuance in a second quote and have the second settle credit
    /// nothing (identical deterministic notes reissue idempotently) while
    /// claiming both refunds. [`guard_refund_settlement`] refuses that.
    claimed_refund_issuance_hash: Option<[u8; 32]>,
    /// Written only after deterministic wallet receive reaches terminal
    /// success. The earlier reverse claim is not proof that value was credited.
    credited_refund_issuance_hash: Option<[u8; 32]>,
}

#[derive(Clone, Copy, Debug, Encodable, Decodable)]
struct FiSeatPaymentJournalKey {
    record_type: u8,
    quote_id: [u8; 32],
}

impl FiSeatPaymentJournalKey {
    const fn new(quote_id: [u8; 32]) -> Self {
        Self {
            record_type: 0,
            quote_id,
        }
    }
}

impl_db_record!(
    key = FiSeatPaymentJournalKey,
    value = FiSeatPaymentJournal,
    db_prefix = BridgeDbPrefix::FiSeatPayment,
);

#[derive(Clone, Copy, Debug, Encodable, Decodable)]
struct FiSeatRefundClaimKey {
    record_type: u8,
    issuance_hash: [u8; 32],
}

impl FiSeatRefundClaimKey {
    const fn new(issuance_hash: [u8; 32]) -> Self {
        Self {
            record_type: 1,
            issuance_hash,
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Encodable, Decodable)]
struct FiSeatRefundClaim {
    quote_id: [u8; 32],
}

impl_db_record!(
    key = FiSeatRefundClaimKey,
    value = FiSeatRefundClaim,
    db_prefix = BridgeDbPrefix::FiSeatPayment,
);

/// Wallet-private refund state for one paid `CreateSeat` presentation.
///
/// Contains only re-derivable key material (auxiliary-secret derivation of
/// the quote's public `refund_nonce`); it intentionally has no persistence.
pub(crate) struct BridgeSeatRefundContext {
    federation_id: String,
    reservation_token: FiFundingReservationToken,
    /// Quote this context settles under; keys the settlement record in the
    /// quote's journal row.
    quote_id: QuoteId,
    inner: RefundContextInner,
}

/// Wallet-owned authority to release one exact aggregate reservation member.
///
/// All fields are private and instances are created only after this adapter
/// proves terminal consensus rejection or finishes a signed refund. Manifold
/// can therefore request release without being able to forge wallet proof
/// from caller-supplied ids.
pub(crate) struct BridgeSeatTerminalReleaseProof {
    federation_id: String,
    reservation_token: FiFundingReservationToken,
    quote_id: FiFundingQuoteId,
}

impl BridgeSeatRefundContext {
    /// Canonical hash of the refund issuance this context settles. Matches
    /// [`ParsedIssuance::canonical_hash`] over the quoted refund issuance.
    fn issuance_hash(&self) -> RefundIssuanceHash {
        let bytes: Vec<u8> = match &self.inner {
            RefundContextInner::V1 { requests } => requests
                .iter()
                .flat_map(|(amount, _, blind_nonce)| {
                    (amount.msats, *blind_nonce).consensus_encode_to_vec()
                })
                .collect(),
            RefundContextInner::V2 { requests } => requests
                .iter()
                .flat_map(|request| {
                    (
                        request.denomination,
                        request.blinded_message(),
                        request.tweak,
                    )
                        .consensus_encode_to_vec()
                })
                .collect(),
        };
        RefundIssuanceHash(sha256::Hash::hash(&bytes).to_byte_array())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RefundIssuanceHash([u8; 32]);

enum RefundContextInner {
    V1 {
        /// (denomination, issuance request, quoted blind nonce), in quote
        /// order.
        requests: Vec<(Amount, MintV1IssuanceRequest, BlindNonce)>,
    },
    V2 {
        requests: Vec<MintV2IssuanceRequest>,
    },
}

/// Parsed, decoded paid quote.
struct ParsedPaidQuote {
    federation_id: WireFederationId,
    price: CheckedSeatPrice,
    refund_nonce: [u8; 32],
    payment: ParsedIssuance,
    refund: ParsedIssuance,
}

enum ParsedIssuance {
    V1(Vec<(Amount, BlindNonce)>),
    V2(Vec<(Denomination, BlindedMessage, [u8; 16])>),
}

impl ParsedIssuance {
    fn generation(&self) -> MintGeneration {
        match self {
            Self::V1(_) => MintGeneration::MintV1,
            Self::V2(_) => MintGeneration::MintV2,
        }
    }

    fn len(&self) -> usize {
        match self {
            Self::V1(issuance) => issuance.len(),
            Self::V2(issuance) => issuance.len(),
        }
    }

    /// Canonical bytes binding a journal row to this exact issuance set.
    fn canonical_hash_bytes(&self) -> [u8; 32] {
        let bytes: Vec<u8> = match self {
            Self::V1(issuance) => issuance
                .iter()
                .flat_map(|(amount, nonce)| (amount.msats, *nonce).consensus_encode_to_vec())
                .collect(),
            Self::V2(issuance) => issuance
                .iter()
                .flat_map(|(denomination, nonce, tweak)| {
                    (*denomination, *nonce, *tweak).consensus_encode_to_vec()
                })
                .collect(),
        };
        sha256::Hash::hash(&bytes).to_byte_array()
    }

    fn payment_hash(&self) -> PaymentIssuanceHash {
        PaymentIssuanceHash(self.canonical_hash_bytes())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct PaymentIssuanceHash([u8; 32]);

fn joined_payable_federations(
    admitted: &[WireFederationId],
    mut is_joined_and_ready: impl FnMut(&WireFederationId) -> bool,
) -> Vec<WireFederationId> {
    admitted
        .iter()
        .filter(|federation_id| is_joined_and_ready(federation_id))
        .cloned()
        .collect()
}

fn mint_generation_code(generation: MintGeneration) -> u8 {
    match generation {
        MintGeneration::MintV1 => MINT_V1_GENERATION,
        MintGeneration::MintV2 => MINT_V2_GENERATION,
    }
}

impl FiPayments for BridgeFiPayments {
    type RefundContext = BridgeSeatRefundContext;
    type PaymentReservation = BridgePaymentReservation;
    type TerminalReleaseProof = BridgeSeatTerminalReleaseProof;

    async fn payable_federations(
        &self,
        admitted: &[WireFederationId],
    ) -> Result<Vec<WireFederationId>, FiPaymentError> {
        Ok(joined_payable_federations(admitted, |federation_id| {
            // Capability report only: a federation that is unknown, still
            // loading, recovering, or failed is simply not payable-from.
            let Ok(_federation) = self.federations.get_federation(&federation_id.0) else {
                return false;
            };
            // Zero balance is still a valid payer choice: the selected flow
            // can route the FI through top-up and return to this exact joined
            // federation. Funding sufficiency is enforced at authorization.
            true
        }))
    }

    async fn recover_payment_reservation(
        &self,
        reservation_id: &PaymentReservationId,
        preflight: &ExactPaymentPreflight<'_>,
    ) -> Result<PaymentReservationRecovery<Self::PaymentReservation>, FiPaymentError> {
        let token = payment_reservation_token(reservation_id);
        let terms =
            exact_funding_reservation_terms(&self.federations, reservation_id, preflight)
                .map_err(|error| payment_error("exact aggregate payment recovery failed", error))?;
        let federation_id = terms.federation.federation_id().to_string();
        if terms
            .federation
            .recover_fi_funding_reservation(token, terms.fingerprint, &terms.quote_ids)
            .await
            .map_err(|error| payment_error("exact aggregate payment recovery failed", error))?
        {
            Ok(PaymentReservationRecovery::Existing(
                BridgePaymentReservation {
                    federation_id,
                    token,
                },
            ))
        } else {
            Ok(PaymentReservationRecovery::Absent)
        }
    }

    async fn reserve_payment_requirements(
        &self,
        reservation_id: &PaymentReservationId,
        preflight: &ExactPaymentPreflight<'_>,
    ) -> Result<Self::PaymentReservation, FiPaymentError> {
        let token = payment_reservation_token(reservation_id);
        let plan = preflight_exact_payments(&self.federations, token, reservation_id, preflight)
            .await
            .map_err(|error| payment_error("exact aggregate payment is not ready", error))?;
        Ok(BridgePaymentReservation {
            federation_id: plan.federation.federation_id().to_string(),
            token,
        })
    }

    async fn release_payment_reservation(
        &self,
        reservation: Self::PaymentReservation,
    ) -> Result<(), FiPaymentError> {
        let federation = self.federation(&reservation.federation_id)?;
        federation
            .release_unstarted_fi_funding(reservation.token)
            .await
            .map_err(|error| payment_error("releasing aggregate payment failed", error))
    }

    async fn release_seat_payment_reservation(
        &self,
        terminal: Self::TerminalReleaseProof,
    ) -> Result<(), FiPaymentError> {
        let federation = self.federation(&terminal.federation_id)?;
        federation
            .ensure_fi_funding_member_consumed(terminal.reservation_token, terminal.quote_id)
            .await
            .map_err(|error| payment_error("settled seat payment reservation is invalid", error))
    }

    async fn prepare_quote_refund(
        &self,
        federation_id: &WireFederationId,
        plan: &Plan,
    ) -> Result<RefundIssuance, FiPaymentError> {
        let federation = self.federation(&federation_id.0)?;
        let price = CheckedSeatPrice::try_from(
            plan_price_msats(plan)
                .ok_or_else(|| FiPaymentError::new("plan carries no parsable one-time price"))?,
        )?;
        let refund_nonce: [u8; 32] = rand::random();
        prepare_quote_refund_inner(&federation, price.msats(), refund_nonce)
            .map_err(|error| payment_error("preparing quote refund failed", error))
    }

    async fn recover_seat_payment(
        &self,
        reservation_id: &PaymentReservationId,
        quote: &SignatureVerified<GetQuoteResponse>,
    ) -> Result<SeatPaymentRecovery<Self::RefundContext, Self::TerminalReleaseProof>, FiPaymentError>
    {
        let quote_id = quote.quote_id();
        let parsed = parse_paid_quote(quote)
            .map_err(|error| payment_error("quote payment terms are invalid", error))?;
        let federation = self.federation(&parsed.federation_id.0)?;
        federation
            .ensure_fi_funding_reservation_member(
                payment_reservation_token(reservation_id),
                FiFundingQuoteId::from_bytes(quote_id.0),
            )
            .await
            .map_err(|error| payment_error("seat payment reservation is invalid", error))?;

        let Some(journal) = read_journal(&federation, &quote_id).await else {
            // The journal record and the funding transaction's submission
            // state machines commit in one database transaction, and the
            // state-machine executor only observes committed state. An
            // absent record therefore proves no funding operation for this
            // quote ever began — but ONLY in a client database that has
            // been continuously operated since before the quote. A database
            // that began life via recovery (rejoin from backup or scratch,
            // device restore from seed) may simply be missing the row the
            // pre-recovery database held, so reporting `NotStarted` from it
            // would let `fi-client` replace the quote and double-spend.
            if federation_client_began_via_recovery(&federation).await {
                return Err(FiPaymentError::new(
                    "payment federation was restored via recovery; absence of a seat payment cannot be proven",
                ));
            }
            return Ok(SeatPaymentRecovery::NotStarted);
        };
        validate_journal(&journal, &parsed)
            .map_err(|error| payment_error("seat payment journal does not match quote", error))?;

        let operation_id = seat_payment_operation_id(&quote_id);
        let change_range = seat_payment_change_range(&federation, &quote_id, &journal).await?;
        let updates = federation.client.transaction_updates(operation_id).await;
        match seat_payment_tx_status(updates, journal.txid, RECOVERY_PROBE_TIMEOUT).await {
            SeatPaymentTxStatus::Accepted => {
                await_seat_payment_change(
                    &federation,
                    operation_id,
                    change_range,
                    CHANGE_SETTLE_TIMEOUT,
                )
                .await?;
                let prepared = prepared_payment(
                    &federation,
                    payment_reservation_token(reservation_id),
                    &quote_id,
                    &parsed,
                    journal,
                )
                .await?;
                Ok(SeatPaymentRecovery::Prepared(prepared))
            }
            SeatPaymentTxStatus::Rejected(reason) => {
                tracing::warn!(%reason, "FI seat payment transaction was rejected by consensus");
                await_rejected_seat_payment_inputs(
                    &federation,
                    operation_id,
                    journal.txid,
                    ModuleInstanceId::from(journal.mint_module),
                    CHANGE_SETTLE_TIMEOUT,
                )
                .await?;
                Ok(SeatPaymentRecovery::Rejected(
                    BridgeSeatTerminalReleaseProof {
                        federation_id: parsed.federation_id.0,
                        reservation_token: payment_reservation_token(reservation_id),
                        quote_id: FiFundingQuoteId::from_bytes(quote_id.0),
                    },
                ))
            }
            // NEVER map a timeout to Rejected: the transaction may still be
            // accepted, and replacing the quote would double-spend.
            SeatPaymentTxStatus::Pending => Err(FiPaymentError::new(
                "seat payment is not yet final; retry recovery",
            )),
        }
    }

    async fn create_seat_payment(
        &self,
        reservation: &Self::PaymentReservation,
        quote: &SignatureVerified<GetQuoteResponse>,
    ) -> Result<PreparedSeatPayment<Self::RefundContext>, FiPaymentError> {
        let quote_id = quote.quote_id();
        let parsed = parse_paid_quote(quote)
            .map_err(|error| payment_error("quote payment terms are invalid", error))?;
        let federation = self.federation(&parsed.federation_id.0)?;
        if reservation.federation_id != parsed.federation_id.0 {
            return Err(FiPaymentError::new(
                "payment reservation belongs to a different federation",
            ));
        }
        federation
            .ensure_fi_funding_reservation_member(
                reservation.token,
                FiFundingQuoteId::from_bytes(quote_id.0),
            )
            .await
            .map_err(|error| payment_error("seat payment reservation is invalid", error))?;

        let journal = match read_journal(&federation, &quote_id).await {
            // `fi-client` calls create only after a recover-only probe
            // proved `NotStarted`, but replaying an existing journaled
            // funding is still safer than failing.
            Some(journal) => {
                validate_journal(&journal, &parsed).map_err(|error| {
                    payment_error("seat payment journal does not match quote", error)
                })?;
                journal
            }
            None => submit_seat_payment(&federation, reservation.token, &quote_id, &parsed)
                .await
                .map_err(|error| payment_error("funding the seat payment failed", error))?,
        };

        let operation_id = seat_payment_operation_id(&quote_id);
        let change_range = seat_payment_change_range(&federation, &quote_id, &journal).await?;
        let updates = federation.client.transaction_updates(operation_id).await;
        match seat_payment_tx_status(updates, journal.txid, ACCEPTANCE_TIMEOUT).await {
            SeatPaymentTxStatus::Accepted => {}
            SeatPaymentTxStatus::Rejected(reason) => {
                // Surface as an error; the next formation attempt's recovery
                // probe observes the same terminal rejection and clears the
                // quote.
                return Err(payment_error(
                    "seat payment was rejected by consensus",
                    reason,
                ));
            }
            SeatPaymentTxStatus::Pending => {
                return Err(FiPaymentError::new(
                    "seat payment is not yet accepted; retry",
                ));
            }
        }
        await_seat_payment_change(
            &federation,
            operation_id,
            change_range,
            CHANGE_SETTLE_TIMEOUT,
        )
        .await?;
        prepared_payment(&federation, reservation.token, &quote_id, &parsed, journal).await
    }

    async fn settle_seat_refund(
        &self,
        context: Self::RefundContext,
        refund: RefundTransaction,
    ) -> Result<SettledSeatRefund<Self::TerminalReleaseProof>, FiPaymentError> {
        let federation = self.federation(&context.federation_id)?;
        // Bind this refund issuance to the quote's journal row BEFORE any
        // crediting: an exact same-quote replay passes idempotently, while a
        // refund issuance already settled under a different quote (a
        // malicious FMan copying public refund outputs between quotes) is
        // refused instead of silently crediting nothing.
        guard_refund_settlement(&federation, &context.quote_id, context.issuance_hash()).await?;
        let settle = async {
            match &context.inner {
                RefundContextInner::V1 { requests } => {
                    settle_refund_v1(&federation, requests, &refund).await
                }
                RefundContextInner::V2 { requests } => {
                    settle_refund_v2(&federation, requests, &refund).await
                }
            }
        };
        let credited_msats = timeout(REFUND_SETTLE_TIMEOUT, settle)
            .await
            .map_err(|_| FiPaymentError::new("settling the seat refund timed out; retry"))?
            .map_err(|error| payment_error("settling the seat refund failed", error))?;
        record_refund_credit_completed(&federation, &context.quote_id, context.issuance_hash())
            .await?;
        // History bookkeeping only: the refund is already settled, so a
        // failure here must not block the seat's terminal release.
        if let Err(error) = federation
            .record_fi_funding_member_refund(
                context.reservation_token,
                FiFundingQuoteId::from_bytes(context.quote_id.0),
                Amount::from_msats(credited_msats),
            )
            .await
        {
            tracing::warn!(%error, "failed to record the seat refund for transaction history");
        }
        Ok(settled_refund_after_credit(&context, credited_msats))
    }
}

/// Construct the terminal result only after the caller has durably recorded
/// the credited refund marker. Keeping this boundary shared with regression
/// tests makes the exact wallet-owned release authority executable.
fn settled_refund_after_credit(
    context: &BridgeSeatRefundContext,
    credited_msats: u64,
) -> SettledSeatRefund<BridgeSeatTerminalReleaseProof> {
    SettledSeatRefund {
        amount_msats: credited_msats,
        release_proof: BridgeSeatTerminalReleaseProof {
            federation_id: context.federation_id.clone(),
            reservation_token: context.reservation_token,
            quote_id: FiFundingQuoteId::from_bytes(context.quote_id.0),
        },
    }
}

mod quote;
use quote::{denomination_from_amount, parse_paid_quote, plan_price_msats};

mod journal;
use journal::{
    federation_client_began_via_recovery, guard_refund_settlement, persist_journal_signatures,
    read_journal, record_refund_credit_completed, seat_payment_change_range,
    seat_payment_operation_id, validate_journal,
};
#[cfg(test)]
use journal::{
    journal_proves_refund_credited, merge_journal_signatures, validate_payment_operation_meta,
};

mod funding;
use funding::{
    SeatPaymentTxStatus, await_rejected_seat_payment_inputs, await_seat_payment_change,
    exact_funding_reservation_terms, preflight_exact_payments, seat_payment_tx_status,
    submit_seat_payment,
};
#[cfg(test)]
use funding::{
    await_rejected_input_refunds, inventory_fee_bound_msats,
    wallet_debit_from_finalized_transaction,
};

mod evidence;
use evidence::{collect_v1_signatures, collect_v2_signatures, mint_v2_config, prepared_payment};

mod refund;
#[cfg(test)]
use refund::{derive_v1_refund, derive_v2_refund, receive_or_resume_mint_v2_refund};
use refund::{
    dummy_blinded_message, dummy_v1_note, dummy_v2_note, prepare_quote_refund_inner,
    rebuild_refund_context, settle_refund_v1, settle_refund_v2,
};

mod denominations;
use denominations::{payment_error, quote_denominations, refund_denominations};

#[cfg(test)]
#[path = "fi_payments/tests.rs"]
mod tests;
