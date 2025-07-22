use std::collections::BTreeMap;
use std::sync::Arc;

use anyhow::Result;
use runtime::utils::PoisonedLockExt as _;
use tokio::sync::{Mutex, OwnedMutexGuard, TryLockError};

/// To prevent concurrent fedimint client to exist for same federation id
///
/// A lock guard is meant to be held for entire duration of fedimint client
/// being open
#[derive(Default)]
pub struct FederationsLocker {
    locks: std::sync::Mutex<BTreeMap<String, Arc<Mutex<()>>>>,
}

// Guard to prevent concurrent clients for same federation id.
pub struct FederationLockGuard {
    _lock: OwnedMutexGuard<()>,
}

impl FederationsLocker {
    pub async fn lock_federation(&self, federation_id: String) -> FederationLockGuard {
        let federation_lock = {
            let mut big_lock = self.locks.ensure_lock();
            Arc::clone(big_lock.entry(federation_id).or_default())
        };
        FederationLockGuard {
            _lock: federation_lock.lock_owned().await,
        }
    }
    pub fn try_lock_federation(
        &self,
        federation_id: String,
    ) -> Result<FederationLockGuard, TryLockError> {
        let federation_lock = {
            let mut big_lock = self.locks.ensure_lock();
            Arc::clone(big_lock.entry(federation_id).or_default())
        };
        Ok(FederationLockGuard {
            _lock: federation_lock.try_lock_owned()?,
        })
    }
}
