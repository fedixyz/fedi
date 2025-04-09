use std::time::Duration;

use fedi_core::envs::{
    FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV, FEDI_STABILITY_POOL_MODULE_ENABLE_ENV,
    FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV, FEDI_STABILITY_POOL_V2_MODULE_ENABLE_ENV,
};
use fedi_social_common::config::FediSocialGenParams;
use fedi_social_server::FediSocialInit;
use fedimint_core::envs::is_env_var_set;
use fedimint_core::module::ServerModuleInit;
use fedimint_core::Amount;
use fedimintd::Fedimintd;
use tracing::warn;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let include_stability_pool = is_env_var_set(FEDI_STABILITY_POOL_MODULE_ENABLE_ENV)
        // in the past we used this
        || std::env::var("INCLUDE_STABILITY_POOL").is_ok();
    let include_social_recovery = is_env_var_set(FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV);
    let include_stability_pool_v2 = is_env_var_set(FEDI_STABILITY_POOL_V2_MODULE_ENABLE_ENV);

    let mut fedimintd =
        Fedimintd::new(env!("FEDIMINT_BUILD_CODE_VERSION"), None)?.with_default_modules()?;

    if include_stability_pool {
        let use_test_params = is_env_var_set(FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV) ||
            // in the past we used this
            std::env::var("USE_STABILITY_POOL_TEST_PARAMS").is_ok();
        fedimintd = fedimintd
            .with_module_kind(stability_pool_server_old::StabilityPoolInit)
            .with_module_instance(
                stability_pool_server_old::common::KIND,
                stability_pool_server_old::common::config::StabilityPoolGenParams {
                    local: Default::default(),
                    consensus:
                        stability_pool_server_old::common::config::StabilityPoolGenParamsConsensus {
                            oracle_config: if use_test_params {
                                stability_pool_server_old::common::config::OracleConfig::Mock
                            } else {
                                stability_pool_server_old::common::config::OracleConfig::Aggregate
                            },
                            cycle_duration: Duration::from_secs(if use_test_params {
                                15
                            } else {
                                600
                            }),
                            collateral_ratio:
                                stability_pool_server_old::common::config::CollateralRatio {
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

    if include_stability_pool_v2 {
        let use_test_params = is_env_var_set(FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV);
        fedimintd = fedimintd
            .with_module_kind(stability_pool_server::StabilityPoolInit)
            .with_module_instance(
                stability_pool_server::common::KIND,
                stability_pool_server::common::config::StabilityPoolGenParams {
                    local: Default::default(),
                    consensus:
                        stability_pool_server::common::config::StabilityPoolGenParamsConsensus {
                            oracle_config: if use_test_params {
                                stability_pool_server::common::config::OracleConfig::Mock
                            } else {
                                stability_pool_server::common::config::OracleConfig::Aggregate
                            },
                            cycle_duration: Duration::from_secs(if use_test_params {
                                15
                            } else {
                                600
                            }),
                            collateral_ratio:
                                stability_pool_server::common::config::CollateralRatio {
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

    fedimintd.run().await
}
