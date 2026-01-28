use std::time::Duration;

use env::envs::{
    FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV, FEDI_STABILITY_POOL_MODULE_ENABLE_ENV,
    FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV, FEDI_STABILITY_POOL_V2_CYCLE_DURATION_SECS_ENV,
    FEDI_STABILITY_POOL_V2_MODULE_ENABLE_ENV,
};
use fedi_social_server::FediSocialInit;
use fedimint_core::Amount;
use fedimint_core::envs::is_env_var_set;
use fedimint_server_core::ServerModuleInitRegistry;
use tracing::warn;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    fn fedi_modules() -> ServerModuleInitRegistry {
        let mut modules = fedimintd::default_modules();

        let include_stability_pool = is_env_var_set(FEDI_STABILITY_POOL_MODULE_ENABLE_ENV)
        // in the past we used this
        || std::env::var("INCLUDE_STABILITY_POOL").is_ok();
        if include_stability_pool {
            let use_test_params = is_env_var_set(FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV) ||
                // in the past we used this
                std::env::var("USE_STABILITY_POOL_TEST_PARAMS").is_ok();
            modules.attach(stability_pool_server_old::StabilityPoolInit {
                oracle_config: if use_test_params {
                    stability_pool_server_old::common::config::OracleConfig::Mock
                } else {
                    stability_pool_server_old::common::config::OracleConfig::Aggregate
                },
                cycle_duration: Duration::from_secs(if use_test_params { 15 } else { 600 }),
                collateral_ratio: stability_pool_server_old::common::config::CollateralRatio {
                    provider: 1,
                    seeker: 1,
                },
                min_allowed_seek: Amount::from_msats(100_000),
                min_allowed_provide: Amount::from_msats(100_000),
                max_allowed_provide_fee_rate_ppb: 2000,
                min_allowed_cancellation_bps: 100,
            });
        }

        let include_social_recovery = is_env_var_set(FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV);
        if include_social_recovery {
            warn!(
                "Warning: Fedi Social Recovery module is currently experimental and not recommended to use in Federations without explicit Fedi support"
            );
            modules.attach(FediSocialInit);
        }

        let include_stability_pool_v2 = is_env_var_set(FEDI_STABILITY_POOL_V2_MODULE_ENABLE_ENV);
        if include_stability_pool_v2 {
            let use_test_params = is_env_var_set(FEDI_STABILITY_POOL_MODULE_TEST_PARAMS_ENV);
            let cycle_duration_secs = match std::env::var(
                FEDI_STABILITY_POOL_V2_CYCLE_DURATION_SECS_ENV,
            ) {
                Ok(val) => val
                    .parse::<u64>()
                    .expect("Cycle duration must be valid u64"),
                Err(std::env::VarError::NotPresent) => 600,
                Err(std::env::VarError::NotUnicode(_)) => {
                    panic!(
                        "{FEDI_STABILITY_POOL_V2_CYCLE_DURATION_SECS_ENV} contains invalid Unicode."
                    )
                }
            };
            modules.attach(stability_pool_server::StabilityPoolInit {
                oracle_config: if use_test_params {
                    stability_pool_server::common::config::OracleConfig::Mock
                } else {
                    stability_pool_server::common::config::OracleConfig::Aggregate
                },
                cycle_duration: Duration::from_secs(if use_test_params {
                    15
                } else {
                    cycle_duration_secs
                }),
                collateral_ratio: stability_pool_server::common::config::CollateralRatio {
                    provider: 1,
                    seeker: 1,
                },
                min_allowed_seek: Amount::from_msats(100_000),
                min_allowed_provide: Amount::from_msats(100_000),
                max_allowed_provide_fee_rate_ppb: 2000,
                min_allowed_cancellation_bps: 100,
            });
        }

        modules
    }

    fedimintd::run(fedi_modules(), env!("FEDIMINT_BUILD_CODE_VERSION"), None).await
}
