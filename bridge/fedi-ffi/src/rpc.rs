#![allow(non_snake_case)]
use std::panic::PanicInfo;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use anyhow::Context;
use bitcoin::secp256k1::Message;
use bitcoin::{Address, Amount};
use fedimint_core::timing::TimeReporter;
use futures::Future;
use lightning_invoice::Bolt11Invoice;
use macro_rules_attribute::macro_rules_derive;
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
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
    RpcTransaction, RpcXmppCredentials, SocialRecoveryQr,
};
use crate::api::IFediApi;
use crate::error::get_error_code;
use crate::event::{Event, EventSink, IEventSink, PanicEvent, SocialRecoveryEvent, TypedEventExt};
use crate::federation_v2::BackupServiceStatus;
use crate::matrix::{
    self, Matrix, RpcBackPaginationStatus, RpcMatrixAccountSession, RpcMatrixUploadResult,
    RpcMatrixUserDirectorySearchResponse, RpcRoomId, RpcRoomListEntry, RpcRoomMember,
    RpcSyncIndicator, RpcTimelineItem, RpcUserId,
};
use crate::observable::{Observable, ObservableVec};
use crate::types::{
    GuardianStatus, RpcEcashInfo, RpcFederationPreview, RpcFeeDetails, RpcGenerateEcashResponse,
    RpcLightningGateway, RpcPayAddressResponse,
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
) -> anyhow::Result<Arc<Bridge>> {
    info!(
        "bridge version hash={}",
        env!("FEDIMINT_BUILD_CODE_VERSION")
    );
    let _g = TimeReporter::new("fedimint_initialize").level(Level::INFO);

    let bridge = Bridge::new(storage, event_sink, fedi_api, device_identifier)
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

#[macro_rules_derive(rpc_method!)]
async fn guardianStatus(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<Vec<GuardianStatus>> {
    bridge.guardian_status(federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn joinFederation(bridge: Arc<Bridge>, invite_code: String) -> anyhow::Result<RpcFederation> {
    info!("joining federation {:?}", invite_code);
    bridge.join_federation(invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn federationPreview(
    bridge: Arc<Bridge>,
    invite_code: String,
) -> anyhow::Result<RpcFederationPreview> {
    bridge.federation_preview(&invite_code).await
}

#[macro_rules_derive(rpc_method!)]
async fn listFederations(bridge: Arc<Bridge>) -> anyhow::Result<Vec<RpcFederation>> {
    Ok(bridge.list_federations().await)
}

#[macro_rules_derive(rpc_method!)]
async fn leaveFederation(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<()> {
    bridge.leave_federation(&federation_id.0).await
}

#[macro_rules_derive(rpc_method!)]
async fn generateInvoice(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    amount: RpcAmount,
    description: String,
    // 2^32 is big enough for expiry
    expiry: Option<u32>,
) -> anyhow::Result<String> {
    let rpc_invoice = bridge
        .generate_invoice(federation_id, amount, description, expiry.map(|x| x.into()))
        .await?;
    // TODO: actually return the RpcInvoice (frontend expects string)
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
        bridge.decode_invoice(federation_id, invoice).await
    } else {
        let invoice: Bolt11Invoice = invoice.trim().parse().context(ErrorCode::InvalidInvoice)?;
        let bridge_invoice = RpcInvoice::try_from(invoice)?;
        Ok(bridge_invoice)
    }
}

#[macro_rules_derive(rpc_method!)]
async fn payInvoice(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    invoice: String,
) -> anyhow::Result<RpcPayInvoiceResponse> {
    let invoice: Bolt11Invoice = invoice.trim().parse().context(ErrorCode::InvalidInvoice)?;
    bridge.pay_invoice(federation_id, &invoice).await
}

#[macro_rules_derive(rpc_method!)]
async fn listGateways(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<Vec<RpcLightningGateway>> {
    bridge.list_gateways(federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn switchGateway(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    gateway_id: RpcPublicKey,
) -> anyhow::Result<()> {
    bridge.switch_gateway(federation_id, gateway_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn generateAddress(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<String> {
    let address = bridge.generate_address(federation_id).await?;
    Ok(address)
}

#[macro_rules_derive(rpc_method!)]
async fn previewPayAddress(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    address: String,
    // TODO: parse this as bitcoin::Amount
    sats: u64,
) -> anyhow::Result<RpcFeeDetails> {
    let address: Address = address.trim().parse().context("Invalid Bitcoin Address")?;
    let amount: Amount = Amount::from_sat(sats);
    bridge
        .preview_pay_address(federation_id, address, amount)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn payAddress(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    address: String,
    // TODO: parse this as bitcoin::Amount
    sats: u64,
) -> anyhow::Result<RpcPayAddressResponse> {
    let address: Address = address.trim().parse().context("Invalid Bitcoin Address")?;
    let amount: Amount = Amount::from_sat(sats);
    bridge.pay_address(federation_id, address, amount).await
}

#[macro_rules_derive(rpc_method!)]
async fn generateEcash(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    amount: RpcAmount,
) -> anyhow::Result<RpcGenerateEcashResponse> {
    bridge.generate_ecash(federation_id, amount).await
}

#[macro_rules_derive(rpc_method!)]
async fn receiveEcash(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    // TODO: better type
    ecash: String,
) -> anyhow::Result<RpcAmount> {
    bridge.receive_ecash(federation_id, ecash).await
}

#[macro_rules_derive(rpc_method!)]
async fn validateEcash(bridge: Arc<Bridge>, ecash: String) -> anyhow::Result<RpcEcashInfo> {
    bridge.validate_ecash(ecash).await
}

#[macro_rules_derive(rpc_method!)]
async fn listTransactions(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    start_time: Option<u32>,
    limit: Option<u32>,
) -> anyhow::Result<Vec<RpcTransaction>> {
    bridge
        .list_transactions(federation_id, start_time, limit)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn cancelEcash(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    // TODO: better type
    ecash: String,
) -> anyhow::Result<()> {
    bridge.cancel_ecash(federation_id, ecash).await
}

#[macro_rules_derive(rpc_method!)]
async fn updateTransactionNotes(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    transaction_id: String,
    notes: String,
) -> anyhow::Result<()> {
    bridge
        .update_transaction_notes(federation_id, transaction_id, notes)
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn getMnemonic(bridge: Arc<Bridge>) -> anyhow::Result<Vec<String>> {
    bridge.get_mnemonic_words().await
}

// TODO: maybe call this "loadMnemonic" or something?
#[macro_rules_derive(rpc_method!)]
async fn recoverFromMnemonic(bridge: Arc<Bridge>, mnemonic: Vec<String>) -> anyhow::Result<()> {
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
) -> anyhow::Result<Option<PathBuf>> {
    bridge
        .download_verification_doc(federation_id, recovery_id)
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
async fn completeSocialRecovery(bridge: Arc<Bridge>) -> anyhow::Result<RpcFederation> {
    bridge.complete_social_recovery().await
}

#[macro_rules_derive(rpc_method!)]
async fn signLnurlMessage(
    bridge: Arc<Bridge>,
    // hex-encoded message
    message: String,
    domain: String,
    federation_id: RpcFederationId,
) -> anyhow::Result<RpcSignedLnurlMessage> {
    let message = Message::from_slice(&hex::decode(message)?)?;
    bridge
        .sign_lnurl_message(federation_id, message, domain)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn xmppCredentials(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<RpcXmppCredentials> {
    bridge.xmpp_credentials(federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn backupXmppUsername(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    username: String,
) -> anyhow::Result<()> {
    bridge.backup_xmpp_username(federation_id, username).await
}

#[macro_rules_derive(rpc_method!)]
async fn backupStatus(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<BackupServiceStatus> {
    bridge.backup_status(federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn getNostrPubKey(
    bridge: Arc<Bridge>,
    _federation_id: RpcFederationId, // TODO: Remove me
) -> anyhow::Result<String> {
    bridge.get_nostr_pub_key().await
}

#[macro_rules_derive(rpc_method!)]
async fn signNostrEvent(
    bridge: Arc<Bridge>,
    event_hash: String,
    federation_id: RpcFederationId,
) -> anyhow::Result<String> {
    bridge.sign_nostr_event(federation_id, event_hash).await
}

#[macro_rules_derive(rpc_method!)]
async fn stabilityPoolAccountInfo(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    force_update: bool,
) -> anyhow::Result<RpcStabilityPoolAccountInfo> {
    bridge
        .stability_pool_account_info(federation_id, force_update)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn stabilityPoolNextCycleStartTime(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<u64> {
    bridge
        .stability_pool_next_cycle_start_time(federation_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn stabilityPoolCycleStartPrice(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<u64> {
    bridge.stability_pool_cycle_start_price(federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn stabilityPoolAverageFeeRate(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    num_cycles: u64,
) -> anyhow::Result<u64> {
    bridge
        .stability_pool_average_fee_rate(federation_id, num_cycles)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn stabilityPoolDepositToSeek(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    amount: RpcAmount,
) -> anyhow::Result<RpcOperationId> {
    bridge
        .stability_pool_deposit_to_seek(federation_id, amount)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn stabilityPoolWithdraw(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
    unlocked_amount: RpcAmount,
    locked_bps: u32,
) -> anyhow::Result<RpcOperationId> {
    bridge
        .stability_pool_withdraw(federation_id, unlocked_amount, locked_bps)
        .await
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
        .set_mint_module_fedi_fee_schedule(federation_id, send_ppm, receive_ppm)
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
        .set_wallet_module_fedi_fee_schedule(federation_id, send_ppm, receive_ppm)
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
        .set_lightning_module_fedi_fee_schedule(federation_id, send_ppm, receive_ppm)
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
        .set_stability_pool_module_fedi_fee_schedule(federation_id, send_ppm, receive_ppm)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn getAccruedOutstandingFediFees(
    bridge: Arc<Bridge>,
    federation_id: RpcFederationId,
) -> anyhow::Result<RpcAmount> {
    bridge
        .get_accrued_outstanding_fedi_fees(federation_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn dumpDb(bridge: Arc<Bridge>, federation_id: String) -> anyhow::Result<PathBuf> {
    bridge.dump_db(&federation_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixInit(
    bridge: Arc<Bridge>,
    home_server: String,
    sliding_sync_proxy: String,
) -> anyhow::Result<RpcMatrixAccountSession> {
    let nostr_pubkey = bridge.get_nostr_pub_key().await?;
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
                home_server,
                sliding_sync_proxy,
                &bridge.app_state,
            )
            .await?,
        )
        .map_err(|_| anyhow::anyhow!("matrix already initialized"))?;
    let matrix = get_matrix(&bridge).await?;
    matrix.get_account_session().await
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

// we are really binding generator pushing to its limits.
ts_type_ser!(
    ObservableRoomList: ObservableVec<RpcRoomListEntry> = "ObservableVec<RpcRoomListEntry>"
);

#[macro_rules_derive(rpc_method!)]
async fn matrixGetAccountSession(bridge: Arc<Bridge>) -> anyhow::Result<RpcMatrixAccountSession> {
    let matrix = get_matrix(&bridge).await?;
    matrix.get_account_session().await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomList(bridge: Arc<Bridge>) -> anyhow::Result<ObservableRoomList> {
    let matrix = get_matrix(&bridge).await?;
    Ok(ObservableRoomList(matrix.room_list().await?))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomListInvites(bridge: Arc<Bridge>) -> anyhow::Result<ObservableRoomList> {
    let matrix = get_matrix(&bridge).await?;
    Ok(ObservableRoomList(matrix.room_list_invites().await?))
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

ts_type_de!(CustomMessageData: serde_json::Map<String, serde_json::Value> = "Record<string, any>");
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

ts_type_de!(CreateRoomRequest: matrix::create_room::Request = "any");

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

// sorry for any
ts_type_ser!(ObservableRoomInfo: Observable<RoomInfo> = "Observable<any>");

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

#[macro_rules_derive(rpc_method!)]
async fn matrixSetDisplayName(bridge: Arc<Bridge>, display_name: String) -> anyhow::Result<()> {
    let matrix = get_matrix(&bridge).await?;
    matrix.set_display_name(display_name).await
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

ts_type_serde!(RpcRoomPowerLevelsEventContent: RoomPowerLevelsEventContent = "any");
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
                match method {
                $(
                    stringify!($method) => handle_wrapper($method::handle, bridge, payload).await,
                )*
                    other => Err(anyhow::anyhow!(format!(
                        "Unrecognized RPC command: {}",
                        other
                    ))),
                }
            }
        }
    };
}

rpc_methods!(RpcMethods {
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
    listTransactions,
    updateTransactionNotes,
    // Recovery
    getMnemonic,
    recoverFromMnemonic,
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
    // XMPP
    xmppCredentials,
    backupXmppUsername,
    // Nostr
    getNostrPubKey,
    signNostrEvent,
    // Stability Pool
    stabilityPoolAccountInfo,
    stabilityPoolNextCycleStartTime,
    stabilityPoolCycleStartPrice,
    stabilityPoolDepositToSeek,
    stabilityPoolWithdraw,
    stabilityPoolAverageFeeRate,
    // Developer
    getSensitiveLog,
    setSensitiveLog,
    setMintModuleFediFeeSchedule,
    setWalletModuleFediFeeSchedule,
    setLightningModuleFediFeeSchedule,
    setStabilityPoolModuleFediFeeSchedule,
    getAccruedOutstandingFediFees,
    dumpDb,

    matrixObserverCancel,

    // Matrix
    matrixInit,
    matrixGetAccountSession,
    matrixObserveSyncIndicator,
    matrixRoomList,
    matrixRoomListInvites,
    matrixRoomListUpdateRanges,
    matrixRoomTimelineItems,
    matrixRoomTimelineItemsPaginateBackwards,
    matrixRoomObserveTimelineItemsPaginateBackwards,
    matrixSendMessage,
    matrixSendMessageJson,
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
});

#[instrument(
    name = "fedimint_rpc_request",
    skip(bridge, payload),
    fields(
        request_id = %{
            static REQUEST_ID: AtomicU64 = AtomicU64::new(0);
            REQUEST_ID.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        }
    )
)]
pub async fn fedimint_rpc_async(bridge: Arc<Bridge>, method: String, payload: String) -> String {
    let _g = TimeReporter::new(format!("fedimint_rpc {method}")).level(Level::INFO);
    let sensitive_log = bridge.sensitive_log().await;
    if sensitive_log {
        tracing::info!(%payload);
    } else {
        info!("rpc call");
    }

    let result = RpcMethods::handle(bridge, &method, payload).await;

    if sensitive_log {
        tracing::info!(?result);
    }
    result.unwrap_or_else(|error| {
        error!(%error, "rpc_error");
        rpc_error(&error)
    })
}

#[cfg(test)]
mod tests {
    use std::ops::ControlFlow;
    use std::path::Path;
    use std::str::FromStr;
    use std::sync::{Once, RwLock};
    use std::time::{Duration, UNIX_EPOCH};

    use anyhow::{anyhow, bail};
    use bitcoin::secp256k1::PublicKey;
    use bitcoin::Network;
    use devimint::cmd;
    use devimint::util::{ClnLightningCli, FedimintCli, LnCli};
    use fedi_social_client::common::VerificationDocument;
    use fedimint_core::{apply, async_trait_maybe_send, Amount};
    use fedimint_logging::TracingSetup;
    use tracing::{error, info};

    use super::*;
    use crate::api::{RegisterDeviceError, RegisteredDevice};
    use crate::constants::{FEDI_FILE_PATH, MILLION};
    use crate::ffi::PathBasedStorage;
    use crate::multi::MultiFederation;
    use crate::storage::{FediFeeSchedule, IStorage};
    use crate::types::{
        RpcOOBReissueState, RpcOOBState, RpcReturningMemberStatus, RpcTransactionDirection,
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

    struct MockFediApi;

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
        ) -> anyhow::Result<Bolt11Invoice> {
            unimplemented!("TODO shaurya implement when testing");
        }

        // TODO shaurya make fetch return "test device" after register called
        async fn fetch_registered_devices_for_seed(
            &self,
            _seed: bip39::Mnemonic,
        ) -> anyhow::Result<Vec<RegisteredDevice>> {
            Ok(vec![])
        }

        async fn register_device_for_seed(
            &self,
            _seed: bip39::Mnemonic,
            _device_index: u8,
            _device_identifier: String,
            _force_overwrite: bool,
        ) -> anyhow::Result<(), RegisterDeviceError> {
            Ok(())
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
    async fn use_lnd_gateway(multi: &MultiFederation) -> anyhow::Result<()> {
        let lnd_node_pubkey: PublicKey = cmd!(LnCli, "getinfo").out_json().await?
            ["identity_pubkey"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap()
            .parse()
            .unwrap();
        match multi {
            MultiFederation::V2(v2) => {
                let gateways = v2.list_gateways().await?;
                for gateway in gateways {
                    if gateway.node_pub_key.0 == lnd_node_pubkey {
                        v2.switch_gateway(&gateway.gateway_id.0).await?;
                        return Ok(());
                    }
                }
                bail!("No gateway is using LND's node pubkey")
            }
        }
    }

    async fn amount_from_ecash(ecash_string: String) -> anyhow::Result<fedimint_core::Amount> {
        if let Ok(ecash) = fedimint_mint_client::OOBNotes::from_str(&ecash_string) {
            Ok(ecash.total_amount())
        } else {
            bail!("failed to parse ecash")
        }
    }

    async fn cli_generate_ecash(
        amount: fedimint_core::Amount,
        federation: &MultiFederation,
    ) -> anyhow::Result<String> {
        let ecash_string = match federation {
            MultiFederation::V2(_) => cmd!(
                FedimintCli,
                "spend",
                "--allow-overpay",
                amount.msats.to_string()
            )
            .out_json()
            .await?["notes"]
                .as_str()
                .map(|s| s.to_owned())
                .expect("'note' key not found generating ecash with fedimint-cli"),
        };
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

    async fn cli_receive_ecash(
        ecash: String,
        federation: Arc<MultiFederation>,
    ) -> anyhow::Result<()> {
        match *federation {
            MultiFederation::V2(_) => {
                cmd!(FedimintCli, "reissue", ecash).run().await?;
            }
        }
        Ok(())
    }

    pub fn copy_recursively<A: AsRef<Path>>(
        source: impl AsRef<Path>,
        destination: A,
    ) -> std::io::Result<()> {
        std::fs::create_dir_all(&destination)?;
        for entry in std::fs::read_dir(source)? {
            let entry = entry?;
            let filetype = entry.file_type()?;
            if filetype.is_dir() {
                copy_recursively(entry.path(), destination.as_ref().join(entry.file_name()))?;
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
        pub async fn cmd(self) -> devimint::util::Command {
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

    async fn setup() -> anyhow::Result<(Arc<Bridge>, Arc<MultiFederation>)> {
        let bridge = setup_bridge().await?;

        let federation = join_test_fed(&bridge).await?;
        Ok((bridge, federation))
    }

    async fn setup_bridge() -> anyhow::Result<Arc<Bridge>> {
        INIT_TRACING.call_once(|| {
            TracingSetup::default()
                .init()
                .expect("Failed to initialize tracing");
        });
        let event_sink = Arc::new(FakeEventSink::new());
        let data_dir = create_data_dir();
        let storage = Arc::new(PathBasedStorage::new(data_dir).await?);
        let fedi_api = Arc::new(MockFediApi);
        let bridge = match fedimint_initialize_async(
            storage,
            event_sink,
            fedi_api,
            "Unknown (bridge tests)".to_owned(),
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

    async fn join_test_fed(bridge: &Arc<Bridge>) -> Result<Arc<MultiFederation>, anyhow::Error> {
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
        let fedimint_federation = joinFederation(bridge.clone(), invite_code).await?;
        let federation = bridge
            .get_multi_maybe_recovering(&fedimint_federation.id.0)
            .await?;
        use_lnd_gateway(&federation).await?;
        Ok(federation)
    }

    async fn join_test_fed_recovery(
        bridge: &Arc<Bridge>,
    ) -> Result<Arc<MultiFederation>, anyhow::Error> {
        let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
        let fedimint_federation = joinFederation(bridge.clone(), invite_code).await?;
        let federation = bridge
            .get_multi_maybe_recovering(&fedimint_federation.id.0)
            .await?;
        Ok(federation)
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
        let fedi_api = Arc::new(MockFediApi);
        let invalid_fedi_file = String::from(r#"{"format_version": 0, "root_seed": "abcd"}"#);
        storage
            .write_file(FEDI_FILE_PATH.as_ref(), invalid_fedi_file.clone().into())
            .await?;
        assert!(fedimint_initialize_async(
            storage.clone(),
            event_sink,
            fedi_api,
            "Unknown (bridge tests)".to_owned(),
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
        copy_recursively(fixture_dir, &data_dir)?;
        let storage = Arc::new(PathBasedStorage::new(data_dir).await?);
        let fedi_api = Arc::new(MockFediApi);
        let bridge = fedimint_initialize_async(
            storage,
            event_sink,
            fedi_api,
            "Unknown (bridge tests)".to_owned(),
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
        assert!(joinFederation(bridge.clone(), env_invite_code.clone())
            .await
            .is_err());

        // listTransactions works
        let rpc_federation_id = federation.federation_id();
        let federations = listFederations(bridge.clone()).await?;
        assert_eq!(federations.len(), 1);
        assert_eq!(env_invite_code.clone(), federations[0].invite_code);

        // leaveFederation works
        leaveFederation(bridge.clone(), rpc_federation_id).await?;
        assert_eq!(listFederations(bridge.clone()).await?.len(), 0);

        // rejoin without any rocksdb locking problems
        joinFederation(bridge.clone(), env_invite_code).await?;
        assert_eq!(listFederations(bridge).await?.len(), 1);

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
            federation.federation_id(),
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
            bridge.clone(),
            federation.federation_id(),
            rpc_receive_amount,
            description,
            None,
        )
        .await?;

        cln_pay_invoice(&invoice_string).await?;

        // TODO: generateInvoice needs to spawn a task that reacts to updates
        fedimint_core::task::sleep(Duration::from_secs(15)).await;

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
        payInvoice(bridge.clone(), federation.federation_id(), invoice_string).await?;

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
            federation.federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        // receive ecash
        let ecash_receive_amount = fedimint_core::Amount::from_msats(10000);
        let ecash = cli_generate_ecash(ecash_receive_amount, &federation).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        let receive_fedi_fee = Amount::from_msats(
            (ecash_receive_amount.msats * fedi_fees_receive_ppm).div_ceil(MILLION),
        );
        receiveEcash(bridge.clone(), federation.federation_id(), ecash).await?;
        wait_for_ecash_reissue(&bridge, &federation).await?;

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
                bridge.clone(),
                federation.federation_id(),
                RpcAmount(ecash_receive_amount),
            )
            .await
            .is_err());
        }
        let ecash_send_amount = Amount::from_msats(ecash_receive_amount.msats / 2);
        let send_fedi_fee =
            Amount::from_msats((ecash_send_amount.msats * fedi_fees_send_ppm).div_ceil(MILLION));
        let send_ecash = generateEcash(
            bridge.clone(),
            federation.federation_id(),
            RpcAmount(ecash_send_amount),
        )
        .await?
        .ecash;

        assert_eq!(
            ecash_receive_amount - receive_fedi_fee - ecash_send_amount - send_fedi_fee,
            federation.get_balance().await,
        );

        // receive with fedimint-cli
        cli_receive_ecash(send_ecash, federation).await?;

        Ok(())
    }

    async fn wait_for_ecash_reissue(
        bridge: &Arc<Bridge>,
        federation: &Arc<MultiFederation>,
    ) -> Result<(), anyhow::Error> {
        devimint::util::poll(
            "waiting for ecash reissue",
            Some(Duration::from_secs(30)),
            || async {
                let oob_state = bridge
                    .list_transactions(federation.federation_id(), None, None)
                    .await
                    .map_err(ControlFlow::Break)?
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
                    Some(RpcOOBState::Reissue(_)) => {
                        Err(ControlFlow::Continue(anyhow!("not done yet")))
                    }
                    Some(_) => Err(ControlFlow::Break(anyhow!(
                        "oob state must have reissue state present on ecash reissue"
                    ))),
                }
            },
        )
        .await
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_ecash_overissue() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;

        // receive ecash
        let ecash_requested_amount = fedimint_core::Amount::from_msats(10000);
        let ecash = cli_generate_ecash(ecash_requested_amount, &federation).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        receiveEcash(bridge.clone(), federation.federation_id(), ecash).await?;
        wait_for_ecash_reissue(&bridge, &federation).await?;

        // check balance
        assert_eq!(ecash_receive_amount, federation.get_balance().await,);

        let fedi_fee_ppm = bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.federation_id().0,
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
                bridge.clone(),
                federation.federation_id(),
                RpcAmount(iteration_amount),
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

    #[tokio::test(flavor = "multi_thread")]
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
            federation.federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        let address = generateAddress(bridge.clone(), federation.federation_id()).await?;
        bitcoin_cli_send_to_address(&address, "0.1").await?;

        // TODO: do something smarter than sleep
        fedimint_core::task::sleep(Duration::from_secs(15)).await;

        let btc_amount = Amount::from_sats(10_000_000);
        let receive_fedi_fee =
            Amount::from_msats((btc_amount.msats * fedi_fees_receive_ppm).div_ceil(MILLION));
        assert_eq!(
            btc_amount - receive_fedi_fee,
            federation.get_balance().await,
        );

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_ecash_cancel() -> anyhow::Result<()> {
        let (bridge, federation) = setup().await?;

        // receive ecash
        let ecash_receive_amount = fedimint_core::Amount::from_msats(100);
        let ecash = cli_generate_ecash(ecash_receive_amount, &federation).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        receiveEcash(bridge.clone(), federation.federation_id(), ecash).await?;
        wait_for_ecash_reissue(&bridge, &federation).await?;

        // check balance
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // spend half of received ecash
        let send_ecash = generateEcash(
            bridge.clone(),
            federation.federation_id(),
            RpcAmount(Amount::from_msats(ecash_receive_amount.msats / 2)),
        )
        .await?
        .ecash;

        // cancel too fast doesn't work: https://github.com/fedimint/fedimint/pull/3435
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        cancelEcash(bridge.clone(), federation.federation_id(), send_ecash).await?;
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_backup_and_recovery() -> anyhow::Result<()> {
        let (backup_bridge, federation) = setup().await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000), &federation).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&backup_bridge, &federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = backup_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.federation_id().0,
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let expected_fedi_fee =
            Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
        backup_bridge
            .stability_pool_deposit_to_seek(
                federation.federation_id(),
                RpcAmount(amount_to_deposit),
            )
            .await?;

        let ecash_balance_before = federation.get_balance().await;

        // set username and do a backup
        let federation_id = federation.federation_id();
        let username = "satoshi".to_string();
        backupXmppUsername(
            backup_bridge.clone(),
            federation_id.clone(),
            username.clone(),
        )
        .await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        let mnemonic = getMnemonic(backup_bridge.clone()).await?;
        drop(federation);
        drop(backup_bridge);

        // create new bridge which hasn't joined federation yet and recover mnemnonic
        let recovery_bridge = setup_bridge().await?;
        recoverFromMnemonic(recovery_bridge.clone(), mnemonic).await?;

        // Rejoin federation and assert that balances are correct
        let recovery_federation = join_test_fed_recovery(&recovery_bridge).await?;
        match &*recovery_federation {
            MultiFederation::V2(x) => assert!(x.recovering()),
        }
        let id = recovery_federation.federation_id();
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

            fedimint_core::task::sleep(Duration::from_secs(2)).await;
        }
        let recovery_federation = recovery_bridge.get_multi(&id.0).await?;
        // Currently, accrued fedi fee is merged back into balance upon recovery
        assert_eq!(
            ecash_balance_before + expected_fedi_fee,
            recovery_federation.get_balance().await
        );
        assert_eq!(
            Some(username),
            recovery_federation.get_xmpp_username().await
        );

        let account_info = recovery_bridge
            .stability_pool_account_info(recovery_federation.federation_id(), true)
            .await?;
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
        let (original_bridge, federation) = setup().await?;
        let recovery_bridge = setup_bridge().await?;
        let (guardian_bridge, _) = setup().await?;

        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000), &federation).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&original_bridge, &federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let amount_to_deposit = Amount::from_msats(110_000);
        let fedi_fee_ppm = original_bridge
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.federation_id().0,
                stability_pool_client::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        let expected_fedi_fee =
            Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
        original_bridge
            .stability_pool_deposit_to_seek(
                federation.federation_id(),
                RpcAmount(amount_to_deposit),
            )
            .await?;

        let ecash_balance_before = federation.get_balance().await;

        // set username and do a backup
        let federation_id = federation.federation_id();
        let username = "satoshi".to_string();
        backupXmppUsername(
            original_bridge.clone(),
            federation_id.clone(),
            username.clone(),
        )
        .await?;

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

        // Check backups match (TODO: how can I make sure that they're equal b/c nothing
        // happened?)
        let final_words: Vec<String> = getMnemonic(recovery_bridge.clone()).await?;
        assert_eq!(initial_words, final_words);

        // Assert that balances are correct
        let recovery_federation = recovery_bridge
            .federations
            .lock()
            .await
            .clone()
            .into_values()
            .next()
            .ok_or(anyhow!("Rejoined federation must exist"))?;
        match &*recovery_federation {
            MultiFederation::V2(x) => assert!(x.recovering()),
        }
        let id = recovery_federation.federation_id();
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

            fedimint_core::task::sleep(Duration::from_secs(2)).await;
        }
        let recovery_federation = recovery_bridge.get_multi(&id.0).await?;
        // Currently, accrued fedi fee is merged back into balance upon recovery
        assert_eq!(
            ecash_balance_before + expected_fedi_fee,
            recovery_federation.get_balance().await
        );

        let account_info = recovery_bridge
            .stability_pool_account_info(recovery_federation.federation_id(), true)
            .await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_stability_pool() -> anyhow::Result<()> {
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
            federation.federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        // Test default account info state
        let account_info = bridge
            .stability_pool_account_info(federation.federation_id(), true)
            .await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert!(account_info.staged_seeks.is_empty());
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());

        // Receive some ecash first
        let initial_balance = Amount::from_msats(500_000);
        let ecash = cli_generate_ecash(initial_balance, &federation).await?;
        let receive_amount = federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&bridge, &federation).await?;

        // Deposit to seek and verify account info
        let amount_to_deposit = Amount::from_msats(receive_amount.msats / 2);
        let deposit_fedi_fee =
            Amount::from_msats((amount_to_deposit.msats * fedi_fees_send_ppm).div_ceil(MILLION));
        bridge
            .stability_pool_deposit_to_seek(
                federation.federation_id(),
                RpcAmount(amount_to_deposit),
            )
            .await?;
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

            fedimint_core::task::sleep(Duration::from_secs(2)).await;
        }

        assert_eq!(
            receive_amount - amount_to_deposit - deposit_fedi_fee,
            federation.get_balance().await,
        );
        let account_info = bridge
            .stability_pool_account_info(federation.federation_id(), true)
            .await?;
        assert_eq!(account_info.idle_balance.0, Amount::ZERO);
        assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
        assert!(account_info.staged_cancellation.is_none());
        assert!(account_info.locked_seeks.is_empty());

        // Withdraw and verify account info
        let amount_to_withdraw = Amount::from_msats(amount_to_deposit.msats / 2);
        let withdraw_fedi_fee = Amount::from_msats(
            (amount_to_withdraw.msats * fedi_fees_receive_ppm).div_ceil(MILLION),
        );
        bridge
            .stability_pool_withdraw(
                federation.federation_id(),
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

            fedimint_core::task::sleep(Duration::from_secs(2)).await;
        }

        assert_eq!(
            receive_amount - amount_to_deposit - deposit_fedi_fee + amount_to_withdraw
                - withdraw_fedi_fee,
            federation.get_balance().await,
        );
        let account_info = bridge
            .stability_pool_account_info(federation.federation_id(), true)
            .await?;
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
        let (bridge, federation) = setup().await?;
        let k1 = String::from("cfcb7616d615252180e392f509207e1f610f8d6106588c61c3e7bbe8577e4c4c");
        let message = Message::from_slice(&hex::decode(k1)?)?;
        let domain1 = String::from("fedi.xyz");
        let domain2 = String::from("fedimint.com");

        // Test signing a message.
        let sig1 = bridge
            .sign_lnurl_message(federation.federation_id(), message, domain1.clone())
            .await?;

        // Test that signing the same message twice results in identical signatures.
        let sig2 = bridge
            .sign_lnurl_message(federation.federation_id(), message, domain1.clone())
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
            .sign_lnurl_message(federation.federation_id(), message, domain2.clone())
            .await?;
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
        let fedimint_federation = joinFederation(bridge.clone(), invite_code.clone()).await?;
        let federation = bridge.get_multi(&fedimint_federation.id.0).await?;
        use_lnd_gateway(&federation).await?;

        // receive ecash and backup
        let ecash =
            cli_generate_ecash(fedimint_core::Amount::from_msats(10_000), &federation).await?;
        federation.receive_ecash(ecash).await?;
        wait_for_ecash_reissue(&bridge, &federation).await?;
        let federation_id = federation.federation_id();
        let username = "satoshi".to_string();
        backupXmppUsername(bridge.clone(), federation_id.clone(), username.clone()).await?;

        // extract mnemonic, leave federation and drop bridge
        let mnemonic = getMnemonic(bridge.clone()).await?;
        leaveFederation(bridge.clone(), federation_id).await?;
        drop(bridge);

        // query preview again w/ new bridge (recovered using mnemonic), it should be
        // "returning"
        let bridge = setup_bridge().await?;
        recoverFromMnemonic(bridge.clone(), mnemonic).await?;
        assert!(matches!(
            federationPreview(bridge.clone(), invite_code.clone())
                .await?
                .returning_member_status,
            RpcReturningMemberStatus::ReturningMember
        ));

        Ok(())
    }
}
