use std::collections::BTreeMap;
use std::time::Duration;

use fedimint_derive_secret::DerivableSecret;
use nostr_sdk::secp256k1::{self, Message};
use nostr_sdk::util::hex;
use nostr_sdk::{
    Client, EventBuilder, Filter, Keys, Kind, NostrSigner, PublicKey, Tag, TagKind, ToBech32,
};
use rand::RngCore;
use runtime::bridge_runtime::Runtime;
use runtime::constants::{NOSTR_CHILD_ID, NOSTR_COMMUNITY_CREATION_EVENT_KIND};
use runtime::storage::state::CommunityJson;
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

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcNostrCommunity {
    pub hex_uuid: String,
    pub name: String,
    pub meta: BTreeMap<String, String>,
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

    pub fn keys(&self) -> &Keys {
        &self.keys
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

    /// Given the JSON blob that represents the new community to be
    /// created, this function will derive the next valid keypair and publish a
    /// new "community creation" event to the relays.
    pub async fn create_community(&self, community_json: &CommunityJson) -> anyhow::Result<()> {
        // For each community that a user creates, we use a new nostr keypair which is
        // derived from the user's root nostr keypair. The derivation uses a random
        // 32-byte UUID. This function returns the derived keypair along with the UUID.
        //
        // Note that this is future-looking whereby multi-editor support can be achieved
        // by simply sharing one of the derived keys out-of-band securely.
        let uuid_bytes = {
            let mut rng = rand::thread_rng();
            let mut uuid_bytes = [0u8; 32];
            rng.fill_bytes(&mut uuid_bytes);
            uuid_bytes
        };

        let community_keys = self.community_creation_keys(&uuid_bytes).await?;
        self.sign_and_publish_community(&community_keys, &hex::encode(uuid_bytes), community_json)
            .await
    }

    /// Fetches community creation events for the given npub (as "owner") and
    /// returns a list
    pub async fn list_communities(
        &self,
        owner_npub: PublicKey,
    ) -> anyhow::Result<Vec<RpcNostrCommunity>> {
        let Some(client) = &self.client else {
            anyhow::bail!("nostr client feature flag is not enabled");
        };

        Ok(client
            .fetch_events(
                Filter::new()
                    .kind(Kind::from(NOSTR_COMMUNITY_CREATION_EVENT_KIND))
                    .pubkey(owner_npub),
                Duration::from_secs(10),
            )
            .await?
            .to_vec()
            .into_iter()
            .filter_map(|event| {
                let community_res = serde_json::from_str::<CommunityJson>(&event.content);
                let maybe_uuid = event.tags.identifier();
                match (community_res, maybe_uuid) {
                    (Ok(community), Some(hex_uuid)) => Some(RpcNostrCommunity {
                        hex_uuid: hex_uuid.to_owned(),
                        name: community.name,
                        meta: community.meta,
                    }),
                    _ => None,
                }
            })
            .collect())
    }

    /// Fetches our own community creation events and returns a list
    pub async fn list_our_communities(&self) -> anyhow::Result<Vec<RpcNostrCommunity>> {
        self.list_communities(self.keys.public_key).await
    }

    /// Given the hex encoded UUID of one of the communities we created,
    /// overwrites the existing JSON with the newly provided JSON, thereby
    /// replacing the older event with the newer one.
    pub async fn edit_community(
        &self,
        community_uuid_hex: &str,
        new_community_json: &CommunityJson,
    ) -> anyhow::Result<()> {
        let uuid_bytes = hex::decode(community_uuid_hex)?;
        let community_keys = self.community_creation_keys(&uuid_bytes).await?;
        self.sign_and_publish_community(&community_keys, community_uuid_hex, new_community_json)
            .await
    }

    // Given a byte slice UUID representing a community, derives a new nostr keypair
    // using the root nostr keypair and the UUID.
    async fn community_creation_keys(&self, uuid_bytes: &[u8]) -> anyhow::Result<Keys> {
        let nostr_secret_bytes = self.keys.secret_key().as_secret_bytes();

        let community_secret = DerivableSecret::new_root(nostr_secret_bytes, uuid_bytes);
        let community_keypair = community_secret.to_secp_key(secp256k1::SECP256K1);
        let community_keys = Keys::new(nostr_sdk::SecretKey::from(community_keypair.secret_key()));

        Ok(community_keys)
    }

    // Given a byte slice UUID representing a community, derives a new nostr keypair
    // using the root nostr keypair and the UUID.
    // Given:
    // - set of signing keys
    // - uuid of community (hex-encoded bytes)
    // - actual JSON blob
    //
    // Constructs an event, signs it with the provided keys, and publishes it to the
    // relays.
    async fn sign_and_publish_community(
        &self,
        keys: &Keys,
        uuid_hex: &str,
        json: &CommunityJson,
    ) -> anyhow::Result<()> {
        let Some(client) = &self.client else {
            anyhow::bail!("nostr client feature flag is not enabled");
        };

        // Regarding the event tags:
        // - d tag is community UUID to remain NIP-33 compliant whilst providing an
        // easy-way to reverse lookup the derived key upon fetching.
        //
        // - p tag is the root npub so that all of a user's communities can easily be
        //   fetched.
        let nostr_event = EventBuilder::new(
            Kind::from_u16(NOSTR_COMMUNITY_CREATION_EVENT_KIND),
            serde_json::to_string(json)?,
        )
        .tag(Tag::identifier(uuid_hex))
        .tag(Tag::public_key(self.keys.public_key))
        .sign_with_keys(keys)?;
        client.send_event(&nostr_event).await?;

        Ok(())
    }
}
