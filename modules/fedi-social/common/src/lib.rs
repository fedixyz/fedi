use config::FediSocialClientConfig;
use fedimint_core::core::{Decoder, ModuleInstanceId, ModuleKind};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::module::{CommonModuleInit, ModuleCommon, ModuleConsensusVersion};
use fedimint_core::{extensible_associated_module_type, plugin_types_trait_impl_common};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub use crate::common::{
    BackupId, BackupRequest, EncryptedRecoveryShare, RecoveryId, RecoveryRequest,
    SignedBackupRequest,
};

pub mod config;

pub mod common;
pub mod db;

pub const KIND: ModuleKind = ModuleKind::from_static_str("fedi-social");
pub const CONSENSUS_VERSION: ModuleConsensusVersion = ModuleConsensusVersion::new(2, 0);

#[derive(
    Debug, Clone, Eq, PartialEq, Hash, Deserialize, Serialize, Encodable, Decodable, Default,
)]
pub struct FediSocialInputV0;

extensible_associated_module_type!(
    FediSocialInput,
    FediSocialInputV0,
    UnknownFediSocialInputVariantError
);

impl std::fmt::Display for FediSocialInputV0 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Fedi Social Input")
    }
}

#[derive(
    Debug, Clone, Eq, PartialEq, Hash, Deserialize, Serialize, Encodable, Decodable, Default,
)]
pub struct FediSocialOutputV0;

extensible_associated_module_type!(
    FediSocialOutput,
    FediSocialOutputV0,
    UnknownFediSocialOutputVariantError
);

impl std::fmt::Display for FediSocialOutputV0 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Fedi Social Output")
    }
}

#[derive(
    Debug, Clone, Eq, PartialEq, Hash, Deserialize, Serialize, Encodable, Decodable, Default,
)]
pub struct FediSocialOutputOutcomeV0;

extensible_associated_module_type!(
    FediSocialOutputOutcome,
    FediSocialOutputOutcomeV0,
    UnknownFediSocialOutputOutcomeVariantError
);

impl std::fmt::Display for FediSocialOutputOutcomeV0 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Fedi Social OutputOutcome")
    }
}

#[derive(
    Debug, Clone, Eq, PartialEq, Hash, Deserialize, Serialize, Encodable, Decodable, Default,
)]
pub struct FediSocialConsensusItemV0;

extensible_associated_module_type!(
    FediSocialConsensusItem,
    FediSocialConsensusItemV0,
    UnknownFediSocialConsensusItemVariantError
);

impl std::fmt::Display for FediSocialConsensusItemV0 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Fedi Social ConsensusItem")
    }
}

pub struct FediSocialModuleTypes;

#[derive(Debug)]
pub struct FediSocialCommonGen;

impl CommonModuleInit for FediSocialCommonGen {
    const CONSENSUS_VERSION: ModuleConsensusVersion = CONSENSUS_VERSION;
    const KIND: ModuleKind = KIND;

    type ClientConfig = FediSocialClientConfig;

    fn decoder() -> Decoder {
        FediSocialModuleTypes::decoder_builder().build()
    }
}

/// Errors that might be returned by the server
#[derive(Debug, Clone, Eq, PartialEq, Hash, Error, Encodable, Decodable)]
#[error("This module does not support inputs")]
pub enum FediSocialInputError {}

/// Errors that might be returned by the server
#[derive(Debug, Clone, Eq, PartialEq, Hash, Error, Encodable, Decodable)]
#[error("This module does not support outputs")]
pub enum FediSocialOutputError {}

plugin_types_trait_impl_common!(
    FediSocialModuleTypes,
    FediSocialClientConfig,
    FediSocialInput,
    FediSocialOutput,
    FediSocialOutputOutcome,
    FediSocialConsensusItem,
    FediSocialInputError,
    FediSocialOutputError
);
