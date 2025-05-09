#[cfg(not(target_family = "wasm"))]
mod ffi;
#[cfg(not(target_family = "wasm"))]
pub mod logging;
#[cfg(test)]
pub mod matrix_tests;
#[cfg(not(target_family = "wasm"))]
pub mod remote;
pub mod rpc;

// nosemgrep: ban-wildcard-imports
pub use bridge_inner::*;
#[cfg(not(target_family = "wasm"))]
// nosemgrep: ban-wildcard-imports
use ffi::*;

#[cfg(not(target_family = "wasm"))]
uniffi::include_scaffolding!("fedi");
