use anyhow::{Context, Result, anyhow, bail};
use bitcoin::hex::DisplayHex;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use fedimint_ln_client::{
    InternalPayState, LightningOperationMeta, LightningOperationMetaPay,
    LightningOperationMetaVariant, LnPayState, LnReceiveState, OutgoingLightningPayment, PayType,
};
use fedimint_ln_common::config::FeeToAmount;
use futures::StreamExt;
use lightning_invoice::{Bolt11Invoice, RoutingFees};
use rpc_types::error::ErrorCode;
use rpc_types::{
    BaseMetadata, FrontendMetadata, LightningSendMetadata, RpcAmount, RpcFeeDetails,
    RpcLightningGateway, RpcLightningGatewayId, RpcPayInvoiceResponse, RpcPrevPayInvoiceResult,
    RpcTransactionDirection, RpcTransactionKind,
};
use tracing::{error, info, warn};

use super::{FeeRemittance, FeeRemittanceGatewayOverride, FeeRemittanceRoute, LnOps};
use crate::federation_v2::client::ClientExt;
use crate::federation_v2::{
    FederationTransactionParts, FederationV2, FediFeeStream, GatewayPayError, display_currency,
    get_max_spendable_amount, handle_pay_bolt11_invoice_error, internal_pay_is_bad_state,
    internal_pay_update_sanitized_log, invoice_has_internal_payment_markers,
    invoice_routes_back_to_federation, is_gateway_availability_error, ln_pay_update_sanitized_log,
    ln_receive_update_sanitized_log, log_update, zero_gateway_fees,
};

pub struct LnOpsV1;

fn fee_remittance_invoice_amount(
    outstanding_fees_total: Amount,
    gateway_fees: RoutingFees,
) -> Result<Amount> {
    let amt_to_request_numerator = runtime::constants::MILLION
        * outstanding_fees_total
            .msats
            .checked_sub(gateway_fees.base_msat as u64)
            .ok_or(anyhow!("Accrued fee < base gateway fees!"))?;
    let amt_to_request_denominator =
        runtime::constants::MILLION + gateway_fees.proportional_millionths as u64;
    Ok(Amount::from_msats(
        amt_to_request_numerator / amt_to_request_denominator,
    ))
}

impl LnOpsV1 {
    async fn subscribe_invoice(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        invoice: Bolt11Invoice,
    ) -> Result<()> {
        fed.spawn_cancellable("subscribe invoice", move |fed| async move {
            let Ok(ln) = fed.client.ln() else {
                error!("Lightning module not found!");
                return;
            };
            let Ok(updates) = ln.subscribe_ln_receive(operation_id).await else {
                error!("Lightning operation with ID {:?} not found!", operation_id);
                return;
            };
            let mut updates = updates.into_stream();
            while let Some(update) = updates.next().await {
                log_update!(
                    fed.runtime,
                    update,
                    "Received lightning invoice update",
                    ln_receive_update_sanitized_log(&update)
                );
                fed.update_operation_state(operation_id, update.clone())
                    .await;
                match update {
                    LnReceiveState::Claimed => {
                        let amount = Amount {
                            msats: invoice.amount_milli_satoshis().unwrap(),
                        };
                        fed.write_success_receive_fedi_fees(operation_id, amount)
                            .await
                            .ok();
                        fed.send_transaction_event(operation_id).await;
                    }
                    LnReceiveState::Canceled { reason } => {
                        let _ = fed.write_failed_receive_fedi_fees(operation_id).await;
                        // FIXME: handle this
                        error!("Failed to claim incoming contract: {reason}");
                    }
                    _ => {}
                }
            }
        });
        Ok(())
    }

    pub(crate) async fn subscribe_to_ln_pay(
        &self,
        fed: &FederationV2,
        pay_type: PayType,
        extra_meta: LightningSendMetadata,
    ) -> Result<RpcPayInvoiceResponse> {
        let ln = fed.client.ln()?;
        match pay_type {
            PayType::Internal(operation_id) => {
                let mut updates = ln.subscribe_internal_pay(operation_id).await?.into_stream();

                while let Some(update) = updates.next().await {
                    // Skip updating fee status if payment is for fee remittance
                    if !extra_meta.is_fedi_fee_remittance {
                        match update {
                            InternalPayState::Preimage(_) => {
                                let _ = fed.write_success_send_fedi_fees(operation_id).await;
                            }
                            InternalPayState::Funding => (),
                            _ => {
                                let _ = fed.write_failed_send_fedi_fees(operation_id).await;
                            }
                        }
                    }
                    match update {
                        InternalPayState::Preimage(preimage) => {
                            updates.next().await;
                            return Ok(RpcPayInvoiceResponse {
                                // FIXME: is this correct serialization?
                                preimage: hex::encode(preimage.0),
                            });
                        }
                        InternalPayState::RefundSuccess { .. } => {
                            updates.next().await;
                            bail!("Internal lightning payment failed, got refund");
                        }
                        InternalPayState::RefundError { .. } => {
                            updates.next().await;
                            bail!("Internal lightning payment failed, didn't get refund");
                        }
                        InternalPayState::FundingFailed { .. } => {
                            updates.next().await;
                            bail!("Failed to fund internal lightning payment");
                        }
                        InternalPayState::UnexpectedError(e) => {
                            updates.next().await;
                            bail!(e);
                        }
                        _ => {}
                    }

                    log_update!(
                        fed.runtime,
                        update,
                        "Received internal lightning payment update",
                        internal_pay_update_sanitized_log(&update)
                    );
                }
                Err(anyhow!("Internal lightning payment failed"))
            }
            PayType::Lightning(operation_id) => {
                let mut updates = ln.subscribe_ln_pay(operation_id).await?.into_stream();
                while let Some(update) = updates.next().await {
                    fed.update_operation_state(operation_id, update.clone())
                        .await;
                    // Skip updating fee status if payment is for fee remittance
                    if !extra_meta.is_fedi_fee_remittance {
                        match update {
                            LnPayState::Success { .. } => {
                                let _ = fed.write_success_send_fedi_fees(operation_id).await;
                            }
                            LnPayState::Refunded { .. }
                            | LnPayState::Canceled
                            | LnPayState::UnexpectedError { .. } => {
                                let _ = fed.write_failed_send_fedi_fees(operation_id).await;
                            }
                            _ => (),
                        }
                    }
                    match update {
                        LnPayState::Success { preimage } => {
                            updates.next().await;
                            return Ok(RpcPayInvoiceResponse { preimage });
                        }
                        LnPayState::Refunded { .. } => {
                            // TODO: better error message
                            updates.next().await;
                            bail!("Lightning payment failed, got refund")
                        }
                        LnPayState::Canceled => {
                            updates.next().await;
                            // FIXME: is this right?
                            bail!("Lightning payment failed, got refund")
                        }
                        LnPayState::UnexpectedError { error_message } => {
                            updates.next().await;
                            bail!(error_message)
                        }
                        _ => {}
                    }

                    log_update!(
                        fed.runtime,
                        update,
                        "Received lightning payment update",
                        ln_pay_update_sanitized_log(&update)
                    );
                }
                Err(anyhow!("lightning payment failed"))
            }
        }
    }
}

#[apply(async_trait_maybe_send!)]
impl LnOps for LnOpsV1 {
    async fn generate_invoice(
        &self,
        fed: &FederationV2,
        amount: RpcAmount,
        description: String,
        expiry_time: Option<u64>,
        frontend_meta: FrontendMetadata,
    ) -> Result<Bolt11Invoice> {
        // some apps have issues paying invoices that are in msats
        // so round up amount to nearest sat
        let amount = Amount::from_sats(amount.0.msats.div_ceil(1000));
        let fee_ppms = fed
            .get_fee_ppms_by_stream(fedimint_ln_common::KIND, RpcTransactionDirection::Receive)
            .await?;
        let gateway = fed.select_gateway().await?;
        let (operation_id, invoice, _) = fed
            .client
            .ln()?
            .create_bolt11_invoice(
                amount,
                lightning_invoice::Bolt11InvoiceDescription::Direct(
                    lightning_invoice::Description::new(description)?,
                ),
                expiry_time,
                BaseMetadata::from(frontend_meta),
                gateway,
            )
            .await?;

        fed.write_pending_receive_fedi_fee_ppms(operation_id, &fee_ppms)
            .await?;
        let _ = fed.record_tx_date_fiat_info(operation_id, amount).await;
        self.subscribe_invoice(fed, operation_id, invoice.clone())
            .await?;

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

        // Fedi app fee applies regardless of internal/external payment
        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let fedi_app_fee =
            FederationV2::fedi_fee_amount_for_stream(&fees_by_stream, FediFeeStream::App);
        let fedi_guardian_fee =
            FederationV2::fedi_fee_amount_for_stream(&fees_by_stream, FediFeeStream::Guardian);

        // Logic inside the if statement below is currently copied from
        // fedimint-ln-client to determine when the destination of a lightning invoice
        // is within the current federation so that we know to show a 0 gateway fee.
        let mut is_internal_payment = false;
        if let Ok(markers) = fed.client.get_internal_payment_markers() {
            is_internal_payment = invoice_has_internal_payment_markers(invoice, markers);
            if !is_internal_payment {
                let gateways = fed
                    .client
                    .ln()?
                    .list_gateways()
                    .await
                    .into_iter()
                    .map(|g| g.info)
                    .collect::<Vec<_>>();
                is_internal_payment = invoice_routes_back_to_federation(invoice, gateways);
            }
        }

        let network_fee = if is_internal_payment {
            RpcAmount(Amount::ZERO)
        } else {
            // External payments have a non-0 gateway fee in addition to Fedi app fee
            let gateway = fed
                .select_gateway()
                .await?
                .context("No gateway available")?;
            let gateway_fees = gateway.fees;
            RpcAmount(gateway_fees.to_amount(&amount))
        };

        Ok(RpcFeeDetails {
            fedi_app_fee: RpcAmount(fedi_app_fee),
            fedi_guardian_fee: RpcAmount(fedi_guardian_fee),
            network_fee,
            federation_fee: RpcAmount(Amount::ZERO),
        })
    }

    async fn pay_invoice(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcPayInvoiceResponse> {
        // Has an amount
        let amount_msat = invoice
            .amount_milli_satoshis()
            .ok_or(anyhow!("Invoice missing amount"))?;
        let amount = Amount::from_msats(amount_msat);

        // Same network
        let federation_network = fed
            .get_network()
            .context("federation is still recovering")?;
        if federation_network != invoice.network() {
            bail!(format!(
                "Invoice is for wrong network. Expected {}, got {}",
                federation_network,
                display_currency(invoice.currency())
            ))
        }

        let fee_ppms = fed
            .get_fee_ppms_by_stream(fedimint_ln_common::KIND, RpcTransactionDirection::Send)
            .await?;
        let fees_by_stream = fed
            .get_fee_amounts_by_stream(
                fedimint_ln_common::KIND,
                RpcTransactionDirection::Send,
                amount,
            )
            .await?;
        let fedi_fee = FederationV2::total_fedi_fee_amount(&fees_by_stream);

        let gateway = fed.select_gateway().await?;
        let spend_guard = fed.spend_guard.lock().await;
        let virtual_balance = fed.get_balance().await;
        let ensure_spendable = |gateway_fees: RoutingFees| -> Result<u64> {
            let network_fee = gateway_fees.base_msat as u64
                + (amount.msats * gateway_fees.proportional_millionths as u64)
                    .div_ceil(runtime::constants::MILLION);
            let est_total_spend = amount.msats + fedi_fee.msats + network_fee;
            if est_total_spend > virtual_balance.msats {
                bail!(ErrorCode::InsufficientBalance(RpcAmount(
                    get_max_spendable_amount(
                        virtual_balance,
                        FederationV2::total_fedi_fee_ppm(&fee_ppms),
                        None,
                        Some(gateway_fees),
                    )
                )));
            }
            Ok(est_total_spend)
        };
        let mut est_total_spend =
            ensure_spendable(gateway.as_ref().map_or_else(zero_gateway_fees, |g| g.fees))?;

        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: false,
            frontend_metadata: Some(frontend_meta),
        };
        let ln = fed.client.ln()?;
        let pay_result = ln
            .pay_bolt11_invoice(gateway.clone(), invoice.to_owned(), extra_meta.clone())
            .await;
        let selected_gateway_id = gateway.as_ref().map(|g| g.gateway_id);
        let OutgoingLightningPayment { payment_type, .. } = match (pay_result, selected_gateway_id)
        {
            (Ok(v), _) => v,
            (Err(error), Some(failed_gateway_id)) if is_gateway_availability_error(&error) => {
                warn!(
                    ?error,
                    failed_gateway_id = ?failed_gateway_id,
                    "selected lightning gateway unavailable, refreshing gateway cache and retrying"
                );
                let retry_gateway = fed
                    .refresh_cache_and_select_gateway_excluding(Some(failed_gateway_id))
                    .await?
                    .ok_or_else(|| anyhow!(ErrorCode::NoLnGatewayAvailable))?;
                est_total_spend = ensure_spendable(retry_gateway.fees)?;
                let retry_gateway_id = retry_gateway.gateway_id;

                match ln
                    .pay_bolt11_invoice(Some(retry_gateway), invoice.to_owned(), extra_meta.clone())
                    .await
                {
                    Ok(v) => v,
                    Err(error) if is_gateway_availability_error(&error) => {
                        warn!(
                            ?error,
                            failed_gateway_id = ?failed_gateway_id,
                            retry_gateway_id = ?retry_gateway_id,
                            "retry lightning gateway unavailable"
                        );
                        bail!(ErrorCode::NoLnGatewayAvailable);
                    }
                    Err(error) => handle_pay_bolt11_invoice_error(error)?,
                }
            }
            (Err(error), _) => handle_pay_bolt11_invoice_error(error)?,
        };
        // already paid
        if fed
            .client
            .operation_log()
            .get_operation(payment_type.operation_id())
            .await
            .is_some_and(|o| o.outcome::<crate::federation_v2::PayState>().is_some())
        {
            bail!(ErrorCode::PayLnInvoiceAlreadyPaid);
        }

        fed.write_pending_send_fedi_fees(payment_type.operation_id(), &fees_by_stream)
            .await?;
        drop(spend_guard);

        let _ = fed
            .record_tx_date_fiat_info(
                payment_type.operation_id(),
                Amount::from_msats(est_total_spend),
            )
            .await;
        self.subscribe_to_ln_pay(fed, payment_type, extra_meta)
            .await
    }

    async fn prepare_fee_remittance(
        &self,
        fed: &FederationV2,
        outstanding_fees_total: Amount,
        gateway_override: Option<FeeRemittanceGatewayOverride>,
    ) -> Result<FeeRemittance> {
        let gateway_override = match gateway_override {
            Some(FeeRemittanceGatewayOverride::Lnv1 { pubkey }) => Some(pubkey),
            Some(FeeRemittanceGatewayOverride::Lnv2 { .. }) => {
                bail!("lnv1 cannot prepare lnv2 fee remittance");
            }
            None => None,
        };
        let gateway = fed.select_gateway_with_override(gateway_override).await?;
        let gateway_fees = gateway.as_ref().map_or_else(zero_gateway_fees, |g| g.fees);
        Ok(FeeRemittance {
            invoice_amount: fee_remittance_invoice_amount(outstanding_fees_total, gateway_fees)?,
            route: FeeRemittanceRoute::Lnv1 {
                gateway: gateway.map(Box::new),
            },
        })
    }

    async fn pay_fee_remittance(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        remittance: FeeRemittance,
    ) -> Result<RpcPayInvoiceResponse> {
        let FeeRemittanceRoute::Lnv1 { gateway } = remittance.route else {
            bail!("lnv1 cannot pay lnv2 fee remittance");
        };
        let gateway = gateway.map(|gateway| *gateway);
        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: true,
            frontend_metadata: None,
        };
        let OutgoingLightningPayment { payment_type, .. } = fed
            .client
            .ln()?
            .pay_bolt11_invoice(gateway, invoice.to_owned(), extra_meta.clone())
            .await?;

        self.subscribe_to_ln_pay(fed, payment_type, extra_meta)
            .await
    }

    async fn get_prev_pay_invoice_result(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcPrevPayInvoiceResult> {
        let ln = &fed.client.ln()?;
        let payment_result = ln
            .get_prev_payment_result(
                invoice.payment_hash(),
                &mut ln.db.begin_transaction_nc().await,
            )
            .await;
        Ok(RpcPrevPayInvoiceResult {
            completed: payment_result.completed_payment.is_some(),
        })
    }

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    ) {
        match operation.meta() {
            LightningOperationMeta {
                variant: LightningOperationMetaVariant::Pay(pay_meta),
                extra_meta,
            } => {
                let extra_meta = serde_json::from_value::<LightningSendMetadata>(extra_meta)
                    .unwrap_or(LightningSendMetadata {
                        is_fedi_fee_remittance: false,
                        frontend_metadata: None,
                    });
                // HACK: our code accidentally subscribed using wrong function in past.
                if pay_meta.is_internal_payment
                    && operation
                        .outcome::<serde_json::Value>()
                        .is_some_and(internal_pay_is_bad_state)
                {
                    return;
                }
                fed.spawn_cancellable("subscribe_to_ln_pay", move |fed| async move {
                    // FIXME: what happens if it fails?
                    if let Err(e) = LnOpsV1
                        .subscribe_to_ln_pay(
                            &fed,
                            if pay_meta.is_internal_payment {
                                PayType::Internal(operation_id)
                            } else {
                                PayType::Lightning(operation_id)
                            },
                            extra_meta,
                        )
                        .await
                    {
                        warn!("subscribe_to_ln_pay error: {e:?}")
                    }
                });
            }
            LightningOperationMeta {
                variant:
                    LightningOperationMetaVariant::Receive { invoice, .. }
                    | LightningOperationMetaVariant::ReceiveReclaim { invoice, .. },
                ..
            } => {
                fed.spawn_cancellable("subscribe_to_ln_receive", move |fed| async move {
                    // FIXME: what happens if it fails?
                    if let Err(e) = LnOpsV1.subscribe_invoice(&fed, operation_id, invoice).await {
                        warn!("subscribe_to_ln_receive error: {e:?}")
                    }
                });
            }
            LightningOperationMeta {
                variant: LightningOperationMetaVariant::RecurringPaymentReceive { .. },
                ..
            } => {
                // Recurring receives are handled by the
                // lnurl_receive_service
            }
            #[allow(deprecated)]
            LightningOperationMeta {
                variant: LightningOperationMetaVariant::Claim { .. },
                ..
            } => unreachable!("claims and recurring payments are not supported"),
        }
    }

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>> {
        let lightning_meta: LightningOperationMeta = entry.try_meta()?;
        match lightning_meta.variant {
            LightningOperationMetaVariant::Pay(LightningOperationMetaPay {
                invoice,
                fee,
                is_internal_payment,
                ..
            }) => {
                let extra_meta =
                    serde_json::from_value::<LightningSendMetadata>(lightning_meta.extra_meta)
                        .unwrap_or(LightningSendMetadata {
                            is_fedi_fee_remittance: false,
                            frontend_metadata: None,
                        });

                if extra_meta.is_fedi_fee_remittance {
                    return Ok(None);
                }

                let state = if is_internal_payment {
                    entry
                        .try_outcome::<InternalPayState>()
                        .inspect_err(|e| info!(%e, "Found bad internal pay TX"))?;
                    fed.get_client_operation_outcome(operation_id, entry, |op_id| async move {
                        fed.client.ln()?.subscribe_internal_pay(op_id).await
                    })
                    .await?
                    .map(|internal_pay_state| match internal_pay_state {
                        InternalPayState::Funding => LnPayState::Created,
                        InternalPayState::Preimage(preimage) => LnPayState::Success {
                            preimage: preimage.0.to_lower_hex_string(),
                        },
                        InternalPayState::RefundSuccess { error, .. } => LnPayState::Refunded {
                            gateway_error: GatewayPayError::GatewayInternalError {
                                error_code: None,
                                error_message: error.to_string(),
                            },
                        },
                        InternalPayState::RefundError { error_message, .. } => {
                            LnPayState::UnexpectedError { error_message }
                        }
                        InternalPayState::FundingFailed { .. } => LnPayState::Canceled,
                        InternalPayState::UnexpectedError(error_message) => {
                            LnPayState::UnexpectedError { error_message }
                        }
                    })
                } else {
                    entry
                        .try_outcome::<LnPayState>()
                        .inspect_err(|e| info!(%e, "Found bad LN Pay TX"))?;
                    fed.get_client_operation_outcome(operation_id, entry, |op_id| async move {
                        fed.client.ln()?.subscribe_ln_pay(op_id).await
                    })
                    .await?
                };

                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(Amount {
                        msats: invoice.amount_milli_satoshis().unwrap()
                            + fedi_fee_msats
                            + fee.msats,
                    }),
                    frontend_metadata: extra_meta.frontend_metadata,
                    kind: RpcTransactionKind::LnPay {
                        ln_invoice: invoice.to_string(),
                        lightning_fees: RpcAmount(fee),
                        state: state.map(Into::into),
                    },
                }))
            }
            LightningOperationMetaVariant::Receive { invoice, .. }
            | LightningOperationMetaVariant::ReceiveReclaim { invoice, .. } => {
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(Amount {
                        msats: invoice.amount_milli_satoshis().unwrap(),
                    }),
                    frontend_metadata: serde_json::from_value::<BaseMetadata>(
                        lightning_meta.extra_meta,
                    )
                    .unwrap_or_default()
                    .into(),
                    kind: RpcTransactionKind::LnReceive {
                        ln_invoice: invoice.to_string(),
                        state: fed
                            .get_client_operation_outcome(operation_id, entry, |op_id| async move {
                                fed.client.ln()?.subscribe_ln_receive(op_id).await
                            })
                            .await?
                            .map(Into::into),
                    },
                }))
            }
            LightningOperationMetaVariant::RecurringPaymentReceive(payment) => {
                let fed_id = fed.federation_id().to_string();
                let fed_joined_secs_since_epoch = fed
                    .runtime
                    .app_state
                    .with_read_lock(|state| {
                        state
                            .joined_federations
                            .get(&fed_id)
                            .and_then(|info| info.join_timestamp_secs_since_epoch)
                    })
                    .await;
                if let Some(fed_joined_secs_since_epoch) = fed_joined_secs_since_epoch
                    && payment
                        .invoice
                        .would_expire(std::time::Duration::from_secs(fed_joined_secs_since_epoch))
                {
                    return Ok(None);
                }
                let state = fed
                    .get_client_operation_outcome_cached::<LnReceiveState>(operation_id, entry)
                    .await?;
                Ok(Some(FederationTransactionParts {
                    amount: RpcAmount(Amount {
                        msats: payment.invoice.amount_milli_satoshis().unwrap(),
                    }),
                    frontend_metadata: None,
                    kind: RpcTransactionKind::LnRecurringdReceive {
                        state: state.map(Into::into),
                    },
                }))
            }
            #[allow(deprecated)]
            LightningOperationMetaVariant::Claim { .. } => {
                unreachable!("claims and recurring payments are not supported")
            }
        }
    }

    async fn list_gateways(&self, fed: &FederationV2) -> anyhow::Result<Vec<RpcLightningGateway>> {
        let gateways = fed.client.ln()?.list_gateways().await;
        Ok(gateways
            .into_iter()
            .map(|gw| RpcLightningGateway {
                id: RpcLightningGatewayId::Lnv1 {
                    pubkey: rpc_types::RpcPublicKey(gw.info.gateway_id),
                },
                api: gw.info.api.to_string(),
                node_pub_key: rpc_types::RpcPublicKey(gw.info.node_pub_key),
                gateway_id: rpc_types::RpcPublicKey(gw.info.gateway_id),
            })
            .collect())
    }

    async fn get_recurringd_lnurl(&self, fed: &FederationV2) -> anyhow::Result<String> {
        let recurringd_api = fed
            .get_recurringd_api_v1()
            .await
            .context(ErrorCode::RecurringdMetaNotFound)?;
        let ln = fed.client.ln()?;
        if let Some(payment_code) = ln
            .list_recurring_payment_codes()
            .await
            .into_values()
            .find(|x| x.recurringd_api == recurringd_api)
        {
            return Ok(payment_code.code);
        }

        let payment_code = ln
            .register_recurring_payment_code(
                fedimint_ln_client::recurring::RecurringPaymentProtocol::LNURL,
                recurringd_api,
                "[[\"text/plain\", \"\"]]",
            )
            .await?;

        Ok(payment_code.code)
    }
}
