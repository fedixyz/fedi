use std::collections::{BTreeMap, BTreeSet};
use std::ops::Not;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context as _, bail};
use api_types::invoice_generator::FirstCommunityInviteCodeState;
use either::Either;
use fedi_social_client::SocialRecoveryState;
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send, impl_db_record};
use fedimint_derive_secret::DerivableSecret;
use rand::rngs::OsRng;
use state::{
    AppStateJson, AppStateJsonBase, AppStateJsonOnboarded, AppStateJsonOnboarding,
    DeviceIdentifier, OnboardingMethod, OnboardingStage, default_next_federation_prefix,
};
use tokio::sync::RwLock;

use crate::constants::{FEDI_FILE_V0_PATH, FEDI_GIFT_EXCLUDED_COMMUNITIES};
use crate::db::BridgeDbPrefix;

pub mod state;

// Within the global DB, each federation's DB uses a prefix assigned using an
// incrementing nonce.
const FIRST_FEDERATION_DB_PREFIX: u64 = 1;

// Prefix 0 is reserved for the bridge itself to store information independent
// of any federation's DB.
pub const BRIDGE_DB_PREFIX: u8 = 0;

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

// base for both AppState and AppStateSeedUncommitted
#[derive(Clone)]
struct AppStateStore {
    raw: Arc<RwLock<state::AppStateJson>>,
    bridge_db: Database,
}

// allows clone because transition to seed_committed = true -> false is not
// allowed
#[derive(Clone)]
pub struct AppState {
    // invariant: AppStateJsonV1 is Committed
    store: AppStateStore,
}

// invariant: AppStateJsonV1 is Uncommitted
pub struct AppStateOnboarding {
    store: AppStateStore,
}

#[derive(Debug, Encodable, Decodable)]
struct AppStateDbKey;
impl_db_record!(
    key = AppStateDbKey,
    value = AppStateJson,
    db_prefix = BridgeDbPrefix::AppState
);

impl AppStateStore {
    pub async fn with_read_lock<T, F>(&self, closure: F) -> T
    where
        F: FnOnce(&AppStateJson) -> T,
    {
        let app_state_read_lock = self.raw.read().await;
        {
            let mut dbtx = self.bridge_db.begin_transaction().await;
            let state_in_db = dbtx
                .get_value(&AppStateDbKey)
                .await
                .expect("app state must be present in db");
            assert_eq!(
                state_in_db, *app_state_read_lock,
                "bug: app state mismatch in db and in memory"
            );
        }
        closure(&app_state_read_lock)
    }

    pub async fn with_write_lock<F, T>(&self, closure: F) -> anyhow::Result<T>
    where
        F: FnOnce(&mut AppStateJson) -> T,
    {
        let mut in_memory_write_lock = self.raw.clone().write_owned().await;
        let mut dbtx = self.bridge_db.begin_transaction().await;
        // always read from db to avoid overwriting with stale state
        let mut state = dbtx
            .get_value(&AppStateDbKey)
            .await
            .expect("app state must be present in db");

        let result = closure(&mut state);
        dbtx.insert_entry(&AppStateDbKey, &state).await;
        dbtx.commit_tx().await;
        *in_memory_write_lock = state;
        Ok(result)
    }
}

impl AppState {
    /// Loads from database if present. If not, attempts to read from
    /// legacy fedi file and writes to global db.
    pub async fn load(
        storage: &Storage,
        global_db: &Database,
        new_identifier_v2: DeviceIdentifier,
    ) -> anyhow::Result<Either<AppState, AppStateOnboarding>> {
        let bridge_db = global_db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        let mut dbtx = bridge_db.begin_transaction().await;
        let state = if let Some(state) = dbtx.get_value(&AppStateDbKey).await {
            state
        } else {
            let state = Self::v0_from_storage(storage, new_identifier_v2)
                .await?
                .unwrap_or_else(|| {
                    // new user
                    AppStateJson::Onboarding(AppStateJsonOnboarding {
                        stage: OnboardingStage::Init {},
                    })
                });
            dbtx.insert_new_entry(&AppStateDbKey, &state).await;
            state
        };
        dbtx.commit_tx().await;

        let onboarding_complete = match &state {
            AppStateJson::Onboarded(_) => true,
            AppStateJson::Onboarding(_) => false,
        };

        let store = AppStateStore {
            raw: Arc::new(RwLock::new(state)),
            bridge_db,
        };
        if onboarding_complete {
            let app_state = AppState { store };
            // Backfill fields for "Fedi Gift" project if necessary
            app_state
                .with_write_lock(|state| {
                    let mut invite_codes: BTreeSet<_> =
                        state.joined_communities.keys().cloned().collect();

                    // First remove default community invite code from consideration
                    for &excluded in FEDI_GIFT_EXCLUDED_COMMUNITIES {
                        invite_codes.remove(excluded);
                    }

                    // Backfilling is necessary iff:
                    // - "first community" is never set
                    // - There are pre-existing joined communities
                    if state.first_comm_invite_code == FirstCommunityInviteCodeState::NeverSet
                        && invite_codes.is_empty().not()
                    {
                        // Then evaluate the remaining communities
                        if invite_codes.len() == 1 {
                            state.first_comm_invite_code = FirstCommunityInviteCodeState::Set(
                                invite_codes.first().expect("checked").to_string(),
                            );
                        } else {
                            state.first_comm_invite_code = FirstCommunityInviteCodeState::Unset; // can never be set now
                        }
                    }
                })
                .await?;
            Ok(Either::Left(app_state))
        } else {
            Ok(Either::Right(AppStateOnboarding { store }))
        }
    }

    // read from v0 file
    async fn v0_from_storage(
        storage: &Storage,
        device_identifier_v2: DeviceIdentifier,
    ) -> anyhow::Result<Option<AppStateJson>> {
        let Some(app_state_raw_v0) = storage.read_file(Path::new(FEDI_FILE_V0_PATH)).await? else {
            return Ok(None);
        };

        Ok(Some(AppStateJson::from_v0(
            serde_json::from_slice(&app_state_raw_v0)
                .context("bug: failed to parse v0 state file")?,
            device_identifier_v2,
        )?))
    }

    pub async fn with_read_lock<T, F>(&self, closure: F) -> T
    where
        F: FnOnce(&state::AppStateJsonOnboarded) -> T,
    {
        self.store
            .with_read_lock(|state| {
                let AppStateJson::Onboarded(state) = state else {
                    panic!("appstate invariant broken");
                };
                closure(state)
            })
            .await
    }

    pub async fn with_write_lock<F, T>(&self, closure: F) -> anyhow::Result<T>
    where
        F: FnOnce(&mut state::AppStateJsonOnboarded) -> T,
    {
        self.store
            .with_write_lock(|state| {
                let AppStateJson::Onboarded(state) = state else {
                    panic!("appstate invariant broken");
                };
                closure(state)
            })
            .await
    }

    pub async fn root_secret(&self) -> DerivableSecret {
        self.with_read_lock(|state| {
            Bip39RootSecretStrategy::<12>::to_root_secret(&state.root_mnemonic)
        })
        .await
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

    pub async fn device_index(&self) -> u8 {
        self.with_read_lock(|state| state.device_index).await
    }

    pub async fn onboarding_method(&self) -> Option<OnboardingMethod> {
        self.with_read_lock(|state| state.onboarding_method).await
    }

    pub async fn root_mnemonic(&self) -> bip39::Mnemonic {
        self.with_read_lock(|state| state.root_mnemonic.clone())
            .await
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

    pub async fn get_cached_fiat_fx_info(&self) -> Option<state::FiatFXInfo> {
        self.with_read_lock(|state| state.cached_fiat_fx_info.clone())
            .await
    }

    pub async fn is_internal_bridge_export(&self) -> bool {
        self.with_read_lock(|state| state.internal_bridge_export)
            .await
    }

    pub async fn set_internal_bridge_export(&self, enabled: bool) -> anyhow::Result<()> {
        self.with_write_lock(|state| state.internal_bridge_export = enabled)
            .await
    }
}

#[derive(Clone, Debug, Copy)]
pub enum OnboardingCompletionMethod {
    NewSeed,
    GotDeviceIndex(u8),
}

impl AppStateOnboarding {
    pub async fn stage(&self) -> OnboardingStage {
        self.store
            .with_read_lock(|state| {
                let AppStateJson::Onboarding(onboarding) = state else {
                    panic!("invariant of app state onboarding broken");
                };
                onboarding.stage.clone()
            })
            .await
    }

    async fn with_write_lock<F, T>(&self, closure: F) -> anyhow::Result<T>
    where
        F: FnOnce(&mut AppStateJsonOnboarding) -> T,
    {
        self.store
            .with_write_lock(|state| {
                let AppStateJson::Onboarding(state) = state else {
                    panic!("invariant of app state onboarding broken");
                };
                closure(state)
            })
            .await
    }

    /// Init -> SocialRecovery or SocialRecovery -> SocialRecovery
    pub async fn social_recovery_start_or_update(
        &self,
        social_recovery_state: SocialRecoveryState,
    ) -> anyhow::Result<()> {
        self.with_write_lock(|state| {
            match state.stage {
                OnboardingStage::Init {} => {}
                OnboardingStage::SocialRecovery { .. } => {}
                _ => bail!("Illegal transition in onboarding (social recovery)"),
            };
            state.stage = OnboardingStage::SocialRecovery {
                state: social_recovery_state,
            };
            Ok(())
        })
        .await??;
        Ok(())
    }

    /// SocialRecovery -> Init
    pub async fn social_recovery_cancel(&self) -> anyhow::Result<()> {
        self.with_write_lock(|state| {
            match state.stage {
                OnboardingStage::SocialRecovery { .. } => {}
                _ => bail!("Illegal transition in onboarding (social recovery)"),
            };
            state.stage = OnboardingStage::Init {};
            Ok(())
        })
        .await??;
        Ok(())
    }

    /// Init -> DeviceIndexSelection or SocialRecovery -> DeviceIndexSelection
    pub async fn restore_mnemonic(
        &self,
        root_mnemonic: bip39::Mnemonic,
        device_identifier: DeviceIdentifier,
    ) -> anyhow::Result<()> {
        self.with_write_lock(|state| {
            let social_recovery_state = match &state.stage {
                OnboardingStage::Init {} => None,
                OnboardingStage::SocialRecovery { state } => Some(state.clone()),
                _ => bail!("Illegal transition in onboarding (social recovery)"),
            };
            let secret = Bip39RootSecretStrategy::<12>::to_root_secret(&root_mnemonic);
            state.stage = OnboardingStage::DeviceIndexSelection {
                encrypted_device_identifier: device_identifier
                    .encrypt_and_hex_encode(&secret)
                    .context("failed to encrypt")?,
                root_mnemonic,
                social_recovery_state,
            };
            Ok(())
        })
        .await??;
        Ok(())
    }

    /// Call this to finalize the seed and move self to AppState
    /// NewSeed : Init -> complete
    /// GotDeviceIndex : DeviceIndexSelection -> complete
    pub async fn complete_onboarding(
        self,
        method: OnboardingCompletionMethod,
        device_identifier: DeviceIdentifier,
    ) -> Result<AppState, (Self, anyhow::Error)> {
        let result = self
            .store
            .with_write_lock(|state| {
                let AppStateJson::Onboarding(uncommitted) = state else {
                    panic!("invariant of app state onboarding broken");
                };
                let (
                    root_mnemonic,
                    encrypted_device_identifier,
                    social_recovery_state,
                    device_index,
                    onboarding_method,
                ) = match (method, uncommitted.stage.clone()) {
                    (OnboardingCompletionMethod::NewSeed, OnboardingStage::Init {}) => {
                        let root_mnemonic = Bip39RootSecretStrategy::<12>::random(&mut OsRng);
                        let secret = Bip39RootSecretStrategy::<12>::to_root_secret(&root_mnemonic);
                        (
                            root_mnemonic,
                            device_identifier
                                .encrypt_and_hex_encode(&secret)
                                .context("failed to encrypt")?,
                            None,
                            // device index 0 for new seed
                            0,
                            OnboardingMethod::NewSeed,
                        )
                    }
                    (
                        OnboardingCompletionMethod::GotDeviceIndex(device_index),
                        OnboardingStage::DeviceIndexSelection {
                            root_mnemonic,
                            social_recovery_state,
                            encrypted_device_identifier,
                        },
                    ) => (
                        root_mnemonic,
                        encrypted_device_identifier,
                        social_recovery_state,
                        device_index,
                        OnboardingMethod::Restored,
                    ),
                    _ => bail!("Illegal state for {method:?}"),
                };

                #[allow(deprecated)]
                let new_state = AppStateJson::Onboarded(AppStateJsonOnboarded {
                    social_recovery_state,
                    device_index,
                    encrypted_device_identifier_v2: encrypted_device_identifier.clone(),
                    matrix_session: None,
                    internal_bridge_export: false,
                    onboarding_method: Some(onboarding_method),
                    first_comm_invite_code: FirstCommunityInviteCodeState::NeverSet,
                    guardian_password_map: BTreeMap::new(),
                    base: AppStateJsonBase {
                        root_mnemonic,
                        joined_federations: BTreeMap::new(),
                        joined_communities: BTreeMap::new(),
                        sensitive_log: None,
                        // When setting up a new AppState (fresh install), set
                        // encrypted_device_identifier_v1 as None which marks the transfer of
                        // ownership as complete.
                        encrypted_device_identifier_v1: None,
                        next_federation_db_prefix: default_next_federation_prefix(),
                        matrix_display_name: None,
                        cached_fiat_fx_info: None,
                        last_device_registration_timestamp: None,
                    },
                });
                *state = new_state;
                Ok(())
            })
            .await;
        match result {
            Err(err) | Ok(Err(err)) => Err((self, err)),
            Ok(Ok(())) => Ok(AppState { store: self.store }),
        }
    }
}
