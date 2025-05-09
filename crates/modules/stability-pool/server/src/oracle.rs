use std::fmt::Debug;
use std::time::Duration;

use anyhow::{anyhow, bail};
use async_trait::async_trait;
use futures::future::join_all;
use itertools::Itertools;
use reqwest::{Client, Url};
use stability_pool_common::FiatAmount;
use tracing::{info, warn};

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
    fn get_url(&self) -> Url;

    fn extract_price_from_json_value(
        &self,
        json_value: serde_json::Value,
    ) -> anyhow::Result<FiatAmount>;
}

#[derive(Debug)]
struct CexIoAPI;

impl RemotePriceSource for CexIoAPI {
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
        let source_prices = join_all(self.sources.iter().map(|source| async {
            Ok::<_, anyhow::Error>(
                self.client
                    .clone()
                    .get(source.get_url())
                    .timeout(Duration::from_secs(15))
                    .send()
                    .await?
                    .json::<serde_json::Value>()
                    .await?,
            )
        }))
        .await
        .into_iter()
        .enumerate()
        .filter_map(|(i, oracle_result)| match oracle_result {
            Ok(json_value) => match self.sources[i].extract_price_from_json_value(json_value) {
                Ok(price) => Some(price),
                Err(e) => {
                    warn!("oracle source extract price from json value error: {e}");
                    None
                }
            },
            Err(e) => {
                warn!("oracle source request error: {e}");
                None
            }
        })
        .sorted()
        .collect_vec();

        // Succeed as long as at least one source worked
        if source_prices.is_empty() {
            bail!("None of the oracle sources worked");
        }

        info!("finished successfully fetching prices from sources");
        Ok(source_prices[source_prices.len() / 2])
    }
}
