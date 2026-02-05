use std::collections::BTreeMap;
use std::fmt::Display;
use std::str::FromStr;

use anyhow::bail;
use bitcoin::bech32::{self, Bech32m};
use ring::aead::{self, LessSafeKey};
use runtime::constants::{COMMUNITY_INVITE_CODE_HRP, COMMUNITY_V2_INVITE_CODE_HRP};
use runtime::storage::state::CommunityStatus;
use serde::{Deserialize, Serialize};
use serde_with::serde_as;
use ts_rs::TS;

use crate::nostril::RpcNostrPubkey;

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcCommunity {
    pub community_invite: RpcCommunityInvite,
    pub name: String,
    pub meta: BTreeMap<String, String>,
    pub status: RpcCommunityStatus,
}

#[derive(Debug, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcCommunityStatus {
    Active,
    Deleted,
}

impl From<CommunityStatus> for RpcCommunityStatus {
    fn from(value: CommunityStatus) -> Self {
        match value {
            CommunityStatus::Active => Self::Active,
            CommunityStatus::Deleted => Self::Deleted,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcCommunityInvite {
    Legacy {
        #[serde(flatten)]
        invite_code: CommunityInviteV1,
        invite_code_str: String,
    },
    Nostr {
        #[serde(flatten)]
        invite_code: RpcCommunityInviteV2,
        invite_code_str: String,
    },
}

impl From<&CommunityInvite> for RpcCommunityInvite {
    fn from(value: &CommunityInvite) -> Self {
        match value {
            CommunityInvite::V1(community_invite_v1) => community_invite_v1.into(),
            CommunityInvite::V2(community_invite_v2) => community_invite_v2.into(),
        }
    }
}

impl From<&CommunityInviteV1> for RpcCommunityInvite {
    fn from(value: &CommunityInviteV1) -> Self {
        Self::Legacy {
            invite_code: value.clone(),
            invite_code_str: value.to_string(),
        }
    }
}

impl From<&CommunityInviteV2> for RpcCommunityInvite {
    fn from(value: &CommunityInviteV2) -> Self {
        Self::Nostr {
            invite_code: value.into(),
            invite_code_str: value.to_string(),
        }
    }
}

impl Display for RpcCommunityInvite {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let invite_code = match self {
            RpcCommunityInvite::Legacy {
                invite_code_str, ..
            } => invite_code_str,
            RpcCommunityInvite::Nostr {
                invite_code_str, ..
            } => invite_code_str,
        };
        write!(f, "{invite_code}")
    }
}

#[derive(Debug, Serialize, Deserialize, TS, PartialEq, Eq)]
pub struct RpcCommunityInviteV2 {
    pub author_pubkey: RpcNostrPubkey,
    pub community_uuid_hex: String, // d tag
    #[ts(type = "string")]
    pub decryption_key: RawChaCha20Poly1305Key,
}

impl From<&CommunityInviteV2> for RpcCommunityInviteV2 {
    fn from(value: &CommunityInviteV2) -> Self {
        Self {
            author_pubkey: From::from(&value.author_pubkey),
            community_uuid_hex: value.community_uuid_hex.to_owned(),
            decryption_key: value.decryption_key.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum CommunityInvite {
    V1(CommunityInviteV1),
    V2(CommunityInviteV2),
}

impl FromStr for CommunityInvite {
    type Err = anyhow::Error;

    fn from_str(invite_code: &str) -> Result<Self, Self::Err> {
        // First treat invite code as V2
        if let Ok(community_invite_v2) = CommunityInviteV2::from_str(invite_code) {
            return Ok(CommunityInvite::V2(community_invite_v2));
        }

        Ok(CommunityInvite::V1(CommunityInviteV1::from_str(
            invite_code,
        )?))
    }
}

impl Display for CommunityInvite {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommunityInvite::V1(community_invite_v1) => {
                std::fmt::Display::fmt(community_invite_v1, f)
            }
            CommunityInvite::V2(community_invite_v2) => {
                std::fmt::Display::fmt(community_invite_v2, f)
            }
        }
    }
}

/// Community invite codes are bech32m encoded with the human-readable part
/// being "fedi:community". The decoded data is actually a json blob that
/// follows this schema.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
pub struct CommunityInviteV1 {
    pub community_meta_url: String,
}

impl FromStr for CommunityInviteV1 {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let invite_code = s.to_lowercase();

        // TODO shaurya ok to ignore bech32 variant here?
        let (hrp, data) = bech32::decode(&invite_code)?;
        if hrp != COMMUNITY_INVITE_CODE_HRP {
            bail!("Unexpected hrp: {hrp}");
        }

        let decoded_str = String::from_utf8(data)?;
        Ok(serde_json::from_str(&decoded_str)?)
    }
}

impl Display for CommunityInviteV1 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let invite_json_str = serde_json::to_string(self).map_err(|_| std::fmt::Error)?;
        let invite_bytes = invite_json_str.as_bytes();
        let invite_code = bech32::encode::<Bech32m>(COMMUNITY_INVITE_CODE_HRP, invite_bytes)
            .map_err(|_| std::fmt::Error)?;
        write!(f, "{invite_code}")
    }
}

/// A V2 community creation nostr event has a d tag which is a locally generated
/// 32-byte random UUID, and a p tag which is the creator's root npub. The
/// author pubkey that publishes/creates the community is different for each
/// community, and is derived from the user's root nsec/npub pair by using the
/// UUID that's present in the d tag. A parametrized replaceable event such as
/// this is uniquely identified by a tuple of (author_pubkey, kind, d-tag).
///
/// v2 invite codes are bech32m encoded with the human-readable part
/// being "fedi:communityV2". The decoded data is actually a json blob that
/// follows this schema.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommunityInviteV2 {
    pub author_pubkey: nostr_sdk::PublicKey, // type implements deserialize
    pub community_uuid_hex: String,          // d tag
    pub decryption_key: RawChaCha20Poly1305Key,
}

// Raw bytes of the chacha20_poly1305 symmetric cryptographic key needed to
// encrypt/decrypt the community metadata.
#[serde_as]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RawChaCha20Poly1305Key(#[serde_as(as = "serde_with::base64::Base64")] [u8; 32]);

impl RawChaCha20Poly1305Key {
    pub fn new(key_bytes: [u8; 32]) -> Self {
        Self(key_bytes)
    }

    pub fn into_less_safe_key(&self) -> LessSafeKey {
        // Follows the implementation of fedimint's
        // DerivableSecret::to_chacha20_poly1305_key
        LessSafeKey::new(
            aead::UnboundKey::new(&aead::CHACHA20_POLY1305, &self.0)
                .expect("only failure is key len != 32"),
        )
    }
}

impl FromStr for CommunityInviteV2 {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let invite_code = s.to_lowercase();

        let (hrp, data) = bech32::decode(&invite_code)?;
        if hrp != COMMUNITY_V2_INVITE_CODE_HRP {
            bail!("Unexpected hrp: {hrp}");
        }

        let decoded_str = String::from_utf8(data)?;
        Ok(serde_json::from_str(&decoded_str)?)
    }
}

impl Display for CommunityInviteV2 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let invite_json_str = serde_json::to_string(self).map_err(|_| std::fmt::Error)?;
        let invite_bytes = invite_json_str.as_bytes();
        let invite_code = bech32::encode::<Bech32m>(COMMUNITY_V2_INVITE_CODE_HRP, invite_bytes)
            .map_err(|_| std::fmt::Error)?;
        write!(f, "{invite_code}")
    }
}
