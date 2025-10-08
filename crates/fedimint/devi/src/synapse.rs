use std::ops::ControlFlow;

use anyhow::{Context, Result};
use devimint::cmd;
use devimint::util::{ProcessHandle, ProcessManager, poll};
use fedimint_core::util::write_overwrite_async;
use fedimint_logging::LOG_DEVIMINT;
use fedimint_portalloc::port_alloc;
use tracing::info;

/// Minimal Synapse configuration template for devimint testing
const SYNAPSE_CONFIG_TEMPLATE: &str = r#"
server_name: "synapse.devi.org"
pid_file: "@@TEMP_DIR@@/homeserver.pid"
public_baseurl: "http://127.0.0.1:@@HTTP_PORT@@/"

listeners:
  - port: @@HTTP_PORT@@
    type: http
    tls: false
    bind_addresses: ['127.0.0.1']
    resources:
      - names: [client]
        compress: false

database:
  name: sqlite3
  args:
    database: "@@TEMP_DIR@@/homeserver.db"

media_store_path: "@@TEMP_DIR@@/media_store"
uploads_path: "@@TEMP_DIR@@/uploads"
signing_key_path: "@@TEMP_DIR@@/synapse.devi.org.signing.key"

enable_registration: true
registration_requires_token: false
enable_registration_without_verification: true

enable_metrics: false
report_stats: false
enable_room_list_search: false
trusted_key_servers: []
suppress_key_server_warning: true

rc_message:
 per_second: 1000
 burst_count: 1000

rc_registration:
 per_second: 1000
 burst_count: 1000

rc_login:
 address:
  per_second: 1000
  burst_count: 1000
 account:
  per_second: 1000
  burst_count: 1000
 failed_attempts:
  per_second: 1000
  burst_count: 1000

rc_admin_redaction:
  per_second: 1000
  burst_count: 1000

rc_joins:
 local:
  per_second: 1000
  burst_count: 1000
 remote:
  per_second: 1000
  burst_count: 1000

rc_3pid_validation:
  per_second: 1000
  burst_count: 1000

rc_invites:
 per_room:
  per_second: 1000
  burst_count: 1000
 per_user:
  per_second: 1000
  burst_count: 1000
 per_issuer:
  per_second: 1000
  burst_count: 1000

max_upload_size: 1000M
"#;

/// Manages a temporary Synapse Matrix server instance
#[derive(Clone)]
pub struct Synapse {
    _process: ProcessHandle,
    pub port: u16,
    pub url: String,
}

impl Synapse {
    /// Start a new Synapse instance
    pub async fn start(process_mgr: &ProcessManager) -> Result<Self> {
        let port = port_alloc(1)?;
        let temp_dir = process_mgr.globals.FM_TEST_DIR.join("synapse");
        let config_path = temp_dir.join("homeserver.yaml");

        tokio::fs::create_dir_all(&temp_dir).await?;

        let config = SYNAPSE_CONFIG_TEMPLATE
            .to_string()
            .replace("@@HTTP_PORT@@", &port.to_string())
            .replace("@@TEMP_DIR@@", temp_dir.to_str().unwrap());

        // Write configuration file
        write_overwrite_async(&config_path, &config)
            .await
            .context("Failed to write Synapse configuration")?;

        info!(target: LOG_DEVIMINT, "Starting Synapse server on port {}", port);

        // Start synapse server
        let process = process_mgr
            .spawn_daemon(
                "synapse",
                cmd!(
                    "synapse_homeserver",
                    "--config-path",
                    config_path.to_str().unwrap()
                ),
            )
            .await?;

        let synapse = Self {
            _process: process,
            port,
            url: format!("http://127.0.0.1:{port}"),
        };

        // Wait for server to be ready
        synapse.wait_for_ready().await?;

        info!(target: LOG_DEVIMINT, "Synapse server started successfully on port {}", port);

        Ok(synapse)
    }

    /// Wait for the server to be ready by polling health endpoint
    async fn wait_for_ready(&self) -> Result<()> {
        poll("synapse health", || async {
            use std::net::TcpStream;
            use std::time::Duration;

            TcpStream::connect_timeout(
                &format!("127.0.0.1:{}", self.port)
                    .parse()
                    .map_err(anyhow::Error::from)
                    .map_err(ControlFlow::Break)?,
                Duration::from_secs(1),
            )
            .map_err(|e| ControlFlow::Continue(anyhow::anyhow!("Synapse not ready: {e}")))?;
            Ok(())
        })
        .await
        .context("Synapse failed to start within timeout")
    }
}
