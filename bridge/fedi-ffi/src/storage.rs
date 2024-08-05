use std::collections::BTreeMap;
use std::fmt::Display;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;
use std::time::SystemTime;

use anyhow::{anyhow, bail, ensure};
use fedi_social_client::SocialRecoveryState;
use fedimint_aead::LessSafeKey;
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy;
use fedimint_core::core::ModuleKind;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send};
use fedimint_derive_secret::DerivableSecret;
use matrix_sdk::matrix_auth::MatrixSession;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{error, info, warn};

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
    /// convert a relative path to a path understood by the platform.
    fn platform_path(&self, path: &Path) -> PathBuf;
}

pub type Storage = Arc<dyn IStorage>;

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

    // Device identifier is used to give this device a name that Fedi's device registration service
    // can store. We store an encrypted string version of it separately so that we can reuse the
    // same ciphertext when communicating with Fedi's device registration service regarding this
    // device's registration status.
    device_identifier: Option<DeviceIdentifier>,
    encrypted_device_identifier: Option<String>,

    // Device index identifies which device number this is under the same root seed as registered
    // with Fedi's device registration service. This index is used in the derivation path for the
    // fedimint-client root secret. So in a way, it's a way of ensuring that a user's/seed's
    // different per-federation "accounts" (across multiple devices) don't conflict with each
    // other.
    //
    // The default value for existing users, as well as for new users with fresh seed is 0. But
    // this value is an Option because in the case of recovery, we need to guide the user
    // through the flow of setting up a device index before they can continue using the app as
    // usual.
    #[serde(default = "default_device_index")]
    device_index: Option<u8>,

    // Every so often, we renew this device's registration against the given seed + device
    // identifier + device index with Fedi's device registration service. Here we store the
    // timestamp of the last successful registration renewal.
    pub last_device_registration_timestamp: Option<SystemTime>,

    /// Always incrementing counter for [`DatabaseInfo::DatabasePrefix`].
    /// See [`AppState::new_federation_db_prefix`].
    #[serde(default = "default_next_federation_prefix")]
    next_federation_db_prefix: u64,

    pub matrix_display_name: Option<String>,
    // NOTE: if you ever remove fields from AppState, don't delete the field.
    // just comment it out to prevent field reuse in future.
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

impl Serialize for DeviceIdentifier {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for DeviceIdentifier {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        FromStr::from_str(&s).map_err(serde::de::Error::custom)
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

pub struct AppState {
    raw: RwLock<Arc<AppStateRaw>>,
    storage: Storage,
}

impl AppState {
    /// Loads from existing file if present. If not, attempts to read from
    /// legacy global DB and writes to a new file (migration). If migration
    /// results in error, just loads a default empty file.
    pub async fn load(storage: Storage) -> anyhow::Result<Self> {
        if let Some(state) = AppState::existing_from_storage(storage.clone()).await? {
            Ok(state)
        } else {
            let app_state = Self::default_with_storage(storage).await;
            // write the app state to storage
            app_state.with_write_lock(|_| ()).await?;
            Ok(app_state)
        }
    }

    async fn existing_from_storage(storage: Storage) -> anyhow::Result<Option<Self>> {
        let Some(app_state_raw) = storage.read_file(Path::new(FEDI_FILE_PATH)).await? else {
            return Ok(None);
        };

        let Some(value) = Self::parse(app_state_raw)? else {
            return Ok(None);
        };

        Ok(Some(Self {
            raw: RwLock::new(Arc::new(value)),
            storage,
        }))
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

    async fn default_with_storage(storage: Storage) -> Self {
        Self {
            raw: RwLock::new(Arc::new(AppStateRaw {
                format_version: 0,
                root_mnemonic: Bip39RootSecretStrategy::<12>::random(&mut rand::thread_rng()),
                joined_federations: BTreeMap::new(),
                joined_communities: BTreeMap::new(),
                social_recovery_state: None,
                sensitive_log: None,
                matrix_session: None,
                device_identifier: None,
                encrypted_device_identifier: None,
                device_index: default_device_index(),
                last_device_registration_timestamp: None,
                next_federation_db_prefix: default_next_federation_prefix(),
                matrix_display_name: None,
            })),
            storage,
        }
    }

    pub async fn with_read_lock<T, F>(&self, closure: F) -> T
    where
        F: FnOnce(&AppStateRaw) -> T,
    {
        let app_state_raw = self.raw.read().await.clone();
        closure(&app_state_raw)
    }

    pub async fn with_write_lock<F, T>(&self, closure: F) -> anyhow::Result<T>
    where
        F: FnOnce(&mut AppStateRaw) -> T,
    {
        let mut app_state_in_memory = self.raw.write().await;

        let mut app_state_raw_new = app_state_in_memory.as_ref().clone();
        let result = closure(&mut app_state_raw_new);

        self.storage
            .write_file(
                Path::new(FEDI_FILE_PATH),
                serde_json::to_vec::<AppStateRaw>(&app_state_raw_new)?,
            )
            .await?;
        *app_state_in_memory = Arc::new(app_state_raw_new);
        Ok(result)
    }

    /// Compares the given new device identifier with the existing device
    /// identifier. If no existing device identifier, sets is as the new
    /// device identifier. Otherwise, logs the comparison and returns the
    /// existing device identifier.
    pub async fn verify_and_return_device_identifier(
        &self,
        new_identifier: DeviceIdentifier,
    ) -> anyhow::Result<DeviceIdentifier> {
        match self
            .with_read_lock(|state| state.device_identifier.clone())
            .await
        {
            Some(id) if id != new_identifier => {
                warn!("New device identifier ({new_identifier}) doesn't match existing one ({id})");
                Ok(id)
            }
            Some(id) => {
                info!("Device identifier unchaged: {id}");
                Ok(id)
            }
            None => {
                info!("Device identifier absent, setting as: {new_identifier}");
                self.with_write_lock(|state| {
                    state.device_identifier = Some(new_identifier.clone())
                })
                .await?;
                Ok(new_identifier)
            }
        }
    }

    pub async fn device_identifier(&self) -> Option<DeviceIdentifier> {
        self.with_read_lock(|state| state.device_identifier.clone())
            .await
    }

    // If an encrypted_device_identifier is set in AppState, returns it. If not,
    // computes the ciphertext using the root_mnemonic, stores it, and returns it.
    // However if device_identifier is not set to begin with, returns an error.
    pub async fn encrypted_device_identifier(&self) -> anyhow::Result<String> {
        match self
            .with_read_lock(|state| state.encrypted_device_identifier.clone())
            .await
        {
            Some(enc) => Ok(enc),
            None => match self.device_identifier().await {
                Some(identifier) => {
                    let enc = identifier.encrypt_and_hex_encode(&self.root_secret().await)?;
                    self.with_write_lock(|state| {
                        state.encrypted_device_identifier = Some(enc.clone())
                    })
                    .await?;
                    Ok(enc)
                }
                None => Err(anyhow!(
                    "Device identifier must be set prior to requesting encryption"
                )),
            },
        }
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
        self.with_write_lock(|state| {
            if !state.joined_federations.is_empty() {
                bail!("Cannot recover while joined federations exist");
            }
            state.root_mnemonic = mnemonic;
            // Clear encrypted device identifier since the seed has changed. It will be
            // re-encrypted and stored when queried for again.
            state.encrypted_device_identifier = None;
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
