use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use eyeball::Subscriber;
use eyeball_im::VectorDiff;
use fedimint_core::task::{MaybeSend, MaybeSync, TaskGroup};
use futures::{Future, Stream, StreamExt};
use imbl::Vector;
use serde::Serialize;
use tokio::sync::Mutex;
use tracing::warn;

use crate::error::ErrorCode;
use crate::event::{EventSink, TypedEventExt};
use crate::serde::{SerdeAs, SerdeVectorDiff};

/// ObservableVec is special; it utilizes VectorDiff for efficient
/// synchronization of vectors between the bridge and the frontend.
///
/// Each ObservableUpdate contains a list of VectorDiffs.
///
/// For example, to move an item from the 8th index to the
/// 0th index, you would use:
/// [Remove { index: 8 }, PushFront { value: <value> }].
///
/// Multiple diffs are bundled in a single update to minimize
/// flickering on the frontend.
///
/// Refer to `VectorDiff` documentation for more details.
pub type ObservableVec<T> = Observable<Vector<T>>;
pub type ObservableVecUpdate<T> =
    ObservableUpdate<SerdeAs<Vec<VectorDiff<T>>, Vec<SerdeVectorDiff<T>>>>;

#[allow(dead_code)]
// hack for typescript exporting
mod __hidden {
    use super::*;

    #[derive(Debug, Clone, ts_rs::TS)]
    #[ts(export, export_to = "target/bindings/")]
    pub struct ObservableVec<T>(Observable<Vec<T>>);

    #[derive(Debug, Clone, ts_rs::TS)]
    #[ts(export, export_to = "target/bindings/")]
    pub struct ObservableVecUpdate<T: Clone>(ObservableUpdate<Vec<SerdeVectorDiff<T>>>);
}

/// An Observable contains a value that updates over time.
///
/// The frontend must call `cancelObservable` to free up the resources
/// utilized by the Observable.
#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct Observable<T> {
    /// `id` is used to match `ObservableUpdate`.
    // 2^53 is pretty big for number of observable objects
    #[ts(type = "number")]
    pub id: u64,
    /// Initial value of the observable.
    pub initial: T,
}

impl<T> Observable<T> {
    pub fn new(id: u64, initial: T) -> Self {
        Self { id, initial }
    }
}

/// ObservableUpdate contains the change to original Observable.
///
/// `T` will only match the Observable<T> in simple observable.
#[derive(Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct ObservableUpdate<T> {
    /// id matches the id in Observable.
    /// Frontend must store ObservableUpdate with unknown, because you may
    /// receive the ObservableUpdate event before the corresponding Observable
    /// object.
    #[ts(type = "number")]
    pub id: u64,
    /// ObservableUpdate events are highly sensitive to the order
    /// in which they occur. Events may be reordered during RPC or
    /// processing phases. Use this field to correct their order.
    #[ts(type = "number")]
    pub update_index: u64,
    pub update: T,
}

impl<T> ObservableUpdate<T> {
    pub fn new(id: u64, update_index: u64, update: T) -> Self {
        Self {
            id,
            update_index,
            update,
        }
    }
}

impl<T: Clone> ObservableVecUpdate<T> {
    pub fn new_diffs(id: u64, update_index: u64, diffs: Vec<VectorDiff<T>>) -> Self {
        Self::new(id, update_index, SerdeAs::new(diffs))
    }
}

/// ObservablePool provides the necessary functionality to make observables,
/// send updates, and to cancel observables. By embedding an instance of
/// ObservablePool, any struct can leverage the power of observables without
/// needing to deal with implementation complexity.
#[derive(Clone)]
pub struct ObservablePool {
    event_sink: EventSink,
    task_group: TaskGroup,
    /// list of active observables
    observables: Arc<Mutex<HashMap<u64, TaskGroup>>>,
}

impl ObservablePool {
    pub fn new(event_sink: EventSink, task_group: TaskGroup) -> Self {
        Self {
            event_sink,
            task_group,
            observables: Default::default(),
        }
    }

    /// make observable with `initial` value and run `func` in a task group.
    /// `func` can send observable updates.
    pub async fn make_observable<T, Fut>(
        &self,
        initial: T,
        func: impl FnOnce(Self, u64) -> Fut + MaybeSend + 'static,
    ) -> Result<Observable<T>>
    where
        T: 'static,
        Fut: Future<Output = Result<()>> + MaybeSend + MaybeSync + 'static,
    {
        static OBSERVABLE_ID: AtomicU64 = AtomicU64::new(0);
        let id = OBSERVABLE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let observable = Observable::new(id, initial);
        let tg = self.task_group.make_subgroup();
        {
            let mut observables = self.observables.lock().await;
            observables.insert(id, tg.clone());
            // should be independent of number of rooms and number of messages
            const OBSERVABLE_WARN_LIMIT: usize = 20;
            let observable_counts = observables.len();
            if OBSERVABLE_WARN_LIMIT < observable_counts {
                warn!(%observable_counts, "frontend is using too many observabes, likely forgot to unsubscribe");
            }
        };
        let this = self.clone();
        tg.spawn_cancellable(
            format!("observable type={}", std::any::type_name::<T>()),
            func(this, id),
        );
        Ok(observable)
    }

    /// Helper function to make an observable using a stream. Typically T will
    /// be the type used within Rust code and R will be the corresponding RPC
    /// type. If an initial value is not provided, attempts to get the first
    /// item from the stream.
    pub async fn make_observable_from_stream<T, R>(
        &self,
        initial: Option<T>,
        stream: impl Stream<Item = T> + MaybeSync + MaybeSend + 'static,
    ) -> Result<Observable<R>>
    where
        T: std::fmt::Debug + MaybeSend + MaybeSync + 'static,
        R: 'static + Clone + Serialize + std::fmt::Debug + MaybeSend + MaybeSync + From<T>,
    {
        let mut stream = Box::pin(stream);
        let initial = if let Some(initial) = initial {
            initial
        } else {
            stream
                .next()
                .await
                .context("first element not found in stream")?
        };
        self.make_observable(R::from(initial), move |this, id| async move {
            let mut update_index = 0;
            while let Some(value) = stream.next().await {
                this.send_observable_update(ObservableUpdate::new(
                    id,
                    update_index,
                    R::from(value),
                ))
                .await;
                update_index += 1;
            }
            Ok(())
        })
        .await
    }

    /// Helper function to make an observable using a stream of vector diffs.
    /// Typically T will be the type used within Rust code and R will be the
    /// corresponding RPC type. If an initial is not provided, attempts to
    /// get the first item from the stream.
    pub async fn make_observable_from_vec_diff_stream<T, R>(
        &self,
        initial: Vector<T>,
        stream: impl Stream<Item = Vec<VectorDiff<T>>> + MaybeSync + MaybeSend + 'static,
    ) -> Result<ObservableVec<R>>
    where
        T: std::fmt::Debug + Clone + MaybeSend + MaybeSync + 'static,
        R: 'static + Clone + Serialize + std::fmt::Debug + MaybeSend + MaybeSync + From<T>,
    {
        self.make_observable(
            initial.into_iter().map(|t| R::from(t)).collect(),
            move |this, id| async move {
                let mut update_index = 0;
                let mut stream = std::pin::pin!(stream);
                while let Some(diffs) = stream.next().await {
                    this.send_observable_update(ObservableVecUpdate::new_diffs(
                        id,
                        update_index,
                        diffs.into_iter().map(|diff| diff.map(R::from)).collect(),
                    ))
                    .await;
                    update_index += 1;
                }
                Ok(())
            },
        )
        .await
    }

    /// Convert eyeball::Subscriber to rpc Observable type.
    pub async fn make_observable_from_subscriber<T>(
        &self,
        mut sub: Subscriber<T>,
    ) -> Result<Observable<T>>
    where
        T: std::fmt::Debug + Clone + Serialize + MaybeSend + MaybeSync + 'static,
    {
        self.make_observable(sub.get(), move |this, id| async move {
            let mut update_index = 0;
            while let Some(value) = sub.next().await {
                this.send_observable_update(ObservableUpdate::new(id, update_index, value))
                    .await;
                update_index += 1;
            }
            Ok(())
        })
        .await
    }

    pub async fn observable_cancel(&self, id: u64) -> Result<()> {
        let Some(tg) = self.observables.lock().await.remove(&id) else {
            bail!(ErrorCode::UnknownObservable);
        };
        tg.shutdown_join_all(None).await?;
        Ok(())
    }

    pub async fn send_observable_update<T: Clone + Serialize + std::fmt::Debug>(
        &self,
        event: ObservableUpdate<T>,
    ) {
        self.event_sink.observable_update(event);
    }
}
