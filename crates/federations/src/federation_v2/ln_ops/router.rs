use anyhow::Result;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use fedimint_lnv2_client::SendPaymentError;
use lightning_invoice::Bolt11Invoice;
use rpc_types::{
    FrontendMetadata, RpcFeeDetails, RpcLightningGateway, RpcLightningGatewayId,
    RpcPayInvoiceResponse, RpcPrevPayInvoiceResult,
};
use tracing::warn;

use super::{
    FeeRemittance, FeeRemittanceGatewayOverride, FeeRemittanceRoute, LnOps, LnOpsV1, LnOpsV2,
    Lnv2SendCreated,
};
use crate::federation_v2::client::ClientExt;
use crate::federation_v2::{FederationTransactionParts, FederationV2};

pub struct LnOpsRouter;

#[apply(async_trait_maybe_send!)]
impl LnOps for LnOpsRouter {
    async fn generate_invoice(
        &self,
        fed: &FederationV2,
        amount: rpc_types::RpcAmount,
        description: String,
        expiry_time: Option<u64>,
        frontend_meta: FrontendMetadata,
    ) -> Result<Bolt11Invoice> {
        match fed.get_gateway_override().await? {
            Some(RpcLightningGatewayId::Lnv1 { .. }) => {
                return LnOpsV1
                    .generate_invoice(fed, amount, description, expiry_time, frontend_meta)
                    .await;
            }
            Some(RpcLightningGatewayId::Lnv2 { .. }) => {
                return LnOpsV2
                    .generate_invoice(fed, amount, description, expiry_time, frontend_meta)
                    .await;
            }
            None => {}
        }

        if fed.client.lnv2().is_ok() {
            match LnOpsV2
                .generate_invoice(
                    fed,
                    amount,
                    description.clone(),
                    expiry_time,
                    frontend_meta.clone(),
                )
                .await
            {
                Ok(invoice) => return Ok(invoice),
                Err(e) => {
                    // No funds at risk on the receive path; if v1 lightning
                    // is also present, fall back to it.
                    if fed.client.ln().is_err() {
                        return Err(e);
                    }
                    warn!("lnv2.receive failed, falling back to v1 lightning: {e}");
                    // fall through to v1 below
                }
            }
        }
        LnOpsV1
            .generate_invoice(fed, amount, description, expiry_time, frontend_meta)
            .await
    }

    async fn estimate_ln_fees(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcFeeDetails> {
        match fed.get_gateway_override().await? {
            Some(RpcLightningGatewayId::Lnv1 { .. }) => {
                return LnOpsV1.estimate_ln_fees(fed, invoice).await;
            }
            Some(RpcLightningGatewayId::Lnv2 { .. }) => {
                return LnOpsV2.estimate_ln_fees(fed, invoice).await;
            }
            None => {}
        }

        if let Ok(lnv2) = fed.client.lnv2() {
            // Quote the real gateway fee the same way lnv2.send does: select
            // the gateway for this invoice, read its RoutingInfo, and derive
            // the send fee (base + ppm). This is the fee that gets added to
            // the outgoing contract at pay time, so the estimate matches the
            // actual debit.
            match lnv2.select_gateway(Some(invoice.clone())).await {
                Ok(_) => return LnOpsV2.estimate_ln_fees(fed, invoice).await,
                // No v2 gateway to quote. If v1 lightning is also loaded, the
                // pay path falls back to v1 and charges the v1 gateway fee, so
                // fall through to the v1 estimate below to keep quote == debit.
                // Otherwise there's no v1 to fall back to: best-effort v2
                // estimate with a zero network fee.
                Err(e) if fed.client.ln().is_ok() => {
                    warn!("lnv2 has no gateway for fee estimate, falling back to v1: {e}");
                }
                Err(e) => {
                    warn!("lnv2 select_gateway for fee estimate failed, no v1 fallback: {e}");
                    let amount = fedimint_core::Amount::from_msats(
                        invoice
                            .amount_milli_satoshis()
                            .ok_or(anyhow::anyhow!("Invoice missing amount"))?,
                    );
                    let fees_by_stream = fed
                        .get_fee_amounts_by_stream(
                            fedimint_ln_common::KIND,
                            rpc_types::RpcTransactionDirection::Send,
                            amount,
                        )
                        .await?;
                    return Ok(RpcFeeDetails {
                        fedi_app_fee: rpc_types::RpcAmount(
                            FederationV2::fedi_fee_amount_for_stream(
                                &fees_by_stream,
                                crate::federation_v2::FediFeeStream::App,
                            ),
                        ),
                        fedi_guardian_fee: rpc_types::RpcAmount(
                            FederationV2::fedi_fee_amount_for_stream(
                                &fees_by_stream,
                                crate::federation_v2::FediFeeStream::Guardian,
                            ),
                        ),
                        network_fee: rpc_types::RpcAmount(fedimint_core::Amount::ZERO),
                        federation_fee: rpc_types::RpcAmount(fedimint_core::Amount::ZERO),
                    });
                }
            }
        }
        LnOpsV1.estimate_ln_fees(fed, invoice).await
    }

    async fn pay_invoice(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcPayInvoiceResponse> {
        match fed.get_gateway_override().await? {
            Some(RpcLightningGatewayId::Lnv1 { .. }) => {
                return LnOpsV1.pay_invoice(fed, invoice, frontend_meta).await;
            }
            Some(RpcLightningGatewayId::Lnv2 { .. }) => {
                return LnOpsV2.pay_invoice(fed, invoice, frontend_meta).await;
            }
            None => {}
        }

        if fed.client.lnv2().is_ok() {
            match LnOpsV2
                .pay_invoice(fed, invoice, frontend_meta.clone())
                .await
            {
                Ok(response) => return Ok(response),
                // v2 already has (or had) a payment for this invoice — falling
                // back to v1 would risk double-paying. Surface the failure.
                Err(e) => {
                    if e.downcast_ref::<Lnv2SendCreated>().is_some()
                        || matches!(
                            e.downcast_ref::<SendPaymentError>(),
                            Some(
                                SendPaymentError::PaymentInProgress(_)
                                    | SendPaymentError::InvoiceAlreadyPaid(_)
                            )
                        )
                    {
                        return Err(e);
                    }
                    // v2 setup failed pre-submit; no funds at risk. Fall back
                    // to v1 if it's also present on this federation.
                    if fed.client.ln().is_err() {
                        return Err(e);
                    }
                    warn!("lnv2.send failed, falling back to v1 lightning: {e}");
                }
            }
        }
        LnOpsV1.pay_invoice(fed, invoice, frontend_meta).await
    }

    async fn prepare_fee_remittance(
        &self,
        fed: &FederationV2,
        outstanding_fees_total: Amount,
        gateway_override: Option<FeeRemittanceGatewayOverride>,
    ) -> Result<FeeRemittance> {
        match gateway_override.clone() {
            Some(FeeRemittanceGatewayOverride::Lnv1 { .. }) => {
                return LnOpsV1
                    .prepare_fee_remittance(fed, outstanding_fees_total, gateway_override)
                    .await;
            }
            Some(FeeRemittanceGatewayOverride::Lnv2 { .. }) => {
                return LnOpsV2
                    .prepare_fee_remittance(fed, outstanding_fees_total, gateway_override)
                    .await;
            }
            None => {}
        }

        if fed.client.lnv2().is_ok() {
            match LnOpsV2
                .prepare_fee_remittance(fed, outstanding_fees_total, None)
                .await
            {
                Ok(remittance) => return Ok(remittance),
                Err(e) => {
                    if fed.client.ln().is_err() {
                        return Err(e);
                    }
                    warn!("lnv2 fee-remittance quote failed, falling back to v1 lightning: {e}");
                }
            }
        }
        LnOpsV1
            .prepare_fee_remittance(fed, outstanding_fees_total, None)
            .await
    }

    async fn pay_fee_remittance(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        remittance: FeeRemittance,
    ) -> Result<RpcPayInvoiceResponse> {
        match &remittance.route {
            FeeRemittanceRoute::Lnv1 { .. } => {
                LnOpsV1.pay_fee_remittance(fed, invoice, remittance).await
            }
            FeeRemittanceRoute::Lnv2 { .. } => {
                LnOpsV2.pay_fee_remittance(fed, invoice, remittance).await
            }
        }
    }

    async fn get_prev_pay_invoice_result(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcPrevPayInvoiceResult> {
        match fed.get_gateway_override().await? {
            Some(RpcLightningGatewayId::Lnv1 { .. }) => {
                return LnOpsV1.get_prev_pay_invoice_result(fed, invoice).await;
            }
            Some(RpcLightningGatewayId::Lnv2 { .. }) => {
                return LnOpsV2.get_prev_pay_invoice_result(fed, invoice).await;
            }
            None => {}
        }

        if fed.client.lnv2().is_ok() {
            if fed.client.ln().is_ok() {
                let v1_result = LnOpsV1.get_prev_pay_invoice_result(fed, invoice).await?;
                if v1_result.completed {
                    return Ok(v1_result);
                }
            }
            // lnv2 has no cached prev-payment-result. Its duplicate-payment
            // guard inside send() handles re-submission of v2 payments safely.
            return Ok(RpcPrevPayInvoiceResult { completed: false });
        }
        LnOpsV1.get_prev_pay_invoice_result(fed, invoice).await
    }

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    ) {
        match operation.operation_module_kind() {
            runtime::constants::LIGHTNING_OPERATION_TYPE => {
                LnOpsV1
                    .subscribe_operation(fed, operation_id, operation)
                    .await
            }
            runtime::constants::LIGHTNINGV2_OPERATION_TYPE => {
                LnOpsV2
                    .subscribe_operation(fed, operation_id, operation)
                    .await
            }
            _ => {}
        }
    }

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>> {
        match entry.operation_module_kind() {
            runtime::constants::LIGHTNING_OPERATION_TYPE => {
                LnOpsV1
                    .get_transaction(fed, operation_id, entry, fedi_fee_msats)
                    .await
            }
            runtime::constants::LIGHTNINGV2_OPERATION_TYPE => {
                LnOpsV2
                    .get_transaction(fed, operation_id, entry, fedi_fee_msats)
                    .await
            }
            _ => Ok(None),
        }
    }

    async fn list_gateways(&self, fed: &FederationV2) -> anyhow::Result<Vec<RpcLightningGateway>> {
        // Returns the union of v2 + v1 gateways when both modules are
        // present — the frontend uses this as a "can we do lightning at
        // all" guard before payInvoice, and on federations that have lnv2
        // loaded but only v1 gateways registered we still need to surface
        // the v1 set so the actual payment dispatch (which falls back to
        // v1) gets to run.
        let mut out = Vec::new();
        if fed.client.lnv2().is_ok() {
            out.extend(LnOpsV2.list_gateways(fed).await?);
        }
        if fed.client.ln().is_ok() {
            out.extend(LnOpsV1.list_gateways(fed).await?);
        }
        Ok(out)
    }

    async fn get_recurringd_lnurl(&self, fed: &FederationV2) -> anyhow::Result<String> {
        match fed.get_gateway_override().await? {
            Some(RpcLightningGatewayId::Lnv1 { .. }) => {
                return LnOpsV1.get_recurringd_lnurl(fed).await;
            }
            Some(RpcLightningGatewayId::Lnv2 { .. }) => {
                return LnOpsV2.get_recurringd_lnurl(fed).await;
            }
            None => {}
        }

        if fed.client.lnv2().is_ok() {
            match LnOpsV2.get_recurringd_lnurl(fed).await {
                Ok(lnurl) => return Ok(lnurl),
                Err(e) => {
                    // Fall back to v1 only if v1 has a real recurringd
                    // URL configured — the v2 default is v1-incompatible.
                    if fed.client.ln().is_err() || fed.get_recurringd_api_v1().await.is_none() {
                        return Err(e);
                    }
                    warn!("lnv2.generate_lnurl failed, falling back to v1 lightning: {e}");
                    // fall through to v1 below
                }
            }
        }
        LnOpsV1.get_recurringd_lnurl(fed).await
    }
}
