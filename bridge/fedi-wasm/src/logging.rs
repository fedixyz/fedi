use std::io::Write;
use std::sync::{Arc, Mutex as StdMutex};

use runtime::event::IEventSink;
use tracing_subscriber::fmt::MakeWriter;
// nosemgrep: ban-wildcard-imports
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;
use wasm_bindgen::prelude::wasm_bindgen;

thread_local! {
    static LOG_BUFFER: Arc<StdMutex<Vec<u8>>> = Arc::new(StdMutex::new(Vec::new()));
}

fn set_panic_hook() {
    std::panic::set_hook(Box::new(move |info| {
        let buffer = LOG_BUFFER.with(Arc::clone);
        // the error case should never happen but still avoid a double panic => abort
        // here
        if let Ok(mut buffer) = buffer.lock() {
            // Add the panic info to the buffer, so it shows in future get_info calls.
            buffer.extend_from_slice(&info.to_string().into_bytes());
            buffer.push(b'\n');
        }

        console_error_panic_hook::hook(info);
    }));
}

struct MemWriter<'a, T>(std::sync::MutexGuard<'a, T>);
impl<T: Write> Write for MemWriter<'_, T> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        (*self.0).write(buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        (*self.0).flush()
    }
}

struct MemMakeWriter<T>(Arc<StdMutex<T>>);
impl<'a, T: 'a + Write> MakeWriter<'a> for MemMakeWriter<T> {
    type Writer = MemWriter<'a, T>;
    fn make_writer(&'a self) -> Self::Writer {
        MemWriter(self.0.lock().expect("lock got posioned"))
    }
}

pub fn init(_event_sink: Arc<dyn IEventSink>) {
    set_panic_hook();
    let log_buffer_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_writer(MemMakeWriter(LOG_BUFFER.with(Arc::clone)))
        .without_time();
    tracing_subscriber::registry()
        .with(log_buffer_layer)
        .with(EnvFilter::new("info,fedimint_client=debug,fediffi=trace"))
        .with(tracing_wasm::WASMLayer::default())
        .init();
}

#[wasm_bindgen]
/// Returns a blob with log contents
pub fn get_logs() -> wasm_bindgen::JsValue {
    let buffer = LOG_BUFFER.with(Arc::clone);
    let buffer = buffer.lock().unwrap();
    // application/octet-stream to convince the browser to download the file
    (*gloo_file::File::new_with_options(
        "fedi-wasm.log",
        &**buffer,
        Some("application/octet-stream"),
        None,
    ))
    .clone()
    .into()
}
