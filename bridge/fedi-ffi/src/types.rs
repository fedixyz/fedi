use std::collections::BTreeMap;
use std::ops::Not;
use std::time::Duration;

use anyhow::anyhow;
use bitcoin::secp256k1::ecdsa::Signature;
use bitcoin::Network;
use fedimint_core::config::{GlobalClientConfig, JsonWithKind, PeerUrl};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::Amount;
use fedimint_ln_client::pay::GatewayPayError;
use fedimint_ln_client::{LnPayState, LnReceiveState};
use fedimint_wallet_client::{DepositStateV2, WithdrawState};
use serde::{Deserialize, Serialize};
use stability_pool_client::ClientAccountInfo;
use ts_rs::TS;

use super::federation_v2::FederationV2;
use super::utils::to_unix_time;
use crate::api::RegisteredDevice;
use crate::federation_v2::client::ClientExt;
use crate::storage::FediFeeSchedule;

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcInitOpts {
    pub data_dir: Option<String>,
    pub log_level: Option<String>,
    pub device_identifier: String,
    pub app_flavor: RpcAppFlavor,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcAppFlavor {
    Dev,
    Nightly,
    Bravo,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Copy, TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcAmount(#[ts(type = "MSats")] pub fedimint_core::Amount);

impl std::fmt::Display for RpcAmount {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcFederation {
    pub balance: RpcAmount,
    pub id: RpcFederationId,
    #[ts(type = "string | null")]
    pub network: Option<Network>,
    pub name: String,
    pub invite_code: String,
    pub meta: BTreeMap<String, String>,
    pub recovering: bool,
    #[ts(type = "Record<string, {url: string, name: string}>")]
    pub nodes: BTreeMap<RpcPeerId, PeerUrl>,
    pub version: u32,
    pub client_config: Option<RpcJsonClientConfig>,
    pub fedi_fee_schedule: RpcFediFeeSchedule,
    pub had_reused_ecash: bool,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "init_state")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcFederationMaybeLoading {
    Loading { id: RpcFederationId },
    Failed { error: String, id: RpcFederationId },
    Ready(RpcFederation),
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcBridgeStatus {
    pub matrix_setup: bool,
    pub device_index_assignment_status: RpcDeviceIndexAssignmentStatus,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcReturningMemberStatus {
    Unknown,
    NewMember,
    ReturningMember,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcFederationPreview {
    pub id: RpcFederationId,
    pub name: String,
    pub meta: BTreeMap<String, String>,
    pub invite_code: String,
    pub version: u32,
    pub returning_member_status: RpcReturningMemberStatus,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcCommunity {
    pub invite_code: String,
    pub name: String,
    pub version: u32,
    pub meta: BTreeMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum GuardianStatus {
    Online { guardian: String, latency_ms: u32 },
    Error { guardian: String, error: String },
    Timeout { guardian: String, elapsed: String },
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcJsonClientConfig {
    #[ts(type = "unknown")]
    global: GlobalClientConfig,
    #[ts(type = "Record<string, unknown>")]
    modules: BTreeMap<u16, JsonWithKind>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcDuration {
    #[ts(type = "number")]
    pub nanos: u64,
    #[ts(type = "number")]
    pub secs: u64,
}

#[derive(Debug, Serialize, TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcStabilityPoolConfig {
    pub kind: String,
    pub min_allowed_seek: RpcAmount,
    pub max_allowed_provide_fee_rate_ppb: Option<u32>,
    pub min_allowed_cancellation_bps: Option<u32>,
    pub cycle_duration: RpcDuration,
}

#[derive(Debug, Eq, PartialEq, Hash, Serialize, Deserialize, Clone, TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcFederationId(pub String);

#[derive(Debug, TS, Serialize)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcOperationId(#[ts(type = "string")] pub fedimint_core::core::OperationId);

impl From<fedimint_core::core::OperationId> for RpcOperationId {
    fn from(value: fedimint_core::core::OperationId) -> Self {
        Self(fedimint_core::core::OperationId(value.0))
    }
}

pub async fn federation_v2_to_rpc_federation(federation: &FederationV2) -> RpcFederation {
    let id = RpcFederationId(federation.federation_id().to_string());
    let name = federation.federation_name();
    let network = federation.get_network();
    let client_config = federation.client.config().await;
    let meta = federation.get_cached_meta().await;
    let nodes = client_config
        .global
        .api_endpoints
        .clone()
        .iter()
        .map(|(peer_id, peer_url)| (RpcPeerId(*peer_id), peer_url.clone()))
        .collect();
    let client_config_json = federation.client.get_config_json().await;
    let (invite_code, fedi_fee_schedule, balance) = futures::join!(
        federation.get_invite_code(),
        federation.fedi_fee_schedule(),
        federation.get_balance(),
    );
    let had_reused_ecash = if let Ok(x) = federation.client.mint() {
        x.reused_note_secrets().await.is_empty().not()
    } else {
        false
    };
    RpcFederation {
        balance: RpcAmount(balance),
        id,
        network,
        name,
        invite_code,
        meta,
        nodes,
        recovering: federation.recovering(),
        version: 2,
        client_config: Some(RpcJsonClientConfig {
            global: client_config_json.global,
            modules: client_config_json.modules,
        }),
        fedi_fee_schedule: fedi_fee_schedule.into(),
        had_reused_ecash,
    }
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "federation_type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcEcashInfo {
    Joined {
        federation_id: RpcFederationId,
        amount: RpcAmount,
    },
    NotJoined {
        federation_invite: Option<String>,
        amount: RpcAmount,
    },
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcInvoice {
    pub payment_hash: String,
    pub amount: RpcAmount,
    pub fee: Option<RpcFeeDetails>,
    pub description: String,
    pub invoice: String,
}

// Federation-agnostic conversion of Bolt11Invoice to RpcInvoice. Fee details
// are absent as a result.
impl TryFrom<lightning_invoice::Bolt11Invoice> for RpcInvoice {
    type Error = anyhow::Error;

    fn try_from(invoice: lightning_invoice::Bolt11Invoice) -> anyhow::Result<Self> {
        let amount_msat = invoice
            .amount_milli_satoshis()
            .ok_or(anyhow!("Invoice missing amount"))?;
        let amount = fedimint_core::Amount::from_msats(amount_msat);

        // We might get no description
        let description = match invoice.description() {
            lightning_invoice::Bolt11InvoiceDescription::Direct(desc) => desc.to_string(),
            lightning_invoice::Bolt11InvoiceDescription::Hash(_) => "".to_string(),
        };

        Ok(RpcInvoice {
            amount: RpcAmount(amount),
            fee: None,
            description,
            invoice: invoice.to_string(),
            payment_hash: invoice.payment_hash().to_string(),
        })
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcFeeDetails {
    pub fedi_fee: RpcAmount,
    pub network_fee: RpcAmount,
    pub federation_fee: RpcAmount,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcPayInvoiceResponse {
    pub preimage: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcGenerateEcashResponse {
    pub ecash: String,
    #[ts(type = "number")]
    pub cancel_at: u64,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcPayAddressResponse {
    pub txid: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcLightningGateway {
    pub node_pub_key: RpcPublicKey,
    pub gateway_id: RpcPublicKey,
    pub api: String, // TODO: url::Ur;
    pub active: bool,
}

#[derive(Serialize, Deserialize, Default)]
pub struct FediBackupMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    // don't use this field
    username: Option<String>,
}

impl FediBackupMetadata {
    pub fn new() -> Self {
        Self { username: None }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcRecoveryId(#[ts(type = "string")] pub fedi_social_client::common::RecoveryId);

#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SocialRecoveryQr {
    pub recovery_id: RpcRecoveryId,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct SocialRecoveryApproval {
    // FIXME: perhaps this should be peer id and client can look up the name ???
    pub guardian_name: String,
    pub approved: bool,
}

#[derive(Debug, Eq, Ord, PartialOrd, PartialEq, Serialize, Deserialize, Clone, Copy, TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcPeerId(#[ts(type = "number")] pub fedimint_core::PeerId);

#[derive(Debug, Serialize, Deserialize, Clone, Copy, TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcPublicKey(#[ts(type = "string")] pub bitcoin::secp256k1::PublicKey);

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcNostrSecret {
    pub hex: String,
    pub nsec: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcNostrPubkey {
    pub hex: String,
    pub npub: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcSignedLnurlMessage {
    #[ts(type = "string")]
    pub signature: Signature,
    pub pubkey: RpcPublicKey,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcMediaUploadParams {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub mime_type: String,
}

#[derive(
    Debug, Clone, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize, TS, Encodable, Decodable,
)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcTransactionDirection {
    Receive,
    Send,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct WithdrawalDetails {
    pub address: String,
    pub txid: String,
    pub fee: RpcAmount,
    #[ts(type = "number")]
    pub fee_rate: u64,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcTransaction {
    pub id: String,
    #[ts(type = "number")]
    pub created_at: u64,
    pub amount: RpcAmount,
    pub fedi_fee_status: Option<RpcOperationFediFeeStatus>,
    pub direction: RpcTransactionDirection,
    pub notes: String,
    pub onchain_state: Option<RpcOnchainState>,
    pub bitcoin: Option<RpcBitcoinDetails>,
    pub ln_state: Option<RpcLnState>,
    pub lightning: Option<RpcLightningDetails>,
    pub oob_state: Option<RpcOOBState>,
    pub onchain_withdrawal_details: Option<WithdrawalDetails>,
    pub stability_pool_state: Option<RpcStabilityPoolTransactionState>,
    pub tx_date_fiat_info: Option<TransactionDateFiatInfo>,
}

impl RpcTransaction {
    pub fn new(
        id: String,
        created_at: u64,
        amount: RpcAmount,
        direction: RpcTransactionDirection,
        fedi_fee_status: Option<RpcOperationFediFeeStatus>,
        tx_date_fiat_info: Option<TransactionDateFiatInfo>,
    ) -> Self {
        Self {
            id,
            created_at,
            amount,
            direction,
            fedi_fee_status,
            notes: Default::default(),
            onchain_state: Default::default(),
            bitcoin: Default::default(),
            ln_state: Default::default(),
            lightning: Default::default(),
            oob_state: Default::default(),
            onchain_withdrawal_details: Default::default(),
            stability_pool_state: Default::default(),
            tx_date_fiat_info,
        }
    }

    pub fn with_notes(self, notes: String) -> Self {
        Self { notes, ..self }
    }

    pub fn with_onchain_state(self, onchain_state: RpcOnchainState) -> Self {
        Self {
            onchain_state: Some(onchain_state),
            ..self
        }
    }

    pub fn with_bitcoin(self, bitcoin: RpcBitcoinDetails) -> Self {
        Self {
            bitcoin: Some(bitcoin),
            ..self
        }
    }

    pub fn with_ln_state(self, ln_state: RpcLnState) -> Self {
        Self {
            ln_state: Some(ln_state),
            ..self
        }
    }

    pub fn with_lightning(self, lightning: RpcLightningDetails) -> Self {
        Self {
            lightning: Some(lightning),
            ..self
        }
    }

    pub fn with_oob_state(self, oob_state: RpcOOBState) -> Self {
        Self {
            oob_state: Some(oob_state),
            ..self
        }
    }

    pub fn with_onchain_withdrawal_details(
        self,
        onchain_withdrawal_details: WithdrawalDetails,
    ) -> Self {
        Self {
            onchain_withdrawal_details: Some(onchain_withdrawal_details),
            ..self
        }
    }

    pub fn with_stability_pool_state(
        self,
        stability_pool_state: RpcStabilityPoolTransactionState,
    ) -> Self {
        Self {
            stability_pool_state: Some(stability_pool_state),
            ..self
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcStabilityPoolTransactionState {
    PendingDeposit,
    CompleteDeposit {
        #[ts(type = "number")]
        initial_amount_cents: u64,
        fees_paid_so_far: RpcAmount,
    },
    PendingWithdrawal {
        #[ts(type = "number")]
        estimated_withdrawal_cents: u64,
    },
    CompleteWithdrawal {
        #[ts(type = "number")]
        estimated_withdrawal_cents: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcOnchainState {
    DepositState(RpcOnchainDepositState),
    WithdrawState(RpcOnchainWithdrawState),
}

impl RpcOnchainState {
    pub fn from_deposit_state(state: DepositStateV2) -> RpcOnchainState {
        Self::DepositState(match state {
            DepositStateV2::WaitingForTransaction => RpcOnchainDepositState::WaitingForTransaction,
            DepositStateV2::WaitingForConfirmation { btc_out_point, .. } => {
                RpcOnchainDepositState::WaitingForConfirmation(
                    RpcOnchainDepositTransactionData::new(&btc_out_point),
                )
            }
            DepositStateV2::Claimed { btc_out_point, .. } => RpcOnchainDepositState::Claimed(
                RpcOnchainDepositTransactionData::new(&btc_out_point),
            ),
            DepositStateV2::Confirmed { btc_out_point, .. } => RpcOnchainDepositState::Confirmed(
                RpcOnchainDepositTransactionData::new(&btc_out_point),
            ),
            DepositStateV2::Failed(_) => RpcOnchainDepositState::Failed,
        })
    }

    pub fn from_withdraw_state(state: WithdrawState) -> RpcOnchainState {
        match state {
            WithdrawState::Created => {
                RpcOnchainState::WithdrawState(RpcOnchainWithdrawState::Created)
            }
            WithdrawState::Succeeded(_) => {
                RpcOnchainState::WithdrawState(RpcOnchainWithdrawState::Succeeded)
            }
            WithdrawState::Failed(_) => {
                RpcOnchainState::WithdrawState(RpcOnchainWithdrawState::Failed)
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcOnchainDepositState {
    WaitingForTransaction,
    WaitingForConfirmation(RpcOnchainDepositTransactionData),
    Confirmed(RpcOnchainDepositTransactionData),
    Claimed(RpcOnchainDepositTransactionData),
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcOnchainDepositTransactionData {
    txid: String,
}

impl RpcOnchainDepositTransactionData {
    pub fn new(outpoint: &bitcoin::OutPoint) -> Self {
        Self {
            txid: outpoint.txid.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcOnchainWithdrawState {
    Created,
    Succeeded,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcBitcoinDetails {
    pub address: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcLnState {
    PayState(RpcLnPayState),
    RecvState(RpcLnReceiveState),
}

impl RpcLnState {
    pub fn from_ln_recv_state(state: LnReceiveState) -> RpcLnState {
        match state {
            LnReceiveState::Created => RpcLnState::RecvState(RpcLnReceiveState::Created),
            LnReceiveState::WaitingForPayment { invoice, timeout } => {
                RpcLnState::RecvState(RpcLnReceiveState::WaitingForPayment { invoice, timeout })
            }
            LnReceiveState::Canceled { reason } => {
                RpcLnState::RecvState(RpcLnReceiveState::Canceled {
                    reason: reason.to_string(),
                })
            }
            LnReceiveState::Funded => RpcLnState::RecvState(RpcLnReceiveState::Funded),
            LnReceiveState::AwaitingFunds => {
                RpcLnState::RecvState(RpcLnReceiveState::AwaitingFunds)
            }
            LnReceiveState::Claimed => RpcLnState::RecvState(RpcLnReceiveState::Claimed),
        }
    }
    pub fn from_ln_pay_state(state: LnPayState) -> RpcLnState {
        match state {
            LnPayState::Created => RpcLnState::PayState(RpcLnPayState::Created),
            LnPayState::Canceled => RpcLnState::PayState(RpcLnPayState::Canceled),
            LnPayState::Funded { block_height } => {
                RpcLnState::PayState(RpcLnPayState::Funded { block_height })
            }
            LnPayState::WaitingForRefund { error_reason } => {
                RpcLnState::PayState(RpcLnPayState::WaitingForRefund { error_reason })
            }
            LnPayState::AwaitingChange => RpcLnState::PayState(RpcLnPayState::AwaitingChange),
            LnPayState::Success { preimage } => {
                RpcLnState::PayState(RpcLnPayState::Success { preimage })
            }
            LnPayState::Refunded { gateway_error } => {
                RpcLnState::PayState(RpcLnPayState::Refunded { gateway_error })
            }
            LnPayState::UnexpectedError { .. } => RpcLnState::PayState(RpcLnPayState::Failed),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcLnPayState {
    Created,
    Canceled,
    Funded {
        block_height: u32,
    },
    WaitingForRefund {
        error_reason: String,
    },
    AwaitingChange,
    Success {
        preimage: String,
    },
    Refunded {
        #[ts(type = "string")]
        gateway_error: GatewayPayError,
    },
    Failed,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcLnReceiveState {
    Created,
    WaitingForPayment {
        invoice: String,
        #[ts(type = "string")]
        timeout: Duration,
    },
    Canceled {
        reason: String,
    },
    Funded,
    AwaitingFunds,
    Claimed,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcOOBState {
    Spend(RpcOOBSpendState),
    Reissue(RpcOOBReissueState),
}
#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcOOBSpendState {
    Created,
    UserCanceledProcessing,
    UserCanceledSuccess,
    UserCanceledFailure,
    Refunded,
    Success,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcOOBReissueState {
    Created,
    Issuing,
    Done,
    Failed { error: String },
}

impl RpcOOBState {
    pub fn from_spend_v2(state: fedimint_mint_client::SpendOOBState) -> Self {
        let state = match state {
            fedimint_mint_client::SpendOOBState::Created => RpcOOBSpendState::Created,
            fedimint_mint_client::SpendOOBState::UserCanceledProcessing => {
                RpcOOBSpendState::UserCanceledProcessing
            }
            fedimint_mint_client::SpendOOBState::UserCanceledSuccess => {
                RpcOOBSpendState::UserCanceledSuccess
            }
            fedimint_mint_client::SpendOOBState::UserCanceledFailure => {
                RpcOOBSpendState::UserCanceledFailure
            }
            fedimint_mint_client::SpendOOBState::Success => RpcOOBSpendState::UserCanceledSuccess,
            fedimint_mint_client::SpendOOBState::Refunded => RpcOOBSpendState::Refunded,
        };
        Self::Spend(state)
    }

    pub fn from_reissue_v2(state: fedimint_mint_client::ReissueExternalNotesState) -> Self {
        let state = match state {
            fedimint_mint_client::ReissueExternalNotesState::Created => RpcOOBReissueState::Created,
            fedimint_mint_client::ReissueExternalNotesState::Issuing => RpcOOBReissueState::Issuing,
            fedimint_mint_client::ReissueExternalNotesState::Done => RpcOOBReissueState::Done,
            fedimint_mint_client::ReissueExternalNotesState::Failed(error) => {
                RpcOOBReissueState::Failed { error }
            }
        };
        Self::Reissue(state)
    }
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcLightningDetails {
    pub invoice: String,
    pub fee: Option<RpcAmount>,
}

// In order to display time-of-transaction fiat value and currency, we need to
// store this info for each transaction. We store the currency code as simply a
// string so that new currency codes added on the front-end side don't require
// additional bridge work. The value is recorded as hundredths, which would
// typically correspond to cents.
#[derive(Debug, Serialize, Deserialize, TS, Encodable, Decodable)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct TransactionDateFiatInfo {
    pub fiat_code: String,
    #[ts(type = "number")]
    pub fiat_value_hundredths: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EcashReceiveMetadata {
    pub internal: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EcashSendMetadata {
    pub internal: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LightningSendMetadata {
    pub is_fedi_fee_remittance: bool,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcStabilityPoolAccountInfo {
    pub idle_balance: RpcAmount,
    pub staged_seeks: Vec<RpcAmount>,
    pub staged_cancellation: Option<u32>,
    pub locked_seeks: Vec<RpcLockedSeek>,
    #[ts(type = "number")]
    pub timestamp: u64,
    pub is_fetched_from_server: bool,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcLockedSeek {
    pub curr_cycle_beginning_locked_amount: RpcAmount,
    pub initial_amount: RpcAmount,
    #[ts(type = "number")]
    pub initial_amount_cents: u64,
    pub withdrawn_amount: RpcAmount,
    #[ts(type = "number")]
    pub withdrawn_amount_cents: u64,
    pub fees_paid_so_far: RpcAmount,
    #[ts(type = "number")]
    pub first_lock_start_time: u64,
}

impl From<ClientAccountInfo> for RpcStabilityPoolAccountInfo {
    fn from(value: ClientAccountInfo) -> Self {
        RpcStabilityPoolAccountInfo {
            idle_balance: RpcAmount(value.account_info.idle_balance),
            staged_seeks: value
                .account_info
                .staged_seeks
                .into_iter()
                .map(|s| RpcAmount(s.seek.0))
                .collect(),
            staged_cancellation: value.account_info.staged_cancellation.map(|c| c.bps),
            locked_seeks: value
                .account_info
                .locked_seeks
                .into_iter()
                .map(|l| {
                    let metadata = value
                        .account_info
                        .seeks_metadata
                        .get(&l.staged_txid)
                        .cloned()
                        .unwrap_or_default();
                    RpcLockedSeek {
                        curr_cycle_beginning_locked_amount: RpcAmount(l.amount),
                        initial_amount: RpcAmount(metadata.initial_amount),
                        initial_amount_cents: metadata.initial_amount_cents,
                        withdrawn_amount: RpcAmount(metadata.withdrawn_amount),
                        withdrawn_amount_cents: metadata.withdrawn_amount_cents,
                        fees_paid_so_far: RpcAmount(metadata.fees_paid_so_far),
                        first_lock_start_time: to_unix_time(metadata.first_lock_start_time)
                            .expect("Lock start time must be valid"),
                    }
                })
                .collect(),
            timestamp: to_unix_time(value.timestamp).expect("Response timestamp must be valid"),
            is_fetched_from_server: value.is_fetched_from_server,
        }
    }
}

/// We differentiate between "send" and "receive" because in the case of a send
/// we optimistically charge the fee from the send amount (since the amount +
/// fee must already be in the user's possession) and refund the fee in case the
/// operation ends up failing. However, in the case of a receive, we don't
/// always know the amount to be received (in the case of generate_address for
/// example), and even if we do, the amount to be received (from which the fee
/// is to be debited) is not in the user's possession until the
/// operation completes. So for receives, we just record the ppm, and when the
/// operation succeeds, we debit the fee.
#[derive(Debug, Encodable, Decodable, Clone)]
pub enum OperationFediFeeStatus {
    PendingSend { fedi_fee: Amount },
    PendingReceive { fedi_fee_ppm: u64 },
    Success { fedi_fee: Amount },
    FailedSend { fedi_fee: Amount },
    FailedReceive { fedi_fee_ppm: u64 },
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcOperationFediFeeStatus {
    PendingSend {
        fedi_fee: RpcAmount,
    },
    PendingReceive {
        #[ts(type = "number")]
        fedi_fee_ppm: u64,
    },
    Success {
        fedi_fee: RpcAmount,
    },
    FailedSend {
        fedi_fee: RpcAmount,
    },
    FailedReceive {
        #[ts(type = "number")]
        fedi_fee_ppm: u64,
    },
}

impl From<OperationFediFeeStatus> for RpcOperationFediFeeStatus {
    fn from(value: OperationFediFeeStatus) -> Self {
        match value {
            OperationFediFeeStatus::PendingSend { fedi_fee } => {
                RpcOperationFediFeeStatus::PendingSend {
                    fedi_fee: RpcAmount(fedi_fee),
                }
            }
            OperationFediFeeStatus::PendingReceive { fedi_fee_ppm } => {
                RpcOperationFediFeeStatus::PendingReceive { fedi_fee_ppm }
            }
            OperationFediFeeStatus::Success { fedi_fee } => RpcOperationFediFeeStatus::Success {
                fedi_fee: RpcAmount(fedi_fee),
            },
            OperationFediFeeStatus::FailedSend { fedi_fee } => {
                RpcOperationFediFeeStatus::FailedSend {
                    fedi_fee: RpcAmount(fedi_fee),
                }
            }
            OperationFediFeeStatus::FailedReceive { fedi_fee_ppm } => {
                RpcOperationFediFeeStatus::FailedReceive { fedi_fee_ppm }
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcFediFeeSchedule {
    #[ts(type = "number")]
    pub remittance_threshold_msat: u64,
    pub modules: BTreeMap<String, RpcModuleFediFeeSchedule>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcModuleFediFeeSchedule {
    #[ts(type = "number")]
    pub send_ppm: u64,
    #[ts(type = "number")]
    pub receive_ppm: u64,
}

impl From<FediFeeSchedule> for RpcFediFeeSchedule {
    fn from(value: FediFeeSchedule) -> Self {
        Self {
            remittance_threshold_msat: value.remittance_threshold_msat,
            modules: value
                .modules
                .into_iter()
                .map(|(k, v)| {
                    (
                        k.to_string(),
                        RpcModuleFediFeeSchedule {
                            send_ppm: v.send_ppm,
                            receive_ppm: v.receive_ppm,
                        },
                    )
                })
                .collect(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcRegisteredDevice {
    pub device_index: u8,
    pub device_identifier: String,
    #[ts(type = "number")]
    pub last_registration_timestamp: u64,
}

impl From<RegisteredDevice> for RpcRegisteredDevice {
    fn from(value: RegisteredDevice) -> Self {
        Self {
            device_index: value.index,
            device_identifier: value.identifier.to_string(),
            last_registration_timestamp: to_unix_time(value.last_renewed)
                .expect("Registration timestamp must be valid"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcDeviceIndexAssignmentStatus {
    Assigned(u8),
    Unassigned,
}
