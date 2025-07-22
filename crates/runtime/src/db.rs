use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};

#[repr(u8)]
pub enum BridgeDbPrefix {
    // Prefix for multispend db namespace
    MultispendPrefix = 0x01,
    // When a returning user rejoins a federation using a backup, we perform a check to
    // ensure that the backup wasn't corrupted. We do this by checking all the blind nonces for
    // each e-cash denomination with the servers. If we detect that any blind nonce is subject
    // to reuse, the user should be made to rejoin the federation whilst ensuring recovery from
    // scratch. This will guarantee that they don't lose money. We auto-leave, and store the
    // invite code here to later recall.
    FederationPendingRejoinFromScratch = 0x02,

    AppState = 0x03,
    // Prefix for file storage in WASM environment
    WasmFileStorage = 0x04,
}

#[derive(Debug, Decodable, Encodable)]
pub struct FederationPendingRejoinFromScratchKey {
    pub invite_code_str: String,
}

#[derive(Debug, Decodable, Encodable)]
pub struct FederationPendingRejoinFromScratchKeyPrefix;

impl_db_record!(
    key = FederationPendingRejoinFromScratchKey,
    value = (),
    db_prefix = BridgeDbPrefix::FederationPendingRejoinFromScratch,
);

impl_db_lookup!(
    key = FederationPendingRejoinFromScratchKey,
    query_prefix = FederationPendingRejoinFromScratchKeyPrefix,
);
