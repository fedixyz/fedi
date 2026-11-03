//! Runs the app's iroh networking for `check-ios-local-network-prompt.sh`.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Context as _;
use fediffi::ffi::RUNTIME;
use fedimint_connectors::ConnectorRegistry;
use tokio::sync::watch;

fn main() -> anyhow::Result<()> {
    RUNTIME.block_on(async {
        let _fedimint_iroh = ConnectorRegistry::build_from_client_env()?
            .build_iroh_connector(Arc::new(watch::channel(0).0))
            .await
            .context("Fedimint iroh endpoints did not start")?;
        let _fa_endpoint = bridge::fa_client::bind_n0_endpoint()
            .await
            .context("FA iroh endpoint did not start")?;
        fedimint_core::task::sleep(Duration::from_secs(20)).await;
        Ok(())
    })
}
