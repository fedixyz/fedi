use anyhow::{Context, Result, anyhow, bail};
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use fedimint_lnv2_client::{
    FinalReceiveOperationState as LnV2FinalReceiveOperationState,
    FinalSendOperationState as LnV2FinalSendOperationState,
    LightningOperationMeta as LnV2OperationMeta, ReceiveOperationMeta as LnV2ReceiveOperationMeta,
    ReceiveOperationState as LnV2ReceiveOperationState, SendOperationMeta as LnV2SendOperationMeta,
    SendOperationState as LnV2SendOperationState,
};
use lightning_invoice::{Bolt11Invoice, RoutingFees};
use rpc_types::error::ErrorCode;
use rpc_types::{
    BaseMetadata, FrontendMetadata, LightningSendMetadata, RpcAmount, RpcFeeDetails,
    RpcLightningGateway, RpcLightningGatewayId, RpcPayInvoiceResponse, RpcPrevPayInvoiceResult,
    RpcTransactionDirection, RpcTransactionKind,
};
use tracing::{error, warn};

use super::{
    FeeRemittance, FeeRemittanceGatewayOverride, FeeRemittanceRoute, LnOps, Lnv2SendCreated,
};
use crate::federation_v2::client::ClientExt;
use crate::federation_v2::{
    FederationTransactionParts, FederationV2, FediFeeStream, get_max_spendable_amount,
};

pub struct LnOpsV2;

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
        _fed: &FederationV2,
        _invoice: &Bolt11Invoice,
    ) -> Result<RpcPrevPayInvoiceResult> {
        Ok(RpcPrevPayInvoiceResult { completed: false })
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
                    let final_state =
                        match lnv2.await_final_send_operation_state(operation_id).await {
                            Ok(s) => s,
                            Err(e) => {
                                warn!("lnv2 await_final_send failed: {e:?}");
                                return;
                            }
                        };
                    if !extra_meta.is_fedi_fee_remittance {
                        match final_state {
                            LnV2FinalSendOperationState::Success(_) => {
                                let _ = fed.write_success_send_fedi_fees(operation_id).await;
                            }
                            LnV2FinalSendOperationState::Refunded
                            | LnV2FinalSendOperationState::Failure => {
                                let _ = fed.write_failed_send_fedi_fees(operation_id).await;
                            }
                        }
                    }
                    fed.update_operation_state(operation_id, final_state).await;
                    if !extra_meta.is_fedi_fee_remittance {
                        fed.send_transaction_event(operation_id).await;
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
                    let final_state =
                        match lnv2.await_final_receive_operation_state(operation_id).await {
                            Ok(s) => s,
                            Err(e) => {
                                warn!("lnv2 await_final_receive failed: {e:?}");
                                return;
                            }
                        };
                    match final_state {
                        LnV2FinalReceiveOperationState::Claimed => {
                            let _ = fed
                                .write_success_receive_fedi_fees(operation_id, amount)
                                .await;
                        }
                        LnV2FinalReceiveOperationState::Expired
                        | LnV2FinalReceiveOperationState::Failure => {
                            let _ = fed.write_failed_receive_fedi_fees(operation_id).await;
                        }
                    }
                    fed.update_operation_state(operation_id, final_state).await;
                    fed.send_transaction_event(operation_id).await;
                });
            }
            // LNURL receive flows are driven by recurringd; no
            // per-op subscription wired in this prototype.
            LnV2OperationMeta::LnurlReceive(_) => {}
        }
    }

    async fn get_transaction(
        &self,
        _fed: &FederationV2,
        _operation_id: OperationId,
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
                let state = entry
                    .try_outcome::<LnV2SendOperationState>()
                    .ok()
                    .flatten()
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
                let state = entry
                    .try_outcome::<LnV2ReceiveOperationState>()
                    .ok()
                    .flatten()
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
            LnV2OperationMeta::LnurlReceive(_) => Ok(None),
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
                FederationV2::get_recurringd_api_v2(),
                fed.get_lnv2_gateway_override().await?,
            )
            .await
            .map_err(Into::into)
    }
}
