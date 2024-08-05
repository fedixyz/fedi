pub mod api;
pub mod bridge;
pub mod community;
pub mod federation_v2;
// FIXME: kinda feels like this should just be it's own crate ...
pub mod constants;
pub mod device_registration;
pub mod error;
pub mod event;
pub mod features;
pub mod fedi_fee;
#[cfg(not(target_family = "wasm"))]
mod ffi;
#[cfg(not(target_family = "wasm"))]
pub mod logging;
pub mod matrix;
pub mod observable;
#[cfg(not(target_family = "wasm"))]
pub mod remote;
pub mod rpc;
pub mod serde;

pub mod storage;
pub mod translate;
pub mod types;
pub mod utils;

#[cfg(not(target_family = "wasm"))]
// nosemgrep: ban-wildcard-imports
use ffi::*;

#[cfg(not(target_family = "wasm"))]
uniffi::include_scaffolding!("fedi");
