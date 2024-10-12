use std::collections::BTreeMap;
use std::fmt;

use anyhow::format_err;
use bitcoin::secp256k1;
use fedimint_api_client::api::{DynModuleApi, FederationApiExt};
use fedimint_core::config::ClientConfig;
use fedimint_core::core::ModuleInstanceId;
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::module::ApiRequestErased;
use fedimint_core::PeerId;
use fedimint_derive_secret::{ChildId, DerivableSecret};
use secp256k1::Secp256k1;
use serde::{Deserialize, Serialize};

use crate::api::FediSocialFederationApi as _;
use crate::common::{
    BackupId, BackupRequest, DoubleEncryptedData, EncryptedRecoveryShare, RecoveryId,
    RecoveryRequest, SerdeEncodable, SignedBackupRequest, SignedRecoveryRequest,
    VerificationDocument,
};
use crate::config::FediSocialClientConfig;

// TODO: Actually implement. Use some bip39 crate instead?
#[derive(Serialize, Deserialize, Encodable, Decodable, PartialEq, Eq, Clone)]
pub struct UserSeedPhrase(pub String);

impl fmt::Debug for UserSeedPhrase {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "UserSeedPhrase([redacted])")
    }
}

impl From<String> for UserSeedPhrase {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for UserSeedPhrase {
    fn from(s: &str) -> Self {
        Self(s.into())
    }
}

// TODO: pick an id, document it, make sure they don't collide
pub const SOCIAL_RECOVERY_SECRET_CHILD_ID: ChildId = ChildId(16);
const SOCIAL_RECOVERY_BACKUP_SNAPSHOT_TYPE_CHILD_ID: ChildId = ChildId(1);

/// Data needed to recover from the backup after Federation decrypts it.
///
/// This needs to be stored by the user in some reasonably safe place (like
/// Dropbox, email) etc. ideally in multiple copies. It is neccessary for the
/// recovery, but whoever has access to it still needs to pass in-person
/// verification by federation members to decrypt the seed phrase.
#[derive(Clone, Encodable, Decodable)]
// TODO: versioning
pub struct RecoveryFile {
    /// Add some contant bytes to the beginning of the recovery file.
    /// This format allows potentially quick scanning looking for
    /// any recovery file on the file system.
    magic: [u8; 8],
    pub signing_sk: SerdeEncodable<secp256k1::SecretKey>,
    /// This is a copy of the backup encryption key, so the user can
    /// decrypt it's own backup, while even if the Federation colludes (is
    /// coorced to), they won't be able to access the backup (privacy
    /// protection).
    ///
    /// Raw bytes as `ring` which we use for symetric encryption doesn't seem to
    /// support anything better.
    pub encryption_key: [u8; 32],
    pub double_encrypted_seed: DoubleEncryptedData,
    pub verification_document: VerificationDocument,
    pub client_config: ClientConfig,
}

impl RecoveryFile {
    pub const MAGIC_PREFIX: &'static [u8; 8] = b"\xFE\xD1RECOVE";

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        Encodable::consensus_encode(self, &mut bytes).expect("encodes correctly");
        bytes
    }

    pub fn from_bytes(raw: &[u8]) -> anyhow::Result<Self> {
        Ok(Decodable::consensus_decode(
            &mut &raw[..],
            &ModuleDecoderRegistry::default(),
        )?)
    }
}

pub struct SocialBackup {
    /// Secret derived from the `root_secret` for this module / functionality
    /// (level == 2)
    pub module_secret: DerivableSecret,

    pub module_id: ModuleInstanceId,

    pub config: crate::config::FediSocialClientConfig,

    pub api: DynModuleApi,
}

impl SocialBackup {
    /// Create User Recovery File that user needs to store privately (in
    /// multiple copies)
    pub fn prepare_recovery_file(
        &self,
        verification_document: VerificationDocument,
        seed_phrase: UserSeedPhrase,
        client_config: ClientConfig,
    ) -> RecoveryFile {
        let double_encrypted_seed = DoubleEncryptedData::encrypt(
            seed_phrase,
            self.get_backup_encryption_key(),
            self.config.pk(),
        );

        RecoveryFile {
            magic: *RecoveryFile::MAGIC_PREFIX,
            signing_sk: SerdeEncodable(
                Self::get_backup_signing_key_static(&self.module_secret).secret_key(),
            ),
            encryption_key: Self::get_backup_encryption_key_static_raw(&self.module_secret),
            verification_document,
            double_encrypted_seed,
            client_config,
        }
    }

    fn prepare_social_recovery_backup(
        &self,
        recovery_file: &RecoveryFile,
    ) -> anyhow::Result<SignedBackupRequest> {
        let signing_key = self.get_backup_signing_key();

        let backup_request = BackupRequest {
            id: BackupId(signing_key.public_key()),
            timestamp: fedimint_core::time::now(),
            verification_doc_hash: recovery_file.verification_document.id(),
            double_encrypted_seed: recovery_file.double_encrypted_seed.clone(),
        };

        backup_request.sign(&signing_key)
    }

    pub async fn upload_backup_to_federation(
        &self,
        recovery_file: &RecoveryFile,
    ) -> anyhow::Result<()> {
        let backup_request = self.prepare_social_recovery_backup(recovery_file)?;
        self.api
            .social_backup(self.module_id, &backup_request)
            .await?;

        Ok(())
    }

    fn get_backup_encryption_key_static(secret: &DerivableSecret) -> fedimint_aead::LessSafeKey {
        fedimint_aead::LessSafeKey::new(
            Self::get_backup_secret_static(secret).to_chacha20_poly1305_key(),
        )
    }

    fn get_backup_encryption_key_static_raw(secret: &DerivableSecret) -> [u8; 32] {
        Self::get_backup_secret_static(secret).to_chacha20_poly1305_key_raw()
    }

    fn get_backup_signing_key_static(secret: &DerivableSecret) -> secp256k1::KeyPair {
        Self::get_backup_secret_static(secret)
            .to_secp_key(&Secp256k1::<secp256k1::SignOnly>::gen_new())
    }

    fn get_backup_secret_static(module_secret: &DerivableSecret) -> DerivableSecret {
        // level 1 is client.external_secret(), then we derive a key from that making it
        // level 2
        assert_eq!(module_secret.level(), 3);
        module_secret.child_key(SOCIAL_RECOVERY_BACKUP_SNAPSHOT_TYPE_CHILD_ID)
    }

    fn get_backup_encryption_key(&self) -> fedimint_aead::LessSafeKey {
        Self::get_backup_encryption_key_static(&self.module_secret)
    }

    fn get_backup_signing_key(&self) -> secp256k1::KeyPair {
        Self::get_backup_signing_key_static(&self.module_secret)
    }
}

/// The state of recovery, that can be serialized and stored
#[derive(Encodable, Decodable, Clone, Serialize, Deserialize)]
pub struct SocialRecoveryState {
    signing_sk: SerdeEncodable<secp256k1::SecretKey>,
    encryption_key: [u8; 32],
    double_encrypted_seed: DoubleEncryptedData,
    recovery_session_decryption_key: SerdeEncodable<
        fedimint_threshold_crypto::serde_impl::SerdeSecret<fedimint_threshold_crypto::SecretKey>,
    >,
    shares: BTreeMap<PeerId, SerdeEncodable<fedimint_threshold_crypto::DecryptionShare>>,
    pub client_config: String,
}

// Implement Debug manually to ignore sensitive fields
impl fmt::Debug for SocialRecoveryState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SocialRecoveryState")
            .field("double_encrypted_seed", &self.double_encrypted_seed)
            .field("shares", &self.shares)
            .field("client_config", &self.client_config)
            .finish()
    }
}

impl SocialRecoveryState {
    fn new(recovery_file: RecoveryFile) -> Self {
        Self {
            recovery_session_decryption_key: SerdeEncodable(
                fedimint_threshold_crypto::serde_impl::SerdeSecret(
                    fedimint_threshold_crypto::SecretKey::random(),
                ),
            ),
            signing_sk: recovery_file.signing_sk,
            encryption_key: recovery_file.encryption_key,
            double_encrypted_seed: recovery_file.double_encrypted_seed,
            shares: Default::default(),
            client_config: recovery_file.client_config.consensus_encode_to_hex(),
        }
    }

    pub fn recovery_id(&self) -> RecoveryId {
        RecoveryId(self.signing_sk.0.public_key(secp256k1::SECP256K1))
    }
}

pub struct SocialRecoveryClient {
    state: SocialRecoveryState,
    config: FediSocialClientConfig,
    module_id: ModuleInstanceId,
    api: DynModuleApi,
}

impl SocialRecoveryClient {
    /// Start a new recovery process
    pub fn new_start(
        module_id: ModuleInstanceId,
        config: FediSocialClientConfig,
        api: DynModuleApi,
        recovery_file: RecoveryFile,
    ) -> anyhow::Result<Self> {
        recovery_file.verification_document.verify_integrity()?;

        Ok(Self {
            state: SocialRecoveryState::new(recovery_file),
            config,
            api,
            module_id,
        })
    }

    /// Continue an existing recovery process from a saved
    /// [`SocialRecoveryState`]
    pub fn new_continue(
        module_id: ModuleInstanceId,
        config: FediSocialClientConfig,
        api: DynModuleApi,
        state: SocialRecoveryState,
    ) -> Self {
        Self {
            state,
            config,
            api,
            module_id,
        }
    }
    pub fn state(&self) -> &SocialRecoveryState {
        &self.state
    }

    /// Create a verification request and corresponding decryption key
    pub fn create_verification_request(
        &self,
        verification_doc: VerificationDocument,
    ) -> anyhow::Result<SignedRecoveryRequest> {
        let signing_keypair = self.state.signing_sk.0.keypair(secp256k1::SECP256K1);

        let request = RecoveryRequest {
            id: RecoveryId(signing_keypair.public_key()),
            timestamp: fedimint_core::time::now(),
            verification_doc,
            recovery_session_encryption_key: SerdeEncodable(
                self.state.recovery_session_decryption_key.0.public_key(),
            ),
        };

        request.sign(&signing_keypair)
    }

    /// Upload verification request to the federation.
    ///
    /// This is for the guardians to know we are trying to recover
    /// from our social backup and so they have the full verification
    /// document available.
    pub async fn upload_verification_request(
        &self,
        req: &SignedRecoveryRequest,
    ) -> anyhow::Result<()> {
        self.api.start_social_recovery(self.module_id, req).await?;
        Ok(())
    }

    /// After successfull in person verification download the decryption share
    /// that the guardian should have published.
    async fn download_decryption_share_from(
        &self,
        peer_id: PeerId,
    ) -> anyhow::Result<Option<fedimint_threshold_crypto::DecryptionShare>> {
        let encrypted_share = self
            .api
            .request_raw(
                peer_id,
                "decryption_share",
                &[ApiRequestErased::new(self.state.recovery_id()).to_json()],
            )
            .await?;

        let encrypted_share: Option<EncryptedRecoveryShare> =
            serde_json::from_value(encrypted_share)?;

        let Some(encrypted_share) = encrypted_share else {
            return Ok(None);
        };

        let decryption_share =
            encrypted_share.decrypt_with(&self.state.recovery_session_decryption_key.0)?;

        if !self
            .config
            .federation_pk_set
            .public_key_share(peer_id.to_usize())
            .verify_decryption_share(&decryption_share, &self.state.double_encrypted_seed.0)
        {
            return Err(format_err!(
                "Decryption share from {peer_id} does not pass the threshold_crypto validation."
            ));
        }

        Ok(Some(decryption_share))
    }

    pub async fn get_decryption_share_from(&mut self, peer_id: PeerId) -> anyhow::Result<bool> {
        if self.state.shares.contains_key(&peer_id) {
            return Ok(true);
        }

        if let Some(share) = self.download_decryption_share_from(peer_id).await? {
            self.state.shares.insert(peer_id, SerdeEncodable(share));
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn combine_recovered_user_phrase(&self) -> anyhow::Result<UserSeedPhrase> {
        let decryption_key = fedimint_aead::LessSafeKey::new(
            fedimint_aead::UnboundKey::new(
                &ring::aead::CHACHA20_POLY1305,
                &self.state.encryption_key,
            )
            .expect("Decryption key stored in recovery file must be valid"),
        );

        self.state.double_encrypted_seed.decrypt(
            &self.config.federation_pk_set,
            &decryption_key,
            self.state
                .shares
                .iter()
                .map(|(peer_id, share)| (*peer_id, &share.0)),
        )
    }
}

pub struct SocialVerification {
    peer_id: PeerId,
    api: DynModuleApi,
}

impl SocialVerification {
    pub fn new(api: DynModuleApi, peer_id: PeerId) -> Self {
        Self { peer_id, api }
    }

    pub async fn download_verification_doc(
        &self,
        id: RecoveryId,
    ) -> anyhow::Result<Option<VerificationDocument>> {
        let encrypted_share = self
            .api
            .request_raw(
                self.peer_id,
                "get_verification",
                &[ApiRequestErased::new(id).to_json()],
            )
            .await?;

        let doc: Option<VerificationDocument> = serde_json::from_value(encrypted_share)?;

        Ok(doc)
    }

    pub async fn approve_recovery(
        &self,
        id: RecoveryId,
        admin_password: &str,
    ) -> anyhow::Result<()> {
        let _: Option<()> = self
            .api
            .request_single_peer_typed(
                None,
                "approve_recovery".to_owned(),
                ApiRequestErased::new((id, admin_password)),
                self.peer_id,
            )
            .await?;

        Ok(())
    }
}
