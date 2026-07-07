mod router;
mod v1;
mod v2;

use anyhow::Result;
use bitcoin::secp256k1::PublicKey;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::util::SafeUrl;
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use fedimint_ln_common::LightningGateway;
use lightning_invoice::Bolt11Invoice;
pub use router::LnOpsRouter;
use rpc_types::{
    FrontendMetadata, RpcFeeDetails, RpcLightningGateway, RpcPayInvoiceResponse,
    RpcPrevPayInvoiceResult,
};
pub use v1::LnOpsV1;
pub use v2::LnOpsV2;

use super::{FederationTransactionParts, FederationV2};

pub(crate) struct FeeRemittance {
    pub(crate) invoice_amount: Amount,
    route: FeeRemittanceRoute,
}

enum FeeRemittanceRoute {
    Lnv1 {
        gateway: Option<Box<LightningGateway>>,
    },
    Lnv2 {
        gateway: SafeUrl,
    },
}

#[derive(Clone)]
pub(crate) enum FeeRemittanceGatewayOverride {
    Lnv1 { pubkey: PublicKey },
    Lnv2 { url: SafeUrl },
}

#[derive(Debug)]
pub(crate) struct Lnv2SendCreated(pub anyhow::Error);

impl std::fmt::Display for Lnv2SendCreated {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

impl std::error::Error for Lnv2SendCreated {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.0.chain().nth(1)
    }
}

#[apply(async_trait_maybe_send!)]
pub trait LnOps: MaybeSend + MaybeSync {
    async fn generate_invoice(
        &self,
        fed: &FederationV2,
        amount: rpc_types::RpcAmount,
        description: String,
        expiry_time: Option<u64>,
        frontend_meta: FrontendMetadata,
    ) -> Result<Bolt11Invoice>;

    async fn estimate_ln_fees(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcFeeDetails>;

    async fn pay_invoice(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcPayInvoiceResponse>;

    async fn prepare_fee_remittance(
        &self,
        fed: &FederationV2,
        outstanding_fees_total: Amount,
        gateway_override: Option<FeeRemittanceGatewayOverride>,
    ) -> Result<FeeRemittance>;

    async fn pay_fee_remittance(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
        remittance: FeeRemittance,
    ) -> Result<RpcPayInvoiceResponse>;

    async fn get_prev_pay_invoice_result(
        &self,
        fed: &FederationV2,
        invoice: &Bolt11Invoice,
    ) -> Result<RpcPrevPayInvoiceResult>;

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    );

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>>;

    async fn list_gateways(&self, fed: &FederationV2) -> anyhow::Result<Vec<RpcLightningGateway>>;

    async fn get_recurringd_lnurl(&self, fed: &FederationV2) -> anyhow::Result<String>;
}
