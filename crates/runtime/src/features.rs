use serde::Serialize;
use ts_rs::TS;

/// Enum representing the environment in whose context the bridge is
/// instantiated. For the Fedi app, this translates to the app flavors:
/// - Dev = a locally-built developer build of the Fedi app
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
/// turned on only for the "Dev" environment. Shortly thereafter, it might also
/// be turned on for the "Staging" environment so that internally it can be
/// tested. Finally, when the feature is considered stable, it will also be
/// turned on for the "Prod" environment.
#[derive(Debug, Clone)]
pub enum RuntimeEnvironment {
    Dev,
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

    /// Enables stability pool v2 module, which also powers the multispend
    /// feature. This feature is to be thought of as a tri-state enum
    /// representing 3 scenarios.
    /// 1. None: both stability pool v2 (and multispend feature) disabled
    /// 2. Some(SpV2Only): use stability pool v2, but multispend disabled
    /// 3. Some(Multispend): use stability pool and multispend enabled
    ///
    /// This is a global, bridge-level configuration. Actual availability of the
    /// feature is on a per-federation basis, depending on whether or not
    /// the new module is available in the federation. Note however, that
    /// the feature flag takes precedence. If the feature flag is disabled,
    /// the feature is never available. If the feature flag is enabled, then
    /// the federation's module availability determines the availability of
    /// the feature.
    pub stability_pool_v2: Option<StabilityPoolV2FeatureConfig>,
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
pub struct StabilityPoolV2FeatureConfig {
    pub state: StabilityPoolV2FeatureConfigState,
}

#[derive(Debug, Clone, TS, Serialize, PartialEq, Eq)]
#[ts(export)]
pub enum StabilityPoolV2FeatureConfigState {
    SpV2Only,
    Multispend,
}

impl FeatureCatalog {
    pub fn new(runtime_env: RuntimeEnvironment) -> Self {
        match runtime_env {
            RuntimeEnvironment::Dev => Self::new_dev(),
            RuntimeEnvironment::Staging => Self::new_staging(),
            RuntimeEnvironment::Prod => Self::new_prod(),
        }
    }

    fn new_dev() -> Self {
        Self {
            encrypted_sync: Some(EncryptedSyncFeatureConfig {
                server_url: "https://prod-kv-store.dev.fedibtc.com/".to_string(),
            }),
            override_localhost: Some(OverrideLocalhostFeatureConfig {}),
            stability_pool_v2: Some(StabilityPoolV2FeatureConfig {
                state: StabilityPoolV2FeatureConfigState::Multispend,
            }),
        }
    }

    fn new_staging() -> Self {
        Self {
            encrypted_sync: None,
            override_localhost: None,
            stability_pool_v2: Some(StabilityPoolV2FeatureConfig {
                state: StabilityPoolV2FeatureConfigState::Multispend,
            }),
        }
    }

    fn new_prod() -> Self {
        Self {
            encrypted_sync: None,
            override_localhost: None,
            stability_pool_v2: Some(StabilityPoolV2FeatureConfig {
                state: StabilityPoolV2FeatureConfigState::SpV2Only,
            }),
        }
    }
}
