use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcMiniAppSeed {
    /// Lowercase hex of the 16 seed bytes.
    pub seed: String,
}
