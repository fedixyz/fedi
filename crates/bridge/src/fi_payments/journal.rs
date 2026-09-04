use super::*; // nosemgrep: ban-wildcard-imports -- split private child module

// =========================== journal ===========================

#[cfg(test)]
pub(super) fn journal_proves_refund_credited(journal: &FiSeatPaymentJournal) -> bool {
    journal.credited_refund_issuance_hash.is_some()
        && journal.credited_refund_issuance_hash == journal.claimed_refund_issuance_hash
}

pub(super) fn seat_payment_operation_id(quote_id: &QuoteId) -> OperationId {
    let mut bytes = FI_SEAT_PAYMENT_OPERATION_ID_DOMAIN.to_vec();
    bytes.extend(quote_id.0);
    OperationId(sha256::Hash::hash(&bytes).to_byte_array())
}

pub(super) async fn read_journal(
    federation: &FederationV2,
    quote_id: &QuoteId,
) -> Option<FiSeatPaymentJournal> {
    let mut dbtx = federation.client.db().begin_transaction_nc().await;
    dbtx.get_value(&FiSeatPaymentJournalKey::new(quote_id.0))
        .await
}

/// Load the metadata saved with this journal and check the two agree on
/// quote and transaction. The change range must come from this saved row —
/// recomputing it after a restart could point at a different operation's
/// outputs.
pub(super) async fn seat_payment_change_range(
    federation: &FederationV2,
    quote_id: &QuoteId,
    journal: &FiSeatPaymentJournal,
) -> Result<OutPointRange, FiPaymentError> {
    let operation_id = seat_payment_operation_id(quote_id);
    let operation = federation
        .client
        .operation_log()
        .get_operation(operation_id)
        .await
        .ok_or_else(|| FiPaymentError::new("seat payment operation metadata is missing"))?;
    if operation.operation_module_kind() != FI_SEAT_PAYMENT_OPERATION_TYPE {
        return Err(FiPaymentError::new(
            "seat payment operation has an unexpected type",
        ));
    }
    let metadata = operation
        .try_meta::<FiSeatPaymentOperationMeta>()
        .map_err(|error| payment_error("seat payment operation metadata is invalid", error))?;
    validate_payment_operation_meta(&metadata, quote_id, journal)
        .map_err(|error| payment_error("seat payment operation does not match its journal", error))
}

pub(super) fn validate_payment_operation_meta(
    metadata: &FiSeatPaymentOperationMeta,
    quote_id: &QuoteId,
    journal: &FiSeatPaymentJournal,
) -> anyhow::Result<OutPointRange> {
    ensure!(
        metadata.version == FI_SEAT_PAYMENT_OPERATION_META_VERSION,
        "unsupported seat payment operation metadata version {}",
        metadata.version
    );
    ensure!(
        metadata.quote_id == hex::encode(quote_id.0),
        "operation metadata names a different quote"
    );
    ensure!(
        metadata.txid == journal.txid && metadata.change_range.txid() == journal.txid,
        "operation metadata names a different transaction"
    );
    ensure!(
        metadata.change_range.start_idx() == journal.output_count,
        "operation change overlaps the quoted payment outputs"
    );
    Ok(metadata.change_range)
}

pub(super) fn validate_journal(
    journal: &FiSeatPaymentJournal,
    parsed: &ParsedPaidQuote,
) -> anyhow::Result<()> {
    ensure!(
        journal.version == FI_SEAT_PAYMENT_JOURNAL_VERSION,
        "unsupported seat payment journal version {}",
        journal.version
    );
    ensure!(
        journal.generation == mint_generation_code(parsed.payment.generation()),
        "journaled mint generation differs from the quote"
    );
    ensure!(
        journal.output_count == parsed.payment.len() as u64,
        "journaled output count differs from the quote"
    );
    ensure!(
        journal.issuance_hash == parsed.payment.payment_hash().0,
        "journaled issuance differs from the quote"
    );
    Ok(())
}

/// Record the refund issuance about to be settled in its quote's journal
/// row, refusing cross-quote refund-issuance reuse. Committed strictly
/// before any crediting so a crash cannot lose the reuse marker.
pub(super) async fn guard_refund_settlement(
    federation: &FederationV2,
    quote_id: &QuoteId,
    issuance_hash: RefundIssuanceHash,
) -> Result<(), FiPaymentError> {
    let quote_id_bytes = quote_id.0;
    let claim_key = FiSeatRefundClaimKey::new(issuance_hash.0);
    let journal_key = FiSeatPaymentJournalKey::new(quote_id_bytes);
    let result = federation
        .client
        .db()
        .autocommit(
            |dbtx, _| {
                Box::pin(async move {
                    if let Some(claim) = dbtx.get_value(&claim_key).await {
                        ensure!(
                            claim.quote_id == quote_id_bytes,
                            "refund issuance was already claimed by a different quote"
                        );
                    } else {
                        dbtx.insert_entry(
                            &claim_key,
                            &FiSeatRefundClaim {
                                quote_id: quote_id_bytes,
                            },
                        )
                        .await;
                    }

                    let mut journal = dbtx
                        .get_value(&journal_key)
                        .await
                        .context("no seat payment journal for the refunded quote")?;
                    if let Some(existing) = journal.claimed_refund_issuance_hash {
                        ensure!(
                            existing == issuance_hash.0,
                            "a different refund issuance was already settled for this quote"
                        );
                    }
                    journal.claimed_refund_issuance_hash = Some(issuance_hash.0);
                    dbtx.insert_entry(&journal_key, &journal).await;
                    Ok::<_, anyhow::Error>(())
                })
            },
            Some(100),
        )
        .await;
    match result {
        Ok(()) => Ok(()),
        Err(AutocommitError::ClosureError { error, .. }) => Err(payment_error(
            "refund issuance is not settleable for this quote",
            error,
        )),
        Err(AutocommitError::CommitFailed {
            attempts,
            last_error,
        }) => Err(payment_error(
            "recording the refund settlement failed",
            anyhow!(last_error).context(format!("commit refund claim after {attempts} attempts")),
        )),
    }
}

/// Mark deterministic refund receive complete only after the wallet's receive
/// operation reached terminal success. Claim and credit are separate facts:
/// a crash after the claim but before receive must remain safely retryable.
pub(super) async fn record_refund_credit_completed(
    federation: &FederationV2,
    quote_id: &QuoteId,
    issuance_hash: RefundIssuanceHash,
) -> Result<(), FiPaymentError> {
    let journal_key = FiSeatPaymentJournalKey::new(quote_id.0);
    let result = federation
        .client
        .db()
        .autocommit(
            |dbtx, _| {
                Box::pin(async move {
                    let mut journal = dbtx
                        .get_value(&journal_key)
                        .await
                        .context("no seat payment journal for the credited refund")?;
                    ensure!(
                        journal.claimed_refund_issuance_hash == Some(issuance_hash.0),
                        "credited refund differs from the claimed issuance"
                    );
                    if let Some(existing) = journal.credited_refund_issuance_hash {
                        ensure!(
                            existing == issuance_hash.0,
                            "a different refund issuance was already credited for this quote"
                        );
                        return Ok::<_, anyhow::Error>(());
                    }
                    journal.credited_refund_issuance_hash = Some(issuance_hash.0);
                    dbtx.insert_entry(&journal_key, &journal).await;
                    Ok(())
                })
            },
            Some(100),
        )
        .await;
    match result {
        Ok(()) => Ok(()),
        Err(AutocommitError::ClosureError { error, .. }) => Err(payment_error(
            "refund credit cannot be recorded for this quote",
            error,
        )),
        Err(AutocommitError::CommitFailed {
            attempts,
            last_error,
        }) => Err(payment_error(
            "recording the refund credit failed",
            anyhow!(last_error).context(format!("commit refund credit after {attempts} attempts")),
        )),
    }
}

/// Merge collected aggregate signatures into the latest journal row. Best
/// effort: the caller already holds verified signatures, and a lost update
/// only costs a refetch on the next replay.
///
/// Read the row again inside the write transaction instead of persisting the
/// caller's earlier snapshot. Refund settlement may have added its reuse
/// marker while signatures were being collected; replacing that snapshot
/// would erase the marker and weaken the cross-quote replay guard.
pub(super) async fn persist_journal_signatures(
    federation: &FederationV2,
    quote_id: &QuoteId,
    payment_signatures: &[Vec<u8>],
) {
    let mut dbtx = federation.client.db().begin_transaction().await;
    let key = FiSeatPaymentJournalKey::new(quote_id.0);
    let Some(mut journal) = dbtx.get_value(&key).await else {
        tracing::warn!("failed to cache FI seat payment signatures: journal is missing");
        return;
    };
    match merge_journal_signatures(&mut journal, payment_signatures) {
        Ok(true) => {
            dbtx.insert_entry(&key, &journal).await;
        }
        Ok(false) => return,
        Err(error) => {
            tracing::warn!(%error, "failed to cache FI seat payment signatures");
            return;
        }
    }
    if let Err(error) = dbtx.commit_tx_result().await {
        tracing::warn!(%error, "failed to cache FI seat payment signatures");
    }
}

/// Update only the signature field of the latest row, preserving recovery
/// facts that may have been written after the caller loaded its snapshot.
pub(super) fn merge_journal_signatures(
    journal: &mut FiSeatPaymentJournal,
    payment_signatures: &[Vec<u8>],
) -> anyhow::Result<bool> {
    if let Some(existing) = &journal.payment_signatures {
        ensure!(
            existing == payment_signatures,
            "journal contains different payment signatures"
        );
        return Ok(false);
    }
    journal.payment_signatures = Some(payment_signatures.to_vec());
    Ok(true)
}
