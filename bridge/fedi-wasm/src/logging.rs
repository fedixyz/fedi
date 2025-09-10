use std::io::Write;
use std::sync::{Arc, Mutex as StdMutex};

use runtime::event::IEventSink;
use tracing_subscriber::EnvFilter;
// nosemgrep: ban-wildcard-imports
use tracing_subscriber::prelude::*;
use wasm_bindgen::JsValue;
use web_sys::{FileSystemReadWriteOptions, FileSystemSyncAccessHandle};

/// when the log file size reached 2 * KEEP_SIZE, we copy out the last
/// KEEP_SIZE bytes and truncate it.
const KEEP_SIZE: u64 = 5 * 1024 * 1024; // 5MB

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
        .with_timer(tracing_subscriber::fmt::time::ChronoUtc::default());
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

fn read_exact(
    sync_handle: &FileSystemSyncAccessHandle,
    buffer: &mut [u8],
    position: u64,
) -> Result<(), JsValue> {
    let read_options = FileSystemReadWriteOptions::new();
    let mut total_read = 0;

    while total_read < buffer.len() {
        read_options.set_at((position + total_read as u64) as f64);
        let bytes_read = sync_handle
            .read_with_u8_array_and_options(&mut buffer[total_read..], &read_options)?
            as usize;
        total_read += bytes_read;
    }
    assert_eq!(total_read, buffer.len());

    Ok(())
}

fn write_exact(
    sync_handle: &FileSystemSyncAccessHandle,
    buffer: &[u8],
    position: u64,
) -> Result<(), JsValue> {
    let write_options = FileSystemReadWriteOptions::new();
    let mut total_written = 0;

    while total_written < buffer.len() {
        write_options.set_at((position + total_written as u64) as f64);
        let bytes_written = sync_handle
            .write_with_u8_array_and_options(&buffer[total_written..], &write_options)?
            as usize;
        total_written += bytes_written;
    }

    assert_eq!(total_written, buffer.len());

    Ok(())
}

impl WasmLogFile {
    fn new(mut sync_handle: FileSystemSyncAccessHandle) -> Self {
        let write_position = Self::trim_log_file_if_needed(&mut sync_handle) as f64;

        let write_options = FileSystemReadWriteOptions::new();
        write_options.set_at(write_position);
        Self {
            sync_handle,
            write_options,
            write_position,
        }
    }

    fn trim_log_file_if_needed(sync_handle: &mut FileSystemSyncAccessHandle) -> u64 {
        match Self::trim_log_file_if_needed_inner(sync_handle) {
            Ok(pos) => pos,
            Err(_) => {
                gloo_console::error!("Errors while trimming log file");
                // Copy failed, just truncate to 5MB
                let _ = sync_handle.truncate_with_f64(KEEP_SIZE as f64);
                let _ = sync_handle.flush();
                KEEP_SIZE
            }
        }
    }

    fn trim_log_file_if_needed_inner(
        sync_handle: &mut FileSystemSyncAccessHandle,
    ) -> Result<u64, JsValue> {
        // where to start copying the last KEEP_SIZE bytes from
        let start_offset = {
            let current_size = sync_handle.get_size()? as u64;

            if current_size <= 2 * KEEP_SIZE {
                return Ok(current_size);
            }
            current_size - KEEP_SIZE
        };

        let mut total_copied = 0;
        let mut buffer = vec![0u8; 128 * 1024];

        while total_copied < KEEP_SIZE {
            let chunk_size = usize::try_from((KEEP_SIZE - total_copied).min(buffer.len() as u64))
                .expect("must fit because min is usize");

            read_exact(
                sync_handle,
                &mut buffer[..chunk_size],
                start_offset + total_copied,
            )?;

            write_exact(sync_handle, &buffer[..chunk_size], total_copied)?;

            total_copied += chunk_size as u64;
        }

        assert_eq!(total_copied, KEEP_SIZE);
        // Truncate the file to the new size
        sync_handle.truncate_with_f64(KEEP_SIZE as f64)?;
        sync_handle.flush()?;

        Ok(KEEP_SIZE)
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
