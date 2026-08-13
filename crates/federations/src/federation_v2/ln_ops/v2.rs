use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use fedimint_eventlog::{Event, EventLogEntry, EventLogId};
use fedimint_lnv2_client::events::ReceivePaymentEvent;
use fedimint_lnv2_client::{
    FinalSendOperationState as LnV2FinalSendOperationState, InvoiceSendStatus,
    LightningOperationMeta as LnV2OperationMeta, ReceiveOperationMeta as LnV2ReceiveOperationMeta,
    ReceiveOperationState as LnV2ReceiveOperationState, SendOperationMeta as LnV2SendOperationMeta,
    SendOperationState as LnV2SendOperationState,
};
use futures::StreamExt;
use lightning_invoice::{Bolt11Invoice, RoutingFees};
use rpc_types::error::ErrorCode;
use rpc_types::{
    BaseMetadata, FrontendMetadata, LightningSendMetadata, RpcAmount, RpcFeeDetails,
    RpcLightningGateway, RpcLightningGatewayId, RpcPayInvoiceResponse, RpcPrevPayInvoiceResult,
    RpcTransactionDirection, RpcTransactionKind,
};
use tracing::{debug, error, warn};

use super::{
    FeeRemittance, FeeRemittanceGatewayOverride, FeeRemittanceRoute, LnOps, Lnv2SendCreated,
};
use crate::federation_v2::client::ClientExt;
use crate::federation_v2::db::{
    FedimintEventLogCursorKey, LnurlReceivePendingKey, LnurlReceivePendingKeyPrefix,
};
use crate::federation_v2::{
    FederationTransactionParts, FederationV2, FediFeeStream, get_max_spendable_amount,
};

pub struct LnOpsV2;

impl LnOpsV2 {
    /// Spawns the subscriber for an LNURL receive, deduplicated through
    /// [`FederationV2::spawn_operation_subscriber`].
    ///
    /// Called from the lnurl receives consumer only: once after the tx
    /// recording an operation's discovery has committed, and again from its
    /// periodic repair pass for every receive still owed its event
    /// ([`Self::respawn_pending_lnurl_receives`]) -- the two calls can race
    /// each other harmlessly. The dedup keeps them from stacking a second
    /// task on a subscriber that is still running, and
    /// [`Self::run_lnurl_receive_subscription`]'s own pending-entry recheck
    /// makes a spawn that lands after an earlier one already finished a
    /// safe no-op.
    async fn spawn_lnurl_receive_subscriber(fed: &FederationV2, operation_id: OperationId) {
        fed.spawn_operation_subscriber(
            operation_id,
            "subscribe lnv2 lnurl receive",
            move |fed| async move {
                Self::run_lnurl_receive_subscription(&fed, operation_id).await;
            },
        )
        .await;
    }

    async fn run_lnurl_receive_subscription(fed: &FederationV2, operation_id: OperationId) {
        // Recheck the pending entry now that this task holds the subscriber
        // claim: the repair pass reads its snapshot before spawning, so its
        // spawn can land just after the previous subscriber emitted, cleared
        // the entry and released the claim, and would otherwise re-emit the
        // cached terminal outcome.
        let pending = fed
            .client
            .db()
            .begin_transaction_nc()
            .await
            .get_value(&LnurlReceivePendingKey(operation_id))
            .await
            .is_some();
        if !pending {
            return;
        }

        let Ok(lnv2) = fed.client.lnv2() else {
            error!("lnv2 module not present");
            return;
        };
        let mut updates = match lnv2
            .subscribe_receive_operation_state_updates(operation_id)
            .await
        {
            Ok(updates) => updates.into_stream(),
            Err(e) => {
                warn!("lnv2 subscribe_lnurl_receive failed: {e:?}");
                return;
            }
        };

        // No fedi fee accounting here, matching the v1 recurringd path in
        // `lnurl_receives_service`: it records state and emits the event, and
        // nothing else. Copying the plain `Receive` arm instead would start
        // charging a fee on lnurl receives that v1 never charged.
        while let Some(state) = updates.next().await {
            fed.update_operation_state(operation_id, state.clone())
                .await;
            match state {
                LnV2ReceiveOperationState::Claimed
                | LnV2ReceiveOperationState::Expired
                | LnV2ReceiveOperationState::Failure => {
                    // The pending entry is the delivery debt, so it may only
                    // be cleared once the event has actually reached the
                    // sink: clearing it for a failed emission would drop the
                    // event forever. On failure this subscriber just ends;
                    // the entry the consumer committed before spawning it
                    // keeps the periodic repair pass
                    // (`Self::respawn_pending_lnurl_receives`) retrying
                    // until the emission succeeds.
                    if let Err(err) = fed.try_send_transaction_event(operation_id).await {
                        warn!("lnurl receive event emission failed, will retry: {err:?}");
                        continue;
                    }
                    // Cleared only after the event, so delivery is
                    // at-least-once -- a crash between the two re-emits on
                    // the next start rather than losing the event.
                    if let Err(err) = fed
                        .client
                        .db()
                        .autocommit(
                            |dbtx, _| {
                                Box::pin(async move {
                                    dbtx.remove_entry(&LnurlReceivePendingKey(operation_id))
                                        .await;
                                    Ok::<(), anyhow::Error>(())
                                })
                            },
                            Some(10),
                        )
                        .await
                    {
                        warn!("failed to clear pending lnurl receive: {err:?}");
                    }
                }
                LnV2ReceiveOperationState::Pending | LnV2ReceiveOperationState::Claiming => {}
            }
        }
    }
}

fn fee_remittance_invoice_amount(
    outstanding_fees_total: Amount,
    fee_base: Amount,
    fee_ppm: u64,
) -> Result<Amount> {
    let amt_to_request_numerator = 1_000_000
        * outstanding_fees_total
            .msats
            .checked_sub(fee_base.msats)
            .ok_or(anyhow!("Accrued fee < base gateway fees!"))?;
    let amt_to_request_denominator = 1_000_000 + fee_ppm;
    Ok(Amount::from_msats(
        amt_to_request_numerator / amt_to_request_denominator,
    ))
}

impl LnOpsV2 {
    /// Handles one persistent event-log entry inside the consumer's tx: if
    /// it is the lnv2 `ReceivePaymentEvent` of an lnurl receive, records the
    /// operation as pending delivery (same tx as the cursor advance) and
    /// returns it, so the caller can spawn its subscriber once that tx has
    /// committed. Ordinary (non-lnurl) lnv2 receives also log this event;
    /// their transaction event comes from the RPC path that initiated them,
    /// so they are classified and skipped here rather than announced twice.
    /// Every skip is final: the caller advances the cursor past the entry
    /// regardless of the return value.
    async fn handle_event_log_entry<Cap: Send>(
        fed: &FederationV2,
        dbtx: &mut DatabaseTransaction<'_, Cap>,
        entry: EventLogEntry,
    ) -> Option<OperationId> {
        if entry.kind != ReceivePaymentEvent::KIND
            || entry.module_kind() != Some(&fedimint_lnv2_client::common::KIND)
        {
            return None;
        }
        let Some(event) = entry.to_event::<ReceivePaymentEvent>() else {
            warn!("undecodable lnv2 payment-receive event payload, skipping");
            return None;
        };
        let operation_id = event.operation_id;
        let Some(op) = fed.client.operation_log().get_operation(operation_id).await else {
            warn!(
                ?operation_id,
                "payment-receive event without operation, skipping"
            );
            return None;
        };
        // TODO: propose a dedicated lnurl event upstream (e.g. an
        // operation-created event carrying the operation id) so
        // classification doesn't have to dig through operation meta here:
        // https://github.com/fedibtc/fedi/pull/11918#discussion_r3778415974
        let Ok(LnV2OperationMeta::LnurlReceive(_)) = op.try_meta() else {
            // Ordinary receives are announced by the RPC path that created them.
            return None;
        };
        dbtx.insert_entry(&LnurlReceivePendingKey(operation_id), &())
            .await;
        Some(operation_id)
    }

    /// Startup + periodic repair: respawns the subscriber for every receive
    /// still owed its event. Spawning is idempotent -- the dedup in
    /// `spawn_operation_subscriber` skips subscribers that are still alive,
    /// and [`Self::run_lnurl_receive_subscription`] rechecks the pending
    /// entry -- so racing the consumer or a just-finished subscriber is
    /// harmless.
    async fn respawn_pending_lnurl_receives(fed: &FederationV2) {
        let pending: Vec<OperationId> = fed
            .client
            .db()
            .begin_transaction_nc()
            .await
            .find_by_prefix(&LnurlReceivePendingKeyPrefix)
            .await
            .map(|(key, ())| key.0)
            .collect()
            .await;
        for operation_id in pending {
            Self::spawn_lnurl_receive_subscriber(fed, operation_id).await;
        }
    }

    /// Emits the transaction event for every lnv2 lnurl receive. These
    /// operations are created by the lnv2 client's own background scanner,
    /// so nothing else learns of one claimed mid-session, and nothing at all
    /// learns of one claimed while the app was closed. Without this consumer
    /// a receive is claimed silently and its transaction event never fires.
    /// It is the v2 counterpart of `lnurl_receives_service`, which polls
    /// recurringd over HTTP for the same reason.
    ///
    /// Discovery reads the lnv2 receive state machine's own
    /// `ReceivePaymentEvent`, logged in the same dbtx as the claim, from the
    /// client's persistent (non-trimable) event log through a durable
    /// cursor ([`crate::federation_v2::db::FedimintEventLogCursorKey`]).
    /// `ReceivePaymentEvent` is
    /// [`fedimint_eventlog::EventPersistence::Persistent`], so it is never
    /// trimmed and the cursor may lag arbitrarily -- a device off for months
    /// loses nothing. `Client::handle_events` is deliberately not used: it
    /// targets the *trimable* log, where a lagging cursor position can be
    /// trimmed away and wedge the loop. `Client::handle_historical_events`
    /// targets the *right* (persistent) log but isn't used either, for two
    /// unrelated reasons: its `call_fn` can't borrow the dbtx into the
    /// future it returns, which forbids the atomic pending-insert below; and
    /// its loop commits with `commit_tx`, which panics on a write-write
    /// conflict -- needlessly fatal for a long-lived background task that
    /// can simply retry.
    ///
    /// Atomicity/ordering: the [`LnurlReceivePendingKey`] insert and the
    /// cursor advance commit in one bridge-owned tx per event
    /// ([`Self::handle_event_log_entry`]), and the subscriber is spawned
    /// only *after* that tx commits, so it can never observe -- let alone
    /// race -- its own uncommitted discovery. The subscriber
    /// ([`Self::run_lnurl_receive_subscription`]) emits via
    /// `try_send_transaction_event` and, only on `Ok`, removes the pending
    /// entry. Delivery is at-least-once: a crash between emit and removal
    /// re-emits once on the next start.
    ///
    /// Discovery idempotence leans on an upstream invariant: upstream logs
    /// `ReceivePaymentEvent` at most once per operation -- only in the
    /// receive state machine's `Pending -> Claiming` transition, in the
    /// same dbtx as that state update (`receive_sm.rs`), for the single
    /// state machine that `receive_incoming_contract`'s idempotent
    /// `manual_operation_start` creates per contract. A second event for
    /// the same operation would re-arm its pending entry after delivery
    /// and re-emit; the at-least-once contract would survive that, but a
    /// fedimint bump that starts logging duplicate events should be
    /// caught here rather than by users.
    ///
    /// Repair/retry: a subscriber can die before emitting (subscription
    /// failure, emission failure, shutdown -- including a shutdown in the
    /// window between the consumer's commit and its spawn), leaving its
    /// pending entry in place. [`Self::respawn_pending_lnurl_receives`]
    /// respawns every pending receive -- a no-op while a subscriber is
    /// alive via the dedup in `spawn_operation_subscriber` -- at startup
    /// before the loop below and every 30s after.
    ///
    /// Migration: a first-ever run has no persisted cursor. Starting the
    /// loop below at [`EventLogId::LOG_START`] would walk and re-announce
    /// the *entire* persistent history the first time this ships to an
    /// existing install, so `FederationV2::init_event_log_cursor_if_absent`
    /// durably establishes the cursor at the log's current tail *before*
    /// the client -- and so the lnv2 scanner -- can ever exist for this
    /// federation, at every federation-load call site. That timing is load
    /// bearing: doing it after client construction would race the scanner,
    /// which is spawned from inside client construction itself -- a payment
    /// that settled while the app was closed can get claimed and its event
    /// logged before a post-construction snapshot runs, landing the cursor
    /// above that event and skipping it as history forever, right at the
    /// upgrade boundary this feature exists to cover. Lnurl receives
    /// claimed before this feature existed keep appearing in transaction
    /// listings via `get_transaction`, they just get no retroactive push
    /// event -- deliberate. The loop below refuses to run at all if it ever
    /// finds the cursor absent rather than falling back to
    /// [`EventLogId::LOG_START`]: that would silently reintroduce the same
    /// historical-replay failure the pre-open init exists to prevent.
    ///
    /// Ownership: this consumer is the *only* spawner of lnurl receive
    /// subscribers. Scanner-created lnurl receives are born claimable -- the
    /// incoming contract already exists at the federation by the time
    /// `receive_lnurl` creates the operation (upstream's one, contract-first
    /// creation site), so the state machine's `Pending` state resolves
    /// straight to `Claiming` on its very first transition, logging
    /// `ReceivePaymentEvent` immediately; `Expired`, reachable only when the
    /// contract is still pending at creation, is unreachable for this
    /// operation kind. There is therefore no window where an lnurl receive
    /// is active but unclaimed for anything else to discover, and no need
    /// for another spawner: `subscribe_operation`'s `LnurlReceive` arm and
    /// `get_transaction` are both no-ops for spawning (see their own
    /// comments). If upstream ever grows a pre-contract lnurl creation
    /// path, `subscribe_operation`'s arm is where startup recovery would
    /// need to attach.
    fn spawn_lnurl_receives_consumer(fed: &FederationV2) {
        fed.spawn_cancellable("lnv2_lnurl_receives_consumer", |fed| async move {
            if fed.client.lnv2().is_err() {
                return;
            }
            Self::respawn_pending_lnurl_receives(&fed).await;
            fed.spawn_cancellable("lnv2_lnurl_receives_repair", |fed| async move {
                loop {
                    fedimint_core::task::sleep(Duration::from_secs(30)).await;
                    Self::respawn_pending_lnurl_receives(&fed).await;
                }
            });

            let mut log_event_added = fed.client.log_event_added_rx();
            // Conflicts are not expected here -- subscribers only ever touch
            // pending entries whose discovery tx has already committed -- so
            // a handful of consecutive commit failures retry instantly as
            // plain robustness. Past that, something is persistently wrong
            // (e.g. the backend itself failing), so this backs off and logs
            // loudly instead of hot-looping at 100% CPU invisibly.
            const INSTANT_RETRY_LIMIT: u32 = 5;
            let mut consecutive_failures: u32 = 0;
            loop {
                let mut dbtx = fed.client.db().begin_transaction().await;
                // `FederationV2::init_event_log_cursor_if_absent` durably
                // establishes this key before the client -- and so the lnv2
                // scanner -- can ever exist, so it must never be absent
                // here. Defaulting a missing cursor to
                // `EventLogId::LOG_START` would replay and re-announce the
                // whole persistent history; refuse instead, loudly, so a
                // bug here or an unanticipated federation-load path that
                // skips the pre-open init surfaces immediately rather than
                // spamming users with history. The repair task keeps
                // running: it only retries pending entries and never touches
                // this cursor.
                let Some(next): Option<EventLogId> =
                    dbtx.get_value(&FedimintEventLogCursorKey).await
                else {
                    error!("event-log cursor missing at consume time, refusing to replay history");
                    return;
                };
                match dbtx.get_value(&next).await {
                    Some(entry) => {
                        let discovered =
                            Self::handle_event_log_entry(&fed, &mut dbtx.to_ref_nc(), entry).await;
                        dbtx.insert_entry(&FedimintEventLogCursorKey, &next.saturating_add(1))
                            .await;
                        match dbtx.commit_tx_result().await {
                            Ok(()) => {
                                consecutive_failures = 0;
                                // Spawned only now that the pending entry and
                                // cursor advance are durable: the subscriber
                                // can never race an uncommitted discovery,
                                // and a shutdown right here is repaired from
                                // the pending index at the next startup pass.
                                if let Some(operation_id) = discovered {
                                    Self::spawn_lnurl_receive_subscriber(&fed, operation_id).await;
                                }
                            }
                            Err(err) if consecutive_failures < INSTANT_RETRY_LIMIT => {
                                consecutive_failures += 1;
                                // Retry the whole iteration from the re-read
                                // cursor.
                                debug!(%err, "event-log consumer tx failed to commit, retrying");
                            }
                            Err(err) => {
                                consecutive_failures += 1;
                                warn!(
                                    %err,
                                    consecutive_failures,
                                    "event-log consumer tx repeatedly failing to commit, backing off"
                                );
                                fedimint_core::task::sleep(Duration::from_millis(100)).await;
                            }
                        }
                    }
                    None => {
                        drop(dbtx);
                        if log_event_added.changed().await.is_err() {
                            return;
                        }
                    }
                }
            }
        });
    }
}

#[apply(async_trait_maybe_send!)]
impl LnOps for LnOpsV2 {
    async fn generate_invoice(
        &self,
        fed: &FederationV2,
        amount: RpcAmount,
        description: String,
        expiry_time: Option<u64>,
        frontend_meta: FrontendMetadata,
    ) -> Result<Bolt11Invoice> {
        let amount = Amount::from_sats(amount.0.msats.div_ceil(1000));
        let fee_ppms = fed
            .get_fee_ppms_by_stream(fedimint_ln_common::KIND, RpcTransactionDirection::Receive)
            .await?;
        let expiry_secs = expiry_time.unwrap_or(86_400) as u32;
        let custom_meta = serde_json::to_value(BaseMetadata::from(frontend_meta.clone()))?;
        let (invoice, operation_id) = fed
            .client
            .lnv2()?
            .receive(
                amount,
                expiry_secs,
                fedimint_lnv2_client::common::Bolt11InvoiceDescription::Direct(description),
                fed.get_lnv2_gateway_override().await?,
                custom_meta,
            )
            .await?;
        fed.write_pending_receive_fedi_fee_ppms(operation_id, &fee_ppms)
            .await?;
        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
        self.subscribe_operation(
            fed,
            operation_id,
            fed.client
                .operation_log()
                .get_operation(operation_id)
                .await
                .context("operation not found")?,
        )
        .await;
        Ok(invoice)
    }

    async fn estimate_ln_fees(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcFeeDetails> {
        let amount = Amount::from_msats(
            invoice
                .amount_milli_satoshis()
                .ok_or(anyhow!("Invoice missing amount"))?,
        );
        let lnv2 = fed.client.lnv2()?;
        let routing_info = if let Some(gateway) = fed.get_lnv2_gateway_override().await? {
            lnv2.routing_info(&gateway)
                .await?
                .context("lnv2 gateway override is unavailable")?
        } else {
            lnv2.select_gateway(Some(invoice.clone())).await?.1
        };
        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let (send_fee, _) = routing_info.send_parameters(invoice);
        Ok(RpcFeeDetails {
            fedi_app_fee: RpcAmount(FederationV2::fedi_fee_amount_for_stream(
                &fees_by_stream,
                FediFeeStream::App,
            )),
            fedi_guardian_fee: RpcAmount(FederationV2::fedi_fee_amount_for_stream(
                &fees_by_stream,
                FediFeeStream::Guardian,
            )),
            network_fee: RpcAmount(send_fee.fee(amount.msats)),
            federation_fee: RpcAmount(Amount::ZERO),
        })
    }

    async fn pay_invoice(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcPayInvoiceResponse> {
        let amount_msat = invoice
            .amount_milli_satoshis()
            .ok_or(anyhow!("Invoice missing amount"))?;
        let amount = Amount::from_msats(amount_msat);

        let federation_network = fed
            .get_network()
            .context("federation is still recovering")?;
        if federation_network != invoice.network() {
            bail!(format!(
                "Invoice is for wrong network. Expected {}, got {}",
                federation_network,
                crate::federation_v2::display_currency(invoice.currency())
            ))
        }

        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);
        let lnv2 = fed.client.lnv2()?;
        let gateway_override = fed.get_lnv2_gateway_override().await?;
        let routing_info = if let Some(gateway) = &gateway_override {
            lnv2.routing_info(gateway)
                .await?
                .context("lnv2 gateway override is unavailable")?
        } else {
            lnv2.select_gateway(Some(invoice.clone())).await?.1
        };
        let (send_fee, _) = routing_info.send_parameters(invoice);
        let gateway_fee = send_fee.fee(amount.msats);
        let gateway_routing_fees = RoutingFees {
            base_msat: send_fee.base.msats as u32,
            proportional_millionths: send_fee.parts_per_million as u32,
        };

        let spend_guard = fed.spend_guard.lock().await;
        let virtual_balance = fed.get_balance().await;
        if amount + fedi_fee + gateway_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(
                    virtual_balance,
                    FederationV2::total_fedi_fee_ppm(
                        &fed.get_fee_ppms_by_stream(
                            fedimint_ln_common::KIND,
                            RpcTransactionDirection::Send,
                        )
                        .await?,
                    ),
                    None,
                    Some(gateway_routing_fees),
                )
            )));
        }
        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: false,
            frontend_metadata: Some(frontend_meta.clone()),
        };
        let custom_meta = serde_json::to_value(&extra_meta)?;
        let operation_id = lnv2
            .send(invoice.clone(), gateway_override, custom_meta)
            .await?;

        async move {
            fed.write_pending_send_fedi_fees(operation_id, &fees_by_stream)
                .await?;
            drop(spend_guard);
            let _ = fed
                .record_tx_date_fiat_info(operation_id, amount + fedi_fee + gateway_fee)
                .await;
            let final_state = fed
                .client
                .lnv2()?
                .await_final_send_operation_state(operation_id)
                .await?;
            match final_state {
                LnV2FinalSendOperationState::Success(preimage) => {
                    let _ = fed.write_success_send_fedi_fees(operation_id).await;
                    fed.send_transaction_event(operation_id).await;
                    Ok(RpcPayInvoiceResponse {
                        preimage: hex::encode(preimage),
                    })
                }
                LnV2FinalSendOperationState::Refunded => {
                    let _ = fed.write_failed_send_fedi_fees(operation_id).await;
                    fed.send_transaction_event(operation_id).await;
                    bail!("Lightning payment failed, got refund");
                }
                LnV2FinalSendOperationState::Failure => {
                    let _ = fed.write_failed_send_fedi_fees(operation_id).await;
                    fed.send_transaction_event(operation_id).await;
                    bail!("Lightning payment failed");
                }
            }
        }
        .await
        .map_err(|error: anyhow::Error| anyhow::Error::new(Lnv2SendCreated(error)))
    }

    async fn prepare_fee_remittance(
        &self,
        fed: &FederationV2,
        outstanding_fees_total: Amount,
        gateway_override: Option<FeeRemittanceGatewayOverride>,
    ) -> Result<FeeRemittance> {
        let lnv2 = fed.client.lnv2()?;
        let (gateway, routing_info) = match gateway_override {
            Some(FeeRemittanceGatewayOverride::Lnv2 { url }) => {
                let routing_info = lnv2
                    .routing_info(&url)
                    .await?
                    .context("lnv2 gateway override is unavailable")?;
                (url, routing_info)
            }
            Some(FeeRemittanceGatewayOverride::Lnv1 { .. }) => {
                bail!("lnv2 cannot prepare lnv1 fee remittance");
            }
            None => lnv2.select_gateway(None).await?,
        };
        Ok(FeeRemittance {
            invoice_amount: fee_remittance_invoice_amount(
                outstanding_fees_total,
                routing_info.send_fee_default.base,
                routing_info.send_fee_default.parts_per_million,
            )?,
            route: FeeRemittanceRoute::Lnv2 { gateway },
        })
    }

    async fn pay_fee_remittance(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        remittance: FeeRemittance,
    ) -> Result<RpcPayInvoiceResponse> {
        let FeeRemittanceRoute::Lnv2 { gateway } = remittance.route else {
            bail!("lnv2 cannot pay lnv1 fee remittance");
        };
        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: true,
            frontend_metadata: None,
        };
        let operation_id = fed
            .client
            .lnv2()?
            .send(
                invoice.clone(),
                Some(gateway),
                serde_json::to_value(&extra_meta)?,
            )
            .await?;
        let final_state = fed
            .client
            .lnv2()?
            .await_final_send_operation_state(operation_id)
            .await?;
        fed.update_operation_state(operation_id, final_state.clone())
            .await;
        match final_state {
            LnV2FinalSendOperationState::Success(preimage) => Ok(RpcPayInvoiceResponse {
                preimage: hex::encode(preimage),
            }),
            LnV2FinalSendOperationState::Refunded => {
                bail!("Lightning payment failed, got refund");
            }
            LnV2FinalSendOperationState::Failure => {
                bail!("Lightning payment failed");
            }
        }
    }

    async fn get_prev_pay_invoice_result(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcPrevPayInvoiceResult> {
        let status = fed.client.lnv2()?.get_invoice_send_status(invoice).await?;
        // In-flight and failed sends report not-completed to match the v1
        // semantics: a retry of an in-flight send is rejected by lnv2's send
        // itself, and a failed send is safe to pay again.
        Ok(RpcPrevPayInvoiceResult {
            completed: matches!(status, InvoiceSendStatus::Succeeded(_)),
        })
    }

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    ) {
        let meta = operation.meta::<LnV2OperationMeta>();
        match meta {
            LnV2OperationMeta::Send(LnV2SendOperationMeta { custom_meta, .. }) => {
                let extra_meta = serde_json::from_value::<LightningSendMetadata>(custom_meta)
                    .unwrap_or(LightningSendMetadata {
                        is_fedi_fee_remittance: false,
                        frontend_metadata: None,
                    });
                fed.spawn_cancellable("subscribe lnv2 send", move |fed| async move {
                    let Ok(lnv2) = fed.client.lnv2() else {
                        error!("lnv2 module not present");
                        return;
                    };
                    let mut updates = match lnv2
                        .subscribe_send_operation_state_updates(operation_id)
                        .await
                    {
                        Ok(updates) => updates.into_stream(),
                        Err(e) => {
                            warn!("lnv2 subscribe_send failed: {e:?}");
                            return;
                        }
                    };
                    // history reads back whatever this records, so record every update
                    while let Some(state) = updates.next().await {
                        fed.update_operation_state(operation_id, state.clone())
                            .await;
                        if extra_meta.is_fedi_fee_remittance {
                            continue;
                        }
                        match state {
                            LnV2SendOperationState::Success(_) => {
                                let _ = fed.write_success_send_fedi_fees(operation_id).await;
                                fed.send_transaction_event(operation_id).await;
                            }
                            LnV2SendOperationState::Refunded | LnV2SendOperationState::Failure => {
                                let _ = fed.write_failed_send_fedi_fees(operation_id).await;
                                fed.send_transaction_event(operation_id).await;
                            }
                            LnV2SendOperationState::Funding
                            | LnV2SendOperationState::Funded
                            | LnV2SendOperationState::Refunding => {}
                        }
                    }
                });
            }
            LnV2OperationMeta::Receive(LnV2ReceiveOperationMeta { invoice, .. }) => {
                let amount = match invoice {
                    fedimint_lnv2_client::common::LightningInvoice::Bolt11(inv) => {
                        Amount::from_msats(inv.amount_milli_satoshis().unwrap_or(0))
                    }
                };
                fed.spawn_cancellable("subscribe lnv2 receive", move |fed| async move {
                    let Ok(lnv2) = fed.client.lnv2() else {
                        error!("lnv2 module not present");
                        return;
                    };
                    let mut updates = match lnv2
                        .subscribe_receive_operation_state_updates(operation_id)
                        .await
                    {
                        Ok(updates) => updates.into_stream(),
                        Err(e) => {
                            warn!("lnv2 subscribe_receive failed: {e:?}");
                            return;
                        }
                    };
                    // history reads back whatever this records, so record every update
                    while let Some(state) = updates.next().await {
                        fed.update_operation_state(operation_id, state.clone())
                            .await;
                        match state {
                            LnV2ReceiveOperationState::Claimed => {
                                let _ = fed
                                    .write_success_receive_fedi_fees(operation_id, amount)
                                    .await;
                                fed.send_transaction_event(operation_id).await;
                            }
                            LnV2ReceiveOperationState::Expired
                            | LnV2ReceiveOperationState::Failure => {
                                let _ = fed.write_failed_receive_fedi_fees(operation_id).await;
                                fed.send_transaction_event(operation_id).await;
                            }
                            LnV2ReceiveOperationState::Pending
                            | LnV2ReceiveOperationState::Claiming => {}
                        }
                    }
                });
            }
            // Scanner-created lnurl receives are born claimable: the
            // incoming contract already exists at the federation by the
            // time `receive_lnurl` creates the operation (upstream's one,
            // contract-first creation site), so its state machine logs
            // `ReceivePaymentEvent` on its very first transition and the
            // event-log consumer's discovery is complete for them (see
            // `spawn_lnurl_receives_consumer`'s doc). Nothing to replay
            // here. If upstream ever grows a pre-contract lnurl creation
            // path -- one where an operation can sit `Pending` and
            // discoverable-but-unclaimed across a restart -- this arm is
            // where startup recovery would need to attach a subscriber.
            LnV2OperationMeta::LnurlReceive(_) => {}
        }
    }

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>> {
        let lnv2_meta: LnV2OperationMeta = entry.try_meta()?;
        match lnv2_meta {
            LnV2OperationMeta::Send(LnV2SendOperationMeta {
                invoice,
                contract,
                custom_meta,
                ..
            }) => {
                let extra_meta = serde_json::from_value::<LightningSendMetadata>(custom_meta)
                    .unwrap_or(LightningSendMetadata {
                        is_fedi_fee_remittance: false,
                        frontend_metadata: None,
                    });
                if extra_meta.is_fedi_fee_remittance {
                    return Ok(None);
                }
                let invoice_amount = match &invoice {
                    fedimint_lnv2_client::common::LightningInvoice::Bolt11(inv) => {
                        Amount::from_msats(inv.amount_milli_satoshis().unwrap_or(0))
                    }
                };
                let gateway_fee = contract.amount.saturating_sub(invoice_amount);
                let invoice_str = match &invoice {
                    fedimint_lnv2_client::common::LightningInvoice::Bolt11(inv) => inv.to_string(),
                };
                // outcome_or_updates caches the last yielded
                // SendOperationState (which carries a preimage in
                // Success). FinalSendOperationState is just a
                // convenience projection; the on-disk shape is
                // SendOperationState.
                let state = fed
                    .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                        fed.client
                            .lnv2()?
                            .subscribe_send_operation_state_updates(op_id)
                            .await
                    })
                    .await?
                    .map(|s| match s {
                        LnV2SendOperationState::Success(preimage) => {
                            fedimint_ln_client::LnPayState::Success {
                                preimage: hex::encode(preimage),
                            }
                        }
                        LnV2SendOperationState::Refunded => {
                            fedimint_ln_client::LnPayState::Refunded {
                                gateway_error:
                                    fedimint_ln_client::pay::GatewayPayError::GatewayInternalError {
                                        error_code: None,
                                        error_message: "refunded".into(),
                                    },
                            }
                        }
                        LnV2SendOperationState::Failure => {
                            fedimint_ln_client::LnPayState::UnexpectedError {
                                error_message: "lnv2 payment failed".into(),
                            }
                        }
                        LnV2SendOperationState::Funding => fedimint_ln_client::LnPayState::Created,
                        LnV2SendOperationState::Funded => {
                            fedimint_ln_client::LnPayState::Funded { block_height: 0 }
                        }
                        LnV2SendOperationState::Refunding => {
                            fedimint_ln_client::LnPayState::WaitingForRefund {
                                error_reason: "refunding".into(),
                            }
                        }
                    });
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(Amount {
                        msats: invoice_amount.msats + fedi_fee_msats + gateway_fee.msats,
                    }),
                    frontend_metadata: extra_meta.frontend_metadata,
                    kind: RpcTransactionKind::LnPay {
                        ln_invoice: invoice_str,
                        lightning_fees: RpcAmount(gateway_fee),
                        state: state.map(Into::into),
                    },
                }))
            }
            LnV2OperationMeta::Receive(LnV2ReceiveOperationMeta {
                invoice,
                custom_meta,
                ..
            }) => {
                let frontend_metadata = serde_json::from_value::<BaseMetadata>(custom_meta)
                    .unwrap_or_default()
                    .into();
                let (invoice_str, amount_msats) = match &invoice {
                    fedimint_lnv2_client::common::LightningInvoice::Bolt11(inv) => {
                        (inv.to_string(), inv.amount_milli_satoshis().unwrap_or(0))
                    }
                };
                let state = fed
                    .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                        fed.client
                            .lnv2()?
                            .subscribe_receive_operation_state_updates(op_id)
                            .await
                    })
                    .await?
                    .map(|s| match s {
                        LnV2ReceiveOperationState::Claimed => {
                            fedimint_ln_client::LnReceiveState::Claimed
                        }
                        LnV2ReceiveOperationState::Expired => {
                            fedimint_ln_client::LnReceiveState::Canceled {
                                reason: fedimint_ln_client::receive::LightningReceiveError::Timeout,
                            }
                        }
                        LnV2ReceiveOperationState::Failure => {
                            fedimint_ln_client::LnReceiveState::Canceled {
                                reason: fedimint_ln_client::receive::LightningReceiveError::ClaimRejected,
                            }
                        }
                        LnV2ReceiveOperationState::Pending => {
                            fedimint_ln_client::LnReceiveState::Created
                        }
                        LnV2ReceiveOperationState::Claiming => {
                            fedimint_ln_client::LnReceiveState::Funded
                        }
                    });
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(Amount {
                        msats: amount_msats,
                    }),
                    frontend_metadata,
                    kind: RpcTransactionKind::LnReceive {
                        ln_invoice: invoice_str,
                        state: state.map(Into::into),
                    },
                }))
            }
            LnV2OperationMeta::LnurlReceive(meta) => {
                // No subscriber is spawned from listings, deliberately: the
                // event-log consumer alone accounts for every lnurl receive
                // this fedimint can create (see `spawn_lnurl_receives_consumer`'s
                // ownership doc), so there is no gap here to fill, and a
                // listing has no natural bound on how often or how many
                // times it fires for the same operation the way spawning
                // would want one.
                //
                // The amount comes from the contract: an lnurl receive has no
                // invoice of its own to read it from.
                let amount = meta.contract.commitment.amount;
                let state = fed
                    .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                        fed.client
                            .lnv2()?
                            .subscribe_receive_operation_state_updates(op_id)
                            .await
                    })
                    .await?
                    .map(|s| match s {
                        LnV2ReceiveOperationState::Claimed => {
                            fedimint_ln_client::LnReceiveState::Claimed
                        }
                        LnV2ReceiveOperationState::Expired => {
                            fedimint_ln_client::LnReceiveState::Canceled {
                                reason: fedimint_ln_client::receive::LightningReceiveError::Timeout,
                            }
                        }
                        LnV2ReceiveOperationState::Failure => {
                            fedimint_ln_client::LnReceiveState::Canceled {
                                reason: fedimint_ln_client::receive::LightningReceiveError::ClaimRejected,
                            }
                        }
                        LnV2ReceiveOperationState::Pending => {
                            fedimint_ln_client::LnReceiveState::Created
                        }
                        LnV2ReceiveOperationState::Claiming => {
                            fedimint_ln_client::LnReceiveState::Funded
                        }
                    });

                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(amount),
                    frontend_metadata: None,
                    kind: RpcTransactionKind::LnRecurringdReceive {
                        state: state.map(Into::into),
                    },
                }))
            }
        }
    }

    async fn list_gateways(&self, fed: &FederationV2) -> anyhow::Result<Vec<RpcLightningGateway>> {
        let urls = fed
            .client
            .lnv2()?
            .list_gateways(None)
            .await
            .unwrap_or_default();
        let lnv2 = fed.client.lnv2()?;
        let mut gateways = Vec::new();
        for url in urls {
            let routing_info = match lnv2.routing_info(&url).await {
                Ok(Some(routing_info)) => routing_info,
                Ok(None) => {
                    warn!(%url, "lnv2 gateway returned no routing info");
                    continue;
                }
                Err(error) => {
                    warn!(%url, ?error, "failed to fetch lnv2 gateway routing info");
                    continue;
                }
            };
            gateways.push(RpcLightningGateway {
                id: RpcLightningGatewayId::Lnv2 {
                    url: url.to_string(),
                },
                api: url.to_string(),
                node_pub_key: rpc_types::RpcPublicKey(routing_info.lightning_public_key),
                gateway_id: rpc_types::RpcPublicKey(routing_info.module_public_key),
            });
        }
        Ok(gateways)
    }

    async fn get_recurringd_lnurl(&self, fed: &FederationV2) -> anyhow::Result<String> {
        fed.client
            .lnv2()?
            .generate_lnurl(
                FederationV2::get_recurringd_api_v2()?,
                fed.get_lnv2_gateway_override().await?,
            )
            .await
            .map_err(Into::into)
    }

    fn start_background_services(&self, fed: &FederationV2) {
        Self::spawn_lnurl_receives_consumer(fed);
    }

    fn version(&self) -> super::Version {
        super::Version::V2
    }
}
