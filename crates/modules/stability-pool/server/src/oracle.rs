use std::fmt::Debug;
use std::time::Duration;

use anyhow::{anyhow, bail};
use async_trait::async_trait;
use futures::future::join_all;
use itertools::Itertools;
use reqwest::{Client, Url};
use stability_pool_common::FiatAmount;
use tracing::{info, warn};

const MAX_ORACLE_RESPONSE_LOG_LEN: usize = 2048;

fn truncate_oracle_response(response: &str) -> String {
    let mut chars = response.chars();
    let truncated = chars
        .by_ref()
        .take(MAX_ORACLE_RESPONSE_LOG_LEN)
        .collect::<String>();

    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

#[async_trait]
pub trait Oracle: Sync + Send + Debug {
    // Returns current price in FiatAmount
    async fn get_price(&self) -> anyhow::Result<FiatAmount>;
}

#[derive(Debug)]
pub struct MockOracle {
    price_inner: Option<FiatAmount>,
}

#[async_trait]
impl Oracle for MockOracle {
    async fn get_price(&self) -> anyhow::Result<FiatAmount> {
        self.price_inner
            .ok_or(anyhow!("Price currently unavailable"))
    }
}

impl Default for MockOracle {
    fn default() -> Self {
        MockOracle {
            price_inner: Some(FiatAmount(10_000 * 100)), // 10k dollars in cents
        }
    }
}

impl MockOracle {
    pub fn new() -> MockOracle {
        Default::default()
    }

    pub fn clear_price(&mut self) {
        self.price_inner = None;
    }

    /// Sets a new price that's returned from future
    /// calls to `get_price()`.
    pub fn set_new_price(&mut self, new_price: FiatAmount) {
        self.price_inner = Some(new_price)
    }
}

pub trait RemotePriceSource: Debug + Send + Sync {
    fn name(&self) -> &'static str;

    fn get_url(&self) -> Url;

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount>;
}

#[derive(Debug)]
struct CexIoAPI;

impl RemotePriceSource for CexIoAPI {
    fn name(&self) -> &'static str {
        "cex.io"
    }

    fn get_url(&self) -> Url {
        "https://cex.io/api/ticker/BTC/USD"
            .parse()
            .expect("cex.io API url must be valid")
    }

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount> {
        let float_price = json_value
            .as_object()
            .ok_or(anyhow!("Couldn't transform json value into object"))?
            .get("last")
            .ok_or(anyhow!("Couldn't find key: last inside root object"))?
            .as_str()
            .ok_or(anyhow!("Couldn't read value for key: last as string"))?
            .parse::<f64>()?;

        // Convert to whole number of cents
        Ok(FiatAmount((float_price * 100.0) as u64))
    }
}

#[derive(Debug)]
struct YadioIoAPI;

impl RemotePriceSource for YadioIoAPI {
    fn name(&self) -> &'static str {
        "yadio.io"
    }

    fn get_url(&self) -> Url {
        "https://api.yadio.io/convert/1/BTC/USD"
            .parse()
            .expect("yadio.io API url must be valid")
    }

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount> {
        let float_price = json_value
            .as_object()
            .ok_or(anyhow!("Couldn't transform json value into object"))?
            .get("rate")
            .ok_or(anyhow!("Couldn't find key: rate at root level"))?
            .as_f64()
            .ok_or(anyhow!("Couldn't read value for key: rate as f64"))?;

        // Convert to whole number of cents
        Ok(FiatAmount((float_price * 100.0) as u64))
    }
}

#[derive(Debug)]
struct BitstampNetAPI;

impl RemotePriceSource for BitstampNetAPI {
    fn name(&self) -> &'static str {
        "bitstamp.net"
    }

    fn get_url(&self) -> Url {
        "https://www.bitstamp.net/api/v2/ticker/btcusd"
            .parse()
            .expect("bitstamp.net API url must be valid")
    }

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount> {
        let float_price = json_value
            .as_object()
            .ok_or(anyhow!("Couldn't transform json value into object"))?
            .get("last")
            .ok_or(anyhow!("Couldn't find key: last at root level"))?
            .as_str()
            .ok_or(anyhow!("Couldn't read value for key: last as string"))?
            .parse::<f64>()?;

        // Convert to whole number of cents
        Ok(FiatAmount((float_price * 100.0) as u64))
    }
}

#[derive(Debug)]
struct KrakenAPI;

impl RemotePriceSource for KrakenAPI {
    fn name(&self) -> &'static str {
        "kraken.com"
    }

    fn get_url(&self) -> Url {
        "https://api.kraken.com/0/public/Ticker?pair=XBTUSD"
            .parse()
            .expect("kraken API url must be valid")
    }

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount> {
        let float_price = json_value
            .as_object()
            .ok_or(anyhow!("Couldn't transform json value into object"))?
            .get("result")
            .ok_or(anyhow!("Couldn't find key: result inside root object"))?
            .as_object()
            .ok_or(anyhow!("Couldn't transform result into object"))?
            .values()
            .next()
            .ok_or(anyhow!("Couldn't find ticker data inside result"))?
            .as_object()
            .ok_or(anyhow!("Couldn't transform ticker data into object"))?
            .get("c")
            .ok_or(anyhow!("Couldn't find key: c inside ticker data"))?
            .as_array()
            .ok_or(anyhow!("Couldn't read value for key: c as array"))?
            .first()
            .ok_or(anyhow!("Couldn't find last trade price inside c array"))?
            .as_str()
            .ok_or(anyhow!("Couldn't read last trade price as string"))?
            .parse::<f64>()?;

        // Convert to whole number of cents
        Ok(FiatAmount((float_price * 100.0) as u64))
    }
}

#[derive(Debug)]
struct CoinbaseAPI;

impl RemotePriceSource for CoinbaseAPI {
    fn name(&self) -> &'static str {
        "coinbase.com"
    }

    fn get_url(&self) -> Url {
        "https://api.exchange.coinbase.com/products/BTC-USD/ticker"
            .parse()
            .expect("coinbase API url must be valid")
    }

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount> {
        let float_price = json_value
            .as_object()
            .ok_or(anyhow!("Couldn't transform json value into object"))?
            .get("price")
            .ok_or(anyhow!("Couldn't find key: price inside root object"))?
            .as_str()
            .ok_or(anyhow!("Couldn't read value for key: price as string"))?
            .parse::<f64>()?;

        // Convert to whole number of cents
        Ok(FiatAmount((float_price * 100.0) as u64))
    }
}

#[derive(Debug)]
struct GeminiAPI;

impl RemotePriceSource for GeminiAPI {
    fn name(&self) -> &'static str {
        "gemini.com"
    }

    fn get_url(&self) -> Url {
        "https://api.gemini.com/v1/pubticker/btcusd"
            .parse()
            .expect("gemini API url must be valid")
    }

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount> {
        let float_price = json_value
            .as_object()
            .ok_or(anyhow!("Couldn't transform json value into object"))?
            .get("last")
            .ok_or(anyhow!("Couldn't find key: last inside root object"))?
            .as_str()
            .ok_or(anyhow!("Couldn't read value for key: last as string"))?
            .parse::<f64>()?;

        // Convert to whole number of cents
        Ok(FiatAmount((float_price * 100.0) as u64))
    }
}

#[derive(Debug)]
pub struct AggregateOracle {
    client: Client,
    sources: Vec<Box<dyn RemotePriceSource>>,
}

impl AggregateOracle {
    pub fn new_with_default_sources() -> AggregateOracle {
        let sources: Vec<Box<dyn RemotePriceSource>> = vec![
            Box::new(CexIoAPI),
            Box::new(YadioIoAPI),
            Box::new(BitstampNetAPI),
            Box::new(KrakenAPI),
            Box::new(CoinbaseAPI),
            Box::new(GeminiAPI),
        ];
        AggregateOracle {
            client: Client::new(),
            sources,
        }
    }
}

#[async_trait]
impl Oracle for AggregateOracle {
    async fn get_price(&self) -> anyhow::Result<FiatAmount> {
        info!("began fetching prices from oracle sources");
        let source_prices = join_all(self.sources.iter().map(|source| async move {
            let response = match self
                .client
                .clone()
                .get(source.get_url())
                .timeout(Duration::from_secs(15))
                .send()
                .await
            {
                Ok(response) => response,
                Err(e) => {
                    warn!(source = source.name(), "oracle source request error: {e}");
                    return None;
                }
            };

            let status = response.status();
            let response_body = match response.text().await {
                Ok(response_body) => response_body,
                Err(e) => {
                    warn!(
                        source = source.name(),
                        "oracle source response body error: {e}"
                    );
                    return None;
                }
            };

            if !status.is_success() {
                warn!(
                    source = source.name(),
                    %status,
                    response = %truncate_oracle_response(&response_body),
                    "oracle source returned HTTP error response"
                );
                return None;
            }

            let json_value = match serde_json::from_str::<serde_json::Value>(&response_body) {
                Ok(json_value) => json_value,
                Err(e) => {
                    warn!(
                        source = source.name(),
                        response = %truncate_oracle_response(&response_body),
                        "oracle source JSON parse error: {e}"
                    );
                    return None;
                }
            };

            Some((response_body, json_value))
        }))
        .await
        .into_iter()
        .enumerate()
        .filter_map(|(i, oracle_result)| match oracle_result {
            Some((response_body, json_value)) => {
                match self.sources[i].extract_price_from_json_value(json_value) {
                    Ok(FiatAmount(0)) => {
                        warn!(
                            source = self.sources[i].name(),
                            "oracle source returned zero price"
                        );
                        None
                    }
                    Ok(price) => {
                        info!(
                            source = self.sources[i].name(),
                            price = price.0,
                            "oracle source returned price"
                        );
                        Some(price)
                    }
                    Err(e) => {
                        warn!(
                            source = self.sources[i].name(),
                            response = %truncate_oracle_response(&response_body),
                            "oracle source extract price from json value error: {e}"
                        );
                        None
                    }
                }
            }
            None => None,
        })
        .sorted()
        .collect_vec();

        // Succeed as long as at least one source worked and returned a non-zero price.
        if source_prices.is_empty() {
            bail!("None of the oracle sources returned a non-zero price");
        }

        info!("finished successfully fetching prices from sources");
        let median_price = source_prices[source_prices.len() / 2];
        info!(
            price = median_price.0,
            source_count = source_prices.len(),
            "oracle selected median price"
        );
        Ok(median_price)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VERIFY_ORACLE_WITH_NETWORK_ENV: &str = "SP_TESTS_VERIFY_ORACLE_WITH_NETWORK";

    async fn assert_oracle_source_returns_non_zero_price(
        source: impl RemotePriceSource,
    ) -> anyhow::Result<()> {
        if std::env::var(VERIFY_ORACLE_WITH_NETWORK_ENV).as_deref() != Ok("1") {
            return Ok(());
        }

        let response = Client::new()
            .get(source.get_url())
            .timeout(Duration::from_secs(15))
            .send()
            .await?;
        let status = response.status();
        let response_body = response.text().await?;

        assert!(
            status.is_success(),
            "oracle source {} returned status {status} with response: {}",
            source.name(),
            truncate_oracle_response(&response_body)
        );

        let json_value = serde_json::from_str::<serde_json::Value>(&response_body)?;
        let price = source.extract_price_from_json_value(json_value)?;

        assert!(
            price.0 > 0,
            "oracle source {} returned non-positive price from response: {}",
            source.name(),
            truncate_oracle_response(&response_body)
        );

        Ok(())
    }

    #[tokio::test]
    async fn oracle_source_cex_io_returns_non_zero_price() -> anyhow::Result<()> {
        assert_oracle_source_returns_non_zero_price(CexIoAPI).await
    }

    #[tokio::test]
    async fn oracle_source_yadio_io_returns_non_zero_price() -> anyhow::Result<()> {
        assert_oracle_source_returns_non_zero_price(YadioIoAPI).await
    }

    #[tokio::test]
    async fn oracle_source_bitstamp_net_returns_non_zero_price() -> anyhow::Result<()> {
        assert_oracle_source_returns_non_zero_price(BitstampNetAPI).await
    }

    #[tokio::test]
    async fn oracle_source_kraken_com_returns_non_zero_price() -> anyhow::Result<()> {
        assert_oracle_source_returns_non_zero_price(KrakenAPI).await
    }

    #[tokio::test]
    async fn oracle_source_coinbase_com_returns_non_zero_price() -> anyhow::Result<()> {
        assert_oracle_source_returns_non_zero_price(CoinbaseAPI).await
    }

    #[tokio::test]
    async fn oracle_source_gemini_com_returns_non_zero_price() -> anyhow::Result<()> {
        assert_oracle_source_returns_non_zero_price(GeminiAPI).await
    }

    #[tokio::test]
    async fn aggregate_oracle_returns_non_zero_price() -> anyhow::Result<()> {
        if std::env::var(VERIFY_ORACLE_WITH_NETWORK_ENV).as_deref() != Ok("1") {
            return Ok(());
        }

        let price = AggregateOracle::new_with_default_sources()
            .get_price()
            .await?;

        assert!(price.0 > 0, "aggregate oracle returned zero price");

        Ok(())
    }
}
