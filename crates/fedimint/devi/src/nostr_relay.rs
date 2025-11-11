use std::ops::ControlFlow;

use anyhow::{Context, Result};
use devimint::cmd;
use devimint::util::{ProcessHandle, ProcessManager, poll};
use fedimint_core::util::write_overwrite_async;
use fedimint_logging::LOG_DEVIMINT;
use fedimint_portalloc::port_alloc;
use tracing::info;

const RELAY_CONFIG_TEMPLATE: &str = r#"
[database]
data_directory = "{DB_DIR}"

[network]
address = "127.0.0.1"
port = {PORT}
"#;

#[derive(Clone)]
pub struct NostrRelay {
    _process: ProcessHandle,
    pub port: u16,
    pub url: String,
}

impl NostrRelay {
    pub async fn start(process_mgr: &ProcessManager) -> Result<Self> {
        let port = port_alloc(1)?;
        let base_dir = process_mgr.globals.FM_TEST_DIR.join("nostr-relay");
        let db_dir = base_dir.join("db");
        let config_path = base_dir.join("config.toml");

        tokio::fs::create_dir_all(&db_dir).await?;

        let config = RELAY_CONFIG_TEMPLATE
            .replace("{PORT}", &port.to_string())
            .replace("{DB_DIR}", db_dir.to_str().unwrap());

        write_overwrite_async(&config_path, &config)
            .await
            .context("Failed to write nostr-relay config")?;

        info!(target: LOG_DEVIMINT, "Starting nostr-rs-relay on port {}", port);

        let process = process_mgr
            .spawn_daemon(
                "nostr-rs-relay",
                cmd!("nostr-rs-relay", "--config", config_path.to_str().unwrap()),
            )
            .await?;

        let relay = Self {
            _process: process,
            port,
            url: format!("ws://127.0.0.1:{port}"),
        };

        relay.wait_for_ready().await?;
        info!(target: LOG_DEVIMINT, "nostr-rs-relay started on port {}", port);
        Ok(relay)
    }

    async fn wait_for_ready(&self) -> Result<()> {
        poll("nostr-rs-relay health", || async {
            use std::net::TcpStream;
            use std::time::Duration;

            TcpStream::connect_timeout(
                &format!("127.0.0.1:{}", self.port)
                    .parse()
                    .map_err(anyhow::Error::from)
                    .map_err(ControlFlow::Break)?,
                Duration::from_secs(1),
            )
            .map_err(|e| ControlFlow::Continue(anyhow::anyhow!("nostr-rs-relay not ready: {e}")))?;
            Ok(())
        })
        .await
        .context("nostr-rs-relay failed to start within timeout")
    }
}
