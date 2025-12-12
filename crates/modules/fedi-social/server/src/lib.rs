use std::collections::BTreeMap;

use async_trait::async_trait;
use common::common::{SignedRecoveryRequest, VerificationDocument};
use common::config::{
    FediSocialClientConfig, FediSocialConfig, FediSocialConsensusConfig, FediSocialGenParams,
    FediSocialPrivateConfig,
};
use common::db::{
    BackupKeyPrefix, DbKeyPrefix, DecryptionShareId, DecryptionSharePrefix, RecoveryPrefix,
    UsedDoubleEncryptedData, UsedDoubleEncryptedDataPrefix,
};
use common::{
    CONSENSUS_VERSION, FediSocialCommonGen, FediSocialConsensusItem, FediSocialModuleTypes,
    FediSocialOutputOutcome,
};
pub use fedi_social_common as common;
use fedi_social_common::{FediSocialInputError, FediSocialOutputError};
use fedimint_core::config::{
    ConfigGenModuleParams, ServerModuleConfig, ServerModuleConsensusConfig,
    TypedServerModuleConfig, TypedServerModuleConsensusConfig,
};
use fedimint_core::core::ModuleInstanceId;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::module::audit::Audit;
use fedimint_core::module::{
    ApiEndpoint, ApiError, ApiVersion, CoreConsensusVersion, InputMeta, ModuleCommon,
    ModuleConsensusVersion, ModuleInit, SupportedModuleApiVersions, TransactionItemAmount,
    api_endpoint,
};
use fedimint_core::{InPoint, NumPeersExt, OutPoint, PeerId, push_db_pair_items};
use fedimint_server::core::config::PeerHandleOps;
use fedimint_server::core::{ServerModule, ServerModuleInit, ServerModuleInitArgs};
use fedimint_threshold_crypto::serde_impl::SerdeSecret;
use fedimint_threshold_crypto::{PublicKeySet, SecretKey, SecretKeyShare};
use futures::stream::StreamExt;
use rand::rngs::OsRng;
use secp256k1::SECP256K1;
use strum::IntoEnumIterator;
use subtle::ConstantTimeEq;
use tracing::{debug, info};

use crate::common::{
    BackupId, BackupRequest, EncryptedRecoveryShare, RecoveryId, RecoveryRequest,
    SignedBackupRequest,
};

#[derive(Clone, Debug)]
pub struct FediSocialInit;

impl ModuleInit for FediSocialInit {
    type Common = FediSocialCommonGen;

    async fn dump_database(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        prefix_names: Vec<String>,
    ) -> Box<dyn Iterator<Item = (String, Box<dyn erased_serde::Serialize + Send>)> + '_> {
        let mut social: BTreeMap<String, Box<dyn erased_serde::Serialize + Send>> = BTreeMap::new();
        let filtered_prefixes = DbKeyPrefix::iter().filter(|f| {
            prefix_names.is_empty() || prefix_names.contains(&f.to_string().to_lowercase())
        });

        for table in filtered_prefixes {
            match table {
                DbKeyPrefix::Backup => {
                    push_db_pair_items!(
                        dbtx,
                        BackupKeyPrefix,
                        BackupId,
                        BackupRequest,
                        social,
                        "Social Backup"
                    );
                }
                DbKeyPrefix::Recovery => {
                    push_db_pair_items!(
                        dbtx,
                        RecoveryPrefix,
                        RecoveryId,
                        RecoveryRequest,
                        social,
                        "Social Recovery Request"
                    );
                }
                DbKeyPrefix::UsedBackupCiphertext => {
                    push_db_pair_items!(
                        dbtx,
                        UsedDoubleEncryptedDataPrefix,
                        UsedDoubleEncryptedData,
                        BackupId,
                        social,
                        "Used Backup Ciphertext"
                    );
                }
                DbKeyPrefix::DecryptionShare => {
                    push_db_pair_items!(
                        dbtx,
                        DecryptionSharePrefix,
                        DecryptionShareId,
                        EncryptedRecoveryShare,
                        social,
                        "Encrypted recovery share"
                    );
                }
            }
        }

        Box::new(social.into_iter())
    }
}

#[async_trait]
impl ServerModuleInit for FediSocialInit {
    type Module = FediSocial;
    type Params = FediSocialGenParams;

    fn versions(&self, _core: CoreConsensusVersion) -> &[ModuleConsensusVersion] {
        &[CONSENSUS_VERSION]
    }

    fn supported_api_versions(&self) -> SupportedModuleApiVersions {
        SupportedModuleApiVersions::from_raw((2, 0), (2, 0), &[(0, 0)])
    }

    async fn init(&self, args: &ServerModuleInitArgs<Self>) -> anyhow::Result<Self::Module> {
        Ok(FediSocial {
            cfg: args.cfg().to_typed()?,
        })
    }
    fn trusted_dealer_gen(
        &self,
        peers: &[PeerId],
        _params: &ConfigGenModuleParams,
        _disable_base_fees: bool,
    ) -> BTreeMap<PeerId, ServerModuleConfig> {
        let sks = fedimint_threshold_crypto::SecretKeySet::random(
            peers.to_num_peers().degree(),
            &mut OsRng,
        );
        let pks = sks.public_keys();

        let server_cfg = peers.iter().map(|&peer| {
            let sk = sks.secret_key_share(peer.to_usize());

            (
                peer,
                FediSocialConfig {
                    private: FediSocialPrivateConfig {
                        sk_share: fedimint_threshold_crypto::serde_impl::SerdeSecret(sk),
                    },
                    consensus: FediSocialConsensusConfig {
                        threshold: u32::try_from(peers.to_num_peers().threshold())
                            .expect("must not fail"),
                        pk_set: pks.clone(),
                    },
                }
                .to_erased(),
            )
        });

        server_cfg.into_iter().collect()
    }

    async fn distributed_gen(
        &self,
        peers: &(dyn PeerHandleOps + Send + Sync),
        _params: &ConfigGenModuleParams,
        _disable_base_fees: bool,
    ) -> anyhow::Result<ServerModuleConfig> {
        let (polynomial, sks) = peers.run_dkg_g1().await?;

        let server = FediSocialConfig {
            private: FediSocialPrivateConfig {
                sk_share: SerdeSecret(SecretKeyShare(SecretKey(sks))),
            },
            consensus: FediSocialConsensusConfig {
                pk_set: PublicKeySet::from(fedimint_threshold_crypto::poly::Commitment::from(
                    polynomial,
                )),
                threshold: u32::try_from(peers.num_peers().threshold()).expect("must not fail"),
            },
        };

        Ok(server.to_erased())
    }

    fn get_client_config(
        &self,
        config: &ServerModuleConsensusConfig,
    ) -> anyhow::Result<FediSocialClientConfig> {
        let config = FediSocialConsensusConfig::from_erased(config)?;
        Ok(FediSocialClientConfig {
            federation_pk_set: config.pk_set,
        })
    }

    fn validate_config(
        &self,
        _identity: &PeerId,
        _config: ServerModuleConfig,
    ) -> anyhow::Result<()> {
        // TODO: validate anything?
        Ok(())
    }
}

/// Federated mint member mint
#[derive(Debug)]
pub struct FediSocial {
    pub cfg: FediSocialConfig,
}

#[async_trait]
impl ServerModule for FediSocial {
    type Common = FediSocialModuleTypes;
    type Init = FediSocialInit;

    async fn consensus_proposal<'a>(
        &'a self,
        _dbtx: &mut DatabaseTransaction<'_>,
    ) -> Vec<FediSocialConsensusItem> {
        vec![]
    }

    async fn process_consensus_item<'a, 'b>(
        &'a self,
        _dbtx: &mut DatabaseTransaction<'b>,
        _consensus_item: <Self::Common as ModuleCommon>::ConsensusItem,
        _peer_id: PeerId,
    ) -> anyhow::Result<()> {
        unreachable!("FediSocial does not have any consensus items")
    }

    async fn process_input<'a, 'b, 'c>(
        &'a self,
        _dbtx: &mut DatabaseTransaction<'c>,
        _input: &'b <Self::Common as ModuleCommon>::Input,
        _in_point: InPoint,
    ) -> Result<InputMeta, FediSocialInputError> {
        unreachable!("FediSocial does not have any inputs")
    }

    async fn process_output<'a, 'b>(
        &'a self,
        _dbtx: &mut DatabaseTransaction<'b>,
        _output: &'a <Self::Common as ModuleCommon>::Output,
        _out_point: OutPoint,
    ) -> Result<TransactionItemAmount, FediSocialOutputError> {
        unreachable!("FediSocial does not have any outputs")
    }

    async fn output_status(
        &self,
        _dbtx: &mut DatabaseTransaction<'_>,
        _out_point: OutPoint,
    ) -> Option<FediSocialOutputOutcome> {
        None
    }

    async fn audit(
        &self,
        _dbtx: &mut DatabaseTransaction<'_>,
        _audit: &mut Audit,
        _module_instance_id: ModuleInstanceId,
    ) {
    }

    fn api_endpoints(&self) -> Vec<ApiEndpoint<Self>> {
        vec![
            // user's call to make a backup (usually when creating the account)
            api_endpoint! {
                "backup",
                ApiVersion::new(0, 0),
                async |module: &FediSocial, context, request: SignedBackupRequest| -> () {
                        module
                            .handle_backup(&mut context.dbtx().to_ref_nc(), request).await?;
                        Ok(())
                }
            },
            // user's call to initiate the recovery process
            api_endpoint! {
                "recover",
                ApiVersion::new(0, 0),
                async |module: &FediSocial, context, request: SignedRecoveryRequest| -> () {
                        module
                            .handle_recover(&mut context.dbtx().to_ref_nc(), request).await?;
                        Ok(())
                }
            },
            // guardian's call to download verification document
            api_endpoint! {
                "get_verification",
                ApiVersion::new(0, 0),
                async |module: &FediSocial, context, request: RecoveryId| -> Option<VerificationDocument> {
                        module
                            .handle_get_verification(&mut context.dbtx().to_ref_nc(), request).await
                }
            },
            // guardian's call to approve the recovery and produce decryption share
            api_endpoint! {
                "approve_recovery",
                ApiVersion::new(0, 0),
                async |module: &FediSocial, context, req: (RecoveryId, String)| -> () {
                        module
                            .handle_approve_recovery(&mut context.dbtx().to_ref_nc(), req.0, req.1).await?;
                        Ok(())
                }
            },
            api_endpoint! {
                "decryption_share",
                ApiVersion::new(0, 0),
                async |module: &FediSocial, context, request: RecoveryId| -> Option<EncryptedRecoveryShare> {
                        module
                            .handle_get_decryption_share(&mut context.dbtx().to_ref_nc(), request).await
                }
            },
        ]
    }
}

impl FediSocial {
    /// Constructs a new mint
    ///
    /// # Panics
    /// * If there are no amount tiers
    /// * If the amount tiers for secret and public keys are inconsistent
    /// * If the pub key belonging to the secret key share is not in the pub key
    ///   list.
    pub fn new(cfg: FediSocialConfig) -> FediSocial {
        FediSocial { cfg }
    }

    pub async fn handle_backup(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        request: SignedBackupRequest,
    ) -> Result<(), ApiError> {
        let request = request
            .verify_valid(SECP256K1)
            .map_err(|_| ApiError::bad_request("invalid request: signature invalid".into()))?;

        debug!(id = %request.id, "Received social backup request");
        if let Some(prev) = dbtx.get_value(&request.id).await {
            if &prev == request {
                // if we already have exactly same backup request, just return OK, so this call
                // is idempotent
                return Ok(());
            } else if request.timestamp <= prev.timestamp {
                return Err(ApiError::bad_request(
                    "invalid request: newer backup already stored".into(),
                ));
            }
        }

        if let Some(_prev) = dbtx
            .get_value(&UsedDoubleEncryptedData(
                request.double_encrypted_seed.clone(),
            ))
            .await
        {
            return Err(ApiError::bad_request(
                "invalid request: seed already used".into(),
            ));
        }

        info!(id = %request.id, "Storing new user social backup");
        dbtx.insert_entry(&request.id, request).await;

        dbtx.insert_entry(
            &UsedDoubleEncryptedData(request.double_encrypted_seed.clone()),
            &request.id,
        )
        .await;

        Ok(())
    }

    pub async fn handle_recover(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        request: SignedRecoveryRequest,
    ) -> Result<(), ApiError> {
        let request = request
            .verify_valid(SECP256K1)
            .map_err(|_| ApiError::bad_request("invalid request: signature invalid".into()))?;

        debug!(id = %request.id, "Received social recovery request");

        let Some(backup) = dbtx.get_value(&BackupId(request.id.0)).await else {
            return Err(ApiError::bad_request(
                "invalid request: backup id not found".into(),
            ));
        };

        if request.verification_doc.id() != backup.verification_doc_hash {
            return Err(ApiError::bad_request(
                "invalid request: verification document does not match".into(),
            ));
        }

        if let Some(prev) = dbtx.get_value(&request.id).await {
            if &prev == request {
                // same request we have, return Ok to make call idempotent
                return Ok(());
            } else if request.timestamp <= prev.timestamp {
                return Err(ApiError::bad_request(
                    "invalid request: existing recovery already in progress".into(),
                ));
            }
        };

        // TODO: any limits w.r.t social recovery document size? Possibly enforce in the
        // type itself.
        info!(id = %request.id, "Storing user recovery");
        dbtx.insert_entry(&request.id, request).await;

        Ok(())
    }

    pub async fn handle_get_verification(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        request: RecoveryId,
    ) -> Result<Option<VerificationDocument>, ApiError> {
        debug!(id = %request.0, "Received social recovery verification document request");

        // TODO: ideally, we would verify this request with guardian pass, but that
        // would be a breaking change:
        // verify_req_admin_pass(&req_admin_pass)?;
        // Fortunately the `RequestId` is already a semi-secret: random and unguessable,
        // making it not strictly neccessary. Even if the attacker is able to get the
        // verification document, it is only privacy risk, and not security risk.

        let Some(recovery) = dbtx.get_value(&request).await else {
            return Ok(None);
        };

        Ok(Some(recovery.verification_doc))
    }

    pub async fn handle_approve_recovery(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        request: RecoveryId,
        req_admin_pass: String,
    ) -> Result<VerificationDocument, ApiError> {
        debug!(id = %request.0, "Received social recovery approval");

        verify_req_admin_pass(&req_admin_pass)?;

        let Some(recovery) = dbtx.get_value(&RecoveryId(request.0)).await else {
            return Err(ApiError::bad_request(
                "invalid request: recovery id not found".into(),
            ));
        };

        let Some(backup) = dbtx.get_value(&BackupId(request.0)).await else {
            return Err(ApiError::bad_request(
                "invalid request: backup id not found".into(),
            ));
        };

        info!(id = %request.0, "Creating social recovery decryption key");
        let decryption_share = self
            .cfg
            .private
            .sk_share
            .decrypt_share(&(*backup.double_encrypted_seed).0)
            .ok_or_else(|| {
                ApiError::bad_request("invalid request: can't create decryption share".into())
            })?;

        let encrypted_decryption_share = EncryptedRecoveryShare::encrypt_to_ephmeral(
            decryption_share,
            &recovery.recovery_session_encryption_key.0,
        );

        dbtx.insert_entry(&DecryptionShareId(request.0), &encrypted_decryption_share)
            .await;

        Ok(recovery.verification_doc)
    }

    pub async fn handle_get_decryption_share(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        request: RecoveryId,
    ) -> Result<Option<EncryptedRecoveryShare>, ApiError> {
        info!(id = %request.0, "Requested encrypted decryption share");

        Ok(dbtx.get_value(&DecryptionShareId(request.0)).await)
    }
}

fn verify_req_admin_pass(req_admin_pass: &str) -> Result<(), ApiError> {
    let env_admin_password = if let Ok(pass) = std::env::var("FM_ADMIN_PASSWORD") {
        pass
    } else {
        return Err(ApiError::bad_request(
            "admin interface configuration error".into(),
        ));
    };
    if env_admin_password.is_empty() {
        return Err(ApiError::bad_request("admin interface not enabled".into()));
    }

    if req_admin_pass
        .as_bytes()
        .ct_ne(env_admin_password.as_bytes())
        .into()
    {
        return Err(ApiError::bad_request("unauthorized".into()));
    }

    Ok(())
}
