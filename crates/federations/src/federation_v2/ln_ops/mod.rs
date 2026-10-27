mod v1;
mod v2;

use std::future::Future;

use anyhow::{Context, Result};
use bitcoin::secp256k1::PublicKey;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_client_module::transaction::{FeeQuote, max_affordable_send_amount};
use fedimint_core::core::OperationId;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::util::SafeUrl;
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use fedimint_ln_common::LightningGateway;
use lightning_invoice::{Bolt11Invoice, RoutingFees};
use rpc_types::{
    FrontendMetadata, RpcFeeDetails, RpcLightningGateway, RpcPayInvoiceResponse,
    RpcPrevPayInvoiceResult,
};
pub use v1::LnOpsV1;
pub use v2::LnOpsV2;

use super::{FederationTransactionParts, FederationV2, FediFeeStream};

fn gateway_fee_estimate(fees: RoutingFees, amount: Amount) -> Amount {
    Amount::from_msats(
        u64::from(fees.base_msat)
            + (amount.msats * u64::from(fees.proportional_millionths))
                .div_ceil(runtime::constants::MILLION),
    )
}

async fn maximum_invoice_amount<G, Q, F>(
    balance: Amount,
    fee_ppms: &[(FediFeeStream, u64)],
    gateway_fee: G,
    funding_quote: Q,
) -> Amount
where
    G: Fn(Amount) -> Amount,
    Q: Fn(Amount) -> F,
    F: Future<Output = Result<FeeQuote>>,
{
    max_affordable_send_amount(
        balance,
        Amount::from_sats(1),
        Amount::from_sats(balance.sats_round_down()),
        |amount| Amount::from_sats(amount.msats.div_ceil(1000)),
        |amount| {
            let gateway_fee = gateway_fee(amount);
            let fedi_fee = FederationV2::total_fedi_fee(amount, fee_ppms);
            let quote = funding_quote(amount + gateway_fee);
            async move {
                let mut quote = quote.await?;
                // the solver adds only the invoice amount itself, so every other charge goes
                // through the quote
                quote.output = quote
                    .output
                    .checked_add_bitcoin(gateway_fee + fedi_fee)
                    .context("Send fee overflow")?;
                Ok(quote)
            }
        },
    )
    .await
    .unwrap_or(Amount::ZERO)
}

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

    async fn max_pay_invoice_amount(&self, fed: &FederationV2) -> Result<Amount>;

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

    /// Spawns whatever long-running services this lightning version needs.
    ///
    /// Called once from `start_background_tasks`. The default is nothing:
    /// v1's recurringd poller predates this hook and stays where it is, in
    /// `lnurl_receives_service`.
    fn start_background_services(&self, _fed: &FederationV2) {}

    fn version(&self) -> Version;
}

#[derive(Debug, Copy, Clone)]
pub enum Version {
    V1,
    V2,
}

#[cfg(test)]
mod tests {
    use fedimint_core::module::Amounts;

    use super::*;

    #[tokio::test]
    async fn lnurl_max_reserves_all_send_fees() -> Result<()> {
        let balance = Amount::from_sats(4914);
        let gateway_fee =
            |amount: Amount| Amount::from_msats(2000 + (amount.msats * 5000).div_ceil(1_000_000));
        let fee_ppms = [(FediFeeStream::App, 0), (FediFeeStream::Guardian, 10_000)];
        let maximum = maximum_invoice_amount(balance, &fee_ppms, gateway_fee, |contract| {
            assert!(contract >= Amount::from_sats(1));
            std::future::ready(Ok(FeeQuote {
                input: Amounts::new_bitcoin(Amount::from_msats(101)),
                output: Amounts::new_bitcoin(Amount::from_msats(202)),
                dust: Amounts::new_bitcoin(Amount::from_msats(3)),
            }))
        })
        .await;
        assert_eq!(maximum, Amount::from_sats(4839));
        let debit = |amount: Amount| {
            amount
                + gateway_fee(amount)
                + Amount::from_msats((amount.msats * 10_000).div_ceil(1_000_000) + 306)
        };
        assert!(debit(maximum) <= balance);
        assert!(debit(maximum + Amount::from_sats(1)) > balance);
        Ok(())
    }

    #[tokio::test]
    async fn lnurl_max_over_several_gateways_fits_the_dearest_one() -> Result<()> {
        let balance = Amount::from_sats(4914);
        let fee_ppms = [(FediFeeStream::App, 10_000)];
        let cheap =
            |amount: Amount| Amount::from_msats(1000 + (amount.msats * 1000).div_ceil(1_000_000));
        let dear =
            |amount: Amount| Amount::from_msats(2000 + (amount.msats * 5000).div_ceil(1_000_000));
        let quote = |_: Amount| {
            std::future::ready(Ok(FeeQuote {
                input: Amounts::ZERO,
                output: Amounts::ZERO,
                dust: Amounts::ZERO,
            }))
        };
        let via_cheap = maximum_invoice_amount(balance, &fee_ppms, cheap, quote).await;
        let via_dear = maximum_invoice_amount(balance, &fee_ppms, dear, quote).await;
        let via_both = maximum_invoice_amount(
            balance,
            &fee_ppms,
            |amount| cheap(amount).max(dear(amount)),
            quote,
        )
        .await;
        assert!(via_dear < via_cheap);
        assert_eq!(via_both, via_dear);
        Ok(())
    }

    #[tokio::test]
    async fn lnurl_max_reduces_candidates_that_cannot_fund_mint_fees() -> Result<()> {
        let balance = Amount::from_msats(4_762_000);
        let maximum = maximum_invoice_amount(
            balance,
            &[],
            |_| Amount::ZERO,
            |contract| {
                std::future::ready(if contract + Amount::from_msats(7720) > balance {
                    Err(anyhow::anyhow!("Insufficient balance for mint fees"))
                } else {
                    Ok(FeeQuote {
                        input: Amounts::new_bitcoin(Amount::from_msats(7720)),
                        output: Amounts::ZERO,
                        dust: Amounts::ZERO,
                    })
                })
            },
        )
        .await;
        assert_eq!(maximum, Amount::from_sats(4754));
        Ok(())
    }

    #[tokio::test]
    async fn lnurl_max_rounds_each_fedi_stream_separately() -> Result<()> {
        let maximum = maximum_invoice_amount(
            Amount::from_msats(1001),
            &[(FediFeeStream::App, 1), (FediFeeStream::Guardian, 1)],
            |_| Amount::ZERO,
            |_| {
                std::future::ready(Ok(FeeQuote {
                    input: Amounts::ZERO,
                    output: Amounts::ZERO,
                    dust: Amounts::ZERO,
                }))
            },
        )
        .await;
        assert_eq!(maximum, Amount::ZERO);
        Ok(())
    }

    #[tokio::test]
    async fn lnurl_max_does_not_offer_unfundable_amounts() -> Result<()> {
        let maximum = maximum_invoice_amount(
            Amount::from_sats(4914),
            &[],
            |_| Amount::ZERO,
            |_| std::future::ready(Err(anyhow::anyhow!("Funding quote unavailable"))),
        )
        .await;
        assert_eq!(maximum, Amount::ZERO);
        Ok(())
    }
}
