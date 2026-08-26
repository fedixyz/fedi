use fedimint_mintv2_client::ReceiveECashError;

use super::*; // nosemgrep: ban-wildcard-imports -- split private child module

// =========================== refund issuance ===========================

/// Derivation root for one quote request's refund issuance: a dedicated
/// child of the paying federation's auxiliary secret, tweaked by the public
/// refund nonce. Re-derivable from the quote alone; nothing persists.
pub(super) fn refund_root(
    auxiliary_secret: &DerivableSecret,
    refund_nonce: &[u8; 32],
) -> DerivableSecret {
    auxiliary_secret
        .child_key(FI_SEAT_REFUND_CHILD_ID)
        .tweak(refund_nonce)
}

pub(super) fn derive_v1_refund(
    auxiliary_secret: &DerivableSecret,
    refund_nonce: &[u8; 32],
    denominations: &[Amount],
) -> Vec<(Amount, MintV1IssuanceRequest, BlindNonce)> {
    let root = refund_root(auxiliary_secret, refund_nonce);
    denominations
        .iter()
        .enumerate()
        .map(|(index, amount)| {
            let secret = root
                .child_key(ChildId(index as u64))
                .child_key(ChildId(amount.msats));
            let (request, blind_nonce) =
                MintV1IssuanceRequest::new(fedimint_core::secp256k1::SECP256K1, &secret);
            (*amount, request, blind_nonce)
        })
        .collect()
}

pub(super) fn derive_v2_refund(
    auxiliary_secret: &DerivableSecret,
    refund_nonce: &[u8; 32],
    denominations: &[Denomination],
) -> Vec<MintV2IssuanceRequest> {
    let root = refund_root(auxiliary_secret, refund_nonce);
    denominations
        .iter()
        .enumerate()
        .map(|(index, denomination)| {
            // Distinct per-index tweaks keep repeated denominations on
            // distinct note keys under mint-v2's tweak derivation.
            let tweak: [u8; 16] = root.child_key(ChildId(index as u64)).to_random_bytes();
            MintV2IssuanceRequest::new(*denomination, tweak, &root)
        })
        .collect()
}

pub(super) fn prepare_quote_refund_inner(
    federation: &FederationV2,
    price_msats: u64,
    refund_nonce: [u8; 32],
) -> anyhow::Result<RefundIssuance> {
    // The refund transaction spends the quoted paid notes back to us, so its
    // outputs must equal the paid total minus the refund transaction's input
    // and output fees. The paid issuance set is not known until the FMan
    // quotes it, but both sides derive it with the same deterministic greedy
    // split over the same tier list, so we can predict it exactly; the FMan
    // re-validates the refund against its own expectation before quoting.
    if let Ok(mint) = federation.client.mintv2() {
        let tiers = consensus_denominations()
            .filter(|denomination| denomination.amount().msats > UNECONOMICAL_DENOMINATION_MSATS)
            .map(Denomination::amount)
            .collect::<Vec<_>>();
        let paid = quote_denominations(price_msats, &tiers)
            .context("price is not representable by mint-v2 denominations")?;
        let input_fees = paid.iter().try_fold(0u64, |sum, amount| {
            let denomination = denomination_from_amount(amount.msats).ok()?;
            let fee = mint
                .input_fee(
                    &Amounts::new_bitcoin(*amount),
                    &MintV2Input::new_v0(dummy_v2_note(denomination)),
                )?
                .get_bitcoin()
                .msats;
            sum.checked_add(fee)
        });
        let target = input_fees
            .and_then(|fees| price_msats.checked_sub(fees))
            .context("mint fees exceed the quoted price")?;
        let dummy_blind_nonce = dummy_blinded_message();
        let refund_amounts = refund_denominations(
            &tiers,
            |amount| {
                let denomination =
                    denomination_from_amount(amount.msats).expect("tier is a power of two");
                mint.output_fee(
                    &Amounts::new_bitcoin(amount),
                    &MintV2Output::new_v0(denomination, dummy_blind_nonce, [0; 16]),
                )
                .expect("bitcoin mint-v2 supplies output fees")
                .get_bitcoin()
            },
            target,
        )?;
        let denominations = refund_amounts
            .iter()
            .map(|amount| denomination_from_amount(amount.msats))
            .collect::<anyhow::Result<Vec<_>>>()?;
        let requests =
            derive_v2_refund(&federation.auxiliary_secret, &refund_nonce, &denominations);
        Ok(RefundIssuance::MintV2 {
            refund_nonce,
            issuance: requests
                .iter()
                .map(|request| LockedIssuanceRequestV2 {
                    amount_msats: request.denomination.amount().msats,
                    blind_nonce: request.blinded_message().consensus_encode_to_vec(),
                    tweak: request.tweak,
                })
                .collect(),
        })
    } else {
        let mint = federation.client.mint()?;
        let context = mint.context();
        let tiers = context.tbs_pks.tiers().copied().collect::<Vec<_>>();
        let paid = quote_denominations(price_msats, &tiers)
            .context("price is not representable by the mint denomination tiers")?;
        let input_fees = paid.iter().try_fold(0u64, |sum, amount| {
            let fee = mint
                .input_fee(
                    &Amounts::new_bitcoin(*amount),
                    &MintV1Input::new_v0(*amount, dummy_v1_note()),
                )?
                .get_bitcoin()
                .msats;
            sum.checked_add(fee)
        });
        let target = input_fees
            .and_then(|fees| price_msats.checked_sub(fees))
            .context("mint fees exceed the quoted price")?;
        let fee_nonce = BlindNonce(dummy_blinded_message());
        let refund_amounts = refund_denominations(
            &tiers,
            |amount| {
                mint.output_fee(
                    &Amounts::new_bitcoin(amount),
                    &MintV1Output::new_v0(amount, fee_nonce),
                )
                .expect("mint-v1 supplies bitcoin output fees")
                .get_bitcoin()
            },
            target,
        )?;
        let requests =
            derive_v1_refund(&federation.auxiliary_secret, &refund_nonce, &refund_amounts);
        Ok(RefundIssuance::MintV1 {
            refund_nonce,
            issuance: requests
                .iter()
                .map(|(amount, _, blind_nonce)| LockedIssuanceRequest {
                    amount_msats: amount.msats,
                    blind_nonce: blind_nonce.consensus_encode_to_vec(),
                })
                .collect(),
        })
    }
}

/// Re-derive the refund key material for the quote's public refund issuance
/// and refuse to present a payment whose refund this wallet cannot claim.
pub(super) fn rebuild_refund_context(
    federation: &FederationV2,
    reservation_token: FiFundingReservationToken,
    quote_id: &QuoteId,
    parsed: &ParsedPaidQuote,
) -> anyhow::Result<BridgeSeatRefundContext> {
    let inner = match &parsed.refund {
        ParsedIssuance::V1(issuance) => {
            let denominations = issuance
                .iter()
                .map(|(amount, _)| *amount)
                .collect::<Vec<_>>();
            let requests = derive_v1_refund(
                &federation.auxiliary_secret,
                &parsed.refund_nonce,
                &denominations,
            );
            ensure!(
                requests
                    .iter()
                    .zip(issuance)
                    .all(|((_, _, derived), (_, quoted))| derived == quoted),
                "quoted refund issuance was not derived by this wallet"
            );
            RefundContextInner::V1 { requests }
        }
        ParsedIssuance::V2(issuance) => {
            let denominations = issuance
                .iter()
                .map(|(denomination, _, _)| *denomination)
                .collect::<Vec<_>>();
            let requests = derive_v2_refund(
                &federation.auxiliary_secret,
                &parsed.refund_nonce,
                &denominations,
            );
            ensure!(
                requests
                    .iter()
                    .zip(issuance)
                    .all(|(derived, (_, quoted_nonce, quoted_tweak))| {
                        derived.blinded_message() == *quoted_nonce && derived.tweak == *quoted_tweak
                    }),
                "quoted refund issuance was not derived by this wallet"
            );
            RefundContextInner::V2 { requests }
        }
    };
    Ok(BridgeSeatRefundContext {
        federation_id: parsed.federation_id.0.clone(),
        reservation_token,
        quote_id: *quote_id,
        inner,
    })
}

pub(super) fn dummy_blinded_message() -> BlindedMessage {
    BlindedMessage(bls12_381::G1Affine::generator())
}

/// Fee methods ignore note contents; a syntactically valid placeholder keeps
/// the calculation on the real fee API.
pub(super) fn dummy_v1_note() -> MintV1Note {
    MintV1Note {
        nonce: MintV1Nonce(dummy_public_key()),
        signature: tbs::Signature(bls12_381::G1Affine::generator()),
    }
}

pub(super) fn dummy_v2_note(denomination: Denomination) -> MintV2Note {
    MintV2Note {
        denomination,
        nonce: dummy_public_key(),
        signature: tbs::Signature(bls12_381::G1Affine::generator()),
    }
}

pub(super) fn dummy_public_key() -> fedimint_core::secp256k1::PublicKey {
    fedimint_core::secp256k1::PublicKey::from_secret_key(
        fedimint_core::secp256k1::SECP256K1,
        &fedimint_core::secp256k1::SecretKey::from_slice(&[1; 32]).expect("one is a valid scalar"),
    )
}

// =========================== refund settlement ===========================

pub(super) async fn settle_refund_v1(
    federation: &FederationV2,
    requests: &[(Amount, MintV1IssuanceRequest, BlindNonce)],
    refund: &RefundTransaction,
) -> anyhow::Result<u64> {
    let client = &federation.client;
    let mint = client.mint()?;
    let transaction = fedimint_core::transaction::Transaction::consensus_decode_whole(
        &refund.0,
        client.decoders(),
    )
    .context("decode refund transaction")?;
    ensure!(
        transaction.outputs.len() == requests.len(),
        "refund transaction output count differs from the prepared issuance"
    );
    for (output, (amount, _, blind_nonce)) in transaction.outputs.iter().zip(requests) {
        ensure!(
            output.module_instance_id() == mint.id
                && output
                    .as_any()
                    .downcast_ref::<MintV1Output>()
                    .is_some_and(|output| output == &MintV1Output::new_v0(*amount, *blind_nonce)),
            "refund transaction outputs differ from the prepared issuance"
        );
    }
    let txid = submit_refund_transaction(client, transaction).await?;

    let outputs = requests
        .iter()
        .map(|(amount, _, blind_nonce)| (*amount, *blind_nonce))
        .collect::<Vec<_>>();
    let signatures = collect_v1_signatures(client, txid, &outputs).await?;
    let context = mint.context();
    let notes = requests
        .iter()
        .zip(&signatures)
        .map(|((amount, request, _), signature)| {
            let note = request.finalize(*signature);
            let tier_key = *context
                .tbs_pks
                .tier(amount)
                .map_err(|_| anyhow!("mint has no key for denomination {amount}"))?;
            let public_note = MintV1Note {
                nonce: MintV1Nonce(note.spend_key.public_key()),
                signature: note.signature,
            };
            ensure!(
                public_note.verify(tier_key),
                "invalid refund note signature"
            );
            Ok((*amount, note))
        })
        .collect::<anyhow::Result<TieredMulti<_>>>()?;
    let refunded = notes.total_amount();
    let oob_notes = OOBNotes::new(federation.federation_id().to_prefix(), notes);

    // Fedimint accepts an exact refund resubmission idempotently, and these
    // deterministic notes map to one reissue operation, so a settle replay
    // resumes the original reissue instead of crediting twice.
    // A refund is user-visible wallet activity and carries an explicit FI
    // reason so transaction-history clients need not infer it from amounts.
    let operation_id = match mint
        .reissue_external_notes(
            oob_notes.clone(),
            EcashReceiveMetadata {
                internal: false,
                reason: EcashReceiveReason::FiSeatPaymentRefund,
                frontend_metadata: None,
            },
        )
        .await
    {
        Ok(operation_id) => operation_id,
        Err(error)
            if matches!(
                error.downcast_ref::<ReissueExternalNotesError>(),
                Some(ReissueExternalNotesError::AlreadyReissued)
            ) && client
                .operation_exists(reissue_operation_id(&oob_notes))
                .await =>
        {
            reissue_operation_id(&oob_notes)
        }
        Err(error) => return Err(error).context("reissue refund notes"),
    };
    let mut updates = mint
        .subscribe_reissue_external_notes(operation_id)
        .await
        .context("subscribe to refund reissue")?
        .into_stream();
    while let Some(update) = updates.next().await {
        match update {
            ReissueExternalNotesState::Done => return Ok(refunded.msats),
            ReissueExternalNotesState::Failed(error) => {
                bail!("refund reissue failed: {error}");
            }
            ReissueExternalNotesState::Created | ReissueExternalNotesState::Issuing => {}
        }
    }
    bail!("refund reissue update stream ended before completion");
}

pub(super) async fn settle_refund_v2(
    federation: &FederationV2,
    requests: &[MintV2IssuanceRequest],
    refund: &RefundTransaction,
) -> anyhow::Result<u64> {
    let client = &federation.client;
    let mint = client.mintv2()?;
    let transaction = fedimint_core::transaction::Transaction::consensus_decode_whole(
        &refund.0,
        client.decoders(),
    )
    .context("decode mint-v2 refund transaction")?;
    ensure!(
        transaction.outputs.len() == requests.len(),
        "refund transaction output count differs from the prepared issuance"
    );
    for (output, request) in transaction.outputs.iter().zip(requests) {
        ensure!(
            output.module_instance_id() == mint.id
                && output
                    .as_any()
                    .downcast_ref::<MintV2Output>()
                    .is_some_and(|output| output == &request.output()),
            "refund transaction outputs differ from the prepared issuance"
        );
    }
    let txid = submit_refund_transaction(client, transaction).await?;

    let count = u64::try_from(requests.len()).context("too many refund outputs")?;
    let range = OutPointRange::new(txid, IdxRange::from(0..count));
    let signatures = collect_v2_signatures(
        client,
        mint.id,
        range,
        &requests
            .iter()
            .map(|request| (request.denomination, request.blinded_message()))
            .collect::<Vec<_>>(),
    )
    .await
    .context("finalize mint-v2 refund outputs")?;
    let config = mint_v2_config(client, mint.id).await?;
    let notes = requests
        .iter()
        .zip(&signatures)
        .map(|(request, signature)| {
            let spendable_note = request.finalize(*signature);
            let aggregate_key = *config
                .tbs_agg_pks
                .get(&request.denomination)
                .context("mint-v2 has no aggregate public key for denomination")?;
            let note = MintV2Note {
                denomination: spendable_note.denomination,
                nonce: spendable_note.keypair.public_key(),
                signature: spendable_note.signature,
            };
            ensure!(
                verify_mint_v2_note(note, aggregate_key),
                "invalid mint-v2 refund note signature"
            );
            Ok(spendable_note)
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let refunded = notes
        .iter()
        .try_fold(Amount::ZERO, |sum, note| sum.checked_add(note.amount()))
        .context("refund amount overflowed")?;

    // Mint-v2 receive is idempotent over identical notes; a settle replay
    // resumes the original receive operation instead of crediting twice.
    let ecash = MintV2ECash::new(federation.federation_id(), notes);
    // Match mint-v1: credited FI refunds are visible and explicitly typed.
    let meta = fedimint_core::module::serde_json::to_value(EcashReceiveMetadata {
        internal: false,
        reason: EcashReceiveReason::FiSeatPaymentRefund,
        frontend_metadata: None,
    })?;
    receive_or_resume_mint_v2_refund(
        ecash,
        meta,
        refunded.msats,
        |ecash, meta| mint.receive(ecash, meta),
        |operation_id| federation.client.operation_exists(operation_id),
        |operation_id| mint.await_final_receive_operation_state(operation_id),
    )
    .await
}

/// Start the deterministic mint-v2 receive or resume its exact operation.
///
/// `MintClientModule::receive` reports `AlreadyReceived` after the operation
/// log has been committed. That includes the supported crash boundary where
/// wallet credit succeeded but the FI quote journal has not yet recorded its
/// credited marker. Reusing the ecash-derived operation id lets the caller
/// finish that durable marker without attempting a second credit.
pub(super) async fn receive_or_resume_mint_v2_refund<
    Meta,
    Receive,
    ReceiveFuture,
    Exists,
    ExistsFuture,
    Await,
    AwaitFuture,
>(
    ecash: MintV2ECash,
    meta: Meta,
    refunded_msats: u64,
    receive: Receive,
    operation_exists: Exists,
    await_final: Await,
) -> anyhow::Result<u64>
where
    Receive: FnOnce(MintV2ECash, Meta) -> ReceiveFuture,
    ReceiveFuture: std::future::Future<Output = Result<OperationId, ReceiveECashError>>,
    Exists: FnOnce(OperationId) -> ExistsFuture,
    ExistsFuture: std::future::Future<Output = bool>,
    Await: FnOnce(OperationId) -> AwaitFuture,
    AwaitFuture: std::future::Future<Output = anyhow::Result<FinalReceiveOperationState>>,
{
    let expected_operation_id = OperationId::from_encodable(&ecash);
    let operation_id = match receive(ecash, meta).await {
        Ok(operation_id) => {
            ensure!(
                operation_id == expected_operation_id,
                "mint-v2 refund receive returned a non-deterministic operation id"
            );
            operation_id
        }
        Err(ReceiveECashError::AlreadyReceived) => {
            ensure!(
                operation_exists(expected_operation_id).await,
                "mint-v2 reported an existing refund receive without its deterministic operation"
            );
            expected_operation_id
        }
        Err(error) => return Err(anyhow!(error)).context("start mint-v2 refund receive"),
    };

    match await_final(operation_id).await? {
        FinalReceiveOperationState::Success => Ok(refunded_msats),
        FinalReceiveOperationState::Rejected => bail!("mint-v2 refund receive was rejected"),
    }
}

pub(super) async fn submit_refund_transaction(
    client: &ClientHandle,
    transaction: fedimint_core::transaction::Transaction,
) -> anyhow::Result<TransactionId> {
    let txid = transaction.tx_hash();
    let outcome = client.api().submit_transaction(transaction).await;
    let fedimint_core::transaction::TransactionSubmissionOutcome(submission) = outcome
        .try_into_inner(client.decoders())
        .context("decode refund submission outcome")?;
    let submitted_txid = submission.map_err(|error| anyhow!("refund rejected: {error}"))?;
    ensure!(
        submitted_txid == txid,
        "refund submission answered for a different transaction"
    );
    client.api().await_transaction(txid).await;
    Ok(txid)
}

/// Mirror of fedimint-mint-client's private `OOBReissueTag` (Fedi's actual
/// `v0.10.0-fedi28` source, commit `3c45bd20`): the reissue operation id is
/// the consensus hash of the notes tagged `oob-reissue`. Verified against
/// that pinned source
/// (`modules/fedimint-mint-client/src/lib.rs::reissue_external_notes`); a
/// repin must re-verify this identity.
struct OobReissueTag;

impl sha256t::Tag for OobReissueTag {
    fn engine() -> sha256::HashEngine {
        let mut engine = sha256::HashEngine::default();
        engine.input(b"oob-reissue");
        engine
    }
}

pub(super) fn reissue_operation_id(notes: &OOBNotes) -> OperationId {
    OperationId(
        notes
            .notes()
            .consensus_hash::<sha256t::Hash<OobReissueTag>>()
            .to_byte_array(),
    )
}
