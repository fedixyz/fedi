#![cfg(target_family = "wasm")]

use std::cell::RefCell;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;

use anyhow::{bail, Context};
use bridge::Bridge;
use fediffi::rpc::rpc_error_json;
use futures::FutureExt;
use js_sys::Uint8Array;
use rpc_types::error::ErrorCode;
use rpc_types::{RpcAppFlavor, RpcInitOpts};
use runtime::api::LiveFediApi;
use runtime::event::IEventSink;
use runtime::features::{FeatureCatalog, RuntimeEnvironment};
use storage::WasmStorage;
use tracing::{error, warn};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsError;

mod db;
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
    static BRIDGE: RefCell<Option<Arc<Bridge>>> = const { RefCell::new(None) };
}

#[wasm_bindgen]
pub async fn fedimint_initialize(event_sink: EventSink, init_opts_json: String) -> String {
    let value = AssertUnwindSafe(fedimint_initialize_inner(event_sink, init_opts_json))
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
) -> anyhow::Result<()> {
    let init_opts: RpcInitOpts = match serde_json::from_str(&init_opts_json) {
        Ok(init_opts) => init_opts,
        Err(e) => {
            error!(?e, "Error parsing init_opts_json");
            bail!("Bridge init failed, cannot parse init_opts_json {:?}", e);
        }
    };
    let event_sink = Arc::new(event_sink);
    logging::init(event_sink.clone());
    if BRIDGE.with(|b| b.borrow().is_some()) {
        warn!("bridge is already initialized");
        return Ok(());
    }
    let storage = WasmStorage::new()
        .await
        .context("Failed to initialize storage")?;
    let fedi_api = Arc::new(LiveFediApi::new());

    let bridge = fediffi::rpc::fedimint_initialize_async(
        Arc::new(storage),
        event_sink.clone(),
        fedi_api,
        init_opts.device_identifier,
        FeatureCatalog::new(match init_opts.app_flavor {
            RpcAppFlavor::Dev => RuntimeEnvironment::Dev,
            RpcAppFlavor::Nightly => RuntimeEnvironment::Staging,
            RpcAppFlavor::Bravo => RuntimeEnvironment::Prod,
        })
        .into(),
    )
    .await
    .context("Failed to initialize the bridge")?;

    BRIDGE.with(|bridge_cell| bridge_cell.replace(Some(bridge)));
    Ok(())
}

#[wasm_bindgen]
pub async fn fedimint_rpc(method: String, payload: String) -> String {
    let value = AssertUnwindSafe(async move {
        let Some(bridge) = BRIDGE.with(|b| b.borrow().clone()) else {
            return r#"{"error": "Bridge not initialized"}"#.to_owned();
        };
        fediffi::rpc::fedimint_rpc_async(bridge, method, payload).await
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
    let Some(bridge) = BRIDGE.with(|b| b.borrow().clone()) else {
        return Err(JsError::new("bridge not initialized"));
    };
    let data = bridge
        .runtime()
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
    let Some(bridge) = BRIDGE.with(|b| b.borrow().clone()) else {
        return Err(JsError::new("bridge not initialized"));
    };
    bridge
        .runtime()
        .storage
        .write_file(path.as_ref(), data.to_vec())
        .await
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(())
}
