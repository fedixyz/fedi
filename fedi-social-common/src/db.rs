use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{impl_db_lookup, impl_db_record};
use serde::{Deserialize, Serialize};
use strum_macros::EnumIter;

use crate::common::{
    BackupId, BackupRequest, DoubleEncryptedData, EncryptedRecoveryShare, RecoveryId,
    RecoveryRequest,
};

#[repr(u8)]
#[derive(Clone, EnumIter, Debug)]
pub enum DbKeyPrefix {
    // TODO: figure out the numbers
    /// Backup stored in the federation
    Backup = 0x90,
    /// Index of all used ciphertexts.
    ///
    /// To prevent re-using same ciphertext in a different backup (with a
    /// different Id), store the index of all used ones separately.
    ///
    /// Conceptually this is just another db index of [`Self::Backup`].
    UsedBackupCiphertext = 0x91,
    /// Recovery started, verification document provided
    Recovery = 0x92,
    DecryptionShare = 0x93,
}

impl std::fmt::Display for DbKeyPrefix {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}

#[derive(Debug, Encodable, Decodable)]
pub struct BackupKeyPrefix;

impl_db_record!(
    key = BackupId,
    value = BackupRequest,
    db_prefix = DbKeyPrefix::Backup,
);

impl_db_lookup!(key = BackupId, query_prefix = BackupKeyPrefix);

#[derive(Debug, Encodable, Decodable, Serialize)]
pub struct UsedDoubleEncryptedData(pub DoubleEncryptedData);

#[derive(Debug, Encodable, Decodable)]
pub struct UsedDoubleEncryptedDataPrefix;

impl_db_record!(
    key = UsedDoubleEncryptedData,
    value = BackupId,
    db_prefix = DbKeyPrefix::UsedBackupCiphertext,
);

impl_db_lookup!(
    key = UsedDoubleEncryptedData,
    query_prefix = UsedDoubleEncryptedDataPrefix
);

#[derive(Debug, Encodable, Decodable)]
pub struct RecoveryPrefix;

impl_db_record!(
    key = RecoveryId,
    value = RecoveryRequest,
    db_prefix = DbKeyPrefix::Recovery,
);

impl_db_lookup!(key = RecoveryId, query_prefix = RecoveryPrefix);

#[derive(Debug, Encodable, Decodable, Serialize, Deserialize)]
pub struct DecryptionShareId(pub secp256k1::PublicKey);

#[derive(Debug, Encodable, Decodable)]
pub struct DecryptionSharePrefix;

impl_db_record!(
    key = DecryptionShareId,
    value = EncryptedRecoveryShare,
    db_prefix = DbKeyPrefix::DecryptionShare,
);

impl_db_lookup!(
    key = DecryptionShareId,
    query_prefix = DecryptionSharePrefix
);
