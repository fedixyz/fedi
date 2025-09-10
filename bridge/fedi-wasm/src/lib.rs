#![cfg(target_family = "wasm")]

use std::cell::RefCell;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;

use anyhow::{Context, bail};
use bridge::Bridge;
use fediffi::rpc::rpc_error_json;
use futures::FutureExt;
use js_sys::Uint8Array;
use rpc_types::RpcInitOpts;
use rpc_types::error::ErrorCode;
use runtime::event::IEventSink;
use runtime::storage::Storage;
use storage::WasmStorage;
use tracing::{error, warn};
use wasm_bindgen::JsError;
use wasm_bindgen::prelude::wasm_bindgen;
use web_sys::FileSystemSyncAccessHandle;

mod logging;
mod storage;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen]
    pub type EventSink;

    #[wasm_bindgen(method)]
    fn event(this: &EventSink, event_type: String, body: String);
}

impl IEventSink for EventSink {
    fn event(&self, event_type: String, body: String) {
        self.event(event_type, body)
    }
}

thread_local! {
    static WASM_STATE: RefCell<Option<WasmState>> = const { RefCell::new(None) };
}

#[derive(Clone)]
struct WasmState {
    bridge: Arc<Bridge>,
    storage: Storage,
}

#[wasm_bindgen]
pub async fn fedimint_initialize(
    event_sink: EventSink,
    init_opts_json: String,
    log_file_handle: FileSystemSyncAccessHandle,
    db_file_handle: FileSystemSyncAccessHandle,
) -> String {
    let value = AssertUnwindSafe(fedimint_initialize_inner(
        event_sink,
        init_opts_json,
        log_file_handle,
        db_file_handle,
    ))
    .catch_unwind()
    .await;
    match value {
        Ok(Ok(())) => String::from("{}"),
        Ok(Err(e)) => rpc_error_json(&e),
        Err(_) => rpc_error_json(&anyhow::format_err!(ErrorCode::Panic)),
    }
}

pub async fn fedimint_initialize_inner(
    event_sink: EventSink,
    init_opts_json: String,
    log_file_handle: FileSystemSyncAccessHandle,
    db_file_handle: FileSystemSyncAccessHandle,
) -> anyhow::Result<()> {
    let init_opts: RpcInitOpts = match serde_json::from_str(&init_opts_json) {
        Ok(init_opts) => init_opts,
        Err(e) => {
            error!(?e, "Error parsing init_opts_json");
            bail!("Bridge init failed, cannot parse init_opts_json {:?}", e);
        }
    };
    let event_sink = Arc::new(event_sink);
    logging::init(event_sink.clone(), log_file_handle, init_opts.log_level).await;
    if WASM_STATE.with(|w| w.borrow().is_some()) {
        warn!("bridge is already initialized");
        return Ok(());
    }
    let cursed_db = fedimint_cursed_redb::MemAndRedb::new(db_file_handle)
        .context("Failed to create cursed redb")?;
    let storage = WasmStorage::new(cursed_db.into())
        .await
        .context("Failed to initialize storage")?;
    let storage = Arc::new(storage) as Storage;

    let bridge = fediffi::rpc::fedimint_initialize_async(
        storage.clone(),
        event_sink,
        init_opts.device_identifier,
        init_opts.app_flavor,
    )
    .await
    .context("Failed to initialize the bridge")?;

    WASM_STATE.with(|cell| cell.replace(Some(WasmState { bridge, storage })));
    Ok(())
}

#[wasm_bindgen]
pub async fn fedimint_rpc(method: String, payload: String) -> String {
    let value = AssertUnwindSafe(async move {
        let Some(wasm_state) = WASM_STATE.with(|w| w.borrow().clone()) else {
            return r#"{"error": "Bridge not initialized"}"#.to_owned();
        };
        fediffi::rpc::fedimint_rpc_async(wasm_state.bridge, method, payload).await
    })
    .catch_unwind()
    .await;

    match value {
        Ok(value) => value,
        Err(_) => rpc_error_json(&anyhow::format_err!(ErrorCode::Panic)),
    }
}

/// Read file in bridge VFS.
#[wasm_bindgen]
pub async fn fedimint_read_file(path: String) -> Result<Uint8Array, JsError> {
    let Some(wasm_state) = WASM_STATE.with(|w| w.borrow().clone()) else {
        return Err(JsError::new("bridge not initialized"));
    };
    let data = wasm_state
        .storage
        .read_file(path.as_ref())
        .await
        .and_then(|maybe_content| maybe_content.context("File not found"))
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(Uint8Array::from(data.as_ref()))
}

/// Write file in bridge VFS.
#[wasm_bindgen]
pub async fn fedimint_write_file(path: String, data: Uint8Array) -> Result<(), JsError> {
    let Some(wasm_state) = WASM_STATE.with(|w| w.borrow().clone()) else {
        return Err(JsError::new("bridge not initialized"));
    };
    wasm_state
        .storage
        .write_file(path.as_ref(), data.to_vec())
        .await
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(())
}
