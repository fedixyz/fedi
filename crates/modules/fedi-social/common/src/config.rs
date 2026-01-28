use fedimint_core::core::ModuleKind;
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::module::serde_json;
use fedimint_core::plugin_types_trait_impl_config;
use serde::{Deserialize, Serialize};

use crate::FediSocialCommonGen;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FediSocialConfig {
    pub private: FediSocialPrivateConfig,
    pub consensus: FediSocialConsensusConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FediSocialPrivateConfig {
    /// Our share of decryption key
    pub sk_share: fedimint_threshold_crypto::serde_impl::SerdeSecret<
        fedimint_threshold_crypto::SecretKeyShare,
    >,
}

#[derive(Clone, Debug, Serialize, Deserialize, Encodable, Decodable)]
pub struct FediSocialConsensusConfig {
    pub pk_set: fedimint_threshold_crypto::PublicKeySet,
    pub threshold: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, Encodable, Decodable)]
pub struct FediSocialClientConfig {
    pub federation_pk_set: fedimint_threshold_crypto::PublicKeySet,
}

impl std::fmt::Display for FediSocialClientConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "FediSocialClientConfig {}",
            serde_json::to_string(self).map_err(|_e| std::fmt::Error)?
        )
    }
}

impl FediSocialClientConfig {
    /// Get the combined public key
    pub fn pk(&self) -> fedimint_threshold_crypto::PublicKey {
        self.federation_pk_set.public_key()
    }
}

plugin_types_trait_impl_config!(
    FediSocialCommonGen,
    FediSocialConfig,
    FediSocialPrivateConfig,
    FediSocialConsensusConfig,
    FediSocialClientConfig
);
