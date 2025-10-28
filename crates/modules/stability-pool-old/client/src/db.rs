use std::time::SystemTime;

use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use stability_pool_common_old::AccountInfo;

#[repr(u8)]
#[derive(Clone, Debug)]
pub enum DbKeyPrefix {
    /// The most recently fetched copy of the user's account info from
    /// the server, stored in a tuple with a timestamp.
    AccountInfo = 0x01,
}

#[derive(Debug, Encodable, Decodable)]
pub struct AccountInfoKey;

#[derive(Debug, Encodable, Decodable)]
#[allow(dead_code)]
pub struct AccountInfoKeyPrefix;

impl_db_record!(
    key = AccountInfoKey,
    value = (SystemTime, AccountInfo),
    db_prefix = DbKeyPrefix::AccountInfo
);
impl_db_lookup!(key = AccountInfoKey, query_prefix = AccountInfoKeyPrefix);
