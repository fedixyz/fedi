use eyeball_im::VectorDiff;
use imbl::Vector;

// NOTE: only used for TS bindings
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(remote = "VectorDiff")]
#[ts(export, rename = "VectorDiff")]
pub enum TsVectorDiff<T: Clone> {
    /// Multiple elements were appended.
    Append {
        /// The appended elements.
        #[ts(type = "T[]")]
        values: Vector<T>,
    },
    /// The vector was cleared.
    Clear {},
    /// An element was added at the front.
    PushFront {
        /// The new element.
        value: T,
    },
    /// An element was added at the back.
    PushBack {
        /// The new element.
        value: T,
    },
    /// The element at the front was removed.
    PopFront {},
    /// The element at the back was removed.
    PopBack {},
    /// An element was inserted at the given position.
    Insert {
        /// The index of the new element.
        ///
        /// The element that was previously at that index as well as all the
        /// ones after it were shifted to the right.
        index: usize,
        /// The new element.
        value: T,
    },
    /// A replacement of the previous value at the given position.
    Set {
        /// The index of the element that was replaced.
        index: usize,
        /// The new element.
        value: T,
    },
    /// Removal of an element.
    Remove {
        /// The index that the removed element had.
        index: usize,
    },
    /// Truncation of the vector.
    Truncate {
        /// The number of elements that remain.
        length: usize,
    },
    /// The subscriber lagged too far behind, and the next update that should
    /// have been received has already been discarded from the internal buffer.
    Reset {
        /// The full list of elements.
        #[ts(type = "T[]")]
        values: Vector<T>,
    },
}
