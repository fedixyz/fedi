use std::sync::Arc;

use fedimint_core::task::{MaybeSend, MaybeSync};
use serde::Serialize;

use crate::rpc_stream::RpcStreamUpdate;

/// Sends events to iOS / Android layer
pub trait IEventSink: MaybeSend + MaybeSync + 'static {
    /// Send event. Body is JSON-serialized
    fn event(&self, event_type: String, body: String);

    /// Send event, reporting whether the sink accepted it.
    ///
    /// The default forwards to [`Self::event`], which is right for sinks
    /// that have accepted the event once the call returns (a synchronous
    /// platform callback, a growable buffer). A sink that can refuse one --
    /// a bounded queue, a closed connection -- must override this to say
    /// so, for callers whose next step may only happen once the event is
    /// actually accepted: the lnurl receive subscriber persists a marker
    /// that permanently stops redelivery.
    fn try_event(&self, event_type: String, body: String) -> anyhow::Result<()> {
        self.event(event_type, body);
        Ok(())
    }
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
