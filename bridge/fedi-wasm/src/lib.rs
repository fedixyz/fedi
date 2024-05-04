use std::cell::RefCell;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;

use anyhow::Context;
use fediffi::api::LiveFediApi;
use fediffi::bridge::Bridge;
use fediffi::error::ErrorCode;
use fediffi::event::IEventSink;
use fediffi::rpc::rpc_error;
use futures::FutureExt;
use js_sys::Uint8Array;
use storage::WasmStorage;
use tracing::warn;
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
    static BRIDGE: RefCell<Option<Arc<Bridge>>> = RefCell::new(None);
}

#[wasm_bindgen]
pub async fn fedimint_initialize(event_sink: EventSink, device_identifier: String) -> String {
    let value = AssertUnwindSafe(fedimint_initialize_inner(event_sink, device_identifier))
        .catch_unwind()
        .await;
    match value {
        Ok(Ok(())) => String::from("{}"),
        Ok(Err(e)) => rpc_error(&e),
        Err(_) => rpc_error(&anyhow::format_err!(ErrorCode::Panic)),
    }
}

pub async fn fedimint_initialize_inner(
    event_sink: EventSink,
    device_identifier: String,
) -> anyhow::Result<()> {
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
        device_identifier,
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
        Err(_) => rpc_error(&anyhow::format_err!(ErrorCode::Panic)),
    }
}

/// Read file in bridge VFS.
#[wasm_bindgen]
pub async fn fedimint_read_file(path: String) -> Result<Uint8Array, JsError> {
    let Some(bridge) = BRIDGE.with(|b| b.borrow().clone()) else {
        return Err(JsError::new("bridge not initialized"));
    };
    let data = bridge
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
        .storage
        .write_file(path.as_ref(), data.to_vec())
        .await
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(())
}
