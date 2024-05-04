use std::time::Duration;

use fedi_core::envs::{
    FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV, FEDI_STABILITY_POOL_MODULE_ENABLE_ENV,
    FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV,
};
use fedi_social_common::config::FediSocialGenParams;
use fedi_social_server::FediSocialInit;
use fedimint_core::envs::is_env_var_set;
use fedimint_core::module::ServerModuleInit;
use fedimint_core::Amount;
use fedimintd::Fedimintd;
use stability_pool_server::common::config::{
    CollateralRatio, OracleConfig, StabilityPoolGenParams, StabilityPoolGenParamsConsensus,
};
use stability_pool_server::StabilityPoolInit;
use tracing::warn;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let include_stability_pool = is_env_var_set(FEDI_STABILITY_POOL_MODULE_ENABLE_ENV)
        // in the past we used this
        || std::env::var("INCLUDE_STABILITY_POOL").is_ok();
    let include_social_recovery = is_env_var_set(FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV);

    let mut fedimintd = Fedimintd::new(env!("FEDIMINT_BUILD_CODE_VERSION"))?.with_default_modules();

    if include_stability_pool {
        let use_test_params = is_env_var_set(FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV) ||
            // in the past we used this
            std::env::var("USE_STABILITY_POOL_TEST_PARAMS").is_ok();
        fedimintd = fedimintd
            .with_module_kind(StabilityPoolInit)
            .with_module_instance(
                stability_pool_server::common::KIND,
                StabilityPoolGenParams {
                    local: Default::default(),
                    consensus: StabilityPoolGenParamsConsensus {
                        oracle_config: if use_test_params {
                            OracleConfig::Mock
                        } else {
                            OracleConfig::Aggregate
                        },
                        cycle_duration: Duration::from_secs(if use_test_params { 15 } else { 600 }),
                        collateral_ratio: CollateralRatio {
                            provider: 1,
                            seeker: 1,
                        },
                        min_allowed_seek: Amount::from_msats(100_000),
                        min_allowed_provide: Amount::from_msats(100_000),
                        max_allowed_provide_fee_rate_ppb: 2000,
                        min_allowed_cancellation_bps: 100,
                    },
                },
            );
    }

    if include_social_recovery {
        warn!("Warning: Fedi Social Recovery module is currently experimental and not recommended to use in Federations without explicit Fedi support");
        fedimintd = fedimintd
            .with_module_kind(FediSocialInit)
            .with_module_instance(FediSocialInit::kind(), FediSocialGenParams::new());
    }

    fedimintd.run().await
}
