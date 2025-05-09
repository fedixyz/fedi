use fedi_social_client::FediSocialClientInit;
use fedimint_cli::FedimintCli;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    FedimintCli::new(env!("FEDIMINT_BUILD_CODE_VERSION"))?
        .with_default_modules()
        .with_module(FediSocialClientInit)
        .with_module(stability_pool_client_old::StabilityPoolClientInit)
        .with_module(stability_pool_client::StabilityPoolClientInit)
        .run()
        .await;
    Ok(())
}
