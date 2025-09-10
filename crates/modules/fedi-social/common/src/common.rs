use std::fmt::{self, Debug};
use std::io;
use std::time::SystemTime;

use bitcoin_hashes::{Hash, sha256};
use fedimint_core::PeerId;
use fedimint_core::encoding::{Decodable, DecodeError, Encodable};
use fedimint_core::module::registry::ModuleDecoderRegistry;
use impl_tools::autoimpl;
use secp256k1::{Message, Secp256k1, Signing, Verification};
use serde::{Deserialize, Serialize};

// HACK: this was removed upstream

/// A wrapper counting bytes written
struct CountWrite<'a, W> {
    inner: &'a mut W,
    count: usize,
}

impl<'a, W> CountWrite<'a, W> {
    fn new(inner: &'a mut W) -> Self {
        Self { inner, count: 0 }
    }
}

impl<W> io::Write for CountWrite<'_, W>
where
    W: io::Write,
{
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let count = self.inner.write(buf)?;
        self.count += count;
        Ok(count)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

// #[derive(Debug, Error)]
// pub struct DecodeError(pub(crate) anyhow::Error);

/// Wrappers for `T` that are `De-Serializable`, while we need them in
/// `Encodable` context
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Ord, Eq, Hash, Serialize, Deserialize)]
pub struct SerdeEncodable<T>(pub T);

impl<T> Encodable for SerdeEncodable<T>
where
    T: serde::Serialize,
{
    fn consensus_encode<W: std::io::Write>(&self, writer: &mut W) -> Result<(), std::io::Error> {
        let mut count_writer = CountWrite::new(writer);
        bincode::serialize_into(&mut count_writer, &self.0).map_err(std::io::Error::other)?;
        Ok(())
    }
}

impl<T> Decodable for SerdeEncodable<T>
where
    T: for<'de> serde::Deserialize<'de>,
{
    fn consensus_decode_partial<R: std::io::Read>(
        r: &mut R,
        _modules: &ModuleDecoderRegistry,
    ) -> Result<Self, DecodeError> {
        Ok(Self(
            bincode::deserialize_from(r).map_err(DecodeError::from_err)?,
        ))
    }
}

/// A document presented (usually in-person) to each guardian during the
/// social recovery process, that allows the guardian to verify the identity
/// of the user.
///
/// This document re-encodes a raw document (typically photo or video). See
/// [`Self::from_raw`].
#[derive(Debug, Clone, Serialize, Deserialize, Encodable, Decodable, PartialEq, Eq)]
pub struct VerificationDocument(#[serde(with = "hex::serde")] Vec<u8>);

impl VerificationDocument {
    /// Simple XOR value to fool any software that would like to mess with with
    /// video data.
    pub const DATA_XOR_VALUE: u8 = 0b10101100;
    pub const HASH_LENGTH: usize = <sha256::Hash as Hash>::LEN;

    pub fn id(&self) -> VerificationDocumentHash {
        VerificationDocumentHash(
            sha256::Hash::from_slice(&self.0[0..Self::HASH_LENGTH])
                .expect("the data inside RecoveryDocument validated during construction"),
        )
    }

    /// Turn a raw data into a "recovery verification document"
    ///
    /// The main goal here is preventing any software
    /// from messing with the data (e.g. by re-encoding it if it's
    /// a video or a photo, during storage or transmition).
    ///
    /// The bytes of the raw document are XORed with [`Self::DATA_XOR_VALUE`].
    pub fn from_raw(raw_data: &[u8]) -> VerificationDocument {
        let hash = sha256::Hash::hash(raw_data);

        Self(
            // add checksum of the original data
            hash.as_byte_array()
                .iter()
                .copied()
                .chain(
                    // XOR the data with a simple pattern, just
                    // to prevent any software from messing with it
                    raw_data.iter().map(|b| b ^ Self::DATA_XOR_VALUE),
                )
                .collect(),
        )
    }

    /// Get the original data used to create this `VerificationDocument`
    pub fn to_raw(&self) -> anyhow::Result<Vec<u8>> {
        let raw_data: Vec<u8> = self.0[Self::HASH_LENGTH..]
            .iter()
            .map(|b| b ^ Self::DATA_XOR_VALUE)
            .collect();
        let hash = sha256::Hash::hash(&raw_data);

        if hash.as_byte_array() != &self.0[..Self::HASH_LENGTH] {
            anyhow::bail!("The verification document raw data does not match the checksum");
        }

        Ok(raw_data)
    }

    pub fn verify_integrity(&self) -> anyhow::Result<()> {
        let _ = self.to_raw()?;
        Ok(())
    }
}

/// The hash of [`VerificationDocument`] committed to in the backup.
#[derive(Debug, Serialize, Deserialize, Encodable, Decodable, PartialEq, Eq)]
pub struct VerificationDocumentHash(sha256::Hash);

#[derive(Copy, Clone, Debug, Encodable, Decodable, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupId(pub secp256k1::PublicKey);

impl fmt::Display for BackupId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

#[derive(Copy, Clone, Debug, Encodable, Decodable, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecoveryId(pub secp256k1::PublicKey);

impl fmt::Display for RecoveryId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        std::fmt::Display::fmt(&self.0, f)
    }
}

/// `T` encrypted first to user's (own) symmetric key and then to federation's
/// threshold public key
#[autoimpl(Deref using self.0)]
#[derive(Debug, Clone, Serialize, Deserialize, Encodable, Decodable, PartialEq, Eq)]
pub struct DoubleEncryptedData(SerdeEncodable<fedimint_threshold_crypto::Ciphertext>);

impl DoubleEncryptedData {
    pub fn encrypt<T>(
        plain: T,
        personal_key: fedimint_aead::LessSafeKey,
        federation_pk: fedimint_threshold_crypto::PublicKey,
    ) -> Self
    where
        T: Encodable,
    {
        let plaintext = plain.consensus_encode_to_vec();

        let encrypted_to_self =
            fedimint_aead::encrypt(plaintext, &personal_key).expect("encryption here can't fail");

        let ciphertext = federation_pk.encrypt(encrypted_to_self);

        Self(SerdeEncodable(ciphertext))
    }

    pub fn decrypt<'a, T>(
        &self,
        federation_pk_set: &fedimint_threshold_crypto::PublicKeySet,
        personal_sk: &fedimint_aead::LessSafeKey,
        shares: impl IntoIterator<Item = (PeerId, &'a fedimint_threshold_crypto::DecryptionShare)>,
    ) -> anyhow::Result<T>
    where
        T: Decodable,
    {
        let mut encrypted_to_self = federation_pk_set.decrypt(
            shares
                .into_iter()
                .map(|(peer, share)| (peer.to_usize(), share)),
            &self.0.0,
        )?;

        let plaintext = fedimint_aead::decrypt(&mut encrypted_to_self, personal_sk)?;
        let decoded = T::consensus_decode_whole(plaintext, &Default::default())?;

        Ok(decoded)
    }
}

/// Social Backup request
///
/// A request to store an information about verification (defined in the
/// verification document) required for the user to receive decryption shares
/// from the federation guardians for the given backup.
#[derive(Debug, Serialize, Deserialize, Encodable, Decodable, PartialEq, Eq)]
pub struct BackupRequest {
    pub id: BackupId,
    pub timestamp: SystemTime,
    pub verification_doc_hash: VerificationDocumentHash,
    pub double_encrypted_seed: DoubleEncryptedData,
}

impl BackupRequest {
    fn hash(&self) -> sha256::Hash {
        let mut sha = sha256::HashEngine::default();

        self.consensus_encode(&mut sha)
            .expect("Encoding to hash engine can't fail");

        sha256::Hash::from_engine(sha)
    }

    pub fn sign(self, keypair: &secp256k1::Keypair) -> anyhow::Result<SignedBackupRequest> {
        let signature = secp256k1::SECP256K1
            .sign_schnorr(&Message::from_digest_slice(self.hash().as_ref())?, keypair);

        Ok(SignedBackupRequest {
            request: self,
            signature,
        })
    }

    pub fn id(&self) -> BackupId {
        self.id
    }
}

/// Signed [`BackupRequest`]
#[derive(Debug, Serialize, Deserialize, Encodable, Decodable)]
pub struct SignedBackupRequest {
    #[serde(flatten)]
    request: BackupRequest,
    signature: secp256k1::schnorr::Signature,
}

impl SignedBackupRequest {
    pub fn backup_id(&self) -> BackupId {
        self.request.id()
    }

    pub fn verify_valid<C>(&self, ctx: &Secp256k1<C>) -> Result<&BackupRequest, secp256k1::Error>
    where
        C: Signing + Verification,
    {
        ctx.verify_schnorr(
            &self.signature,
            &Message::from_digest_slice(self.request.hash().as_ref()).expect("Can't fail"),
            &self.request.id.0.x_only_public_key().0,
        )?;

        Ok(&self.request)
    }
}

/// A request to start the recovery (verification) of the user to let them
/// decrypt their backup.
#[derive(Debug, Serialize, Deserialize, Encodable, Decodable, PartialEq, Eq)]
pub struct RecoveryRequest {
    pub id: RecoveryId,
    pub timestamp: SystemTime,
    pub recovery_session_encryption_key: SerdeEncodable<fedimint_threshold_crypto::PublicKey>,
    pub verification_doc: VerificationDocument,
}

impl RecoveryRequest {
    fn hash(&self) -> sha256::Hash {
        let mut sha = sha256::HashEngine::default();

        self.consensus_encode(&mut sha)
            .expect("Encoding to hash engine can't fail");

        sha256::Hash::from_engine(sha)
    }

    pub fn sign(self, keypair: &secp256k1::Keypair) -> anyhow::Result<SignedRecoveryRequest> {
        let signature = secp256k1::SECP256K1
            .sign_schnorr(&Message::from_digest_slice(self.hash().as_ref())?, keypair);

        Ok(SignedRecoveryRequest {
            request: self,
            signature,
        })
    }
}

/// Signed [`RecoveryRequest`]
#[derive(Debug, Serialize, Deserialize, Encodable, Decodable)]
pub struct SignedRecoveryRequest {
    #[serde(flatten)]
    request: RecoveryRequest,
    pub signature: secp256k1::schnorr::Signature,
}

impl SignedRecoveryRequest {
    pub fn recovery_id(&self) -> RecoveryId {
        self.request.id
    }

    pub fn verify_valid<C>(&self, ctx: &Secp256k1<C>) -> Result<&RecoveryRequest, secp256k1::Error>
    where
        C: Signing + Verification,
    {
        ctx.verify_schnorr(
            &self.signature,
            &Message::from_digest_slice(self.request.hash().as_byte_array()).expect("Can't fail"),
            &self.request.id.0.x_only_public_key().0,
        )?;

        Ok(&self.request)
    }
}

/// Recovery share for the user after successful verification
///
/// Encrypted (Ciphertext) to ephemeral public key provided with
/// the recovery request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Encodable, Decodable)]
pub struct EncryptedRecoveryShare(SerdeEncodable<fedimint_threshold_crypto::Ciphertext>);

impl EncryptedRecoveryShare {
    pub fn encrypt_to_ephmeral(
        decryption_share: fedimint_threshold_crypto::DecryptionShare,
        ephemeral_encryption_key: &fedimint_threshold_crypto::PublicKey,
    ) -> Self {
        Self(SerdeEncodable(ephemeral_encryption_key.encrypt(
            bincode::serialize(&decryption_share).expect("serialization can't fail here"),
        )))
    }

    pub fn decrypt_with(
        &self,
        ephemeral_decryption_key: &fedimint_threshold_crypto::SecretKey,
    ) -> anyhow::Result<fedimint_threshold_crypto::DecryptionShare> {
        let encoded_share = ephemeral_decryption_key
            .decrypt(&self.0.0)
            .ok_or_else(|| anyhow::format_err!("Could not decrypt"))?;

        Ok(bincode::deserialize::<
            fedimint_threshold_crypto::DecryptionShare,
        >(&encoded_share)?)
    }
}
