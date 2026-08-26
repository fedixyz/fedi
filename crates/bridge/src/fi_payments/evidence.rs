use super::*; // nosemgrep: ban-wildcard-imports -- split private child module

// =========================== payment evidence ===========================

/// Collect (or replay) the aggregate blinded signatures for an accepted
/// funding transaction and assemble the `CreateSeat` presentation.
pub(super) async fn prepared_payment(
    federation: &FederationV2,
    reservation_token: FiFundingReservationToken,
    quote_id: &QuoteId,
    parsed: &ParsedPaidQuote,
    mut journal: FiSeatPaymentJournal,
) -> Result<PreparedSeatPayment<BridgeSeatRefundContext>, FiPaymentError> {
    let refund_context = rebuild_refund_context(federation, reservation_token, quote_id, parsed)
        .map_err(|error| payment_error("rebuilding the refund context failed", error))?;

    let encoded = match &journal.payment_signatures {
        Some(encoded) => encoded.clone(),
        None => {
            let signatures = timeout(
                EVIDENCE_TIMEOUT,
                collect_payment_signatures(federation, parsed, &journal),
            )
            .await
            .map_err(|_| FiPaymentError::new("collecting payment signatures timed out; retry"))?
            .map_err(|error| payment_error("collecting payment signatures failed", error))?;
            let encoded = signatures
                .iter()
                .map(Encodable::consensus_encode_to_vec)
                .collect::<Vec<_>>();
            journal.payment_signatures = Some(encoded.clone());
            persist_journal_signatures(federation, quote_id, &encoded).await;
            encoded
        }
    };
    let payment_signatures = encoded.into_iter().map(LockedBlindedSignature).collect();
    let settled_under = match &parsed.payment {
        ParsedIssuance::V1(_) => MintGeneration::MintV1,
        ParsedIssuance::V2(_) => MintGeneration::MintV2,
    };
    Ok(PreparedSeatPayment {
        payment_signatures,
        settled_under,
        refund_context,
    })
}

pub(super) async fn collect_payment_signatures(
    federation: &FederationV2,
    parsed: &ParsedPaidQuote,
    journal: &FiSeatPaymentJournal,
) -> anyhow::Result<Vec<BlindedSignature>> {
    match &parsed.payment {
        ParsedIssuance::V1(issuance) => {
            collect_v1_signatures(&federation.client, journal.txid, issuance).await
        }
        ParsedIssuance::V2(issuance) => collect_v2_signatures(
            &federation.client,
            journal.mint_module,
            OutPointRange::new(journal.txid, IdxRange::from(0..journal.output_count)),
            &issuance
                .iter()
                .map(|(denomination, nonce, _)| (*denomination, *nonce))
                .collect::<Vec<_>>(),
        )
        .await
        .context("finalize mint-v2 locked outputs"),
    }
}

/// Compatibility implementation of the public mint-v2 locked-output
/// collection primitive. Fedi's pinned Fedimint exposes the same endpoint,
/// config keys, and issuance primitives as the newer helper used by
/// Manifold, but not the convenience method itself.
pub(super) async fn collect_v2_signatures(
    client: &ClientHandle,
    mint_module: ModuleInstanceId,
    range: OutPointRange,
    outputs: &[(Denomination, BlindedMessage)],
) -> anyhow::Result<Vec<BlindedSignature>> {
    ensure!(
        range.count() == outputs.len(),
        "outputs do not match the mint-v2 transaction output range"
    );
    let config = mint_v2_config(client, mint_module).await?;
    for (denomination, _) in outputs {
        ensure!(
            config.tbs_pks.contains_key(denomination),
            "mint-v2 has no public key shares for denomination"
        );
    }

    let api = client.api_clone().with_module(mint_module);
    let outputs_for_verification = outputs.to_vec();
    let peer_keys = config.tbs_pks.clone();
    let shares = api
        .request_with_strategy_retry(
            FilterMapThreshold::new(
                move |peer, signature_shares: Vec<BlindedSignatureShare>| {
                    (|| -> anyhow::Result<_> {
                        ensure!(
                            signature_shares.len() == outputs_for_verification.len(),
                            "invalid number of mint-v2 signature shares"
                        );
                        for ((denomination, message), share) in
                            outputs_for_verification.iter().zip(&signature_shares)
                        {
                            let public_key = peer_keys
                                .get(denomination)
                                .and_then(|keys| keys.get(&peer))
                                .context("mint-v2 has no public key share for peer")?;
                            ensure!(
                                tbs::verify_signature_share(*message, *share, *public_key),
                                "invalid mint-v2 signature share"
                            );
                        }
                        Ok(signature_shares)
                    })()
                    .map_err(ServerError::InvalidResponse)
                },
                api.all_peers().to_num_peers(),
            ),
            MINT_V2_SIGNATURE_SHARES_ENDPOINT.to_owned(),
            ApiRequestErased::new(range),
        )
        .await;

    (0..outputs.len())
        .map(|index| {
            let signature = tbs::aggregate_signature_shares(
                &shares
                    .iter()
                    .map(|(peer, signatures)| (peer.to_usize() as u64, signatures[index]))
                    .collect(),
            );
            let (denomination, message) = outputs[index];
            let aggregate_key = *config
                .tbs_agg_pks
                .get(&denomination)
                .context("mint-v2 has no aggregate public key for denomination")?;
            ensure!(
                tbs::verify_blinded_signature(message, signature, aggregate_key),
                "aggregated mint-v2 signature failed verification"
            );
            Ok(signature)
        })
        .collect()
}

pub(super) async fn mint_v2_config(
    client: &ClientHandle,
    mint_module: ModuleInstanceId,
) -> anyhow::Result<MintV2ClientConfig> {
    client
        .config()
        .await
        .modules
        .get(&mint_module)
        .context("mint-v2 module config is missing")?
        .cast::<MintV2ClientConfig>()
        .context("mint-v2 module config has the wrong type")
        .cloned()
}

/// Fetch a threshold of verified blind signature shares for every quoted
/// mint-v1 output and aggregate them, verifying each aggregate against the
/// mint's tier key. The share-fetch endpoint is global, not module-prefixed.
pub(super) async fn collect_v1_signatures(
    client: &ClientHandle,
    txid: TransactionId,
    outputs: &[(Amount, BlindNonce)],
) -> anyhow::Result<Vec<BlindedSignature>> {
    let mint = client.mint()?;
    let context = mint.context();
    let api = client.api();
    let mut signatures = Vec::with_capacity(outputs.len());
    for (out_idx, (amount, blind_nonce)) in outputs.iter().enumerate() {
        let decoder = context.mint_decoder.clone();
        let peer_keys = context.peer_tbs_pks.clone();
        let amount = *amount;
        let message = blind_nonce.0;
        let shares = api
            .request_with_strategy_retry(
                FilterMapThreshold::new(
                    move |peer, outcome| {
                        verify_blind_share(peer, &outcome, amount, message, &decoder, &peer_keys)
                            .map_err(ServerError::InvalidResponse)
                    },
                    api.all_peers().to_num_peers(),
                ),
                AWAIT_OUTPUT_OUTCOME_ENDPOINT.to_owned(),
                ApiRequestErased::new(OutPoint {
                    txid,
                    out_idx: out_idx as u64,
                }),
            )
            .await
            .into_iter()
            .map(|(peer, share)| (peer.to_usize() as u64, share))
            .collect::<BTreeMap<_, _>>();
        ensure!(
            !shares.is_empty(),
            "no valid signature shares were returned"
        );
        let signature = tbs::aggregate_signature_shares(&shares);
        let tier_key = *context
            .tbs_pks
            .tier(&amount)
            .map_err(|_| anyhow!("mint has no key for denomination {amount}"))?;
        ensure!(
            tbs::verify_blinded_signature(message, signature, tier_key),
            "aggregated mint signature failed verification"
        );
        signatures.push(signature);
    }
    Ok(signatures)
}
