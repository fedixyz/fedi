use serde::{Deserialize, Serialize};

use super::{DeviceIdentifierV0, DeviceIndexV0, SeedCommitmentV0};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GetDevicesForSeedQueryV0 {
    pub seed_commitment: SeedCommitmentV0,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename = "v0")]
pub struct RegisterDeviceRequestV0 {
    pub seed_commitment: SeedCommitmentV0,
    pub device_index: DeviceIndexV0,
    pub device_identifier: DeviceIdentifierV0,
    pub force: bool,
}
