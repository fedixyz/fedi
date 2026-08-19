use anyhow::{Context, Result, anyhow, bail};
use bug_report::reused_ecash_proofs::SerializedReusedEcashProofs;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::base32::{FEDIMINT_PREFIX, decode_prefixed, encode_prefixed};
use fedimint_core::core::OperationId;
use fedimint_core::task::timeout;
use fedimint_core::{Amount, OutPointRange, apply, async_trait_maybe_send};
use fedimint_mintv2_client::{
    ECash as MintV2ECash, FinalReceiveOperationState as MintV2FinalReceiveOperationState,
    MintOperationMeta as MintV2OperationMeta,
};
use rpc_types::error::ErrorCode;
use rpc_types::{
    EcashReceiveMetadata, EcashReceiveReason, EcashSendMetadata, FrontendMetadata, RpcAmount,
    RpcGenerateEcashResponse, RpcOOBReissueState, RpcOOBSpendState, RpcOperationId,
    RpcTransactionDirection, RpcTransactionKind,
};
use tracing::warn;

use super::super::client::ClientExt;
use super::super::{
    FederationTransactionParts, FederationV2, REISSUE_ECASH_TIMEOUT, get_max_spendable_amount,
};
use super::MintOps;

pub struct MintOpsV2;

impl MintOpsV2 {
    /// Whether a receive that reached
    /// [`MintV2FinalReceiveOperationState::Success`] has credited the balance.
    ///
    /// Success only means the federation accepted the transaction; the balance
    /// credit is the change issuance that follows, driven by state machines
    /// that share the receive's operation id. The receive is settled once none
    /// of them is active anymore.
    async fn receive_settled(fed: &FederationV2, operation_id: OperationId) -> bool {
        !fed.client.has_active_states(operation_id).await
    }

    /// Spawns [`Self::drive_receive_to_completion`] unless a driver for this
    /// operation is already running, claimed through the shared in-flight
    /// set; the claim is released when the task ends. Both the live
    /// subscriber and the listing-triggered recovery route through here, so
    /// a history read during the other's bridge-finalization window cannot
    /// start a duplicate driver.
    async fn spawn_receive_driver(
        fed: &FederationV2,
        task_name: &'static str,
        operation_id: OperationId,
        amount: Amount,
        is_fee_exempt: bool,
        change_outpoint_range: OutPointRange,
    ) {
        fed.spawn_operation_subscriber(operation_id, task_name, move |fed| async move {
            MintOpsV2::drive_receive_to_completion(
                &fed,
                operation_id,
                amount,
                is_fee_exempt,
                change_outpoint_range,
            )
            .await;
        })
        .await;
    }

    /// Drives a receive to its terminal state: waits for settlement, finalizes
    /// the Fedi fee, and notifies listeners. The operation outcome is
    /// persisted along the way by outcome_or_updates inside
    /// await_final_receive_operation_state, so it is not also stashed in the
    /// in-memory map. Shared by the live subscriber and the lazy
    /// crash-recovery path in get_transaction; fee writes are idempotent, so
    /// overlapping calls are safe.
    async fn drive_receive_to_completion(
        fed: &FederationV2,
        operation_id: OperationId,
        amount: Amount,
        is_fee_exempt: bool,
        change_outpoint_range: OutPointRange,
    ) {
        let Ok(mintv2) = fed.client.mintv2() else {
            warn!("mintv2 module not available");
            return;
        };
        match mintv2
            .await_final_receive_operation_state(operation_id)
            .await
        {
            Ok(MintV2FinalReceiveOperationState::Success) => {
                // Wait for settlement so listeners see the new balance when
                // the event fires.
                Self::await_receive_settled(fed, operation_id, change_outpoint_range).await;
                if !is_fee_exempt {
                    let _ = fed
                        .write_success_receive_fedi_fees(operation_id, amount)
                        .await;
                }
            }
            Ok(MintV2FinalReceiveOperationState::Rejected) => {
                if !is_fee_exempt {
                    let _ = fed.write_failed_receive_fedi_fees(operation_id).await;
                }
            }
            Err(e) => {
                warn!("mintv2 await_final_receive failed: {e:?}");
                return;
            }
        }
        fed.send_transaction_event(operation_id).await;
    }

    /// Waits for a successful receive to settle per [`Self::receive_settled`].
    async fn await_receive_settled(
        fed: &FederationV2,
        operation_id: OperationId,
        change_outpoint_range: OutPointRange,
    ) {
        if let Err(e) = fed
            .client
            .await_primary_bitcoin_module_outputs(
                operation_id,
                change_outpoint_range.into_iter().collect(),
            )
            .await
        {
            warn!("mintv2 change issuance await failed: {e:?}");
        }
    }
}

#[apply(async_trait_maybe_send!)]
impl MintOps for MintOpsV2 {
    async fn get_raw_balance(&self, fed: &FederationV2) -> Amount {
        let mintv2 = fed
            .client
            .mintv2()
            .expect("mintv2 selected in FederationV2::new");
        mintv2
            .get_count_by_denomination()
            .await
            .into_iter()
            .map(|(denom, count)| Amount::from_msats(denom.amount().msats * count))
            .fold(Amount::ZERO, |acc, amount| acc + amount)
    }

    async fn receive_ecash(
        &self,
        fed: &FederationV2,
        ecash: String,
        frontend_meta: FrontendMetadata,
    ) -> Result<(Amount, OperationId)> {
        let mintv2 = fed.client.mintv2()?;
        let ecash: MintV2ECash = decode_prefixed(FEDIMINT_PREFIX, &ecash)?;
        let amount = ecash.amount();
        let fee_ppms = fed
            .get_fee_ppms_by_stream(fedimint_mint_client::KIND, RpcTransactionDirection::Receive)
            .await?;
        let custom_meta = serde_json::to_value(EcashReceiveMetadata {
            internal: false,
            reason: EcashReceiveReason::Receive,
            frontend_metadata: Some(frontend_meta),
        })?;
        let operation_id = mintv2.receive(ecash, custom_meta).await?;
        fed.write_pending_receive_fedi_fee_ppms(operation_id, &fee_ppms)
            .await?;
        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
        fed.subscribe_to_operation(operation_id).await?;
        Ok((amount, operation_id))
    }

    async fn subscribe_to_ecash_reissue(
        &self,
        _fed: &FederationV2,
        _operation_id: OperationId,
        _amount: Amount,
    ) -> Result<()> {
        Ok(())
    }

    async fn generate_ecash(
        &self,
        fed: &FederationV2,
        amount: Amount,
        include_invite: bool,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcGenerateEcashResponse> {
        let _guard = fed.generate_ecash_lock.lock().await;
        let mintv2 = fed.client.mintv2()?;
        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let total_fedi_fee_ppm = FederationV2::total_fedi_fee_ppm(
            &fed.get_fee_ppms_by_stream(fedimint_mint_client::KIND, RpcTransactionDirection::Send)
                .await?,
        );
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);
        let spend_guard = fed.spend_guard.lock().await;
        let virtual_balance = fed.get_balance().await;
        if amount + fedi_fee > virtual_balance {
            bail!(ErrorCode::InsufficientBalance(RpcAmount(
                get_max_spendable_amount(virtual_balance, total_fedi_fee_ppm, None, None)
            )));
        }
        let custom_meta = serde_json::to_value(EcashSendMetadata {
            internal: false,
            frontend_metadata: Some(frontend_meta),
        })?;
        // A send with exact denominations on hand is a pure local-db operation
        // (and must stay offline-capable, so no preflight ping here). One that
        // needs change first runs a consensus round with no internal timeout;
        // bound it so an unreachable federation cannot pin the federation-wide
        // spend guard indefinitely. v1 instead releases the guard around its
        // change round, but mintv2's send interleaves selection and
        // change-making behind one call, so bounding is what the bridge can do.
        let (operation_id, ecash) = timeout(
            REISSUE_ECASH_TIMEOUT,
            mintv2.send(amount, custom_meta, include_invite),
        )
        .await
        .context(ErrorCode::OfflineExactEcashFailed)??;
        let sent_amount = ecash.amount();
        let ecash = encode_prefixed(FEDIMINT_PREFIX, &ecash);
        let settled_fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
                sent_amount,
            )
            .await?;
        let settled_fedi_fee = FederationV2::total_fedi_fee_amount(&settled_fees_by_stream);
        fed.write_pending_send_fedi_fees(operation_id, &settled_fees_by_stream)
            .await?;
        fed.write_success_send_fedi_fees(operation_id).await?;
        // Virtual balance only reflects the send once its fees are written.
        drop(spend_guard);
        let _ = fed
            .record_tx_date_fiat_info(operation_id, sent_amount + settled_fedi_fee)
            .await;
        Ok(RpcGenerateEcashResponse {
            ecash,
            operation_id: RpcOperationId(operation_id),
        })
    }

    async fn cancel_ecash(&self, fed: &FederationV2, ecash: String) -> Result<()> {
        let mintv2 = fed.client.mintv2()?;
        let decoded: MintV2ECash = decode_prefixed(FEDIMINT_PREFIX, &ecash)?;
        let amount = decoded.amount();
        let custom_meta = serde_json::to_value(EcashReceiveMetadata {
            internal: false,
            reason: EcashReceiveReason::Cancel,
            frontend_metadata: None,
        })?;
        let operation_id = mintv2
            .receive(decoded, custom_meta)
            .await
            .context(ErrorCode::EcashCancelFailed)?;
        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
        let final_state = mintv2
            .await_final_receive_operation_state(operation_id)
            .await
            .context(ErrorCode::EcashCancelFailed)?;
        fed.send_transaction_event(operation_id).await;
        match final_state {
            MintV2FinalReceiveOperationState::Success => {}
            MintV2FinalReceiveOperationState::Rejected => {
                return Err(anyhow!(ErrorCode::EcashCancelFailed));
            }
        }
        Ok(())
    }

    async fn subscribe_oob_spend(&self, _fed: &FederationV2, _op_id: OperationId) -> Result<()> {
        Ok(())
    }

    async fn repair_wallet(&self, _fed: &FederationV2) -> Result<()> {
        // v2 mint has no repair concept; nothing to do.
        Ok(())
    }

    async fn had_reused_ecash(&self, _fed: &FederationV2) -> bool {
        false
    }

    async fn generate_reused_ecash_proofs(
        &self,
        _fed: &FederationV2,
    ) -> anyhow::Result<SerializedReusedEcashProofs> {
        // v2 mint has no reused-note concept.
        Ok(SerializedReusedEcashProofs {
            total_amount_msats: Amount::ZERO,
            reused_ecash_proofs: Vec::new(),
        })
    }

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    ) {
        match operation.meta::<MintV2OperationMeta>() {
            MintV2OperationMeta::Receive {
                ecash,
                change_outpoint_range,
                custom_meta,
            } => {
                if let Ok(decoded) = decode_prefixed::<MintV2ECash>(FEDIMINT_PREFIX, &ecash) {
                    let amount = decoded.amount();
                    let receive_meta = serde_json::from_value::<EcashReceiveMetadata>(custom_meta)
                        .unwrap_or(EcashReceiveMetadata {
                            internal: false,
                            reason: EcashReceiveReason::Receive,
                            frontend_metadata: None,
                        });
                    let is_fee_exempt =
                        receive_meta.internal || receive_meta.reason == EcashReceiveReason::Cancel;
                    MintOpsV2::spawn_receive_driver(
                        fed,
                        "subscribe mintv2 receive",
                        operation_id,
                        amount,
                        is_fee_exempt,
                        change_outpoint_range,
                    )
                    .await;
                }
            }
            // Send is terminal at creation time — notes are already
            // gone from the local db and the ECash blob is in the
            // user's hands. No state machine to subscribe to.
            MintV2OperationMeta::Send { .. } => {}
            // Reissue is the internal change-making path of Send;
            // it has no user-facing terminal state we expose today.
            MintV2OperationMeta::Reissue { .. } => {}
        }
    }

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>> {
        let mintv2_meta: MintV2OperationMeta = entry.meta();
        match mintv2_meta {
            MintV2OperationMeta::Send { ecash, custom_meta } => {
                let extra_meta = serde_json::from_value::<EcashSendMetadata>(custom_meta)
                    .unwrap_or(EcashSendMetadata {
                        internal: false,
                        frontend_metadata: None,
                    });
                if extra_meta.internal {
                    return Ok(None);
                }
                let amount = decode_prefixed::<MintV2ECash>(FEDIMINT_PREFIX, &ecash)
                    .map(|ecash| ecash.amount())
                    .unwrap_or(Amount::ZERO);
                // v2 Send is atomic: notes leave the local db immediately, so there is
                // no spend state machine to map onto. Report the send as Success and
                // surface the ecash string so the tx detail can reclaim or re-share it.
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(amount + Amount::from_msats(fedi_fee_msats)),
                    kind: RpcTransactionKind::OobSend {
                        state: Some(RpcOOBSpendState::Success),
                        oob_notes: Some(ecash),
                    },
                    frontend_metadata: extra_meta.frontend_metadata,
                }))
            }
            MintV2OperationMeta::Receive {
                ecash,
                custom_meta,
                change_outpoint_range,
            } => {
                let extra_meta = serde_json::from_value::<EcashReceiveMetadata>(custom_meta)
                    .unwrap_or(EcashReceiveMetadata {
                        internal: false,
                        reason: EcashReceiveReason::Receive,
                        frontend_metadata: None,
                    });
                if extra_meta.internal {
                    return Ok(None);
                }
                let amount = decode_prefixed::<MintV2ECash>(FEDIMINT_PREFIX, &ecash)
                    .map(|ecash| ecash.amount())
                    .unwrap_or(Amount::ZERO);
                // A missing outcome means the receive is still in flight: the
                // outcome is only persisted once terminal, and the subscribe
                // task (re-spawned on startup for active operations) persists
                // it. Report in-flight (and accepted-but-unsettled) as
                // Issuing; the frontend renders a missing state as failed.
                let outcome = entry
                    .try_outcome::<MintV2FinalReceiveOperationState>()
                    .ok()
                    .flatten();
                // The subscribe task persists the outcome and then finalizes
                // the bridge side (fee record, terminal event). A crash can
                // interrupt anywhere in that sequence: no outcome at all, or
                // an outcome with the fee record still pending. Either way no
                // one drives the operation anymore (startup only re-subscribes
                // active operations), so recover it from the listing through
                // the same path the live subscriber runs; the next listing
                // sees the finished state.
                let finalization_pending =
                    outcome.is_none() || fed.is_receive_fee_pending(operation_id).await;
                // The spawn claims the operation in the shared in-flight
                // set, deduplicating against overlapping listings and
                // against a live subscriber still in its finalization
                // window; the claim is released when the task ends so a
                // failed recovery can retry on a later listing.
                if finalization_pending && !fed.client.has_active_states(operation_id).await {
                    let is_fee_exempt =
                        extra_meta.internal || extra_meta.reason == EcashReceiveReason::Cancel;
                    MintOpsV2::spawn_receive_driver(
                        fed,
                        "recover mintv2 receive outcome",
                        operation_id,
                        amount,
                        is_fee_exempt,
                        change_outpoint_range,
                    )
                    .await;
                }
                let state = match outcome {
                    Some(MintV2FinalReceiveOperationState::Success) => {
                        if Self::receive_settled(fed, operation_id).await {
                            RpcOOBReissueState::Done
                        } else {
                            RpcOOBReissueState::Issuing
                        }
                    }
                    Some(MintV2FinalReceiveOperationState::Rejected) => {
                        RpcOOBReissueState::Failed {
                            error: "rejected by federation".into(),
                        }
                    }
                    None => RpcOOBReissueState::Issuing,
                };
                let state = Some(state);
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(amount),
                    kind: if extra_meta.reason == EcashReceiveReason::Cancel {
                        RpcTransactionKind::OobCancel { state }
                    } else {
                        RpcTransactionKind::OobReceive { state }
                    },
                    frontend_metadata: extra_meta.frontend_metadata,
                }))
            }
            // Internal change-making op — hide from the tx list.
            MintV2OperationMeta::Reissue { .. } => Ok(None),
        }
    }
}
