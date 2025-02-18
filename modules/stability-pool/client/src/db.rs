use std::time::SystemTime;

use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use stability_pool_common::{AccountHistoryItem, AccountId, SyncResponse};

#[repr(u8)]
#[derive(Clone, Debug)]
pub enum DbKeyPrefix {
    /// The most recently fetched sync response from the server
    SyncResponse = 0x01,
    /// Account history items fetched from server
    AccountHistory = 0x02,
}

#[derive(Debug, Encodable, Decodable)]
pub struct CachedSyncResponseKey {
    pub account_id: AccountId,
}

#[derive(Debug, Encodable, Decodable)]
pub struct CacheSyncResponseValue {
    pub fetch_time: SystemTime,
    pub value: SyncResponse,
}

#[derive(Debug, Encodable, Decodable)]
pub struct AccountHistoryItemKey {
    pub account_id: AccountId,
    pub index: u64,
}

#[derive(Debug, Encodable, Decodable)]
pub struct AccountHistoryItemKeyPrefix {
    pub account_id: AccountId,
}

impl_db_record!(
    key = CachedSyncResponseKey,
    value = CacheSyncResponseValue,
    db_prefix = DbKeyPrefix::SyncResponse
);

impl_db_record!(
    key = AccountHistoryItemKey,
    value = AccountHistoryItem,
    db_prefix = DbKeyPrefix::AccountHistory
);
impl_db_lookup!(
    key = AccountHistoryItemKey,
    query_prefix = AccountHistoryItemKeyPrefix
);
