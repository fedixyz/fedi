#![allow(non_snake_case, non_camel_case_types)]
use std::panic::PanicHookInfo;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use anyhow::Context;
use bitcoin::secp256k1::Message;
use bitcoin::Amount;
use fedi_bug_report::reused_ecash_proofs::SerializedReusedEcashProofs;
use fedimint_client::db::ChronologicalOperationLogKey;
use fedimint_core::core::OperationId;
use fedimint_core::timing::TimeReporter;
use futures::Future;
use lightning_invoice::Bolt11Invoice;
use macro_rules_attribute::macro_rules_derive;
use matrix_sdk::ruma::api::client::authenticated_media::get_media_preview;
use matrix_sdk::ruma::api::client::profile::get_profile;
use matrix_sdk::ruma::api::client::push::Pusher;
use matrix_sdk::ruma::directory::PublicRoomsChunk;
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use matrix_sdk::ruma::events::room::MediaSource;
use matrix_sdk::ruma::OwnedEventId;
use matrix_sdk::RoomInfo;
use mime::Mime;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use stability_pool_client::common::{FiatAmount, FiatOrAll};
pub use tokio;
use tracing::{error, info, instrument, Level};

use super::bridge::Bridge;
use super::error::ErrorCode;
use super::storage::Storage;
use super::types::{
    RpcAmount, RpcFederation, RpcFederationId, RpcInvoice, RpcOperationId, RpcPayInvoiceResponse,
    RpcPeerId, RpcPublicKey, RpcRecoveryId, RpcSignedLnurlMessage, RpcStabilityPoolAccountInfo,
    SocialRecoveryQr,
};
use crate::api::IFediApi;
use crate::bridge::{BridgeFull, BridgeRuntime};
use crate::constants::{GLOBAL_MATRIX_SERVER, GLOBAL_MATRIX_SLIDING_SYNC_PROXY};
use crate::error::RpcError;
use crate::event::{Event, EventSink, IEventSink, PanicEvent, SocialRecoveryEvent, TypedEventExt};
use crate::features::FeatureCatalog;
use crate::federation::federation_sm::FederationState;
use crate::federation::federation_v2::{BackupServiceStatus, FederationV2};
use crate::federation::Federations;
use crate::matrix::{
    self, Matrix, RpcBackPaginationStatus, RpcMatrixAccountSession, RpcMatrixUploadResult,
    RpcMatrixUserDirectorySearchResponse, RpcRoomId, RpcRoomMember, RpcRoomNotificationMode,
    RpcSyncIndicator, RpcTimelineEventItemId, RpcTimelineItem, RpcUserId,
};
use crate::observable::{Observable, ObservableVec};
use crate::storage::{DeviceIdentifier, FiatFXInfo};
use crate::types::{
    federation_v2_to_rpc_federation, FrontendMetadata, GuardianStatus, RpcBridgeStatus,
    RpcCommunity, RpcDeviceIndexAssignmentStatus, RpcEcashInfo, RpcFederationMaybeLoading,
    RpcFederationPreview, RpcFeeDetails, RpcGenerateEcashResponse, RpcLightningGateway,
    RpcMediaUploadParams, RpcNostrPubkey, RpcNostrSecret, RpcPayAddressResponse,
    RpcRegisteredDevice, RpcSPv2CachedSyncResponse, RpcTransaction, RpcTransactionDirection,
    RpcTransactionListEntry,
};

#[derive(Debug, thiserror::Error)]
pub enum FedimintError {
    #[error("{0}")]
    OtherError(#[from] anyhow::Error),
}

pub async fn fedimint_initialize_async(
    storage: Storage,
    event_sink: EventSink,
    fedi_api: Arc<dyn IFediApi>,
    device_identifier: String,
    feature_catalog: Arc<FeatureCatalog>,
) -> anyhow::Result<Arc<Bridge>> {
    info!(
        "bridge version hash={}",
        env!("FEDIMINT_BUILD_CODE_VERSION")
    );
    let _g = TimeReporter::new("fedimint_initialize").level(Level::INFO);

    let device_identifier = DeviceIdentifier::from_str(&device_identifier)?;
    let runtime = BridgeRuntime::new(
        storage,
        event_sink,
        fedi_api,
        device_identifier.clone(),
        feature_catalog,
    )
    .await
    .context("Failed to create runtime for bridge")?;

    let bridge = Bridge::new(runtime.into(), device_identifier).await;
    Ok(bridge)
}

pub fn rpc_error_json(error: &anyhow::Error) -> String {
    serde_json::to_string(&RpcError::from_anyhow(error)).unwrap()
}

pub fn panic_hook(info: &PanicHookInfo, event_sink: &dyn IEventSink) {
    event_sink.typed_event(&Event::Panic(PanicEvent {
        message: info.to_string(),
    }))
}

use ts_rs::TS;

/// Try extract a T out of Self, see all impls for usage
trait TryGet<T> {
    fn try_get(self) -> anyhow::Result<T>;
}

impl<'a> TryGet<&'a Bridge> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a Bridge> {
        Ok(self)
    }
}

impl<'a> TryGet<&'a BridgeFull> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a BridgeFull> {
        self.full()
    }
}

impl TryGet<Arc<BridgeRuntime>> for &Bridge {
    fn try_get(self) -> anyhow::Result<Arc<BridgeRuntime>> {
        Ok(self.runtime().clone())
    }
}

impl<'a> TryGet<&'a Federations> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a Federations> {
        Ok(&self.full()?.federations)
    }
}

impl<'a> TryGet<&'a Matrix> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a Matrix> {
        self.full()?
            .matrix
            .get()
            .context(ErrorCode::MatrixNotInitialized)
    }
}

macro_rules! rpc_method {
    (
        $vis:vis async fn $name:ident (
            $bridge:ident: $bridge_ty:ty
            $(
                ,$arg_name:ident: $arg_ty:ty
            )*
            $(,)?
        ) -> anyhow::Result<$ret:ty>

        $body:block
    ) => {
        mod $name {
            use super::*;
            pub mod args {
                use super::*;
                #[derive(Debug, Deserialize, TS)]
                #[serde(rename_all = "camelCase")]
                #[ts(export)]
                pub struct $name {
                    // ts-rs doesn't like empty structs, so we add empty field
                    #[serde(skip)]
                    pub _empty: (),
                $(
                    pub $arg_name: $arg_ty,
                )*
                }
            }
            pub type Return = $ret;
            pub async fn handle(bridge: Arc<Bridge>, $name::args::$name { $( $arg_name, )* .. }: $name::args::$name) -> anyhow::Result<$ret> {
                super::$name(bridge.try_get()?, $($arg_name),*).await
            }
        }

    };
}

macro_rules! federation_rpc_method {
    (
    $vis:vis async fn $name:ident (
        $federation:ident: $federation_ty:ty
        $(
            ,$arg_name:ident: $arg_ty:ty
        )*
        $(,)?
    ) -> anyhow::Result<$ret:ty>

    $body:block
    ) => {
        mod $name {
            use super::*;
            pub mod args {
                use super::*;
                #[derive(Debug, Deserialize, TS)]
                #[serde(rename_all = "camelCase")]
                #[ts(export)]
                pub struct $name {
                    pub federation_id: RpcFederationId,
                    #[serde(skip)]
                    pub _empty: (),
                $(
                    pub $arg_name: $arg_ty,
                )*
                }
            }

            pub type Return = $ret;
            pub async fn handle(bridge: Arc<Bridge>, $name::args::$name { federation_id, $( $arg_name, )* .. }: $name::args::$name) -> anyhow::Result<$ret> {
                let $federation = bridge.full()?.federations.get_federation(&federation_id.0)?;
                tracing::Span::current().record("federation_id", &federation_id.0);
                super::$name($federation, $($arg_name),*).await
            }
        }
    };
}

macro_rules! federation_recovering_rpc_method {
    (
    $vis:vis async fn $name:ident (
        $federation:ident: $federation_ty:ty
        $(
            ,$arg_name:ident: $arg_ty:ty
        )*
        $(,)?
    ) -> anyhow::Result<$ret:ty>

    $body:block
    ) => {
        mod $name {
            use super::*;
            pub mod args {
                use super::*;
                #[derive(Debug, Deserialize, TS)]
                #[serde(rename_all = "camelCase")]
                #[ts(export)]
                pub struct $name {
                    pub federation_id: RpcFederationId,
                    #[serde(skip)]
                    pub _empty: (),
                $(
                    pub $arg_name: $arg_ty,
                )*
                }
            }

            pub type Return = $ret;
            pub async fn handle(bridge: Arc<Bridge>, $name::args::$name { federation_id, $( $arg_name, )* .. }: $name::args::$name) -> anyhow::Result<$ret> {
                let $federation = bridge.full()?.federations.get_federation_maybe_recovering(&federation_id.0)?;
                tracing::Span::current().record("federation_id", &federation_id.0);
                super::$name($federation, $($arg_name),*).await
            }
        }
    };
}

#[macro_rules_derive(federation_recovering_rpc_method!)]
async fn getGuardianStatus(federation: Arc<FederationV2>) -> anyhow::Result<Vec<GuardianStatus>> {
    federation.guardian_status().await
}

#[macro_rules_derive(rpc_method!)]
async fn joinFederation(
    federations: &Federations,
    invite_code: String,
    recover_from_scratch: bool,
) -> anyhow::Result<RpcFederation> {
    info!("joining federation {:?}", invite_code);
    let fed_arc = federations
        .join_federation(invite_code, recover_from_scratch)
        .await?;
    Ok(federation_v2_to_rpc_federation(&fed_arc).await)
}

#[macro_rules_derive(rpc_method!)]
async fn federationPreview(
    federations: &Federations,
    invite_code: String,
) -> anyhow::Result<RpcFederationPreview> {
    federations.federation_preview(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn listFederations(
    federations: &Federations,
) -> anyhow::Result<Vec<RpcFederationMaybeLoading>> {
    let feds_map = federations.get_federations_map();
    let mut feds_list = vec![];

    for (id, fed_state) in feds_map {
        let id = RpcFederationId(id);
        feds_list.push(match fed_state {
            FederationState::Loading => RpcFederationMaybeLoading::Loading { id },
            FederationState::Ready(fed_arc) | FederationState::Recovering(fed_arc) => {
                RpcFederationMaybeLoading::Ready(federation_v2_to_rpc_federation(&fed_arc).await)
            }
            FederationState::Failed(err_arc) => RpcFederationMaybeLoading::Failed {
                id,
                error: RpcError::from_anyhow(&err_arc),
            },
        });
    }

    Ok(feds_list)
}

#[macro_rules_derive(rpc_method!)]
async fn leaveFederation(
    federations: &Federations,
    federation_id: RpcFederationId,
) -> anyhow::Result<()> {
    federations.leave_federation(&federation_id.0).await
}

// TODO: generateInvoice should return OperationId
// so frontend can subscribe to the operation.
// TODO: actually return the RpcInvoice (frontend expects string)
#[macro_rules_derive(federation_rpc_method!)]
async fn generateInvoice(
    federation: Arc<FederationV2>,
    amount: RpcAmount,
    description: String,
    expiry: Option<u32>,
    frontend_metadata: FrontendMetadata,
) -> anyhow::Result<String> {
    let rpc_invoice = federation
        .generate_invoice(
            amount,
            description,
            expiry.map(|x| x.into()),
            frontend_metadata,
        )
        .await?;
    Ok(rpc_invoice.invoice)
}

#[macro_rules_derive(rpc_method!)]
// FIXME: make this argument RpcInvoice?
async fn decodeInvoice(
    federations: &Federations,
    federation_id: Option<RpcFederationId>,
    invoice: String,
) -> anyhow::Result<RpcInvoice> {
    // TODO: validate the invoice (same network, haven't already paid, etc)
    if let Some(federation_id) = federation_id {
        let federation = federations.get_federation(&federation_id.0)?;
        federation.decode_invoice(invoice).await
    } else {
        let invoice: Bolt11Invoice = invoice.trim().parse().context(ErrorCode::InvalidInvoice)?;
        let bridge_invoice = RpcInvoice::try_from(invoice)?;
        Ok(bridge_invoice)
    }
}

#[macro_rules_derive(federation_rpc_method!)]
async fn payInvoice(
    federation: Arc<FederationV2>,
    invoice: String,
    frontend_metadata: FrontendMetadata,
) -> anyhow::Result<RpcPayInvoiceResponse> {
    let invoice: Bolt11Invoice = invoice.trim().parse().context(ErrorCode::InvalidInvoice)?;
    federation.pay_invoice(&invoice, frontend_metadata).await
}

#[macro_rules_derive(federation_recovering_rpc_method!)]
async fn listGateways(federation: Arc<FederationV2>) -> anyhow::Result<Vec<RpcLightningGateway>> {
    federation.list_gateways().await
}

#[macro_rules_derive(federation_recovering_rpc_method!)]
async fn switchGateway(
    federation: Arc<FederationV2>,
    gateway_id: RpcPublicKey,
) -> anyhow::Result<()> {
    federation.switch_gateway(&gateway_id.0).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn generateAddress(
    federation: Arc<FederationV2>,
    frontend_metadata: FrontendMetadata,
) -> anyhow::Result<String> {
    federation.generate_address(frontend_metadata).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn recheckPeginAddress(
    federation: Arc<FederationV2>,
    operation_id: RpcOperationId,
) -> anyhow::Result<()> {
    federation.recheck_pegin_address(operation_id.0).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn previewPayAddress(
    federation: Arc<FederationV2>,
    address: String,
    // TODO: parse this as bitcoin::Amount
    sats: u64,
) -> anyhow::Result<RpcFeeDetails> {
    let address = address.trim().parse().context("Invalid Bitcoin Address")?;
    let amount: Amount = Amount::from_sat(sats);
    federation.preview_pay_address(address, amount).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn payAddress(
    federation: Arc<FederationV2>,
    address: String,
    // TODO: parse this as bitcoin::Amount
    sats: u64,
    frontend_metadata: FrontendMetadata,
) -> anyhow::Result<RpcPayAddressResponse> {
    let address = address.trim().parse().context("Invalid Bitcoin Address")?;
    let amount: Amount = Amount::from_sat(sats);
    federation
        .pay_address(address, amount, frontend_metadata)
        .await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn generateEcash(
    federation: Arc<FederationV2>,
    amount: RpcAmount,
    include_invite: bool,
    frontend_metadata: FrontendMetadata,
) -> anyhow::Result<RpcGenerateEcashResponse> {
    federation
        .generate_ecash(amount.0, include_invite, frontend_metadata)
        .await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn receiveEcash(
    federation: Arc<FederationV2>,
    // TODO: better type
    ecash: String,
    frontend_metadata: FrontendMetadata,
) -> anyhow::Result<(RpcAmount, RpcOperationId)> {
    federation
        .receive_ecash(ecash, frontend_metadata)
        .await
        .map(|(amt, op)| (RpcAmount(amt), RpcOperationId(op)))
}
#[macro_rules_derive(rpc_method!)]
async fn validateEcash(bridge: &BridgeFull, ecash: String) -> anyhow::Result<RpcEcashInfo> {
    bridge.validate_ecash(ecash).await
}

#[macro_rules_derive(rpc_method!)]
async fn updateCachedFiatFXInfo(
    runtime: Arc<BridgeRuntime>,
    fiat_code: String,
    btc_to_fiat_hundredths: u64,
) -> anyhow::Result<()> {
    runtime
        .update_cached_fiat_fx_info(FiatFXInfo {
            fiat_code,
            btc_to_fiat_hundredths,
        })
        .await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn getTransaction(
    federation: Arc<FederationV2>,
    operation_id: RpcOperationId,
) -> anyhow::Result<RpcTransaction> {
    federation.get_transaction(operation_id.0).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn listTransactions(
    federation: Arc<FederationV2>,
    start_time: Option<u32>,
    limit: Option<u32>,
) -> anyhow::Result<Vec<RpcTransactionListEntry>> {
    let txs = federation
        .list_transactions(
            limit.map_or(usize::MAX, |l| l as usize),
            start_time.map(|t| ChronologicalOperationLogKey {
                creation_time: UNIX_EPOCH + Duration::from_secs(t as u64),
                operation_id: OperationId::new_random(),
            }),
        )
        .await;
    Ok(txs)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn cancelEcash(
    federation: Arc<FederationV2>,
    // TODO: better type
    ecash: String,
) -> anyhow::Result<()> {
    federation.cancel_ecash(ecash.parse()?).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn updateTransactionNotes(
    federation: Arc<FederationV2>,
    transaction_id: String,
    notes: String,
) -> anyhow::Result<()> {
    federation
        .update_transaction_notes(transaction_id.parse()?, notes)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn getMnemonic(runtime: Arc<BridgeRuntime>) -> anyhow::Result<Vec<String>> {
    runtime.get_mnemonic_words().await
}

#[macro_rules_derive(rpc_method!)]
async fn checkMnemonic(runtime: Arc<BridgeRuntime>, mnemonic: Vec<String>) -> anyhow::Result<bool> {
    Ok(runtime.get_mnemonic_words().await? == mnemonic)
}

// TODO: maybe call this "loadMnemonic" or something?
#[macro_rules_derive(rpc_method!)]
async fn recoverFromMnemonic(
    bridge: &BridgeFull,
    mnemonic: Vec<String>,
) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
    bridge
        .recover_from_mnemonic(mnemonic.join(" ").parse()?)
        .await
}

pub const RECOVERY_FILENAME: &str = "backup.fedi";
pub const VERIFICATION_FILENAME: &str = "verification.mp4";

#[macro_rules_derive(rpc_method!)]
async fn uploadBackupFile(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    video_file_path: PathBuf,
) -> anyhow::Result<PathBuf> {
    bridge
        .upload_backup_file(federation_id, video_file_path)
        .await
}

// This method is a bit of a stopgap ...
#[macro_rules_derive(rpc_method!)]
async fn locateRecoveryFile(runtime: Arc<BridgeRuntime>) -> anyhow::Result<PathBuf> {
    let storage = runtime.storage.clone();
    Ok(storage.platform_path(RECOVERY_FILENAME.as_ref()))
}

#[macro_rules_derive(rpc_method!)]
async fn validateRecoveryFile(bridge: &BridgeFull, path: PathBuf) -> anyhow::Result<()> {
    bridge.validate_recovery_file(path).await
}

// FIXME: maybe this would better be called "begin_social_recovery"
#[macro_rules_derive(rpc_method!)]
async fn recoveryQr(bridge: &BridgeFull) -> anyhow::Result<Option<SocialRecoveryQr>> {
    bridge.recovery_qr().await
}

#[macro_rules_derive(rpc_method!)]
async fn cancelSocialRecovery(bridge: &BridgeFull) -> anyhow::Result<()> {
    bridge.cancel_social_recovery().await
}

#[macro_rules_derive(rpc_method!)]
async fn socialRecoveryApprovals(bridge: &BridgeFull) -> anyhow::Result<SocialRecoveryEvent> {
    bridge.social_recovery_approvals().await
}

#[macro_rules_derive(rpc_method!)]
async fn socialRecoveryDownloadVerificationDoc(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    recovery_id: RpcRecoveryId,
    peer_id: RpcPeerId,
) -> anyhow::Result<Option<PathBuf>> {
    bridge
        .download_verification_doc(federation_id, recovery_id, peer_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn approveSocialRecoveryRequest(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    recovery_id: RpcRecoveryId,
    peer_id: RpcPeerId,
    password: String,
) -> anyhow::Result<()> {
    bridge
        .approve_social_recovery_request(federation_id, recovery_id, peer_id, password)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn completeSocialRecovery(bridge: &BridgeFull) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
    bridge.complete_social_recovery().await
}

#[macro_rules_derive(rpc_method!)]
async fn signLnurlMessage(
    runtime: Arc<BridgeRuntime>,
    // hex-encoded message
    message: String,
    domain: String,
) -> anyhow::Result<RpcSignedLnurlMessage> {
    let message = Message::from_digest_slice(&hex::decode(message)?)?;
    runtime.sign_lnurl_message(message, domain).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn backupNow(federation: Arc<FederationV2>) -> anyhow::Result<()> {
    federation.backup().await?;
    Ok(())
}

#[macro_rules_derive(federation_rpc_method!)]
async fn backupStatus(federation: Arc<FederationV2>) -> anyhow::Result<BackupServiceStatus> {
    federation.backup_status().await
}

#[macro_rules_derive(rpc_method!)]
async fn fedimintVersion(_bridge: &Bridge) -> anyhow::Result<String> {
    Ok(fedimint_core::version::cargo_pkg().to_string())
}

#[macro_rules_derive(rpc_method!)]
async fn getNostrSecret(runtime: Arc<BridgeRuntime>) -> anyhow::Result<RpcNostrSecret> {
    runtime.get_nostr_secret().await
}

#[macro_rules_derive(rpc_method!)]
async fn getNostrPubkey(runtime: Arc<BridgeRuntime>) -> anyhow::Result<RpcNostrPubkey> {
    runtime.get_nostr_pubkey().await
}

#[macro_rules_derive(rpc_method!)]
async fn signNostrEvent(runtime: Arc<BridgeRuntime>, event_hash: String) -> anyhow::Result<String> {
    runtime.sign_nostr_event(event_hash).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn stabilityPoolAccountInfo(
    federation: Arc<FederationV2>,
    force_update: bool,
) -> anyhow::Result<RpcStabilityPoolAccountInfo> {
    federation
        .stability_pool_account_info(force_update)
        .await
        .map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn stabilityPoolNextCycleStartTime(federation: Arc<FederationV2>) -> anyhow::Result<u64> {
    federation.stability_pool_next_cycle_start_time().await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn stabilityPoolCycleStartPrice(federation: Arc<FederationV2>) -> anyhow::Result<u64> {
    federation.stability_pool_cycle_start_price().await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn stabilityPoolAverageFeeRate(
    federation: Arc<FederationV2>,
    num_cycles: u32,
) -> anyhow::Result<u64> {
    federation
        .stability_pool_average_fee_rate(num_cycles.into())
        .await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn stabilityPoolAvailableLiquidity(
    federation: Arc<FederationV2>,
) -> anyhow::Result<RpcAmount> {
    federation.stability_pool_available_liquidity().await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn stabilityPoolDepositToSeek(
    federation: Arc<FederationV2>,
    amount: RpcAmount,
) -> anyhow::Result<RpcOperationId> {
    federation
        .stability_pool_deposit_to_seek(amount.0)
        .await
        .map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn stabilityPoolWithdraw(
    federation: Arc<FederationV2>,
    unlocked_amount: RpcAmount,
    locked_bps: u32,
) -> anyhow::Result<RpcOperationId> {
    federation
        .stability_pool_withdraw(unlocked_amount.0, locked_bps)
        .await
        .map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2AccountInfo(
    federation: Arc<FederationV2>,
) -> anyhow::Result<RpcSPv2CachedSyncResponse> {
    federation.spv2_account_info().await.map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2NextCycleStartTime(federation: Arc<FederationV2>) -> anyhow::Result<u64> {
    federation.spv2_next_cycle_start_time().await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2AverageFeeRate(federation: Arc<FederationV2>, num_cycles: u32) -> anyhow::Result<u64> {
    federation.spv2_average_fee_rate(num_cycles.into()).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2AvailableLiquidity(federation: Arc<FederationV2>) -> anyhow::Result<RpcAmount> {
    federation.spv2_available_liquidity().await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2DepositToSeek(
    federation: Arc<FederationV2>,
    amount: RpcAmount,
    frontend_meta: FrontendMetadata,
) -> anyhow::Result<RpcOperationId> {
    federation
        .spv2_deposit_to_seek(amount.0, frontend_meta)
        .await
        .map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2Withdraw(
    federation: Arc<FederationV2>,
    fiat_amount: u32,
    frontend_meta: FrontendMetadata,
) -> anyhow::Result<RpcOperationId> {
    federation
        .spv2_withdraw(
            FiatOrAll::Fiat(FiatAmount(fiat_amount.into())),
            frontend_meta,
        )
        .await
        .map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2WithdrawAll(
    federation: Arc<FederationV2>,
    frontend_meta: FrontendMetadata,
) -> anyhow::Result<RpcOperationId> {
    federation
        .spv2_withdraw(FiatOrAll::All, frontend_meta)
        .await
        .map(Into::into)
}

#[macro_rules_derive(rpc_method!)]
async fn getSensitiveLog(runtime: Arc<BridgeRuntime>) -> anyhow::Result<bool> {
    Ok(runtime.sensitive_log().await)
}

#[macro_rules_derive(rpc_method!)]
async fn setSensitiveLog(runtime: Arc<BridgeRuntime>, enable: bool) -> anyhow::Result<()> {
    runtime.set_sensitive_log(enable).await
}

#[macro_rules_derive(rpc_method!)]
async fn setMintModuleFediFeeSchedule(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    send_ppm: u64,
    receive_ppm: u64,
) -> anyhow::Result<()> {
    bridge
        .set_module_fedi_fee_schedule(
            federation_id,
            fedimint_mint_client::KIND,
            send_ppm,
            receive_ppm,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn setWalletModuleFediFeeSchedule(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    send_ppm: u64,
    receive_ppm: u64,
) -> anyhow::Result<()> {
    bridge
        .set_module_fedi_fee_schedule(
            federation_id,
            fedimint_wallet_client::KIND,
            send_ppm,
            receive_ppm,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn setLightningModuleFediFeeSchedule(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    send_ppm: u64,
    receive_ppm: u64,
) -> anyhow::Result<()> {
    bridge
        .set_module_fedi_fee_schedule(
            federation_id,
            fedimint_ln_common::KIND,
            send_ppm,
            receive_ppm,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn setStabilityPoolModuleFediFeeSchedule(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    send_ppm: u64,
    receive_ppm: u64,
) -> anyhow::Result<()> {
    bridge
        .set_module_fedi_fee_schedule(
            federation_id,
            stability_pool_client_old::common::KIND,
            send_ppm,
            receive_ppm,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn setSPv2ModuleFediFeeSchedule(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    send_ppm: u64,
    receive_ppm: u64,
) -> anyhow::Result<()> {
    bridge
        .set_module_fedi_fee_schedule(
            federation_id,
            stability_pool_client::common::KIND,
            send_ppm,
            receive_ppm,
        )
        .await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn getAccruedOutstandingFediFeesPerTXType(
    federation: Arc<FederationV2>,
) -> anyhow::Result<Vec<(String, RpcTransactionDirection, RpcAmount)>> {
    Ok(federation
        .get_outstanding_fedi_fees_per_tx_type()
        .await
        .into_iter()
        .map(|(kind, dir, amount)| (kind.to_string(), dir, RpcAmount(amount)))
        .collect())
}

#[macro_rules_derive(federation_rpc_method!)]
async fn getAccruedPendingFediFeesPerTXType(
    federation: Arc<FederationV2>,
) -> anyhow::Result<Vec<(String, RpcTransactionDirection, RpcAmount)>> {
    Ok(federation
        .get_pending_fedi_fees_per_tx_type()
        .await
        .into_iter()
        .map(|(kind, dir, amount)| (kind.to_string(), dir, RpcAmount(amount)))
        .collect())
}

#[macro_rules_derive(rpc_method!)]
async fn dumpDb(bridge: &BridgeFull, federation_id: String) -> anyhow::Result<PathBuf> {
    bridge.dump_db(&federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixInit(bridge: &BridgeFull) -> anyhow::Result<()> {
    if bridge.matrix.initialized() {
        return Ok(());
    }
    let nostr_pubkey = bridge.runtime.get_nostr_pubkey().await?.npub;
    let matrix_secret = bridge.runtime.get_matrix_secret().await;
    bridge
        .matrix
        .set(
            Matrix::init(
                bridge.runtime.clone(),
                &bridge.runtime.storage.platform_path("matrix".as_ref()),
                &matrix_secret,
                &nostr_pubkey,
                GLOBAL_MATRIX_SERVER.to_owned(),
                GLOBAL_MATRIX_SLIDING_SYNC_PROXY.to_owned(),
            )
            .await?,
        )
        .map_err(|_| anyhow::anyhow!("matrix already initialized"))?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn fetchRegisteredDevices(bridge: &BridgeFull) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
    bridge.fetch_registered_devices().await
}

#[macro_rules_derive(rpc_method!)]
async fn registerAsNewDevice(bridge: &BridgeFull) -> anyhow::Result<Option<RpcFederation>> {
    ensure_device_index_unassigned(&bridge.runtime).await?;
    bridge
        .register_device_with_index(
            bridge.fetch_registered_devices().await?.len().try_into()?,
            false,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn transferExistingDeviceRegistration(
    bridge: &BridgeFull,
    index: u8,
) -> anyhow::Result<Option<RpcFederation>> {
    ensure_device_index_unassigned(&bridge.runtime).await?;
    bridge.register_device_with_index(index, true).await
}

async fn ensure_device_index_unassigned(runtime: &BridgeRuntime) -> anyhow::Result<()> {
    anyhow::ensure!(
        matches!(
            runtime.device_index_assignment_status().await,
            Ok(RpcDeviceIndexAssignmentStatus::Unassigned)
        ),
        "device index is already assigned"
    );

    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn deviceIndexAssignmentStatus(
    runtime: Arc<BridgeRuntime>,
) -> anyhow::Result<RpcDeviceIndexAssignmentStatus> {
    runtime.device_index_assignment_status().await
}

#[macro_rules_derive(rpc_method!)]
async fn bridgeStatus(bridge: &Bridge) -> anyhow::Result<RpcBridgeStatus> {
    bridge.bridge_status().await
}

#[macro_rules_derive(rpc_method!)]
async fn communityPreview(
    bridge: &BridgeFull,
    invite_code: String,
) -> anyhow::Result<RpcCommunity> {
    bridge.communities.community_preview(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn joinCommunity(bridge: &BridgeFull, invite_code: String) -> anyhow::Result<RpcCommunity> {
    bridge.communities.join_community(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn leaveCommunity(bridge: &BridgeFull, invite_code: String) -> anyhow::Result<()> {
    bridge.communities.leave_community(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn listCommunities(bridge: &BridgeFull) -> anyhow::Result<Vec<RpcCommunity>> {
    bridge.communities.list_communities().await
}

#[macro_rules_derive(rpc_method!)]
async fn onAppForeground(bridge: &Bridge) -> anyhow::Result<()> {
    bridge.on_app_foreground();
    Ok(())
}

#[macro_rules_derive(federation_rpc_method!)]
async fn evilSpamInvoices(federation: Arc<FederationV2>) -> anyhow::Result<()> {
    let mut futs = vec![];
    for _ in 0..1000 {
        futs.push(generateInvoice(
            federation.clone(),
            RpcAmount(fedimint_core::Amount::from_sats(100)),
            String::from("evil was here"),
            None,
            FrontendMetadata::default(),
        ));
    }
    futures::future::try_join_all(futs).await?;
    Ok(())
}

#[macro_rules_derive(federation_rpc_method!)]
async fn evilSpamAddress(federation: Arc<FederationV2>) -> anyhow::Result<()> {
    let mut futs = vec![];
    for _ in 0..1000 {
        futs.push(generateAddress(
            federation.clone(),
            FrontendMetadata::default(),
        ));
    }
    futures::future::try_join_all(futs).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn listFederationsPendingRejoinFromScratch(
    bridge: Arc<BridgeRuntime>,
) -> anyhow::Result<Vec<String>> {
    Ok(bridge.list_federations_pending_rejoin_from_scratch().await)
}

macro_rules! ts_type_ser {
    ($name:ident: $ty:ty = $ts_ty:literal) => {
        #[derive(serde::Serialize, ts_rs::TS)]
        #[ts(export)]
        pub struct $name(#[ts(type = $ts_ty)] pub $ty);
    };
}

macro_rules! ts_type_de {
    ($name:ident: $ty:ty = $ts_ty:literal) => {
        #[derive(Debug, serde::Deserialize, ts_rs::TS)]
        #[ts(export)]
        pub struct $name(#[ts(type = $ts_ty)] pub $ty);
    };
}

macro_rules! ts_type_serde {
    ($name:ident: $ty:ty = $ts_ty:literal) => {
        #[derive(Debug, serde::Deserialize, serde::Serialize, ts_rs::TS)]
        #[ts(export)]
        pub struct $name(#[ts(type = $ts_ty)] pub $ty);
    };
}

ts_type_ser!(RpcReusedEcashProofs: SerializedReusedEcashProofs = "JSONObject");

#[macro_rules_derive(federation_rpc_method!)]
async fn generateReusedEcashProofs(
    federation: Arc<FederationV2>,
) -> anyhow::Result<RpcReusedEcashProofs> {
    Ok(RpcReusedEcashProofs(
        federation.generate_reused_ecash_proofs().await?,
    ))
}

// we are really binding generator pushing to its limits.
ts_type_ser!(
    ObservableRoomList: ObservableVec<RpcRoomId> = "ObservableVec<RpcRoomId>"
);

#[macro_rules_derive(rpc_method!)]
async fn matrixGetAccountSession(
    matrix: &Matrix,
    cached: bool,
) -> anyhow::Result<RpcMatrixAccountSession> {
    matrix
        .get_account_session(cached, &matrix.runtime.app_state)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomList(matrix: &Matrix, observable_id: u32) -> anyhow::Result<ObservableRoomList> {
    Ok(ObservableRoomList(
        matrix.room_list(observable_id.into()).await?,
    ))
}

ts_type_ser!(
    ObservableTimelineItems: ObservableVec<RpcTimelineItem> = "ObservableVec<RpcTimelineItem>"
);
#[macro_rules_derive(rpc_method!)]
async fn matrixRoomTimelineItems(
    matrix: &Matrix,
    observable_id: u32,
    room_id: RpcRoomId,
) -> anyhow::Result<ObservableTimelineItems> {
    let items = matrix
        .room_timeline_items(observable_id.into(), &room_id.into_typed()?)
        .await?;
    Ok(ObservableTimelineItems(items))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomPreviewContent(
    matrix: &Matrix,
    room_id: RpcRoomId,
) -> anyhow::Result<Vec<RpcTimelineItem>> {
    matrix.preview_room_content(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendAttachment(
    matrix: &Matrix,
    room_id: RpcRoomId,
    filename: String,
    file_path: PathBuf,
    params: RpcMediaUploadParams,
) -> anyhow::Result<()> {
    let file_data = matrix
        .runtime
        .storage
        .read_file(&file_path)
        .await?
        .ok_or_else(|| anyhow::anyhow!("File not found"))?;

    matrix
        .send_attachment(&room_id.into_typed()?, filename, params, file_data)
        .await?;

    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomTimelineItemsPaginateBackwards(
    matrix: &Matrix,
    room_id: RpcRoomId,
    event_num: u16,
) -> anyhow::Result<()> {
    matrix
        .room_timeline_items_paginate_backwards(&room_id.into_typed()?, event_num)
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomObserveTimelineItemsPaginateBackwards(
    matrix: &Matrix,
    observable_id: u32,
    room_id: RpcRoomId,
) -> anyhow::Result<Observable<RpcBackPaginationStatus>> {
    matrix
        .room_observe_timeline_items_paginate_backwards_status(
            observable_id.into(),
            &room_id.into_typed()?,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixObservableCancel(matrix: &Matrix, observable_id: u32) -> anyhow::Result<()> {
    matrix.observable_cancel(observable_id.into()).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendMessage(
    matrix: &Matrix,
    room_id: RpcRoomId,
    message: String,
) -> anyhow::Result<()> {
    matrix
        .send_message_text(&room_id.into_typed()?, message)
        .await
}

ts_type_de!(CustomMessageData: serde_json::Map<String, serde_json::Value> = "Record<string, JSONValue>");
#[macro_rules_derive(rpc_method!)]
async fn matrixSendMessageJson(
    matrix: &Matrix,
    room_id: RpcRoomId,
    msgtype: String,
    body: String,
    data: CustomMessageData,
) -> anyhow::Result<()> {
    matrix
        .send_message_json(&room_id.into_typed()?, &msgtype, body, data.0)
        .await
}

ts_type_de!(CreateRoomRequest: matrix::create_room::Request = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomCreate(
    matrix: &Matrix,
    request: CreateRoomRequest,
) -> anyhow::Result<RpcRoomId> {
    matrix.room_create(request.0).await.map(RpcRoomId::from)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomCreateOrGetDm(matrix: &Matrix, user_id: RpcUserId) -> anyhow::Result<RpcRoomId> {
    matrix
        .create_or_get_dm(&user_id.into_typed()?)
        .await
        .map(RpcRoomId::from)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomJoin(matrix: &Matrix, room_id: RpcRoomId) -> anyhow::Result<()> {
    matrix.room_join(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomJoinPublic(matrix: &Matrix, room_id: RpcRoomId) -> anyhow::Result<()> {
    matrix.room_join_public(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomLeave(matrix: &Matrix, room_id: RpcRoomId) -> anyhow::Result<()> {
    matrix.room_leave(&room_id.into_typed()?).await
}

ts_type_ser!(ObservableRoomInfo: Observable<RoomInfo> = "Observable<JSONObject>");

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomObserveInfo(
    matrix: &Matrix,
    observable_id: u32,
    room_id: RpcRoomId,
) -> anyhow::Result<ObservableRoomInfo> {
    Ok(ObservableRoomInfo(
        matrix
            .room_observe_info(observable_id.into(), &room_id.into_typed()?)
            .await?,
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixObserveSyncIndicator(
    matrix: &Matrix,
    observable_id: u32,
) -> anyhow::Result<Observable<RpcSyncIndicator>> {
    matrix.observe_sync_status(observable_id.into()).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomInviteUserById(
    matrix: &Matrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
) -> anyhow::Result<()> {
    matrix
        .room_invite_user_by_id(&room_id.into_typed()?, &user_id.into_typed()?)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetName(
    matrix: &Matrix,
    room_id: RpcRoomId,
    name: String,
) -> anyhow::Result<()> {
    matrix.room_set_name(&room_id.into_typed()?, name).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetTopic(
    matrix: &Matrix,
    room_id: RpcRoomId,
    topic: String,
) -> anyhow::Result<()> {
    matrix.room_set_topic(&room_id.into_typed()?, topic).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixIgnoreUser(matrix: &Matrix, user_id: RpcUserId) -> anyhow::Result<()> {
    matrix.ignore_user(&user_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUnignoreUser(matrix: &Matrix, user_id: RpcUserId) -> anyhow::Result<()> {
    matrix.unignore_user(&user_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixListIgnoredUsers(matrix: &Matrix) -> anyhow::Result<Vec<RpcUserId>> {
    matrix.list_ignored_users().await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomKickUser(
    matrix: &Matrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    matrix
        .room_kick_user(
            &room_id.into_typed()?,
            &user_id.into_typed()?,
            reason.as_deref(),
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomBanUser(
    matrix: &Matrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    matrix
        .room_ban_user(
            &room_id.into_typed()?,
            &user_id.into_typed()?,
            reason.as_deref(),
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomUnbanUser(
    matrix: &Matrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    matrix
        .room_unban_user(
            &room_id.into_typed()?,
            &user_id.into_typed()?,
            reason.as_deref(),
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetMembers(
    matrix: &Matrix,
    room_id: RpcRoomId,
) -> anyhow::Result<Vec<RpcRoomMember>> {
    matrix.room_get_members(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUserDirectorySearch(
    matrix: &Matrix,
    search_term: String,
    limit: u32,
) -> anyhow::Result<RpcMatrixUserDirectorySearchResponse> {
    matrix
        .search_user_directory(&search_term, limit.into())
        .await
}

ts_type_ser!(RpcPublicRoomChunk: PublicRoomsChunk = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixPublicRoomInfo(
    matrix: &Matrix,
    room_id: String,
) -> anyhow::Result<RpcPublicRoomChunk> {
    Ok(RpcPublicRoomChunk(matrix.public_room_info(&room_id).await?))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSetDisplayName(matrix: &Matrix, display_name: String) -> anyhow::Result<()> {
    matrix.set_display_name(display_name).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSetAvatarUrl(matrix: &Matrix, avatar_url: String) -> anyhow::Result<()> {
    matrix.set_avatar_url(avatar_url).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUploadMedia(
    matrix: &Matrix,
    path: PathBuf,
    mime_type: String,
) -> anyhow::Result<RpcMatrixUploadResult> {
    let mime = mime_type.parse::<Mime>().context(ErrorCode::BadRequest)?;
    let file = matrix.runtime.get_matrix_media_file(path).await?;
    matrix.upload_file(mime, file).await
}

ts_type_serde!(RpcRoomPowerLevelsEventContent: RoomPowerLevelsEventContent = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetPowerLevels(
    matrix: &Matrix,
    room_id: RpcRoomId,
) -> anyhow::Result<RpcRoomPowerLevelsEventContent> {
    Ok(RpcRoomPowerLevelsEventContent(
        matrix.room_get_power_levels(&room_id.into_typed()?).await?,
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetPowerLevels(
    matrix: &Matrix,
    room_id: RpcRoomId,
    new: RpcRoomPowerLevelsEventContent,
) -> anyhow::Result<()> {
    matrix
        .room_change_power_levels(&room_id.into_typed()?, new.0)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSendReceipt(
    matrix: &Matrix,
    room_id: RpcRoomId,
    event_id: String,
) -> anyhow::Result<bool> {
    matrix
        .room_send_receipt(&room_id.into_typed()?, &event_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetNotificationMode(
    matrix: &Matrix,
    room_id: RpcRoomId,
    mode: RpcRoomNotificationMode,
) -> anyhow::Result<()> {
    matrix
        .room_set_notification_mode(&room_id.into_typed()?, mode)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetNotificationMode(
    matrix: &Matrix,
    room_id: RpcRoomId,
) -> anyhow::Result<Option<RpcRoomNotificationMode>> {
    matrix
        .room_get_notification_mode(&room_id.into_typed()?)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomMarkAsUnread(
    matrix: &Matrix,
    room_id: RpcRoomId,
    unread: bool,
) -> anyhow::Result<()> {
    matrix
        .room_mark_as_unread(&room_id.into_typed()?, unread)
        .await
}

ts_type_ser!(UserProfile: get_profile::v3::Response = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixUserProfile(matrix: &Matrix, user_id: RpcUserId) -> anyhow::Result<UserProfile> {
    matrix
        .user_profile(&user_id.into_typed()?)
        .await
        .map(UserProfile)
}

ts_type_de!(RpcPusher: Pusher = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixSetPusher(matrix: &Matrix, pusher: RpcPusher) -> anyhow::Result<()> {
    matrix.set_pusher(pusher.0).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixEditMessage(
    matrix: &Matrix,
    room_id: RpcRoomId,
    event_id: RpcTimelineEventItemId,
    new_content: String,
) -> anyhow::Result<()> {
    matrix
        .edit_message(&room_id.into_typed()?, &event_id.try_into()?, new_content)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixDeleteMessage(
    matrix: &Matrix,
    room_id: RpcRoomId,
    event_id: RpcTimelineEventItemId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    matrix
        .delete_message(&room_id.into_typed()?, &event_id.try_into()?, reason)
        .await
}

ts_type_de!(RpcMediaSource: MediaSource = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixDownloadFile(
    matrix: &Matrix,
    path: PathBuf,
    media_source: RpcMediaSource,
) -> anyhow::Result<PathBuf> {
    let content = matrix.download_file(media_source.0).await?;
    matrix.runtime.storage.write_file(&path, content).await?;
    Ok(matrix.runtime.storage.platform_path(&path))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixStartPoll(
    matrix: &Matrix,
    room_id: RpcRoomId,
    question: String,
    answers: Vec<String>,
    is_multiple_choice: bool,
    is_disclosed: bool,
) -> anyhow::Result<()> {
    matrix
        .start_poll(
            &room_id.into_typed()?,
            question,
            answers,
            is_multiple_choice,
            is_disclosed,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixEndPoll(
    matrix: &Matrix,
    room_id: RpcRoomId,
    poll_start_id: String,
) -> anyhow::Result<()> {
    let poll_start_event_id = OwnedEventId::try_from(poll_start_id)?;
    matrix
        .end_poll(&room_id.into_typed()?, &poll_start_event_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRespondToPoll(
    matrix: &Matrix,
    room_id: RpcRoomId,
    poll_start_id: String,
    answer_ids: Vec<String>,
) -> anyhow::Result<()> {
    let poll_start_event_id = OwnedEventId::try_from(poll_start_id)?;
    matrix
        .respond_to_poll(&room_id.into_typed()?, &poll_start_event_id, answer_ids)
        .await
}
ts_type_ser!(RpcMediaPreviewResponse: get_media_preview::v1::Response = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixGetMediaPreview(
    matrix: &Matrix,
    url: String,
) -> anyhow::Result<RpcMediaPreviewResponse> {
    Ok(RpcMediaPreviewResponse(
        matrix.get_media_preview(url).await?,
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn getFeatureCatalog(runtime: Arc<BridgeRuntime>) -> anyhow::Result<Arc<FeatureCatalog>> {
    Ok(runtime.feature_catalog.clone())
}

// converts from a typed handler into untyped handler
async fn handle_wrapper<Args, F, Fut, R>(
    f: F,
    bridge: Arc<Bridge>,
    payload: String,
) -> anyhow::Result<String>
where
    F: Fn(Arc<Bridge>, Args) -> Fut,
    Args: DeserializeOwned,
    Fut: Future<Output = anyhow::Result<R>>,
    R: Serialize,
{
    let args = serde_json::from_str(&payload).context(ErrorCode::BadRequest)?;
    let response = f(bridge, args).await?;
    let response = serde_json::json!({
        "result": response,
    });
    serde_json::to_string(&response).context("serialization failed")
}

macro_rules! rpc_methods {
    ($name:ident { $($method:ident),* $(,)? }) => {
        // all variants are unused
        // just used for typeshare
        #[allow(unused)]
        #[derive(TS)]
        #[ts(export)]
        pub struct $name {
        $(
            $method: ($method::args::$method, $method::Return),
        )*
        }

        impl $name {
            pub async fn handle(bridge: Arc<Bridge>, method: &str, payload: String) -> anyhow::Result<String> {
                let future = match method {
                $(
                    stringify!($method) => Box::pin(handle_wrapper($method::handle, bridge, payload)) as fedimint_core::util::BoxFuture<_>,
                )*
                    other => return Err(anyhow::anyhow!(format!(
                        "Unrecognized RPC command: {}",
                        other
                    ))),
                };
                future.await
            }
        }
    };
}

rpc_methods!(RpcMethods {
    bridgeStatus,
    onAppForeground,
    fedimintVersion,
    getFeatureCatalog,
    // Federations
    joinFederation,
    federationPreview,
    leaveFederation,
    listFederations,
    getGuardianStatus,
    listFederationsPendingRejoinFromScratch,
    // Lightning
    generateInvoice,
    decodeInvoice,
    payInvoice,
    listGateways,
    switchGateway,
    // On-Chain
    generateAddress,
    recheckPeginAddress,
    previewPayAddress,
    payAddress,
    // Ecash
    generateEcash,
    receiveEcash,
    validateEcash,
    cancelEcash,
    // Transactions
    updateCachedFiatFXInfo,
    listTransactions,
    getTransaction,
    updateTransactionNotes,
    // Recovery
    backupNow,
    getMnemonic,
    checkMnemonic,
    recoverFromMnemonic,
    generateReusedEcashProofs,
    // Social recovery
    uploadBackupFile,
    locateRecoveryFile,
    validateRecoveryFile,
    recoveryQr,
    cancelSocialRecovery,
    socialRecoveryApprovals,
    completeSocialRecovery,
    socialRecoveryDownloadVerificationDoc,
    approveSocialRecoveryRequest,
    // LNURL
    signLnurlMessage,
    // backup
    backupStatus,
    // Nostr
    getNostrPubkey,
    getNostrSecret,
    signNostrEvent,
    // Stability Pool
    stabilityPoolAccountInfo,
    stabilityPoolNextCycleStartTime,
    stabilityPoolCycleStartPrice,
    stabilityPoolDepositToSeek,
    stabilityPoolWithdraw,
    stabilityPoolAverageFeeRate,
    stabilityPoolAvailableLiquidity,
    // Stability Pool v2
    spv2AccountInfo,
    spv2NextCycleStartTime,
    spv2DepositToSeek,
    spv2Withdraw,
    spv2WithdrawAll,
    spv2AverageFeeRate,
    spv2AvailableLiquidity,
    // Developer
    getSensitiveLog,
    setSensitiveLog,
    setMintModuleFediFeeSchedule,
    setWalletModuleFediFeeSchedule,
    setLightningModuleFediFeeSchedule,
    setStabilityPoolModuleFediFeeSchedule,
    setSPv2ModuleFediFeeSchedule,
    getAccruedOutstandingFediFeesPerTXType,
    getAccruedPendingFediFeesPerTXType,
    dumpDb,

    // Device Registration
    fetchRegisteredDevices,
    registerAsNewDevice,
    transferExistingDeviceRegistration,
    deviceIndexAssignmentStatus,

    matrixObservableCancel,

    // Matrix
    matrixInit,
    matrixGetAccountSession,
    matrixObserveSyncIndicator,
    matrixRoomList,
    matrixRoomTimelineItems,
    matrixRoomTimelineItemsPaginateBackwards,
    matrixRoomObserveTimelineItemsPaginateBackwards,
    matrixSendMessage,
    matrixSendMessageJson,
    matrixSendAttachment,
    matrixRoomCreate,
    matrixRoomCreateOrGetDm,
    matrixRoomJoin,
    matrixRoomJoinPublic,
    matrixRoomLeave,
    matrixRoomObserveInfo,
    matrixRoomInviteUserById,
    matrixRoomSetName,
    matrixRoomSetTopic,
    matrixRoomGetMembers,
    matrixUserDirectorySearch,
    matrixSetDisplayName,
    matrixSetAvatarUrl,
    matrixUploadMedia,
    matrixRoomGetPowerLevels,
    matrixRoomSetPowerLevels,
    matrixRoomSendReceipt,
    matrixRoomSetNotificationMode,
    matrixRoomGetNotificationMode,
    matrixSetPusher,
    matrixUserProfile,
    matrixRoomKickUser,
    matrixRoomBanUser,
    matrixRoomUnbanUser,
    matrixIgnoreUser,
    matrixUnignoreUser,
    matrixListIgnoredUsers,
    matrixRoomPreviewContent,
    matrixPublicRoomInfo,
    matrixRoomMarkAsUnread,
    matrixEditMessage,
    matrixDeleteMessage,
    matrixDownloadFile,
    matrixStartPoll,
    matrixEndPoll,
    matrixRespondToPoll,
    matrixGetMediaPreview,

    // Communities
    communityPreview,
    joinCommunity,
    leaveCommunity,
    listCommunities,

    // evil rpcs to put app in bad states
    evilSpamInvoices,
    evilSpamAddress,
});

#[instrument(
    name = "fedimint_rpc_request",
    skip(bridge, payload),
    fields(
        request_id = %{
            static REQUEST_ID: AtomicU64 = AtomicU64::new(0);
            REQUEST_ID.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        },
        federation_id,
    )
)]
pub async fn fedimint_rpc_async(bridge: Arc<Bridge>, method: String, payload: String) -> String {
    let _g = TimeReporter::new(format!("fedimint_rpc {method}")).level(Level::INFO);
    let sensitive_log = bridge.runtime().sensitive_log().await;
    if sensitive_log {
        let trunc_fmt = format!("{payload:.1000}");
        tracing::info!(payload = %trunc_fmt);
    } else {
        info!("rpc call");
    }

    let result = RpcMethods::handle(bridge, &method, payload).await;

    if sensitive_log {
        match &result {
            Ok(ok) => {
                let trunc_fmt = format!("{ok:.1000}");
                tracing::info!(result_ok = %trunc_fmt);
            }
            Err(err) => {
                let trunc_fmt = format!("{err:.1000}");
                tracing::info!(result_err = %trunc_fmt);
            }
        }
    }

    result.unwrap_or_else(|error| {
        error!(%error, "rpc_error");
        rpc_error_json(&error)
    })
}

#[cfg(test)]
pub mod tests {
    use std::collections::HashMap;
    use std::ops::ControlFlow;
    use std::path::Path;
    use std::str::{self, FromStr};
    use std::sync::{Once, RwLock};
    use std::time::{Duration, SystemTime};

    use anyhow::{anyhow, bail};
    use bech32::{self, Bech32m};
    use bitcoin::secp256k1::PublicKey;
    use bitcoin::Network;
    use devimint::devfed::DevJitFed;
    use devimint::envs::FM_INVITE_CODE_ENV;
    use devimint::util::{ClnLightningCli, FedimintCli, LnCli, ProcessManager};
    use devimint::vars::{self, mkdir};
    use devimint::{cmd, DevFed};
    use fedi_core::envs::FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV;
    use fedi_social_client::common::VerificationDocument;
    use fedimint_bip39::Bip39RootSecretStrategy;
    use fedimint_client::secret::RootSecretStrategy;
    use fedimint_core::core::ModuleKind;
    use fedimint_core::task::{sleep_in_test, TaskGroup};
    use fedimint_core::{apply, async_trait_maybe_send, Amount};
    use fedimint_logging::{TracingSetup, LOG_DEVIMINT};
    use rand::distributions::Alphanumeric;
    use rand::Rng;
    use tokio::sync::Mutex;
    use tokio::task::JoinSet;
    use tracing::{debug, info, trace};

    use super::*;
    use crate::api::{RegisterDeviceError, RegisteredDevice};
    use crate::community::CommunityInvite;
    use crate::constants::{COMMUNITY_INVITE_CODE_HRP, FEDI_FILE_PATH, MILLION};
    use crate::envs::USE_UPSTREAM_FEDIMINTD_ENV;
    use crate::event::{DeviceRegistrationEvent, TransactionEvent};
    use crate::features::RuntimeEnvironment;
    use crate::federation::federation_sm::FederationState;
    use crate::federation::federation_v2::client::ClientExt;
    use crate::federation::federation_v2::FederationV2;
    use crate::ffi::PathBasedStorage;
    use crate::storage::{DeviceIdentifier, FediFeeSchedule, IStorage};
    use crate::types::{
        RpcLnReceiveState, RpcOOBReissueState, RpcOnchainDepositState, RpcReturningMemberStatus,
        RpcTransactionDirection, RpcTransactionKind,
    };

    struct FakeEventSink {
        pub events: Arc<RwLock<Vec<(String, String)>>>,
    }

    static INIT_TRACING: Once = Once::new();

    impl FakeEventSink {
        fn new() -> Self {
            Self {
                events: Arc::new(RwLock::new(vec![])),
            }
        }
    }

    impl IEventSink for FakeEventSink {
        fn event(&self, event_type: String, body: String) {
            let mut events = self
                .events
                .write()
                .expect("couldn't acquire FakeEventSink lock");
            events.push((event_type, body));
        }
        fn events(&self) -> Vec<(String, String)> {
            self.events
                .read()
                .expect("FakeEventSink could not acquire read lock")
                .clone()
        }
        fn num_events_of_type(&self, event_type: String) -> usize {
            self.events().iter().filter(|e| e.0 == event_type).count()
        }
    }

    pub struct MockFediApi {
        // (seed, index) => (encrypted device identifier, last registration timestamp)
        registry: Mutex<HashMap<(bip39::Mnemonic, u8), (String, SystemTime)>>,

        // Invoice that will be returned whenever fetch_fedi_invoice is called
        fedi_fee_invoice: Option<Bolt11Invoice>,
    }

    impl Default for MockFediApi {
        fn default() -> Self {
            Self {
                registry: Mutex::new(HashMap::new()),
                fedi_fee_invoice: None,
            }
        }
    }

    impl MockFediApi {
        fn set_fedi_fee_invoice(&mut self, invoice: Bolt11Invoice) {
            self.fedi_fee_invoice = Some(invoice);
        }
    }

    #[apply(async_trait_maybe_send!)]
    impl IFediApi for MockFediApi {
        async fn fetch_fedi_fee_schedule(
            &self,
            _network: Network,
        ) -> anyhow::Result<FediFeeSchedule> {
            Ok(FediFeeSchedule::default())
        }

        async fn fetch_fedi_fee_invoice(
            &self,
            _amount: Amount,
            _network: Network,
            _module: ModuleKind,
            _tx_direction: RpcTransactionDirection,
        ) -> anyhow::Result<Bolt11Invoice> {
            self.fedi_fee_invoice
                .clone()
                .ok_or(anyhow!("Invoice not set"))
        }

        async fn fetch_registered_devices_for_seed(
            &self,
            seed: bip39::Mnemonic,
        ) -> anyhow::Result<Vec<RegisteredDevice>> {
            let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&seed);
            let mut devices = self
                .registry
                .lock()
                .await
                .iter()
                .filter_map(|(k, v)| {
                    if k.0 == seed {
                        Some(
                            match DeviceIdentifier::from_encrypted_string(&v.0, &root_secret) {
                                Ok(identifier) => Ok(RegisteredDevice {
                                    index: k.1,
                                    identifier,
                                    last_renewed: v.1,
                                }),
                                Err(e) => Err(e),
                            },
                        )
                    } else {
                        None
                    }
                })
                .collect::<anyhow::Result<Vec<_>>>()?;

            devices.sort_by_key(|r| r.index);
            Ok(devices)
        }

        async fn register_device_for_seed(
            &self,
            seed: bip39::Mnemonic,
            device_index: u8,
            encrypted_device_identifier: String,
            force_overwrite: bool,
        ) -> anyhow::Result<(), RegisterDeviceError> {
            let mut registry = self.registry.lock().await;
            if let Some(value) = registry.get_mut(&(seed.clone(), device_index)) {
                if force_overwrite || encrypted_device_identifier == value.0 {
                    value.0 = encrypted_device_identifier;
                    value.1 = fedimint_core::time::now();
                    Ok(())
                } else {
                    Err(RegisterDeviceError::AnotherDeviceOwnsIndex(format!(
                        "{} already owned by {}, not overwriting",
                        device_index, value.0
                    )))
                }
            } else {
                registry.insert(
                    (seed, device_index),
                    (encrypted_device_identifier, fedimint_core::time::now()),
                );
                Ok(())
            }
        }
    }

    // note: logging doesn't work yet at this point
    fn create_data_dir() -> PathBuf {
        tempfile::tempdir().unwrap().into_path()
    }

    fn get_fixture_dir() -> PathBuf {
        std::env::current_dir().unwrap().join("../fixtures")
    }

    /// Get LND pubkey using lncli, then have `federation` switch to using
    /// whatever gateway is using that node pubkey
    async fn use_lnd_gateway(federation: &FederationV2) -> anyhow::Result<()> {
        let lnd_node_pubkey: PublicKey = cmd!(LnCli, "getinfo").out_json().await?
            ["identity_pubkey"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap()
            .parse()
            .unwrap();
        let mut gateways = federation.list_gateways().await?;
        if gateways.is_empty() {
            federation.select_gateway().await?;
            gateways = federation.list_gateways().await?;
        }
        for gateway in gateways {
            if gateway.node_pub_key.0 == lnd_node_pubkey {
                federation.switch_gateway(&gateway.gateway_id.0).await?;
                return Ok(());
            }
        }
        bail!("No gateway is using LND's node pubkey")
    }

    async fn amount_from_ecash(ecash_string: String) -> anyhow::Result<fedimint_core::Amount> {
        if let Ok(ecash) = fedimint_mint_client::OOBNotes::from_str(&ecash_string) {
            Ok(ecash.total_amount())
        } else {
            bail!("failed to parse ecash")
        }
    }

    async fn cli_generate_ecash(amount: fedimint_core::Amount) -> anyhow::Result<String> {
        let ecash_string = cmd!(
            FedimintCli,
            "spend",
            "--allow-overpay",
            amount.msats.to_string()
        )
        .out_json()
        .await?["notes"]
            .as_str()
            .map(|s| s.to_owned())
            .expect("'note' key not found generating ecash with fedimint-cli");
        Ok(ecash_string)
    }

    async fn cli_generate_invoice(amount: &Amount) -> anyhow::Result<(Bolt11Invoice, String)> {
        let label = format!("bridge-tests-{}", rand::random::<u128>());
        let invoice_string = cmd!(ClnLightningCli, "invoice", amount.msats, &label, &label)
            .out_json()
            .await?["bolt11"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap();
        Ok((Bolt11Invoice::from_str(&invoice_string)?, label))
    }

    async fn cli_receive_ecash(ecash: String) -> anyhow::Result<()> {
        cmd!(FedimintCli, "reissue", ecash).run().await?;
        Ok(())
    }
    async fn copy_recursively(
        source: impl AsRef<Path>,
        destination: impl AsRef<Path>,
    ) -> anyhow::Result<()> {
        let source = source.as_ref().to_path_buf();
        let destination = destination.as_ref().to_path_buf();
        tokio::task::spawn_blocking(move || copy_recursively_inner(source, destination)).await??;
        Ok(())
    }
    pub fn copy_recursively_inner<A: AsRef<Path>>(
        source: impl AsRef<Path>,
        destination: A,
    ) -> std::io::Result<()> {
        std::fs::create_dir_all(&destination)?;
        for entry in std::fs::read_dir(source)? {
            let entry = entry?;
            let filetype = entry.file_type()?;
            if filetype.is_dir() {
                copy_recursively_inner(entry.path(), destination.as_ref().join(entry.file_name()))?;
            } else {
                std::fs::copy(entry.path(), destination.as_ref().join(entry.file_name()))?;
            }
        }
        Ok(())
    }

    async fn cln_wait_invoice(label: &str) -> anyhow::Result<()> {
        let status = cmd!(ClnLightningCli, "waitinvoice", label)
            .out_json()
            .await?["status"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap();
        assert_eq!(status, "paid");
        Ok(())
    }

    fn get_command_for_alias(alias: &str, default: &str) -> devimint::util::Command {
        // try to use alias if set
        let cli = std::env::var(alias)
            .map(|s| s.split_whitespace().map(ToOwned::to_owned).collect())
            .unwrap_or_else(|_| vec![default.into()]);
        let mut cmd = tokio::process::Command::new(&cli[0]);
        cmd.args(&cli[1..]);
        devimint::util::Command {
            cmd,
            args_debug: cli,
        }
    }

    pub struct BitcoinCli;
    impl BitcoinCli {
        pub fn cmd(self) -> devimint::util::Command {
            get_command_for_alias("FM_BTC_CLIENT", "bitcoin-cli")
        }
    }

    async fn bitcoin_cli_send_to_address(address: &str, amount: &str) -> anyhow::Result<()> {
        let btc_port = std::env::var("FM_PORT_BTC_RPC").unwrap_or(String::from("18443"));
        cmd!(
            BitcoinCli,
            "-rpcport={btc_port}",
            "sendtoaddress",
            address,
            amount
        )
        .run()
        .await?;

        cmd!(BitcoinCli, "-rpcport={btc_port}", "-generate", "11")
            .run()
            .await?;

        Ok(())
    }

    async fn cln_pay_invoice(invoice_string: &str) -> anyhow::Result<()> {
        cmd!(ClnLightningCli, "pay", invoice_string).run().await?;
        Ok(())
    }

    async fn setup() -> anyhow::Result<(Arc<BridgeFull>, Arc<FederationV2>)> {
        let bridge = setup_bridge().await?;

        let federation = join_test_fed(&bridge).await?;
        Ok((bridge, federation))
    }

    async fn setup_custom(
        device_identifier: String,
        mock_fedi_api: Arc<dyn IFediApi>,
        feature_catalog: Arc<FeatureCatalog>,
    ) -> anyhow::Result<(Arc<BridgeFull>, Arc<FederationV2>)> {
        let bridge = setup_bridge_custom(device_identifier, mock_fedi_api, feature_catalog).await?;

        let federation = join_test_fed(&bridge).await?;
        Ok((bridge, federation))
    }

    async fn setup_bridge() -> anyhow::Result<Arc<BridgeFull>> {
        setup_bridge_custom(
            "default_bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned(),
            Arc::new(MockFediApi::default()),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await
    }

    async fn setup_bridge_custom(
        device_identifier: String,
        fedi_api: Arc<dyn IFediApi>,
        feature_catalog: Arc<FeatureCatalog>,
    ) -> anyhow::Result<Arc<BridgeFull>> {
        setup_bridge_custom_with_data_dir(
            device_identifier,
            fedi_api,
            feature_catalog,
            create_data_dir(),
        )
        .await
    }

    async fn setup_bridge_custom_with_data_dir(
        device_identifier: String,
        fedi_api: Arc<dyn IFediApi>,
        feature_catalog: Arc<FeatureCatalog>,
        data_dir: PathBuf,
    ) -> anyhow::Result<Arc<BridgeFull>> {
        let event_sink = Arc::new(FakeEventSink::new());
        let storage = Arc::new(PathBasedStorage::new(data_dir).await?);
        let device_identifier = DeviceIdentifier::from_str(&device_identifier)?;
        let runtime = BridgeRuntime::new(
            storage,
            event_sink,
            fedi_api,
            device_identifier.clone(),
            feature_catalog,
        )
        .await
        .context("Failed to create runtime for bridge")?;

        let bridge = BridgeFull::new(runtime.into(), device_identifier)
            .await
            .map_err(|e| anyhow!(e.to_string()))?;
        Ok(bridge.into())
    }

    async fn join_test_fed(bridge: &BridgeFull) -> Result<Arc<FederationV2>, anyhow::Error> {
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
        let fedimint_federation = joinFederation(&bridge.federations, invite_code, false).await?;
        let federation = bridge
            .federations
            .get_federation_maybe_recovering(&fedimint_federation.id.0)?;
        use_lnd_gateway(&federation).await?;
        Ok(federation)
    }

    async fn join_test_fed_recovery(
        bridge: &BridgeFull,
        recover_from_scratch: bool,
    ) -> Result<Arc<FederationV2>, anyhow::Error> {
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
        let fedimint_federation =
            joinFederation(&bridge.federations, invite_code, recover_from_scratch).await?;
        let federation = bridge
            .federations
            .get_federation_maybe_recovering(&fedimint_federation.id.0)?;
        Ok(federation)
    }

    fn should_skip_test_using_stock_fedimintd() -> bool {
        if std::env::var(USE_UPSTREAM_FEDIMINTD_ENV).is_ok() {
            info!("Skipping test as we're using stock/upstream fedimintd binary");
            true
        } else {
            false
        }
    }

    macro_rules! spawn_and_attach_name {
        ($tests_set:expr, $tests_names:expr, $test_name:ident) => {
            let id = $tests_set.spawn($test_name()).id();
            $tests_names.insert(id, stringify!($test_name).to_owned());
        };
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn tests_wrapper_for_bridge() -> anyhow::Result<()> {
        let _dev_fed = dev_fed().await?;
        let mut tests_set = JoinSet::new();
        let mut tests_names: HashMap<tokio::task::Id, String> = HashMap::new();
        spawn_and_attach_name!(tests_set, tests_names, test_join_and_leave_and_join);
        spawn_and_attach_name!(tests_set, tests_names, test_join_concurrent);
        spawn_and_attach_name!(tests_set, tests_names, test_lightning_send_and_receive);
        spawn_and_attach_name!(tests_set, tests_names, test_ecash);
        spawn_and_attach_name!(tests_set, tests_names, test_ecash_overissue);
        spawn_and_attach_name!(tests_set, tests_names, test_on_chain);
        spawn_and_attach_name!(tests_set, tests_names, test_ecash_cancel);
        spawn_and_attach_name!(tests_set, tests_names, test_backup_and_recovery);
        spawn_and_attach_name!(
            tests_set,
            tests_names,
            test_backup_and_recovery_from_scratch
        );
        spawn_and_attach_name!(tests_set, tests_names, test_validate_ecash);
        spawn_and_attach_name!(tests_set, tests_names, test_social_backup_and_recovery);
        spawn_and_attach_name!(tests_set, tests_names, test_stability_pool);
        spawn_and_attach_name!(tests_set, tests_names, test_spv2);
        spawn_and_attach_name!(tests_set, tests_names, test_lnurl_sign_message);
        spawn_and_attach_name!(tests_set, tests_names, test_federation_preview);
        spawn_and_attach_name!(
            tests_set,
            tests_names,
            test_join_fails_post_recovery_index_unassigned
        );
        spawn_and_attach_name!(
            tests_set,
            tests_names,
            test_transfer_device_registration_post_recovery
        );
        spawn_and_attach_name!(
            tests_set,
            tests_names,
            test_new_device_registration_post_recovery
        );
        spawn_and_attach_name!(tests_set, tests_names, test_fee_remittance_on_startup);
        spawn_and_attach_name!(tests_set, tests_names, test_reused_ecash_proofs);
        spawn_and_attach_name!(
            tests_set,
            tests_names,
            test_fee_remittance_post_successful_tx
        );

        while let Some(res) = tests_set.join_next_with_id().await {
            match res {
                Err(e) => {
                    bail!("test {} failed: {:?}", &tests_names[&e.id()], e);
                }
                Ok((id, Err(e))) => {
                    bail!("test {} failed: {:?}", &tests_names[&id], e);
                }
                Ok((id, Ok(_))) => {
                    info!("test {} OK", &tests_names[&id]);
                }
            }
        }
        Ok(())
    }

    async fn process_setup(fed_size: usize) -> anyhow::Result<(ProcessManager, TaskGroup)> {
        let test_dir = std::env::temp_dir().join(format!(
            "devimint-{}-{}",
            std::process::id(),
            rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .filter(u8::is_ascii_digit)
                .take(3)
                .map(char::from)
                .collect::<String>()
        ));
        mkdir(test_dir.clone()).await?;
        let logs_dir: PathBuf = test_dir.join("logs");
        mkdir(logs_dir.clone()).await?;

        INIT_TRACING.call_once(|| {
            TracingSetup::default()
                .init()
                .expect("Failed to initialize tracing");
        });

        let globals = vars::Global::new(&test_dir, fed_size, 0).await?;

        info!(target: LOG_DEVIMINT, path=%globals.FM_DATA_DIR.display() , "Devimint data dir");

        for (var, value) in globals.vars() {
            debug!(var, value, "Env variable set");
            std::env::set_var(var, value);
        }
        let process_mgr = ProcessManager::new(globals);
        let task_group = TaskGroup::new();
        Ok((process_mgr, task_group))
    }

    async fn dev_fed() -> anyhow::Result<DevFed> {
        trace!(target: LOG_DEVIMINT, "Starting dev fed");
        let (process_mgr, _) = process_setup(4).await?;
        let dev_fed = DevJitFed::new(&process_mgr, false)?;

        debug!(target: LOG_DEVIMINT, "Peging in client and gateways");

        let gw_pegin_amount = 1_000_000;
        let client_pegin_amount = 1_000_000;
        let ((), _, _) = tokio::try_join!(
            async {
                let (address, operation_id) =
                    dev_fed.internal_client().await?.get_deposit_addr().await?;
                dev_fed
                    .bitcoind()
                    .await?
                    .send_to(address, client_pegin_amount)
                    .await?;
                dev_fed.bitcoind().await?.mine_blocks_no_wait(11).await?;
                dev_fed
                    .internal_client()
                    .await?
                    .await_deposit(&operation_id)
                    .await
            },
            async {
                let pegin_addr = dev_fed
                    .gw_cln_registered()
                    .await?
                    .get_pegin_addr(&dev_fed.fed().await?.calculate_federation_id())
                    .await?;
                dev_fed
                    .bitcoind()
                    .await?
                    .send_to(pegin_addr, gw_pegin_amount)
                    .await?;
                dev_fed.bitcoind().await?.mine_blocks_no_wait(11).await
            },
            async {
                let pegin_addr = dev_fed
                    .gw_lnd_registered()
                    .await?
                    .get_pegin_addr(&dev_fed.fed().await?.calculate_federation_id())
                    .await?;
                dev_fed
                    .bitcoind()
                    .await?
                    .send_to(pegin_addr, gw_pegin_amount)
                    .await?;
                dev_fed.bitcoind().await?.mine_blocks_no_wait(11).await
            },
        )?;

        info!(target: LOG_DEVIMINT, "Pegins completed");

        std::env::set_var(FM_INVITE_CODE_ENV, dev_fed.fed().await?.invite_code()?);

        dev_fed.finalize(&process_mgr).await?;
        info!(target: LOG_DEVIMINT, "Devfed ready");

        dev_fed.to_dev_fed(&process_mgr).await
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_doesnt_overwrite_seed_in_invalid_fedi_file() -> anyhow::Result<()> {
        INIT_TRACING.call_once(|| {
            TracingSetup::default()
                .init()
                .expect("Failed to initialize tracing");
        });
        let event_sink = Arc::new(FakeEventSink::new());
        let data_dir = create_data_dir();
        let storage = Arc::new(PathBasedStorage::new(data_dir).await?);
        let fedi_api = Arc::new(MockFediApi::default());
        let invalid_fedi_file = String::from(r#"{"format_version": 0, "root_seed": "abcd"}"#);
        storage
            .write_file(FEDI_FILE_PATH.as_ref(), invalid_fedi_file.clone().into())
            .await?;
        assert!(fedimint_initialize_async(
            storage.clone(),
            event_sink,
            fedi_api,
            "Unknown (bridge tests)".to_owned(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await
        .is_err());
        assert_eq!(
            storage
                .read_file(FEDI_FILE_PATH.as_ref())
                .await?
                .expect("fedi file not found"),
            invalid_fedi_file.into_bytes()
        );
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_multi_bridge_compatibility_and_global_db_migration() -> anyhow::Result<()> {
        INIT_TRACING.call_once(|| {
            TracingSetup::default()
                .init()
                .expect("Failed to initialize tracing");
        });

        let event_sink = Arc::new(FakeEventSink::new());
        // This fixture contains a "datadir" with 1 global database and one federations
        // database (fedi alpha mutinynet v0)
        let data_dir = create_data_dir();
        let fixture_dir = get_fixture_dir().join("v0_db");
        copy_recursively(fixture_dir, &data_dir).await?;
        let storage = Arc::new(PathBasedStorage::new(data_dir).await?);
        let fedi_api = Arc::new(MockFediApi::default());
        let bridge = fedimint_initialize_async(
            storage,
            event_sink,
            fedi_api,
            "default_bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        let federations = listFederations(bridge.try_get()?).await?;
        // old federations are ignored
        assert_eq!(federations.len(), 0);
        Ok(())
    }

    async fn test_join_and_leave_and_join() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        let env_invite_code = std::env::var("FM_INVITE_CODE").unwrap();

        // Can't re-join a federation we're already a member of
        assert!(
            joinFederation(&bridge.federations, env_invite_code.clone(), false)
                .await
                .is_err()
        );

        // listTransactions works
        let federations = listFederations(&bridge.federations).await?;
        assert_eq!(federations.len(), 1);
        let RpcFederationMaybeLoading::Ready(rpc_federation) = &federations[0] else {
            panic!("federation is not loaded");
        };
        assert_eq!(env_invite_code.clone(), rpc_federation.invite_code);

        let id = federation.rpc_federation_id();
        drop(federation);
        // leaveFederation works
        leaveFederation(&bridge.federations, id).await?;
        assert_eq!(listFederations(&bridge.federations).await?.len(), 0);

        // rejoin without any rocksdb locking problems
        joinFederation(&bridge.federations, env_invite_code, false).await?;
        assert_eq!(listFederations(&bridge.federations).await?.len(), 1);

        Ok(())
    }

    async fn test_join_concurrent() -> anyhow::Result<()> {
        let device_identifier = "bridge:test:70c2ad23-bfac-4aa2-81c3-d6f5e79ae724".to_string();

        let mock_fedi_api = Arc::new(MockFediApi::default());
        let data_dir = create_data_dir();
        let federation_id;
        let amount;
        // first app launch
        {
            let bridge = setup_bridge_custom_with_data_dir(
                device_identifier.clone(),
                mock_fedi_api.clone(),
                FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
                data_dir.clone(),
            )
            .await?;
            let env_invite_code = std::env::var("FM_INVITE_CODE").unwrap();

            // Can't re-join a federation we're already a member of
            let (res1, res2) = tokio::join!(
                joinFederation(&bridge.federations, env_invite_code.clone(), false),
                joinFederation(&bridge.federations, env_invite_code.clone(), false),
            );
            federation_id = match (res1, res2) {
                (Ok(f), Err(_)) | (Err(_), Ok(f)) => f.id.0,
                _ => panic!("exactly one of two concurrent join federation must fail"),
            };

            let federation = bridge.federations.get_federation(&federation_id)?;
            let ecash = cli_generate_ecash(fedimint_core::Amount::from_msats(10_000)).await?;
            amount = receiveEcash(federation.clone(), ecash, FrontendMetadata::default())
                .await?
                .0
                 .0;
            wait_for_ecash_reissue(&federation).await?;
            bridge
                .runtime
                .task_group
                .clone()
                .shutdown_join_all(Duration::from_secs(5))
                .await?;
        }

        // second app launch
        {
            let bridge = setup_bridge_custom_with_data_dir(
                device_identifier,
                mock_fedi_api.clone(),
                FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
                data_dir.clone(),
            )
            .await?;
            let federation = wait_for_federation_loading(&bridge, &federation_id).await?;
            assert_eq!(federation.get_balance().await, amount);
        }
        Ok(())
    }

    async fn wait_for_federation_loading(
        bridge: &BridgeFull,
        federation_id: &str,
    ) -> anyhow::Result<Arc<FederationV2>> {
        loop {
            match bridge.federations.get_federation_state(federation_id)? {
                FederationState::Loading => {
                    sleep_in_test("loading federation", Duration::from_millis(10)).await
                }
                FederationState::Ready(f) | FederationState::Recovering(f) => return Ok(f),
                FederationState::Failed(err) => bail!(err),
            }
        }
    }

    async fn test_lightning_send_and_receive() -> anyhow::Result<()> {
        // Vec of tuple of (send_ppm, receive_ppm)
        let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
        for (send_ppm, receive_ppm) in fee_ppm_values {
            test_lightning_send_and_receive_with_fedi_fees(send_ppm, receive_ppm).await?;
        }

        Ok(())
    }

    async fn test_lightning_send_and_receive_with_fedi_fees(
        fedi_fees_send_ppm: u64,
        fedi_fees_receive_ppm: u64,
    ) -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        setLightningModuleFediFeeSchedule(
            &bridge,
            federation.rpc_federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;
        let receive_amount = fedimint_core::Amount::from_sats(100);
        let fedi_fee =
            Amount::from_msats((receive_amount.msats * fedi_fees_receive_ppm).div_ceil(MILLION));
        let rpc_receive_amount = RpcAmount(receive_amount);
        let description = "test".to_string();
        let invoice_string = generateInvoice(
            federation.clone(),
            rpc_receive_amount,
            description,
            None,
            FrontendMetadata::default(),
        )
        .await?;

        cln_pay_invoice(&invoice_string).await?;

        // check for event of type transaction that has ln_state
        'check: loop {
            let events = bridge.runtime.event_sink.events();
            for (_, ev_body) in events
                .iter()
                .rev()
                .filter(|(kind, _)| kind == "transaction")
            {
                let ev_body = serde_json::from_str::<TransactionEvent>(ev_body).unwrap();
                let transaction = ev_body.transaction;
                if matches!(transaction
                    .kind,
                    RpcTransactionKind::LnReceive {
                        ln_invoice, state: Some(RpcLnReceiveState::Claimed), ..
                    } if ln_invoice == invoice_string
                ) {
                    break 'check;
                }
            }
            fedimint_core::task::sleep_in_test(
                "waiting for external ln recv",
                Duration::from_millis(100),
            )
            .await;
        }

        assert_eq!(receive_amount - fedi_fee, federation.get_balance().await);

        // get invoice
        let send_amount = Amount::from_sats(50);
        let (invoice, label) = cli_generate_invoice(&send_amount).await?;
        let invoice_string = invoice.to_string();

        // check balance
        payInvoice(
            federation.clone(),
            invoice_string,
            FrontendMetadata::default(),
        )
        .await?;

        // check that core-lightning got paid
        cln_wait_invoice(&label).await?;

        // TODO shaurya unsure how to account for gateway fee when verifying fedi fee
        // amount
        Ok(())
    }

    async fn test_ecash() -> anyhow::Result<()> {
        // Vec of tuple of (send_ppm, receive_ppm)
        let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
        for (send_ppm, receive_ppm) in fee_ppm_values {
            test_ecash_with_fedi_fees(send_ppm, receive_ppm).await?;
        }

        Ok(())
    }

    async fn test_ecash_with_fedi_fees(
        fedi_fees_send_ppm: u64,
        fedi_fees_receive_ppm: u64,
    ) -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        setMintModuleFediFeeSchedule(
            &bridge,
            federation.rpc_federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        // receive ecash
        let ecash_receive_amount = fedimint_core::Amount::from_msats(10000);
        let ecash = cli_generate_ecash(ecash_receive_amount).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        let receive_fedi_fee = Amount::from_msats(
            (ecash_receive_amount.msats * fedi_fees_receive_ppm).div_ceil(MILLION),
        );
        receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
        wait_for_ecash_reissue(&federation).await?;

        // check balance (sometimes fedimint-cli gives more than we ask for)
        assert_eq!(
            ecash_receive_amount - receive_fedi_fee,
            federation.get_balance().await,
        );

        // spend ecash
        // If fedi_fee != 0, we expect this to fail since we cannot spend all of
        // ecash_receive_amount
        if receive_fedi_fee != Amount::ZERO {
            assert!(generateEcash(
                federation.clone(),
                RpcAmount(ecash_receive_amount),
                false,
                FrontendMetadata::default()
            )
            .await
            .is_err());
        }
        let ecash_send_amount = Amount::from_msats(ecash_receive_amount.msats / 2);
        let send_fedi_fee =
            Amount::from_msats((ecash_send_amount.msats * fedi_fees_send_ppm).div_ceil(MILLION));
        let send_ecash = generateEcash(
            federation.clone(),
            RpcAmount(ecash_send_amount),
            false,
            FrontendMetadata::default(),
        )
        .await?
        .ecash;

        assert_eq!(
            ecash_receive_amount - receive_fedi_fee - ecash_send_amount - send_fedi_fee,
            federation.get_balance().await,
        );

        // receive with fedimint-cli
        cli_receive_ecash(send_ecash).await?;

        Ok(())
    }

    async fn wait_for_ecash_reissue(federation: &FederationV2) -> Result<(), anyhow::Error> {
        devimint::util::poll("waiting for ecash reissue", || async {
            let txns = federation.list_transactions(usize::MAX, None).await;
            let RpcTransactionKind::OobReceive { state: Some(state) } = txns
                .first()
                .context("transaction not found")
                .map_err(ControlFlow::Continue)?
                .transaction
                .kind
                .clone()
            else {
                return Err(ControlFlow::Continue(anyhow!(
                    "oob state must be present on ecash reissue"
                )));
            };
            match state {
                RpcOOBReissueState::Done => Ok(()),
                RpcOOBReissueState::Failed { error } => Err(ControlFlow::Break(anyhow!(error))),
                _ => Err(ControlFlow::Continue(anyhow!("not done yet"))),
            }
        })
        .await
    }

    async fn test_ecash_overissue() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;

        // receive ecash
        let ecash_requested_amount = fedimint_core::Amount::from_msats(10000);
        let ecash = cli_generate_ecash(ecash_requested_amount).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
        wait_for_ecash_reissue(federation.as_ref()).await?;

        // check balance
        assert_eq!(ecash_receive_amount, federation.get_balance().await,);

        let fedi_fee_ppm = bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                fedimint_mint_client::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let iterations = 100;
        let iteration_amount = Amount::from_msats(ecash_receive_amount.msats / (iterations * 2));
        let iteration_expected_fee =
            Amount::from_msats((fedi_fee_ppm * iteration_amount.msats).div_ceil(MILLION));

        for _ in 0..iterations {
            generateEcash(
                federation.clone(),
                RpcAmount(iteration_amount),
                false,
                FrontendMetadata::default(),
            )
            .await
            .context("generateEcash")?;
        }
        // check balance
        assert_eq!(
            ecash_receive_amount - ((iteration_amount + iteration_expected_fee) * iterations),
            federation.get_balance().await,
        );

        Ok(())
    }

    // on chain is marked experimental for 0.4
    async fn test_on_chain() -> anyhow::Result<()> {
        // Vec of tuple of (send_ppm, receive_ppm)
        let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
        for (send_ppm, receive_ppm) in fee_ppm_values {
            test_on_chain_with_fedi_fees(send_ppm, receive_ppm).await?;
        }

        Ok(())
    }

    async fn test_on_chain_with_fedi_fees(
        fedi_fees_send_ppm: u64,
        fedi_fees_receive_ppm: u64,
    ) -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        setWalletModuleFediFeeSchedule(
            &bridge,
            federation.rpc_federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        let address = generateAddress(federation.clone(), FrontendMetadata::default()).await?;
        bitcoin_cli_send_to_address(&address, "0.1").await?;

        assert!(matches!(
            listTransactions(federation.clone(), None, None).await?[0]
                .transaction
                .kind,
            RpcTransactionKind::OnchainDeposit {
                state: Some(RpcOnchainDepositState::WaitingForTransaction),
                ..
            }
        ));
        // check for event of type transaction that has onchain_state of
        // DepositState::Claimed
        'check: loop {
            let events = bridge.runtime.event_sink.events();
            for (_, ev_body) in events
                .iter()
                .rev()
                .filter(|(kind, _)| kind == "transaction")
            {
                let ev_body = serde_json::from_str::<TransactionEvent>(ev_body).unwrap();
                let transaction = ev_body.transaction;
                if matches!(
                    transaction.kind,
                    RpcTransactionKind::OnchainDeposit {
                        onchain_address,
                        state: Some(RpcOnchainDepositState::Claimed(_)),
                        ..
                    } if onchain_address == address
                ) {
                    break 'check;
                }
            }
            fedimint_core::task::sleep_in_test(
                "waiting for generate to address",
                Duration::from_secs(1),
            )
            .await;
        }
        assert!(matches!(
            listTransactions(federation.clone(), None, None).await?[0]
                .transaction
                .kind,
            RpcTransactionKind::OnchainDeposit {
                state: Some(RpcOnchainDepositState::Claimed(_)),
                ..
            }
        ),);

        let btc_amount = Amount::from_sats(10_000_000);
        let pegin_fees = federation.client.wallet()?.get_fee_consensus().peg_in_abs;
        let receive_fedi_fee = Amount::from_msats(
            ((btc_amount.msats - pegin_fees.msats) * fedi_fees_receive_ppm).div_ceil(MILLION),
        );
        assert_eq!(
            btc_amount,
            federation.get_balance().await + receive_fedi_fee + pegin_fees,
        );

        Ok(())
    }

    async fn test_ecash_cancel() -> anyhow::Result<()> {
        let (_bridge, federation) = setup().await?;

        // receive ecash
        let ecash_receive_amount = fedimint_core::Amount::from_msats(100);
        let ecash = cli_generate_ecash(ecash_receive_amount).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
        wait_for_ecash_reissue(federation.as_ref()).await?;

        // check balance
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // spend half of received ecash
        let send_ecash = generateEcash(
            federation.clone(),
            RpcAmount(Amount::from_msats(ecash_receive_amount.msats / 2)),
            false,
            FrontendMetadata::default(),
        )
        .await?
        .ecash;

        // if you notice this flake in CI, revert this change
        cancelEcash(federation.clone(), send_ecash).await?;
        Ok(())
    }

    async fn test_backup_and_recovery() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }
        test_backup_and_recovery_inner(false).await
    }

    async fn test_backup_and_recovery_from_scratch() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }
        test_backup_and_recovery_inner(true).await
    }

    async fn test_backup_and_recovery_inner(from_scratch: bool) -> anyhow::Result<()> {
        let (backup_bridge, federation) = setup().await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = backup_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let expected_fedi_fee =
            Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

        let ecash_balance_before = federation.get_balance().await;

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        let mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;
        drop(federation);
        drop(backup_bridge);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let recovery_bridge = setup_bridge().await?;
        recoverFromMnemonic(&recovery_bridge, mnemonic).await?;

        // Re-register device as index 0 since it's the same device
        transferExistingDeviceRegistration(&recovery_bridge, 0).await?;

        // Rejoin federation and assert that balances are correct
        let recovery_federation = join_test_fed_recovery(&recovery_bridge, from_scratch).await?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if recovery_bridge
                .runtime
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let recovery_federation = recovery_bridge.federations.get_federation(&id.0)?;
        // Currently, accrued fedi fee is merged back into balance upon recovery
        // wait atmost 10s
        for _ in 0..100 {
            if ecash_balance_before + expected_fedi_fee == recovery_federation.get_balance().await {
                break;
            }
            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        assert_eq!(
            ecash_balance_before + expected_fedi_fee,
            recovery_federation.get_balance().await
        );

        let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());
        Ok(())
    }

    async fn test_validate_ecash() -> anyhow::Result<()> {
        let (bridge, _) = setup().await?;
        let v2_ecash = "AgEEsuFO5gD3AwQBmW/h68gy6W5cgnl93aTdduN1OnnFofSCqjth03Q6CA+fXnKlVXQSIVSLqcHzsbhozAuo2q5jPMsO6XMZZZXaYvZyIdXzCUIuDNhdCHkGJWAgAa9M5zsSPPVWDVeCWgkerg0Z+Xv8IQGMh7rsgpLh77NCSVRKA2i4fBYNwPglSbkGs42Yllmz6HJtgmmtl/tdjcyVSR30Nc2cfkZYTJcEEnRjQAGC8ZX5eLYQB8rCAZiX5/gQX2QtjasZMy+BJ67kJ0klVqsS9G1IVWhea6ILISOd9H1MJElma8aHBiWBaWeGjrCXru8Ns7Lz4J18CbxFdHyWEQ==";
        validateEcash(&bridge, v2_ecash.into()).await?;
        Ok(())
    }

    async fn test_social_backup_and_recovery() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        std::env::set_var(FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV, "1");

        let (original_bridge, federation) = setup().await?;
        let recovery_bridge = setup_bridge().await?;
        let (guardian_bridge, _) = setup().await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = original_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let expected_fedi_fee =
            Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

        let ecash_balance_before = federation.get_balance().await;

        // set username and do a backup
        let federation_id = federation.rpc_federation_id();
        backupNow(federation.clone()).await?;

        // Get original mnemonic (for comparison later)
        let initial_words = getMnemonic(original_bridge.runtime.clone()).await?;
        info!("initial mnemnoic {:?}", &initial_words);

        // Upload backup
        let video_file_path = get_fixture_dir().join("backup.fedi");
        let video_file_contents = tokio::fs::read(&video_file_path).await?;
        let recovery_file_path =
            uploadBackupFile(&original_bridge, federation_id.clone(), video_file_path).await?;
        let locate_recovery_file_path = locateRecoveryFile(original_bridge.runtime.clone()).await?;
        assert_eq!(recovery_file_path, locate_recovery_file_path);

        // use new bridge from here (simulating a new app install)

        // Validate recovery file
        validateRecoveryFile(&recovery_bridge, recovery_file_path).await?;

        // Generate recovery QR
        let qr = recoveryQr(&recovery_bridge)
            .await?
            .expect("recovery must be started started");
        let recovery_id = qr.recovery_id;

        // Guardian downloads verification document
        let verification_doc_path = socialRecoveryDownloadVerificationDoc(
            &guardian_bridge,
            federation_id.clone(),
            recovery_id,
            RpcPeerId(fedimint_core::PeerId::from(1)),
        )
        .await?
        .unwrap();
        let contents = tokio::fs::read(verification_doc_path).await?;
        let _ = VerificationDocument::from_raw(&contents);
        assert_eq!(contents, video_file_contents);

        // 3 guardians approves
        for i in 0..3 {
            let password = "p";
            approveSocialRecoveryRequest(
                &guardian_bridge,
                federation_id.clone(),
                recovery_id,
                RpcPeerId(fedimint_core::PeerId::from(i)),
                password.into(),
            )
            .await?;
        }

        // Member checks approval status
        let social_recovery_event = socialRecoveryApprovals(&recovery_bridge).await?;
        assert_eq!(0, social_recovery_event.remaining);
        assert_eq!(
            3,
            social_recovery_event
                .approvals
                .iter()
                .filter(|app| app.approved)
                .count()
        );

        // Member combines decryption shares, loading recovered mnemonic back into their
        // db
        completeSocialRecovery(&recovery_bridge).await?;

        // Re-register device as index 0 since it's the same device
        transferExistingDeviceRegistration(&recovery_bridge, 0).await?;

        // Check backups match (TODO: how can I make sure that they're equal b/c nothing
        // happened?)
        let final_words: Vec<String> = getMnemonic(recovery_bridge.runtime.clone()).await?;
        assert_eq!(initial_words, final_words);

        // Assert that balances are correct
        let recovery_federation = recovery_bridge
            .federations
            .get_federation_maybe_recovering(&federation_id.0)?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if recovery_bridge
                .runtime
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let recovery_federation = recovery_bridge.federations.get_federation(&id.0)?;
        // Currently, accrued fedi fee is merged back into balance upon recovery
        assert_eq!(
            ecash_balance_before + expected_fedi_fee,
            recovery_federation.get_balance().await
        );

        let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());

        Ok(())
    }

    async fn test_stability_pool() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        // Vec of tuple of (send_ppm, receive_ppm)
        let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
        for (send_ppm, receive_ppm) in fee_ppm_values {
            test_stability_pool_with_fedi_fees(send_ppm, receive_ppm).await?;
        }

        Ok(())
    }

    async fn test_stability_pool_with_fedi_fees(
        fedi_fees_send_ppm: u64,
        fedi_fees_receive_ppm: u64,
    ) -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        setStabilityPoolModuleFediFeeSchedule(
            &bridge,
            federation.rpc_federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        // Test default account info state
        let account_info = stabilityPoolAccountInfo(federation.clone(), true).await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert!(account_info.staged_seeks.is_empty());
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());

        // Receive some ecash first
        let initial_balance = Amount::from_msats(500_000);
        let ecash = cli_generate_ecash(initial_balance).await?;
        let (receive_amount, _) = federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;

        // Deposit to seek and verify account info
        let amount_to_deposit = Amount::from_msats(receive_amount.msats / 2);
        let deposit_fedi_fee =
            Amount::from_msats((amount_to_deposit.msats * fedi_fees_send_ppm).div_ceil(MILLION));
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
        loop {
            // Wait until deposit operation succeeds
            // Initiated -> TxAccepted -> Success
            if bridge
                .runtime
                .event_sink
                .num_events_of_type("stabilityPoolDeposit".into())
                == 3
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }

        assert_eq!(
            receive_amount - amount_to_deposit - deposit_fedi_fee,
            federation.get_balance().await,
        );
        let account_info = stabilityPoolAccountInfo(federation.clone(), true).await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());

        // Withdraw and verify account info
        let amount_to_withdraw = Amount::from_msats(amount_to_deposit.msats / 2);
        let withdraw_fedi_fee = Amount::from_msats(
            (amount_to_withdraw.msats * fedi_fees_receive_ppm).div_ceil(MILLION),
        );
        stabilityPoolWithdraw(
            federation.clone(),
            RpcAmount(amount_to_withdraw),
            0, // nothing locked that can be withdrawn
        )
        .await?;
        loop {
            // Wait until withdrawal operation succeeds
            // WithdrawUnlockedInitiated -> WithdrawUnlockedAccepted ->
            // Success
            if bridge
                .runtime
                .event_sink
                .num_events_of_type("stabilityPoolWithdrawal".into())
                == 3
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }

        assert_eq!(
            receive_amount - amount_to_deposit - deposit_fedi_fee + amount_to_withdraw
                - withdraw_fedi_fee,
            federation.get_balance().await,
        );
        let account_info = stabilityPoolAccountInfo(federation.clone(), true).await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert_eq!(
            account_info.staged_seeks[0].0.msats,
            amount_to_deposit.msats / 2
        );
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());
        Ok(())
    }

    async fn test_spv2() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        // Vec of tuple of (send_ppm, receive_ppm)
        let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
        for (send_ppm, receive_ppm) in fee_ppm_values {
            test_spv2_with_fedi_fees(send_ppm, receive_ppm).await?;
        }

        Ok(())
    }

    async fn test_spv2_with_fedi_fees(
        fedi_fees_send_ppm: u64,
        fedi_fees_receive_ppm: u64,
    ) -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        setSPv2ModuleFediFeeSchedule(
            &bridge,
            federation.rpc_federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        // Test default account info state
        let RpcSPv2CachedSyncResponse { sync_response, .. } =
            spv2AccountInfo(federation.clone()).await?;
        assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
        assert_eq!(sync_response.staged_balance.0, Amount::ZERO);
        assert_eq!(sync_response.locked_balance.0, Amount::ZERO);
        assert!(sync_response.pending_unlock_request.is_none());

        // Receive some ecash first
        let initial_balance = Amount::from_msats(500_000);
        let ecash = cli_generate_ecash(initial_balance).await?;
        let (receive_amount, _) = federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;

        // Deposit to seek and verify account info
        let amount_to_deposit = Amount::from_msats(receive_amount.msats / 2);
        let deposit_fedi_fee =
            Amount::from_msats((amount_to_deposit.msats * fedi_fees_send_ppm).div_ceil(MILLION));
        spv2DepositToSeek(
            federation.clone(),
            RpcAmount(amount_to_deposit),
            FrontendMetadata::default(),
        )
        .await?;
        loop {
            // Wait until deposit operation succeeds
            // Initiated -> TxAccepted -> Success
            if bridge
                .runtime
                .event_sink
                .num_events_of_type("spv2Deposit".into())
                == 3
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }

        assert_eq!(
            receive_amount - amount_to_deposit - deposit_fedi_fee,
            federation.get_balance().await,
        );
        let RpcSPv2CachedSyncResponse { sync_response, .. } =
            spv2AccountInfo(federation.clone()).await?;
        assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
        assert_eq!(sync_response.staged_balance.0, amount_to_deposit);
        assert!(sync_response.pending_unlock_request.is_none());
        assert_eq!(sync_response.locked_balance.0, Amount::ZERO);

        // Withdraw and verify account info
        let amount_to_withdraw = Amount::from_msats(200_000);
        let withdraw_fedi_fee = Amount::from_msats(
            (amount_to_withdraw.msats * fedi_fees_receive_ppm).div_ceil(MILLION),
        );
        spv2Withdraw(
            federation.clone(),
            FiatAmount::from_btc_amount(
                amount_to_withdraw,
                FiatAmount(sync_response.curr_cycle_start_price),
            )?
            .0
            .try_into()?,
            FrontendMetadata::default(),
        )
        .await?;
        loop {
            // Wait until withdrawal operation succeeds
            // Initiated -> UnlockTxAccepted -> WithdrawalInitiated -> WithdrawalTxAccepted
            // -> Success
            if bridge
                .runtime
                .event_sink
                .num_events_of_type("spv2Withdrawal".into())
                == 5
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }

        assert_eq!(
            receive_amount - amount_to_deposit - deposit_fedi_fee + amount_to_withdraw
                - withdraw_fedi_fee,
            federation.get_balance().await,
        );
        let RpcSPv2CachedSyncResponse { sync_response, .. } =
            spv2AccountInfo(federation.clone()).await?;
        assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
        assert_eq!(
            sync_response.staged_balance.0.msats,
            amount_to_deposit.msats - amount_to_withdraw.msats
        );
        assert!(sync_response.pending_unlock_request.is_none());
        assert_eq!(sync_response.locked_balance.0, Amount::ZERO);
        Ok(())
    }

    async fn test_lnurl_sign_message() -> anyhow::Result<()> {
        let (bridge, _federation) = setup().await?;
        let k1 = String::from("cfcb7616d615252180e392f509207e1f610f8d6106588c61c3e7bbe8577e4c4c");
        let message = Message::from_digest_slice(&hex::decode(k1)?)?;
        let domain1 = String::from("fedi.xyz");
        let domain2 = String::from("fedimint.com");

        // Test signing a message.
        let sig1 = bridge
            .runtime
            .sign_lnurl_message(message, domain1.clone())
            .await?;

        // Test that signing the same message twice results in identical signatures.
        let sig2 = bridge
            .runtime
            .sign_lnurl_message(message, domain1.clone())
            .await?;
        info!("Signature 2: {}", sig2.signature.to_string());
        assert_eq!(
            serde_json::to_string(&sig1.pubkey)?,
            serde_json::to_string(&sig2.pubkey)?
        );
        assert_eq!(sig1.signature, sig2.signature);

        // Test that signing the same message on a different domain results in a
        // different signature.
        let sig3 = bridge
            .runtime
            .sign_lnurl_message(message, domain2.clone())
            .await?;
        info!("Signature 3: {}", sig3.signature.to_string());
        assert_ne!(
            serde_json::to_string(&sig1.pubkey)?,
            serde_json::to_string(&sig3.pubkey)?
        );
        assert_ne!(sig1.signature, sig3.signature);

        Ok(())
    }

    async fn test_federation_preview() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();

        drop(federation);
        drop(bridge);

        let bridge = setup_bridge().await?;
        assert!(matches!(
            federationPreview(&bridge.federations, invite_code.clone())
                .await?
                .returning_member_status,
            RpcReturningMemberStatus::NewMember
        ));

        // join
        let fedimint_federation =
            joinFederation(&bridge.federations, invite_code.clone(), false).await?;
        let federation = bridge
            .federations
            .get_federation(&fedimint_federation.id.0)?;
        use_lnd_gateway(&federation).await?;

        // receive ecash and backup
        let ecash = cli_generate_ecash(fedimint_core::Amount::from_msats(10_000)).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;
        let federation_id = federation.rpc_federation_id();
        backupNow(federation.clone()).await?;
        drop(federation);

        // extract mnemonic, leave federation and drop bridge
        let mnemonic = getMnemonic(bridge.runtime.clone()).await?;
        leaveFederation(&bridge.federations, federation_id.clone()).await?;
        drop(bridge);

        // query preview again w/ new bridge (recovered using mnemonic), it should be
        // "returning"
        let bridge = setup_bridge().await?;
        recoverFromMnemonic(&bridge, mnemonic).await?;

        // Re-register device as index 0 since it's the same device
        transferExistingDeviceRegistration(&bridge, 0).await?;

        assert!(matches!(
            federationPreview(&bridge.federations, invite_code.clone())
                .await?
                .returning_member_status,
            RpcReturningMemberStatus::ReturningMember
        ));

        Ok(())
    }

    async fn test_join_fails_post_recovery_index_unassigned() -> anyhow::Result<()> {
        let device_identifier = "bridge:test:fd3e4705-f453-45ee-9e84-4bd4fdc6c22a".to_string();
        let mock_fedi_api = Arc::new(MockFediApi::default());
        let (backup_bridge, federation) = setup_custom(
            device_identifier.clone(),
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;

        // Device index should be 0 since it's a fresh seed
        assert!(matches!(
            deviceIndexAssignmentStatus(backup_bridge.runtime.clone()).await?,
            RpcDeviceIndexAssignmentStatus::Assigned(0)
        ));

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        let mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;
        drop(federation);
        drop(backup_bridge);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let recovery_bridge = setup_bridge_custom(
            device_identifier,
            mock_fedi_api,
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(&recovery_bridge, mnemonic).await?;

        // Device index should be unassigned since it's a recovery
        assert!(matches!(
            deviceIndexAssignmentStatus(recovery_bridge.runtime.clone()).await?,
            RpcDeviceIndexAssignmentStatus::Unassigned
        ));

        // Rejoining federation should fail since device index wasn't assigned
        assert!(join_test_fed_recovery(&recovery_bridge, false)
            .await
            .is_err());
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_transfer_device_registration_no_feds() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        let device_identifier_1 = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let mock_fedi_api = Arc::new(MockFediApi::default());
        let bridge_1 = setup_bridge_custom(
            device_identifier_1,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;

        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic (not dropping old bridge so we can assert device
        // index being stolen)
        let mnemonic = getMnemonic(bridge_1.runtime.clone()).await?;

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let device_identifier_2 = "bridge_2:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724".to_string();
        let bridge_2 = setup_bridge_custom(
            device_identifier_2,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(&bridge_2, mnemonic.clone()).await?;

        // Register device as index 0 since it's a transfer
        transferExistingDeviceRegistration(&bridge_2, 0).await?;

        // Verify that original device would see the conflict whenever its background
        // service would try to renew registration. The conflict event is what the
        // front-end uses to block further user action.
        let registration_conflict_body = serde_json::to_string(&DeviceRegistrationEvent {
            state: crate::event::DeviceRegistrationState::Conflict,
        })
        .expect("failed to json serialize");
        assert!(!bridge_1
            .runtime
            .event_sink
            .events()
            .iter()
            .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
                && *ev_body == registration_conflict_body));
        assert!(bridge_1.register_device_with_index(0, false).await.is_err());
        assert!(bridge_1
            .runtime
            .event_sink
            .events()
            .iter()
            .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
                && *ev_body == registration_conflict_body));
        drop(bridge_1);

        // Create 3rd bridge which hasn't joined federation yet and recover mnemnonic
        let device_identifier_3 = "bridge_3:test:ed086973-98c7-4ad0-8f03-52ba7280b9c0".to_string();
        let bridge_3 = setup_bridge_custom(
            device_identifier_3,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(&bridge_3, mnemonic.clone()).await?;

        // Register device as index 0 since it's a transfer
        transferExistingDeviceRegistration(&bridge_3, 0).await?;

        // Verify that 2nd device would see the conflict whenever its background
        // service would try to renew registration.
        assert!(bridge_2.register_device_with_index(0, false).await.is_err());

        Ok(())
    }

    async fn test_transfer_device_registration_post_recovery() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        let device_identifier_1 = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let mock_fedi_api = Arc::new(MockFediApi::default());
        let (backup_bridge, federation) = setup_custom(
            device_identifier_1,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = backup_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let expected_fedi_fee =
            Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

        let ecash_balance_before = federation.get_balance().await;

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic (not dropping old bridge so we can assert device
        // index being stolen)
        let mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;
        drop(federation);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let device_identifier_2 = "bridge_2:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724".to_string();
        let recovery_bridge = setup_bridge_custom(
            device_identifier_2,
            mock_fedi_api,
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(&recovery_bridge, mnemonic).await?;

        // Register device as index 0 since it's a transfer
        transferExistingDeviceRegistration(&recovery_bridge, 0).await?;

        // Rejoin federation and assert that balances are correct
        let recovery_federation = join_test_fed_recovery(&recovery_bridge, false).await?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if recovery_bridge
                .runtime
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let recovery_federation = recovery_bridge.federations.get_federation(&id.0)?;
        // Currently, accrued fedi fee is merged back into balance upon recovery
        assert_eq!(
            ecash_balance_before + expected_fedi_fee,
            recovery_federation.get_balance().await
        );

        let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());

        // Verify that original device would see the conflict whenever its background
        // service would try to renew registration. The conflict event is what the
        // front-end uses to block further user action.
        let registration_conflict_body = serde_json::to_string(&DeviceRegistrationEvent {
            state: crate::event::DeviceRegistrationState::Conflict,
        })
        .expect("failed to json serialize");
        assert!(!backup_bridge
            .runtime
            .event_sink
            .events()
            .iter()
            .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
                && *ev_body == registration_conflict_body));
        assert!(backup_bridge
            .register_device_with_index(0, false)
            .await
            .is_err());
        assert!(backup_bridge
            .runtime
            .event_sink
            .events()
            .iter()
            .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
                && *ev_body == registration_conflict_body));
        Ok(())
    }

    async fn test_new_device_registration_post_recovery() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        let device_identifier_1 = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let mock_fedi_api = Arc::new(MockFediApi::default());
        let (backup_bridge, federation) = setup_custom(
            device_identifier_1,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        let mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;
        drop(federation);
        drop(backup_bridge);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let device_identifier_2 = "bridge_2:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724".to_string();
        let recovery_bridge = setup_bridge_custom(
            device_identifier_2,
            mock_fedi_api,
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(&recovery_bridge, mnemonic).await?;

        // Register device as index 1 since it's a new device
        registerAsNewDevice(&recovery_bridge).await?;

        // Rejoin federation and assert that balances don't carry over (and there is no
        // backup)
        let recovery_federation = join_test_fed_recovery(&recovery_bridge, false).await?;
        assert!(!recovery_federation.recovering());
        assert_eq!(Amount::ZERO, recovery_federation.get_balance().await);

        let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert!(account_info.staged_seeks.is_empty());
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());
        Ok(())
    }

    const COMMUNITY_JSON_0: &str = r#"{
        "version": 1,
        "federation_icon_url": "https://fedi-public-snapshots.s3.amazonaws.com/icons/bitcoin-principles.png",
        "name": "0 Bitcoin Principles",
        "fedimods": "[{\"id\":\"swap\",\"url\":\"https://ln-swap.vercel.app\",\"title\":\"SWAP\",\"imageUrl\":\"https://ln-swap.vercel.app/logo.png\"},{\"id\":\"bitrefill\",\"url\":\"https://embed.bitrefill.com/?paymentMethod=lightning&ref=bezsoYNf&utm_source=fedi\",\"title\":\"Bitrefill\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/bitrefill.png\"},{\"id\":\"lngpt\",\"url\":\"https://lngpt.vercel.app\",\"title\":\"AI Assistant\",\"imageUrl\":\"https://lngpt.vercel.app/logo.png\"},{\"id\":\"tbc\",\"url\":\"https://embed.thebitcoincompany.com/giftcard\",\"title\":\"The Bitcoin Company\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/thebitcoincompany.jpg\"},{\"id\":\"btcmap\",\"url\":\"https://btcmap.org/map\",\"title\":\"BTC Map\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/btcmap.png\"},{\"id\":\"fedisupport\",\"url\":\"https://support.fedi.xyz\",\"title\":\"Support\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/fedi-faq-logo.png\"}]",
        "default_currency": "USD",
        "welcome_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "tos_url": "https://tos-fedi.replit.app/btc-principles.html",
        "preview_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "public": "false",
        "default_group_chats": "[\"fzvjqrtcwcswn4kocj1htpdd\"]"
    }"#;
    const COMMUNITY_JSON_1: &str = r#"{
        "version": 1,
        "federation_icon_url": "https://fedi-public-snapshots.s3.amazonaws.com/icons/bitcoin-principles.png",
        "name": "1 Bitcoin Principles",
        "fedimods": "[{\"id\":\"swap\",\"url\":\"https://ln-swap.vercel.app\",\"title\":\"SWAP\",\"imageUrl\":\"https://ln-swap.vercel.app/logo.png\"},{\"id\":\"bitrefill\",\"url\":\"https://embed.bitrefill.com/?paymentMethod=lightning&ref=bezsoYNf&utm_source=fedi\",\"title\":\"Bitrefill\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/bitrefill.png\"},{\"id\":\"lngpt\",\"url\":\"https://lngpt.vercel.app\",\"title\":\"AI Assistant\",\"imageUrl\":\"https://lngpt.vercel.app/logo.png\"},{\"id\":\"tbc\",\"url\":\"https://embed.thebitcoincompany.com/giftcard\",\"title\":\"The Bitcoin Company\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/thebitcoincompany.jpg\"},{\"id\":\"btcmap\",\"url\":\"https://btcmap.org/map\",\"title\":\"BTC Map\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/btcmap.png\"},{\"id\":\"fedisupport\",\"url\":\"https://support.fedi.xyz\",\"title\":\"Support\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/fedi-faq-logo.png\"}]",
        "default_currency": "USD",
        "welcome_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "tos_url": "https://tos-fedi.replit.app/btc-principles.html",
        "preview_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "public": "false",
        "default_group_chats": "[\"fzvjqrtcwcswn4kocj1htpdd\"]"
    }"#;

    #[tokio::test(flavor = "multi_thread")]
    async fn test_preview_and_join_community() -> anyhow::Result<()> {
        let bridge = setup_bridge().await?;

        let mut server = mockito::Server::new_async().await;
        let url = server.url();

        let invite_path = "/invite-0";
        let community_invite = CommunityInvite {
            community_meta_url: format!("{url}{invite_path}"),
        };
        let invite_json_str = serde_json::to_string(&community_invite)?;
        let invite_bytes = invite_json_str.as_bytes();
        let invite_code = bech32::encode::<Bech32m>(COMMUNITY_INVITE_CODE_HRP, invite_bytes)?;

        let mock = server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_0)
            .create_async()
            .await;

        communityPreview(&bridge, invite_code.clone()).await?;
        mock.assert();

        // Calling preview() does not join
        assert!(bridge.communities.communities.lock().await.is_empty());
        assert!(bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .is_empty());

        // Calling join() actually joins
        joinCommunity(&bridge, invite_code.clone()).await?;
        let memory_community = bridge
            .communities
            .communities
            .lock()
            .await
            .get(&invite_code)
            .unwrap()
            .clone();
        let app_state_community = bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .get(&invite_code)
            .unwrap()
            .clone();
        assert!(memory_community.meta.read().await.to_owned() == app_state_community.meta);

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_list_and_leave_community() -> anyhow::Result<()> {
        let bridge = setup_bridge().await?;

        let mut server = mockito::Server::new_async().await;
        let url = server.url();

        let invite_path = "/invite-0";
        let community_invite = CommunityInvite {
            community_meta_url: format!("{url}{invite_path}"),
        };
        let invite_json_str = serde_json::to_string(&community_invite)?;
        let invite_bytes = invite_json_str.as_bytes();
        let invite_code_0 = bech32::encode::<Bech32m>(COMMUNITY_INVITE_CODE_HRP, invite_bytes)?;

        server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_0)
            .create_async()
            .await;

        let invite_path = "/invite-1";
        let community_invite = CommunityInvite {
            community_meta_url: format!("{url}{invite_path}"),
        };
        let invite_json_str = serde_json::to_string(&community_invite)?;
        let invite_bytes = invite_json_str.as_bytes();
        let invite_code_1 = bech32::encode::<Bech32m>(COMMUNITY_INVITE_CODE_HRP, invite_bytes)?;

        server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_1)
            .create_async()
            .await;

        // Initially no joined communities
        assert!(listCommunities(&bridge).await?.is_empty());

        // Leaving throws error
        assert!(leaveCommunity(&bridge, invite_code_0.clone())
            .await
            .is_err());

        // Join community 0
        joinCommunity(&bridge, invite_code_0.clone()).await?;

        // List contains community 0
        assert!(matches!(
                &listCommunities(&bridge).await?[..],
                [RpcCommunity { invite_code, .. }] if *invite_code == invite_code_0));

        // Join community 1
        joinCommunity(&bridge, invite_code_1.clone()).await?;

        // List contains community 0 + community 1
        assert!(matches!(
                &listCommunities(&bridge).await?[..], [
                    RpcCommunity { invite_code: invite_0, .. },
                    RpcCommunity { invite_code: invite_1, .. }
                ] if (*invite_0 == invite_code_0 && *invite_1 == invite_code_1) ||
                (*invite_0 == invite_code_1 && *invite_1 == invite_code_0)));

        // Leave community 0
        leaveCommunity(&bridge, invite_code_0.clone()).await?;

        // List contains only community 1
        assert!(matches!(
                &listCommunities(&bridge).await?[..],
                [RpcCommunity { invite_code, .. }] if *invite_code == invite_code_1));

        // Leave community 1
        leaveCommunity(&bridge, invite_code_1).await?;

        // No joined communities
        assert!(listCommunities(&bridge).await?.is_empty());

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_community_meta_bg_refresh() -> anyhow::Result<()> {
        let bridge = setup_bridge().await?;

        let mut server = mockito::Server::new_async().await;
        let url = server.url();

        let invite_path = "/invite-0";
        let community_invite = CommunityInvite {
            community_meta_url: format!("{url}{invite_path}"),
        };
        let invite_json_str = serde_json::to_string(&community_invite)?;
        let invite_bytes = invite_json_str.as_bytes();
        let invite_code = bech32::encode::<Bech32m>(COMMUNITY_INVITE_CODE_HRP, invite_bytes)?;

        server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_0)
            .create_async()
            .await;

        // Calling join() actually joins
        joinCommunity(&bridge, invite_code.clone()).await?;
        let memory_community = bridge
            .communities
            .communities
            .lock()
            .await
            .get(&invite_code)
            .unwrap()
            .clone();
        let app_state_community = bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .get(&invite_code)
            .unwrap()
            .clone();
        assert!(memory_community.meta.read().await.to_owned() == app_state_community.meta);
        assert!(
            serde_json::to_value(memory_community.meta.read().await.to_owned()).unwrap()
                == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_0).unwrap()
        );

        server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_1)
            .create_async()
            .await;
        bridge.on_app_foreground();

        loop {
            fedimint_core::task::sleep(Duration::from_millis(10)).await;
            let memory_community = bridge
                .communities
                .communities
                .lock()
                .await
                .get(&invite_code)
                .unwrap()
                .clone();
            let app_state_community = bridge
                .runtime
                .app_state
                .with_read_lock(|state| state.joined_communities.clone())
                .await
                .get(&invite_code)
                .unwrap()
                .clone();
            if memory_community.meta.read().await.to_owned() != app_state_community.meta {
                continue;
            }
            if serde_json::to_value(memory_community.meta.read().await.to_owned()).unwrap()
                == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_0).unwrap()
            {
                continue;
            }

            assert!(
                serde_json::to_value(memory_community.meta.read().await.to_owned()).unwrap()
                    == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_1).unwrap()
            );
            break;
        }

        Ok(())
    }

    async fn test_fee_remittance_on_startup() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        // Setup bridge, join test federation, set SP send fee ppm
        let device_identifier = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let (bridge, federation) = setup_custom(
            device_identifier.clone(),
            Arc::new(MockFediApi::default()),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        setStabilityPoolModuleFediFeeSchedule(&bridge, federation.rpc_federation_id(), 210_000, 0)
            .await?;

        // Receive ecash, verify no pending or outstanding fees
        let ecash = cli_generate_ecash(Amount::from_msats(2_000_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);
        assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        // Make SP deposit, verify pending fees
        let amount_to_deposit = Amount::from_msats(1_000_000);
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
        assert_eq!(
            Amount::from_msats(210_000),
            federation.get_pending_fedi_fees().await
        );
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        // Wait for SP deposit to be accepted, verify outstanding fees
        loop {
            // Wait until deposit operation succeeds
            // Initiated -> TxAccepted -> Success
            if bridge
                .runtime
                .event_sink
                .num_events_of_type("stabilityPoolDeposit".into())
                == 3
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
        assert_eq!(
            Amount::from_msats(210_000),
            federation.get_outstanding_fedi_fees().await
        );

        // No fee can be remitted just yet cuz we haven't mocked invoice endpoint

        // Extract data dir and drop bridge
        let federation_id = federation.federation_id();
        let data_dir = bridge.runtime.storage.platform_path(Path::new(""));
        drop(federation);
        bridge
            .runtime
            .task_group
            .clone()
            .shutdown_join_all(Duration::from_secs(5))
            .await?;
        drop(bridge);

        // Mock fee remittance endpoint
        let (fedi_fee_invoice, label) = cli_generate_invoice(&Amount::from_msats(210_000)).await?;
        let mut mock_fedi_api = MockFediApi::default();
        mock_fedi_api.set_fedi_fee_invoice(fedi_fee_invoice.clone());

        // Create new bridge using same data dir
        let new_bridge = setup_bridge_custom_with_data_dir(
            device_identifier,
            Arc::new(mock_fedi_api),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
            data_dir,
        )
        .await?;

        // Wait for fedi fee to be remitted (timeout of 5s)
        fedimint_core::task::timeout(Duration::from_secs(5), cln_wait_invoice(&label)).await??;

        // Ensure outstanding fee has been cleared
        let federation = new_bridge
            .federations
            .get_federation(&federation_id.to_string())?;
        assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        Ok(())
    }

    async fn test_fee_remittance_post_successful_tx() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        // Mock fee remittance endpoint
        let (fedi_fee_invoice, label) = cli_generate_invoice(&Amount::from_msats(210_000)).await?;
        let mut mock_fedi_api = MockFediApi::default();
        mock_fedi_api.set_fedi_fee_invoice(fedi_fee_invoice.clone());

        // Setup bridge, join test federation, set SP send fee ppm
        let device_identifier = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let (bridge, federation) = setup_custom(
            device_identifier.clone(),
            Arc::new(mock_fedi_api),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        setStabilityPoolModuleFediFeeSchedule(&bridge, federation.rpc_federation_id(), 210_000, 0)
            .await?;

        // Receive ecash, verify no pending or outstanding fees
        let ecash = cli_generate_ecash(Amount::from_msats(2_000_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);
        assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        // Make SP deposit, verify pending fees
        let amount_to_deposit = Amount::from_msats(1_000_000);
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
        assert_eq!(
            Amount::from_msats(210_000),
            federation.get_pending_fedi_fees().await
        );
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        // Wait for SP deposit to be accepted, verify fee remittance
        loop {
            // Wait until deposit operation succeeds
            // Initiated -> TxAccepted -> Success
            if bridge
                .runtime
                .event_sink
                .num_events_of_type("stabilityPoolDeposit".into())
                == 3
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }

        // Wait for fedi fee to be remitted
        fedimint_core::task::timeout(Duration::from_secs(30), cln_wait_invoice(&label)).await??;

        // Ensure outstanding fee has been cleared
        assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        Ok(())
    }

    async fn test_reused_ecash_proofs() -> anyhow::Result<()> {
        let bridge_dir1 = create_data_dir();
        let bridge_dir2 = create_data_dir();

        let mnemonic;
        // trigger seed reuse
        {
            let device_identifier1 = "bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned();
            let fedi_api = Arc::new(MockFediApi::default());
            let bridge1 = setup_bridge_custom_with_data_dir(
                device_identifier1.clone(),
                fedi_api.clone(),
                FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
                bridge_dir1.clone(),
            )
            .await?;
            mnemonic = getMnemonic(bridge1.runtime.clone()).await?;

            // trigger seed reuse: a second bridge with same seed and same device identifier
            let bridge2 = setup_bridge_custom_with_data_dir(
                device_identifier1.clone(),
                fedi_api.clone(),
                FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
                bridge_dir2.clone(),
            )
            .await?;
            recoverFromMnemonic(&bridge2, mnemonic.clone()).await?;
            transferExistingDeviceRegistration(&bridge2, 0).await?;

            let (federation_b1, federation_b2) =
                tokio::try_join!(join_test_fed(&bridge1), join_test_fed(&bridge2))?;
            let ecash_receive_amount = fedimint_core::Amount::from_msats(10000);

            // use some note indices
            let ecash1 = cli_generate_ecash(ecash_receive_amount).await?;
            receiveEcash(federation_b1.clone(), ecash1, FrontendMetadata::default()).await?;
            wait_for_ecash_reissue(&federation_b1).await?;

            // trigger note index reuse
            let ecash2 = cli_generate_ecash(ecash_receive_amount).await?;
            receiveEcash(federation_b2.clone(), ecash2, FrontendMetadata::default()).await?;
            // this will still pass but federation will have unspendable ecash
            wait_for_ecash_reissue(&federation_b2).await?;

            // kill both bridges
            drop(federation_b1);
            drop(federation_b2);
            tokio::try_join!(
                bridge1
                    .runtime
                    .task_group
                    .clone()
                    .shutdown_join_all(Duration::from_secs(5)),
                bridge2
                    .runtime
                    .task_group
                    .clone()
                    .shutdown_join_all(Duration::from_secs(5))
            )?;
            drop(bridge1);
            drop(bridge2);
        }

        let bridge = setup_bridge().await?;
        recoverFromMnemonic(&bridge, mnemonic).await?;
        registerAsNewDevice(&bridge).await?;
        let recovery_federation = join_test_fed_recovery(&bridge, true).await?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if bridge
                .runtime
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let federation = bridge.federations.get_federation(&id.0)?;
        let proofs = generateReusedEcashProofs(federation.clone()).await?;
        assert!(
            proofs.0.total_amount_msats > Amount::ZERO,
            "there must be some amount in proof"
        );
        proofs
            .0
            .deserialize()?
            .into_iter()
            .map(|x| x.verify())
            .collect::<anyhow::Result<Vec<_>>>()
            .context("verification failed")?;
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_bridge_handles_federation_offline() -> anyhow::Result<()> {
        let mut dev_fed = dev_fed().await?;
        let invite_code = dev_fed.fed.invite_code()?;

        // Create data directory and initialize bridge
        let device_identifier = "bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned();
        let fedi_api = Arc::new(MockFediApi::default());
        let data_dir = create_data_dir();
        let bridge = setup_bridge_custom_with_data_dir(
            device_identifier.clone(),
            fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
            data_dir.clone(),
        )
        .await?;

        // Join federation
        let rpc_federation =
            joinFederation(&bridge.federations, invite_code.clone(), false).await?;
        let federation = bridge
            .federations
            .get_federation_maybe_recovering(&rpc_federation.id.0)?;
        use_lnd_gateway(&federation).await?;

        // receive ecash
        let ecash_receive_amount = fedimint_core::Amount::from_msats(10000);
        let ecash = cli_generate_ecash(ecash_receive_amount).await?;
        receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
        wait_for_ecash_reissue(&federation).await?;
        let original_balance = federation.get_balance().await;
        assert!(original_balance.msats != 0);

        // Clean shutdown of bridge
        drop(federation);
        bridge
            .runtime
            .task_group
            .clone()
            .shutdown_join_all(None)
            .await?;
        drop(bridge);

        // Stop federation
        dev_fed.fed.terminate_all_servers().await?;

        // Initialize new bridge with same data dir
        let bridge = setup_bridge_custom_with_data_dir(
            device_identifier,
            fedi_api,
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
            data_dir,
        )
        .await?;

        // Bridge should initialize successfully even though federation is down
        assert!(bridge.federations.get_federations_map().len() == 1);

        // Wait for federation ready event for a max of 2s
        let rpc_federation = fedimint_core::task::timeout(Duration::from_secs(2), async move {
            'check: loop {
                let events = bridge.runtime.event_sink.events();
                for (_, ev_body) in events.iter().rev().filter(|(kind, _)| kind == "federation") {
                    let ev_body =
                        serde_json::from_str::<RpcFederationMaybeLoading>(ev_body).unwrap();
                    match ev_body {
                        RpcFederationMaybeLoading::Loading { .. } => (),
                        RpcFederationMaybeLoading::Failed { error, id } => {
                            bail!("federation {:?} loading failed: {}", id, error.detail)
                        }
                        RpcFederationMaybeLoading::Ready(rpc_federation) => {
                            assert!(rpc_federation.invite_code == invite_code);
                            break 'check Ok::<_, anyhow::Error>(rpc_federation);
                        }
                    }
                }
                fedimint_core::task::sleep_in_test(
                    "waiting for federation ready event",
                    Duration::from_millis(100),
                )
                .await;
            }
        })
        .await??;

        // Ensure balance is still the same
        assert!(rpc_federation.balance.0 == original_balance);
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_existing_device_identifier_v2_migration() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        INIT_TRACING.call_once(|| {
            TracingSetup::default()
                .init()
                .expect("Failed to initialize tracing");
        });

        // Test: existing device, successfully registered with ID v1
        //         ownership transfer to ID v2 successful
        //         recreate bridge with same ID, all good
        //         recreate bridge with different ID, borked

        // Create data directory and initialize bridge
        let device_identifier_v1 = "bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned();
        let fedi_api = Arc::new(MockFediApi::default());
        let data_dir = create_data_dir();
        let bridge = setup_bridge_custom_with_data_dir(
            device_identifier_v1.clone(),
            fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
            data_dir.clone(),
        )
        .await?;

        // Tweak AppState to simulate existing install with only v1 identifier.
        // Transforms a freshly-created AppStateRaw that only has an
        // encrypted_device_identifier_v2 to look like an existing AppStateRaw
        // that only has an encrypted_device_identifier_v1.
        let app_state_raw_clone = bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.clone())
            .await;
        let mut app_state_raw_json = serde_json::to_value(app_state_raw_clone)?;
        let app_state_raw_object = app_state_raw_json
            .as_object_mut()
            .ok_or(anyhow!("App state must be valid JSON object"))?;
        app_state_raw_object.insert(
            "encrypted_device_identifier_v1".to_string(),
            serde_json::Value::String(bridge.runtime.app_state.encrypted_device_identifier().await),
        );
        app_state_raw_object.insert(
            "encrypted_device_identifier_v2".to_string(),
            serde_json::Value::Null,
        );

        // Write tweaked AppStateRaw
        let storage = bridge.runtime.storage.clone();
        bridge
            .runtime
            .task_group
            .clone()
            .shutdown_join_all(Duration::from_secs(5))
            .await?;
        drop(bridge);
        tokio::task::spawn_blocking(move || {
            storage.write_file_sync(
                Path::new(FEDI_FILE_PATH),
                serde_json::to_vec(&app_state_raw_json)?,
            )?;
            Ok::<(), anyhow::Error>(())
        })
        .await??;

        // Set up bridge again using same data_dir but now pass in v2 identifier
        let device_identifier_v2 = "bridge_2:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724".to_string();
        let bridge = setup_bridge_custom_with_data_dir(
            device_identifier_v2.clone(),
            fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
            data_dir.clone(),
        )
        .await?;

        // Verify ownership transfer to v2 identifier is successful (v1 must be None)
        fedimint_core::task::timeout(Duration::from_secs(2), async {
            loop {
                #[allow(deprecated)]
                if bridge
                    .runtime
                    .app_state
                    .encrypted_device_identifier_v1()
                    .await
                    .is_none()
                {
                    break Ok::<_, anyhow::Error>(());
                }
            }
        })
        .await??;
        bridge
            .runtime
            .task_group
            .clone()
            .shutdown_join_all(Duration::from_secs(5))
            .await?;
        drop(bridge);

        // Recreate bridge with same v2 ID, full bridge init should be successful
        let bridge = setup_bridge_custom_with_data_dir(
            device_identifier_v2.clone(),
            fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
            data_dir.clone(),
        )
        .await?;
        bridge
            .runtime
            .task_group
            .clone()
            .shutdown_join_all(Duration::from_secs(5))
            .await?;
        drop(bridge);

        // Try to recreate bridge with different v2 ID, full bridge init should fail
        let device_identifier_v2_2 =
            "bridge_3:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724".to_string();
        assert!(setup_bridge_custom_with_data_dir(
            device_identifier_v2_2,
            fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
            data_dir.clone(),
        )
        .await
        .is_err());

        Ok(())
    }
}
