use std::io::Write;
use std::sync::{Arc, Mutex as StdMutex};

use runtime::event::IEventSink;
// nosemgrep: ban-wildcard-imports
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;
use wasm_bindgen::JsValue;
use web_sys::{FileSystemReadWriteOptions, FileSystemSyncAccessHandle};

fn set_panic_hook() {
    std::panic::set_hook(Box::new(move |info| {
        tracing::info!(%info, "panic");
        // write separately in case backtrace capturing bugs out.
        let backtrace = std::backtrace::Backtrace::force_capture();
        tracing::info!(%backtrace, "panic");
        console_error_panic_hook::hook(info);
    }));
}

pub async fn init(
    _event_sink: Arc<dyn IEventSink>,
    sync_handle: FileSystemSyncAccessHandle,
    log_level: Option<String>,
) {
    set_panic_hook();
    let log_buffer_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_writer(StdMutex::new(WasmLogFile::new(sync_handle)))
        .without_time();
    tracing_subscriber::registry()
        .with(log_buffer_layer)
        .with(EnvFilter::new(
            log_level
                .as_deref()
                .unwrap_or("info,fedimint_client=debug,fediffi=trace"),
        ))
        .with(tracing_wasm::WASMLayer::default())
        .init();
}

struct WasmLogFile {
    sync_handle: FileSystemSyncAccessHandle,
    // js at its peak: numbers are f64
    write_position: f64,
    // write_options.at == write_position
    write_options: FileSystemReadWriteOptions,
}

fn js_error_to_anyhow(unknown_error: impl Into<JsValue>) -> anyhow::Error {
    match gloo_utils::errors::JsError::try_from(unknown_error.into()) {
        Ok(error) => error.into(),
        Err(error) => anyhow::format_err!(error.to_string()),
    }
}
fn js_error_to_io_error(err: impl Into<JsValue>) -> std::io::Error {
    std::io::Error::other(js_error_to_anyhow(err))
}

impl WasmLogFile {
    fn new(sync_handle: FileSystemSyncAccessHandle) -> Self {
        let write_options = FileSystemReadWriteOptions::new();
        let write_position = sync_handle.get_size().unwrap();
        write_options.set_at(write_position);
        Self {
            sync_handle,
            write_options,
            write_position,
        }
    }
}

impl Write for WasmLogFile {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let bytes_writen = self
            .sync_handle
            .write_with_u8_array_and_options(buf, &self.write_options)
            .map_err(js_error_to_io_error)?;
        self.write_position += bytes_writen;
        self.write_options.set_at(self.write_position);
        Ok(bytes_writen as usize)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.sync_handle.flush().map_err(js_error_to_io_error)
    }
}

// SAFETY: we don't use threads in wasm, this will fail very loudly at runtime
// if this get sent across threads
unsafe impl Send for WasmLogFile {}
