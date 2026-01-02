use std::collections::BTreeMap;
use std::fmt;
use std::time::Duration;

use anyhow::anyhow;
use bitcoin::Network;
use bitcoin::secp256k1::ecdsa::Signature;
use bitcoin::secp256k1::schnorr;
use fedimint_core::config::{GlobalClientConfig, JsonWithKind, PeerUrl};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{Amount, TransactionId};
use fedimint_ln_client::pay::GatewayPayError;
use fedimint_ln_client::{LnPayState, LnReceiveState};
use fedimint_mint_client::{ReissueExternalNotesState, SpendOOBState};
use fedimint_wallet_client::{DepositStateV2, WithdrawState};
use matrix::RpcRoomId;
use runtime::api::RegisteredDevice;
use runtime::storage::state::{FediFeeSchedule, FiatFXInfo};
use runtime::utils::to_unix_time;
use serde::de::{self, MapAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use stability_pool_client::common::{SyncResponse, TransferRequestId};
use stability_pool_client::db::CachedSyncResponseValue;
use stability_pool_client_old::ClientAccountInfo;
use ts_rs::TS;

use crate::error::RpcError;

pub mod communities;
pub mod error;
pub mod event;
pub mod matrix;
pub mod multispend;
pub mod nostril;
pub mod sp_transfer;

pub use communities::{CommunityInvite, CommunityInviteV2};

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcInitOpts {
    pub data_dir: Option<String>,
    pub log_level: Option<String>,
    pub device_identifier: String,
    pub app_flavor: RpcAppFlavor,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcAppFlavor {
    Dev,
    Nightly,
    Bravo,
    Tests,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Copy, TS)]
#[ts(export)]
pub struct RpcAmount(#[ts(type = "MSats")] pub fedimint_core::Amount);

impl std::fmt::Display for RpcAmount {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq, Copy)]
#[ts(export)]
pub struct RpcFiatAmount(#[ts(type = "number")] pub u64);

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq, Copy)]
#[ts(export)]
pub struct RpcTransactionId(#[ts(type = "string")] pub TransactionId);

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[ts(export)]
pub struct RpcSignature(#[ts(type = "string")] pub schnorr::Signature);

#[derive(
    Debug,
    Clone,
    Serialize,
    Deserialize,
    Hash,
    PartialEq,
    Eq,
    TS,
    Encodable,
    Decodable,
    PartialOrd,
    Ord,
)]
#[ts(export)]
pub struct RpcEventId(#[ts(type = "string")] pub String);

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFederation {
    pub balance: RpcAmount,
    pub id: RpcFederationId,
    pub network: Option<RpcBitcoinNetwork>,
    pub name: String,
    pub invite_code: String,
    pub meta: BTreeMap<String, String>,
    pub recovering: bool,
    #[ts(type = "Record<string, {url: string, name: string}>")]
    pub nodes: BTreeMap<RpcPeerId, PeerUrl>,
    pub client_config: Option<RpcJsonClientConfig>,
    pub fedi_fee_schedule: RpcFediFeeSchedule,
    pub had_reused_ecash: bool,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "init_state")]
#[ts(export)]
pub enum RpcFederationMaybeLoading {
    Loading {
        id: RpcFederationId,
    },
    Failed {
        error: RpcError,
        id: RpcFederationId,
    },
    Ready(RpcFederation),
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcBitcoinNetwork {
    /// Mainnet Bitcoin.
    Bitcoin,
    /// Bitcoin's testnet network. (In future versions this will be combined
    /// into a single variant containing the version)
    Testnet,
    /// Bitcoin's testnet4 network. (In future versions this will be combined
    /// into a single variant containing the version)
    Testnet4,
    /// Bitcoin's signet network.
    Signet,
    /// Bitcoin's regtest network.
    Regtest,
    Unknown,
}

impl From<Network> for RpcBitcoinNetwork {
    fn from(value: Network) -> Self {
        match value {
            Network::Bitcoin => RpcBitcoinNetwork::Bitcoin,
            Network::Testnet => RpcBitcoinNetwork::Testnet,
            Network::Testnet4 => RpcBitcoinNetwork::Testnet4,
            Network::Signet => RpcBitcoinNetwork::Signet,
            Network::Regtest => RpcBitcoinNetwork::Regtest,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcReturningMemberStatus {
    Unknown,
    NewMember,
    ReturningMember,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFederationPreview {
    pub id: RpcFederationId,
    pub name: String,
    pub meta: BTreeMap<String, String>,
    pub invite_code: String,
    pub returning_member_status: RpcReturningMemberStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum GuardianStatus {
    Online { guardian: String, latency_ms: u32 },
    Error { guardian: String, error: String },
    Timeout { guardian: String, elapsed: String },
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcJsonClientConfig {
    #[ts(type = "unknown")]
    pub global: GlobalClientConfig,
    #[ts(type = "Record<string, unknown>")]
    #[serde(deserialize_with = "deserialize_string_keys_to_u16")]
    pub modules: BTreeMap<u16, JsonWithKind>,
}

// Custom deserialization function for fields with u16 keys that may be in
// string format
fn deserialize_string_keys_to_u16<'de, D>(
    deserializer: D,
) -> Result<BTreeMap<u16, JsonWithKind>, D::Error>
where
    D: Deserializer<'de>,
{
    struct StringKeysToU16Map;

    impl<'de> Visitor<'de> for StringKeysToU16Map {
        type Value = BTreeMap<u16, JsonWithKind>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map with u16 keys that may be strings")
        }

        fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
        where
            M: MapAccess<'de>,
        {
            let mut result = BTreeMap::new();
            while let Some((key, value)) = map.next_entry::<String, JsonWithKind>()? {
                let key: u16 = key.parse().map_err(de::Error::custom)?;
                result.insert(key, value);
            }
            Ok(result)
        }
    }

    deserializer.deserialize_map(StringKeysToU16Map)
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcDuration {
    #[ts(type = "number")]
    pub nanos: u64,
    #[ts(type = "number")]
    pub secs: u64,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RpcStabilityPoolConfig {
    pub kind: String,
    pub min_allowed_seek: RpcAmount,
    pub max_allowed_provide_fee_rate_ppb: Option<u32>,
    pub min_allowed_cancellation_bps: Option<u32>,
    pub cycle_duration: RpcDuration,
}

#[derive(Debug, Eq, PartialEq, Hash, Serialize, Deserialize, Clone, TS, Encodable, Decodable)]
#[ts(export)]
pub struct RpcFederationId(pub String);

#[derive(Debug, TS, Serialize, Deserialize)]
#[ts(export)]
pub struct RpcOperationId(#[ts(type = "string")] pub fedimint_core::core::OperationId);

impl From<fedimint_core::core::OperationId> for RpcOperationId {
    fn from(value: fedimint_core::core::OperationId) -> Self {
        Self(fedimint_core::core::OperationId(value.0))
    }
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "federation_type")]
#[ts(export)]
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
#[ts(export)]
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
            lightning_invoice::Bolt11InvoiceDescriptionRef::Direct(desc) => desc.to_string(),
            lightning_invoice::Bolt11InvoiceDescriptionRef::Hash(_) => "".to_string(),
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
#[ts(export)]
pub struct RpcFeeDetails {
    pub fedi_fee: RpcAmount,
    pub network_fee: RpcAmount,
    pub federation_fee: RpcAmount,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcPayInvoiceResponse {
    pub preimage: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcGenerateEcashResponse {
    pub ecash: String,
    #[ts(type = "number")]
    pub cancel_at: u64,
    pub operation_id: RpcOperationId,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcPayAddressResponse {
    pub txid: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
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
#[ts(export)]
pub struct RpcRecoveryId(#[ts(type = "string")] pub fedi_social_client::common::RecoveryId);

#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SocialRecoveryQr {
    pub recovery_id: RpcRecoveryId,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SocialRecoveryApproval {
    // FIXME: perhaps this should be peer id and client can look up the name ???
    pub guardian_name: String,
    pub approved: bool,
}

#[derive(Debug, Eq, Ord, PartialOrd, PartialEq, Serialize, Clone, Copy, TS)]
#[ts(export)]
pub struct RpcPeerId(#[ts(type = "string")] pub fedimint_core::PeerId);

impl<'de> Deserialize<'de> for RpcPeerId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        value
            .parse::<u16>()
            .map(|arg0: u16| RpcPeerId(arg0.into()))
            .map_err(serde::de::Error::custom)
    }
}

impl fmt::Display for RpcPeerId {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    TS,
    PartialEq,
    Eq,
    Hash,
    Encodable,
    Decodable,
    Ord,
    PartialOrd,
)]
#[ts(export)]
pub struct RpcPublicKey(#[ts(type = "string")] pub bitcoin::secp256k1::PublicKey);

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcSignedLnurlMessage {
    #[ts(type = "string")]
    pub signature: Signature,
    pub pubkey: RpcPublicKey,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcMediaUploadParams {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub mime_type: String,
}

#[derive(
    Debug, Clone, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize, TS, Encodable, Decodable,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcTransactionDirection {
    Receive,
    Send,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcTransaction {
    pub id: String,
    pub amount: RpcAmount,
    pub fedi_fee_status: Option<RpcOperationFediFeeStatus>,
    pub txn_notes: Option<String>,
    pub tx_date_fiat_info: Option<FiatFXInfo>,
    pub frontend_metadata: FrontendMetadata,
    #[serde(flatten)]
    pub kind: RpcTransactionKind,
    /// time when this operation was settled.
    #[ts(type = "number | null")]
    pub outcome_time: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcTransactionListEntry {
    #[ts(type = "number")]
    pub created_at: u64,
    #[serde(flatten)]
    pub transaction: RpcTransaction,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
#[ts(export)]
pub enum RpcTransactionKind {
    LnPay {
        ln_invoice: String,
        lightning_fees: RpcAmount,
        state: Option<RpcLnPayState>,
    },
    LnReceive {
        ln_invoice: String,
        state: Option<RpcLnReceiveState>,
    },
    LnRecurringdReceive {
        state: Option<RpcLnReceiveState>,
    },
    OnchainWithdraw {
        onchain_address: String,
        onchain_fees: RpcAmount,
        #[ts(type = "number")]
        onchain_fee_rate: u64,
        state: Option<RpcOnchainWithdrawState>,
    },
    OnchainDeposit {
        onchain_address: String,
        state: Option<RpcOnchainDepositState>,
    },
    OobSend {
        state: Option<RpcOOBSpendState>,
    },
    OobReceive {
        state: Option<RpcOOBReissueState>,
    },
    SpDeposit {
        state: RpcSPDepositState,
    },
    SpWithdraw {
        state: Option<RpcSPWithdrawState>,
    },
    SPV2Deposit {
        state: RpcSPV2DepositState,
    },
    SPV2Withdrawal {
        state: RpcSPV2WithdrawalState,
    },
    SPV2TransferOut {
        state: RpcSPV2TransferOutState,
    },
    SPV2TransferIn {
        state: RpcSPV2TransferInState,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcSPDepositState {
    PendingDeposit,
    CompleteDeposit {
        #[ts(type = "number")]
        initial_amount_cents: u64,
        fees_paid_so_far: RpcAmount,
    },
    DataNotInCache,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcSPV2DepositState {
    PendingDeposit {
        amount: RpcAmount,
        #[ts(type = "number")]
        fiat_amount: u64,
    },
    CompletedDeposit {
        amount: RpcAmount,
        #[ts(type = "number")]
        fiat_amount: u64,
        fees_paid_so_far: RpcAmount,
    },
    FailedDeposit {
        error: String,
    },
    DataNotInCache,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcSPWithdrawState {
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
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcSPV2WithdrawalState {
    PendingWithdrawal {
        amount: RpcAmount,
        #[ts(type = "number")]
        fiat_amount: u64,
    },
    CompletedWithdrawal {
        amount: RpcAmount,
        #[ts(type = "number")]
        fiat_amount: u64,
    },
    FailedWithdrawal {
        error: String,
    },
    DataNotInCache,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SpV2TransferOutKind {
    Multispend,
    MatrixSpTransfer,
    SpTransferUi,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SpV2TransferInKind {
    Multispend,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcSPV2TransferOutState {
    CompletedTransfer {
        to_account_id: String,
        amount: RpcAmount,
        #[ts(type = "number")]
        fiat_amount: u64,
        kind: SpV2TransferOutKind,
    },
    DataNotInCache,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcSPV2TransferInState {
    CompletedTransfer {
        from_account_id: String,
        amount: RpcAmount,
        #[ts(type = "number")]
        fiat_amount: u64,
        kind: SpV2TransferInKind,
    },
    DataNotInCache,
}

impl From<DepositStateV2> for RpcOnchainDepositState {
    fn from(value: DepositStateV2) -> Self {
        match value {
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
        }
    }
}

impl From<WithdrawState> for RpcOnchainWithdrawState {
    fn from(state: WithdrawState) -> Self {
        match state {
            WithdrawState::Created => RpcOnchainWithdrawState::Created,
            WithdrawState::Succeeded(txid) => RpcOnchainWithdrawState::Succeeded {
                txid: txid.to_string(),
            },
            WithdrawState::Failed(error) => RpcOnchainWithdrawState::Failed { error },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum RpcOnchainDepositState {
    WaitingForTransaction,
    WaitingForConfirmation(RpcOnchainDepositTransactionData),
    Confirmed(RpcOnchainDepositTransactionData),
    Claimed(RpcOnchainDepositTransactionData),
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
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
#[ts(export)]
pub enum RpcOnchainWithdrawState {
    Created,
    Succeeded { txid: String },
    Failed { error: String },
}

impl From<LnReceiveState> for RpcLnReceiveState {
    fn from(state: LnReceiveState) -> Self {
        match state {
            LnReceiveState::Created => RpcLnReceiveState::Created,
            LnReceiveState::WaitingForPayment { invoice, timeout } => {
                RpcLnReceiveState::WaitingForPayment { invoice, timeout }
            }
            LnReceiveState::Canceled { reason } => RpcLnReceiveState::Canceled {
                reason: reason.to_string(),
            },
            LnReceiveState::Funded => RpcLnReceiveState::Funded,
            LnReceiveState::AwaitingFunds => RpcLnReceiveState::AwaitingFunds,
            LnReceiveState::Claimed => RpcLnReceiveState::Claimed,
        }
    }
}

impl From<LnPayState> for RpcLnPayState {
    fn from(state: LnPayState) -> Self {
        match state {
            LnPayState::Created => RpcLnPayState::Created,
            LnPayState::Canceled => RpcLnPayState::Canceled,
            LnPayState::Funded { block_height } => RpcLnPayState::Funded { block_height },
            LnPayState::WaitingForRefund { error_reason } => {
                RpcLnPayState::WaitingForRefund { error_reason }
            }
            LnPayState::AwaitingChange => RpcLnPayState::AwaitingChange,
            LnPayState::Success { preimage } => RpcLnPayState::Success { preimage },
            LnPayState::Refunded { gateway_error } => RpcLnPayState::Refunded { gateway_error },
            LnPayState::UnexpectedError { .. } => RpcLnPayState::Failed,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
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
#[ts(export)]
pub enum RpcOOBState {
    Spend(RpcOOBSpendState),
    Reissue(RpcOOBReissueState),
}
#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
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
#[ts(export)]
pub enum RpcOOBReissueState {
    Created,
    Issuing,
    Done,
    Failed { error: String },
}

impl From<SpendOOBState> for RpcOOBSpendState {
    fn from(state: SpendOOBState) -> Self {
        match state {
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
            fedimint_mint_client::SpendOOBState::Success => RpcOOBSpendState::Success,
            fedimint_mint_client::SpendOOBState::Refunded => RpcOOBSpendState::Refunded,
        }
    }
}

impl From<ReissueExternalNotesState> for RpcOOBReissueState {
    fn from(state: ReissueExternalNotesState) -> Self {
        match state {
            fedimint_mint_client::ReissueExternalNotesState::Created => RpcOOBReissueState::Created,
            fedimint_mint_client::ReissueExternalNotesState::Issuing => RpcOOBReissueState::Issuing,
            fedimint_mint_client::ReissueExternalNotesState::Done => RpcOOBReissueState::Done,
            fedimint_mint_client::ReissueExternalNotesState::Failed(error) => {
                RpcOOBReissueState::Failed { error }
            }
        }
    }
}

#[derive(Serialize, Deserialize, Default, Debug, TS, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FrontendMetadata {
    pub initial_notes: Option<String>,
    pub recipient_matrix_id: Option<String>,
    pub sender_matrix_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(untagged)]
/// Use this meta unless a specific metadata is defined for that transaction.
pub enum BaseMetadata {
    // Maps to null in json
    Legacy,
    // Maps to object in json
    Default {
        frontend_metadata: Option<FrontendMetadata>,
    },
}

impl From<FrontendMetadata> for BaseMetadata {
    fn from(value: FrontendMetadata) -> Self {
        Self::Default {
            frontend_metadata: Some(value),
        }
    }
}

impl From<BaseMetadata> for Option<FrontendMetadata> {
    fn from(value: BaseMetadata) -> Self {
        match value {
            BaseMetadata::Legacy => None,
            BaseMetadata::Default { frontend_metadata } => frontend_metadata,
        }
    }
}

impl Default for BaseMetadata {
    fn default() -> Self {
        BaseMetadata::Default {
            frontend_metadata: None,
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EcashReceiveMetadata {
    pub internal: bool,
    pub frontend_metadata: Option<FrontendMetadata>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EcashSendMetadata {
    pub internal: bool,
    pub frontend_metadata: Option<FrontendMetadata>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LightningSendMetadata {
    pub is_fedi_fee_remittance: bool,
    pub frontend_metadata: Option<FrontendMetadata>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind")]
pub enum SPv2WithdrawMetadata {
    /// Automatically by sweeping service
    Sweeper,
    /// User triggered action in stable balance ui
    StableBalance {
        frontend_metadata: Option<FrontendMetadata>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind")]
pub enum SPv2TransferMetadata {
    /// User triggered action in stable balance ui
    StableBalance {
        frontend_metadata: Option<FrontendMetadata>,
    },
    /// Deposit into multispend account
    MultispendDeposit {
        room: RpcRoomId,
        description: String,
        frontend_metadata: Option<FrontendMetadata>,
    },
    /// Withdraw from multispend account
    MultispendWithdrawal {
        room: RpcRoomId,
        request_id: RpcEventId,
    },
    /// Matrix SP transfer person-to-person transfer
    MatrixSpTransfer {
        room: RpcRoomId,
        pending_transfer_id: RpcEventId,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind")]
pub enum SPv2DepositMetadata {
    /// User triggered action in stable balance ui
    StableBalance {
        frontend_metadata: Option<FrontendMetadata>,
    },
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
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
#[ts(export)]
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

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcSPv2CachedSyncResponse {
    #[ts(type = "number")]
    pub fetch_time: u64,
    #[serde(flatten)]
    pub sync_response: RpcSPv2SyncResponse,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcSPv2SyncResponse {
    #[ts(type = "number")]
    pub curr_cycle_idx: u64,
    #[ts(type = "number")]
    pub curr_cycle_start_time: u64,
    #[ts(type = "number")]
    pub curr_cycle_start_price: u64,
    pub staged_balance: RpcAmount,
    pub locked_balance: RpcAmount,
    pub idle_balance: RpcAmount,
    #[ts(type = "number | null")]
    pub pending_unlock_request: Option<u64>,
}

impl From<CachedSyncResponseValue> for RpcSPv2CachedSyncResponse {
    fn from(value: CachedSyncResponseValue) -> Self {
        Self {
            fetch_time: to_unix_time(value.fetch_time).expect("fetch time must be valid"),
            sync_response: value.value.into(),
        }
    }
}

impl From<SyncResponse> for RpcSPv2SyncResponse {
    fn from(value: SyncResponse) -> Self {
        Self {
            curr_cycle_idx: value.current_cycle.idx,
            curr_cycle_start_time: to_unix_time(value.current_cycle.start_time)
                .expect("cycle time must be valid"),
            curr_cycle_start_price: value.current_cycle.start_price.0,
            staged_balance: RpcAmount(value.staged_balance),
            locked_balance: RpcAmount(value.locked_balance),
            idle_balance: RpcAmount(value.idle_balance),
            pending_unlock_request: value.unlock_request.map(|r| r.total_fiat_requested.0),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NetworkError {}

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
#[ts(export)]
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
#[ts(export)]
pub struct RpcFediFeeSchedule {
    #[ts(type = "number")]
    pub remittance_threshold_msat: u64,
    pub modules: BTreeMap<String, RpcModuleFediFeeSchedule>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
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
#[ts(export)]
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
#[ts(export)]
pub enum RpcDeviceIndexAssignmentStatus {
    Assigned(u8),
    Unassigned,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RpcTransferRequestId(#[ts(type = "string")] pub TransferRequestId);

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RpcPrevPayInvoiceResult {
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcParseInviteCodeResult {
    pub federation_id: RpcFederationId,
}
