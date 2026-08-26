use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use fedimint_client_module::transaction::{TxSubmissionStates, TxSubmissionStatesSM};
use fedimint_core::db::Database;
use fedimint_core::db::mem_impl::MemDatabase;
use fedimint_core::transaction::{Transaction, TransactionSignature};
use fedimint_mintv2_client::ReceiveECashError;
use futures::StreamExt as _;
use tbs::SecretKeyShare;

use super::*; // nosemgrep: ban-wildcard-imports -- split test module

fn amounts(msats: &[u64]) -> Vec<Amount> {
    msats.iter().copied().map(Amount::from_msats).collect()
}

#[test]
fn quote_denominations_split_greedily_and_reject_unrepresentable_prices() {
    assert_eq!(
        quote_denominations(11, &amounts(&[1, 2, 4, 8])),
        Some(amounts(&[8, 2, 1]))
    );
    assert_eq!(quote_denominations(3, &amounts(&[2])), None);
    assert_eq!(quote_denominations(0, &amounts(&[1, 2])), Some(vec![]));
}

#[test]
fn refund_denominations_exactly_include_per_output_fees() {
    let tiers = amounts(&[1, 2, 4, 8]);
    let denominations = refund_denominations(&tiers, |_| Amount::from_msats(100), 311).unwrap();
    assert_eq!(
        denominations
            .iter()
            .map(|amount| amount.msats + 100)
            .sum::<u64>(),
        311
    );
    assert!(denominations.iter().all(|amount| tiers.contains(amount)));
}

#[test]
fn refund_denominations_reject_an_inexact_amount() {
    assert!(refund_denominations(&amounts(&[2]), |_| Amount::from_msats(100), 101).is_err());
}

#[test]
fn refund_denominations_do_not_fill_large_refunds_with_smallest_notes() {
    let tiers = amounts(&[1, 2, 4, 8, 1 << 20]);
    let large_cost = (1 << 20) + 100;
    let denominations =
        refund_denominations(&tiers, |_| Amount::from_msats(100), 10 * large_cost + 108).unwrap();
    assert_eq!(denominations.len(), 11);
    assert_eq!(
        denominations
            .iter()
            .map(|amount| amount.msats + 100)
            .sum::<u64>(),
        10 * large_cost + 108
    );
}

#[test]
fn seat_payment_operation_ids_are_stable_and_quote_bound() {
    let first = seat_payment_operation_id(&QuoteId([7; 32]));
    assert_eq!(
        hex::encode(first.0),
        "3c7a1b47365091310c4c9566c9a07572452c4bf08d3447958394526e8e10b439"
    );
    assert_eq!(first, seat_payment_operation_id(&QuoteId([7; 32])));
    assert_ne!(first, seat_payment_operation_id(&QuoteId([8; 32])));
    // Domain separation from the raw quote-id hash.
    assert_ne!(first.0, sha256::Hash::hash(&[7; 32]).to_byte_array());
}

#[test]
fn eligible_payers_are_the_admitted_ready_intersection_even_at_zero_balance() {
    let admitted = [
        WireFederationId("zero-balance-ready".to_owned()),
        WireFederationId("funded-ready".to_owned()),
        WireFederationId("loading".to_owned()),
        WireFederationId("recovering".to_owned()),
    ];
    let payable = joined_payable_federations(&admitted, |federation_id| {
        matches!(
            federation_id.0.as_str(),
            "zero-balance-ready" | "funded-ready"
        )
    });

    assert_eq!(
        payable,
        [
            WireFederationId("zero-balance-ready".to_owned()),
            WireFederationId("funded-ready".to_owned())
        ]
    );
    assert!(!payable.contains(&WireFederationId("unadmitted-ready".to_owned())));
}

#[test]
fn journal_binding_rejects_a_different_quote() {
    let issuance = ParsedIssuance::V1(vec![(
        Amount::from_msats(1024),
        BlindNonce(dummy_blinded_message()),
    )]);
    let parsed = ParsedPaidQuote {
        federation_id: WireFederationId("test".to_owned()),
        price: CheckedSeatPrice::try_from(1024).unwrap(),
        refund_nonce: [9; 32],
        refund: ParsedIssuance::V1(vec![]),
        payment: issuance,
    };
    let journal = FiSeatPaymentJournal {
        version: FI_SEAT_PAYMENT_JOURNAL_VERSION,
        generation: MINT_V1_GENERATION,
        mint_module: 1,
        txid: TransactionId::from_byte_array([2; 32]),
        output_count: 1,
        issuance_hash: parsed.payment.payment_hash().0,
        payment_signatures: None,
        claimed_refund_issuance_hash: None,
        credited_refund_issuance_hash: None,
    };
    validate_journal(&journal, &parsed).unwrap();

    let mut wrong_generation = journal.clone();
    wrong_generation.generation = MINT_V2_GENERATION;
    assert!(validate_journal(&wrong_generation, &parsed).is_err());

    let mut wrong_count = journal.clone();
    wrong_count.output_count = 2;
    assert!(validate_journal(&wrong_count, &parsed).is_err());

    let mut wrong_issuance = journal.clone();
    wrong_issuance.issuance_hash = [0; 32];
    assert!(validate_journal(&wrong_issuance, &parsed).is_err());

    let mut wrong_version = journal;
    wrong_version.version = 0;
    assert!(validate_journal(&wrong_version, &parsed).is_err());
}

#[test]
fn journal_records_roundtrip_through_consensus_encoding() {
    let journal = FiSeatPaymentJournal {
        version: FI_SEAT_PAYMENT_JOURNAL_VERSION,
        generation: MINT_V2_GENERATION,
        mint_module: 3,
        txid: TransactionId::from_byte_array([5; 32]),
        output_count: 4,
        issuance_hash: [6; 32],
        payment_signatures: Some(vec![vec![1, 2, 3]]),
        claimed_refund_issuance_hash: Some([7; 32]),
        credited_refund_issuance_hash: Some([7; 32]),
    };
    let decoded = FiSeatPaymentJournal::consensus_decode_whole(
        &journal.consensus_encode_to_vec(),
        &ModuleDecoderRegistry::default(),
    )
    .unwrap();
    assert_eq!(decoded, journal);
}

#[test]
fn operation_metadata_binds_the_exact_payer_change_range() {
    let quote_id = QuoteId([4; 32]);
    let txid = TransactionId::from_byte_array([5; 32]);
    let journal = FiSeatPaymentJournal {
        version: FI_SEAT_PAYMENT_JOURNAL_VERSION,
        generation: MINT_V2_GENERATION,
        mint_module: 3,
        txid,
        output_count: 4,
        issuance_hash: [6; 32],
        payment_signatures: None,
        claimed_refund_issuance_hash: None,
        credited_refund_issuance_hash: None,
    };
    let change_range = OutPointRange::new(txid, (4..7).into());
    let metadata = FiSeatPaymentOperationMeta {
        version: FI_SEAT_PAYMENT_OPERATION_META_VERSION,
        quote_id: hex::encode(quote_id.0),
        txid,
        change_range,
    };
    assert_eq!(
        validate_payment_operation_meta(&metadata, &quote_id, &journal).unwrap(),
        change_range
    );

    let mut wrong_start = metadata.clone();
    wrong_start.change_range = OutPointRange::new(txid, (3..7).into());
    assert!(validate_payment_operation_meta(&wrong_start, &quote_id, &journal).is_err());

    let mut wrong_transaction = metadata.clone();
    wrong_transaction.change_range =
        OutPointRange::new(TransactionId::from_byte_array([7; 32]), (4..7).into());
    assert!(validate_payment_operation_meta(&wrong_transaction, &quote_id, &journal).is_err());

    let mut old_version = metadata;
    old_version.version -= 1;
    assert!(validate_payment_operation_meta(&old_version, &quote_id, &journal).is_err());
}

#[test]
fn caching_signatures_preserves_a_concurrent_refund_marker() {
    let refund_hash = [7; 32];
    let signatures = vec![vec![1, 2, 3]];
    let mut latest = FiSeatPaymentJournal {
        version: FI_SEAT_PAYMENT_JOURNAL_VERSION,
        generation: MINT_V2_GENERATION,
        mint_module: 3,
        txid: TransactionId::from_byte_array([5; 32]),
        output_count: 4,
        issuance_hash: [6; 32],
        payment_signatures: None,
        claimed_refund_issuance_hash: Some(refund_hash),
        credited_refund_issuance_hash: None,
    };

    assert!(merge_journal_signatures(&mut latest, &signatures).unwrap());
    assert_eq!(latest.payment_signatures, Some(signatures.clone()));
    assert_eq!(latest.claimed_refund_issuance_hash, Some(refund_hash));
    assert_eq!(latest.credited_refund_issuance_hash, None);

    // Idempotent replay is a no-op; conflicting evidence is never used to
    // replace the signatures already bound to this exact quote journal.
    assert!(!merge_journal_signatures(&mut latest, &signatures).unwrap());
    assert!(merge_journal_signatures(&mut latest, &[vec![9]]).is_err());
    assert_eq!(latest.payment_signatures, Some(signatures));
    assert_eq!(latest.claimed_refund_issuance_hash, Some(refund_hash));
    assert_eq!(latest.credited_refund_issuance_hash, None);
}

#[test]
fn refund_claim_alone_never_proves_wallet_credit() {
    let refund_hash = [7; 32];
    let mut journal = FiSeatPaymentJournal {
        version: FI_SEAT_PAYMENT_JOURNAL_VERSION,
        generation: MINT_V2_GENERATION,
        mint_module: 3,
        txid: TransactionId::from_byte_array([5; 32]),
        output_count: 4,
        issuance_hash: [6; 32],
        payment_signatures: None,
        claimed_refund_issuance_hash: Some(refund_hash),
        credited_refund_issuance_hash: None,
    };
    assert!(!journal_proves_refund_credited(&journal));
    journal.credited_refund_issuance_hash = Some([8; 32]);
    assert!(!journal_proves_refund_credited(&journal));
    journal.credited_refund_issuance_hash = Some(refund_hash);
    assert!(journal_proves_refund_credited(&journal));
}

fn transaction_updates(operation_id: OperationId, state: TxSubmissionStates) -> TransactionUpdates {
    transaction_update_history(operation_id, [state])
}

fn transaction_update_history(
    operation_id: OperationId,
    states: impl IntoIterator<Item = TxSubmissionStates>,
) -> TransactionUpdates {
    let states = states.into_iter().collect::<Vec<_>>();
    TransactionUpdates {
        update_stream: futures::stream::iter(states.into_iter().map(move |state| {
            TxSubmissionStatesSM {
                operation_id,
                state,
            }
        }))
        .boxed(),
    }
}

fn refund_v1_input(
    mint_module: ModuleInstanceId,
    amount_msats: u64,
) -> fedimint_core::core::DynInput {
    MintV1Input::new_v0(Amount::from_msats(amount_msats), dummy_v1_note()).into_dyn(mint_module)
}

fn refund_v1_transaction(
    mint_module: ModuleInstanceId,
    inputs: Vec<fedimint_core::core::DynInput>,
    output_amounts: &[u64],
    nonce: u8,
) -> Transaction {
    Transaction {
        inputs,
        outputs: output_amounts
            .iter()
            .map(|amount| {
                MintV1Output::new_v0(
                    Amount::from_msats(*amount),
                    BlindNonce(dummy_blinded_message()),
                )
                .into_dyn(mint_module)
            })
            .collect(),
        nonce: [nonce; 8],
        signatures: TransactionSignature::NaiveMultisig(vec![]),
    }
}

#[tokio::test]
async fn rejected_input_refund_replays_unordered_duplicates_after_reopen() {
    let operation_id = OperationId([31; 32]);
    let mint_module = ModuleInstanceId::from(1u16);
    let input = refund_v1_input(mint_module, 1_024);
    let original = refund_v1_transaction(mint_module, vec![input.clone()], &[1_000], 1);
    let original_txid = original.tx_hash();
    let refund = refund_v1_transaction(mint_module, vec![input], &[924], 2);
    let refund_txid = refund.tx_hash();
    let history = || {
        transaction_update_history(
            operation_id,
            [
                TxSubmissionStates::Accepted(refund_txid),
                TxSubmissionStates::Created(refund.clone()),
                TxSubmissionStates::Rejected(original_txid, "rejected".to_owned()),
                TxSubmissionStates::Created(original.clone()),
                TxSubmissionStates::Created(refund.clone()),
                TxSubmissionStates::Accepted(refund_txid),
            ],
        )
    };

    for _reopen in 0..2 {
        let awaited = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let observed = awaited.clone();
        await_rejected_input_refunds(
            operation_id,
            original_txid,
            mint_module,
            history(),
            move |outpoints| {
                let observed = observed.clone();
                async move {
                    observed.lock().await.push(outpoints);
                    Ok(())
                }
            },
        )
        .await
        .unwrap();
        assert_eq!(
            awaited.lock().await.as_slice(),
            &[vec![OutPoint {
                txid: refund_txid,
                out_idx: 0,
            }]]
        );
    }
}

#[tokio::test]
async fn rejected_v1_bundle_waits_for_accepted_per_note_refund_union() {
    let operation_id = OperationId([32; 32]);
    let mint_module = ModuleInstanceId::from(1u16);
    let first = refund_v1_input(mint_module, 1_024);
    let second = refund_v1_input(mint_module, 2_048);
    let original = refund_v1_transaction(
        mint_module,
        vec![first.clone(), second.clone()],
        &[2_900],
        3,
    );
    let bundle = refund_v1_transaction(
        mint_module,
        vec![first.clone(), second.clone()],
        &[2_872],
        4,
    );
    let first_refund = refund_v1_transaction(mint_module, vec![first], &[924], 5);
    let second_refund = refund_v1_transaction(mint_module, vec![second], &[1_948], 6);
    let first_txid = first_refund.tx_hash();
    let second_txid = second_refund.tx_hash();
    let updates = transaction_update_history(
        operation_id,
        [
            TxSubmissionStates::Created(bundle.clone()),
            TxSubmissionStates::Rejected(bundle.tx_hash(), "bundle rejected".to_owned()),
            TxSubmissionStates::Accepted(first_txid),
            TxSubmissionStates::Created(original.clone()),
            TxSubmissionStates::Created(second_refund),
            TxSubmissionStates::Created(first_refund),
            TxSubmissionStates::Accepted(second_txid),
        ],
    );
    let awaited = Arc::new(tokio::sync::Mutex::new(Vec::new()));
    let observed = awaited.clone();

    await_rejected_input_refunds(
        operation_id,
        original.tx_hash(),
        mint_module,
        updates,
        move |outpoints| {
            let observed = observed.clone();
            async move {
                observed.lock().await.push(outpoints);
                Ok(())
            }
        },
    )
    .await
    .unwrap();

    let mut outpoints = awaited.lock().await[0].clone();
    outpoints.sort_by_key(|outpoint| outpoint.txid);
    let mut expected = vec![
        OutPoint {
            txid: first_txid,
            out_idx: 0,
        },
        OutPoint {
            txid: second_txid,
            out_idx: 0,
        },
    ];
    expected.sort_by_key(|outpoint| outpoint.txid);
    assert_eq!(outpoints, expected);
}

#[tokio::test]
async fn rejected_input_refund_output_failure_stays_retryable() {
    let operation_id = OperationId([33; 32]);
    let mint_module = ModuleInstanceId::from(1u16);
    let input = refund_v1_input(mint_module, 1_024);
    let original = refund_v1_transaction(mint_module, vec![input.clone()], &[1_000], 7);
    let refund = refund_v1_transaction(mint_module, vec![input], &[924], 8);
    let updates = transaction_update_history(
        operation_id,
        [
            TxSubmissionStates::Created(original.clone()),
            TxSubmissionStates::Created(refund.clone()),
            TxSubmissionStates::Accepted(refund.tx_hash()),
        ],
    );

    let error = await_rejected_input_refunds(
        operation_id,
        original.tx_hash(),
        mint_module,
        updates,
        |_| async { bail!("outputs not spendable") },
    )
    .await
    .unwrap_err();
    assert!(error.to_string().contains("not spendable"), "{error:#}");
}

#[tokio::test]
async fn accepted_and_rejected_transactions_map_to_terminal_statuses() {
    let operation_id = OperationId([1; 32]);
    let txid = TransactionId::from_byte_array([2; 32]);
    assert!(matches!(
        seat_payment_tx_status(
            transaction_updates(operation_id, TxSubmissionStates::Accepted(txid)),
            txid,
            Duration::from_secs(5),
        )
        .await,
        SeatPaymentTxStatus::Accepted
    ));
    assert!(matches!(
        seat_payment_tx_status(
            transaction_updates(
                operation_id,
                TxSubmissionStates::Rejected(txid, "invalid input".to_owned()),
            ),
            txid,
            Duration::from_secs(5),
        )
        .await,
        SeatPaymentTxStatus::Rejected(reason) if reason == "invalid input"
    ));
}

#[tokio::test]
async fn an_unresolved_transaction_is_pending_and_never_rejected() {
    let txid = TransactionId::from_byte_array([2; 32]);
    let updates = TransactionUpdates {
        update_stream: futures::stream::pending().boxed(),
    };
    // Double-spend safety: elapsing the bounded wait must map to the
    // retryable Pending status, never to Rejected.
    assert!(matches!(
        seat_payment_tx_status(updates, txid, Duration::from_millis(10)).await,
        SeatPaymentTxStatus::Pending
    ));
}

#[test]
fn finalized_v1_wallet_debit_subtracts_only_returned_change() {
    let mint_module = 1;
    let transaction = Transaction {
        inputs: vec![
            MintV1Input::new_v0(Amount::from_msats(8), dummy_v1_note()).into_dyn(mint_module),
            MintV1Input::new_v0(Amount::from_msats(4), dummy_v1_note()).into_dyn(mint_module),
        ],
        outputs: vec![
            MintV1Output::new_v0(Amount::from_msats(10), BlindNonce(dummy_blinded_message()))
                .into_dyn(mint_module),
            MintV1Output::new_v0(Amount::from_msats(2), BlindNonce(dummy_blinded_message()))
                .into_dyn(mint_module),
        ],
        nonce: [0; 8],
        signatures: TransactionSignature::NaiveMultisig(vec![]),
    };
    let change = OutPointRange::new(transaction.tx_hash(), (1..2).into());
    assert_eq!(
        wallet_debit_from_finalized_transaction(
            &transaction,
            change,
            mint_module,
            MintGeneration::MintV1,
        )
        .unwrap(),
        10
    );
}

#[test]
fn finalized_v2_wallet_debit_subtracts_only_returned_change() {
    let mint_module = 2;
    let eight = denomination_from_amount(8).unwrap();
    let four = denomination_from_amount(4).unwrap();
    let transaction = Transaction {
        inputs: vec![
            MintV2Input::new_v0(dummy_v2_note(eight)).into_dyn(mint_module),
            MintV2Input::new_v0(dummy_v2_note(four)).into_dyn(mint_module),
        ],
        outputs: vec![
            MintV2Output::new_v0(eight, dummy_blinded_message(), [0; 16]).into_dyn(mint_module),
            MintV2Output::new_v0(four, dummy_blinded_message(), [1; 16]).into_dyn(mint_module),
        ],
        nonce: [0; 8],
        signatures: TransactionSignature::NaiveMultisig(vec![]),
    };
    let change = OutPointRange::new(transaction.tx_hash(), (1..2).into());
    assert_eq!(
        wallet_debit_from_finalized_transaction(
            &transaction,
            change,
            mint_module,
            MintGeneration::MintV2,
        )
        .unwrap(),
        8
    );
}

#[test]
fn v1_refund_derivation_is_deterministic_and_nonce_bound() {
    let auxiliary = DerivableSecret::new_root(&[3; 32], b"fi-payments-test");
    let denominations = amounts(&[1024, 1024, 2048]);
    let first = derive_v1_refund(&auxiliary, &[1; 32], &denominations);
    let repeated = derive_v1_refund(&auxiliary, &[1; 32], &denominations);
    assert!(
        first
            .iter()
            .zip(&repeated)
            .all(|((_, _, a), (_, _, b))| a == b)
    );
    // Repeated denominations must land on distinct note keys.
    assert_ne!(first[0].2, first[1].2);
    let other_nonce = derive_v1_refund(&auxiliary, &[2; 32], &denominations);
    assert!(
        first
            .iter()
            .zip(&other_nonce)
            .all(|((_, _, a), (_, _, b))| a != b)
    );
    let other_root = derive_v1_refund(
        &DerivableSecret::new_root(&[4; 32], b"fi-payments-test"),
        &[1; 32],
        &denominations,
    );
    assert!(
        first
            .iter()
            .zip(&other_root)
            .all(|((_, _, a), (_, _, b))| a != b)
    );
}

#[test]
fn v2_refund_derivation_is_deterministic_with_distinct_tweaks() {
    let auxiliary = DerivableSecret::new_root(&[3; 32], b"fi-payments-test");
    let denominations = [Denomination(10), Denomination(10), Denomination(11)];
    let first = derive_v2_refund(&auxiliary, &[1; 32], &denominations);
    let repeated = derive_v2_refund(&auxiliary, &[1; 32], &denominations);
    assert!(
        first
            .iter()
            .zip(&repeated)
            .all(|(a, b)| a.blinded_message() == b.blinded_message() && a.tweak == b.tweak)
    );
    assert_ne!(first[0].tweak, first[1].tweak);
    assert_ne!(first[0].blinded_message(), first[1].blinded_message());
    let other = derive_v2_refund(&auxiliary, &[2; 32], &denominations);
    assert!(
        first
            .iter()
            .zip(&other)
            .all(|(a, b)| a.blinded_message() != b.blinded_message())
    );
}

#[tokio::test]
async fn mint_v2_refund_receive_replays_after_credit_before_journal_marker() {
    let auxiliary = DerivableSecret::new_root(&[3; 32], b"fi-refund-replay-test");
    let request = MintV2IssuanceRequest::new(Denomination(10), [4; 16], &auxiliary);
    let ecash = MintV2ECash::new(
        fedimint_core::config::FederationId(sha256::Hash::hash(b"payer")),
        vec![request.finalize(tbs::BlindedSignature(bls12_381::G1Affine::generator()))],
    );
    let expected_operation_id = OperationId::from_encodable(&ecash);
    let successful_credits = Arc::new(AtomicUsize::new(0));
    let awaited_operations = Arc::new(AtomicUsize::new(0));

    let first_credits = successful_credits.clone();
    let first_awaits = awaited_operations.clone();
    let first_amount = receive_or_resume_mint_v2_refund(
        ecash.clone(),
        (),
        321,
        move |received, ()| async move {
            assert_eq!(
                OperationId::from_encodable(&received),
                expected_operation_id
            );
            first_credits.fetch_add(1, Ordering::SeqCst);
            Ok(expected_operation_id)
        },
        |_| async { false },
        move |operation_id| async move {
            assert_eq!(operation_id, expected_operation_id);
            first_awaits.fetch_add(1, Ordering::SeqCst);
            Ok(FinalReceiveOperationState::Success)
        },
    )
    .await
    .expect("first receive credits the deterministic operation");

    // Crash here: wallet receive is terminal, but the FI journal's credited
    // marker and therefore its release proof have not been written yet.
    let replay_awaits = awaited_operations.clone();
    let replay_amount = receive_or_resume_mint_v2_refund(
        ecash.clone(),
        (),
        321,
        |_, ()| async { Err(ReceiveECashError::AlreadyReceived) },
        move |operation_id| async move {
            assert_eq!(operation_id, expected_operation_id);
            true
        },
        move |operation_id| async move {
            assert_eq!(operation_id, expected_operation_id);
            replay_awaits.fetch_add(1, Ordering::SeqCst);
            Ok(FinalReceiveOperationState::Success)
        },
    )
    .await
    .expect("replay resumes the existing receive operation");

    assert_eq!(first_amount, replay_amount);
    assert_eq!(successful_credits.load(Ordering::SeqCst), 1);
    assert_eq!(awaited_operations.load(Ordering::SeqCst), 2);

    let absent_operation_error = receive_or_resume_mint_v2_refund(
        ecash,
        (),
        321,
        |_, ()| async { Err(ReceiveECashError::AlreadyReceived) },
        |_| async { false },
        |_| async { panic!("an absent operation must never be awaited") },
    )
    .await
    .expect_err("AlreadyReceived without the exact operation must fail closed");
    assert!(
        absent_operation_error
            .to_string()
            .contains("without its deterministic operation")
    );

    let context = BridgeSeatRefundContext {
        federation_id: "payer".to_owned(),
        reservation_token: FiFundingReservationToken::from_bytes([5; 32]),
        quote_id: QuoteId([6; 32]),
        inner: RefundContextInner::V2 {
            requests: vec![request],
        },
    };
    let settled = settled_refund_after_credit(&context, replay_amount);
    assert_eq!(settled.amount_msats, first_amount);
    assert_eq!(settled.release_proof.federation_id, "payer");
    assert_eq!(
        settled.release_proof.reservation_token,
        FiFundingReservationToken::from_bytes([5; 32])
    );
    assert_eq!(
        settled.release_proof.quote_id,
        FiFundingQuoteId::from_bytes([6; 32])
    );
}

#[test]
fn v1_finalized_refund_notes_verify_against_dealer_keys() {
    // One-of-one dealer keys exercise the exact aggregate/unblind spine
    // used for both payment evidence and refund settlement without a
    // running federation.
    let auxiliary = DerivableSecret::new_root(&[5; 32], b"fi-payments-test");
    let requests = derive_v1_refund(&auxiliary, &[7; 32], &amounts(&[1024]));
    let (amount, request, blind_nonce) = &requests[0];

    let dealer_secret =
        SecretKeyShare(DerivableSecret::new_root(&[9; 32], b"dealer").to_bls12_381_key());
    let public_shares = BTreeMap::from([(0, tbs::derive_pk_share(&dealer_secret))]);
    let aggregate_key = tbs::aggregate_public_key_shares(&public_shares);
    let shares = BTreeMap::from([(0, tbs::sign_message(blind_nonce.0, dealer_secret))]);
    let signature = tbs::aggregate_signature_shares(&shares);
    assert!(tbs::verify_blinded_signature(
        blind_nonce.0,
        signature,
        aggregate_key
    ));

    let note = request.finalize(signature);
    let public_note = MintV1Note {
        nonce: MintV1Nonce(note.spend_key.public_key()),
        signature: note.signature,
    };
    assert!(public_note.verify(aggregate_key));
    assert_eq!(*amount, Amount::from_msats(1024));
}

#[test]
fn absurd_prices_are_rejected_before_denomination_splitting() {
    // A malicious FMan can advertise any protocol-valid integer price;
    // without the cap, `u64::MAX` would reach the greedy splitter and
    // allocate an effectively unbounded Vec (crash DoS).
    let plan = Plan::InfiniteBestEffort {
        price_msats: u64::MAX,
    };
    assert_eq!(plan_price_msats(&plan), Some(u64::MAX));
    assert!(CheckedSeatPrice::try_from(u64::MAX).is_err());
    assert!(CheckedSeatPrice::try_from(MAX_SEAT_PRICE_MSATS + 1).is_err());
    assert_eq!(
        CheckedSeatPrice::try_from(MAX_SEAT_PRICE_MSATS),
        Ok(CheckedSeatPrice(MAX_SEAT_PRICE_MSATS))
    );
    assert_eq!(CheckedSeatPrice::try_from(0), Ok(CheckedSeatPrice(0)));
}

#[test]
fn inventory_fee_bound_tracks_actual_notes_not_fantasy_wallets() {
    let input_fee = |_| Some(1);
    let output_fee = |_| Some(1);
    // Worst case consumes smallest economical notes first: three 2s (net 1
    // each), one 4 (net 3), one 8 (net 7) cover a spend of 11 with five
    // inputs, plus one change set (input + output allowance per tier).
    let notes = [
        (Amount::from_msats(2), 3),
        (Amount::from_msats(4), 1),
        (Amount::from_msats(8), 2),
    ];
    assert_eq!(
        inventory_fee_bound_msats(11, &notes, &amounts(&[2, 4, 8]), input_fee, output_fee),
        Some(5 + 6)
    );
    // Uneconomical notes and tiers (fee >= value) are never spent or minted.
    assert_eq!(
        inventory_fee_bound_msats(
            3,
            &[(Amount::from_msats(1), 5), (Amount::from_msats(2), 2)],
            &amounts(&[1, 2]),
            input_fee,
            output_fee,
        ),
        Some(2 + 2)
    );
    // An empty wallet still gets the sequential-change allowance only.
    assert_eq!(
        inventory_fee_bound_msats(11, &[], &amounts(&[2, 4]), input_fee, output_fee),
        Some(4)
    );
    // Fee lookup failure and overflow propagate as None, not a panic.
    assert_eq!(
        inventory_fee_bound_msats(11, &notes, &amounts(&[2]), |_| None, output_fee),
        None
    );
    assert_eq!(
        inventory_fee_bound_msats(11, &notes, &amounts(&[2]), input_fee, |_| Some(u64::MAX)),
        None
    );

    // Regression pin for the 5.7x bug: a consolidated wallet (three notes
    // per binary denomination, 100 msat base fees) funding a 1,000-sat seat
    // must reserve under 1% in fees, where the deleted per-tier-sum formula
    // demanded ~4,700 sats.
    let consolidated = (7..=30)
        .map(|exponent| (Amount::from_msats(1 << exponent), 3))
        .collect::<Vec<_>>();
    let tiers = (7..=30)
        .map(|exponent| 1u64 << exponent)
        .collect::<Vec<_>>();
    let bound = inventory_fee_bound_msats(
        1_000_000,
        &consolidated,
        &amounts(&tiers),
        |_| Some(100),
        |_| Some(100),
    )
    .expect("bound for a consolidated wallet");
    assert!(
        bound * 100 < 1_000_000,
        "fee bound {bound} msats is not under 1% of a 1,000-sat spend"
    );
}

#[tokio::test]
async fn refund_issuance_reverse_claim_conflicts_across_quotes() {
    let quote_a = [1; 32];
    let quote_b = [2; 32];
    let hash = [9; 32];
    let db = Database::new(MemDatabase::new(), ModuleDecoderRegistry::default());
    let key = FiSeatRefundClaimKey::new(hash);
    let mut first = db.begin_transaction().await;
    let mut second = db.begin_transaction().await;

    assert!(first.get_value(&key).await.is_none());
    assert!(second.get_value(&key).await.is_none());
    first
        .insert_entry(&key, &FiSeatRefundClaim { quote_id: quote_a })
        .await;
    second
        .insert_entry(&key, &FiSeatRefundClaim { quote_id: quote_b })
        .await;

    first
        .commit_tx_result()
        .await
        .expect("first quote claims hash");
    assert!(
        second.commit_tx_result().await.is_err(),
        "the shared reverse key must conflict instead of letting both quote rows settle"
    );

    let mut read = db.begin_transaction_nc().await;
    assert_eq!(
        read.get_value(&key).await,
        Some(FiSeatRefundClaim { quote_id: quote_a })
    );
}

#[test]
fn seat_payment_namespace_tags_journals_and_refund_claims_distinctly() {
    let id = [7; 32];
    assert_ne!(
        FiSeatPaymentJournalKey::new(id).consensus_encode_to_vec(),
        FiSeatRefundClaimKey::new(id).consensus_encode_to_vec()
    );
}
