use nostr_sdk::secp256k1::{self, Message};
use nostr_sdk::util::hex;
use nostr_sdk::{Client, EventBuilder, Keys, Kind, NostrSigner, PublicKey, Tag, TagKind, ToBech32};
use runtime::bridge_runtime::Runtime;
use runtime::constants::NOSTR_CHILD_ID;
use serde::{Deserialize, Serialize};
use tracing::warn;
use ts_rs::TS;

pub struct Nostril {
    keys: Keys,
    // none when nostr feature is disabled
    client: Option<Client>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcNostrSecret {
    pub hex: String,
    pub nsec: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcNostrPubkey {
    pub hex: String,
    pub npub: String,
}

impl Nostril {
    pub async fn new(runtime: &Runtime) -> Self {
        let keys = Self::derive_keys(runtime).await;
        let client = if let Some(nostr_catalog) = &runtime.feature_catalog.nostr_client {
            let client = Client::new(keys.clone());
            for relay in &nostr_catalog.relays {
                if let Err(err) = client.add_relay(relay).await {
                    warn!(%relay, ?err, "failed to add relay");
                };
            }
            // note: doesn't wait, just connnects in background
            client.connect().await;
            Some(client)
        } else {
            None
        };
        Self { client, keys }
    }

    async fn derive_keys(runtime: &Runtime) -> Keys {
        let global_root_secret = runtime.app_state.root_secret().await;
        let nostr_secret = global_root_secret.child_key(NOSTR_CHILD_ID);
        let nostr_keypair = nostr_secret.to_secp_key(secp256k1::SECP256K1);
        Keys::new(nostr_sdk::SecretKey::from(nostr_keypair.secret_key()))
    }

    // TODO: change to &self once nostril feature flag is removed
    pub async fn get_secret_key(&self) -> anyhow::Result<RpcNostrSecret> {
        Ok(RpcNostrSecret {
            hex: self.keys.secret_key().to_secret_hex(),
            nsec: self.keys.secret_key().to_bech32()?,
        })
    }

    pub async fn get_pub_key(&self) -> anyhow::Result<RpcNostrPubkey> {
        Ok(RpcNostrPubkey {
            hex: self.keys.public_key().to_hex(),
            npub: self.keys.public_key().to_bech32()?,
        })
    }

    pub async fn sign_nostr_event(&self, event_hash: String) -> anyhow::Result<String> {
        let data = &hex::decode(event_hash)?;
        let message = Message::from_digest_slice(data)?;
        let sig = self.keys.sign_schnorr(&message);
        // Return hex-encoded string
        Ok(format!("{sig}"))
    }

    /// Given a recipient's pubkey and plaintext content, encrypts and returns
    /// the ciphertext as per NIP44.
    pub async fn nip44_encrypt(&self, pubkey: String, plaintext: String) -> anyhow::Result<String> {
        Ok(self
            .keys
            .nip44_encrypt(&PublicKey::parse(&pubkey)?, &plaintext)
            .await?)
    }

    /// Given a recipient's pubkey and ciphertext content, decrypts and returns
    /// the plaintext as per NIP44.
    pub async fn nip44_decrypt(
        &self,
        pubkey: String,
        ciphertext: String,
    ) -> anyhow::Result<String> {
        Ok(self
            .keys
            .nip44_decrypt(&PublicKey::parse(&pubkey)?, &ciphertext)
            .await?)
    }

    /// Given a recipient's pubkey and plaintext content, encrypts and returns
    /// the ciphertext as per NIP04.
    pub async fn nip04_encrypt(&self, pubkey: String, plaintext: String) -> anyhow::Result<String> {
        Ok(self
            .keys
            .nip04_encrypt(&PublicKey::parse(&pubkey)?, &plaintext)
            .await?)
    }

    /// Given a recipient's pubkey and ciphertext content, decrypts and returns
    /// the plaintext as per NIP04.
    pub async fn nip04_decrypt(
        &self,
        pubkey: String,
        ciphertext: String,
    ) -> anyhow::Result<String> {
        Ok(self
            .keys
            .nip04_decrypt(&PublicKey::parse(&pubkey)?, &ciphertext)
            .await?)
    }

    /// Rate a federation
    ///
    /// ref: https://github.com/nostr-protocol/nips/pull/1110/files
    /// ref: https://github.com/MakePrisms/bitcoinmints/issues/22
    pub async fn rate_federation(
        &self,
        federation_id: String,
        rating: u8,
        invite_code: Option<String>,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(rating <= 5, "illegal rating");
        let Some(client) = &self.client else {
            anyhow::bail!("nostr client feature flag is not enabled");
        };
        client
            .send_event_builder(
                EventBuilder::new(Kind::from_u16(38000), format!("[{rating}/5]"))
                    .tag(Tag::identifier(federation_id))
                    .tag(Tag::custom(TagKind::k(), ["38173"]))
                    .tag(Tag::custom(TagKind::custom("rating"), [rating.to_string()]))
                    .tags(
                        invite_code
                            .map(|code| Tag::custom(TagKind::u(), [code, "fedimint".to_string()])),
                    ),
            )
            .await?;
        Ok(())
    }
}
