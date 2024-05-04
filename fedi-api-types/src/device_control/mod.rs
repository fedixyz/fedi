pub mod request;
pub mod response;

use std::str::FromStr;

use anyhow::ensure;
use serde::{Deserialize, Serialize};

pub const SEED_COMMITMENT_SIZE: usize = 32;

#[derive(Debug, Clone, Serialize)]
#[repr(transparent)]
pub struct SeedCommitmentV0(#[serde(with = "hex")] Vec<u8>);

impl SeedCommitmentV0 {
    pub fn new(seed: [u8; SEED_COMMITMENT_SIZE]) -> Self {
        Self(seed.to_vec())
    }

    pub fn from_vec(value: Vec<u8>) -> anyhow::Result<Self> {
        ensure!(
            value.len() == SEED_COMMITMENT_SIZE,
            format!("SeedCommitment must be {SEED_COMMITMENT_SIZE} bytes long")
        );
        Ok(Self(value))
    }

    pub fn as_slice(&self) -> &[u8] {
        &self.0
    }

    pub fn into_vec(self) -> Vec<u8> {
        self.0
    }
}

impl<'de> Deserialize<'de> for SeedCommitmentV0 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let hex = hex::serde::deserialize(deserializer)?;
        Self::from_vec(hex).map_err(serde::de::Error::custom)
    }
}

impl FromStr for SeedCommitmentV0 {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let bytes = hex::decode(s)?;
        Self::from_vec(bytes)
    }
}

impl std::fmt::Display for SeedCommitmentV0 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", hex::encode(&self.0))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceIdentifierV0 {
    /// Should be less than or equal to 64 bytes
    /// The limit is enforced on the api request body, so the value isn't exact
    /// (i.e it may accept a bit more than 64 bytes).
    /// Check `device-control::api::test_api_v0_body_sizes` for a demonstration
    /// of the limit
    pub device_name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[repr(transparent)]
pub struct DeviceIndexV0(pub u8);

impl std::fmt::Display for DeviceIndexV0 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceInfoResultV0 {
    pub device_index: DeviceIndexV0,
    pub device_identifier: DeviceIdentifierV0,
    pub timestamp: TimestampV0,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[repr(transparent)]
pub struct TimestampV0(pub chrono::DateTime<chrono::Utc>);
