use std::collections::HashMap;
use std::fmt::Debug;
use std::marker::PhantomData;
use std::sync::Arc;

use anyhow::{Result, bail};
use eyeball_im::VectorDiff;
use fedimint_core::task::{MaybeSend, TaskGroup};
use futures::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::warn;
use ts_rs::TS;

use crate::event::EventSink;
use crate::ts::TsVectorDiff;

/// RpcStreamId is a type-safe identifier for RPC streams.
/// The phantom type ensures type safety between frontend and backend.
#[derive(Debug, Clone, Copy, Deserialize, TS)]
#[ts(export, bound = "T: TS")]
#[ts(type = "Opaque<number, ['rpc_stream_id', T]>")]
#[serde(bound(deserialize = ""))]
#[serde(transparent)]
pub struct RpcStreamId<T>(u64, #[serde(skip)] PhantomData<T>);

impl<T: TS> RpcStreamId<T> {
    pub fn new(id: u64) -> Self {
        Self(id, PhantomData)
    }
}

#[derive(Deserialize, Debug, Clone, TS)]
#[ts(bound = "T: Clone + TS")]
#[ts(export)]
#[serde(bound(deserialize = ""))]
pub struct RpcVecDiffStreamId<T>(
    #[ts(as = "RpcStreamId<Vec<TsVectorDiff<T>>>")] pub RpcStreamId<Vec<VectorDiff<T>>>,
);

/// RpcStreamUpdate contains updates for an RPC stream.
///
/// The frontend receives these updates via the event system.
#[derive(Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export)]
pub struct RpcStreamUpdate<T> {
    /// Stream ID that this update belongs to
    #[ts(type = "number")]
    pub stream_id: u64,
    /// Sequence number to ensure correct ordering of updates
    #[ts(type = "number")]
    pub sequence: u64,
    /// The actual update data
    pub data: T,
}

impl<T> RpcStreamUpdate<T> {
    pub fn new(stream_id: u64, sequence: u64, data: T) -> Self {
        Self {
            stream_id,
            sequence,
            data,
        }
    }
}

/// RpcStreamPool manages RPC streams lifecycle.
/// It handles stream registration, update dispatch, and cleanup.
#[derive(Clone)]
pub struct RpcStreamPool {
    event_sink: EventSink,
    task_group: TaskGroup,
    /// Active streams mapped by their ID
    streams: Arc<Mutex<HashMap<u64, TaskGroup>>>,
}

impl RpcStreamPool {
    pub fn new(event_sink: EventSink, task_group: TaskGroup) -> Self {
        Self {
            event_sink,
            task_group,
            streams: Default::default(),
        }
    }

    pub async fn reset(&self) {
        let mut lock = self.streams.lock().await;
        for (_, tg) in lock.drain() {
            tg.shutdown();
        }
    }

    /// Register a new stream with the given ID.
    pub async fn register_stream<T>(
        &self,
        stream_id: RpcStreamId<T>,
        stream: impl Stream<Item = T> + MaybeSend + 'static,
    ) -> anyhow::Result<()>
    where
        T: Debug + Serialize + MaybeSend + 'static,
    {
        let stream_id = stream_id.0;
        let tg = self.task_group.make_subgroup();
        {
            let mut streams = self.streams.lock().await;
            if streams.contains_key(&stream_id) {
                bail!("Duplicated stream id: {stream_id}");
            }
            streams.insert(stream_id, tg.clone());
            // Warn if too many streams are active
            const STREAM_WARN_LIMIT: usize = 20;
            let stream_count = streams.len();
            if STREAM_WARN_LIMIT < stream_count {
                warn!(%stream_count, "frontend is using too many streams, likely forgot to cancel");
            }
        };

        let this = self.clone();
        tg.spawn_cancellable(
            format!("rpc_stream type={}", std::any::type_name::<T>()),
            async move {
                let mut sequence = 0;
                let mut stream = Box::pin(stream);
                while let Some(data) = stream.next().await {
                    this.event_sink
                        .stream_update(RpcStreamUpdate::new(stream_id, sequence, data));
                    sequence += 1;
                }
            },
        );
        Ok(())
    }

    /// Cancel a stream and free its resources
    pub async fn cancel_stream(&self, stream_id: u64) -> Result<()> {
        let Some(tg) = self.streams.lock().await.remove(&stream_id) else {
            bail!("Unknown stream id: {stream_id}");
        };
        tg.shutdown_join_all(None).await?;
        Ok(())
    }
}
