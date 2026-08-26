use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;

use fedimint_client_module::module::ClientContextIface;
use fedimint_client_module::transaction::{
    TRANSACTION_SUBMISSION_MODULE_INSTANCE, TxSubmissionStates, TxSubmissionStatesSM,
};
use fedimint_core::db::DatabaseTransaction;

use super::*; // nosemgrep: ban-wildcard-imports -- split private child module

// =========================== funding ===========================

pub(super) struct AggregateFundingReservationPlan {
    pub(super) federation: Arc<FederationV2>,
}

pub(super) struct ExactFundingReservationTerms {
    pub(super) federation: Arc<FederationV2>,
    pub(super) fingerprint: FiFundingFingerprint,
    pub(super) quote_ids: Vec<FiFundingQuoteId>,
}

/// Check the signed payment plan and compute its fingerprint, without
/// touching wallet state. Creating and recovering a reservation both go
/// through here, so a replay can't swap in different quotes. Hold amounts
/// aren't in here on purpose: they depend on the wallet's notes at the
/// time, and the saved reservation row is the source of truth for them.
pub(super) fn exact_funding_reservation_terms(
    federations: &Federations,
    reservation_id: &PaymentReservationId,
    preflight: &ExactPaymentPreflight<'_>,
) -> anyhow::Result<ExactFundingReservationTerms> {
    ensure!(
        !preflight.seats().is_empty(),
        "payment requirements contain no paid seats"
    );

    let payment_federation_id = &preflight.seats()[0].requirement().payment_federation_id;
    let federation = federations
        .get_federation(&payment_federation_id.0)
        .context("payment federation is not ready")?;
    let mut quote_ids = Vec::with_capacity(preflight.seats().len());
    let mut checked_total_msats = 0u64;
    let mut fingerprint = sha256::Hash::engine();
    fingerprint.input(FI_FUNDING_RESERVATION_FINGERPRINT_DOMAIN);
    let reservation_id_bytes = reservation_id.as_str().as_bytes();
    fingerprint.input(
        &u64::try_from(reservation_id_bytes.len())
            .context("reservation id is too long")?
            .to_le_bytes(),
    );
    fingerprint.input(reservation_id_bytes);
    let federation_id_bytes = payment_federation_id.0.as_bytes();
    fingerprint.input(
        &u64::try_from(federation_id_bytes.len())
            .context("payment federation id is too long")?
            .to_le_bytes(),
    );
    fingerprint.input(federation_id_bytes);
    fingerprint.input(
        &u64::try_from(preflight.seats().len())
            .context("too many reservation seats")?
            .to_le_bytes(),
    );
    fingerprint.input(&preflight.total_msats().to_le_bytes());
    match preflight.max_total_msats() {
        Some(cap) => {
            fingerprint.input(&[1]);
            fingerprint.input(&cap.to_le_bytes());
        }
        None => fingerprint.input(&[0]),
    }

    for seat in preflight.seats() {
        let requirement = seat.requirement();
        let quote = seat.quote();
        ensure!(
            quote.quote_id() == requirement.quote_id,
            "payment requirement names a different quote"
        );
        ensure!(
            &requirement.payment_federation_id == payment_federation_id,
            "payment requirements name different payer federations"
        );
        let parsed = parse_paid_quote(quote).context("quote payment terms are invalid")?;
        ensure!(
            &parsed.federation_id == payment_federation_id,
            "paid quote belongs to a different payment federation"
        );
        ensure!(
            parsed.price.msats() == requirement.amount_msats,
            "payment requirement amount differs from its quote"
        );
        checked_total_msats = checked_total_msats
            .checked_add(parsed.price.msats())
            .context("aggregate payment amount overflow")?;
        let funding_plan = seat_funding_plan(&federation.client, &parsed)?;
        fingerprint.input(&requirement.quote_id.0);
        fingerprint.input(&requirement.amount_msats.to_le_bytes());
        fingerprint.input(&funding_plan.issuance_hash.0);
        fingerprint.input(&[mint_generation_code(funding_plan.generation)]);
        quote_ids.push(FiFundingQuoteId::from_bytes(requirement.quote_id.0));
    }
    ensure!(
        checked_total_msats == preflight.total_msats(),
        "aggregate payment total differs from its quotes"
    );
    if let Some(cap) = preflight.max_total_msats() {
        ensure!(
            checked_total_msats <= cap,
            "aggregate payment exceeds its cap"
        );
    }

    Ok(ExactFundingReservationTerms {
        federation,
        fingerprint: FiFundingFingerprint::from_bytes(
            sha256::Hash::from_engine(fingerprint).to_byte_array(),
        ),
        quote_ids,
    })
}

/// Prove the complete signed quote set can be funded and return the exact
/// durable reservation plan.
///
/// We don't build any transactions here. One note can pay several seats in
/// a row — each payment's change funds the next — and that only works with
/// real, accepted transactions. So authorization just checks the numbers
/// and reserves the total; the payments themselves are built one at a time
/// later, under the spend lock.
///
/// Each seat's hold is its quoted amount plus a worst-case fee for spending
/// the notes actually in the wallet (plus one set of change notes for seats
/// paid from an earlier seat's change) — a few sats, not the old
/// imaginary-wallet bound. The real payment's cost is still checked against
/// this hold before it commits, so it fails safely if the wallet got worse
/// in the meantime.
pub(super) async fn preflight_exact_payments(
    federations: &Federations,
    reservation_token: FiFundingReservationToken,
    reservation_id: &PaymentReservationId,
    preflight: &ExactPaymentPreflight<'_>,
) -> anyhow::Result<AggregateFundingReservationPlan> {
    let ExactFundingReservationTerms {
        federation,
        fingerprint,
        quote_ids,
    } = exact_funding_reservation_terms(federations, reservation_id, preflight)?;

    // Take the spend lock so nothing else spends while we check the balance
    // and install the hold.
    let spend_guard = federation.lock_fi_funding_spend().await;
    let reconstructing = federation
        .has_fi_funding_reservation(reservation_token)
        .await;
    let mut members = Vec::with_capacity(preflight.seats().len());
    for seat in preflight.seats() {
        let requirement = seat.requirement();
        let parsed = parse_paid_quote(seat.quote())?;
        if let Some(journal) = read_journal(&federation, &requirement.quote_id).await {
            ensure!(
                reconstructing,
                "new payment reservation reuses an already journaled quote"
            );
            validate_journal(&journal, &parsed)
                .context("reconstructed reservation journal does not match its quote")?;
            continue;
        }
        let hold = seat_payment_hold_msats(&federation.client, &parsed).await?;
        members.push(FiFundingReservationMember::new(
            FiFundingQuoteId::from_bytes(requirement.quote_id.0),
            hold,
        )?);
    }
    if reconstructing {
        // The saved row already has the hold amounts; the ones we just
        // computed get thrown away (the wallet's notes may have changed).
        // But the saved row must still be for the same quotes.
        ensure!(
            federation
                .recover_fi_funding_reservation(reservation_token, fingerprint, &quote_ids)
                .await?,
            "reconstructed FI funding reservation row is missing"
        );
    } else {
        federation
            .reserve_fi_funding(&spend_guard, reservation_token, fingerprint, members)
            .await?;
    }
    drop(spend_guard);
    Ok(AggregateFundingReservationPlan { federation })
}

pub(super) fn seat_payment_output_bundle(
    client: &ClientHandle,
    parsed: &ParsedPaidQuote,
) -> anyhow::Result<(
    ModuleInstanceId,
    fedimint_client_module::transaction::ClientOutputBundle,
)> {
    match &parsed.payment {
        ParsedIssuance::V1(issuance) => {
            let mint = client.mint()?;
            let outputs = issuance
                .iter()
                .map(|(amount, nonce)| ClientOutput {
                    output: MintV1Output::new_v0(*amount, *nonce),
                    amounts: Amounts::new_bitcoin(*amount),
                })
                .collect::<Vec<_>>();
            Ok((
                mint.id,
                ClientOutputBundle::new_no_sm(outputs).into_dyn(mint.id),
            ))
        }
        ParsedIssuance::V2(issuance) => {
            let mint = client.mintv2()?;
            let outputs = issuance
                .iter()
                .map(|(denomination, nonce, tweak)| ClientOutput {
                    output: MintV2Output::new_v0(*denomination, *nonce, *tweak),
                    amounts: Amounts::new_bitcoin(denomination.amount()),
                })
                .collect::<Vec<_>>();
            Ok((
                mint.id,
                ClientOutputBundle::new_no_sm(outputs).into_dyn(mint.id),
            ))
        }
    }
}

/// Face value plus the quoted outputs' own fees. Funding-input and change
/// fees are not included here: the hold adds a note-inventory bound for
/// them, and the finalized debit is exact at commit time.
pub(super) fn seat_payment_quoted_msats(
    client: &ClientHandle,
    parsed: &ParsedPaidQuote,
) -> anyhow::Result<u64> {
    let output_fees = match &parsed.payment {
        ParsedIssuance::V1(issuance) => {
            let mint = client.mint()?;
            issuance
                .iter()
                .try_fold(0u64, |sum, (amount, nonce)| {
                    sum.checked_add(
                        mint.output_fee(
                            &Amounts::new_bitcoin(*amount),
                            &MintV1Output::new_v0(*amount, *nonce),
                        )?
                        .get_bitcoin()
                        .msats,
                    )
                })
                .context("mint-v1 output fees overflowed")?
        }
        ParsedIssuance::V2(issuance) => {
            let mint = client.mintv2()?;
            issuance
                .iter()
                .try_fold(0u64, |sum, (denomination, nonce, tweak)| {
                    sum.checked_add(
                        mint.output_fee(
                            &Amounts::new_bitcoin(denomination.amount()),
                            &MintV2Output::new_v0(*denomination, *nonce, *tweak),
                        )?
                        .get_bitcoin()
                        .msats,
                    )
                })
                .context("mint-v2 output fees overflowed")?
        }
    };
    parsed
        .price
        .msats()
        .checked_add(output_fees)
        .context("seat payment quoted amount overflowed")
}

/// The durable per-seat hold: quoted amount plus a worst-case note-fee bound
/// over the wallet's actual note inventory.
pub(super) async fn seat_payment_hold_msats(
    client: &ClientHandle,
    parsed: &ParsedPaidQuote,
) -> anyhow::Result<u64> {
    let quoted = seat_payment_quoted_msats(client, parsed)?;
    let fee_bound = match &parsed.payment {
        ParsedIssuance::V1(_) => {
            let mint = client.mint()?;
            let mut dbtx = mint.db.begin_transaction_nc().await;
            let counts = mint.get_note_counts_by_denomination(&mut dbtx).await;
            drop(dbtx);
            let notes = counts
                .iter()
                .map(|(amount, count)| (amount, count as u64))
                .collect::<Vec<_>>();
            let context = mint.context();
            let tiers = context.tbs_pks.tiers().copied().collect::<Vec<_>>();
            let fee_nonce = BlindNonce(dummy_blinded_message());
            inventory_fee_bound_msats(
                quoted,
                &notes,
                &tiers,
                |amount| {
                    Some(
                        mint.input_fee(
                            &Amounts::new_bitcoin(amount),
                            &MintV1Input::new_v0(amount, dummy_v1_note()),
                        )?
                        .get_bitcoin()
                        .msats,
                    )
                },
                |amount| {
                    Some(
                        mint.output_fee(
                            &Amounts::new_bitcoin(amount),
                            &MintV1Output::new_v0(amount, fee_nonce),
                        )?
                        .get_bitcoin()
                        .msats,
                    )
                },
            )
            .context("mint-v1 funding fee bound overflowed")?
        }
        ParsedIssuance::V2(_) => {
            let mint = client.mintv2()?;
            let counts = mint.get_count_by_denomination().await;
            let notes = counts
                .iter()
                .map(|(denomination, count)| (denomination.amount(), *count))
                .collect::<Vec<_>>();
            let tiers = consensus_denominations()
                .map(Denomination::amount)
                .collect::<Vec<_>>();
            let dummy_nonce = dummy_blinded_message();
            inventory_fee_bound_msats(
                quoted,
                &notes,
                &tiers,
                |amount| {
                    let denomination = denomination_from_amount(amount.msats).ok()?;
                    Some(
                        mint.input_fee(
                            &Amounts::new_bitcoin(amount),
                            &MintV2Input::new_v0(dummy_v2_note(denomination)),
                        )?
                        .get_bitcoin()
                        .msats,
                    )
                },
                |amount| {
                    let denomination = denomination_from_amount(amount.msats).ok()?;
                    Some(
                        mint.output_fee(
                            &Amounts::new_bitcoin(amount),
                            &MintV2Output::new_v0(denomination, dummy_nonce, [0; 16]),
                        )?
                        .get_bitcoin()
                        .msats,
                    )
                },
            )
            .context("mint-v2 funding fee bound overflowed")?
        }
    };
    quoted
        .checked_add(fee_bound)
        .context("seat payment hold overflowed")
}

/// Canonical transaction plan used by both aggregate readiness and the
/// durable commit. Keeping the output bundle and quoted amount together
/// prevents preflight and submission from drifting.
pub(super) struct SeatFundingPlan {
    mint_module: ModuleInstanceId,
    bundle: fedimint_client_module::transaction::ClientOutputBundle,
    quoted_msats: u64,
    output_count: u64,
    issuance_hash: PaymentIssuanceHash,
    generation: MintGeneration,
}

pub(super) fn seat_funding_plan(
    client: &ClientHandle,
    parsed: &ParsedPaidQuote,
) -> anyhow::Result<SeatFundingPlan> {
    let (mint_module, bundle) = seat_payment_output_bundle(client, parsed)?;
    Ok(SeatFundingPlan {
        mint_module,
        bundle,
        quoted_msats: seat_payment_quoted_msats(client, parsed)?,
        output_count: u64::try_from(parsed.payment.len()).context("too many payment outputs")?,
        issuance_hash: parsed.payment.payment_hash(),
        generation: parsed.payment.generation(),
    })
}

pub(super) enum SeatPaymentTxStatus {
    Accepted,
    Rejected(String),
    Pending,
}

pub(super) async fn seat_payment_tx_status(
    updates: TransactionUpdates,
    txid: TransactionId,
    wait: Duration,
) -> SeatPaymentTxStatus {
    match timeout(wait, updates.await_tx_accepted(txid)).await {
        Ok(Ok(())) => SeatPaymentTxStatus::Accepted,
        Ok(Err(reason)) => SeatPaymentTxStatus::Rejected(reason),
        Err(_) => SeatPaymentTxStatus::Pending,
    }
}

/// Wait until this payment's change is back in the wallet and spendable.
pub(super) async fn await_seat_payment_change(
    federation: &FederationV2,
    operation_id: OperationId,
    change_range: OutPointRange,
    wait: Duration,
) -> Result<(), FiPaymentError> {
    if change_range.count() == 0 {
        return Ok(());
    }
    timeout(
        wait,
        federation
            .client
            .await_primary_bitcoin_module_outputs(operation_id, change_range.into_iter().collect()),
    )
    .await
    .map_err(|_| FiPaymentError::new("seat payment change is not yet spendable; retry"))?
    .map_err(|error| payment_error("finalizing seat payment change failed", error))
}

/// After a payment is rejected, Fedimint automatically refunds the notes it
/// tried to spend. Wait until every one of them is spendable again before
/// letting the payment be replaced. The update stream can repeat itself and
/// arrive out of order, so we track transactions by id.
pub(super) async fn await_rejected_seat_payment_inputs(
    federation: &FederationV2,
    operation_id: OperationId,
    rejected_txid: TransactionId,
    mint_module: ModuleInstanceId,
    wait: Duration,
) -> Result<(), FiPaymentError> {
    let updates = federation.client.transaction_updates(operation_id).await;
    timeout(
        wait,
        await_rejected_input_refunds(
            operation_id,
            rejected_txid,
            mint_module,
            updates,
            |outpoints| {
                federation
                    .client
                    .await_primary_bitcoin_module_outputs(operation_id, outpoints)
            },
        ),
    )
    .await
    .map_err(|_| FiPaymentError::new("rejected seat payment inputs are not yet spendable; retry"))?
    .map_err(|error| payment_error("recovering rejected seat payment inputs failed", error))
}

/// Count how many times each note appears as an input of this transaction.
fn count_payer_notes(
    transaction: &fedimint_core::transaction::Transaction,
    mint_module: ModuleInstanceId,
) -> anyhow::Result<BTreeMap<Vec<u8>, u64>> {
    transaction
        .inputs
        .iter()
        .try_fold(BTreeMap::<Vec<u8>, u64>::new(), |mut inputs, input| {
            ensure!(
                input.module_instance_id() == mint_module,
                "seat-payment refund transaction contains a non-payer input"
            );
            let count = inputs.entry(input.consensus_encode_to_vec()).or_default();
            *count = count
                .checked_add(1)
                .context("a note appeared too many times in a seat payment")?;
            Ok(inputs)
        })
}

/// True if the refund only spends notes from the original payment, and no
/// note more times than the original spent it.
fn uses_only_notes_from(
    candidate: &BTreeMap<Vec<u8>, u64>,
    original: &BTreeMap<Vec<u8>, u64>,
) -> bool {
    candidate.iter().all(|(input, count)| {
        original
            .get(input)
            .is_some_and(|original_count| count <= original_count)
    })
}

pub(super) async fn await_rejected_input_refunds<F, Fut>(
    operation_id: OperationId,
    original_txid: TransactionId,
    mint_module: ModuleInstanceId,
    mut updates: TransactionUpdates,
    mut await_outputs: F,
) -> anyhow::Result<()>
where
    F: FnMut(Vec<OutPoint>) -> Fut,
    Fut: Future<Output = anyhow::Result<()>>,
{
    let mut transactions = BTreeMap::new();
    let mut accepted = BTreeSet::new();
    let mut rejected = BTreeSet::new();
    let mut counted = BTreeSet::new();
    let mut original_inputs = None;
    let mut recovered = BTreeMap::<Vec<u8>, u64>::new();
    let mut refund_outpoints = Vec::new();
    while let Some(update) = updates.update_stream.next().await {
        ensure!(
            update.operation_id == operation_id,
            "seat-payment refund stream returned another operation"
        );
        match update.state {
            TxSubmissionStates::Created(transaction) => {
                let txid = transaction.tx_hash();
                if txid == original_txid {
                    let inputs = count_payer_notes(&transaction, mint_module)?;
                    ensure!(
                        !inputs.is_empty(),
                        "rejected seat payment contains no payer inputs"
                    );
                    original_inputs = Some(inputs);
                }
                transactions.insert(txid, transaction);
            }
            TxSubmissionStates::Accepted(txid) => {
                ensure!(
                    !rejected.contains(&txid),
                    "refund transaction has contradictory terminal states"
                );
                accepted.insert(txid);
            }
            TxSubmissionStates::Rejected(txid, _) => {
                ensure!(
                    !accepted.contains(&txid),
                    "refund transaction has contradictory terminal states"
                );
                rejected.insert(txid);
            }
            TxSubmissionStates::NonRetryableError(_) => {}
        }

        let Some(original_inputs) = original_inputs.as_ref() else {
            continue;
        };
        let ready = accepted
            .iter()
            .filter(|txid| **txid != original_txid && !counted.contains(*txid))
            .filter_map(|txid| transactions.get(txid).cloned().map(|tx| (*txid, tx)))
            .collect::<Vec<_>>();
        for (txid, transaction) in ready {
            let candidate_inputs = count_payer_notes(&transaction, mint_module)?;
            ensure!(
                !candidate_inputs.is_empty()
                    && uses_only_notes_from(&candidate_inputs, original_inputs),
                "accepted operation sibling is not an exact rejected-input refund"
            );
            ensure!(
                !transaction.outputs.is_empty()
                    && transaction
                        .outputs
                        .iter()
                        .all(|output| output.module_instance_id() == mint_module),
                "accepted rejected-input refund has non-primary or empty outputs"
            );
            for (input, count) in &candidate_inputs {
                let recovered_count = recovered.entry(input.clone()).or_default();
                *recovered_count = recovered_count
                    .checked_add(*count)
                    .context("a note appeared too many times across refunds")?;
            }
            ensure!(
                uses_only_notes_from(&recovered, original_inputs),
                "accepted refund transactions overlap original inputs"
            );
            refund_outpoints.extend((0..transaction.outputs.len()).map(|out_idx| OutPoint {
                txid,
                out_idx: out_idx as u64,
            }));
            counted.insert(txid);
            if &recovered == original_inputs {
                await_outputs(refund_outpoints).await?;
                return Ok(());
            }
        }
    }
    bail!("refund stream ended before restoring every rejected payment input")
}

/// Recover the finalized transaction from the just-written submission state
/// machine and calculate the payer wallet's exact debit: selected input face
/// value minus change returned to this wallet. This includes every finalized
/// input/output fee and is checked before the database transaction commits.
async fn finalized_wallet_debit_msats(
    client: &ClientHandle,
    dbtx: &mut DatabaseTransaction<'_>,
    operation_id: OperationId,
    change_range: OutPointRange,
    mint_module: ModuleInstanceId,
    generation: MintGeneration,
) -> anyhow::Result<u64> {
    let mut states = ClientContextIface::read_operation_active_states(
        &**client,
        operation_id,
        TRANSACTION_SUBMISSION_MODULE_INSTANCE,
        dbtx,
    )
    .await;
    let mut transaction = None;
    while let Some((state, _)) = states.next().await {
        let Some(submission) = state.state.as_any().downcast_ref::<TxSubmissionStatesSM>() else {
            continue;
        };
        if let TxSubmissionStates::Created(created) = &submission.state {
            transaction = Some(created.clone());
            break;
        }
    }
    drop(states);
    let transaction = transaction.context("finalized transaction submission state is missing")?;
    wallet_debit_from_finalized_transaction(&transaction, change_range, mint_module, generation)
}

pub(super) fn wallet_debit_from_finalized_transaction(
    transaction: &fedimint_core::transaction::Transaction,
    change_range: OutPointRange,
    mint_module: ModuleInstanceId,
    generation: MintGeneration,
) -> anyhow::Result<u64> {
    ensure!(
        transaction.tx_hash() == change_range.txid(),
        "finalized transaction differs from the returned change range"
    );

    let input_total = transaction.inputs.iter().try_fold(0u64, |sum, input| {
        ensure!(
            input.module_instance_id() == mint_module,
            "finalized payment used a non-payer input module"
        );
        let amount = match generation {
            MintGeneration::MintV1 => match input
                .as_any()
                .downcast_ref::<MintV1Input>()
                .context("finalized mint-v1 input has the wrong type")?
            {
                MintV1Input::V0(input) => input.amount,
                _ => bail!("unsupported finalized mint-v1 input version"),
            },
            MintGeneration::MintV2 => match input
                .as_any()
                .downcast_ref::<MintV2Input>()
                .context("finalized mint-v2 input has the wrong type")?
            {
                MintV2Input::V0(input) => input.note.amount(),
                _ => bail!("unsupported finalized mint-v2 input version"),
            },
        };
        sum.checked_add(amount.msats)
            .context("finalized input amount overflowed")
    })?;

    let change_total = change_range.out_idx_iter().try_fold(0u64, |sum, index| {
        let index = usize::try_from(index).context("change output index does not fit usize")?;
        let output = transaction
            .outputs
            .get(index)
            .context("change range exceeds finalized transaction outputs")?;
        ensure!(
            output.module_instance_id() == mint_module,
            "finalized change used a non-payer output module"
        );
        let amount = match generation {
            MintGeneration::MintV1 => match output
                .as_any()
                .downcast_ref::<MintV1Output>()
                .context("finalized mint-v1 change has the wrong type")?
            {
                MintV1Output::V0(output) => output.amount,
                _ => bail!("unsupported finalized mint-v1 output version"),
            },
            MintGeneration::MintV2 => match output
                .as_any()
                .downcast_ref::<MintV2Output>()
                .context("finalized mint-v2 change has the wrong type")?
            {
                MintV2Output::V0(output) => output.denomination.amount(),
                _ => bail!("unsupported finalized mint-v2 output version"),
            },
        };
        sum.checked_add(amount.msats)
            .context("finalized change amount overflowed")
    })?;

    input_total
        .checked_sub(change_total)
        .context("finalized change exceeds selected payment inputs")
}

/// Journal and submit the funding transaction atomically.
///
/// The quoted foreign outputs are appended without client state machines
/// (`ClientOutputBundle::new_no_sm`); this wallet relays the output outcomes
/// itself. `TransactionBuilder` keeps the supplied outputs first and appends
/// balancing change after them, so the quoted range is `0..output_count` of
/// the funding transaction.
pub(super) async fn submit_seat_payment(
    federation: &FederationV2,
    reservation_token: FiFundingReservationToken,
    quote_id: &QuoteId,
    parsed: &ParsedPaidQuote,
) -> anyhow::Result<FiSeatPaymentJournal> {
    let client = &federation.client;
    let operation_id = seat_payment_operation_id(quote_id);
    let funding_plan = seat_funding_plan(client, parsed)?;

    // Hold the federation-wide spend guard across balance check and commit
    // so concurrent bridge spends cannot race the virtual balance. The
    // virtual balance keeps accrued Fedi fees unspendable. This gate covers
    // the quoted issuance and its output fees; funding-input and change fees
    // are exact in the finalized debit, which is checked against the
    // captured virtual balance and the inventory-derived per-seat hold
    // before commit.
    let spend_guard = federation.lock_fi_funding_spend().await;
    let virtual_balance = federation
        .get_balance_including_fi_reservation(&spend_guard, reservation_token)
        .await?;
    ensure!(
        Amount::from_msats(funding_plan.quoted_msats) <= virtual_balance,
        "insufficient balance for the seat payment"
    );

    let quote_id_hex = hex::encode(quote_id.0);
    let tx_builder = TransactionBuilder::new().with_outputs(funding_plan.bundle);
    let mint_module = funding_plan.mint_module;
    let output_count = funding_plan.output_count;
    let issuance_hash = funding_plan.issuance_hash;
    let generation = funding_plan.generation;
    // Autocommit mirrors `Client::finalize_and_submit_transaction`: retry
    // the whole finalize+journal closure on optimistic-lock conflicts so
    // both writes always land in one committed transaction. FederationV2
    // creates that transaction from this exact payer database, so a branded
    // spend guard can never be paired with another federation's transaction.
    let autocommit_result = federation
        .autocommit_fi_funding(
            &spend_guard,
            |mut funding_tx, _| {
                let tx_builder = tx_builder.clone();
                let quote_id_hex = quote_id_hex.clone();
                Box::pin(async move {
                    let change_range = client
                        .finalize_and_submit_transaction_dbtx(
                            funding_tx.database_transaction(),
                            operation_id,
                            FI_SEAT_PAYMENT_OPERATION_TYPE,
                            move |change: OutPointRange| FiSeatPaymentOperationMeta {
                                version: FI_SEAT_PAYMENT_OPERATION_META_VERSION,
                                quote_id: quote_id_hex,
                                txid: change.txid(),
                                change_range: change,
                            },
                            tx_builder,
                        )
                        .await
                        .context("fund and submit seat payment")?;
                    let exact_debit = finalized_wallet_debit_msats(
                        client,
                        funding_tx.database_transaction(),
                        operation_id,
                        change_range,
                        mint_module,
                        generation,
                    )
                    .await?;
                    ensure!(
                        exact_debit <= virtual_balance.msats,
                        "finalized seat payment debit exceeds the captured virtual balance"
                    );
                    let balance_change = funding_tx
                        .consume_reservation_member(
                            reservation_token,
                            FiFundingQuoteId::from_bytes(quote_id.0),
                            Amount::from_msats(exact_debit),
                        )
                        .await?;
                    let journal = FiSeatPaymentJournal {
                        version: FI_SEAT_PAYMENT_JOURNAL_VERSION,
                        generation: mint_generation_code(generation),
                        mint_module,
                        txid: change_range.txid(),
                        output_count,
                        issuance_hash: issuance_hash.0,
                        payment_signatures: None,
                        claimed_refund_issuance_hash: None,
                        credited_refund_issuance_hash: None,
                    };
                    funding_tx
                        .database_transaction()
                        .insert_entry(&FiSeatPaymentJournalKey::new(quote_id.0), &journal)
                        .await;
                    // Atomic-before-any-network-submission: state machines
                    // (including the transaction submission state machine)
                    // only start executing after this commit, so the journal
                    // is durable strictly before any submission.
                    Ok((journal, balance_change))
                })
            },
            Some(100),
        )
        .await?;
    let (journal, balance_change) = match autocommit_result {
        Ok(result) => result,
        Err(AutocommitError::ClosureError { error, .. }) => return Err(error),
        Err(AutocommitError::CommitFailed {
            attempts,
            last_error,
        }) => {
            return Err(anyhow!(last_error).context(format!(
                "commit seat payment funding after {attempts} attempts"
            )));
        }
    };
    federation
        .emit_fi_funding_balance_change(&balance_change)
        .await?;
    drop(spend_guard);
    Ok(journal)
}

/// Worst-case fee for paying `spend_msats` with the notes the wallet
/// actually has (`notes` is (value, count) per denomination).
///
/// We can't know which notes the payment will pick, but it can only pick
/// notes that exist. The worst pick uses the smallest useful notes first,
/// so charge a fee for each of those. A seat paid from an earlier seat's
/// change can also spend up to one change note per denomination, so allow
/// one extra set of those, plus the change this payment mints itself.
pub(super) fn inventory_fee_bound_msats(
    spend_msats: u64,
    notes: &[(Amount, u64)],
    change_tiers: &[Amount],
    input_fee: impl Fn(Amount) -> Option<u64>,
    output_fee: impl Fn(Amount) -> Option<u64>,
) -> Option<u64> {
    // Skip notes that cost more in fees than they're worth — the wallet
    // never spends those.
    let mut economical = Vec::with_capacity(notes.len());
    for &(value, count) in notes {
        let fee = input_fee(value)?;
        if fee < value.msats && count > 0 {
            economical.push((value.msats, count, fee));
        }
    }
    economical.sort_unstable();
    let mut remaining = spend_msats;
    let mut bound = 0u64;
    for (value, count, fee) in economical {
        if remaining == 0 {
            break;
        }
        let effective = value - fee;
        let needed = remaining.div_ceil(effective);
        let used = needed.min(count);
        bound = bound.checked_add(fee.checked_mul(used)?)?;
        remaining = remaining.saturating_sub(effective.saturating_mul(used));
    }
    // One set of change notes: spending change from an earlier seat costs
    // an input fee, and this payment's own change costs an output fee.
    for &tier in change_tiers {
        let fee = input_fee(tier)?;
        if fee < tier.msats {
            bound = bound.checked_add(fee)?;
            bound = bound.checked_add(output_fee(tier)?)?;
        }
    }
    Some(bound)
}
