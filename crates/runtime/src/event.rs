use std::sync::Arc;

use fedimint_core::task::{MaybeSend, MaybeSync};
use serde::Serialize;

use crate::rpc_stream::RpcStreamUpdate;

/// Sends events to iOS / Android layer
pub trait IEventSink: MaybeSend + MaybeSync + 'static {
    /// Send event. Body is JSON-serialized
    fn event(&self, event_type: String, body: String);
}

pub type EventSink = Arc<dyn IEventSink>;

impl dyn IEventSink {
    pub fn stream_update<T: Serialize>(&self, update: RpcStreamUpdate<T>) {
        IEventSink::event(
            self,
            "streamUpdate".into(),
            serde_json::to_string(&update).expect("failed to json serialize"),
        );
    }
}
