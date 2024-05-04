use serde::{Deserialize, Serialize};

use super::DeviceInfoResultV0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename = "v0")]
pub struct DevicesForSeedResultV0 {
    pub devices: Vec<DeviceInfoResultV0>,
}
