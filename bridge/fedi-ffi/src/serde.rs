use std::marker::PhantomData;

use eyeball_im::VectorDiff;
use imbl::Vector;
use serde::{Deserialize, Serialize};
use serde_with::de::DeserializeAsWrap;
use serde_with::ser::SerializeAsWrap;
use serde_with::{DeserializeAs, SerializeAs};

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(transparent)]
#[ts(export, export_to = "target/bindings/")]
pub struct TsAny(#[ts(type = "any")] pub serde_json::Value);

#[derive(Clone, Debug)]
pub struct SerdeAs<T, U> {
    pub inner: T,
    pub phatom_data: PhantomData<U>,
}

impl<T, U> SerdeAs<T, U> {
    pub fn new(inner: T) -> Self {
        Self {
            inner,
            phatom_data: PhantomData,
        }
    }
}

impl<T, U> Serialize for SerdeAs<T, U>
where
    U: SerializeAs<T>,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        SerializeAsWrap::<T, U>::new(&self.inner).serialize(serializer)
    }
}

impl<'de, T, U> Deserialize<'de> for SerdeAs<T, U>
where
    U: DeserializeAs<'de, T>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let inner: T = DeserializeAsWrap::<T, U>::deserialize(deserializer)?.into_inner();
        Ok(Self::new(inner))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(remote = "VectorDiff")]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
#[ts(export, export_to = "target/bindings/")]
pub enum SerdeVectorDiff<T: Clone> {
    /// Multiple elements were appended.
    Append {
        /// The appended elements.
        #[ts(type = "T[]")]
        values: Vector<T>,
    },
    /// The vector was cleared.
    Clear,
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
    PopFront,
    /// The element at the back was removed.
    PopBack,
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

impl<T: Clone + Serialize> SerializeAs<VectorDiff<T>> for SerdeVectorDiff<T> {
    fn serialize_as<S>(value: &VectorDiff<T>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Self::serialize(value, serializer)
    }
}
