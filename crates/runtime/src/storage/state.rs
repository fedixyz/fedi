//! Rust representation of the JSON schema of the app state file. Contains
//! all necessary information related to joined federations and
//! communities, device registration, as well as matrix.
//!
//! NOTE: when removing a field, we want to ensure that the field is never
//! reused for anything else. So it's preferable to change the type of the
//! field to () and mark it as deprecated.

use std::collections::BTreeMap;
use std::fmt::Display;
use std::ops::{Deref, DerefMut};
use std::str::FromStr;
use std::time::SystemTime;

use anyhow::{anyhow, ensure, Context};
use fedi_social_client::SocialRecoveryState;
use fedimint_aead::{decrypt, LessSafeKey};
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy;
use fedimint_client::ModuleKind;
use fedimint_core::encoding::{Decodable, DecodeError, Encodable};
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_derive_secret::DerivableSecret;
use matrix_sdk::authentication::matrix::MatrixSession;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::FIRST_FEDERATION_DB_PREFIX;
use crate::constants::{DEVICE_IDENTIFIER_FIXED_LENGTH, DEVICE_REGISTRATION_CHILD_ID};

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "kind")]
#[allow(clippy::large_enum_variant)]
pub enum AppStateJson {
    Onboarded(AppStateJsonOnboarded),
    Onboarding(AppStateJsonOnboarding),
}

impl std::fmt::Debug for AppStateJson {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Onboarded(_) => f.debug_tuple("Onboarded").finish_non_exhaustive(),
            Self::Onboarding(_) => f.debug_tuple("Onboarding").finish_non_exhaustive(),
        }
    }
}

// encoding json into database
impl Decodable for AppStateJson {
    fn consensus_decode_partial<R: std::io::Read>(
        r: &mut R,
        _decoders: &ModuleDecoderRegistry,
    ) -> Result<Self, DecodeError> {
        serde_json::from_reader(r).map_err(|e| DecodeError::new_custom(e.into()))
    }
}

impl Encodable for AppStateJson {
    fn consensus_encode<W: std::io::Write>(&self, writer: &mut W) -> Result<(), std::io::Error> {
        serde_json::to_writer(writer, self).map_err(std::io::Error::other)
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct AppStateJsonOnboarded {
    /// social recovery state
    pub social_recovery_state: Option<SocialRecoveryState>,
    /// Device index identifies which device number this is under the same root
    /// seed as registered with Fedi's device registration service. This index
    /// is used in the derivation path for the fedimint-client root
    /// secret. So in a way, it's a way of ensuring that a user's/seed's
    /// different per-federation "accounts" (across multiple devices) don't
    /// conflict with each other.
    ///
    /// The default value for new users with fresh seed is 0. In the case of
    /// recovery, we need to guide the user through the flow of setting up a
    /// device index before they can continue using the app as usual.
    pub(super) device_index: u8,

    /// V2 of the encrypted device identifier comes with new guarantees from
    /// the front-end. Specifically:
    /// - A device ID is always generated at start-up (no reading/writing to
    ///   disk)
    /// - The generated device ID is always the same for the same handset
    /// - The generated device ID is never the same for two handsets
    ///   (encompasses the device migration case)
    ///
    /// V2 is migration-aware whereas V1 is not. With V1 we'd have problems
    /// whereby transfering storage from an iPhone 15 to an iPhone 16 (for
    /// example) would make both phones behave the exact same with the same
    /// device ID and device index. V2 would help us fix such situations.
    pub(super) encrypted_device_identifier_v2: String,

    /// Matrix tokens for client with native sliding sync
    pub matrix_session: Option<MatrixSession>,

    /// Flag indicating if the bridge is ready for export (internal use only)
    #[serde(default)]
    pub internal_bridge_export: bool,

    #[serde(flatten)]
    pub base: AppStateJsonBase,
}

impl DerefMut for AppStateJsonOnboarded {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.base
    }
}

impl Deref for AppStateJsonOnboarded {
    type Target = AppStateJsonBase;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AppStateJsonOnboarding {
    pub stage: OnboardingStage,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum OnboardingStage {
    // nothing has happened yet
    Init {},
    SocialRecovery {
        state: SocialRecoveryState,
    },
    // user restore their seed and now has to select the seed.
    DeviceIndexSelection {
        root_mnemonic: bip39::Mnemonic,
        social_recovery_state: Option<SocialRecoveryState>,
        encrypted_device_identifier: String,
    },
}

#[derive(Deserialize, Clone)]
pub(crate) struct AppStateJsonV0 {
    #[allow(dead_code)]
    #[deprecated = "We use serde tag instead of format_version"]
    #[serde(skip)]
    format_version: (),

    #[allow(dead_code)]
    #[deprecated = "Now we only store encrypted device ID. Do not reuse this field name."]
    #[serde(skip)]
    device_identifier: (),

    // Social recovery state
    social_recovery_state: Option<SocialRecoveryState>,

    /// The default value for existing users is 0 (field is not present).
    #[serde(default = "default_device_index")]
    device_index: Option<u8>,

    /// device identifier might be absent in v0.
    encrypted_device_identifier_v2: Option<String>,

    /// Matrix tokens for client with sliding sync.
    ///
    /// This will never be set on new users, only migrating users will have
    /// this.
    #[serde(rename = "matrix_session")]
    pub matrix_session_sliding_sync_proxy: Option<MatrixSession>,

    /// Matrix tokens for client with native sliding sync
    pub matrix_session_native_sync: Option<MatrixSession>,

    #[serde(flatten)]
    base: AppStateJsonBase,
}

// Some shared fields between V0 and V1 committed
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct AppStateJsonBase {
    /// Root mnemonic that's used to derive all secrets in the app
    pub(super) root_mnemonic: bip39::Mnemonic,

    /// Mapping of federation ID => FederationInfo
    pub joined_federations: BTreeMap<String, FederationInfo>,

    /// Mapping of community invite code => CommunityInfo
    #[serde(default)]
    pub joined_communities: BTreeMap<String, CommunityInfo>,

    pub sensitive_log: Option<bool>,

    /// Device identifier is used to give this device a name that Fedi's
    /// device registration service can store. We store an encrypted
    /// string version of it so that we can reuse the same
    /// ciphertext when communicating with Fedi's device
    /// registration service regarding this device's registration
    /// status. encrypted_device_identifier_v1 is an optional type
    /// because it's not guaranteed to exist on disk (in case user
    /// started recovery and didn't complete it).
    ///
    /// If registering with encrypted_device_identifier_v2 fails and
    /// encrypted_device_identifier_v1 is Some(), then we will attempt to
    /// verify this device's ownership of device_index using
    /// encrypted_device_identifier_v1 before transferring ownership to
    /// encrypted_device_identifier_v2. After this "transfer of ownership"
    /// has been completed, we will set
    /// encrypted_device_identifier_v1 to None so that it will never
    /// be of any use to us again.
    #[deprecated = "Post-migration, only use encrypted_device_identifier_v2"]
    #[serde(rename = "encrypted_device_identifier")]
    pub(super) encrypted_device_identifier_v1: Option<String>,

    /// Every so often, we renew this device's registration against the
    /// given seed + device identifier + device index with Fedi's
    /// device registration service. Here we store the timestamp of
    /// the last successful registration renewal.
    pub last_device_registration_timestamp: Option<SystemTime>,

    /// Always incrementing counter for [`DatabaseInfo::DatabasePrefix`].
    /// See [`AppState::new_federation_db_prefix`].
    #[serde(default = "default_next_federation_prefix")]
    pub(super) next_federation_db_prefix: u64,

    pub matrix_display_name: Option<String>,

    /// App State stores a cached copy of the app's display currency along
    /// with the BTC -> display currency exchange rate. This cached
    /// info is used to attach historical fiat values to TXs as they
    /// are recorded.
    pub cached_fiat_fx_info: Option<FiatFXInfo>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceIdentifier {
    pub(crate) device_name: String,
    pub(crate) device_type: String,
    pub(crate) device_uuid: String,
}

pub(crate) fn default_device_index() -> Option<u8> {
    Some(0)
}

pub(crate) fn default_next_federation_prefix() -> u64 {
    FIRST_FEDERATION_DB_PREFIX
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct FederationInfo {
    /// The version of the federation, mostly characterized by consensus
    /// version
    pub version: u32,

    #[serde(flatten)]
    pub database: DatabaseInfo,

    /// The Fedi fee schedule to use for transactions made by the user
    /// within this federation.
    #[serde(default)]
    pub fedi_fee_schedule: FediFeeSchedule,
}

/// { database_name: String } | { database_prefix: u64 }
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseInfo {
    /// The name used for the database file for the federation's
    /// fedimint-client instance on disk.
    /// Used for previously joined federations before prefix based database
    /// was introduced.
    DatabaseName(String),
    /// All fedimint clients shares the same global database using db
    /// prefixes for isolation.
    DatabasePrefix(u64),
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct FediFeeSchedule {
    /// The minimum amount of fee in msat that must be accrued before an
    /// attempt is made to remit it to Fedi.
    pub remittance_threshold_msat: u64,

    /// Different types of transactions may have different fees. So each
    /// known module (identified by ModuleKind) has its own fee
    /// schedule for its transactions.
    pub modules: BTreeMap<ModuleKind, ModuleFediFeeSchedule>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct ModuleFediFeeSchedule {
    /// Represents the fee to charge on the amount in ppm whenever a module
    /// contributes an input to a transaction.
    pub send_ppm: u64,

    /// Represents the fee to charge on the amount in ppm whenever a module
    /// contributes an output to a transaction.
    pub receive_ppm: u64,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct CommunityInfo {
    /// Meta field captures the full JSON object for the community as
    /// fetched from server. We keep this in AppState so we can
    /// reload from disk on app restart, and also to be able to diff
    /// and notify the front-end in case of any updates.
    pub meta: CommunityJson,
}

/// When fetching the Community's JSON file and deserializing it, we expect
/// the name, and version to always be there. All other fields are
/// encapsulated in the "meta" map and the front-end can decide how best
/// to utilize them.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommunityJson {
    pub name: String,
    pub version: u32,
    #[serde(flatten)]
    pub meta: BTreeMap<String, String>,
}

// In order to display time-of-transaction fiat rate and currency, we need to
// store this info for each transaction. We store the currency code as simply a
// string so that new currency codes added on the front-end side don't require
// additional bridge work. The rate is recorded as hundredths per btc, which
// would typically correspond to cents per btc.
#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FiatFXInfo {
    /// Code of the currency that's set as display currency in the app.
    pub fiat_code: String,

    /// 1 BTC equivalent in the display currency. This value is recorded in
    /// hundredths, such as cents.
    #[ts(type = "number")]
    pub btc_to_fiat_hundredths: u64,
}

impl AppStateJson {
    pub(crate) fn from_v0(
        value: AppStateJsonV0,
        device_identifier: DeviceIdentifier,
    ) -> anyhow::Result<Self> {
        // matrix or federations
        // frontend used only matrix for onboarding screen check, we also check joined
        // federations
        let was_seed_committed = value.matrix_session_native_sync.is_some()
            || value.matrix_session_sliding_sync_proxy.is_some()
            || !value.base.joined_federations.is_empty();

        let encrypt_device_identifier = || {
            assert!(was_seed_committed); // sanity
            let root_secret =
                Bip39RootSecretStrategy::<12>::to_root_secret(&value.base.root_mnemonic);
            device_identifier
                .encrypt_and_hex_encode(&root_secret)
                .context("encryption failed")
        };

        let v1 = match (
            was_seed_committed,
            value.device_index,
            value.social_recovery_state.clone(),
        ) {
            (true, Some(device_index), social_recovery_state) => {
                AppStateJson::Onboarded(AppStateJsonOnboarded {
                    encrypted_device_identifier_v2: if let Some(value) =
                        value.encrypted_device_identifier_v2
                    {
                        value
                    } else {
                        encrypt_device_identifier()?
                    },
                    matrix_session: value.matrix_session_native_sync,
                    device_index,
                    social_recovery_state,
                    internal_bridge_export: false,
                    base: value.base,
                })
            }
            // device index doesn't matter if seed is not committed
            (false, _, Some(social_recovery)) => AppStateJson::Onboarding(AppStateJsonOnboarding {
                stage: OnboardingStage::SocialRecovery {
                    state: social_recovery,
                },
            }),
            (false, _, None) => AppStateJson::Onboarding(AppStateJsonOnboarding {
                stage: OnboardingStage::Init {},
            }),
            // seed is final, but device index selection is pending
            (true, None, social_recovery_state) => {
                AppStateJson::Onboarding(AppStateJsonOnboarding {
                    stage: OnboardingStage::DeviceIndexSelection {
                        encrypted_device_identifier: encrypt_device_identifier()?,
                        root_mnemonic: value.base.root_mnemonic,
                        social_recovery_state,
                    },
                })
            }
        };
        Ok(v1)
    }
}

impl FromStr for DeviceIdentifier {
    type Err = anyhow::Error;

    // example: iPhone7,2:Mobile:3d8f8f3d-8f3d-3d8f-8f3d-3d8f8f3d8f3d
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let parts = s.split(':').collect::<Vec<_>>();
        ensure!(
            parts.len() == 3,
            "Identifier format must be <name>:<type>:<uuid>"
        );
        let mut device_name = parts[0].to_owned();
        let device_type = parts[1].to_owned();
        let device_uuid = parts[2].to_owned();

        // Truncate device_name as needed to ensure device identifier can be displayed
        // within max 128 characters. We need to ensure that device_type and device_uuid
        // can fit within 128 - 2 (for :'s) characters.
        let remaining_len = DEVICE_IDENTIFIER_FIXED_LENGTH
            .checked_sub(device_type.len() + device_uuid.len() + 2)
            .ok_or(anyhow!(
                "Combined length of device type and uuid exceeds max"
            ))?;
        device_name.truncate(remaining_len);
        Ok(Self {
            device_name,
            device_type,
            device_uuid,
        })
    }
}

impl Display for DeviceIdentifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{}:{}",
            self.device_name, self.device_type, self.device_uuid
        )
    }
}

impl DeviceIdentifier {
    pub fn encrypt_and_hex_encode(&self, root_secret: &DerivableSecret) -> anyhow::Result<String> {
        let device_id_encryption_secret = root_secret.child_key(DEVICE_REGISTRATION_CHILD_ID);
        // Pad if necessary -> encrypt -> hex-encode
        let padded = format!("{self:DEVICE_IDENTIFIER_FIXED_LENGTH$}");
        let encrypted = fedimint_aead::encrypt(
            padded.into(),
            &LessSafeKey::new(device_id_encryption_secret.to_chacha20_poly1305_key()),
        )?;
        Ok(hex::encode(encrypted))
    }

    pub fn from_encrypted_string(
        encrypted_device_identifier: &str,
        root_secret: &DerivableSecret,
    ) -> anyhow::Result<Self> {
        let device_id_encryption_secret = root_secret.child_key(DEVICE_REGISTRATION_CHILD_ID);
        // Hex-decode -> decrypt -> trim padding
        let mut decoded = hex::decode(encrypted_device_identifier)?;
        let decrypted_bytes = decrypt(
            &mut decoded,
            &LessSafeKey::new(device_id_encryption_secret.to_chacha20_poly1305_key()),
        )?;
        let decrypted_string = String::from_utf8(decrypted_bytes.to_vec())?;
        let unpadded_string = decrypted_string.trim_end();
        FromStr::from_str(unpadded_string)
    }
}

impl Default for FediFeeSchedule {
    fn default() -> Self {
        let mut modules = BTreeMap::new();
        let default_send_ppm = 2100; // 21 BPS
        modules.insert(
            fedimint_mint_client::KIND,
            ModuleFediFeeSchedule {
                send_ppm: 0,
                receive_ppm: 0,
            },
        );
        modules.insert(
            fedimint_ln_common::KIND,
            ModuleFediFeeSchedule {
                send_ppm: default_send_ppm,
                receive_ppm: 0,
            },
        );
        modules.insert(
            fedimint_wallet_client::KIND,
            ModuleFediFeeSchedule {
                send_ppm: 0,
                receive_ppm: 0,
            },
        );
        modules.insert(
            stability_pool_client_old::common::KIND,
            ModuleFediFeeSchedule {
                send_ppm: default_send_ppm,
                receive_ppm: 0,
            },
        );
        modules.insert(
            stability_pool_client::common::KIND,
            ModuleFediFeeSchedule {
                send_ppm: default_send_ppm,
                receive_ppm: 0,
            },
        );
        Self {
            remittance_threshold_msat: 100_000,
            modules,
        }
    }
}
