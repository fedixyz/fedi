mod v1;
mod v2;

use std::future::Future;

use anyhow::{Context, Result, bail};
use bitcoin::Network;
use bitcoin::address::NetworkUnchecked;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_client_module::transaction::{FeeQuote, FeeQuoteRequest, max_affordable_send_amount};
use fedimint_core::core::OperationId;
use fedimint_core::module::Amounts;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use rpc_types::error::ErrorCode;
use rpc_types::{
    FrontendMetadata, RpcAmount, RpcFeeDetails, RpcPayAddressLimits, RpcTransactionDirection,
};
pub use v1::WalletOpsV1;
pub use v2::WalletOpsV2;

use super::{FederationTransactionParts, FederationV2, FediFeeStream};

async fn funding_quote(fed: &FederationV2, amount: Amount, wallet_fee: Amount) -> Result<FeeQuote> {
    fed.client
        .fee_quote(
            OperationId::new_random(),
            FeeQuoteRequest {
                input_amount: Amounts::ZERO,
                output_amount: Amounts::new_bitcoin(amount),
                input_fee: Amounts::ZERO,
                output_fee: Amounts::new_bitcoin(wallet_fee),
            },
        )
        .await
}

async fn maximum_onchain_amount<Q, F>(
    balance: Amount,
    minimum: Amount,
    network_fee: Amount,
    fee_ppms: &[(FediFeeStream, u64)],
    funding_quote: Q,
) -> Amount
where
    Q: Fn(Amount) -> F,
    F: Future<Output = Result<FeeQuote>>,
{
    max_affordable_send_amount(
        balance,
        minimum,
        Amount::from_sats(balance.sats_round_down()),
        |amount| Amount::from_sats(amount.msats.div_ceil(1000)),
        |amount| {
            let fedi_fee = FederationV2::total_fedi_fee(amount, fee_ppms);
            let quote = funding_quote(amount + network_fee);
            async move {
                let mut quote = quote.await?;
                // the solver adds only the send amount itself, so every other charge goes
                // through the quote
                quote.output = quote
                    .output
                    .checked_add_bitcoin(network_fee + fedi_fee)
                    .context("Send fee overflow")?;
                Ok(quote)
            }
        },
    )
    .await
    .unwrap_or(Amount::ZERO)
}

async fn checked_funding_fee<Q, F>(
    balance: Amount,
    minimum: Amount,
    amount: Amount,
    network_fee: Amount,
    fee_ppms: &[(FediFeeStream, u64)],
    funding_quote: Q,
) -> Result<Amount>
where
    Q: Fn(Amount) -> F,
    F: Future<Output = Result<FeeQuote>>,
{
    if let Ok(quote) = funding_quote(amount + network_fee).await {
        let fee = quote.total().get_bitcoin();
        if amount + network_fee + FederationV2::total_fedi_fee(amount, fee_ppms) + fee <= balance {
            return Ok(fee);
        }
    }
    let maximum =
        maximum_onchain_amount(balance, minimum, network_fee, fee_ppms, funding_quote).await;
    bail!(ErrorCode::InsufficientBalance(RpcAmount(maximum)))
}

async fn onchain_send_limits<N, NF, M, Q, QF>(
    fed: &FederationV2,
    minimum: Amount,
    network_fee: N,
    module_fee: M,
    funding_quote: Q,
) -> Result<RpcPayAddressLimits>
where
    N: Fn(Amount) -> NF,
    NF: Future<Output = Result<Amount>>,
    M: Fn(Amount) -> Amount,
    Q: Fn(Amount) -> QF,
    QF: Future<Output = Result<FeeQuote>>,
{
    let fee_ppms = fed
        .get_fee_ppms_by_stream(fedimint_wallet_client::KIND, RpcTransactionDirection::Send)
        .await?;
    let balance = fed.get_balance().await;
    // fee estimation needs a concrete amount; use the full balance so the
    // estimate matches a max-size send
    let max_spendable = maximum_onchain_amount(
        balance,
        minimum,
        network_fee(balance).await?,
        &fee_ppms,
        &funding_quote,
    )
    .await;
    let minimum_network_fee = network_fee(minimum).await?;
    let minimum_quote = funding_quote(minimum + minimum_network_fee).await;
    let minimum_fees_exact = minimum_quote.is_ok();
    let federation_fee = match minimum_quote {
        Ok(quote) => quote.total().get_bitcoin(),
        Err(_) => module_fee(minimum + minimum_network_fee),
    };
    let fees_by_stream = fed
        .get_fee_amounts_by_stream(
            fedimint_wallet_client::KIND,
            RpcTransactionDirection::Send,
            minimum,
        )
        .await?;
    let minimum_total = minimum
        + minimum_network_fee
        + federation_fee
        + FederationV2::total_fedi_fee_amount(&fees_by_stream);
    // the maximum reserves the network fee quoted for the full balance, which can
    // exceed the fee quoted for the minimum
    let max_spendable = if minimum_fees_exact && minimum_total <= balance {
        max_spendable.max(minimum)
    } else {
        max_spendable
    };
    Ok(RpcPayAddressLimits {
        min_spendable: RpcAmount(minimum),
        max_spendable: RpcAmount(max_spendable),
        balance: RpcAmount(balance),
        minimum_fees: RpcFeeDetails {
            fedi_app_fee: RpcAmount(FederationV2::fedi_fee_amount_for_stream(
                &fees_by_stream,
                FediFeeStream::App,
            )),
            fedi_guardian_fee: RpcAmount(FederationV2::fedi_fee_amount_for_stream(
                &fees_by_stream,
                FediFeeStream::Guardian,
            )),
            network_fee: RpcAmount(minimum_network_fee),
            federation_fee: RpcAmount(federation_fee),
        },
        minimum_fees_exact,
    })
}

#[apply(async_trait_maybe_send!)]
pub trait WalletOps: MaybeSend + MaybeSync {
    /// Get the bitcoin network type this federation's wallet module is using
    fn get_network(&self, fed: &FederationV2) -> Option<Network>;

    /// Whether this federation supports the safe on-chain deposit flow, which
    /// is what gates offering an on-chain receive address in the app. Fallible
    /// because for some wallet versions answering means querying the
    /// federation.
    async fn supports_safe_deposit(&self, fed: &FederationV2) -> Result<bool>;

    /// Generate bitcoin address
    async fn generate_address(
        &self,
        fed: &FederationV2,
        frontend_meta: FrontendMetadata,
    ) -> Result<String>;

    async fn recheck_pegin_address(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
    ) -> Result<()>;

    /// Minimum and maximum spendable amounts for an onchain send to the given
    /// address. The minimum comes from the wallet module's dust policy, the
    /// maximum from the current balance minus estimated fees.
    async fn pay_address_limits(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<NetworkUnchecked>,
    ) -> Result<RpcPayAddressLimits>;

    /// Returns the fee details for making a payment on-chain.
    /// Returns an error in case the amount exceeds the max spendable amount.
    async fn preview_pay_address(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
    ) -> Result<RpcFeeDetails>;

    /// Pay an onchain address
    async fn pay_address(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
        frontend_meta: FrontendMetadata,
    ) -> Result<OperationId>;

    async fn subscribe_to_onchain_addresses(&self, fed: &FederationV2);

    async fn subscribe_pay_address(&self, fed: &FederationV2, op_id: OperationId) -> Result<()>;

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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn onchain_maximum_reserves_funding_and_each_fedi_fee() {
        let balance = Amount::from_sats(7_000);
        let maximum = maximum_onchain_amount(
            balance,
            Amount::from_sats(546),
            Amount::from_sats(100),
            &[(FediFeeStream::App, 2_100), (FediFeeStream::Guardian, 900)],
            |funded| async move {
                let funding_fee = Amount::from_msats(funded.msats / 100 + 1_234);
                anyhow::ensure!(funded + funding_fee <= balance, "Insufficient funds");
                Ok(FeeQuote {
                    input: Amounts::new_bitcoin(funding_fee),
                    ..FeeQuote::ZERO
                })
            },
        )
        .await;
        assert!(maximum >= Amount::from_sats(546));
        assert_eq!(maximum.msats % 1000, 0);
        let total = |amount: Amount| {
            let funded = amount + Amount::from_sats(100);
            amount.msats
                + 100_000
                + funded.msats / 100
                + 1_234
                + (amount.msats * 2_100).div_ceil(1_000_000)
                + (amount.msats * 900).div_ceil(1_000_000)
        };
        assert!(total(maximum) <= balance.msats);
        assert!(total(maximum + Amount::from_sats(1)) > balance.msats);
    }

    #[tokio::test]
    async fn onchain_maximum_requires_minimum_plus_fees() {
        for (minimum, network, funding) in [(10_000, 100, 0), (546, 7_000, 0), (546, 100, 7_000)] {
            let maximum = maximum_onchain_amount(
                Amount::from_sats(7_000),
                Amount::from_sats(minimum),
                Amount::from_sats(network),
                &[],
                |_| async {
                    Ok(FeeQuote {
                        input: Amounts::new_bitcoin(Amount::from_sats(funding)),
                        ..FeeQuote::ZERO
                    })
                },
            )
            .await;
            assert_eq!(maximum, Amount::ZERO);
        }
    }
}
