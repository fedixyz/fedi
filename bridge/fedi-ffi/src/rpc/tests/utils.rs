use std::time::Duration;

use fedimint_core::util::backoff_util::{custom_backoff, FibonacciBackoff};

/// A constant 100ms backoff for tests with specified number of retries
#[allow(unused)] // we will likely need it in future
pub fn test_backoff(retries: usize) -> FibonacciBackoff {
    custom_backoff(
        Duration::from_millis(100),
        Duration::from_millis(100),
        Some(retries),
    )
}
