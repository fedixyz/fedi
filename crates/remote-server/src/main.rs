#![recursion_limit = "256"]
use std::collections::HashMap;
use std::ffi::OsString;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use bridge::Bridge;
use clap::Parser;
use devimint::cli::exec_user_command;
use devimint::cmd;
use devimint::util::FedimintCli;
use fediffi::rpc::{fedimint_initialize_async, fedimint_rpc_async};
use fedimint_connectors::ConnectorRegistry;
use fedimint_logging::TracingSetup;
use listenfd::ListenFd;
use redb_storage::PathBasedRedbStorage;
use rpc_types::RpcInitOpts;
use rpc_types::error::RpcError;
use runtime::event::IEventSink;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, OnceCell, RwLock, mpsc};
use tower_http::cors::{Any, CorsLayer};
use tracing::{debug, error, info};

type BridgeArc = Arc<Bridge>;

#[derive(Clone)]
struct AppState {
    bridges: Arc<RwLock<HashMap<String, BridgeState>>>,
    /// Per-device event queues, deliberately *outside* [`BridgeState`]:
    /// a bridge shutdown (every websocket disconnect causes one) must not
    /// drop events the sink already acknowledged accepting. The next
    /// bridge init for the device reuses its queue and the next
    /// connection drains it.
    event_queues: Arc<RwLock<HashMap<String, DeviceEventQueue>>>,
    data_dir: PathBuf,
    dev_fed: Option<Arc<devi::DevFed>>,
}

// TODO: process-local only -- a remote-server restart loses queued events
// whose lnurl markers are already durable, and the send-failure -> shutdown
// -> re-init path lacks a focused regression test. See
// https://github.com/fedibtc/fedi/issues/11907.
#[derive(Clone)]
struct DeviceEventQueue {
    tx: mpsc::Sender<BridgeEvent>,
    rx: Arc<Mutex<EventReceiver>>,
}

struct BridgeState {
    bridge: BridgeArc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BridgeEvent {
    event: String,
    data: String,
}

struct EventSink {
    tx: mpsc::Sender<BridgeEvent>,
}

impl IEventSink for EventSink {
    fn event(&self, event_type: String, body: String) {
        if let Err(err) = self.try_event(event_type, body) {
            tracing::warn!("dropping bridge event: {err}");
        }
    }

    // The queue is bounded and the reader can go away, so an event is only
    // accepted once try_send took it.
    fn try_event(&self, event_type: String, body: String) -> anyhow::Result<()> {
        let event = BridgeEvent {
            event: event_type,
            data: body,
        };
        self.tx
            .try_send(event)
            .map_err(|err| anyhow::anyhow!("event queue rejected event: {err}"))
    }
}

/// The event queue's consuming end, plus the one event popped but not yet
/// delivered to a websocket. Retaining it means a failed socket send retries
/// on the next connection instead of dropping the event -- the sink
/// acknowledged acceptance when it queued it, so it may not be lost here.
struct EventReceiver {
    rx: mpsc::Receiver<BridgeEvent>,
    unsent: Option<BridgeEvent>,
}

#[derive(Parser)]
struct Cli {
    /// Data directory for storing bridge data
    #[arg(value_name = "DIR")]
    data_dir: PathBuf,

    /// Port to listen on (default: 26722)
    #[arg(short, long, default_value = "26722")]
    port: u16,

    /// Run with a dev federation
    #[arg(long)]
    with_devfed: bool,

    #[arg(trailing_var_arg = true)]
    run_after_ready: Option<Vec<OsString>>,
}

#[tokio::main]
async fn main() -> Result<()> {
    TracingSetup::default().init()?;

    let cli = Cli::parse();

    let dev_fed = if cli.with_devfed {
        let dev_fed = devi::DevFed::new_with_setup(4).await?;
        info!("Dev federation invite code: {}", dev_fed.fed.invite_code()?);
        Some(Arc::new(dev_fed))
    } else {
        None
    };

    info!(
        "Starting remote bridge server with data dir: {}",
        cli.data_dir.display()
    );
    let state = AppState {
        bridges: Arc::new(RwLock::new(HashMap::new())),
        event_queues: Arc::new(RwLock::new(HashMap::new())),
        data_dir: cli.data_dir,
        dev_fed,
    };
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let app = Router::new()
        .route("/:device_id/init", post(handle_init))
        .route("/:device_id/rpc/:method", post(handle_rpc))
        .route("/:device_id/events", get(handle_events))
        .route("/:device_id/shutdown", post(handle_shutdown))
        .route("/:device_id/reset", post(handle_reset))
        .route("/invite_code", get(handle_invite_code))
        .route("/generate_ecash/:amount", get(handle_generate_ecash))
        .route("/ports", get(handle_ports))
        .layer(cors)
        .with_state(state);
    let mut listenfd = ListenFd::from_env();
    let listener = if let Some(listener) = listenfd.take_tcp_listener(0)? {
        info!("Using listenfd socket");
        listener.set_nonblocking(true)?;
        tokio::net::TcpListener::from_std(listener)?
    } else {
        tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, cli.port)).await?
    };
    let port = listener.local_addr()?.port();
    info!("Server listening on 127.0.0.1:{port}");
    unsafe {
        std::env::set_var("REMOTE_BRIDGE_PORT", port.to_string());
    }
    let user_cmd_failed = Arc::new(OnceCell::new());
    let user_cmd_failed2 = user_cmd_failed.clone();
    let shutdown_signal = async move {
        if let Some(command) = cli.run_after_ready {
            // devimint already prints if command failed
            if exec_user_command(command).await.is_err() {
                user_cmd_failed2.set(true).unwrap();
            }
        } else {
            tokio::signal::ctrl_c()
                .await
                .expect("failed to listen to event")
        }
    };
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    if user_cmd_failed.get().is_some_and(|x| *x) {
        bail!("User command failed");
    }

    Ok(())
}

struct RemoteRpcError(anyhow::Error);

impl<T: Into<anyhow::Error>> From<T> for RemoteRpcError {
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

impl IntoResponse for RemoteRpcError {
    fn into_response(self) -> axum::response::Response {
        Json(RpcError::from_anyhow(&self.0)).into_response()
    }
}

async fn handle_init(
    Path(device_id): Path<String>,
    State(state): State<AppState>,
    Json(opts): Json<RpcInitOpts>,
) -> Result<Json<serde_json::Value>, RemoteRpcError> {
    let bridges = state.bridges.read().await;
    if bridges.contains_key(&device_id) {
        info!("Bridge already initialized for device: {}", device_id);
        return Ok(Json(serde_json::json!({})));
    }
    drop(bridges);

    // Reuse the device's queue if one exists: it can hold events accepted
    // before a previous bridge shutdown, which the next connection still
    // owes the client.
    let queue = {
        let mut queues = state.event_queues.write().await;
        queues
            .entry(device_id.clone())
            .or_insert_with(|| {
                let (tx, rx) = mpsc::channel(1000);
                DeviceEventQueue {
                    tx,
                    rx: Arc::new(Mutex::new(EventReceiver { rx, unsent: None })),
                }
            })
            .clone()
    };
    let event_sink = Arc::new(EventSink {
        tx: queue.tx.clone(),
    });

    let data_dir = state.data_dir.join(&device_id);
    std::fs::create_dir_all(&data_dir)?;
    let bridge = fedimint_initialize_async(
        Arc::new(PathBasedRedbStorage::new(data_dir).await?),
        ConnectorRegistry::build_from_client_env()?.bind().await?,
        event_sink,
        opts.device_identifier,
        opts.app_flavor,
    )
    .await?;

    state
        .bridges
        .write()
        .await
        .insert(device_id.clone(), BridgeState { bridge });

    info!("Bridge initialized successfully for device: {}", device_id);
    Ok(Json(serde_json::json!({})))
}

async fn handle_rpc(
    Path((device_id, method)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> Result<Json<serde_json::Value>, RemoteRpcError> {
    let bridge = state
        .bridges
        .read()
        .await
        .get(&device_id)
        .context("no bridge")?
        .bridge
        .clone();

    let result = fedimint_rpc_async(bridge, method, body).await;

    Ok(Json(serde_json::from_str(&result).unwrap()))
}

async fn handle_reset(
    Path(device_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, RemoteRpcError> {
    if state.bridges.read().await.contains_key(&device_id) {
        return Err(anyhow::anyhow!(
            "bridge reset requested while device {device_id} is still alive; close the bridge before resetting"
        )
        .into());
    }

    let data_dir = state.data_dir.join(&device_id);
    if data_dir.exists() {
        std::fs::remove_dir_all(&data_dir)?;
    }
    // The queue outlives bridge shutdowns on purpose, but a reset erases
    // the device: events from the erased state must not reach its fresh
    // successor.
    state.event_queues.write().await.remove(&device_id);

    info!("Bridge reset for device: {}", device_id);
    Ok(Json(serde_json::json!({})))
}

async fn shutdown_bridge(
    bridges: &Arc<RwLock<HashMap<String, BridgeState>>>,
    device_id: &str,
) -> Result<bool, RemoteRpcError> {
    let bridge = {
        let mut state = bridges.write().await;
        let Some(bridge_state) = state.remove(device_id) else {
            return Ok(false);
        };
        bridge_state.bridge
    };

    if let Ok(runtime) = bridge.runtime() {
        let root_task_group = runtime.task_group.clone();
        root_task_group
            .shutdown_join_all(None)
            .await
            .expect("must shutdown");
    }

    debug!("waiting for bridge down");
    while Arc::strong_count(&bridge) != 1 {
        fedimint_core::task::sleep(Duration::from_millis(10)).await;
    }
    drop(bridge);

    Ok(true)
}

async fn handle_shutdown(
    Path(device_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, RemoteRpcError> {
    let removed = shutdown_bridge(&state.bridges, &device_id).await?;
    if removed {
        info!("Bridge shut down for device: {}", device_id);
    } else {
        info!("Bridge already shut down for device: {}", device_id);
    }
    Ok(Json(serde_json::json!({})))
}

async fn handle_events(
    Path(device_id): Path<String>,
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_websocket(socket, device_id, state))
}

async fn handle_websocket(mut socket: WebSocket, device_id: String, state: AppState) {
    info!("WebSocket connection established for device: {}", device_id);

    let event_rx = state
        .event_queues
        .read()
        .await
        .get(&device_id)
        .expect("bridge must initialized")
        .rx
        .clone();

    let mut rx = event_rx.lock().await;

    loop {
        // Deliver the retained event first; it only clears on a successful
        // socket send.
        if let Some(event) = rx.unsent.take() {
            let json = serde_json::to_string(&event).expect("failed to json serialize");
            if let Err(err) = socket.send(Message::Text(json)).await {
                error!("WebSocket send failed, retaining event: {}", err);
                rx.unsent = Some(event);
                break;
            }
            continue;
        }
        tokio::select! {
            Some(msg) = socket.recv() => {
                match msg {
                    Ok(Message::Close(_)) => {
                        info!("WebSocket closed by client for device: {}", device_id);
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        error!("WebSocket error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
            Some(event) = rx.rx.recv() => {
                // Park it; the top of the loop delivers and only then
                // lets go of it.
                rx.unsent = Some(event);
            }
        }
    }
    if let Err(err) = shutdown_bridge(&state.bridges, &device_id).await {
        error!(
            "Failed to shut down bridge for device {}: {}",
            device_id, err.0
        );
    }

    info!("WebSocket connection closed for device: {}", device_id);
}

async fn handle_invite_code(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, RemoteRpcError> {
    let dev_fed = state
        .dev_fed
        .as_ref()
        .context("Dev federation not available - server must be started with --with-devfed")?;

    let invite_code = dev_fed.fed.invite_code()?;

    Ok(Json(serde_json::json!({
        "invite_code": invite_code
    })))
}

// The TCP ports a client must reach to use the dev fed: every guardian's API
// plus the registered lightning gateways. Lets a harness map them into an
// android emulator with `adb reverse` (the fed binds to the host's loopback,
// which an emulator cannot see).
async fn handle_ports(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, RemoteRpcError> {
    let dev_fed = state
        .dev_fed
        .as_ref()
        .context("Dev federation not available - server must be started with --with-devfed")?;

    let mut ports: Vec<u16> = Vec::new();
    for peer_vars in dev_fed.fed.vars.values() {
        let url = fedimint_core::util::SafeUrl::parse(&peer_vars.FM_API_URL)
            .context("invalid guardian api url")?;
        ports.push(url.port().context("guardian api url has no port")?);
    }
    ports.push(dev_fed.gw_lnd.gw_port);
    ports.push(dev_fed.gw_ldk.gw_port);
    ports.push(dev_fed.gw_ldk_second.gw_port);

    Ok(Json(serde_json::json!({ "ports": ports })))
}

async fn handle_generate_ecash(
    Path(amount_msats): Path<u64>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, RemoteRpcError> {
    let _dev_fed = state
        .dev_fed
        .as_ref()
        .context("Dev federation not available - server must be started with --with-devfed")?;

    let amount = fedimint_core::Amount::from_msats(amount_msats);

    let ecash_string = cmd!(
        FedimintCli,
        "spend",
        "--allow-overpay",
        amount.msats.to_string()
    )
    .out_json()
    .await?["notes"]
        .as_str()
        .map(|s| s.to_owned())
        .context("'notes' key not found generating ecash with fedimint-cli")?;

    Ok(Json(serde_json::json!({
        "ecash": ecash_string
    })))
}
