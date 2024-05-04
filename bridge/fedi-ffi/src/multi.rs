use std::time::UNIX_EPOCH;

use anyhow::{Context, Result};
use bitcoin::secp256k1::{Message, PublicKey, Secp256k1};
use bitcoin::{Address, Network, XOnlyPublicKey};
use fedi_social_client::RecoveryId;
use fedimint_core::core::OperationId;
use fedimint_core::{Amount, PeerId};
use fedimint_derive_secret::{ChildId, DerivableSecret};
use lightning_invoice::Bolt11Invoice;
use stability_pool_client::ClientAccountInfo;
use tracing::info;

use super::types::{
    RpcAmount, RpcFederationId, RpcInvoice, RpcPayInvoiceResponse, RpcPublicKey,
    RpcSignedLnurlMessage, RpcTransaction, RpcXmppCredentials,
};
use crate::constants::{LNURL_CHILD_ID, NOSTR_CHILD_ID};
use crate::error::ErrorCode;
use crate::federation_v2::{BackupServiceStatus, FederationV2};
use crate::types::{
    GuardianStatus, RpcFeeDetails, RpcGenerateEcashResponse, RpcLightningGateway,
    RpcPayAddressResponse,
};

pub enum MultiFederation {
    V2(FederationV2),
}

impl MultiFederation {
    pub fn federation_id(&self) -> RpcFederationId {
        match self {
            Self::V2(multi) => RpcFederationId(multi.federation_id().to_string()),
        }
    }

    // Returns Option<Network> as the network is not available while the federation
    // is recovering
    pub fn federation_network(&self) -> Option<Network> {
        match self {
            Self::V2(v2) => v2.get_network(),
        }
    }

    pub async fn generate_address(&self) -> Result<String> {
        match self {
            Self::V2(multi) => multi.generate_address().await,
        }
    }

    pub async fn generate_invoice(
        &self,
        amount: RpcAmount,
        description: String,
        expiry_time: Option<u64>,
    ) -> Result<RpcInvoice> {
        match self {
            Self::V2(multi) => {
                multi
                    .generate_invoice(amount, description, expiry_time)
                    .await
            }
        }
    }

    pub async fn decode_invoice(&self, invoice: String) -> Result<RpcInvoice> {
        match self {
            Self::V2(v2) => v2.decode_invoice(invoice).await,
        }
    }

    pub async fn pay_invoice(&self, invoice: &Bolt11Invoice) -> Result<RpcPayInvoiceResponse> {
        match self {
            Self::V2(v2) => v2.pay_invoice(&invoice.clone()).await,
        }
    }

    pub async fn preview_pay_address(
        &self,
        address: Address,
        amount: bitcoin::Amount,
    ) -> Result<RpcFeeDetails> {
        info!("preview pay address amount is {}", amount);
        match self {
            Self::V2(v2) => v2.preview_pay_address(address, amount).await,
        }
    }

    pub async fn pay_address(
        &self,
        address: Address,
        amount: bitcoin::Amount,
    ) -> Result<RpcPayAddressResponse> {
        info!("pay address amount is {}", amount);
        match self {
            Self::V2(v2) => v2.pay_address(address, amount).await,
        }
    }

    pub async fn list_gateways(&self) -> Result<Vec<RpcLightningGateway>> {
        match self {
            Self::V2(v2) => v2.list_gateways().await,
        }
    }

    pub async fn switch_gateway(&self, gateway_id: &PublicKey) -> Result<()> {
        match self {
            Self::V2(v2) => v2.switch_gateway(gateway_id).await,
        }
    }

    pub async fn get_balance(&self) -> Amount {
        match self {
            Self::V2(v2) => v2.get_balance().await,
        }
    }

    pub async fn guardian_status(&self) -> anyhow::Result<Vec<GuardianStatus>> {
        match self {
            Self::V2(v2) => v2.guardian_status().await,
        }
    }

    pub async fn receive_ecash(&self, ecash: String) -> Result<Amount> {
        match self {
            Self::V2(v2) => v2.receive_ecash(ecash).await,
        }
    }

    pub async fn generate_ecash(&self, amount: Amount) -> Result<RpcGenerateEcashResponse> {
        match self {
            Self::V2(v2) => v2.generate_ecash(amount).await,
        }
    }

    pub async fn cancel_ecash(&self, ecash: String) -> Result<()> {
        match self {
            Self::V2(v2) => {
                v2.cancel_ecash(ecash.parse().context(ErrorCode::BadRequest)?)
                    .await
            }
        }
    }

    pub async fn backup(&self) -> Result<()> {
        match self {
            Self::V2(v2) => v2.backup().await,
        }
    }

    pub async fn backup_status(&self) -> Result<BackupServiceStatus> {
        match self {
            Self::V2(v2) => v2.backup_status().await,
        }
    }

    pub async fn get_xmpp_username(&self) -> Option<String> {
        match self {
            Self::V2(v2) => v2.get_xmpp_username().await,
        }
    }

    pub async fn save_xmpp_username(&self, username: &str) -> Result<()> {
        match self {
            Self::V2(v2) => {
                v2.save_xmpp_username(username).await?;
                // after recovering we will do backup always
                if !v2.recovering() {
                    v2.backup().await?;
                }
            }
        }
        Ok(())
    }

    pub async fn upload_backup_file(
        &self,
        video_file: Vec<u8>,
        root_mnemonic: bip39::Mnemonic,
    ) -> Result<Vec<u8>> {
        match self {
            Self::V2(v2) => v2.upload_backup_file(video_file, root_mnemonic).await,
        }
    }

    pub async fn download_verification_doc(
        &self,
        recovery_id: RecoveryId,
    ) -> Result<Option<Vec<u8>>> {
        match self {
            Self::V2(v2) => v2.download_verification_doc(&recovery_id).await,
        }
    }

    pub async fn approve_social_recovery_request(
        &self,
        recovery_id: &RecoveryId,
        peer_id: PeerId,
        password: &str,
    ) -> Result<()> {
        match self {
            Self::V2(v2) => {
                v2.approve_social_recovery_request(recovery_id, peer_id, password)
                    .await
            }
        }
    }

    pub async fn list_transactions(
        &self,
        start_time: Option<u32>,
        limit: Option<u32>,
    ) -> Result<Vec<RpcTransaction>> {
        let time = start_time.map(|n| UNIX_EPOCH + std::time::Duration::from_secs(n.into()));
        let operation_id = OperationId::new_random();

        let usize_limit = limit.map_or(usize::MAX as u32, |l| l) as usize;

        Ok(match self {
            Self::V2(v2) => {
                let start_after = time.map(|t| fedimint_client::db::ChronologicalOperationLogKey {
                    creation_time: t,
                    operation_id,
                });
                v2.list_transactions(usize_limit, start_after).await
            }
        })
    }

    pub async fn update_transaction_notes(
        &self,
        transaction_id: String,
        notes: String,
    ) -> anyhow::Result<()> {
        match self {
            Self::V2(v2) => {
                v2.update_transaction_notes(transaction_id.parse()?, notes)
                    .await?
            }
        };
        Ok(())
    }

    pub async fn sign_lnurl_message(
        &self,
        message: &Message,
        domain: String,
        global_root_secret: DerivableSecret,
    ) -> RpcSignedLnurlMessage {
        match self {
            Self::V2(_) => {
                let secp = Secp256k1::new();
                let lnurl_secret = global_root_secret.child_key(ChildId(LNURL_CHILD_ID));
                let lnurl_secret_bytes: [u8; 32] = lnurl_secret.to_random_bytes();
                let lnurl_domain_secret =
                    DerivableSecret::new_root(&lnurl_secret_bytes, domain.as_bytes());
                let lnurl_domain_keypair = lnurl_domain_secret.to_secp_key(&secp);
                let lnurl_domain_pubkey = lnurl_domain_keypair.public_key();
                let signature = secp.sign_ecdsa(message, &lnurl_domain_keypair.secret_key());
                RpcSignedLnurlMessage {
                    signature,
                    pubkey: RpcPublicKey(lnurl_domain_pubkey),
                }
            }
        }
    }

    pub async fn get_xmpp_credentials(&self) -> RpcXmppCredentials {
        match self {
            Self::V2(v2) => v2.get_xmpp_credentials().await,
        }
    }

    pub async fn get_nostr_pub_key(
        &self,
        global_root_secret: DerivableSecret,
    ) -> Result<XOnlyPublicKey> {
        match self {
            Self::V2(_) => {
                let secp = Secp256k1::new();
                let nostr_secret = global_root_secret.child_key(ChildId(NOSTR_CHILD_ID));
                let nostr_keypair = nostr_secret.to_secp_key(&secp);
                let nostr_pubkey = nostr_keypair.x_only_public_key();
                Ok(nostr_pubkey.0)
            }
        }
    }

    pub async fn sign_nostr_event(
        &self,
        event_hash: String,
        global_root_secret: DerivableSecret,
    ) -> Result<String> {
        match self {
            Self::V2(_) => {
                let secp = Secp256k1::new();
                let nostr_secret = global_root_secret.child_key(ChildId(NOSTR_CHILD_ID));
                let nostr_keypair = nostr_secret.to_secp_key(&secp);
                let data = &hex::decode(event_hash)?;
                let message = Message::from_slice(data)?;
                let sig = secp.sign_schnorr(&message, &nostr_keypair);
                // Return hex-encoded string
                Ok(format!("{}", sig))
            }
        }
    }

    pub async fn stability_pool_account_info(
        &self,
        force_update: bool,
    ) -> Result<ClientAccountInfo> {
        match self {
            Self::V2(v2) => v2.stability_pool_account_info(force_update).await,
        }
    }

    pub async fn stability_pool_deposit_to_seek(&self, amount: Amount) -> Result<OperationId> {
        match self {
            MultiFederation::V2(v2) => v2.stability_pool_deposit_to_seek(amount).await,
        }
    }

    pub async fn stability_pool_withdraw(
        &self,
        unlocked_amount: Amount,
        locked_bps: u32,
    ) -> Result<OperationId> {
        match self {
            MultiFederation::V2(v2) => {
                v2.stability_pool_withdraw(unlocked_amount, locked_bps)
                    .await
            }
        }
    }

    pub async fn stability_pool_next_cycle_start_time(&self) -> Result<u64> {
        match self {
            MultiFederation::V2(v2) => v2.stability_pool_next_cycle_start_time().await,
        }
    }

    pub async fn stability_pool_cycle_start_price(&self) -> Result<u64> {
        match self {
            MultiFederation::V2(v2) => v2.stability_pool_cycle_start_price().await,
        }
    }

    pub async fn stability_pool_average_fee_rate(&self, num_cycles: u64) -> Result<u64> {
        match self {
            MultiFederation::V2(v2) => v2.stability_pool_average_fee_rate(num_cycles).await,
        }
    }

    pub async fn get_accrued_outstanding_fedi_fees(&self) -> Result<RpcAmount> {
        match self {
            MultiFederation::V2(v2) => Ok(RpcAmount(v2.get_outstanding_fedi_fees().await)),
        }
    }
}
