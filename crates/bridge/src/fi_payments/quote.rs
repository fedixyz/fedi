use super::*; // nosemgrep: ban-wildcard-imports -- split private child module

// =========================== quote parsing ===========================

pub(super) fn parse_paid_quote(
    quote: &SignatureVerified<GetQuoteResponse>,
) -> anyhow::Result<ParsedPaidQuote> {
    let terms = &quote.terms;
    terms.check_coherent()?;
    // Same crash-DoS cap as `prepare_quote_refund`: the price feeds fee
    // summation and (via the refund context) denomination-sized loops.
    let price = CheckedSeatPrice::try_from(terms.price_msats)
        .map_err(|error| anyhow!(error.to_string()))?;
    let payment_terms = terms.payment.as_ref().context("quote is free")?;
    ensure!(
        payment_terms.total_msats() == Some(terms.price_msats),
        "quoted price does not equal the issuance total"
    );
    let refund_issuance = terms
        .request
        .refund_issuance
        .as_ref()
        .context("paid quote carries no refund issuance")?;
    let decoders = ModuleDecoderRegistry::default();

    let (payment, federation_id) = match payment_terms {
        PaymentTerms::MintV1 {
            federation_id,
            issuance,
        } => (
            ParsedIssuance::V1(decode_v1_issuance(issuance, &decoders)?),
            federation_id.clone(),
        ),
        PaymentTerms::MintV2 {
            federation_id,
            issuance,
        } => (
            ParsedIssuance::V2(decode_v2_issuance(issuance, &decoders)?),
            federation_id.clone(),
        ),
    };
    let (refund_nonce, refund) = match refund_issuance {
        RefundIssuance::MintV1 {
            refund_nonce,
            issuance,
        } => (
            *refund_nonce,
            ParsedIssuance::V1(decode_v1_issuance(issuance, &decoders)?),
        ),
        RefundIssuance::MintV2 {
            refund_nonce,
            issuance,
        } => (
            *refund_nonce,
            ParsedIssuance::V2(decode_v2_issuance(issuance, &decoders)?),
        ),
    };
    ensure!(
        payment.generation() == refund.generation(),
        "refund and payment mint generations disagree"
    );
    Ok(ParsedPaidQuote {
        federation_id,
        price,
        refund_nonce,
        payment,
        refund,
    })
}

pub(super) fn decode_v1_issuance(
    issuance: &[LockedIssuanceRequest],
    decoders: &ModuleDecoderRegistry,
) -> anyhow::Result<Vec<(Amount, BlindNonce)>> {
    issuance
        .iter()
        .map(|request| {
            let nonce = BlindNonce::consensus_decode_whole(&request.blind_nonce, decoders)
                .context("invalid mint-v1 blind nonce")?;
            Ok((Amount::from_msats(request.amount_msats), nonce))
        })
        .collect()
}

pub(super) fn decode_v2_issuance(
    issuance: &[LockedIssuanceRequestV2],
    decoders: &ModuleDecoderRegistry,
) -> anyhow::Result<Vec<(Denomination, BlindedMessage, [u8; 16])>> {
    issuance
        .iter()
        .map(|request| {
            let denomination = denomination_from_amount(request.amount_msats)
                .context("invalid mint-v2 denomination")?;
            let nonce = BlindedMessage::consensus_decode_whole(&request.blind_nonce, decoders)
                .context("invalid mint-v2 blind nonce")?;
            Ok((denomination, nonce, request.tweak))
        })
        .collect()
}

pub(super) fn denomination_from_amount(amount_msats: u64) -> anyhow::Result<Denomination> {
    ensure!(
        amount_msats.is_power_of_two(),
        "mint-v2 denominations are powers of two"
    );
    let exponent = u8::try_from(amount_msats.trailing_zeros()).expect("u64 has at most 63 zeros");
    let denomination = Denomination(exponent);
    ensure!(
        denomination.amount().msats == amount_msats,
        "amount does not round-trip through a mint-v2 denomination"
    );
    Ok(denomination)
}

/// Parse a Fleet Manager price quote ("`<n> sat`" or "`<n> msat`").
pub(super) fn plan_price_msats(plan: &Plan) -> Option<u64> {
    match plan {
        Plan::InfiniteBestEffort { price_msats } => Some(*price_msats),
        // v1 offers no subscription machinery and free plans need no refund.
        Plan::SubscriptionBased { .. } => None,
    }
}
