use bitcoin::hashes::{Hash as _, sha256};
use fedimint_core::db::mem_impl::MemDatabase;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::Encodable;
use fedimint_core::module::registry::ModuleDecoderRegistry;
use tokio::sync::Mutex;

use super::*; // nosemgrep: ban-wildcard-imports -- split test module

fn token(byte: u8) -> FiFundingReservationToken {
    FiFundingReservationToken::from_bytes([byte; 32])
}

fn quote(byte: u8) -> FiFundingQuoteId {
    FiFundingQuoteId::from_bytes([byte; 32])
}

fn fingerprint(byte: u8) -> FiFundingFingerprint {
    FiFundingFingerprint::from_bytes([byte; 32])
}

fn member(quote_byte: u8, reserved_msats: u64) -> FiFundingReservationMember {
    FiFundingReservationMember::new(quote(quote_byte), reserved_msats).expect("valid member")
}

fn reservation() -> FiFundingReservation {
    FiFundingReservation::new(
        fingerprint(8),
        1_000,
        vec![member(1, 1_100), member(2, 2_200)],
    )
    .expect("valid reservation")
}

#[test]
fn funding_namespace_tags_reservations_and_total_distinctly() {
    let reservation_key = FiFundingReservationKey::new(token(1)).consensus_encode_to_vec();
    let total_key = FiFundingReservedTotalKey::new().consensus_encode_to_vec();

    assert_eq!(reservation_key.first(), Some(&0));
    assert_eq!(total_key, vec![1]);
}

fn memory_database() -> Database {
    Database::new(MemDatabase::new(), ModuleDecoderRegistry::default())
}

fn federation_id(byte: u8) -> FederationId {
    FederationId(sha256::Hash::hash(&[byte]))
}

async fn reserved_total(db: &Database) -> Option<u64> {
    let mut read = db.begin_transaction_nc().await;
    read.get_value(&FiFundingReservedTotalKey::new())
        .await
        .map(|total| total.amount_msats)
}

async fn stored_reservation(
    db: &Database,
    reservation_token: FiFundingReservationToken,
) -> FiFundingReservation {
    let mut read = db.begin_transaction_nc().await;
    read.get_value(&FiFundingReservationKey::new(reservation_token))
        .await
        .expect("stored reservation")
}

#[test]
fn constructors_and_balance_projection_reject_invalid_terms() {
    assert!(FiFundingReservationMember::new(quote(1), 0).is_err());
    assert!(FiFundingReservation::new(fingerprint(1), 1_000, Vec::new()).is_err());
    assert!(
        FiFundingReservation::new(fingerprint(1), 1_000, vec![member(1, 1), member(1, 2)]).is_err()
    );
    assert_eq!(
        balance_after_fi_funding_holds(Amount::from_msats(10_000), Amount::from_msats(3_300)),
        Amount::from_msats(6_700)
    );
    assert_eq!(
        balance_after_fi_funding_holds(Amount::from_msats(1_000), Amount::from_msats(2_000)),
        Amount::ZERO
    );
}

#[tokio::test]
async fn spend_guard_is_branded_to_one_federation_mutex() {
    let owner = Mutex::new(());
    let another_federation = Mutex::new(());
    let guard = FiFundingSpendGuard {
        owner: &owner,
        _guard: owner.lock().await,
    };

    ensure_guard_owner(&owner, &guard).expect("matching federation accepts its guard");
    assert!(ensure_guard_owner(&another_federation, &guard).is_err());
}

#[tokio::test]
async fn production_wallet_contract_guards_balance_and_heals_lost_refresh_on_replay() {
    let db = memory_database();
    let other_db = memory_database();
    let owner = Mutex::new(());
    let another_owner = Mutex::new(());
    let wallet = FiFundingWallet::new(db.clone(), &owner);
    let another_wallet = FiFundingWallet::new(db.clone(), &another_owner);
    let guard = wallet.lock().await;
    let reservation_token = token(7);
    let members = || vec![member(1, 1_100), member(2, 2_200)];

    assert!(
        another_wallet
            .reserve(
                &guard,
                Amount::from_msats(10_000),
                reservation_token,
                fingerprint(8),
                1_000,
                members(),
            )
            .await
            .is_err(),
        "a guard from another federation must not authorize its database"
    );

    let _reserve_refresh = wallet
        .reserve(
            &guard,
            Amount::from_msats(10_000),
            reservation_token,
            fingerprint(8),
            1_000,
            members(),
        )
        .await
        .expect("reserve through production component");
    let mut seed_other = other_db.begin_transaction().await;
    insert_reservation_dbtx(&mut seed_other, reservation_token, &reservation())
        .await
        .expect("seed same token in another federation database");
    seed_other.commit_tx_result().await.expect("commit other");
    assert_eq!(wallet.reserved_total().await, Amount::from_msats(3_300));
    assert_eq!(
        wallet
            .balance_including_reservation(&guard, Amount::from_msats(6_700), reservation_token,)
            .await
            .expect("owner balance"),
        Amount::from_msats(10_000)
    );

    assert!(
        autocommit_fi_funding_database(
            &other_db,
            &another_owner,
            &guard,
            federation_id(2),
            |_funding_tx, _| Box::pin(async move { Ok(()) }),
            Some(1),
        )
        .await
        .is_err(),
        "another federation's database cannot be paired with this guard"
    );

    let _lost_post_commit_refresh = autocommit_fi_funding_database(
        &db,
        &owner,
        &guard,
        federation_id(1),
        |mut funding_tx, _| {
            Box::pin(async move {
                funding_tx
                    .consume_reservation_member(
                        reservation_token,
                        quote(1),
                        Amount::from_msats(1_000),
                    )
                    .await
            })
        },
        Some(1),
    )
    .await
    .expect("matching guard authorizes its database")
    .expect("commit consume");
    assert_eq!(
        stored_reservation(&other_db, reservation_token)
            .await
            .members()[0]
            .state(),
        FiFundingReservationMemberState::Held,
        "consuming the owner reservation must not mutate the same token in another database"
    );
    assert_eq!(reserved_total(&other_db).await, Some(3_300));

    // Simulate cancellation after commit but before the caller projects the
    // balance event. Exact replay must issue a fresh refresh capability.
    let _healing_refresh = autocommit_fi_funding_database(
        &db,
        &owner,
        &guard,
        federation_id(1),
        |mut funding_tx, _| {
            Box::pin(async move {
                funding_tx
                    .consume_reservation_member(
                        reservation_token,
                        quote(1),
                        Amount::from_msats(1_000),
                    )
                    .await
            })
        },
        Some(1),
    )
    .await
    .expect("matching guard authorizes replay")
    .expect("commit replay");

    let _release_refresh = wallet
        .release_unstarted_member(&guard, reservation_token, quote(2))
        .await
        .expect("release sibling");
    let _release_replay_refresh = wallet
        .release_unstarted_member(&guard, reservation_token, quote(2))
        .await
        .expect("release replay also refreshes");
    assert_eq!(wallet.reserved_total().await, Amount::ZERO);
    assert!(
        wallet
            .release_unstarted_aggregate(&guard, reservation_token)
            .await
            .is_err(),
        "consumed members keep aggregate release fail-closed"
    );
    assert!(
        wallet
            .reserve(
                &guard,
                Amount::from_msats(1),
                token(9),
                fingerprint(9),
                1_000,
                vec![member(9, 2)],
            )
            .await
            .is_err(),
        "the production component enforces projected balance"
    );
    assert!(
        wallet
            .reserve(
                &guard,
                Amount::from_msats(10_000),
                reservation_token,
                fingerprint(9),
                1_000,
                members(),
            )
            .await
            .is_err(),
        "a replay changing one semantic term fails closed"
    );
    let _amount_agnostic_refresh = wallet
        .reserve(
            &guard,
            Amount::from_msats(10_000),
            reservation_token,
            fingerprint(8),
            1_000,
            vec![member(1, 9_999), member(2, 8_888)],
        )
        .await
        .expect("a same-plan replay with re-proved dry-run amounts is accepted");
    let stored = stored_reservation(&db, reservation_token).await;
    assert_eq!(
        stored.members()[0].reserved_msats(),
        1_100,
        "an amount-agnostic replay must not change the stored hold"
    );
}

#[tokio::test]
async fn reservation_recovery_is_read_only_and_requires_exact_terms() {
    let db = memory_database();
    let owner = Mutex::new(());
    let wallet = FiFundingWallet::new(db, &owner);
    let reservation_token = token(7);
    let members = || vec![member(1, 1_100), member(2, 2_200)];

    assert!(
        !wallet
            .recover_reservation(reservation_token, fingerprint(8), &[quote(1), quote(2)])
            .await
            .expect("an authoritative missing-row lookup succeeds")
    );
    assert!(
        !wallet.has_reservation(reservation_token).await,
        "recovery must not create wallet state"
    );

    let guard = wallet.lock().await;
    let _refresh = wallet
        .reserve(
            &guard,
            Amount::from_msats(10_000),
            reservation_token,
            fingerprint(8),
            1_000,
            members(),
        )
        .await
        .expect("reserve exact terms");
    assert!(
        wallet
            .recover_reservation(reservation_token, fingerprint(8), &[quote(1), quote(2)])
            .await
            .expect("recover exact reservation")
    );
    assert!(
        wallet
            .recover_reservation(reservation_token, fingerprint(9), &[quote(1), quote(2)])
            .await
            .is_err(),
        "recovery must reject a same-token plan with changed terms"
    );
    assert!(
        wallet
            .recover_reservation(reservation_token, fingerprint(8), &[quote(1)])
            .await
            .is_err(),
        "recovery must reject a changed member set"
    );
    assert!(
        wallet
            .recover_reservation(reservation_token, fingerprint(8), &[quote(2), quote(1)])
            .await
            .is_err(),
        "recovery must reject a reordered member set"
    );
}

#[tokio::test]
async fn insert_is_durable_exactly_replayable_and_overflow_safe() {
    let db = memory_database();
    let reservation_token = token(7);
    let original = reservation();

    let mut reserve = db.begin_transaction().await;
    assert!(
        insert_reservation_dbtx(&mut reserve, reservation_token, &original)
            .await
            .expect("insert aggregate")
    );
    reserve.commit_tx_result().await.expect("commit aggregate");
    assert_eq!(reserved_total(&db).await, Some(3_300));

    let mut replay = db.begin_transaction().await;
    assert!(
        !insert_reservation_dbtx(&mut replay, reservation_token, &original)
            .await
            .expect("exact replay")
    );
    replay.commit_tx_result().await.expect("commit replay");
    assert_eq!(reserved_total(&db).await, Some(3_300));

    let changed = FiFundingReservation::new(fingerprint(9), 1_000, vec![member(1, 1_100)])
        .expect("valid changed terms");
    let mut conflicting = db.begin_transaction().await;
    assert!(
        insert_reservation_dbtx(&mut conflicting, reservation_token, &changed)
            .await
            .is_err()
    );
    drop(conflicting);

    let re_proved = FiFundingReservation::new(
        fingerprint(8),
        1_000,
        vec![member(1, 5_000), member(2, 6_000)],
    )
    .expect("valid re-proved amounts");
    let mut amount_agnostic = db.begin_transaction().await;
    assert!(
        !insert_reservation_dbtx(&mut amount_agnostic, reservation_token, &re_proved)
            .await
            .expect("same-plan replay with different dry-run amounts is accepted"),
        "an amount-agnostic replay must not insert"
    );
    amount_agnostic
        .commit_tx_result()
        .await
        .expect("commit amount-agnostic replay");
    assert_eq!(
        reserved_total(&db).await,
        Some(3_300),
        "an amount-agnostic replay must not change the active total"
    );

    let overflow = FiFundingReservation::new(
        fingerprint(3),
        1_000,
        vec![member(3, u64::MAX), member(4, 1)],
    )
    .expect("members are individually valid");
    let mut overflowing = db.begin_transaction().await;
    assert!(
        insert_reservation_dbtx(&mut overflowing, token(9), &overflow)
            .await
            .is_err()
    );

    let existing_total_overflow = memory_database();
    let mut seed_total = existing_total_overflow.begin_transaction().await;
    seed_total
        .insert_entry(
            &FiFundingReservedTotalKey::new(),
            &FiFundingReservedTotal {
                amount_msats: u64::MAX,
            },
        )
        .await;
    seed_total.commit_tx_result().await.expect("seed total");
    let mut insert = existing_total_overflow.begin_transaction().await;
    assert!(
        insert_reservation_dbtx(&mut insert, token(10), &reservation())
            .await
            .is_err()
    );
    drop(insert);
    assert_eq!(
        reserved_total(&existing_total_overflow).await,
        Some(u64::MAX)
    );
}

#[tokio::test]
async fn consume_requires_positive_bounded_debit_and_is_exactly_replayable() {
    let db = memory_database();
    let reservation_token = token(7);
    let mut reserve = db.begin_transaction().await;
    insert_reservation_dbtx(&mut reserve, reservation_token, &reservation())
        .await
        .expect("insert aggregate");
    reserve.commit_tx_result().await.expect("commit aggregate");

    for invalid in [0, 1_101] {
        let mut dbtx = db.begin_transaction().await;
        assert!(
            consume_member_dbtx(
                &mut dbtx,
                reservation_token,
                quote(1),
                Amount::from_msats(invalid),
            )
            .await
            .is_err()
        );
    }

    let mut consume = db.begin_transaction().await;
    assert!(
        consume_member_dbtx(
            &mut consume,
            reservation_token,
            quote(1),
            Amount::from_msats(1_000),
        )
        .await
        .expect("consume member")
    );
    consume.commit_tx_result().await.expect("commit consume");
    assert_eq!(reserved_total(&db).await, Some(2_200));

    let mut replay = db.begin_transaction().await;
    assert!(
        !consume_member_dbtx(
            &mut replay,
            reservation_token,
            quote(1),
            Amount::from_msats(1_000),
        )
        .await
        .expect("exact consume replay")
    );
    replay.commit_tx_result().await.expect("commit replay");
    assert_eq!(reserved_total(&db).await, Some(2_200));

    let mut changed_debit = db.begin_transaction().await;
    assert!(
        consume_member_dbtx(
            &mut changed_debit,
            reservation_token,
            quote(1),
            Amount::from_msats(999),
        )
        .await
        .is_err()
    );
    let stored = stored_reservation(&db, reservation_token).await;
    assert_eq!(
        stored.members()[0].state(),
        FiFundingReservationMemberState::Consumed { debit_msats: 1_000 }
    );
}

#[tokio::test]
async fn member_release_is_idempotent_and_never_releases_consumed_value() {
    let db = memory_database();
    let reservation_token = token(7);
    let mut reserve = db.begin_transaction().await;
    insert_reservation_dbtx(&mut reserve, reservation_token, &reservation())
        .await
        .expect("insert aggregate");
    reserve.commit_tx_result().await.expect("commit aggregate");

    let mut consume = db.begin_transaction().await;
    consume_member_dbtx(
        &mut consume,
        reservation_token,
        quote(1),
        Amount::from_msats(1_000),
    )
    .await
    .expect("consume first member");
    consume.commit_tx_result().await.expect("commit consume");

    let mut release = db.begin_transaction().await;
    assert!(
        release_unstarted_member_dbtx(&mut release, reservation_token, quote(2))
            .await
            .expect("release unstarted sibling")
    );
    release.commit_tx_result().await.expect("commit release");
    assert_eq!(reserved_total(&db).await, Some(0));

    let mut replay = db.begin_transaction().await;
    assert!(
        !release_unstarted_member_dbtx(&mut replay, reservation_token, quote(2))
            .await
            .expect("release replay")
    );
    replay.commit_tx_result().await.expect("commit replay");

    let mut consumed = db.begin_transaction().await;
    assert!(
        release_unstarted_member_dbtx(&mut consumed, reservation_token, quote(1))
            .await
            .is_err()
    );
    let stored = stored_reservation(&db, reservation_token).await;
    assert_eq!(
        stored.members()[0].state(),
        FiFundingReservationMemberState::Consumed { debit_msats: 1_000 }
    );
    assert_eq!(
        stored.members()[1].state(),
        FiFundingReservationMemberState::ReleasedUnstarted
    );
}

#[tokio::test]
async fn aggregate_release_fails_closed_after_any_consumption() {
    let db = memory_database();
    let reservation_token = token(7);
    let mut reserve = db.begin_transaction().await;
    insert_reservation_dbtx(&mut reserve, reservation_token, &reservation())
        .await
        .expect("insert aggregate");
    reserve.commit_tx_result().await.expect("commit aggregate");

    let mut consume = db.begin_transaction().await;
    consume_member_dbtx(
        &mut consume,
        reservation_token,
        quote(1),
        Amount::from_msats(1_000),
    )
    .await
    .expect("consume first member");
    consume.commit_tx_result().await.expect("commit consume");

    let mut release = db.begin_transaction().await;
    assert!(
        release_unstarted_aggregate_dbtx(&mut release, reservation_token)
            .await
            .is_err()
    );
    assert_eq!(reserved_total(&db).await, Some(2_200));

    let fresh_token = token(8);
    let mut fresh = db.begin_transaction().await;
    insert_reservation_dbtx(&mut fresh, fresh_token, &reservation())
        .await
        .expect("insert fresh aggregate");
    fresh.commit_tx_result().await.expect("commit fresh");
    let mut release_fresh = db.begin_transaction().await;
    assert!(
        release_unstarted_aggregate_dbtx(&mut release_fresh, fresh_token)
            .await
            .expect("release fresh aggregate")
    );
    release_fresh
        .commit_tx_result()
        .await
        .expect("commit release");
    let mut replay = db.begin_transaction().await;
    assert!(
        !release_unstarted_aggregate_dbtx(&mut replay, fresh_token)
            .await
            .expect("aggregate replay")
    );
}

#[tokio::test]
async fn corrupt_missing_or_underflowing_total_fails_without_changing_member() {
    for total in [None, Some(1_000)] {
        let db = memory_database();
        let reservation_token = token(total.is_some() as u8 + 1);
        let mut corrupt = db.begin_transaction().await;
        corrupt
            .insert_entry(
                &FiFundingReservationKey::new(reservation_token),
                &reservation(),
            )
            .await;
        if let Some(amount_msats) = total {
            corrupt
                .insert_entry(
                    &FiFundingReservedTotalKey::new(),
                    &FiFundingReservedTotal { amount_msats },
                )
                .await;
        }
        corrupt.commit_tx_result().await.expect("commit corruption");

        let mut consume = db.begin_transaction().await;
        assert!(
            consume_member_dbtx(
                &mut consume,
                reservation_token,
                quote(1),
                Amount::from_msats(1_000),
            )
            .await
            .is_err()
        );
        drop(consume);
        assert_eq!(
            stored_reservation(&db, reservation_token).await.members()[0].state(),
            FiFundingReservationMemberState::Held
        );
    }
}

#[tokio::test]
async fn concurrent_sibling_transitions_conflict_instead_of_clobbering() {
    let db = memory_database();
    let reservation_token = token(7);
    let mut reserve = db.begin_transaction().await;
    insert_reservation_dbtx(&mut reserve, reservation_token, &reservation())
        .await
        .expect("insert aggregate");
    reserve.commit_tx_result().await.expect("commit aggregate");

    let mut first = db.begin_transaction().await;
    let mut second = db.begin_transaction().await;
    assert!(
        consume_member_dbtx(
            &mut first,
            reservation_token,
            quote(1),
            Amount::from_msats(1_000),
        )
        .await
        .expect("first transition")
    );
    assert!(
        release_unstarted_member_dbtx(&mut second, reservation_token, quote(2))
            .await
            .expect("second transition")
    );
    first.commit_tx_result().await.expect("commit first");
    assert!(
        second.commit_tx_result().await.is_err(),
        "a stale sibling write must retry against the new member and total state"
    );

    let stored = stored_reservation(&db, reservation_token).await;
    assert_eq!(
        stored.members()[0].state(),
        FiFundingReservationMemberState::Consumed { debit_msats: 1_000 }
    );
    assert_eq!(
        stored.members()[1].state(),
        FiFundingReservationMemberState::Held
    );
    assert_eq!(reserved_total(&db).await, Some(2_200));
}

#[cfg(not(target_family = "wasm"))]
#[tokio::test(flavor = "multi_thread")]
async fn reservation_and_active_total_survive_redb_reopen() {
    let temp = tempfile::tempdir().expect("temporary database directory");
    let path = temp.path().join("fi-funding.redb");
    let reservation_token = token(7);
    {
        let redb = fedimint_cursed_redb::MemAndRedb::new(&path)
            .await
            .expect("open redb");
        let db = Database::new(redb, ModuleDecoderRegistry::default());
        let mut reserve = db.begin_transaction().await;
        insert_reservation_dbtx(&mut reserve, reservation_token, &reservation())
            .await
            .expect("insert aggregate");
        reserve.commit_tx_result().await.expect("commit aggregate");

        let mut settle = db.begin_transaction().await;
        consume_member_dbtx(
            &mut settle,
            reservation_token,
            quote(1),
            Amount::from_msats(1_000),
        )
        .await
        .expect("consume first member");
        release_unstarted_member_dbtx(&mut settle, reservation_token, quote(2))
            .await
            .expect("release second member");
        settle
            .commit_tx_result()
            .await
            .expect("commit terminal states");
    }

    let redb = fedimint_cursed_redb::MemAndRedb::new(&path)
        .await
        .expect("reopen redb");
    let reopened = Database::new(redb, ModuleDecoderRegistry::default());
    assert_eq!(reserved_total(&reopened).await, Some(0));
    let stored = stored_reservation(&reopened, reservation_token).await;
    assert_eq!(
        stored.members()[0].state(),
        FiFundingReservationMemberState::Consumed { debit_msats: 1_000 }
    );
    assert_eq!(
        stored.members()[1].state(),
        FiFundingReservationMemberState::ReleasedUnstarted
    );
}
