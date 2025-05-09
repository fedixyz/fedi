use std::sync::Arc;

use fedimint_core::task::{MaybeSend, MaybeSync};
use serde::Serialize;

use crate::observable::ObservableUpdate;

/// Sends events to iOS / Android layer
pub trait IEventSink: MaybeSend + MaybeSync + 'static {
    /// Send event. Body is JSON-serialized
    fn event(&self, event_type: String, body: String);
    fn events(&self) -> Vec<(String, String)> {
        panic!("IEventSink.events() is only for testing")
    }
    fn num_events_of_type(&self, _event_type: String) -> usize {
        panic!("IEventSink.num_events_of_type() is only for testing")
    }
}

pub type EventSink = Arc<dyn IEventSink>;

impl dyn IEventSink {
    pub fn observable_update<T: Serialize>(&self, update: ObservableUpdate<T>) {
        IEventSink::event(
            self,
            "observableUpdate".into(),
            serde_json::to_string(&update).expect("failed to json serialize"),
        );
    }
}
