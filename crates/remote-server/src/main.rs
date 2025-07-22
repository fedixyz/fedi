use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use bridge::Bridge;
use fediffi::ffi::PathBasedStorage;
use fediffi::rpc::{fedimint_initialize_async, fedimint_rpc_async};
use fedimint_logging::TracingSetup;
use listenfd::ListenFd;
use rpc_types::error::RpcError;
use rpc_types::RpcInitOpts;
use runtime::api::LiveFediApi;
use runtime::event::IEventSink;
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex, RwLock};
use tower_http::cors::{Any, CorsLayer};
use tracing::{debug, error, info};

type BridgeArc = Arc<Bridge>;

#[derive(Clone)]
struct AppState {
    bridges: Arc<RwLock<HashMap<String, BridgeState>>>,
    data_dir: PathBuf,
}

struct BridgeState {
    bridge: BridgeArc,
    event_rx: Arc<Mutex<mpsc::Receiver<BridgeEvent>>>,
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
        let event = BridgeEvent {
            event: event_type,
            data: body,
        };
        let _ = self.tx.try_send(event);
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    TracingSetup::default().init()?;

    let data_dir = std::env::args().nth(1).expect("must be present");

    info!("Starting remote bridge server with data dir: {}", data_dir);

    let state = AppState {
        bridges: Arc::new(RwLock::new(HashMap::new())),
        data_dir: PathBuf::from(data_dir),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/:device_id/init", post(handle_init))
        .route("/:device_id/rpc/:method", post(handle_rpc))
        .route("/:device_id/events", get(handle_events))
        .layer(cors)
        .with_state(state);

    let mut listenfd = ListenFd::from_env();
    let listener = if let Some(listener) = listenfd.take_tcp_listener(0)? {
        info!("Using listenfd socket");
        listener.set_nonblocking(true)?;
        tokio::net::TcpListener::from_std(listener)?
    } else {
        let addr = "127.0.0.1:26722";
        info!("Server listening on {}", addr);
        tokio::net::TcpListener::bind(addr).await?
    };

    axum::serve(listener, app).await?;

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

    let (event_tx, event_rx) = mpsc::channel(1000);
    let event_sink = Arc::new(EventSink {
        tx: event_tx.clone(),
    });

    let data_dir = state.data_dir.join(&device_id);
    std::fs::create_dir_all(&data_dir)?;
    let bridge = fedimint_initialize_async(
        Arc::new(PathBasedStorage::new(data_dir).await?),
        event_sink,
        Arc::new(LiveFediApi::new()),
        opts.device_identifier,
        opts.app_flavor,
    )
    .await?;

    state.bridges.write().await.insert(
        device_id.clone(),
        BridgeState {
            bridge,
            event_rx: Arc::new(Mutex::new(event_rx)),
        },
    );

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
        .bridges
        .read()
        .await
        .get(&device_id)
        .expect("bridge must initialized")
        .event_rx
        .clone();

    let mut rx = event_rx.lock().await;

    loop {
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
            Some(event) = rx.recv() => {
                if let Ok(json) = serde_json::to_string(&event) {
                    if socket.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
    {
        let mut state = state.bridges.write().await;
        let bridge = state
            .remove(&device_id)
            .expect("bridge must be present")
            .bridge;

        if let Ok(runtime) = bridge.runtime() {
            let root_task_group = runtime.task_group.clone();
            root_task_group
                .shutdown_join_all(None)
                .await
                .expect("must shutdown");
        }

        // hold the write lock until bridge is dead
        debug!("waiting for bridge down");
        while Arc::strong_count(&bridge) != 1 {
            fedimint_core::task::sleep(Duration::from_millis(10)).await;
        }
        drop(bridge);
    }

    info!("WebSocket connection closed for device: {}", device_id);
}
