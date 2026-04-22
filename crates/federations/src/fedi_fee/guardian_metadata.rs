use anyhow::ensure;
use bitcoin::secp256k1;
use bitcoin::secp256k1::ecdh::SharedSecret;
use fedimint_aead::LessSafeKey;
use fedimint_derive_secret::DerivableSecret;
use rpc_types::RpcTransactionDirection;
use stability_pool_client::common::Account;

/// Human-readable breakdown item included in the plaintext guardian remittance
/// metadata before encryption.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuardianFeeBreakdownItemV1 {
    pub(crate) module: String,
    pub(crate) direction: RpcTransactionDirection,
    pub(crate) amount_msats: u64,
}

/// Versioned plaintext metadata attached to guardian remittance deposits before
/// encryption.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuardianFeeRemittanceMetadataV1 {
    pub(crate) version: u16,
    pub(crate) total_msats: u64,
    pub(crate) breakdown: Vec<GuardianFeeBreakdownItemV1>,
    pub(crate) remitted_at_unix: u64,
}

/// Serialized ciphertext envelope stored in `BtcBalanceDepositMetadata`. It
/// carries the ephemeral pubkey needed to derive the shared decryption key.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuardianFeeRemittanceCiphertextV1 {
    pub(crate) version: u16,
    pub(crate) ephemeral_pubkey: secp256k1::PublicKey,
    pub(crate) ciphertext_hex: String,
}

pub(crate) fn decrypt_guardian_remittance_metadata(
    guardian_key: &secp256k1::Keypair,
    metadata: &[u8],
) -> anyhow::Result<GuardianFeeRemittanceMetadataV1> {
    let envelope: GuardianFeeRemittanceCiphertextV1 = serde_json::from_slice(metadata)?;
    ensure!(
        envelope.version == 1,
        "unsupported guardian remittance metadata envelope version"
    );

    let shared_secret = SharedSecret::new(&envelope.ephemeral_pubkey, &guardian_key.secret_key());
    let shared_secret = DerivableSecret::new_root(
        &shared_secret.secret_bytes(),
        b"guardian-fee-remittance-ecdh",
    );
    let mut ciphertext = hex::decode(envelope.ciphertext_hex)?;
    let plaintext = fedimint_aead::decrypt(
        &mut ciphertext,
        &LessSafeKey::new(shared_secret.to_chacha20_poly1305_key()),
    )?;
    let metadata: GuardianFeeRemittanceMetadataV1 = serde_json::from_slice(plaintext)?;
    ensure!(
        metadata.version == 1,
        "unsupported guardian remittance metadata version"
    );
    Ok(metadata)
}

pub(crate) fn encrypt_guardian_remittance_metadata(
    remittance_account: &Account,
    metadata: &GuardianFeeRemittanceMetadataV1,
) -> anyhow::Result<Vec<u8>> {
    let plaintext = serde_json::to_vec(metadata)?;
    let recipient_pubkey = remittance_account
        .as_single()
        .expect("guardian remittance account must be single-sig");
    let (ephemeral_secret, ephemeral_pubkey) =
        secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
    let shared_secret = SharedSecret::new(recipient_pubkey, &ephemeral_secret);
    let shared_secret = DerivableSecret::new_root(
        &shared_secret.secret_bytes(),
        b"guardian-fee-remittance-ecdh",
    );
    let ciphertext = fedimint_aead::encrypt(
        plaintext,
        &LessSafeKey::new(shared_secret.to_chacha20_poly1305_key()),
    )?;
    Ok(serde_json::to_vec(&GuardianFeeRemittanceCiphertextV1 {
        version: 1,
        ephemeral_pubkey,
        ciphertext_hex: hex::encode(ciphertext),
    })?)
}
