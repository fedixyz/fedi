//! Durable wallet holds for FI federation-formation payments.
//!
//! A hold is created only after the user authorizes exact ecash outputs.  It
//! makes those funds unavailable to every ordinary wallet spend while keeping
//! them available to the formation operation that owns the opaque token.
//! State changes are serialized by the federation's spend lock and persisted
//! atomically with an O(1) active total. Consuming a member happens in a
//! payer-database transaction created by this layer; only an unstarted member
//! can be released here.

use std::ptr;

use anyhow::{Context, bail, ensure};
use fedimint_core::config::FederationId;
use fedimint_core::db::{
    AutocommitError, Database, DatabaseTransaction, IDatabaseTransactionOpsCoreTyped, PhantomBound,
};
use fedimint_core::util::BoxFuture;
use fedimint_core::{Amount, OutPointRange, TransactionId};
use futures::StreamExt as _;
use serde::{Deserialize, Serialize};
use tokio::sync::MutexGuard;

use super::FederationV2;
use super::db::{
    FiFundingFingerprint, FiFundingQuoteId, FiFundingReservation, FiFundingReservationKey,
    FiFundingReservationKeyPrefix, FiFundingReservationMember, FiFundingReservationMemberState,
    FiFundingReservationToken, FiFundingReservedTotal, FiFundingReservedTotalKey,
};

/// Proof that the caller owns this exact federation's spending lock.
///
/// The private federation reference prevents a lock obtained from one joined
/// federation from authorizing a balance read or mutation in another.
pub struct FiFundingSpendGuard<'a> {
    owner: &'a tokio::sync::Mutex<()>,
    _guard: MutexGuard<'a, ()>,
}

/// Post-commit capability for emitting the balance change caused by consuming
/// a hold in a payer-owned database transaction.
#[must_use = "retain this change through commit, then emit its balance refresh"]
pub struct FiFundingBalanceChange {
    federation_id: FederationId,
}

/// A transaction created from the exact payer federation database while its
/// spend guard is held.
///
/// Callers may use the underlying transaction for the rest of their atomic
/// wallet operation, but cannot construct this wrapper or substitute another
/// federation's transaction when consuming a hold.
pub struct FiFundingDatabaseTransaction<'r, 'tx> {
    dbtx: &'r mut DatabaseTransaction<'tx>,
    federation_id: FederationId,
}

impl<'tx> FiFundingDatabaseTransaction<'_, 'tx> {
    /// Borrow the payer-owned transaction for other atomic wallet writes.
    pub fn database_transaction(&mut self) -> &mut DatabaseTransaction<'tx> {
        self.dbtx
    }

    /// Consume one exact member in this payer-owned transaction.
    pub async fn consume_reservation_member(
        &mut self,
        token: FiFundingReservationToken,
        quote_id: FiFundingQuoteId,
        exact_debit: Amount,
    ) -> anyhow::Result<FiFundingBalanceChange> {
        consume_member_dbtx(self.dbtx, token, quote_id, exact_debit).await?;
        Ok(FiFundingBalanceChange {
            federation_id: self.federation_id,
        })
    }
}

/// Details saved with each seat-payment transaction, needed to recover
/// after a crash. The journal remembers the quote and what was bought;
/// this row remembers which outputs of the transaction are our change.
/// Recovery checks both agree before using either.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct FiSeatPaymentOperationMeta {
    pub version: u8,
    pub quote_id: String,
    pub txid: TransactionId,
    pub change_range: OutPointRange,
}

pub(super) fn balance_after_fi_funding_holds(balance: Amount, reserved: Amount) -> Amount {
    balance.saturating_sub(reserved)
}

fn ensure_guard_owner(
    owner: &tokio::sync::Mutex<()>,
    guard: &FiFundingSpendGuard<'_>,
) -> anyhow::Result<()> {
    ensure!(
        ptr::eq(owner, guard.owner),
        "FI funding spend guard belongs to another federation"
    );
    Ok(())
}

async fn autocommit_fi_funding_database<'s, 'dbtx, F, T>(
    database: &'s Database,
    owner: &tokio::sync::Mutex<()>,
    guard: &FiFundingSpendGuard<'_>,
    federation_id: FederationId,
    tx_fn: F,
    max_attempts: Option<usize>,
) -> anyhow::Result<Result<T, AutocommitError<anyhow::Error>>>
where
    's: 'dbtx,
    for<'r, 'o> F: Fn(
        FiFundingDatabaseTransaction<'r, 'o>,
        PhantomBound<'dbtx, 'o>,
    ) -> BoxFuture<'r, anyhow::Result<T>>,
{
    ensure_guard_owner(owner, guard)?;
    Ok(database
        .autocommit(
            move |dbtx, bound| {
                tx_fn(
                    FiFundingDatabaseTransaction {
                        dbtx,
                        federation_id,
                    },
                    bound,
                )
            },
            max_attempts,
        )
        .await)
}

/// Whether a stored reservation carries the same signed payment plan: the
/// fingerprint over the exact signed quote set and the ordered quote ids.
///
/// Hold amounts are intentionally not compared. They are proved by a dry run
/// against the wallet's notes at reservation time, so an honest replay after
/// the note set changed re-derives different amounts; the stored row remains
/// the authority on what was actually held.
fn reservation_matches_plan(
    existing: &FiFundingReservation,
    fingerprint: FiFundingFingerprint,
    quote_ids: &[FiFundingQuoteId],
) -> bool {
    existing.fingerprint() == fingerprint
        && existing.members().len() == quote_ids.len()
        && existing
            .members()
            .iter()
            .zip(quote_ids)
            .all(|(existing, quote_id)| existing.quote_id() == *quote_id)
}

fn held_amount(reservation: &FiFundingReservation) -> anyhow::Result<u64> {
    reservation
        .members()
        .iter()
        .filter(|member| member.state() == FiFundingReservationMemberState::Held)
        .try_fold(0u64, |sum, member| {
            sum.checked_add(member.reserved_msats())
                .context("FI funding reservation amount overflowed")
        })
}

async fn decrement_active_total<Cap>(
    dbtx: &mut DatabaseTransaction<'_, Cap>,
    amount_msats: u64,
) -> anyhow::Result<()>
where
    Cap: Send,
{
    let total = dbtx
        .get_value(&FiFundingReservedTotalKey::new())
        .await
        .context("FI active reservation total is missing")?
        .amount_msats
        .checked_sub(amount_msats)
        .context("FI active reservation total underflowed")?;
    dbtx.insert_entry(
        &FiFundingReservedTotalKey::new(),
        &FiFundingReservedTotal {
            amount_msats: total,
        },
    )
    .await;
    Ok(())
}

/// Insert a new aggregate hold, or accept an exact replay.
///
/// Returns whether this transaction inserted value and therefore changes the
/// projected wallet balance.
async fn insert_reservation_dbtx<Cap>(
    dbtx: &mut DatabaseTransaction<'_, Cap>,
    token: FiFundingReservationToken,
    reservation: &FiFundingReservation,
) -> anyhow::Result<bool>
where
    Cap: Send,
{
    let key = FiFundingReservationKey::new(token);
    if let Some(existing) = dbtx.get_value(&key).await {
        let quote_ids = reservation
            .members()
            .iter()
            .map(FiFundingReservationMember::quote_id)
            .collect::<Vec<_>>();
        ensure!(
            reservation_matches_plan(&existing, reservation.fingerprint(), &quote_ids),
            "FI funding reservation token was replayed with different terms"
        );
        return Ok(false);
    }
    let amount_msats = held_amount(reservation)?;
    ensure!(amount_msats > 0, "FI funding reservation holds no value");
    let total = dbtx
        .get_value(&FiFundingReservedTotalKey::new())
        .await
        .map_or(0, |total| total.amount_msats)
        .checked_add(amount_msats)
        .context("FI active reservation total overflowed")?;
    dbtx.insert_entry(
        &FiFundingReservedTotalKey::new(),
        &FiFundingReservedTotal {
            amount_msats: total,
        },
    )
    .await;
    dbtx.insert_entry(&key, reservation).await;
    Ok(true)
}

/// Consume one member in the caller's atomic funding transaction.
async fn consume_member_dbtx<Cap>(
    dbtx: &mut DatabaseTransaction<'_, Cap>,
    token: FiFundingReservationToken,
    quote_id: FiFundingQuoteId,
    exact_debit: Amount,
) -> anyhow::Result<bool>
where
    Cap: Send,
{
    ensure!(exact_debit.msats > 0, "FI payment debit must be positive");
    let key = FiFundingReservationKey::new(token);
    let mut reservation = dbtx
        .get_value(&key)
        .await
        .context("FI funding reservation is missing")?;
    let member = reservation
        .members_mut()
        .iter_mut()
        .find(|member| member.quote_id() == quote_id)
        .context("FI funding reservation does not contain this quote")?;
    ensure!(
        exact_debit.msats <= member.reserved_msats(),
        "finalized FI payment debit exceeds its per-seat durable reservation"
    );
    let released_hold_msats = match member.state() {
        FiFundingReservationMemberState::ReleasedUnstarted => {
            bail!("cannot consume a released FI payment reservation member")
        }
        FiFundingReservationMemberState::Consumed { debit_msats } => {
            ensure!(
                debit_msats == exact_debit.msats,
                "FI payment reservation member was replayed with a different debit"
            );
            return Ok(false);
        }
        FiFundingReservationMemberState::Held => {
            let reserved_msats = member.reserved_msats();
            member.set_state(FiFundingReservationMemberState::Consumed {
                debit_msats: exact_debit.msats,
            });
            reserved_msats
        }
    };
    decrement_active_total(dbtx, released_hold_msats).await?;
    dbtx.insert_entry(&key, &reservation).await;
    Ok(true)
}

/// Record the credited refund on a paid member. Replay-safe.
async fn record_member_refund_dbtx<Cap>(
    dbtx: &mut DatabaseTransaction<'_, Cap>,
    token: FiFundingReservationToken,
    quote_id: FiFundingQuoteId,
    refunded_msats: u64,
) -> anyhow::Result<()>
where
    Cap: Send,
{
    let key = FiFundingReservationKey::new(token);
    let mut reservation = dbtx
        .get_value(&key)
        .await
        .context("FI funding reservation is missing")?;
    reservation
        .members_mut()
        .iter_mut()
        .find(|member| member.quote_id() == quote_id)
        .context("FI funding reservation does not contain this quote")?
        .set_refunded_msats(refunded_msats)?;
    dbtx.insert_entry(&key, &reservation).await;
    Ok(())
}

/// Release one member only if it never crossed the wallet output boundary.
async fn release_unstarted_member_dbtx<Cap>(
    dbtx: &mut DatabaseTransaction<'_, Cap>,
    token: FiFundingReservationToken,
    quote_id: FiFundingQuoteId,
) -> anyhow::Result<bool>
where
    Cap: Send,
{
    let key = FiFundingReservationKey::new(token);
    let mut reservation = dbtx
        .get_value(&key)
        .await
        .context("FI funding reservation is missing")?;
    let member = reservation
        .members_mut()
        .iter_mut()
        .find(|member| member.quote_id() == quote_id)
        .context("FI funding reservation does not contain this quote")?;
    let released_hold_msats = match member.state() {
        FiFundingReservationMemberState::Held => {
            let reserved_msats = member.reserved_msats();
            member.set_state(FiFundingReservationMemberState::ReleasedUnstarted);
            reserved_msats
        }
        FiFundingReservationMemberState::ReleasedUnstarted => return Ok(false),
        FiFundingReservationMemberState::Consumed { .. } => {
            bail!("cannot release an FI member after its payment output started")
        }
    };
    decrement_active_total(dbtx, released_hold_msats).await?;
    dbtx.insert_entry(&key, &reservation).await;
    Ok(true)
}

async fn release_unstarted_aggregate_dbtx<Cap>(
    dbtx: &mut DatabaseTransaction<'_, Cap>,
    token: FiFundingReservationToken,
) -> anyhow::Result<bool>
where
    Cap: Send,
{
    let key = FiFundingReservationKey::new(token);
    let mut reservation = dbtx
        .get_value(&key)
        .await
        .context("FI funding reservation is missing")?;
    ensure!(
        reservation.members().iter().all(|member| !matches!(
            member.state(),
            FiFundingReservationMemberState::Consumed { .. }
        )),
        "cannot release an FI aggregate after a payment output started"
    );
    let released_hold_msats = held_amount(&reservation)?;
    if released_hold_msats == 0 {
        return Ok(false);
    }
    for member in reservation.members_mut() {
        if member.state() == FiFundingReservationMemberState::Held {
            member.set_state(FiFundingReservationMemberState::ReleasedUnstarted);
        }
    }
    decrement_active_total(dbtx, released_hold_msats).await?;
    dbtx.insert_entry(&key, &reservation).await;
    Ok(true)
}

/// Testable production component that owns the payer-database and lock
/// contract. `FederationV2` delegates its public FI wallet API to this type and
/// adds the runtime balance-event projection.
struct FiFundingWallet<'a> {
    database: Database,
    spend_guard: &'a tokio::sync::Mutex<()>,
}

#[must_use = "a successful wallet transition requires a balance refresh"]
struct FiFundingRefresh;

impl<'a> FiFundingWallet<'a> {
    fn new(database: Database, spend_guard: &'a tokio::sync::Mutex<()>) -> Self {
        Self {
            database,
            spend_guard,
        }
    }

    #[cfg(test)]
    async fn lock(&self) -> FiFundingSpendGuard<'_> {
        FiFundingSpendGuard {
            owner: self.spend_guard,
            _guard: self.spend_guard.lock().await,
        }
    }

    fn ensure_guard(&self, guard: &FiFundingSpendGuard<'_>) -> anyhow::Result<()> {
        ensure_guard_owner(self.spend_guard, guard)
    }

    async fn reserved_total(&self) -> Amount {
        let mut dbtx = self.database.begin_transaction_nc().await;
        Amount::from_msats(
            dbtx.get_value(&FiFundingReservedTotalKey::new())
                .await
                .map_or(0, |total| total.amount_msats),
        )
    }

    async fn reserve(
        &self,
        guard: &FiFundingSpendGuard<'_>,
        available_balance: Amount,
        token: FiFundingReservationToken,
        fingerprint: FiFundingFingerprint,
        created_at_secs: u64,
        members: Vec<FiFundingReservationMember>,
    ) -> anyhow::Result<FiFundingRefresh> {
        self.ensure_guard(guard)?;
        let reservation = FiFundingReservation::new(fingerprint, created_at_secs, members)?;
        let amount_msats = held_amount(&reservation)?;
        let mut read_tx = self.database.begin_transaction_nc().await;
        if let Some(existing) = read_tx
            .get_value(&FiFundingReservationKey::new(token))
            .await
        {
            let quote_ids = reservation
                .members()
                .iter()
                .map(FiFundingReservationMember::quote_id)
                .collect::<Vec<_>>();
            ensure!(
                reservation_matches_plan(&existing, reservation.fingerprint(), &quote_ids),
                "FI funding reservation token was replayed with different terms"
            );
            return Ok(FiFundingRefresh);
        }
        drop(read_tx);
        ensure!(
            Amount::from_msats(amount_msats) <= available_balance,
            "insufficient virtual balance for FI funding reservation"
        );
        let mut dbtx = self.database.begin_transaction().await;
        insert_reservation_dbtx(&mut dbtx, token, &reservation).await?;
        dbtx.commit_tx_result().await?;
        Ok(FiFundingRefresh)
    }

    async fn balance_including_reservation(
        &self,
        guard: &FiFundingSpendGuard<'_>,
        available_balance: Amount,
        token: FiFundingReservationToken,
    ) -> anyhow::Result<Amount> {
        self.ensure_guard(guard)?;
        let mut dbtx = self.database.begin_transaction_nc().await;
        let reservation = dbtx
            .get_value(&FiFundingReservationKey::new(token))
            .await
            .context("FI funding reservation is missing")?;
        available_balance
            .checked_add(Amount::from_msats(held_amount(&reservation)?))
            .context("FI funding reservation balance overflowed")
    }

    async fn ensure_member(
        &self,
        token: FiFundingReservationToken,
        quote_id: FiFundingQuoteId,
    ) -> anyhow::Result<FiFundingReservationMemberState> {
        let mut dbtx = self.database.begin_transaction_nc().await;
        let reservation = dbtx
            .get_value(&FiFundingReservationKey::new(token))
            .await
            .context("FI funding reservation is missing")?;
        reservation
            .members()
            .iter()
            .find(|member| member.quote_id() == quote_id)
            .map(FiFundingReservationMember::state)
            .context("FI funding reservation does not contain this quote")
    }

    async fn has_reservation(&self, token: FiFundingReservationToken) -> bool {
        let mut dbtx = self.database.begin_transaction_nc().await;
        dbtx.get_value(&FiFundingReservationKey::new(token))
            .await
            .is_some()
    }

    async fn recover_reservation(
        &self,
        token: FiFundingReservationToken,
        fingerprint: FiFundingFingerprint,
        quote_ids: &[FiFundingQuoteId],
    ) -> anyhow::Result<bool> {
        let mut dbtx = self.database.begin_transaction_nc().await;
        let Some(existing) = dbtx.get_value(&FiFundingReservationKey::new(token)).await else {
            return Ok(false);
        };
        ensure!(
            reservation_matches_plan(&existing, fingerprint, quote_ids),
            "FI funding reservation does not match the exact payment plan"
        );
        Ok(true)
    }

    async fn release_unstarted_member(
        &self,
        guard: &FiFundingSpendGuard<'_>,
        token: FiFundingReservationToken,
        quote_id: FiFundingQuoteId,
    ) -> anyhow::Result<FiFundingRefresh> {
        self.ensure_guard(guard)?;
        let mut dbtx = self.database.begin_transaction().await;
        release_unstarted_member_dbtx(&mut dbtx, token, quote_id).await?;
        dbtx.commit_tx_result().await?;
        Ok(FiFundingRefresh)
    }

    async fn release_unstarted_aggregate(
        &self,
        guard: &FiFundingSpendGuard<'_>,
        token: FiFundingReservationToken,
    ) -> anyhow::Result<FiFundingRefresh> {
        self.ensure_guard(guard)?;
        let mut dbtx = self.database.begin_transaction().await;
        release_unstarted_aggregate_dbtx(&mut dbtx, token).await?;
        dbtx.commit_tx_result().await?;
        Ok(FiFundingRefresh)
    }
}

impl FederationV2 {
    fn fi_funding_wallet(&self) -> FiFundingWallet<'_> {
        FiFundingWallet::new(self.client.db().clone(), &self.spend_guard)
    }

    /// Acquire a federation-branded lock for an FI balance check and spend.
    pub async fn lock_fi_funding_spend(&self) -> FiFundingSpendGuard<'_> {
        FiFundingSpendGuard {
            owner: &self.spend_guard,
            _guard: self.spend_guard.lock().await,
        }
    }

    /// Total balance currently held by authorized FI formation payments.
    pub async fn fi_funding_reserved_total(&self) -> Amount {
        self.fi_funding_wallet().reserved_total().await
    }

    /// Reserve virtual balance for one aggregate FI payment.
    pub async fn reserve_fi_funding(
        &self,
        guard: &FiFundingSpendGuard<'_>,
        token: FiFundingReservationToken,
        fingerprint: FiFundingFingerprint,
        members: Vec<FiFundingReservationMember>,
    ) -> anyhow::Result<()> {
        let created_at_secs = fedimint_core::time::duration_since_epoch().as_secs();
        let _refresh = self
            .fi_funding_wallet()
            .reserve(
                guard,
                self.get_balance().await,
                token,
                fingerprint,
                created_at_secs,
                members,
            )
            .await?;
        self.send_balance_event().await;
        Ok(())
    }

    /// Available balance for this reservation's owner, serialized with every
    /// hold mutation so a concurrent release cannot be counted twice.
    pub async fn get_balance_including_fi_reservation(
        &self,
        guard: &FiFundingSpendGuard<'_>,
        token: FiFundingReservationToken,
    ) -> anyhow::Result<Amount> {
        self.fi_funding_wallet()
            .balance_including_reservation(guard, self.get_balance().await, token)
            .await
    }

    pub async fn ensure_fi_funding_reservation_member(
        &self,
        token: FiFundingReservationToken,
        quote_id: FiFundingQuoteId,
    ) -> anyhow::Result<()> {
        self.fi_funding_wallet()
            .ensure_member(token, quote_id)
            .await?;
        Ok(())
    }

    pub async fn ensure_fi_funding_member_consumed(
        &self,
        token: FiFundingReservationToken,
        quote_id: FiFundingQuoteId,
    ) -> anyhow::Result<()> {
        ensure!(
            matches!(
                self.fi_funding_wallet()
                    .ensure_member(token, quote_id)
                    .await?,
                FiFundingReservationMemberState::Consumed { .. }
            ),
            "FI funding reservation member was not consumed"
        );
        Ok(())
    }

    pub async fn has_fi_funding_reservation(&self, token: FiFundingReservationToken) -> bool {
        self.fi_funding_wallet().has_reservation(token).await
    }

    /// Recover an existing reservation only when its signed payment plan
    /// (fingerprint and ordered quote ids) matches. Hold amounts live in the
    /// stored row alone. A missing row is authoritative; this read never
    /// creates or mutates wallet state.
    pub async fn recover_fi_funding_reservation(
        &self,
        token: FiFundingReservationToken,
        fingerprint: FiFundingFingerprint,
        quote_ids: &[FiFundingQuoteId],
    ) -> anyhow::Result<bool> {
        self.fi_funding_wallet()
            .recover_reservation(token, fingerprint, quote_ids)
            .await
    }

    /// Run an atomic wallet operation in a transaction owned by this exact
    /// payer federation while its branded spend guard is held.
    pub async fn autocommit_fi_funding<'s, 'dbtx, F, T>(
        &'s self,
        guard: &FiFundingSpendGuard<'_>,
        tx_fn: F,
        max_attempts: Option<usize>,
    ) -> anyhow::Result<Result<T, AutocommitError<anyhow::Error>>>
    where
        's: 'dbtx,
        for<'r, 'o> F: Fn(
            FiFundingDatabaseTransaction<'r, 'o>,
            PhantomBound<'dbtx, 'o>,
        ) -> BoxFuture<'r, anyhow::Result<T>>,
    {
        autocommit_fi_funding_database(
            self.client.db(),
            &self.spend_guard,
            guard,
            self.federation_id(),
            tx_fn,
            max_attempts,
        )
        .await
    }

    /// Emit the canonical balance event after the caller commits consumption.
    /// The token is reusable so an exact recovery replay can heal a cancelled
    /// or lost post-commit notification.
    pub async fn emit_fi_funding_balance_change(
        &self,
        change: &FiFundingBalanceChange,
    ) -> anyhow::Result<()> {
        ensure!(
            change.federation_id == self.federation_id(),
            "FI funding balance change belongs to another federation"
        );
        self.send_balance_event().await;
        Ok(())
    }

    /// Release one member only while the wallet still proves it never started.
    pub async fn release_unstarted_fi_funding_member(
        &self,
        token: FiFundingReservationToken,
        quote_id: FiFundingQuoteId,
    ) -> anyhow::Result<()> {
        let guard = self.lock_fi_funding_spend().await;
        let _refresh = self
            .fi_funding_wallet()
            .release_unstarted_member(&guard, token, quote_id)
            .await?;
        self.send_balance_event().await;
        Ok(())
    }

    /// Record the credited refund amount on a paid seat, so transaction
    /// history can subtract it. Replay-safe; the refund credit itself is
    /// handled elsewhere.
    pub async fn record_fi_funding_member_refund(
        &self,
        token: FiFundingReservationToken,
        quote_id: FiFundingQuoteId,
        refunded: Amount,
    ) -> anyhow::Result<()> {
        let _guard = self.lock_fi_funding_spend().await;
        let mut dbtx = self.client.db().begin_transaction().await;
        record_member_refund_dbtx(&mut dbtx, token, quote_id, refunded.msats).await?;
        dbtx.commit_tx_result().await?;
        Ok(())
    }

    /// Every formation-payment hold in this wallet, for transaction history.
    pub async fn list_fi_funding_reservations(&self) -> Vec<FiFundingReservation> {
        let mut dbtx = self.client.db().begin_transaction_nc().await;
        dbtx.find_by_prefix(&FiFundingReservationKeyPrefix::new())
            .await
            .map(|(_key, reservation)| reservation)
            .collect()
            .await
    }

    /// Release an aggregate only if none of its members ever started.
    pub async fn release_unstarted_fi_funding(
        &self,
        token: FiFundingReservationToken,
    ) -> anyhow::Result<()> {
        let guard = self.lock_fi_funding_spend().await;
        let _refresh = self
            .fi_funding_wallet()
            .release_unstarted_aggregate(&guard, token)
            .await?;
        self.send_balance_event().await;
        Ok(())
    }
}

#[cfg(test)]
#[path = "fi_funding/tests.rs"]
mod tests;
