use std::time::Duration;

use fedi_social_common::config::FediSocialGenParams;
use fedi_social_server::FediSocialInit;
use fedimint_core::module::ServerModuleInit;
use fedimint_core::Amount;
use fedimintd::Fedimintd;
use stability_pool_server::common::config::{
    CollateralRatio, OracleConfig, StabilityPoolGenParams, StabilityPoolGenParamsConsensus,
};
use stability_pool_server::StabilityPoolInit;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let include_stability_pool = std::env::var("INCLUDE_STABILITY_POOL").is_ok();

    let mut fedimintd = Fedimintd::new(env!("FEDIMINT_BUILD_CODE_VERSION"))?
        .with_default_modules()
        .with_module_kind(FediSocialInit)
        .with_module_instance(FediSocialInit::kind(), FediSocialGenParams::new());

    if include_stability_pool {
        let use_test_params = std::env::var("USE_STABILITY_POOL_TEST_PARAMS").is_ok();
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

    fedimintd.run().await
}
