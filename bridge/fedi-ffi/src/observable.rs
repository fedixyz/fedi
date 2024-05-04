use eyeball_im::VectorDiff;
use imbl::Vector;
use serde::Serialize;

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
