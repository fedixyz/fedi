use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v0")]
pub struct FeesV0 {
    pub remittance_threshold_msat: u64,
    pub modules: ModulesFeesV0,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModulesFeesV0 {
    pub ln: PPMs,
    pub mint: PPMs,
    pub stability_pool: PPMs,
    pub multi_sig_stability_pool: PPMs,
    pub wallet: PPMs,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PPMs {
    pub send_ppm: u64,
    pub receive_ppm: u64,
}
