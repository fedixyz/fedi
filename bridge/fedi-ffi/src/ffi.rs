use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{bail, Context};
use async_trait::async_trait;
use bridge::Bridge;
use lazy_static::lazy_static;
use rpc_types::error::ErrorCode;
use rpc_types::{RpcAppFlavor, RpcInitOpts};
use runtime::api::LiveFediApi;
// used by uniffi
pub use runtime::event::IEventSink as EventSink;
use runtime::features::{FeatureCatalog, RuntimeEnvironment};
use runtime::storage::IStorage;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

use super::logging;
pub use super::rpc::FedimintError;
use super::rpc::{fedimint_initialize_async, fedimint_rpc_async};
use crate::remote::{fedimint_remote_initialize, fedimint_remote_rpc};
use crate::rpc::{self, rpc_error_json};

lazy_static! {
    // Global Tokio runtime
    pub static ref RUNTIME: tokio::runtime::Runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to build runtime");
    // Global bridge object used to handle RPC commands
    static ref BRIDGE: Arc<Mutex<Option<Arc<Bridge>>>> = Arc::new(Mutex::new(None));
}

pub async fn fedimint_initialize(event_sink: Box<dyn EventSink>, init_opts_json: String) -> String {
    let task_result = RUNTIME
        .spawn(fedimint_initialize_inner(event_sink, init_opts_json))
        .await;
    match task_result {
        Ok(Ok(())) => String::from("{}"),
        Ok(Err(e)) => {
            error!(?e);
            rpc_error_json(&e)
        }
        Err(join_error) => {
            if join_error.is_panic() {
                rpc_error_json(&anyhow::format_err!(ErrorCode::Panic))
            } else {
                // it should unreachable in theory, but didn't want to brick
                // bridge in that case. currently there are 2 errors - panic or
                // cancelled and we cancel never this task
                rpc_error_json(&anyhow::format_err!("unknown join error"))
            }
        }
    }
}

/// Method to instantiate a global bridge object which is required
/// for RPC to work. The app calls this method on load.
pub async fn fedimint_initialize_inner(
    event_sink: Box<dyn EventSink>,
    init_opts_json: String,
) -> anyhow::Result<()> {
    let init_opts: RpcInitOpts = match serde_json::from_str(&init_opts_json) {
        Ok(init_opts) => init_opts,
        Err(e) => {
            error!(?e, "Error parsing init_opts_json");
            bail!("Bridge init failed, cannot parse init_opts_json {:?}", e);
        }
    };
    let data_dir = match init_opts.data_dir {
        Some(data_dir) => data_dir,
        None => {
            error!("data_dir missing in init_opts_json");
            bail!("Bridge init failed, data_dir missing in init_opts_json");
        }
    };
    let log_level = match init_opts.log_level {
        Some(log_level) => log_level,
        None => {
            error!("log_level missing in init_opts_json");
            bail!("Bridge init failed, log_level missing in init_opts_json");
        }
    };

    if option_env!("FEDI_BRIDGE_REMOTE").is_some() {
        return fedimint_remote_initialize(event_sink).await;
    }
    if let Some(bridge) = BRIDGE.lock().await.clone() {
        match init_opts.app_flavor {
            RpcAppFlavor::Dev => {
                // reset observables
                bridge.runtime().observable_pool.reset().await;
            }
            RpcAppFlavor::Nightly => {
                panic!("reinitializing bridge is only allowed during development");
            }
            RpcAppFlavor::Bravo => {
                warn!("reinitializing bridge is only allowed during development, ignoring request");
            }
        }
        return Ok(());
    }
    let event_sink: Arc<dyn EventSink> = event_sink.into();
    std::panic::set_hook(Box::new({
        let event_sink = event_sink.clone();
        move |info| {
            tracing::info!(%info, "panic");
            // write separately in case backtrace capturing bugs out.
            let backtrace = std::backtrace::Backtrace::force_capture();
            tracing::info!(%backtrace, "panic");

            rpc::panic_hook(info, &*event_sink);
        }
    }));
    let data_dir: PathBuf = data_dir.into();
    logging::init_logging(&data_dir, event_sink.clone(), &log_level)
        .context("Failed to initialize logging")?;
    info!("initialized logging");
    let storage = PathBasedStorage::new(data_dir)
        .await
        .context("Failed to initialize storage")?;
    let mut bridge_lock = BRIDGE.lock().await;
    let bridge = match fedimint_initialize_async(
        Arc::new(storage),
        event_sink,
        Arc::new(LiveFediApi::new()),
        init_opts.device_identifier,
        FeatureCatalog::new(match init_opts.app_flavor {
            RpcAppFlavor::Dev => RuntimeEnvironment::Dev,
            RpcAppFlavor::Nightly => RuntimeEnvironment::Staging,
            RpcAppFlavor::Bravo => RuntimeEnvironment::Prod,
        })
        .into(),
    )
    .await
    {
        Ok(bridge) => bridge,
        Err(e) => {
            let context_error = e.context("Failed to initialize Bridge");
            error!("{:?}", context_error);
            return Err(context_error);
        }
    };
    *bridge_lock = Some(bridge);
    info!("bridge initialized");
    Ok(())
}

/// Method to execute an RPC command
pub async fn fedimint_rpc(method: String, payload: String) -> String {
    // run future in background tokio worker threads
    let task_result = RUNTIME
        .spawn(async move {
            if option_env!("FEDI_BRIDGE_REMOTE").is_some() {
                return fedimint_remote_rpc(method, payload)
                    .await
                    .expect("rpc failed");
            }
            let Some(bridge) = BRIDGE.lock().await.as_ref().cloned() else {
                return rpc_error_json(&anyhow::format_err!(ErrorCode::NotInialized));
            };
            fedimint_rpc_async(bridge, method, payload).await
        })
        .await;
    match task_result {
        Ok(value) => value,
        Err(join_error) => {
            if join_error.is_panic() {
                rpc_error_json(&anyhow::format_err!(ErrorCode::Panic))
            } else {
                // it should unreachable in theory, but didn't want to brick
                // bridge in that case. currently there are 2 errors - panic or
                // cancelled and we cancel never this task
                rpc_error_json(&anyhow::format_err!("unknown join error"))
            }
        }
    }
}

/// Returns the names of events we send from Rust to React Native
pub fn fedimint_get_supported_events() -> Vec<String> {
    vec![
        String::from("balance"),
        String::from("federation"),
        String::from("transaction"),
        String::from("log"),
        String::from("panic"),
        String::from("spv2Deposit"),
        String::from("spv2Withdrawal"),
        String::from("spv2Transfer"),
        String::from("stabilityPoolDeposit"),
        String::from("stabilityPoolWithdrawal"),
        String::from("recoveryComplete"),
        String::from("recoveryProgress"),
        String::from("observableUpdate"),
        String::from("deviceRegistration"),
        String::from("communityMetadataUpdated"),
    ]
}

#[derive(Clone)]
pub struct PathBasedStorage {
    data_dir: PathBuf,
}

impl PathBasedStorage {
    pub async fn new(data_dir: PathBuf) -> anyhow::Result<Self> {
        Ok(Self { data_dir })
    }
}

#[async_trait]
impl IStorage for PathBasedStorage {
    async fn federation_database_v2(
        &self,
        db_name: &str,
    ) -> anyhow::Result<fedimint_core::db::Database> {
        let db_name = self.data_dir.join(format!("{db_name}.db"));
        let db = fedimint_rocksdb::RocksDb::open(db_name).await?;
        Ok(db.into())
    }

    async fn delete_federation_db(&self, db_name: &str) -> anyhow::Result<()> {
        let db_name = self.data_dir.join(format!("{db_name}.db"));
        std::fs::remove_dir_all(db_name).context("delete federation db")?;
        Ok(())
    }

    async fn read_file(&self, path: &Path) -> anyhow::Result<Option<Vec<u8>>> {
        let path = if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.data_dir.join(path)
        };

        if !path.exists() {
            return Ok(None);
        }

        Ok(Some(tokio::fs::read(path).await?))
    }

    async fn write_file(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()> {
        let path = self.platform_path(path);
        // tokio::fs::write is bad, creates a second copy of data
        Ok(tokio::task::spawn_blocking(move || {
            let tmp_path = path.with_extension("tmp");
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&tmp_path)?;
            file.write_all(&data)?;
            file.flush()?;
            file.sync_data()?;
            drop(file);
            std::fs::rename(tmp_path, path)
        })
        .await??)
    }

    fn write_file_sync(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()> {
        let path = self.platform_path(path);
        let tmp_path = path.with_extension("tmp");
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&tmp_path)?;
        file.write_all(&data)?;
        file.flush()?;
        file.sync_data()?;
        drop(file);
        Ok(std::fs::rename(tmp_path, path)?)
    }

    fn platform_path(&self, path: &Path) -> PathBuf {
        if path.is_absolute() {
            path.to_owned()
        } else {
            self.data_dir.join(path)
        }
    }
}
