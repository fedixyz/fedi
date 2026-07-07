use std::str::FromStr;
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use bug_report::reused_ecash_proofs::{self, SerializedReusedEcashProofs};
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::task::timeout;
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use fedimint_mint_client::{
    MintOperationMeta, MintOperationMetaVariant, OOBNotes, ReissueExternalNotesState,
    SelectNotesWithAtleastAmount, SelectNotesWithExactAmount, SpendOOBState,
    spendable_notes_to_operation_id,
};
use futures::StreamExt;
use rpc_types::error::ErrorCode;
use rpc_types::{
    EcashReceiveMetadata, EcashReceiveReason, EcashSendMetadata, FrontendMetadata, RpcAmount,
    RpcGenerateEcashResponse, RpcOperationId, RpcTransactionDirection, RpcTransactionKind,
};
use tracing::warn;

use super::super::client::ClientExt;
use super::super::{
    ECASH_INTERNAL_CHANGE_TIMEOUT_MAINNET, ECASH_INTERNAL_CHANGE_TIMEOUT_MUTINYNET,
    FederationTransactionParts, FederationV2, Network, REISSUE_ECASH_TIMEOUT,
    get_max_spendable_amount,
};
use super::MintOps;

pub struct MintOpsV1;

#[apply(async_trait_maybe_send!)]
impl MintOps for MintOpsV1 {
    async fn get_raw_balance(&self, fed: &FederationV2) -> Amount {
        let mint_client = fed
            .client
            .mint()
            .expect("mint selected in FederationV2::new");
        let mut dbtx = mint_client.db.begin_transaction_nc().await;
        mint_client
            .get_note_counts_by_denomination(&mut dbtx)
            .await
            .total_amount()
    }

    async fn receive_ecash(
        &self,
        fed: &FederationV2,
        ecash: String,
        frontend_meta: FrontendMetadata,
    ) -> Result<(Amount, OperationId)> {
        let ecash = OOBNotes::from_str(&ecash)?;
        let fee_ppms = fed
            .get_fee_ppms_by_stream(fedimint_mint_client::KIND, RpcTransactionDirection::Receive)
            .await?;
        let amount = ecash.total_amount();
        let operation_id = fed
            .client
            .mint()?
            .reissue_external_notes(
                ecash,
                EcashReceiveMetadata {
                    internal: false,
                    reason: EcashReceiveReason::Receive,
                    frontend_metadata: Some(frontend_meta),
                },
            )
            .await
            .context(ErrorCode::EcashAlreadySpent)?;
        fed.write_pending_receive_fedi_fee_ppms(operation_id, &fee_ppms)
            .await?;
        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
        fed.subscribe_to_operation(operation_id).await?;
        Ok((amount, operation_id))
    }

    async fn subscribe_to_ecash_reissue(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        amount: Amount,
    ) -> Result<()> {
        let op = fed
            .client
            .operation_log()
            .get_operation(operation_id)
            .await
            .context("operation not found")?;
        let meta = op.meta::<MintOperationMeta>();
        let receive_meta = serde_json::from_value::<EcashReceiveMetadata>(meta.extra_meta)
            .unwrap_or(EcashReceiveMetadata {
                internal: false,
                reason: EcashReceiveReason::Receive,
                frontend_metadata: None,
            });
        let is_fee_exempt =
            receive_meta.internal || receive_meta.reason == EcashReceiveReason::Cancel;
        let mut updates = fed
            .client
            .mint()?
            .subscribe_reissue_external_notes(operation_id)
            .await
            .unwrap()
            .into_stream();

        while let Some(update) = updates.next().await {
            fed.update_operation_state(operation_id, update.clone())
                .await;
            match update {
                ReissueExternalNotesState::Done => {
                    if !is_fee_exempt {
                        let _ = fed
                            .write_success_receive_fedi_fees(operation_id, amount)
                            .await;
                    }
                }
                ReissueExternalNotesState::Failed(_) => {
                    if !is_fee_exempt {
                        let _ = fed.write_failed_receive_fedi_fees(operation_id).await;
                    }
                }
                _ => (),
            }
            if !receive_meta.internal {
                fed.send_transaction_event(operation_id).await;
            }
            if let ReissueExternalNotesState::Failed(e) = update {
                updates.next().await;
                bail!(format!("Reissue failed: {e}"));
            }
        }
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
        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);
        let total_fedi_fee_ppm = FederationV2::total_fedi_fee_ppm(
            &fed.get_fee_ppms_by_stream(fedimint_mint_client::KIND, RpcTransactionDirection::Send)
                .await?,
        );

        let mint = fed.client.mint()?;

        // If generating EXACT amount works, use those notes. Otherwise, generate using
        // AT LEAST strategy, marking it as internal TX (so we can filter it out).
        // Immediately reissue the notes attempting to fill in lower denominations.
        // And then generate using AT LEAST strategy again, which
        // will now have a high chance to producing the exact amount.
        let internal_change_timeout = match fed.get_network() {
            Some(Network::Bitcoin) | None => ECASH_INTERNAL_CHANGE_TIMEOUT_MAINNET,
            _ => ECASH_INTERNAL_CHANGE_TIMEOUT_MUTINYNET,
        };
        let (spend_guard, operation_id, notes) = loop {
            let spend_guard = fed.spend_guard.lock().await;
            let virtual_balance = fed.get_balance().await;
            if amount + fedi_fee > virtual_balance {
                bail!(ErrorCode::InsufficientBalance(RpcAmount(
                    get_max_spendable_amount(virtual_balance, total_fedi_fee_ppm, None, None)
                )));
            }

            if let Ok((operation_id, notes)) = mint
                .spend_notes_with_selector(
                    &SelectNotesWithExactAmount,
                    amount,
                    None,
                    include_invite,
                    EcashSendMetadata {
                        internal: false,
                        frontend_metadata: Some(frontend_meta.clone()),
                    },
                )
                .await
            {
                assert_eq!(notes.total_amount(), amount);
                break (spend_guard, operation_id, notes);
            };

            // Essentially a ping to the guardian servers with the "ThresholdConsensus"
            // strategy. We do not want to proceed with selecting an excess
            // amount of notes (and reissuing them) if we can already determine
            // at this step that we don't have good connectivity.
            timeout(Duration::from_secs(10), fed.client.api().session_count())
                .await
                .map_err(anyhow::Error::from)
                .and_then(|inner| inner.map_err(anyhow::Error::from))
                .context(ErrorCode::OfflineExactEcashFailed)?;

            let (_, notes) = mint
                .spend_notes_with_selector(
                    &SelectNotesWithAtleastAmount,
                    amount,
                    Some(internal_change_timeout),
                    include_invite,
                    EcashSendMetadata {
                        internal: true,
                        frontend_metadata: None,
                    },
                )
                .await?;
            drop(spend_guard);

            // try to make change
            timeout(REISSUE_ECASH_TIMEOUT, async {
                let notes_amount = notes.total_amount();
                let operation_id = mint
                    .reissue_external_notes(
                        notes,
                        EcashReceiveMetadata {
                            internal: true,
                            reason: EcashReceiveReason::Receive,
                            frontend_metadata: None,
                        },
                    )
                    .await?;
                fed.subscribe_to_ecash_reissue(operation_id, notes_amount)
                    .await
            })
            .await
            .context("Failed to select notes with correct amount")??;
            // and retry
        };

        fed.write_pending_send_fedi_fees(operation_id, &fees_by_stream)
            .await?;
        // spend_guard must be dropped after writing fee since virtual balance only
        // updates once fee is written
        drop(spend_guard);

        let _ = fed
            .record_tx_date_fiat_info(operation_id, amount + fedi_fee)
            .await;
        fed.subscribe_to_operation(operation_id).await?;

        Ok(RpcGenerateEcashResponse {
            ecash: notes.to_string(),
            operation_id: RpcOperationId(operation_id),
        })
    }

    async fn cancel_ecash(&self, fed: &FederationV2, ecash: String) -> Result<()> {
        let ecash = OOBNotes::from_str(&ecash)?;
        let op_id = spendable_notes_to_operation_id(ecash.notes());
        let mint = fed.client.mint()?;

        let use_legacy_cancel = fed
            .client
            .operation_log()
            .get_operation(op_id)
            .await
            .map(|op| match op.meta::<MintOperationMeta>().variant {
                MintOperationMetaVariant::SpendOOB { no_timeout, .. } => !no_timeout,
                MintOperationMetaVariant::Reissuance { .. } => false,
            })
            .unwrap_or(false);

        if use_legacy_cancel {
            // Legacy timed sends still have a Fedimint auto-refund state machine.
            // Keep using it so in-flight pre-fedi5 ecash can be canceled/reclaimed.
            mint.try_cancel_spend_notes(op_id).await;
            fed.subscribe_oob_spend(op_id).await?;
            return Ok(());
        }

        let amount = ecash.total_amount();
        let operation_id = mint
            .reissue_external_notes(
                ecash,
                EcashReceiveMetadata {
                    internal: false,
                    reason: EcashReceiveReason::Cancel,
                    frontend_metadata: None,
                },
            )
            .await
            .context(ErrorCode::EcashCancelFailed)?;
        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
        fed.subscribe_to_ecash_reissue(operation_id, amount).await?;
        Ok(())
    }

    async fn subscribe_oob_spend(&self, fed: &FederationV2, op_id: OperationId) -> Result<()> {
        let mut updates = fed
            .client
            .mint()?
            .subscribe_spend_notes(op_id)
            .await?
            .into_stream();
        let mut err = None;
        while let Some(update) = updates.next().await {
            fed.update_operation_state(op_id, update.clone()).await;
            // From the fedi fee perspective, "UserCanceledSuccess" and "Refunded"
            // states indicate that fee should be refunded since the generated ecash was
            // never used by the recipient. So we'll mark those two states
            // as "failed sends". On the other hand, "UserCanceledFailure" and "Success"
            // states indicate that e-cash was reissued by another recipient, so we'll mark
            // those two states as "successful sends". We don't really care
            // about other states for the purpose of fedi fee.
            match update {
                SpendOOBState::UserCanceledSuccess | SpendOOBState::Refunded => {
                    let _ = fed.write_failed_send_fedi_fees(op_id).await;
                }
                SpendOOBState::UserCanceledFailure | SpendOOBState::Success => {
                    let _ = fed.write_success_send_fedi_fees(op_id).await;
                }
                _ => (),
            }
            match update {
                // TODO: intermediate states
                SpendOOBState::Created => {}
                SpendOOBState::UserCanceledProcessing => {}
                SpendOOBState::UserCanceledSuccess => {}
                SpendOOBState::Success => {}
                SpendOOBState::Refunded => {}
                SpendOOBState::UserCanceledFailure => {
                    err = Some(anyhow!(ErrorCode::EcashCancelFailed));
                }
            }
        }

        if let Some(err) = err {
            return Err(err);
        }
        Ok(())
    }

    async fn repair_wallet(&self, fed: &FederationV2) -> Result<()> {
        let mint = fed.client.mint()?;
        mint.try_repair_wallet(100).await?;
        Ok(())
    }

    async fn had_reused_ecash(&self, fed: &FederationV2) -> bool {
        let Ok(mint) = fed.client.mint() else {
            return false;
        };
        !mint.reused_note_secrets().await.is_empty()
    }

    async fn generate_reused_ecash_proofs(
        &self,
        fed: &FederationV2,
    ) -> anyhow::Result<SerializedReusedEcashProofs> {
        reused_ecash_proofs::generate(&*fed.client.mint()?).await
    }

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    ) {
        match operation.meta::<MintOperationMeta>().variant {
            MintOperationMetaVariant::SpendOOB { .. } => {
                fed.spawn_cancellable("subscribe_oob_spend", move |fed| async move {
                    if let Err(e) = fed.subscribe_oob_spend(operation_id).await {
                        warn!("subscribe_oob_spend error: {e:?}");
                    }
                });
            }
            MintOperationMetaVariant::Reissuance { .. } => {
                let amount = operation.meta::<MintOperationMeta>().amount;
                fed.spawn_cancellable("subscribe_to_ecash_reissue", move |fed| async move {
                    if let Err(e) = fed.subscribe_to_ecash_reissue(operation_id, amount).await {
                        warn!("subscribe_to_ecash_reissue error: {e:?}");
                    }
                });
            }
        }
    }

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>> {
        let mint_meta: MintOperationMeta = entry.meta();
        match mint_meta.variant {
            MintOperationMetaVariant::Reissuance { .. } => {
                let extra_meta = serde_json::from_value::<EcashReceiveMetadata>(
                    mint_meta.extra_meta,
                )
                .unwrap_or(EcashReceiveMetadata {
                    internal: false,
                    reason: EcashReceiveReason::Receive,
                    frontend_metadata: None,
                });
                if extra_meta.internal {
                    return Ok(None);
                }
                let state = fed
                    .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                        fed.client
                            .mint()?
                            .subscribe_reissue_external_notes(op_id)
                            .await
                    })
                    .await?
                    .map(ReissueExternalNotesState::into);
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(mint_meta.amount),
                    kind: if extra_meta.reason == EcashReceiveReason::Cancel {
                        RpcTransactionKind::OobCancel { state }
                    } else {
                        RpcTransactionKind::OobReceive { state }
                    },
                    frontend_metadata: extra_meta.frontend_metadata,
                }))
            }
            MintOperationMetaVariant::SpendOOB {
                requested_amount,
                oob_notes,
                ..
            } => {
                let extra_meta = serde_json::from_value::<EcashSendMetadata>(mint_meta.extra_meta)
                    .unwrap_or(EcashSendMetadata {
                        internal: false,
                        frontend_metadata: None,
                    });
                if extra_meta.internal {
                    return Ok(None);
                }
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(requested_amount + Amount::from_msats(fedi_fee_msats)),
                    kind: RpcTransactionKind::OobSend {
                        state: fed
                            .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                                fed.client.mint()?.subscribe_spend_notes(op_id).await
                            })
                            .await?
                            .map(SpendOOBState::into),
                        // No-timeout v1 sends have no auto-refund state
                        // machine, so history must preserve the reclaim blob.
                        oob_notes: Some(oob_notes.to_string()),
                    },
                    frontend_metadata: extra_meta.frontend_metadata,
                }))
            }
        }
    }
}
