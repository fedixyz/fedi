use std::time::Duration;

use anyhow::bail;
use base64::Engine;
use base64::engine::general_purpose;
use fedimint_derive_secret::{ChildId, DerivableSecret};
use itertools::Itertools;
use nostr_sdk::secp256k1::{self, Message};
use nostr_sdk::{
    Client, ClientOptions, EventBuilder, Filter, Keys, Kind, NostrSigner, PublicKey, Tag, TagKind,
    ToBech32,
};
use rand::RngCore;
use rpc_types::communities::{
    CommunityInviteV2, RawChaCha20Poly1305Key, RpcCommunity, RpcCommunityInvite,
};
use rpc_types::nostril::{RpcNostrPubkey, RpcNostrSecret};
use runtime::bridge_runtime::Runtime;
use runtime::constants::{
    NOSTR_CHILD_ID, NOSTR_COMMUNITY_CREATION_EVENT_KIND, NOSTR_COMMUNITY_STATUS_DELETED,
    NOSTR_COMMUNITY_STATUS_TAG,
};
use runtime::storage::state::CommunityJson;
use tracing::{error, info, warn};

pub struct Nostril {
    keys: Keys,
    // none when nostr feature is disabled
    client: Option<Client>,
}

// Per-community set of keys used for publishing the community creation event
// and encrypting the event's content
struct CommunityKeys {
    publishing_key: Keys,
    encryption_key: RawChaCha20Poly1305Key,
}

impl Nostril {
    pub async fn new(runtime: &Runtime) -> Self {
        let keys = Self::derive_keys(runtime).await;
        let client = if let Some(nostr_catalog) = &runtime.feature_catalog.nostr_client {
            let client = Client::builder()
                .signer(keys.clone())
                .opts(ClientOptions::new().sleep_when_idle(
                    nostr_sdk::client::SleepWhenIdle::Enabled {
                        timeout: Duration::from_secs(30),
                    },
                ))
                .build();
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
        Ok(From::from(&self.keys.public_key))
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
    pub async fn create_community(
        &self,
        community_json: CommunityJson,
    ) -> anyhow::Result<RpcCommunity> {
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

        let community_keys = self.community_creation_keys(&uuid_bytes);
        self.sign_and_publish_community(
            &community_keys,
            &hex::encode(uuid_bytes),
            community_json,
            vec![],
        )
        .await
    }

    /// Fetches our own community creation events and returns a list
    pub async fn list_our_communities(&self) -> anyhow::Result<Vec<RpcCommunity>> {
        let Some(client) = &self.client else {
            anyhow::bail!("nostr client feature flag is not enabled");
        };

        Ok(client
            .fetch_events(
                Filter::new()
                    .kind(Kind::from(NOSTR_COMMUNITY_CREATION_EVENT_KIND))
                    .pubkey(self.keys.public_key),
                Duration::from_secs(10),
            )
            .await?
            .into_iter()
            .filter_map(|event| {
                let Some(uuid) = event.tags.identifier() else {
                    error!(?event, "Missing UUID in d tag");
                    return None;
                };

                if let Some(status_tag) =
                    event.tags.find(TagKind::custom(NOSTR_COMMUNITY_STATUS_TAG))
                    && status_tag.content() == Some(NOSTR_COMMUNITY_STATUS_DELETED)
                {
                    info!(?event, "Community marked deleting, skipping");
                    return None;
                }

                Some((uuid.to_owned(), event))
            })
            .sorted_by(|(u1, e1), (u2, e2)| u1.cmp(u2).then(e2.created_at.cmp(&e1.created_at)))
            .dedup_by(|(u1, _), (u2, _)| u1 == u2)
            .filter_map(|(uuid, event)| {
                let uuid_bytes = hex::decode(&uuid)
                    .inspect_err(|e| error!(?event, %uuid, ?e, "Couldn't hex-decode UUID"))
                    .ok()?;

                let creation_keys = self.community_creation_keys(&uuid_bytes);

                let community = Self::event_content_to_community_json(
                    &event.content,
                    &creation_keys.encryption_key,
                )
                .inspect_err(|e| error!(?event, %uuid, ?e, "Couldn't decrypt community json"))
                .ok()?;

                Some(RpcCommunity {
                    community_invite: From::from(&CommunityInviteV2 {
                        author_pubkey: event.pubkey,
                        community_uuid_hex: uuid,
                        decryption_key: creation_keys.encryption_key,
                    }),
                    name: community.name,
                    meta: community.meta,
                })
            })
            .collect())
    }

    /// Given the hex encoded UUID of one of the communities we created,
    /// overwrites the existing JSON with the newly provided JSON, thereby
    /// replacing the older event with the newer one.
    pub async fn edit_community(
        &self,
        community_uuid_hex: &str,
        new_community_json: CommunityJson,
    ) -> anyhow::Result<()> {
        let uuid_bytes = hex::decode(community_uuid_hex)?;
        let community_keys = self.community_creation_keys(&uuid_bytes);
        self.sign_and_publish_community(
            &community_keys,
            community_uuid_hex,
            new_community_json,
            vec![],
        )
        .await?;
        Ok(())
    }

    /// Given the hex encoded UUID of one of the communities we created,
    /// publishes a new replacement event with a new tag "status:deleted"
    /// without modifying the event content. This is meant to indicate that the
    /// creator has effectively deleted that community and it is treated as an
    /// irreversible operation.
    pub async fn delete_community(&self, community_uuid_hex: &str) -> anyhow::Result<()> {
        // First fetch latest JSON. This also ensures that community exists.
        let our_communities = self.list_our_communities().await?;
        let to_delete = our_communities
            .iter()
            .find(|&c| matches!(&c.community_invite, RpcCommunityInvite::Nostr { invite_code, .. } if invite_code.community_uuid_hex == community_uuid_hex))
            .ok_or(anyhow::anyhow!("Community to delete not found!"))?;
        let existing_json = CommunityJson {
            name: to_delete.name.clone(),
            version: 2, // 2 for RpcCommunityInvite::Nostr
            meta: to_delete.meta.clone(),
        };
        let uuid_bytes = hex::decode(community_uuid_hex)?;
        let community_keys = self.community_creation_keys(&uuid_bytes);
        let deletion_tag = Tag::custom(
            TagKind::custom(NOSTR_COMMUNITY_STATUS_TAG),
            vec![NOSTR_COMMUNITY_STATUS_DELETED],
        );
        self.sign_and_publish_community(
            &community_keys,
            community_uuid_hex,
            existing_json,
            vec![deletion_tag],
        )
        .await?;
        Ok(())
    }

    /// Given a v2 community invite, fetches the latest nostr event for the
    /// community's creation, parses the content of the event and returns
    /// RpcNostrCommunity
    pub async fn fetch_community(
        &self,
        invite: &CommunityInviteV2,
    ) -> anyhow::Result<CommunityJson> {
        let Some(client) = &self.client else {
            anyhow::bail!("nostr client feature flag is not enabled");
        };

        let events = client
            .fetch_events(
                Filter::new()
                    .kind(Kind::from(NOSTR_COMMUNITY_CREATION_EVENT_KIND))
                    .identifier(invite.community_uuid_hex.clone())
                    .author(invite.author_pubkey),
                Duration::from_secs(10),
            )
            .await?;

        // If multiple events are found, consider only the latest one
        // The "events" should already be sorted in descending order of creation time
        let Some(first_event) = events.first_owned() else {
            bail!("No community event found for the given invite code");
        };

        Self::event_content_to_community_json(&first_event.content, &invite.decryption_key)
    }

    // Given a byte slice UUID representing a community, derives a new nostr keypair
    // using the root nostr keypair and the UUID.
    fn community_creation_keys(&self, uuid_bytes: &[u8]) -> CommunityKeys {
        const COMMUNITY_PUBLISHING_CHILD_ID: ChildId = ChildId(0);
        const COMMUNITY_ENCRYPTION_CHILD_ID: ChildId = ChildId(1);

        let nostr_secret_bytes = self.keys.secret_key().as_secret_bytes();
        let community_secret = DerivableSecret::new_root(nostr_secret_bytes, uuid_bytes);

        let publishing_secret = community_secret.child_key(COMMUNITY_PUBLISHING_CHILD_ID);
        let publishing_keypair = publishing_secret.to_secp_key(secp256k1::SECP256K1);
        let publishing_key = Keys::new(nostr_sdk::SecretKey::from(publishing_keypair.secret_key()));

        let encryption_secret = community_secret.child_key(COMMUNITY_ENCRYPTION_CHILD_ID);
        let encryption_key =
            RawChaCha20Poly1305Key::new(encryption_secret.to_chacha20_poly1305_key_raw());

        CommunityKeys {
            publishing_key,
            encryption_key,
        }
    }

    // Given:
    // - set of community keys
    // - uuid of community (hex-encoded bytes)
    // - actual JSON blob
    //
    // Constructs an encrypted event, signs it with the provided publishing key, and
    // publishes it to the relays.
    async fn sign_and_publish_community(
        &self,
        keys: &CommunityKeys,
        uuid_hex: &str,
        json: CommunityJson,
        custom_tags: Vec<Tag>,
    ) -> anyhow::Result<RpcCommunity> {
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
            Self::community_json_to_event_content(&json, &keys.encryption_key)?,
        )
        .tag(Tag::identifier(uuid_hex))
        .tag(Tag::public_key(self.keys.public_key))
        .tags(custom_tags)
        .sign_with_keys(&keys.publishing_key)?;
        client.send_event(&nostr_event).await?;

        Ok(RpcCommunity {
            community_invite: From::from(&CommunityInviteV2 {
                author_pubkey: keys.publishing_key.public_key,
                community_uuid_hex: uuid_hex.to_string(),
                decryption_key: keys.encryption_key.clone(),
            }),
            name: json.name,
            meta: json.meta,
        })
    }

    // Base64 decode => decrypt => deserialize to CommunityJson
    fn event_content_to_community_json(
        content: &str,
        decryption_key: &RawChaCha20Poly1305Key,
    ) -> anyhow::Result<CommunityJson> {
        let mut decoded_content = general_purpose::STANDARD.decode(content)?;
        let json_bytes =
            fedimint_aead::decrypt(&mut decoded_content, &decryption_key.into_less_safe_key())?;
        Ok(serde_json::from_slice::<CommunityJson>(json_bytes)?)
    }

    // Encrypt => Base64 encode
    fn community_json_to_event_content(
        json: &CommunityJson,
        encryption_key: &RawChaCha20Poly1305Key,
    ) -> anyhow::Result<String> {
        let encrypted_bytes = fedimint_aead::encrypt(
            serde_json::to_vec(json)?,
            &encryption_key.into_less_safe_key(),
        )?;
        Ok(general_purpose::STANDARD.encode(encrypted_bytes))
    }
}
