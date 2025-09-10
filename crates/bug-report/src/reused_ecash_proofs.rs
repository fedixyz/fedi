use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use base64_serde::base64_serde_type;
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::secp256k1::hashes::sha256;
use fedimint_core::secp256k1::{Message, PublicKey, schnorr};
use fedimint_core::{Amount, BitcoinHash};
use fedimint_mint_client::output::NoteIssuanceRequest;
use fedimint_mint_client::{BlindNonce, MintClientModule, Nonce};
use serde::{Deserialize, Serialize};
use tbs::{BlindingKey, blind_message};

base64_serde_type!(
    Base64UrlSafe,
    GeneralPurpose::new(
        &base64::alphabet::URL_SAFE,
        GeneralPurposeConfig::new()
            .with_encode_padding(false)
            .with_decode_padding_mode(DecodePaddingMode::Indifferent),
    )
);

/// JSON encoding for proofs with human readable total amount
#[derive(Serialize, Deserialize)]
pub struct SerializedReusedEcashProofs {
    pub total_amount_msats: Amount,
    #[serde(with = "Base64UrlSafe")]
    pub reused_ecash_proofs: Vec<u8>,
}

pub type ReusedEcashProofs = Vec<ReusedEcashProof>;

pub async fn generate(mint: &MintClientModule) -> anyhow::Result<SerializedReusedEcashProofs> {
    let secrets = mint.reused_note_secrets().await;
    let total_amount = secrets.iter().map(|(amount, _, _)| *amount).sum();
    let proofs: ReusedEcashProofs = secrets
        .into_iter()
        .map(|(amount, request, blind_nonce)| ReusedEcashProof::new(amount, request, blind_nonce))
        .collect();
    Ok(SerializedReusedEcashProofs {
        total_amount_msats: total_amount,
        reused_ecash_proofs: proofs.consensus_encode_to_vec(),
    })
}

impl SerializedReusedEcashProofs {
    pub fn deserialize(&self) -> anyhow::Result<ReusedEcashProofs> {
        Ok(ReusedEcashProofs::consensus_decode_whole(
            &self.reused_ecash_proofs,
            &Default::default(),
        )?)
    }
}

#[derive(Encodable, Decodable)]
pub struct ReusedEcashProof {
    blind_nonce: BlindNonce,
    blinding_key: BlindingKey,
    amount: Amount,
    signature: schnorr::Signature,
    spend_pubkey: PublicKey,
}

impl ReusedEcashProof {
    fn signing_message(
        blind_nonce: BlindNonce,
        blinding_key: BlindingKey,
        amount: Amount,
    ) -> Message {
        let hash: sha256::Hash =
            ("Fedi Reused Ecash Proof", blind_nonce, blinding_key, amount).consensus_hash();
        Message::from_digest(hash.to_byte_array())
    }

    pub fn new(amount: Amount, request: NoteIssuanceRequest, blind_nonce: BlindNonce) -> Self {
        let blinding_key = *request.blinding_key();
        let spend_key = request.spend_key();
        let message = Self::signing_message(blind_nonce, blinding_key, amount);
        let signature = spend_key.sign_schnorr(message);
        Self {
            blind_nonce,
            blinding_key,
            amount,
            signature,
            spend_pubkey: spend_key.public_key(),
        }
    }

    pub fn verify(&self) -> anyhow::Result<()> {
        let message = Self::signing_message(self.blind_nonce, self.blinding_key, self.amount);
        self.signature
            .verify(&message, &self.spend_pubkey.x_only_public_key().0)?;

        anyhow::ensure!(
            self.blind_nonce.0
                == blind_message(Nonce(self.spend_pubkey).to_message(), self.blinding_key),
            "generated blind nonce didn't match"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use fedimint_core::secp256k1;
    use fedimint_core::secp256k1::rand::{Rng, thread_rng};
    use fedimint_derive_secret::DerivableSecret;
    use fedimint_mint_client::output::NoteIssuanceRequest;

    use super::*;

    fn mk_secret() -> DerivableSecret {
        let (key, salt): ([u8; 32], [u8; 32]) = thread_rng().r#gen();
        DerivableSecret::new_root(&key, &salt)
    }

    #[test]
    fn test_reused_ecash_proof() -> anyhow::Result<()> {
        let amount = Amount::from_sats(1000);
        let (request, blind_nonce) = NoteIssuanceRequest::new(secp256k1::SECP256K1, &mk_secret());

        let proof = ReusedEcashProof::new(amount, request, blind_nonce);
        proof.verify()?;
        Ok(())
    }
}
