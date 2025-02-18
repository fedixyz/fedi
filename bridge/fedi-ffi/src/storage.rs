use std::collections::BTreeMap;
use std::fmt::Display;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;
use std::time::SystemTime;

use anyhow::{anyhow, bail, ensure, Context};
use fedi_social_client::SocialRecoveryState;
use fedimint_aead::{decrypt, LessSafeKey};
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy;
use fedimint_core::core::ModuleKind;
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send};
use fedimint_derive_secret::DerivableSecret;
use matrix_sdk::matrix_auth::MatrixSession;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::error;
use ts_rs::TS;

use crate::community::CommunityJson;
use crate::constants::{
    DEVICE_IDENTIFIER_FIXED_LENGTH, DEVICE_REGISTRATION_CHILD_ID, FEDI_FILE_PATH,
};

#[apply(async_trait_maybe_send!)]
pub trait IStorage: 'static + MaybeSend + MaybeSync {
    async fn federation_database_v2(
        &self,
        db_name: &str,
    ) -> anyhow::Result<fedimint_core::db::Database>;
    async fn delete_federation_db(&self, db_name: &str) -> anyhow::Result<()>;
    async fn read_file(&self, path: &Path) -> anyhow::Result<Option<Vec<u8>>>;
    async fn write_file(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()>;
    #[cfg(not(target_family = "wasm"))]
    fn write_file_sync(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()>;
    /// convert a relative path to a path understood by the platform.
    fn platform_path(&self, path: &Path) -> PathBuf;
}

pub type Storage = Arc<dyn IStorage>;

/// Rust representation of the JSON schema of the app state file. Contains all
/// necessary information related to joined federations and communities, device
/// registration, as well as matrix.
///
/// NOTE: when removing a field, we want to ensure that the field is never
/// reused for anything else. So it's preferable to change the type of the field
/// to () and mark it as deprecated.
#[derive(Serialize, Deserialize, Clone)]
pub struct AppStateRaw {
    /// Version indicator for the app state
    pub format_version: u32,

    /// Root mnemonic that's used to derive all secrets in the app
    root_mnemonic: bip39::Mnemonic,

    /// Mapping of federation ID => FederationInfo
    pub joined_federations: BTreeMap<String, FederationInfo>,

    /// Mapping of community invite code => CommunityInfo
    #[serde(default)]
    pub joined_communities: BTreeMap<String, CommunityInfo>,

    // Social recovery state
    pub social_recovery_state: Option<SocialRecoveryState>,

    pub sensitive_log: Option<bool>,
    pub matrix_session: Option<MatrixSession>,

    #[allow(dead_code)]
    #[deprecated = "Now we only store encrypted device ID. Do not reuse this field name."]
    #[serde(skip)]
    device_identifier: (),

    /// Device identifier is used to give this device a name that Fedi's device
    /// registration service can store. We store an encrypted string version
    /// of it so that we can reuse the same ciphertext when communicating
    /// with Fedi's device registration service regarding this
    /// device's registration status.
    /// encrypted_device_identifier_v1 is an optional type because it's not
    /// guaranteed to exist on disk (in case user started recovery and
    /// didn't complete it).
    ///
    /// If registering with encrypted_device_identifier_v2 fails and
    /// encrypted_device_identifier_v1 is Some(), then we will attempt to
    /// verify this device's ownership of device_index using
    /// encrypted_device_identifier_v1 before transferring ownership to
    /// encrypted_device_identifier_v2. After this "transfer of ownership" has
    /// been completed, we will set encrypted_device_identifier_v1 to None
    /// so that it will never be of any use to us again.
    #[deprecated = "Post-migration, only use encrypted_device_identifier_v2"]
    #[serde(rename = "encrypted_device_identifier")]
    encrypted_device_identifier_v1: Option<String>,

    /// V2 of the encrypted device identifier comes with new guarantees from the
    /// front-end. Specifically:
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
    /// Note that even though this field is delcared Option<String>, we will
    /// enforce its non-optionality in the code, because device ID is
    /// provided as non-optional to Bridge::new()
    encrypted_device_identifier_v2: Option<String>,

    /// Device index identifies which device number this is under the same root
    /// seed as registered with Fedi's device registration service. This
    /// index is used in the derivation path for the fedimint-client root
    /// secret. So in a way, it's a way of ensuring that a user's/seed's
    /// different per-federation "accounts" (across multiple devices) don't
    /// conflict with each other.
    ///
    /// The default value for existing users, as well as for new users with
    /// fresh seed is 0. But this value is an Option because in the case of
    /// recovery, we need to guide the user through the flow of setting up a
    /// device index before they can continue using the app as usual.
    #[serde(default = "default_device_index")]
    device_index: Option<u8>,

    /// Every so often, we renew this device's registration against the given
    /// seed + device identifier + device index with Fedi's device
    /// registration service. Here we store the timestamp of the last
    /// successful registration renewal.
    pub last_device_registration_timestamp: Option<SystemTime>,

    /// Always incrementing counter for [`DatabaseInfo::DatabasePrefix`].
    /// See [`AppState::new_federation_db_prefix`].
    #[serde(default = "default_next_federation_prefix")]
    next_federation_db_prefix: u64,

    pub matrix_display_name: Option<String>,

    /// App State stores a cached copy of the app's display currency along with
    /// the BTC -> display currency exchange rate. This cached info is used
    /// to attach historical fiat values to TXs as they are recorded.
    pub cached_fiat_fx_info: Option<FiatFXInfo>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceIdentifier {
    device_name: String,
    device_type: String,
    device_uuid: String,
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
        let padded = format!("{:width$}", self, width = DEVICE_IDENTIFIER_FIXED_LENGTH);
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

fn default_device_index() -> Option<u8> {
    Some(0)
}

fn default_next_federation_prefix() -> u64 {
    // zero is reserved for future
    1
}

#[derive(Clone, Serialize, Deserialize)]
pub struct FederationInfo {
    /// The version of the federation, mostly characterized by consensus version
    pub version: u32,

    #[serde(flatten)]
    pub database: DatabaseInfo,

    /// The Fedi fee schedule to use for transactions made by the user within
    /// this federation.
    #[serde(default)]
    pub fedi_fee_schedule: FediFeeSchedule,
}

/// { database_name: String } | { database_prefix: u64 }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseInfo {
    /// The name used for the database file for the federation's fedimint-client
    /// instance on disk.
    /// Used for previously joined federations before prefix based database was
    /// introduced.
    DatabaseName(String),
    /// All fedimint clients shares the same global database using db prefixes
    /// for isolation.
    DatabasePrefix(u64),
}

#[derive(Clone, Serialize, Deserialize)]
pub struct FediFeeSchedule {
    /// The minimum amount of fee in msat that must be accrued before an attempt
    /// is made to remit it to Fedi.
    pub remittance_threshold_msat: u64,

    /// Different types of transactions may have different fees. So each known
    /// module (identified by ModuleKind) has its own fee schedule for its
    /// transactions.
    pub modules: BTreeMap<ModuleKind, ModuleFediFeeSchedule>,
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
        Self {
            remittance_threshold_msat: 100_000,
            modules,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ModuleFediFeeSchedule {
    /// Represents the fee to charge on the amount in ppm whenever a module
    /// contributes an input to a transaction.
    pub send_ppm: u64,

    /// Represents the fee to charge on the amount in ppm whenever a module
    /// contributes an output to a transaction.
    pub receive_ppm: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CommunityInfo {
    /// Meta field captures the full JSON object for the community as fetched
    /// from server. We keep this in AppState so we can reload from disk on app
    /// restart, and also to be able to diff and notify the front-end in
    /// case of any updates.
    pub meta: CommunityJson,
}

// In order to display time-of-transaction fiat rate and currency, we need to
// store this info for each transaction. We store the currency code as simply a
// string so that new currency codes added on the front-end side don't require
// additional bridge work. The rate is recorded as hundredths per btc, which
// would typically correspond to cents per btc.
#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable)]
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

pub struct AppState {
    // Arc surrounding RwLock<AppStateRaw> is required to be able to move the (owned) write lock
    // within the spawn_blocking task in the with_write_lock() function.
    raw: Arc<RwLock<AppStateRaw>>,
    storage: Storage,
}

impl AppState {
    /// Loads from existing file if present. If not, attempts to read from
    /// legacy global DB and writes to a new file (migration). If migration
    /// results in error, just loads a default empty file.
    pub async fn load(
        storage: Storage,
        new_identifier_v2: DeviceIdentifier,
    ) -> anyhow::Result<Self> {
        if let Some(state) =
            AppState::existing_from_storage(storage.clone(), new_identifier_v2.clone()).await?
        {
            Ok(state)
        } else {
            Self::default_with_storage(storage, new_identifier_v2).await
        }
    }

    async fn existing_from_storage(
        storage: Storage,
        device_identifier_v2: DeviceIdentifier,
    ) -> anyhow::Result<Option<Self>> {
        let Some(app_state_raw) = storage.read_file(Path::new(FEDI_FILE_PATH)).await? else {
            return Ok(None);
        };

        let Some(value) = Self::parse(app_state_raw)? else {
            return Ok(None);
        };

        let app_state = Self {
            raw: RwLock::new(value).into(),
            storage,
        };

        app_state
            .with_write_lock(|state| {
                // If encrypted_device_identifier_v2 is missing in JSON file on disk,
                // immediately fill it in and write it to disk
                if state.encrypted_device_identifier_v2.is_none() {
                    let root_secret =
                        Bip39RootSecretStrategy::<12>::to_root_secret(&state.root_mnemonic);
                    let encrypted_device_identifier = device_identifier_v2
                        .encrypt_and_hex_encode(&root_secret)
                        .context("Encrypting a valid device identifier must not fail")?;
                    state.encrypted_device_identifier_v2 = Some(encrypted_device_identifier)
                }

                Ok::<_, anyhow::Error>(())
            })
            .await??;

        Ok(Some(app_state))
    }

    fn parse(app_state_raw: Vec<u8>) -> Result<Option<AppStateRaw>, anyhow::Error> {
        #[derive(Clone, Deserialize)]
        struct HasFormatVersion {
            #[allow(unused)]
            format_version: u32,
        }
        if let Err(err) = serde_json::from_slice::<HasFormatVersion>(&app_state_raw) {
            error!(%err, "invalid fedi file");
            return Ok(None);
        }
        Ok(Some(serde_json::from_slice(&app_state_raw)?))
    }

    async fn default_with_storage(
        storage: Storage,
        device_identifier_v2: DeviceIdentifier,
    ) -> anyhow::Result<Self> {
        let root_mnemonic = Bip39RootSecretStrategy::<12>::random(&mut rand::thread_rng());
        let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&root_mnemonic);
        let encrypted_device_identifier = device_identifier_v2
            .encrypt_and_hex_encode(&root_secret)
            .context("Encrypting a valid device identifier must not fail")?;
        #[allow(deprecated)]
        let app_state = Self {
            raw: RwLock::new(AppStateRaw {
                format_version: 0,
                root_mnemonic,
                joined_federations: BTreeMap::new(),
                joined_communities: BTreeMap::new(),
                social_recovery_state: None,
                sensitive_log: None,
                matrix_session: None,
                device_identifier: (),
                // When setting up a new AppState (fresh install), set
                // encrypted_device_identifier_v1 as None which marks the transfer of ownership as
                // complete.
                encrypted_device_identifier_v1: None,
                encrypted_device_identifier_v2: Some(encrypted_device_identifier),
                device_index: default_device_index(),
                last_device_registration_timestamp: None,
                next_federation_db_prefix: default_next_federation_prefix(),
                matrix_display_name: None,
                cached_fiat_fx_info: None,
            })
            .into(),
            storage,
        };

        // Write immediately before returning
        app_state.with_write_lock(|_| ()).await?;
        Ok(app_state)
    }

    pub async fn with_read_lock<T, F>(&self, closure: F) -> T
    where
        F: FnOnce(&AppStateRaw) -> T,
    {
        let app_state_read_lock = self.raw.read().await;
        closure(&app_state_read_lock)
    }

    pub async fn with_write_lock<F, T>(&self, closure: F) -> anyhow::Result<T>
    where
        F: FnOnce(&mut AppStateRaw) -> T,
    {
        let mut app_state_write_lock = self.raw.clone().write_owned().await;
        let mut app_state_copy = app_state_write_lock.clone();
        let result = closure(&mut app_state_copy);

        // Ensure no caller of with_write_lock has the ability to set device ID as none
        assert!(
            app_state_copy.encrypted_device_identifier_v2.is_some(),
            "Cannot clear device ID from AppState!"
        );

        #[cfg(not(target_family = "wasm"))]
        {
            let storage = self.storage.clone();
            tokio::task::spawn_blocking(move || {
                storage.write_file_sync(
                    Path::new(FEDI_FILE_PATH),
                    serde_json::to_vec::<AppStateRaw>(&app_state_copy)?,
                )?;
                *app_state_write_lock = app_state_copy;
                Ok::<(), anyhow::Error>(())
            })
            .await??;
        }
        // wasm has async storage
        #[cfg(target_family = "wasm")]
        {
            self.storage
                .write_file(
                    Path::new(FEDI_FILE_PATH),
                    serde_json::to_vec::<AppStateRaw>(&app_state_copy)?,
                )
                .await?;
            *app_state_write_lock = app_state_copy;
        }

        Ok(result)
    }

    pub async fn device_identifier(&self) -> DeviceIdentifier {
        let root_secret = self.root_secret().await;
        let enc = self.encrypted_device_identifier().await;
        DeviceIdentifier::from_encrypted_string(&enc, &root_secret)
            .expect("Device ID decryption from disk must never fail")
    }

    pub async fn encrypted_device_identifier(&self) -> String {
        self.with_read_lock(|state| state.encrypted_device_identifier_v2.clone())
            .await
            .expect("encrypted_device_identifier_v2 must exist in AppState")
    }

    #[deprecated = "Only use as part of v1->v2 registration migration"]
    pub async fn encrypted_device_identifier_v1(&self) -> Option<String> {
        #[allow(deprecated)]
        self.with_read_lock(|state| state.encrypted_device_identifier_v1.clone())
            .await
    }

    #[deprecated = "Only use as part of v1->v2 registration migration"]
    pub async fn clear_encrypted_device_identifier_v1(&self) -> anyhow::Result<()> {
        #[allow(deprecated)]
        self.with_write_lock(|state| state.encrypted_device_identifier_v1 = None)
            .await
    }

    /// Always present if federations are present.
    pub async fn ensure_device_index(&self) -> anyhow::Result<u8> {
        self.device_index()
            .await
            .ok_or(anyhow!("device_index not set"))
    }

    pub async fn device_index(&self) -> Option<u8> {
        self.with_read_lock(|state| state.device_index).await
    }

    pub async fn set_device_index(&self, index: u8) -> anyhow::Result<()> {
        self.with_write_lock(|state| {
            if !state.joined_federations.is_empty() {
                bail!("joined federations is not empty")
            } else {
                state.device_index = Some(index);
                Ok(())
            }
        })
        .await?
    }

    pub async fn root_mnemonic(&self) -> bip39::Mnemonic {
        self.with_read_lock(|state| state.root_mnemonic.clone())
            .await
    }

    pub async fn root_secret(&self) -> DerivableSecret {
        self.with_read_lock(|state| {
            Bip39RootSecretStrategy::<12>::to_root_secret(&state.root_mnemonic)
        })
        .await
    }

    /// Recover to a seed, fails if state has joined any federation.
    /// Also resets the device index.
    pub async fn recover_mnemonic(&self, mnemonic: bip39::Mnemonic) -> anyhow::Result<()> {
        let old_root_secret = self.root_secret().await;
        self.with_write_lock(|state| {
            if !state.joined_federations.is_empty() {
                bail!("Cannot recover while joined federations exist");
            }

            // Update mnemonic
            state.root_mnemonic = mnemonic;

            // Re-encrypt device identifier using new root secret
            let device_identifier = DeviceIdentifier::from_encrypted_string(
                &state
                    .encrypted_device_identifier_v2
                    .clone()
                    .expect("encrypted_device_identifier_v2 must exist in AppState"),
                &old_root_secret,
            )?;

            let new_root_secret =
                Bip39RootSecretStrategy::<12>::to_root_secret(&state.root_mnemonic);
            state.encrypted_device_identifier_v2 =
                Some(device_identifier.encrypt_and_hex_encode(&new_root_secret)?);

            // Device index needs to be cleared, one will be assigned at the end of the
            // recovery flow
            state.device_index = None;
            Ok(())
        })
        .await??;
        Ok(())
    }

    /// Get a new prefix for joining a federation.
    pub async fn new_federation_db_prefix(&self) -> anyhow::Result<u64> {
        self.with_write_lock(|x| {
            let value = x.next_federation_db_prefix;
            x.next_federation_db_prefix += 1;
            value
        })
        .await
    }

    pub async fn get_cached_fiat_fx_info(&self) -> Option<FiatFXInfo> {
        self.with_read_lock(|state| state.cached_fiat_fx_info.clone())
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_old_fedi_file_compatible() {
        let old_file = String::from(r#"{"federations": {"s": "y"}}"#);
        assert!(AppState::parse(old_file.into()).unwrap().is_none());
    }
    #[test]
    fn test_fedi_file_seed_is_not_overwritten() {
        let old_file = String::from(r#"{"format_version": 0, "root_seed": "foo"}"#);
        assert!(AppState::parse(old_file.into()).is_err());
    }
}
