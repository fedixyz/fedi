use std::env;

use reqwest::Url;
use serde::Serialize;
use ts_rs::TS;

use crate::constants::{FEDI_GLOBAL_COMMUNITY_PROD, FEDI_GLOBAL_COMMUNITY_STAGING};

/// Enum representing the environment in whose context the bridge is
/// instantiated. For the Fedi app, this translates to the app flavors:
/// - Dev = a locally-built developer build of the Fedi app
/// - Tests = locally-build developer build for automated testing.
/// - Staging = an internal build of the Fedi app, such as the nightly build
/// - Prod = an external build of the Fedi app, such as the Fedi build
///
/// Note the increasing strictness of the runtimes. Dev is the least strict and
/// can be the most broken. Prod is the most strict and therefore should be the
/// least broken.
///
/// Depending on the runtime environment, features will be enabled or disabled.
/// Typically when development work starts on a new feature, the feature will be
/// turned off for all runtimes. Once the feature is code-complete, it might be
/// turned on only for the "Dev" and "Tests" environment. Shortly thereafter, it
/// might also be turned on for the "Staging" environment so that internally it
/// can be tested. Finally, when the feature is considered stable, it will also
/// be turned on for the "Prod" environment.
#[derive(Debug, Clone, TS, Serialize)]
pub enum RuntimeEnvironment {
    Dev,
    Tests,
    Staging,
    Prod,
}

/// We represent the catalog of all the features for a given runtime as a
/// struct. The struct has one field for each of the features, named after the
/// feature itself, and the field is of type Option<_FeatureName_FeatureConfig>.
///
/// The idea is that when a developer starts working on a new feature, the
/// developer will add a field to this struct using the convention specified
/// above. This will force the developer to add a configuration for that feature
/// for each of the runtimes. Initially the developer might just return None for
/// each of the runtimes to make the feature always unavailable as it is still
/// being developed. But over time the developer might start enabling the
/// feature for increasingly stricter runtimes by returning an appropriate
/// Some(_FeatureName_FeatureConfig).
///
/// PLEASE ADD DOCUMENTATION FOR EACH FEATURE/FIELD BELOW
#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct FeatureCatalog {
    #[serde(skip)]
    pub runtime_env: RuntimeEnvironment,

    /// "Encrypted sync" feature is the Fedi app using a remote server to store,
    /// retrieve, and manipulate data that's necessary for a smooth user
    /// experience. This data can be seed-level, such as matrix server URL,
    /// which is to be shared across all devices using the same seed. Or it
    /// could be device-level, meaning it differs across devices using the same
    /// seed. Furthermore, we use e2e encryption.
    pub encrypted_sync: Option<EncryptedSyncFeatureConfig>,

    // "Override localhost" feature determines whether or not the IP address 127.0.0.1 should be
    // overridden to a different IP address or hostname depending on the build target
    // (Android/iOS/web). This is typically a dev-only feature needed for testing on Android and
    // iOS emulators.
    pub override_localhost: Option<OverrideLocalhostFeatureConfig>,

    /// Enable Nostr client for Rate federation feature.
    ///
    /// This allows relays to be configured using a remote feature flag service
    /// in future.
    pub nostr_client: Option<NostrClientFeatureCatalog>,

    /// Device registration service configuration for registering devices with
    /// Fedi's backend. This service helps coordinate device indices across
    /// multiple devices using the same seed.
    pub device_registration: DeviceRegistrationFeatureConfig,

    /// Matrix server configuration for chat functionality.
    /// This allows different matrix servers to be used based on the runtime
    /// environment.
    pub matrix: MatrixFeatureConfig,

    /// Config for which invite code to use for joining the global community
    pub global_community: GlobalCommunityFeatureConfig,

    /// Guardianito chatbot API configuration.
    pub guardianito: GuardianitoFeatureConfig,

    /// Configuration regarding the remittance of Fedi fee
    pub fedi_fee: FediFeeConfig,

    /// SP Transfers Matrix feature flag.
    /// When enabled, allows stability pool transfers via Matrix messaging.
    pub sp_transfers_matrix: Option<SpTransfersMatrixFeatureConfig>,

    /// SP Transfer UI feature flag.
    pub sp_transfer_ui: Option<SpTransferUiFeatureConfig>,

    /// V1 (web-hosted) communities can be silently migrated to V2
    /// (nostr-hosted) communities if the right meta value is added to the V1
    /// JSON. This feature config controls whether this silent migration
    /// operation is permitted.
    pub community_v2_migration: Option<CommunityV2MigrationFeatureConfig>,

    /// Allows users to rearrange the order of mini apps on the Mods screen.
    pub rearrange_miniapps: Option<RearrangeMiniappsFeatureConfig>,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct SpTransfersMatrixFeatureConfig {}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub enum SpTransferUiMode {
    QrCode,
    Chat,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct SpTransferUiFeatureConfig {
    pub mode: SpTransferUiMode,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct EncryptedSyncFeatureConfig {
    pub server_url: String,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct OverrideLocalhostFeatureConfig {}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct NostrClientFeatureCatalog {
    #[ts(type = "Array<string>")]
    pub relays: Vec<Url>,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct DeviceRegistrationFeatureConfig {
    pub service_url: String,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct MatrixFeatureConfig {
    pub home_server: String,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct GlobalCommunityFeatureConfig {
    pub invite_code: String,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct GuardianitoFeatureConfig {
    #[ts(type = "string")]
    pub api_base_url: Url,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct FediFeeConfig {
    /// How long (max) are we willing to wait before requesting a 0-amount
    /// invoice from Fedi's servers to keep up a reasonable syncing cadences
    #[ts(type = "number")]
    pub remittance_max_delay_secs: u32,
}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct CommunityV2MigrationFeatureConfig {}

#[derive(Debug, Clone, TS, Serialize)]
#[ts(export)]
pub struct RearrangeMiniappsFeatureConfig {}

impl FeatureCatalog {
    pub fn new(runtime_env: RuntimeEnvironment) -> Self {
        match runtime_env {
            RuntimeEnvironment::Dev => Self::new_dev(),
            RuntimeEnvironment::Staging => Self::new_staging(),
            RuntimeEnvironment::Prod => Self::new_prod(),
            RuntimeEnvironment::Tests => Self::new_tests(),
        }
    }

    fn new_dev() -> Self {
        Self {
            runtime_env: RuntimeEnvironment::Dev,
            encrypted_sync: Some(EncryptedSyncFeatureConfig {
                server_url: "https://prod-kv-store.dev.fedibtc.com/".to_string(),
            }),
            override_localhost: Some(OverrideLocalhostFeatureConfig {}),
            nostr_client: Some(NostrClientFeatureCatalog {
                relays: vec![Url::parse("wss://nostr-rs-relay-staging.dev.fedibtc.com").unwrap()],
            }),
            device_registration: DeviceRegistrationFeatureConfig {
                service_url: "https://staging-device-control.dev.fedibtc.com/v0".to_string(),
            },
            matrix: MatrixFeatureConfig {
                home_server: "https://staging.m1.8fa.in".to_string(),
            },
            global_community: GlobalCommunityFeatureConfig {
                invite_code: FEDI_GLOBAL_COMMUNITY_STAGING.to_string(),
            },
            guardianito: GuardianitoFeatureConfig {
                api_base_url: Url::parse("https://staging.guardianito.dev.fedibtc.com")
                    .expect("guardianito url must be valid"),
            },
            fedi_fee: FediFeeConfig {
                remittance_max_delay_secs: 300, // 5 minutes for testing
            },
            sp_transfers_matrix: Some(SpTransfersMatrixFeatureConfig {}),
            sp_transfer_ui: Some(SpTransferUiFeatureConfig {
                mode: SpTransferUiMode::Chat,
            }),
            community_v2_migration: Some(CommunityV2MigrationFeatureConfig {}),
            rearrange_miniapps: Some(RearrangeMiniappsFeatureConfig {}),
        }
    }

    fn new_tests() -> Self {
        Self {
            runtime_env: RuntimeEnvironment::Tests,
            encrypted_sync: Some(EncryptedSyncFeatureConfig {
                server_url: "https://prod-kv-store.dev.fedibtc.com/".to_string(),
            }),
            override_localhost: Some(OverrideLocalhostFeatureConfig {}),
            nostr_client: Some(NostrClientFeatureCatalog {
                relays: vec![
                    env::var("DEVI_NOSTR_RELAY")
                        .expect("must be set")
                        .parse()
                        .unwrap(),
                ],
            }),
            device_registration: DeviceRegistrationFeatureConfig {
                service_url: "https://staging-device-control.dev.fedibtc.com/v0".to_string(),
            },
            matrix: MatrixFeatureConfig {
                home_server: env::var("DEVI_SYNAPSE_SERVER")
                    .expect("DEVI_SYNAPSE_SERVER must be set"),
            },
            global_community: GlobalCommunityFeatureConfig {
                invite_code: FEDI_GLOBAL_COMMUNITY_STAGING.to_string(),
            },
            guardianito: GuardianitoFeatureConfig {
                api_base_url: Url::parse("https://staging.guardianito.dev.fedibtc.com")
                    .expect("guardianito url must be valid"),
            },
            fedi_fee: FediFeeConfig {
                remittance_max_delay_secs: 300, // 5 minutes for testing
            },
            sp_transfers_matrix: Some(SpTransfersMatrixFeatureConfig {}),
            sp_transfer_ui: Some(SpTransferUiFeatureConfig {
                mode: SpTransferUiMode::Chat,
            }),
            community_v2_migration: Some(CommunityV2MigrationFeatureConfig {}),
            rearrange_miniapps: Some(RearrangeMiniappsFeatureConfig {}),
        }
    }

    fn new_staging() -> Self {
        Self {
            runtime_env: RuntimeEnvironment::Staging,
            encrypted_sync: None,
            override_localhost: None,
            nostr_client: Some(NostrClientFeatureCatalog {
                relays: vec![Url::parse("wss://nostr-rs-relay-staging.dev.fedibtc.com").unwrap()],
            }),
            device_registration: DeviceRegistrationFeatureConfig {
                service_url: "https://staging-device-control.dev.fedibtc.com/v0".to_string(),
            },
            matrix: MatrixFeatureConfig {
                home_server: "https://staging.m1.8fa.in".to_string(),
            },
            global_community: GlobalCommunityFeatureConfig {
                invite_code: FEDI_GLOBAL_COMMUNITY_STAGING.to_string(),
            },
            guardianito: GuardianitoFeatureConfig {
                api_base_url: Url::parse("https://staging.guardianito.dev.fedibtc.com")
                    .expect("guardianito url must be valid"),
            },
            fedi_fee: FediFeeConfig {
                remittance_max_delay_secs: 300, // 5 minutes for testing
            },
            sp_transfers_matrix: Some(SpTransfersMatrixFeatureConfig {}),
            sp_transfer_ui: Some(SpTransferUiFeatureConfig {
                mode: SpTransferUiMode::Chat,
            }),
            community_v2_migration: Some(CommunityV2MigrationFeatureConfig {}),
            rearrange_miniapps: Some(RearrangeMiniappsFeatureConfig {}),
        }
    }

    fn new_prod() -> Self {
        Self {
            runtime_env: RuntimeEnvironment::Prod,
            encrypted_sync: None,
            override_localhost: None,
            nostr_client: Some(NostrClientFeatureCatalog {
                relays: vec![
                    Url::parse("wss://nostr-rs-relay.dev.fedibtc.com").unwrap(),
                    Url::parse("wss://relay.damus.io/").unwrap(),
                ],
            }),
            device_registration: DeviceRegistrationFeatureConfig {
                service_url: "https://prod-device-control.dev.fedibtc.com/v0".to_string(),
            },
            matrix: MatrixFeatureConfig {
                home_server: "https://m1.8fa.in".to_string(),
            },
            global_community: GlobalCommunityFeatureConfig {
                invite_code: FEDI_GLOBAL_COMMUNITY_PROD.to_string(),
            },
            guardianito: GuardianitoFeatureConfig {
                api_base_url: Url::parse("https://prod.guardianito.dev.fedibtc.com")
                    .expect("guardianito url must be valid"),
            },
            fedi_fee: FediFeeConfig {
                remittance_max_delay_secs: 3 * 24 * 60 * 60, // 3 days for prod
            },
            sp_transfers_matrix: None,
            sp_transfer_ui: Some(SpTransferUiFeatureConfig {
                mode: SpTransferUiMode::QrCode,
            }),
            community_v2_migration: Some(CommunityV2MigrationFeatureConfig {}),
            rearrange_miniapps: None,
        }
    }
}

/// error! on prod and panic! on nightly
#[macro_export]
macro_rules! nightly_panic {
    ($runtime:expr, $($tt:tt)*) => {
        if matches!(
            $runtime.feature_catalog.runtime_env,
            ::runtime::features::RuntimeEnvironment::Staging | ::runtime::features::RuntimeEnvironment::Dev | ::runtime::features::RuntimeEnvironment::Tests
        ) {
            panic!($($tt)*);
        } else {
            tracing::error!($($tt)*);
        }
    };
}
