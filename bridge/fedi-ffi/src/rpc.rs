#![allow(non_snake_case)]
use std::panic::PanicInfo;
use std::path::PathBuf;
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
use matrix_sdk::ruma::api::client::profile::get_profile;
use matrix_sdk::ruma::api::client::push::Pusher;
use matrix_sdk::ruma::directory::PublicRoomsChunk;
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use matrix_sdk::ruma::events::room::MediaSource;
use matrix_sdk::ruma::OwnedEventId;
use matrix_sdk::sliding_sync::Ranges;
use matrix_sdk::RoomInfo;
use mime::Mime;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
pub use tokio;
use tracing::{error, info, instrument, Level};

use super::bridge::Bridge;
use super::error::ErrorCode;
use super::storage::Storage;
use super::types::{
    RpcAmount, RpcFederation, RpcFederationId, RpcInvoice, RpcOperationId, RpcPayInvoiceResponse,
    RpcPeerId, RpcPublicKey, RpcRecoveryId, RpcSignedLnurlMessage, RpcStabilityPoolAccountInfo,
    RpcTransaction, SocialRecoveryQr,
};
use crate::api::IFediApi;
use crate::constants::{GLOBAL_MATRIX_SERVER, GLOBAL_MATRIX_SLIDING_SYNC_PROXY};
use crate::error::get_error_code;
use crate::event::{Event, EventSink, IEventSink, PanicEvent, SocialRecoveryEvent, TypedEventExt};
use crate::features::FeatureCatalog;
use crate::federation_v2::{BackupServiceStatus, FederationV2};
use crate::matrix::{
    self, Matrix, RpcBackPaginationStatus, RpcMatrixAccountSession, RpcMatrixUploadResult,
    RpcMatrixUserDirectorySearchResponse, RpcRoomId, RpcRoomListEntry, RpcRoomMember,
    RpcRoomNotificationMode, RpcSyncIndicator, RpcTimelineItem, RpcUserId,
};
use crate::observable::{Observable, ObservableVec};
use crate::storage::FiatFXInfo;
use crate::types::{
    GuardianStatus, RpcBridgeStatus, RpcCommunity, RpcDeviceIndexAssignmentStatus, RpcEcashInfo,
    RpcFederationMaybeLoading, RpcFederationPreview, RpcFeeDetails, RpcGenerateEcashResponse,
    RpcLightningGateway, RpcMediaUploadParams, RpcNostrPubkey, RpcNostrSecret,
    RpcPayAddressResponse, RpcRegisteredDevice, RpcTransactionDirection,
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

    let bridge = Bridge::new(
        storage,
        event_sink,
        fedi_api,
        device_identifier,
        feature_catalog,
    )
    .await
    .context("could not create a bridge")?;
    Ok(Arc::new(bridge))
}

pub fn rpc_error(error: &anyhow::Error) -> String {
    let code = get_error_code(error);

    json!({ "error": error.to_string(), "code": code, "detail": format!("{error:?}") }).to_string()
}

pub fn panic_hook(info: &PanicInfo, event_sink: &dyn IEventSink) {
    event_sink.typed_event(&Event::Panic(PanicEvent {
        message: info.to_string(),
    }))
}

use ts_rs::TS;

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
            #[derive(Debug, Deserialize, TS)]
            #[serde(rename_all = "camelCase")]
            pub struct Args {
            $(
                pub $arg_name: $arg_ty,
            )*
            }

            pub type Return = $ret;
            pub async fn handle($bridge: $bridge_ty, $name::Args { $( $arg_name ),* }: $name::Args) -> anyhow::Result<$ret> {
                super::$name($bridge, $($arg_name),*).await
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
            #[derive(Debug, Deserialize, TS)]
            #[serde(rename_all = "camelCase")]
            pub struct Args {
                federation_id: RpcFederationId,
            $(
                pub $arg_name: $arg_ty,
            )*
            }

            pub type Return = $ret;
            pub async fn handle(bridge: Arc<Bridge>, $name::Args { federation_id, $( $arg_name ),* }: $name::Args) -> anyhow::Result<$ret> {
                let $federation = bridge.get_federation(&federation_id.0).await?;
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
            #[derive(Debug, Deserialize, TS)]
            #[serde(rename_all = "camelCase")]
            pub struct Args {
                federation_id: RpcFederationId,
            $(
                pub $arg_name: $arg_ty,
            )*
            }

            pub type Return = $ret;
            pub async fn handle(bridge: Arc<Bridge>, $name::Args { federation_id, $( $arg_name ),* }: $name::Args) -> anyhow::Result<$ret> {
                let $federation = bridge.get_federation_maybe_recovering(&federation_id.0).await?;
                tracing::Span::current().record("federation_id", &federation_id.0);
                super::$name($federation, $($arg_name),*).await
            }
        }
    };
}

#[macro_rules_derive(federation_recovering_rpc_method!)]
async fn guardianStatus(federation: Arc<FederationV2>) -> anyhow::Result<Vec<GuardianStatus>> {
    federation.guardian_status().await
}

#[macro_rules_derive(rpc_method!)]
async fn joinFederation(
    bridge: Arc<Bridge>,
    invite_code: String,
    recover_from_scratch: bool,
) -> anyhow::Result<RpcFederation> {
    info!("joining federation {:?}", invite_code);
    bridge
        .join_federation(invite_code, recover_from_scratch)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn federationPreview(
    bridge: Arc<Bridge>,
    invite_code: String,
) -> anyhow::Result<RpcFederationPreview> {
    bridge.federation_preview(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn listFederations(bridge: Arc<Bridge>) -> anyhow::Result<Vec<RpcFederationMaybeLoading>> {
    Ok(bridge.list_federations().await)
}

#[macro_rules_derive(rpc_method!)]
async fn leaveFederation(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<()> {
    bridge.leave_federation(&federation_id.0).await
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
) -> anyhow::Result<String> {
    let rpc_invoice = federation
        .generate_invoice(amount, description, expiry.map(|x| x.into()))
        .await?;
    Ok(rpc_invoice.invoice)
}

#[macro_rules_derive(rpc_method!)]
// FIXME: make this argument RpcInvoice?
async fn decodeInvoice(
    bridge: Arc<Bridge>,
    federation_id: Option<RpcFederationId>,
    invoice: String,
) -> anyhow::Result<RpcInvoice> {
    // TODO: validate the invoice (same network, haven't already paid, etc)
    if let Some(federation_id) = federation_id {
        let federation = bridge.get_federation(&federation_id.0).await?;
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
) -> anyhow::Result<RpcPayInvoiceResponse> {
    let invoice: Bolt11Invoice = invoice.trim().parse().context(ErrorCode::InvalidInvoice)?;
    federation.pay_invoice(&invoice).await
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
async fn generateAddress(federation: Arc<FederationV2>) -> anyhow::Result<String> {
    federation.generate_address().await
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
) -> anyhow::Result<RpcPayAddressResponse> {
    let address = address.trim().parse().context("Invalid Bitcoin Address")?;
    let amount: Amount = Amount::from_sat(sats);
    federation.pay_address(address, amount).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn generateEcash(
    federation: Arc<FederationV2>,
    amount: RpcAmount,
    include_invite: bool,
) -> anyhow::Result<RpcGenerateEcashResponse> {
    federation.generate_ecash(amount.0, include_invite).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn receiveEcash(
    federation: Arc<FederationV2>,
    // TODO: better type
    ecash: String,
) -> anyhow::Result<RpcAmount> {
    federation.receive_ecash(ecash).await.map(RpcAmount)
}

#[macro_rules_derive(rpc_method!)]
async fn validateEcash(bridge: Arc<Bridge>, ecash: String) -> anyhow::Result<RpcEcashInfo> {
    bridge.validate_ecash(ecash).await
}

#[macro_rules_derive(rpc_method!)]
async fn updateCachedFiatFXInfo(
    bridge: Arc<Bridge>,
    fiat_code: String,
    btc_to_fiat_hundredths: u64,
) -> anyhow::Result<()> {
    bridge
        .update_cached_fiat_fx_info(FiatFXInfo {
            fiat_code,
            btc_to_fiat_hundredths,
        })
        .await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn listTransactions(
    federation: Arc<FederationV2>,
    start_time: Option<u32>,
    limit: Option<u32>,
) -> anyhow::Result<Vec<RpcTransaction>> {
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
async fn getMnemonic(bridge: Arc<Bridge>) -> anyhow::Result<Vec<String>> {
    bridge.get_mnemonic_words().await
}

#[macro_rules_derive(rpc_method!)]
async fn checkMnemonic(bridge: Arc<Bridge>, mnemonic: Vec<String>) -> anyhow::Result<bool> {
    Ok(bridge.get_mnemonic_words().await? == mnemonic)
}

// TODO: maybe call this "loadMnemonic" or something?
#[macro_rules_derive(rpc_method!)]
async fn recoverFromMnemonic(
    bridge: Arc<Bridge>,
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
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    video_file_path: PathBuf,
) -> anyhow::Result<PathBuf> {
    bridge
        .upload_backup_file(federation_id, video_file_path)
        .await
}

// This method is a bit of a stopgap ...
#[macro_rules_derive(rpc_method!)]
async fn locateRecoveryFile(bridge: Arc<Bridge>) -> anyhow::Result<PathBuf> {
    let storage = bridge.storage.clone();
    Ok(storage.platform_path(RECOVERY_FILENAME.as_ref()))
}

#[macro_rules_derive(rpc_method!)]
async fn validateRecoveryFile(bridge: Arc<Bridge>, path: PathBuf) -> anyhow::Result<()> {
    bridge.validate_recovery_file(path).await
}

// FIXME: maybe this would better be called "begin_social_recovery"
#[macro_rules_derive(rpc_method!)]
async fn recoveryQr(bridge: Arc<Bridge>) -> anyhow::Result<Option<SocialRecoveryQr>> {
    bridge.recovery_qr().await
}

#[macro_rules_derive(rpc_method!)]
async fn cancelSocialRecovery(bridge: Arc<Bridge>) -> anyhow::Result<()> {
    bridge.cancel_social_recovery().await
}

#[macro_rules_derive(rpc_method!)]
async fn socialRecoveryApprovals(bridge: Arc<Bridge>) -> anyhow::Result<SocialRecoveryEvent> {
    bridge.social_recovery_approvals().await
}

#[macro_rules_derive(rpc_method!)]
async fn socialRecoveryDownloadVerificationDoc(
    bridge: Arc<Bridge>,
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
    bridge: Arc<Bridge>,
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
async fn completeSocialRecovery(bridge: Arc<Bridge>) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
    bridge.complete_social_recovery().await
}

#[macro_rules_derive(rpc_method!)]
async fn signLnurlMessage(
    bridge: Arc<Bridge>,
    // hex-encoded message
    message: String,
    domain: String,
) -> anyhow::Result<RpcSignedLnurlMessage> {
    let message = Message::from_slice(&hex::decode(message)?)?;
    bridge.sign_lnurl_message(message, domain).await
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
async fn fedimintVersion(_bridge: Arc<Bridge>) -> anyhow::Result<String> {
    Ok(fedimint_core::version::cargo_pkg().to_string())
}

#[macro_rules_derive(rpc_method!)]
async fn getNostrSecret(bridge: Arc<Bridge>) -> anyhow::Result<RpcNostrSecret> {
    bridge.get_nostr_secret().await
}

#[macro_rules_derive(rpc_method!)]
async fn getNostrPubkey(bridge: Arc<Bridge>) -> anyhow::Result<RpcNostrPubkey> {
    bridge.get_nostr_pubkey().await
}

#[macro_rules_derive(rpc_method!)]
async fn signNostrEvent(bridge: Arc<Bridge>, event_hash: String) -> anyhow::Result<String> {
    bridge.sign_nostr_event(event_hash).await
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

#[macro_rules_derive(rpc_method!)]
async fn getSensitiveLog(bridge: Arc<Bridge>) -> anyhow::Result<bool> {
    Ok(bridge.sensitive_log().await)
}

#[macro_rules_derive(rpc_method!)]
async fn setSensitiveLog(bridge: Arc<Bridge>, enable: bool) -> anyhow::Result<()> {
    bridge.set_sensitive_log(enable).await
}

#[macro_rules_derive(rpc_method!)]
async fn setMintModuleFediFeeSchedule(
    bridge: Arc<Bridge>,
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
    bridge: Arc<Bridge>,
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
    bridge: Arc<Bridge>,
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
    bridge: Arc<Bridge>,
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
async fn dumpDb(bridge: Arc<Bridge>, federation_id: String) -> anyhow::Result<PathBuf> {
    bridge.dump_db(&federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixInit(bridge: Arc<Bridge>) -> anyhow::Result<()> {
    if bridge.matrix.initialized() {
        return Ok(());
    }
    let nostr_pubkey = bridge.get_nostr_pubkey().await?.npub;
    let matrix_secret = bridge.get_matrix_secret().await;
    bridge
        .matrix
        .set(
            Matrix::init(
                bridge.event_sink.clone(),
                bridge.task_group.clone(),
                &bridge.storage.platform_path("matrix".as_ref()),
                &matrix_secret,
                &nostr_pubkey,
                GLOBAL_MATRIX_SERVER.to_owned(),
                GLOBAL_MATRIX_SLIDING_SYNC_PROXY.to_owned(),
                bridge.app_state.clone(),
            )
            .await?,
        )
        .map_err(|_| anyhow::anyhow!("matrix already initialized"))?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn fetchRegisteredDevices(bridge: Arc<Bridge>) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
    bridge.fetch_registered_devices().await
}

#[macro_rules_derive(rpc_method!)]
async fn registerAsNewDevice(bridge: Arc<Bridge>) -> anyhow::Result<Option<RpcFederation>> {
    ensure_device_index_unassigned(&bridge).await?;
    bridge
        .register_device_with_index(
            bridge.fetch_registered_devices().await?.len().try_into()?,
            false,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn transferExistingDeviceRegistration(
    bridge: Arc<Bridge>,
    index: u8,
) -> anyhow::Result<Option<RpcFederation>> {
    ensure_device_index_unassigned(&bridge).await?;
    bridge.register_device_with_index(index, true).await
}

async fn ensure_device_index_unassigned(bridge: &Bridge) -> anyhow::Result<()> {
    Ok(anyhow::ensure!(
        matches!(
            bridge.device_index_assignment_status().await,
            Ok(RpcDeviceIndexAssignmentStatus::Unassigned)
        ),
        "device index is already assigned"
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn deviceIndexAssignmentStatus(
    bridge: Arc<Bridge>,
) -> anyhow::Result<RpcDeviceIndexAssignmentStatus> {
    bridge.device_index_assignment_status().await
}

#[macro_rules_derive(rpc_method!)]
async fn bridgeStatus(bridge: Arc<Bridge>) -> anyhow::Result<RpcBridgeStatus> {
    bridge.bridge_status().await
}

#[macro_rules_derive(rpc_method!)]
async fn communityPreview(
    bridge: Arc<Bridge>,
    invite_code: String,
) -> anyhow::Result<RpcCommunity> {
    bridge.communities.community_preview(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn joinCommunity(bridge: Arc<Bridge>, invite_code: String) -> anyhow::Result<RpcCommunity> {
    bridge.communities.join_community(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn leaveCommunity(bridge: Arc<Bridge>, invite_code: String) -> anyhow::Result<()> {
    bridge.communities.leave_community(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn listCommunities(bridge: Arc<Bridge>) -> anyhow::Result<Vec<RpcCommunity>> {
    bridge.communities.list_communities().await
}

#[macro_rules_derive(rpc_method!)]
async fn onAppForeground(bridge: Arc<Bridge>) -> anyhow::Result<()> {
    bridge.on_app_foreground().await;
    Ok(())
}

async fn get_matrix(bridge: &Bridge) -> anyhow::Result<&Matrix> {
    bridge.matrix.get().context(ErrorCode::MatrixNotInitialized)
}

macro_rules! ts_type_ser {
    ($name:ident: $ty:ty = $ts_ty:literal) => {
        #[derive(serde::Serialize, ts_rs::TS)]
        #[ts(export, export_to = "target/bindings/")]
        pub struct $name(#[ts(type = $ts_ty)] pub $ty);
    };
}

macro_rules! ts_type_de {
    ($name:ident: $ty:ty = $ts_ty:literal) => {
        #[derive(Debug, serde::Deserialize, ts_rs::TS)]
        #[ts(export, export_to = "target/bindings/")]
        pub struct $name(#[ts(type = $ts_ty)] pub $ty);
    };
}

macro_rules! ts_type_serde {
    ($name:ident: $ty:ty = $ts_ty:literal) => {
        #[derive(Debug, serde::Deserialize, serde::Serialize, ts_rs::TS)]
        #[ts(export, export_to = "target/bindings/")]
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
    ObservableRoomList: ObservableVec<RpcRoomListEntry> = "ObservableVec<RpcRoomListEntry>"
);

#[macro_rules_derive(rpc_method!)]
async fn matrixGetAccountSession(
    bridge: Arc<Bridge>,
    cached: bool,
) -> anyhow::Result<RpcMatrixAccountSession> {
    let matrix = get_matrix(&bridge).await?;
    matrix.get_account_session(cached, &bridge.app_state).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomList(bridge: Arc<Bridge>) -> anyhow::Result<ObservableRoomList> {
    let matrix = get_matrix(&bridge).await?;
    Ok(ObservableRoomList(matrix.room_list().await?))
}

// inclusive on both sides
ts_type_de!(RpcRanges: Ranges = "Array<{start: number, end: number}>");
#[macro_rules_derive(rpc_method!)]
async fn matrixRoomListUpdateRanges(bridge: Arc<Bridge>, ranges: RpcRanges) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_list_update_ranges(ranges.0).await?;
    Ok(())
}

ts_type_ser!(
    ObservableTimelineItems: ObservableVec<RpcTimelineItem> = "ObservableVec<RpcTimelineItem>"
);
#[macro_rules_derive(rpc_method!)]
async fn matrixRoomTimelineItems(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
) -> anyhow::Result<ObservableTimelineItems> {
    let matrix = get_matrix(&bridge).await?;
    let items = matrix.room_timeline_items(&room_id.into_typed()?).await?;
    Ok(ObservableTimelineItems(items))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomPreviewContent(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
) -> anyhow::Result<Vec<RpcTimelineItem>> {
    let matrix = get_matrix(&bridge).await?;
    matrix.preview_room_content(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendAttachment(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    filename: String,
    file_path: PathBuf,
    params: RpcMediaUploadParams,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;

    let file_data = bridge
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
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    event_num: u16,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_timeline_items_paginate_backwards(&room_id.into_typed()?, event_num)
        .await?;
    Ok(())
}

ts_type_ser!(
    ObservableBackPaginationStatus: Observable<RpcBackPaginationStatus> =
        "Observable<RpcBackPaginationStatus>"
);

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomObserveTimelineItemsPaginateBackwards(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
) -> anyhow::Result<ObservableBackPaginationStatus> {
    let matrix = get_matrix(&bridge).await?;
    Ok(ObservableBackPaginationStatus(
        matrix
            .room_observe_timeline_items_paginate_backwards_status(&room_id.into_typed()?)
            .await?,
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixObserverCancel(bridge: Arc<Bridge>, id: u64) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.observable_cancel(id).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendMessage(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    message: String,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .send_message_text(&room_id.into_typed()?, message)
        .await
}

ts_type_de!(CustomMessageData: serde_json::Map<String, serde_json::Value> = "Record<string, JSONValue>");
#[macro_rules_derive(rpc_method!)]
async fn matrixSendMessageJson(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    msgtype: String,
    body: String,
    data: CustomMessageData,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .send_message_json(&room_id.into_typed()?, msgtype, body, data.0)
        .await
}

ts_type_de!(CreateRoomRequest: matrix::create_room::Request = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomCreate(
    bridge: Arc<Bridge>,
    request: CreateRoomRequest,
) -> anyhow::Result<RpcRoomId> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_create(request.0).await.map(RpcRoomId::from)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomCreateOrGetDm(
    bridge: Arc<Bridge>,
    user_id: RpcUserId,
) -> anyhow::Result<RpcRoomId> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .create_or_get_dm(&user_id.into_typed()?)
        .await
        .map(RpcRoomId::from)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomJoin(bridge: Arc<Bridge>, room_id: RpcRoomId) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_join(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomJoinPublic(bridge: Arc<Bridge>, room_id: RpcRoomId) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_join_public(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomLeave(bridge: Arc<Bridge>, room_id: RpcRoomId) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_leave(&room_id.into_typed()?).await
}

ts_type_ser!(ObservableRoomInfo: Observable<RoomInfo> = "Observable<JSONObject>");

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomObserveInfo(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
) -> anyhow::Result<ObservableRoomInfo> {
    let matrix = get_matrix(&bridge).await?;
    Ok(ObservableRoomInfo(
        matrix.room_observe_info(&room_id.into_typed()?).await?,
    ))
}

ts_type_ser!(ObservableRpcSyncIndicator: Observable<RpcSyncIndicator> = "Observable<RpcSyncIndicator>");

#[macro_rules_derive(rpc_method!)]
async fn matrixObserveSyncIndicator(
    bridge: Arc<Bridge>,
) -> anyhow::Result<ObservableRpcSyncIndicator> {
    let matrix = get_matrix(&bridge).await?;
    Ok(ObservableRpcSyncIndicator(
        matrix.observe_sync_status().await?,
    ))
}
#[macro_rules_derive(rpc_method!)]
async fn matrixRoomInviteUserById(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    user_id: RpcUserId,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_invite_user_by_id(&room_id.into_typed()?, &user_id.into_typed()?)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetName(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    name: String,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_set_name(&room_id.into_typed()?, name).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetTopic(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    topic: String,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_set_topic(&room_id.into_typed()?, topic).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixIgnoreUser(bridge: Arc<Bridge>, user_id: RpcUserId) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.ignore_user(&user_id.into_typed()?).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUnignoreUser(bridge: Arc<Bridge>, user_id: RpcUserId) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.unignore_user(&user_id.into_typed()?).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomKickUser(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_kick_user(
            &room_id.into_typed()?,
            &user_id.into_typed()?,
            reason.as_deref(),
        )
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomBanUser(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_ban_user(
            &room_id.into_typed()?,
            &user_id.into_typed()?,
            reason.as_deref(),
        )
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomUnbanUser(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_unban_user(
            &room_id.into_typed()?,
            &user_id.into_typed()?,
            reason.as_deref(),
        )
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetMembers(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
) -> anyhow::Result<Vec<RpcRoomMember>> {
    let matrix = get_matrix(&bridge).await?;
    matrix.room_get_members(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUserDirectorySearch(
    bridge: Arc<Bridge>,
    search_term: String,
    limit: u32,
) -> anyhow::Result<RpcMatrixUserDirectorySearchResponse> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .search_user_directory(&search_term, limit.into())
        .await
}

ts_type_ser!(RpcPublicRoomChunk: PublicRoomsChunk = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixPublicRoomInfo(
    bridge: Arc<Bridge>,
    room_id: String,
) -> anyhow::Result<RpcPublicRoomChunk> {
    let matrix = get_matrix(&bridge).await?;
    Ok(RpcPublicRoomChunk(matrix.public_room_info(&room_id).await?))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSetDisplayName(bridge: Arc<Bridge>, display_name: String) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .set_display_name(display_name, &bridge.app_state)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSetAvatarUrl(bridge: Arc<Bridge>, avatar_url: String) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.set_avatar_url(avatar_url).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUploadMedia(
    bridge: Arc<Bridge>,
    path: PathBuf,
    mime_type: String,
) -> anyhow::Result<RpcMatrixUploadResult> {
    let mime = mime_type.parse::<Mime>().context(ErrorCode::BadRequest)?;
    let file = bridge.get_matrix_media_file(path).await?;
    let matrix = get_matrix(&bridge).await?;
    matrix.upload_file(mime, file).await
}

ts_type_serde!(RpcRoomPowerLevelsEventContent: RoomPowerLevelsEventContent = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetPowerLevels(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
) -> anyhow::Result<RpcRoomPowerLevelsEventContent> {
    let matrix = get_matrix(&bridge).await?;
    Ok(RpcRoomPowerLevelsEventContent(
        matrix.room_get_power_levels(&room_id.into_typed()?).await?,
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetPowerLevels(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    new: RpcRoomPowerLevelsEventContent,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_change_power_levels(&room_id.into_typed()?, new.0)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSendReceipt(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    event_id: String,
) -> anyhow::Result<bool> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_send_receipt(&room_id.into_typed()?, &event_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetNotificationMode(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    mode: RpcRoomNotificationMode,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_set_notification_mode(&room_id.into_typed()?, mode)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetNotificationMode(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
) -> anyhow::Result<Option<RpcRoomNotificationMode>> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_get_notification_mode(&room_id.into_typed()?)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomMarkAsUnread(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    unread: bool,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .room_mark_as_unread(&room_id.into_typed()?, unread)
        .await
}

ts_type_ser!(UserProfile: get_profile::v3::Response = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixUserProfile(bridge: Arc<Bridge>, user_id: RpcUserId) -> anyhow::Result<UserProfile> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .user_profile(&user_id.into_typed()?)
        .await
        .map(UserProfile)
}

ts_type_de!(RpcPusher: Pusher = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixSetPusher(bridge: Arc<Bridge>, pusher: RpcPusher) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.set_pusher(pusher.0).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixEditMessage(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    event_id: String,
    new_content: String,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .edit_message(
            &room_id.into_typed()?,
            &event_id.parse::<OwnedEventId>()?,
            new_content,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixDeleteMessage(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    event_id: String,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .delete_message(
            &room_id.into_typed()?,
            &event_id.parse::<OwnedEventId>()?,
            reason,
        )
        .await
}

ts_type_de!(RpcMediaSource: MediaSource = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixDownloadFile(
    bridge: Arc<Bridge>,
    path: PathBuf,
    media_source: RpcMediaSource,
) -> anyhow::Result<PathBuf> {
    let matrix = get_matrix(&bridge).await?;
    let content = matrix.download_file(media_source.0).await?;
    bridge.storage.write_file(&path, content).await?;
    Ok(bridge.storage.platform_path(&path))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixStartPoll(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    question: String,
    answers: Vec<String>,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix
        .start_poll(&room_id.into_typed()?, question, answers)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixEndPoll(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    poll_start_id: String,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    let poll_start_event_id = OwnedEventId::try_from(poll_start_id)?;
    matrix
        .end_poll(&room_id.into_typed()?, &poll_start_event_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRespondToPoll(
    bridge: Arc<Bridge>,
    room_id: RpcRoomId,
    poll_start_id: String,
    selections: Vec<String>,
) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    let poll_start_event_id = OwnedEventId::try_from(poll_start_id)?;
    matrix
        .respond_to_poll(&room_id.into_typed()?, &poll_start_event_id, selections)
        .await
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
        #[ts(export, export_to = "target/bindings/")]
        pub struct $name {
        $(
            #[ts(inline)]
            $method: ($method::Args, $method::Return),
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
    // Federations
    joinFederation,
    federationPreview,
    leaveFederation,
    listFederations,
    guardianStatus,
    // Lightning
    generateInvoice,
    decodeInvoice,
    payInvoice,
    listGateways,
    switchGateway,
    // On-Chain
    generateAddress,
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
    // Developer
    getSensitiveLog,
    setSensitiveLog,
    setMintModuleFediFeeSchedule,
    setWalletModuleFediFeeSchedule,
    setLightningModuleFediFeeSchedule,
    setStabilityPoolModuleFediFeeSchedule,
    getAccruedOutstandingFediFeesPerTXType,
    getAccruedPendingFediFeesPerTXType,
    dumpDb,

    // Device Registration
    fetchRegisteredDevices,
    registerAsNewDevice,
    transferExistingDeviceRegistration,
    deviceIndexAssignmentStatus,

    matrixObserverCancel,

    // Matrix
    matrixInit,
    matrixGetAccountSession,
    matrixObserveSyncIndicator,
    matrixRoomList,
    matrixRoomListUpdateRanges,
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
    matrixRoomPreviewContent,
    matrixPublicRoomInfo,
    matrixRoomMarkAsUnread,
    matrixEditMessage,
    matrixDeleteMessage,
    matrixDownloadFile,
    matrixStartPoll,
    matrixEndPoll,
    matrixRespondToPoll,

    // Communities
    communityPreview,
    joinCommunity,
    leaveCommunity,
    listCommunities,
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
    let sensitive_log = bridge.sensitive_log().await;
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
        rpc_error(&error)
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::ops::ControlFlow;
    use std::path::Path;
    use std::str::FromStr;
    use std::sync::{Once, RwLock};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use anyhow::{anyhow, bail};
    use bitcoin::bech32::{self, ToBase32};
    use bitcoin::secp256k1::PublicKey;
    use bitcoin::Network;
    use devimint::cmd;
    use devimint::util::{ClnLightningCli, FedimintCli, LnCli};
    use fedi_core::envs::FEDI_SOCIAL_RECOVERY_MODULE_ENABLE_ENV;
    use fedi_social_client::common::VerificationDocument;
    use fedimint_core::core::ModuleKind;
    use fedimint_core::{apply, async_trait_maybe_send, Amount};
    use fedimint_logging::TracingSetup;
    use tokio::sync::Mutex;
    use tracing::{error, info};

    use super::*;
    use crate::api::{RegisterDeviceError, RegisteredDevice};
    use crate::community::CommunityInvite;
    use crate::constants::{COMMUNITY_INVITE_CODE_HRP, FEDI_FILE_PATH, MILLION};
    use crate::envs::USE_UPSTREAM_FEDIMINTD_ENV;
    use crate::event::{DeviceRegistrationEvent, TransactionEvent};
    use crate::features::RuntimeEnvironment;
    use crate::federation_v2::client::ClientExt;
    use crate::federation_v2::FederationV2;
    use crate::ffi::PathBasedStorage;
    use crate::logging::default_log_filter;
    use crate::storage::{DeviceIdentifier, FediFeeSchedule, IStorage};
    use crate::types::{
        RpcLnReceiveState, RpcLnState, RpcOOBReissueState, RpcOOBState, RpcOnchainDepositState,
        RpcReturningMemberStatus, RpcTransactionDirection,
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

    struct MockFediApi {
        // (seed, index) => (device identifier, last registration timestamp)
        registry: Mutex<HashMap<(bip39::Mnemonic, u8), (DeviceIdentifier, SystemTime)>>,

        // Invoice that will be returned whenever fetch_fedi_invoice is called
        fedi_fee_invoice: Option<Bolt11Invoice>,
    }

    impl MockFediApi {
        fn new() -> Self {
            Self {
                registry: Mutex::new(HashMap::new()),
                fedi_fee_invoice: None,
            }
        }

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
            let mut devices = self
                .registry
                .lock()
                .await
                .iter()
                .filter_map(|(k, v)| {
                    if k.0 == seed {
                        Some(RegisteredDevice {
                            index: k.1,
                            identifier: v.0.clone(),
                            last_renewed: v.1,
                        })
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();

            devices.sort_by_key(|r| r.index);
            Ok(devices)
        }

        async fn register_device_for_seed(
            &self,
            seed: bip39::Mnemonic,
            device_index: u8,
            device_identifier: DeviceIdentifier,
            _encrypted_device_identifier: String,
            force_overwrite: bool,
        ) -> anyhow::Result<(), RegisterDeviceError> {
            let mut registry = self.registry.lock().await;
            if let Some(value) = registry.get_mut(&(seed.clone(), device_index)) {
                if force_overwrite || device_identifier == value.0 {
                    value.0 = device_identifier;
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
                    (device_identifier, fedimint_core::time::now()),
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

    async fn cli_generate_invoice(label: &str, amount: &Amount) -> anyhow::Result<Bolt11Invoice> {
        let invoice_string = cmd!(ClnLightningCli, "invoice", amount.msats, label, label)
            .out_json()
            .await?["bolt11"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap();
        Ok(Bolt11Invoice::from_str(&invoice_string)?)
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

    async fn setup() -> anyhow::Result<(Arc<Bridge>, Arc<FederationV2>)> {
        let bridge = setup_bridge().await?;

        let federation = join_test_fed(&bridge).await?;
        Ok((bridge, federation))
    }

    async fn setup_custom(
        device_identifier: String,
        mock_fedi_api: Arc<dyn IFediApi>,
        feature_catalog: Arc<FeatureCatalog>,
    ) -> anyhow::Result<(Arc<Bridge>, Arc<FederationV2>)> {
        let bridge = setup_bridge_custom(device_identifier, mock_fedi_api, feature_catalog).await?;

        let federation = join_test_fed(&bridge).await?;
        Ok((bridge, federation))
    }

    async fn setup_bridge() -> anyhow::Result<Arc<Bridge>> {
        setup_bridge_custom(
            "default_bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned(),
            Arc::new(MockFediApi::new()),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await
    }

    async fn setup_bridge_custom(
        device_identifier: String,
        fedi_api: Arc<dyn IFediApi>,
        feature_catalog: Arc<FeatureCatalog>,
    ) -> anyhow::Result<Arc<Bridge>> {
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
    ) -> anyhow::Result<Arc<Bridge>> {
        INIT_TRACING.call_once(|| {
            TracingSetup::default()
                .with_directive(&default_log_filter())
                .init()
                .expect("Failed to initialize tracing");
        });
        let event_sink = Arc::new(FakeEventSink::new());
        let storage = Arc::new(PathBasedStorage::new(data_dir).await?);
        let bridge = match fedimint_initialize_async(
            storage,
            event_sink,
            fedi_api,
            device_identifier,
            feature_catalog,
        )
        .await
        {
            Ok(bridge) => bridge,
            Err(e) => {
                let context_error = e.context("Failed to initialize Bridge");
                error!("{}", context_error);
                return Err(context_error);
            }
        };
        Ok(bridge)
    }

    async fn join_test_fed(bridge: &Arc<Bridge>) -> Result<Arc<FederationV2>, anyhow::Error> {
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
        let fedimint_federation = joinFederation(bridge.clone(), invite_code, false).await?;
        let federation = bridge
            .get_federation_maybe_recovering(&fedimint_federation.id.0)
            .await?;
        use_lnd_gateway(&federation).await?;
        Ok(federation)
    }

    async fn join_test_fed_recovery(
        bridge: &Arc<Bridge>,
        recover_from_scratch: bool,
    ) -> Result<Arc<FederationV2>, anyhow::Error> {
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
        let fedimint_federation =
            joinFederation(bridge.clone(), invite_code, recover_from_scratch).await?;
        let federation = bridge
            .get_federation_maybe_recovering(&fedimint_federation.id.0)
            .await?;
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
        let fedi_api = Arc::new(MockFediApi::new());
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
        let fedi_api = Arc::new(MockFediApi::new());
        let bridge = fedimint_initialize_async(
            storage,
            event_sink,
            fedi_api,
            "default_bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        let federations = listFederations(bridge.clone()).await?;
        // old federations are ignored
        assert_eq!(federations.len(), 0);
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_join_and_leave_and_join() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        let env_invite_code = std::env::var("FM_INVITE_CODE").unwrap();

        // Can't re-join a federation we're already a member of
        assert!(
            joinFederation(bridge.clone(), env_invite_code.clone(), false)
                .await
                .is_err()
        );

        // listTransactions works
        let federations = listFederations(bridge.clone()).await?;
        assert_eq!(federations.len(), 1);
        let RpcFederationMaybeLoading::Ready(rpc_federation) = &federations[0] else {
            panic!("federation is not loaded");
        };
        assert_eq!(env_invite_code.clone(), rpc_federation.invite_code);

        // leaveFederation works
        leaveFederation(bridge.clone(), federation.rpc_federation_id()).await?;
        assert_eq!(listFederations(bridge.clone()).await?.len(), 0);

        // rejoin without any rocksdb locking problems
        joinFederation(bridge.clone(), env_invite_code, false).await?;
        assert_eq!(listFederations(bridge).await?.len(), 1);

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_join_concurrent() -> anyhow::Result<()> {
        let device_identifier = "bridge:test:70c2ad23-bfac-4aa2-81c3-d6f5e79ae724".to_string();

        let mock_fedi_api = Arc::new(MockFediApi::new());
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
                joinFederation(bridge.clone(), env_invite_code.clone(), false),
                joinFederation(bridge.clone(), env_invite_code.clone(), false),
            );
            federation_id = match (res1, res2) {
                (Ok(f), Err(_)) | (Err(_), Ok(f)) => f.id,
                _ => panic!("exactly one of two concurrent join federation must fail"),
            };

            let federation = bridge.get_federation(&federation_id.0).await?;
            let ecash = cli_generate_ecash(fedimint_core::Amount::from_msats(10_000)).await?;
            amount = receiveEcash(federation.clone(), ecash).await?.0;
            wait_for_ecash_reissue(&federation).await?;
            bridge
                .task_group
                .clone()
                .shutdown_join_all(Duration::from_secs(5))
                .await?;
        }

        // second app launch
        {
            let bridge = setup_bridge_custom_with_data_dir(
                device_identifier,
                mock_fedi_api,
                FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
                data_dir,
            )
            .await?;
            let rpc_federation = wait_for_federation_ready(bridge, federation_id).await?;
            assert_eq!(rpc_federation.balance.0, amount);
        }
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
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
            bridge.clone(),
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
        let invoice_string =
            generateInvoice(federation.clone(), rpc_receive_amount, description, None).await?;

        cln_pay_invoice(&invoice_string).await?;

        // check for event of type transaction that has ln_state
        'check: loop {
            let events = bridge.event_sink.events();
            for (_, ev_body) in events
                .iter()
                .rev()
                .filter(|(kind, _)| kind == "transaction")
            {
                let ev_body = serde_json::from_str::<TransactionEvent>(ev_body).unwrap();
                let transaction = ev_body.transaction;
                if transaction
                    .lightning
                    .map_or(false, |ln| ln.invoice == invoice_string)
                    && matches!(
                        transaction.ln_state,
                        Some(RpcLnState::RecvState(RpcLnReceiveState::Claimed))
                    )
                {
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

        let label = fedimint_core::time::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
            .to_string();
        let label = format!("foo-{label}");

        // get invoice
        let send_amount = Amount::from_sats(50);
        let invoice = cli_generate_invoice(&label, &send_amount).await?;
        let invoice_string = invoice.to_string();

        // check balance
        payInvoice(federation.clone(), invoice_string).await?;

        // check that core-lightning got paid
        cln_wait_invoice(&label).await?;

        // TODO shaurya unsure how to account for gateway fee when verifying fedi fee
        // amount
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
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
            bridge.clone(),
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
        receiveEcash(federation.clone(), ecash).await?;
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
            assert!(
                generateEcash(federation.clone(), RpcAmount(ecash_receive_amount), false)
                    .await
                    .is_err()
            );
        }
        let ecash_send_amount = Amount::from_msats(ecash_receive_amount.msats / 2);
        let send_fedi_fee =
            Amount::from_msats((ecash_send_amount.msats * fedi_fees_send_ppm).div_ceil(MILLION));
        let send_ecash = generateEcash(federation.clone(), RpcAmount(ecash_send_amount), false)
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
            let oob_state = federation
                .list_transactions(usize::MAX, None)
                .await
                .first()
                .context("transaction not found")
                .map_err(ControlFlow::Continue)?
                .oob_state
                .clone();
            match oob_state {
                None => Err(ControlFlow::Continue(anyhow!(
                    "oob state must be present on ecash reissue"
                ))),
                Some(RpcOOBState::Reissue(RpcOOBReissueState::Done)) => Ok(()),
                Some(RpcOOBState::Reissue(RpcOOBReissueState::Failed { error })) => {
                    Err(ControlFlow::Break(anyhow!(error)))
                }
                Some(RpcOOBState::Reissue(_)) => {
                    Err(ControlFlow::Continue(anyhow!("not done yet")))
                }
                Some(_) => Err(ControlFlow::Break(anyhow!(
                    "oob state must have reissue state present on ecash reissue"
                ))),
            }
        })
        .await
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_ecash_overissue() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;

        // receive ecash
        let ecash_requested_amount = fedimint_core::Amount::from_msats(10000);
        let ecash = cli_generate_ecash(ecash_requested_amount).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        receiveEcash(federation.clone(), ecash).await?;
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
            generateEcash(federation.clone(), RpcAmount(iteration_amount), false)
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

    #[tokio::test(flavor = "multi_thread")]
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
            bridge.clone(),
            federation.rpc_federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        let address = generateAddress(federation.clone()).await?;
        bitcoin_cli_send_to_address(&address, "0.1").await?;

        assert!(matches!(
            listTransactions(federation.clone(), None, None).await?[0].onchain_state,
            Some(crate::types::RpcOnchainState::DepositState(
                RpcOnchainDepositState::WaitingForTransaction
            ))
        ),);
        // check for event of type transaction that has onchain_state of
        // DepositState::Claimed
        'check: loop {
            let events = bridge.event_sink.events();
            for (_, ev_body) in events
                .iter()
                .rev()
                .filter(|(kind, _)| kind == "transaction")
            {
                let ev_body = serde_json::from_str::<TransactionEvent>(ev_body).unwrap();
                let transaction = ev_body.transaction;
                if transaction
                    .bitcoin
                    .map_or(false, |btc| btc.address == address)
                    && matches!(
                        transaction.onchain_state,
                        Some(crate::types::RpcOnchainState::DepositState(
                            RpcOnchainDepositState::Claimed(_)
                        ))
                    )
                {
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
            listTransactions(federation.clone(), None, None).await?[0].onchain_state,
            Some(crate::types::RpcOnchainState::DepositState(
                RpcOnchainDepositState::Claimed(_)
            ))
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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_ecash_cancel() -> anyhow::Result<()> {
        let (_bridge, federation) = setup().await?;

        // receive ecash
        let ecash_receive_amount = fedimint_core::Amount::from_msats(100);
        let ecash = cli_generate_ecash(ecash_receive_amount).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        receiveEcash(federation.clone(), ecash).await?;
        wait_for_ecash_reissue(federation.as_ref()).await?;

        // check balance
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // spend half of received ecash
        let send_ecash = generateEcash(
            federation.clone(),
            RpcAmount(Amount::from_msats(ecash_receive_amount.msats / 2)),
            false,
        )
        .await?
        .ecash;

        // if you notice this flake in CI, revert this change
        cancelEcash(federation.clone(), send_ecash).await?;
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_backup_and_recovery() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }
        test_backup_and_recovery_inner(false).await
    }

    #[tokio::test(flavor = "multi_thread")]
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
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = backup_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                stability_pool_client::common::KIND,
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
        let mnemonic = getMnemonic(backup_bridge.clone()).await?;
        drop(federation);
        drop(backup_bridge);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let recovery_bridge = setup_bridge().await?;
        recoverFromMnemonic(recovery_bridge.clone(), mnemonic).await?;

        // Re-register device as index 0 since it's the same device
        transferExistingDeviceRegistration(recovery_bridge.clone(), 0).await?;

        // Rejoin federation and assert that balances are correct
        let recovery_federation = join_test_fed_recovery(&recovery_bridge, from_scratch).await?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if recovery_bridge
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let recovery_federation = recovery_bridge.get_federation(&id.0).await?;
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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_validate_ecash() -> anyhow::Result<()> {
        let (bridge, _) = setup().await?;
        let v2_ecash = "AgEEsuFO5gD3AwQBmW/h68gy6W5cgnl93aTdduN1OnnFofSCqjth03Q6CA+fXnKlVXQSIVSLqcHzsbhozAuo2q5jPMsO6XMZZZXaYvZyIdXzCUIuDNhdCHkGJWAgAa9M5zsSPPVWDVeCWgkerg0Z+Xv8IQGMh7rsgpLh77NCSVRKA2i4fBYNwPglSbkGs42Yllmz6HJtgmmtl/tdjcyVSR30Nc2cfkZYTJcEEnRjQAGC8ZX5eLYQB8rCAZiX5/gQX2QtjasZMy+BJ67kJ0klVqsS9G1IVWhea6ILISOd9H1MJElma8aHBiWBaWeGjrCXru8Ns7Lz4J18CbxFdHyWEQ==";
        validateEcash(bridge.clone(), v2_ecash.into()).await?;
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
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
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = original_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                stability_pool_client::common::KIND,
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
        let initial_words = getMnemonic(original_bridge.clone()).await?;
        info!("initial mnemnoic {:?}", &initial_words);

        // Upload backup
        let video_file_path = get_fixture_dir().join("backup.fedi");
        let video_file_contents = tokio::fs::read(&video_file_path).await?;
        let recovery_file_path = uploadBackupFile(
            original_bridge.clone(),
            federation_id.clone(),
            video_file_path,
        )
        .await?;
        let locate_recovery_file_path = locateRecoveryFile(original_bridge.clone()).await?;
        assert_eq!(recovery_file_path, locate_recovery_file_path);

        // use new bridge from here (simulating a new app install)

        // Validate recovery file
        validateRecoveryFile(recovery_bridge.clone(), recovery_file_path).await?;

        // Generate recovery QR
        let qr = recoveryQr(recovery_bridge.clone())
            .await?
            .expect("recovery must be started started");
        let recovery_id = qr.recovery_id;

        // Guardian downloads verification document
        let verification_doc_path = socialRecoveryDownloadVerificationDoc(
            guardian_bridge.clone(),
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
                guardian_bridge.clone(),
                federation_id.clone(),
                recovery_id,
                RpcPeerId(fedimint_core::PeerId::from(i)),
                password.into(),
            )
            .await?;
        }

        // Member checks approval status
        let social_recovery_event = socialRecoveryApprovals(recovery_bridge.clone()).await?;
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
        completeSocialRecovery(recovery_bridge.clone()).await?;

        // Re-register device as index 0 since it's the same device
        transferExistingDeviceRegistration(recovery_bridge.clone(), 0).await?;

        // Check backups match (TODO: how can I make sure that they're equal b/c nothing
        // happened?)
        let final_words: Vec<String> = getMnemonic(recovery_bridge.clone()).await?;
        assert_eq!(initial_words, final_words);

        // Assert that balances are correct
        let recovery_federation = recovery_bridge
            .get_federation_maybe_recovering(&federation_id.0)
            .await?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if recovery_bridge
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let recovery_federation = recovery_bridge.get_federation(&id.0).await?;
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

    #[tokio::test(flavor = "multi_thread")]
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
            bridge.clone(),
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
        let receive_amount = federation.receive_ecash(ecash).await?;
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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_lnurl_sign_message() -> anyhow::Result<()> {
        let (bridge, _federation) = setup().await?;
        let k1 = String::from("cfcb7616d615252180e392f509207e1f610f8d6106588c61c3e7bbe8577e4c4c");
        let message = Message::from_slice(&hex::decode(k1)?)?;
        let domain1 = String::from("fedi.xyz");
        let domain2 = String::from("fedimint.com");

        // Test signing a message.
        let sig1 = bridge.sign_lnurl_message(message, domain1.clone()).await?;

        // Test that signing the same message twice results in identical signatures.
        let sig2 = bridge.sign_lnurl_message(message, domain1.clone()).await?;
        info!("Signature 2: {}", sig2.signature.to_string());
        assert_eq!(
            serde_json::to_string(&sig1.pubkey)?,
            serde_json::to_string(&sig2.pubkey)?
        );
        assert_eq!(sig1.signature, sig2.signature);

        // Test that signing the same message on a different domain results in a
        // different signature.
        let sig3 = bridge.sign_lnurl_message(message, domain2.clone()).await?;
        info!("Signature 3: {}", sig3.signature.to_string());
        assert_ne!(
            serde_json::to_string(&sig1.pubkey)?,
            serde_json::to_string(&sig3.pubkey)?
        );
        assert_ne!(sig1.signature, sig3.signature);

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_federation_preview() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();

        drop(federation);
        drop(bridge);

        let bridge = setup_bridge().await?;
        assert!(matches!(
            federationPreview(bridge.clone(), invite_code.clone())
                .await?
                .returning_member_status,
            RpcReturningMemberStatus::NewMember
        ));

        // join
        let fedimint_federation =
            joinFederation(bridge.clone(), invite_code.clone(), false).await?;
        let federation = bridge.get_federation(&fedimint_federation.id.0).await?;
        use_lnd_gateway(&federation).await?;

        // receive ecash and backup
        let ecash = cli_generate_ecash(fedimint_core::Amount::from_msats(10_000)).await?;
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&federation).await?;
        let federation_id = federation.rpc_federation_id();
        backupNow(federation.clone()).await?;

        // extract mnemonic, leave federation and drop bridge
        let mnemonic = getMnemonic(bridge.clone()).await?;
        leaveFederation(bridge.clone(), federation_id.clone()).await?;
        drop(bridge);

        // query preview again w/ new bridge (recovered using mnemonic), it should be
        // "returning"
        let bridge = setup_bridge().await?;
        recoverFromMnemonic(bridge.clone(), mnemonic).await?;

        // Re-register device as index 0 since it's the same device
        transferExistingDeviceRegistration(bridge.clone(), 0).await?;

        assert!(matches!(
            federationPreview(bridge.clone(), invite_code.clone())
                .await?
                .returning_member_status,
            RpcReturningMemberStatus::ReturningMember
        ));

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_join_fails_post_recovery_index_unassigned() -> anyhow::Result<()> {
        let device_identifier = "bridge:test:fd3e4705-f453-45ee-9e84-4bd4fdc6c22a".to_string();
        let mock_fedi_api = Arc::new(MockFediApi::new());
        let (backup_bridge, federation) = setup_custom(
            device_identifier.clone(),
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;

        // Device index should be 0 since it's a fresh seed
        assert!(matches!(
            deviceIndexAssignmentStatus(backup_bridge.clone()).await?,
            RpcDeviceIndexAssignmentStatus::Assigned(0)
        ));

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        let mnemonic = getMnemonic(backup_bridge.clone()).await?;
        drop(federation);
        drop(backup_bridge);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let recovery_bridge = setup_bridge_custom(
            device_identifier,
            mock_fedi_api,
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(recovery_bridge.clone(), mnemonic).await?;

        // Device index should be unassigned since it's a recovery
        assert!(matches!(
            deviceIndexAssignmentStatus(recovery_bridge.clone()).await?,
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
        let mock_fedi_api = Arc::new(MockFediApi::new());
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
        let mnemonic = getMnemonic(bridge_1.clone()).await?;

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let device_identifier_2 = "bridge_2:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724".to_string();
        let bridge_2 = setup_bridge_custom(
            device_identifier_2,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(bridge_2.clone(), mnemonic.clone()).await?;

        // Register device as index 0 since it's a transfer
        transferExistingDeviceRegistration(bridge_2.clone(), 0).await?;

        // Verify that original device would see the conflict whenever its background
        // service would try to renew registration. The conflict event is what the
        // front-end uses to block further user action.
        let registration_conflict_body = serde_json::to_string(&DeviceRegistrationEvent {
            state: crate::event::DeviceRegistrationState::Conflict,
        })
        .expect("failed to json serialize");
        assert!(!bridge_1
            .event_sink
            .events()
            .iter()
            .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
                && *ev_body == registration_conflict_body));
        assert!(bridge_1.register_device_with_index(0, false).await.is_err());
        assert!(bridge_1
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
        recoverFromMnemonic(bridge_3.clone(), mnemonic.clone()).await?;

        // Register device as index 0 since it's a transfer
        transferExistingDeviceRegistration(bridge_3.clone(), 0).await?;

        // Verify that 2nd device would see the conflict whenever its background
        // service would try to renew registration.
        assert!(bridge_2.register_device_with_index(0, false).await.is_err());

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_transfer_device_registration_post_recovery() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        let device_identifier_1 = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let mock_fedi_api = Arc::new(MockFediApi::new());
        let (backup_bridge, federation) = setup_custom(
            device_identifier_1,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = backup_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                stability_pool_client::common::KIND,
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
        let mnemonic = getMnemonic(backup_bridge.clone()).await?;
        drop(federation);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let device_identifier_2 = "bridge_2:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724".to_string();
        let recovery_bridge = setup_bridge_custom(
            device_identifier_2,
            mock_fedi_api,
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        recoverFromMnemonic(recovery_bridge.clone(), mnemonic).await?;

        // Register device as index 0 since it's a transfer
        transferExistingDeviceRegistration(recovery_bridge.clone(), 0).await?;

        // Rejoin federation and assert that balances are correct
        let recovery_federation = join_test_fed_recovery(&recovery_bridge, false).await?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if recovery_bridge
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let recovery_federation = recovery_bridge.get_federation(&id.0).await?;
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
            .event_sink
            .events()
            .iter()
            .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
                && *ev_body == registration_conflict_body));
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_new_device_registration_post_recovery() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        let device_identifier_1 = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let mock_fedi_api = Arc::new(MockFediApi::new());
        let (backup_bridge, federation) = setup_custom(
            device_identifier_1,
            mock_fedi_api.clone(),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        let mnemonic = getMnemonic(backup_bridge.clone()).await?;
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
        recoverFromMnemonic(recovery_bridge.clone(), mnemonic).await?;

        // Register device as index 1 since it's a new device
        registerAsNewDevice(recovery_bridge.clone()).await?;

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
        let invite_code = bech32::encode(
            COMMUNITY_INVITE_CODE_HRP,
            invite_bytes.to_base32(),
            bitcoin::bech32::Variant::Bech32m,
        )?;

        let mock = server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_0)
            .create_async()
            .await;

        communityPreview(bridge.clone(), invite_code.clone()).await?;
        mock.assert();

        // Calling preview() does not join
        assert!(bridge.communities.communities.lock().await.is_empty());
        assert!(bridge
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .is_empty());

        // Calling join() actually joins
        joinCommunity(bridge.clone(), invite_code.clone()).await?;
        let memory_community = bridge
            .communities
            .communities
            .lock()
            .await
            .get(&invite_code)
            .unwrap()
            .clone();
        let app_state_community = bridge
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
        let invite_code_0 = bech32::encode(
            COMMUNITY_INVITE_CODE_HRP,
            invite_bytes.to_base32(),
            bitcoin::bech32::Variant::Bech32m,
        )?;

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
        let invite_code_1 = bech32::encode(
            COMMUNITY_INVITE_CODE_HRP,
            invite_bytes.to_base32(),
            bitcoin::bech32::Variant::Bech32m,
        )?;

        server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_1)
            .create_async()
            .await;

        // Initially no joined communities
        assert!(listCommunities(bridge.clone()).await?.is_empty());

        // Leaving throws error
        assert!(leaveCommunity(bridge.clone(), invite_code_0.clone())
            .await
            .is_err());

        // Join community 0
        joinCommunity(bridge.clone(), invite_code_0.clone()).await?;

        // List contains community 0
        assert!(matches!(
                &listCommunities(bridge.clone()).await?[..],
                [RpcCommunity { invite_code, .. }] if *invite_code == invite_code_0));

        // Join community 1
        joinCommunity(bridge.clone(), invite_code_1.clone()).await?;

        // List contains community 0 + community 1
        assert!(matches!(
                &listCommunities(bridge.clone()).await?[..], [
                    RpcCommunity { invite_code: invite_0, .. },
                    RpcCommunity { invite_code: invite_1, .. }
                ] if (*invite_0 == invite_code_0 && *invite_1 == invite_code_1) ||
                (*invite_0 == invite_code_1 && *invite_1 == invite_code_0)));

        // Leave community 0
        leaveCommunity(bridge.clone(), invite_code_0.clone()).await?;

        // List contains only community 1
        assert!(matches!(
                &listCommunities(bridge.clone()).await?[..],
                [RpcCommunity { invite_code, .. }] if *invite_code == invite_code_1));

        // Leave community 1
        leaveCommunity(bridge.clone(), invite_code_1).await?;

        // No joined communities
        assert!(listCommunities(bridge.clone()).await?.is_empty());

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
        let invite_code = bech32::encode(
            COMMUNITY_INVITE_CODE_HRP,
            invite_bytes.to_base32(),
            bitcoin::bech32::Variant::Bech32m,
        )?;

        server
            .mock("GET", invite_path)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(COMMUNITY_JSON_0)
            .create_async()
            .await;

        // Calling join() actually joins
        joinCommunity(bridge.clone(), invite_code.clone()).await?;
        let memory_community = bridge
            .communities
            .communities
            .lock()
            .await
            .get(&invite_code)
            .unwrap()
            .clone();
        let app_state_community = bridge
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
        bridge.on_app_foreground().await;

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

    #[tokio::test(flavor = "multi_thread")]
    async fn test_fee_remittance_on_startup() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        // Setup bridge, join test federation, set SP send fee ppm
        let device_identifier = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let (bridge, federation) = setup_custom(
            device_identifier.clone(),
            Arc::new(MockFediApi::new()),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        setStabilityPoolModuleFediFeeSchedule(
            bridge.clone(),
            federation.rpc_federation_id(),
            210_000,
            0,
        )
        .await?;

        // Receive ecash, verify no pending or outstanding fees
        let ecash = cli_generate_ecash(Amount::from_msats(2_000_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation.receive_ecash(ecash).await?;
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
        let data_dir = bridge.storage.platform_path(Path::new(""));
        drop(federation);
        bridge
            .task_group
            .clone()
            .shutdown_join_all(Duration::from_secs(5))
            .await?;
        drop(bridge);

        // Mock fee remittance endpoint
        let label = "fedi_fee_app_startup";
        let fedi_fee_invoice = cli_generate_invoice(label, &Amount::from_msats(210_000)).await?;
        let mut mock_fedi_api = MockFediApi::new();
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
        fedimint_core::task::timeout(Duration::from_secs(5), cln_wait_invoice(label)).await??;

        // Ensure outstanding fee has been cleared
        let federation = new_bridge
            .get_federation(&federation_id.to_string())
            .await?;
        assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_fee_remittance_post_successful_tx() -> anyhow::Result<()> {
        if should_skip_test_using_stock_fedimintd() {
            return Ok(());
        }

        // Mock fee remittance endpoint
        let label = "fedi_fee_post_tx";
        let fedi_fee_invoice = cli_generate_invoice(label, &Amount::from_msats(210_000)).await?;
        let mut mock_fedi_api = MockFediApi::new();
        mock_fedi_api.set_fedi_fee_invoice(fedi_fee_invoice.clone());

        // Setup bridge, join test federation, set SP send fee ppm
        let device_identifier = "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let (bridge, federation) = setup_custom(
            device_identifier.clone(),
            Arc::new(mock_fedi_api),
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        setStabilityPoolModuleFediFeeSchedule(
            bridge.clone(),
            federation.rpc_federation_id(),
            210_000,
            0,
        )
        .await?;

        // Receive ecash, verify no pending or outstanding fees
        let ecash = cli_generate_ecash(Amount::from_msats(2_000_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation.receive_ecash(ecash).await?;
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
                .event_sink
                .num_events_of_type("stabilityPoolDeposit".into())
                == 3
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }

        // Wait for fedi fee to be remitted
        fedimint_core::task::timeout(Duration::from_secs(30), cln_wait_invoice(label)).await??;

        // Ensure outstanding fee has been cleared
        assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
        assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_reused_ecash_proofs() -> anyhow::Result<()> {
        let bridge_dir1 = create_data_dir();
        let bridge_dir2 = create_data_dir();

        let mnemonic;
        // trigger seed reuse
        {
            let device_identifier1 = "bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98".to_owned();
            let fedi_api = Arc::new(MockFediApi::new());
            let bridge1 = setup_bridge_custom_with_data_dir(
                device_identifier1.clone(),
                fedi_api.clone(),
                FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
                bridge_dir1.clone(),
            )
            .await?;
            mnemonic = getMnemonic(bridge1.clone()).await?;

            // trigger seed reuse: a second bridge with same seed and same device identifier
            let bridge2 = setup_bridge_custom_with_data_dir(
                device_identifier1.clone(),
                fedi_api.clone(),
                FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
                bridge_dir2.clone(),
            )
            .await?;
            recoverFromMnemonic(bridge2.clone(), mnemonic.clone()).await?;
            transferExistingDeviceRegistration(bridge2.clone(), 0).await?;

            let (federation_b1, federation_b2) =
                tokio::try_join!(join_test_fed(&bridge1), join_test_fed(&bridge2))?;
            let ecash_receive_amount = fedimint_core::Amount::from_msats(10000);

            // use some note indices
            let ecash1 = cli_generate_ecash(ecash_receive_amount).await?;
            receiveEcash(federation_b1.clone(), ecash1).await?;
            wait_for_ecash_reissue(&federation_b1).await?;

            // trigger note index reuse
            let ecash2 = cli_generate_ecash(ecash_receive_amount).await?;
            receiveEcash(federation_b2.clone(), ecash2).await?;
            // this will still pass but federation will have unspendable ecash
            wait_for_ecash_reissue(&federation_b2).await?;

            // kill both bridges
            drop(federation_b1);
            drop(federation_b2);
            tokio::try_join!(
                bridge1
                    .task_group
                    .clone()
                    .shutdown_join_all(Duration::from_secs(5)),
                bridge2
                    .task_group
                    .clone()
                    .shutdown_join_all(Duration::from_secs(5))
            )?;
            drop(bridge1);
            drop(bridge2);
        }

        let bridge = setup_bridge().await?;
        recoverFromMnemonic(bridge.clone(), mnemonic).await?;
        registerAsNewDevice(bridge.clone()).await?;
        let recovery_federation = join_test_fed_recovery(&bridge, true).await?;
        assert!(recovery_federation.recovering());
        let id = recovery_federation.rpc_federation_id();
        drop(recovery_federation);
        loop {
            // Wait until recovery complete
            if bridge
                .event_sink
                .num_events_of_type("recoveryComplete".into())
                == 1
            {
                break;
            }

            fedimint_core::task::sleep(Duration::from_millis(100)).await;
        }
        let federation = bridge.get_federation(&id.0).await?;
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

    async fn wait_for_federation_ready(
        bridge: Arc<Bridge>,
        federation_id: RpcFederationId,
    ) -> anyhow::Result<RpcFederation> {
        fedimint_core::task::timeout(Duration::from_secs(2), async move {
            'check: loop {
                let federations = bridge.list_federations().await;
                let rpc_federation = federations.into_iter().find_map(|f| {
                    if let RpcFederationMaybeLoading::Ready(fed @ RpcFederation { .. }) = f {
                        if fed.id == federation_id {
                            Some(fed)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                });

                if let Some(rpc_federation) = rpc_federation {
                    break 'check Ok::<_, anyhow::Error>(rpc_federation);
                }
                fedimint_core::task::sleep_in_test(
                    "waiting for federation ready event",
                    Duration::from_millis(100),
                )
                .await;
            }
        })
        .await?
    }
}
