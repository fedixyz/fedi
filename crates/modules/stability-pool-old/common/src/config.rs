use std::time::Duration;

use fedimint_core::config::EmptyGenParams;
use fedimint_core::core::ModuleKind;
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{Amount, plugin_types_trait_impl_config};
use serde::{Deserialize, Serialize};

use super::StabilityPoolCommonGen;

#[derive(Clone, Debug, Serialize, Deserialize, Encodable, Decodable)]
pub enum OracleConfig {
    Mock,
    Aggregate,
}

/// There are several ways to represent collateralization ratio between
/// provider and seeker such as Basis points(BPS), parts per million(ppm) etc.
/// However, the bigger the unit, the higher the risk of overflowing
/// calculations. Therefore, we use a simpler representation where the ratio
/// is represented as a pair of u8s. 1:1 would mean 100%, 6:5 would mean 120%,
/// 5:4 would mean 125%, 2:1 would mean 200% etc.
#[derive(Clone, Debug, Serialize, Deserialize, Encodable, Decodable)]
pub struct CollateralRatio {
    pub provider: u8,
    pub seeker: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StabilityPoolGenParams {
    pub local: EmptyGenParams,
    pub consensus: StabilityPoolGenParamsConsensus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StabilityPoolGenParamsConsensus {
    pub oracle_config: OracleConfig,
    pub cycle_duration: Duration,
    pub collateral_ratio: CollateralRatio,
    pub min_allowed_seek: Amount,
    pub min_allowed_provide: Amount,
    pub max_allowed_provide_fee_rate_ppb: u64,
    pub min_allowed_cancellation_bps: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StabilityPoolConfig {
    /// Configuration that will be encrypted.
    pub private: StabilityPoolConfigPrivate,
    /// Configuration that needs to be the same for every federation member.
    pub consensus: StabilityPoolConfigConsensus,
}

#[derive(Clone, Debug, Serialize, Deserialize, Encodable, Decodable)]
pub struct StabilityPoolConfigConsensus {
    pub consensus_threshold: u32,
    pub oracle_config: OracleConfig,
    pub cycle_duration: Duration,
    pub collateral_ratio: CollateralRatio,
    pub min_allowed_seek: Amount,
    pub min_allowed_provide: Amount,
    pub max_allowed_provide_fee_rate_ppb: u64,
    pub min_allowed_cancellation_bps: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StabilityPoolConfigPrivate;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, Encodable, Decodable, Hash)]
pub struct StabilityPoolClientConfig {
    pub cycle_duration: Duration,
    pub min_allowed_seek: Amount,
    pub max_allowed_provide_fee_rate_ppb: u64,
    pub min_allowed_cancellation_bps: u32,
}

impl std::fmt::Display for StabilityPoolClientConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "StabilityPoolClientConfig {}",
            serde_json::to_string(self).map_err(|_e| std::fmt::Error)?
        )
    }
}

plugin_types_trait_impl_config!(
    StabilityPoolCommonGen,
    StabilityPoolGenParams,
    EmptyGenParams,
    StabilityPoolGenParamsConsensus,
    StabilityPoolConfig,
    StabilityPoolConfigPrivate,
    StabilityPoolConfigConsensus,
    StabilityPoolClientConfig
);
