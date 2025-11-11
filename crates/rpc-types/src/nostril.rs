use nostr_sdk::ToBech32;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcNostrSecret {
    pub hex: String,
    pub nsec: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcNostrPubkey {
    pub hex: String,
    pub npub: String,
}

impl From<&nostr_sdk::PublicKey> for RpcNostrPubkey {
    fn from(value: &nostr_sdk::PublicKey) -> Self {
        // ToBech32::Err type is Infallible for nostr_sdk::PublicKey
        Self {
            hex: value.to_hex(),
            npub: value
                .to_bech32()
                .expect("Infallible for valid nostr_sdk::PublicKey"),
        }
    }
}
