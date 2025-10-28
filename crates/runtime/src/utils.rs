use std::pin::pin;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bitcoin::Network;
use lightning_invoice::Currency;

pub fn display_currency(currency: Currency) -> String {
    match currency {
        Currency::Bitcoin => Network::Bitcoin.to_string(),
        Currency::Regtest => Network::Regtest.to_string(),
        Currency::BitcoinTestnet => Network::Testnet.to_string(),
        Currency::Signet => Network::Signet.to_string(),
        Currency::Simnet => "Simnet".to_string(),
    }
}

pub fn required_threashold_of(n: usize) -> usize {
    n - ((n - 1) / 3)
}

pub fn unix_now() -> anyhow::Result<u64> {
    Ok(fedimint_core::time::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())?)
}

pub fn to_unix_time(system_time: SystemTime) -> anyhow::Result<u64> {
    Ok(system_time
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())?)
}

pub trait PoisonedLockExt<T> {
    #[track_caller]
    fn ensure_lock(&self) -> std::sync::MutexGuard<'_, T>;
}

impl<T> PoisonedLockExt<T> for std::sync::Mutex<T> {
    #[track_caller]
    fn ensure_lock(&self) -> std::sync::MutexGuard<'_, T> {
        self.lock().expect("The Mutex should never be poisoned")
    }
}

// Executes the given future against a timeout duration. If the future takes
// longer than the timeout, the logger function is invoked. The execution of the
// future however, is not cancelled or interrupted.
pub async fn timeout_log_only<F, T, U>(fut: F, duration: Duration, logger: U) -> T
where
    F: Future<Output = T>,
    U: FnOnce(),
{
    let mut inner = pin!(fut);
    let sleep = fedimint_core::task::sleep(duration);
    tokio::select! {
        biased;
        value = &mut inner => {
            value
        },
        () = sleep => {
            logger();
            inner.await
        },
    }
}
