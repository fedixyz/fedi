#[cfg(not(target_family = "wasm"))]
pub mod ffi;
#[cfg(not(target_family = "wasm"))]
pub mod logging;
#[cfg(any())]
pub mod matrix_tests;
pub mod rpc;

#[cfg(test)]
pub mod test_device;

// nosemgrep: ban-wildcard-imports
pub use federations::*;
#[cfg(not(target_family = "wasm"))]
// nosemgrep: ban-wildcard-imports
use ffi::*;

#[cfg(not(target_family = "wasm"))]
uniffi::include_scaffolding!("fedi");
