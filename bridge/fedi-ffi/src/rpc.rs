#![allow(non_snake_case, non_camel_case_types)]
use std::collections::BTreeSet;
use std::panic::PanicHookInfo;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use anyhow::{bail, Context};
use bitcoin::secp256k1::Message;
use bitcoin::Amount;
use bridge::bg_matrix::BgMatrix;
use bridge::onboarding::BridgeOnboarding;
use bridge::providers::FederationProviderWrapper;
use bridge::{Bridge, BridgeFull, RpcBridgeStatus, RuntimeExt as _};
use bug_report::reused_ecash_proofs::SerializedReusedEcashProofs;
use federations::federation_sm::FederationState;
use federations::federation_v2::client::ClientExt;
use federations::federation_v2::spv2_pay_address::Spv2PaymentAddress;
use federations::federation_v2::FederationV2;
use federations::Federations;
use fedimint_client::db::ChronologicalOperationLogKey;
use fedimint_core::core::OperationId;
use fedimint_core::invite_code::InviteCode;
use fedimint_core::timing::TimeReporter;
use futures::Future;
use lightning_invoice::Bolt11Invoice;
use macro_rules_attribute::macro_rules_derive;
use matrix::SendMessageData;
use matrix_sdk::ruma::api::client::authenticated_media::get_media_preview;
use matrix_sdk::ruma::api::client::profile::get_profile;
use matrix_sdk::ruma::api::client::push::Pusher;
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use matrix_sdk::ruma::events::room::MediaSource;
use matrix_sdk::ruma::OwnedEventId;
use mime::Mime;
use multispend::db::RpcMultispendGroupStatus;
use multispend::{
    GroupInvitation, GroupInvitationWithKeys, MsEventData, MultispendGroupVoteType,
    MultispendListedEvent, WithdrawRequestWithApprovals, WithdrawalResponseType,
};
use rpc_types::communities::RpcCommunity;
use rpc_types::error::{ErrorCode, RpcError};
use rpc_types::event::{Event, EventSink, PanicEvent, SocialRecoveryEvent, TypedEventExt};
use rpc_types::matrix::{
    RpcBackPaginationStatus, RpcComposerDraft, RpcMatrixAccountSession, RpcMatrixInitializeStatus,
    RpcMatrixUploadResult, RpcMatrixUserDirectorySearchResponse, RpcPublicRoomInfo, RpcRoomId,
    RpcRoomMember, RpcRoomNotificationMode, RpcSerializedRoomInfo, RpcSyncIndicator,
    RpcTimelineEventItemId, RpcTimelineItem, RpcUserId,
};
use rpc_types::nostril::{RpcNostrPubkey, RpcNostrSecret};
use rpc_types::sp_transfer::{RpcAccountId, RpcSpTransferState, SpMatrixTransferId};
use rpc_types::spv2_transfer_meta::Spv2TransferTxMeta;
use rpc_types::{
    FrontendMetadata, GuardianStatus, NetworkError, RpcAmount, RpcAppFlavor, RpcEcashInfo,
    RpcEventId, RpcFederation, RpcFederationId, RpcFederationMaybeLoading, RpcFederationPreview,
    RpcFeeDetails, RpcFiatAmount, RpcGenerateEcashResponse, RpcInvoice, RpcLightningGateway,
    RpcMediaUploadParams, RpcOperationId, RpcParseInviteCodeResult, RpcPayInvoiceResponse,
    RpcPeerId, RpcPrevPayInvoiceResult, RpcPublicKey, RpcRecoveryId, RpcRegisteredDevice,
    RpcSPv2CachedSyncResponse, RpcSPv2SyncResponse, RpcSignature, RpcSignedLnurlMessage,
    RpcStabilityPoolAccountInfo, RpcTransaction, RpcTransactionDirection, RpcTransactionListEntry,
    SocialRecoveryQr,
};
use runtime::api::LiveFediApi;
use runtime::bridge_runtime::Runtime;
use runtime::event::IEventSink;
use runtime::features::{FeatureCatalog, RuntimeEnvironment};
use runtime::rpc_stream::{RpcStreamId, RpcVecDiffStreamId};
use runtime::storage::state::FiatFXInfo;
use runtime::storage::{OnboardingCompletionMethod, Storage};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use stability_pool_client::common::{AccountId, AccountType, FiatAmount, FiatOrAll};
pub use tokio;
use tracing::{error, info, instrument, Level};

use crate::guardinito_client::{guardianito_get_or_create_bot, GuardianitoBot};

#[cfg(test)]
pub mod tests;

#[derive(Debug, thiserror::Error)]
pub enum FedimintError {
    #[error("{0}")]
    OtherError(#[from] anyhow::Error),
}

pub async fn fedimint_initialize_async(
    storage: Storage,
    event_sink: EventSink,
    device_identifier: String,
    app_flavor: RpcAppFlavor,
) -> anyhow::Result<Arc<Bridge>> {
    info!(
        "bridge version hash={}",
        env!("FEDIMINT_BUILD_CODE_VERSION")
    );
    let _g = TimeReporter::new("fedimint_initialize").level(Level::INFO);

    let feature_catalog = Arc::new(FeatureCatalog::new(match app_flavor {
        RpcAppFlavor::Dev => RuntimeEnvironment::Dev,
        RpcAppFlavor::Nightly => RuntimeEnvironment::Staging,
        RpcAppFlavor::Bravo => RuntimeEnvironment::Prod,
        RpcAppFlavor::Tests => RuntimeEnvironment::Tests,
    }));

    let fedi_api = Arc::new(LiveFediApi::new(feature_catalog.clone()));

    let bridge = Bridge::new(
        storage,
        event_sink,
        fedi_api,
        feature_catalog,
        device_identifier.parse()?,
    )
    .await?;
    Ok(Arc::new(bridge))
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
pub(crate) trait TryGet<T> {
    fn try_get(self) -> anyhow::Result<T>;
}

impl<'a> TryGet<&'a Bridge> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a Bridge> {
        Ok(self)
    }
}

impl<'a> TryGet<&'a BridgeFull> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a BridgeFull> {
        let full = self.full()?;
        Ok(full)
    }
}

impl TryGet<Arc<BridgeOnboarding>> for &'_ Bridge {
    fn try_get(self) -> anyhow::Result<Arc<BridgeOnboarding>> {
        match self.state() {
            bridge::BridgeState::Onboarding(onboarding) => Ok(onboarding),
            _ => bail!("onboarding is complete"),
        }
    }
}

impl TryGet<Arc<Runtime>> for &Bridge {
    fn try_get(self) -> anyhow::Result<Arc<Runtime>> {
        Ok(self.runtime()?.clone())
    }
}

impl<'a> TryGet<&'a Federations> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a Federations> {
        Ok(&self.full()?.federations)
    }
}

impl<'a> TryGet<&'a BgMatrix> for &'a Bridge {
    fn try_get(self) -> anyhow::Result<&'a BgMatrix> {
        Ok(&self.full()?.matrix)
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
pub(crate) async fn joinFederation(
    bridge: &BridgeFull,
    invite_code: String,
    recover_from_scratch: bool,
) -> anyhow::Result<RpcFederation> {
    info!("joining federation {:?}", invite_code);
    let fed_arc = bridge
        .federations
        .join_federation(invite_code, recover_from_scratch)
        .await?;
    bridge.sp_transfers_services.account_id_responder.trigger();
    Ok(fed_arc.to_rpc_federation().await)
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
                RpcFederationMaybeLoading::Ready(fed_arc.to_rpc_federation().await)
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

#[macro_rules_derive(federation_rpc_method!)]
async fn getPrevPayInvoiceResult(
    federation: Arc<FederationV2>,
    invoice: String,
) -> anyhow::Result<RpcPrevPayInvoiceResult> {
    let invoice: Bolt11Invoice = invoice.trim().parse().context(ErrorCode::InvalidInvoice)?;
    federation.get_prev_pay_invoice_result(&invoice).await
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
async fn supportsSafeOnchainDeposit(federation: Arc<FederationV2>) -> anyhow::Result<bool> {
    Ok(federation.client.wallet()?.supports_safe_deposit().await)
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
) -> anyhow::Result<RpcOperationId> {
    let address = address.trim().parse().context("Invalid Bitcoin Address")?;
    let amount: Amount = Amount::from_sat(sats);
    federation
        .pay_address(address, amount, frontend_metadata)
        .await
        .map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn calculateMaxGenerateEcash(federation: Arc<FederationV2>) -> anyhow::Result<RpcAmount> {
    federation.calculate_max_generate_ecash().await
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
async fn parseEcash(federations: &Federations, ecash: String) -> anyhow::Result<RpcEcashInfo> {
    federations.validate_ecash(ecash).await
}

#[macro_rules_derive(rpc_method!)]
async fn parseInviteCode(
    _runtime: Arc<Runtime>,
    invite_code: String,
) -> anyhow::Result<RpcParseInviteCodeResult> {
    let invite = InviteCode::from_str(&invite_code.to_lowercase())?;
    let federation_id = invite.federation_id().to_string();
    Ok(RpcParseInviteCodeResult {
        federation_id: RpcFederationId(federation_id),
    })
}

#[macro_rules_derive(rpc_method!)]
async fn updateCachedFiatFXInfo(
    runtime: Arc<Runtime>,
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
) -> anyhow::Result<Vec<Result<RpcTransactionListEntry, String>>> {
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
async fn repairWallet(federation: Arc<FederationV2>) -> anyhow::Result<()> {
    federation.repair_wallet().await
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
async fn getMnemonic(runtime: Arc<Runtime>) -> anyhow::Result<Vec<String>> {
    runtime.get_mnemonic_words().await
}

#[macro_rules_derive(rpc_method!)]
async fn checkMnemonic(runtime: Arc<Runtime>, mnemonic: Vec<String>) -> anyhow::Result<bool> {
    Ok(runtime.get_mnemonic_words().await? == mnemonic)
}

#[macro_rules_derive(rpc_method!)]
async fn restoreMnemonic(
    bridge: Arc<BridgeOnboarding>,
    mnemonic: Vec<String>,
) -> anyhow::Result<()> {
    bridge.restore_mnemonic(mnemonic.join(" ").parse()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn completeOnboardingNewSeed(bridge: &Bridge) -> anyhow::Result<()> {
    bridge
        .complete_onboarding(OnboardingCompletionMethod::NewSeed)
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
async fn locateRecoveryFile(runtime: Arc<Runtime>) -> anyhow::Result<PathBuf> {
    let storage = runtime.storage.clone();
    Ok(storage.platform_path(RECOVERY_FILENAME.as_ref()))
}

#[macro_rules_derive(rpc_method!)]
async fn validateRecoveryFile(bridge: Arc<BridgeOnboarding>, path: PathBuf) -> anyhow::Result<()> {
    bridge.validate_recovery_file(path).await
}

// FIXME: maybe this would better be called "begin_social_recovery"
#[macro_rules_derive(rpc_method!)]
async fn recoveryQr(bridge: Arc<BridgeOnboarding>) -> anyhow::Result<Option<SocialRecoveryQr>> {
    bridge.recovery_qr().await
}

#[macro_rules_derive(rpc_method!)]
async fn cancelSocialRecovery(bridge: Arc<BridgeOnboarding>) -> anyhow::Result<()> {
    bridge.social_recovery_cancel().await
}

#[macro_rules_derive(rpc_method!)]
async fn socialRecoveryApprovals(
    bridge: Arc<BridgeOnboarding>,
) -> anyhow::Result<SocialRecoveryEvent> {
    bridge.social_recovery_approvals().await
}

#[macro_rules_derive(rpc_method!)]
async fn socialRecoveryDownloadVerificationDoc(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    recovery_id: RpcRecoveryId,
    peer_id: RpcPeerId,
    guardian_password: String,
) -> anyhow::Result<Option<PathBuf>> {
    bridge
        .download_verification_doc(federation_id, recovery_id, peer_id, guardian_password)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn approveSocialRecoveryRequest(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    recovery_id: RpcRecoveryId,
    peer_id: RpcPeerId,
    guardian_password: String,
) -> anyhow::Result<()> {
    bridge
        .approve_social_recovery_request(federation_id, recovery_id, peer_id, guardian_password)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn setGuardianPassword(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    peer_id: RpcPeerId,
    guardian_password: String,
) -> anyhow::Result<()> {
    bridge
        .set_guardian_password(federation_id, peer_id, guardian_password)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn getGuardianPassword(
    bridge: &BridgeFull,
    federation_id: RpcFederationId,
    peer_id: RpcPeerId,
) -> anyhow::Result<String> {
    bridge.get_guardian_password(federation_id, peer_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn completeSocialRecovery(bridge: Arc<BridgeOnboarding>) -> anyhow::Result<()> {
    bridge.complete_social_recovery().await
}

#[macro_rules_derive(rpc_method!)]
async fn signLnurlMessage(
    runtime: Arc<Runtime>,
    // hex-encoded message
    message: String,
    domain: String,
) -> anyhow::Result<RpcSignedLnurlMessage> {
    let message = Message::from_digest_slice(&hex::decode(message)?)?;
    runtime.sign_lnurl_message(message, domain).await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn supportsRecurringdLnurl(federation: Arc<FederationV2>) -> anyhow::Result<bool> {
    Ok(federation.get_recurringd_api().await.is_some())
}

#[macro_rules_derive(federation_rpc_method!)]
async fn getRecurringdLnurl(federation: Arc<FederationV2>) -> anyhow::Result<String> {
    federation
        .get_recurringd_lnurl(
            federation
                .get_recurringd_api()
                .await
                .context(ErrorCode::RecurringdMetaNotFound)?,
        )
        .await
}

#[macro_rules_derive(federation_rpc_method!)]
async fn backupNow(federation: Arc<FederationV2>) -> anyhow::Result<()> {
    federation.backup().await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn fedimintVersion(_bridge: &Bridge) -> anyhow::Result<String> {
    Ok(fedimint_core::version::cargo_pkg().to_string())
}

#[macro_rules_derive(rpc_method!)]
async fn getNostrSecret(bridge: &BridgeFull) -> anyhow::Result<RpcNostrSecret> {
    bridge.nostril.get_secret_key().await
}

#[macro_rules_derive(rpc_method!)]
async fn getNostrPubkey(bridge: &BridgeFull) -> anyhow::Result<RpcNostrPubkey> {
    bridge.nostril.get_pub_key().await
}

#[macro_rules_derive(rpc_method!)]
async fn guardianitoGetOrCreateBot(bridge: &BridgeFull) -> anyhow::Result<GuardianitoBot> {
    let matrix = bridge.matrix.wait().await;
    let user_id = matrix
        .client
        .user_id()
        .context("matrix user id not available")?
        .to_string();

    guardianito_get_or_create_bot(&bridge.runtime, &bridge.nostril, user_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn signNostrEvent(bridge: &BridgeFull, event_hash: String) -> anyhow::Result<String> {
    bridge.nostril.sign_nostr_event(event_hash).await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrEncrypt(
    bridge: &BridgeFull,
    pubkey: String,
    plaintext: String,
) -> anyhow::Result<String> {
    bridge.nostril.nip44_encrypt(pubkey, plaintext).await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrDecrypt(
    bridge: &BridgeFull,
    pubkey: String,
    ciphertext: String,
) -> anyhow::Result<String> {
    bridge.nostril.nip44_decrypt(pubkey, ciphertext).await
}
#[macro_rules_derive(rpc_method!)]
async fn nostrEncrypt04(
    bridge: &BridgeFull,
    pubkey: String,
    plaintext: String,
) -> anyhow::Result<String> {
    bridge.nostril.nip04_encrypt(pubkey, plaintext).await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrDecrypt04(
    bridge: &BridgeFull,
    pubkey: String,
    ciphertext: String,
) -> anyhow::Result<String> {
    bridge.nostril.nip04_decrypt(pubkey, ciphertext).await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrRateFederation(
    bridge: &BridgeFull,
    federation_id: String,
    rating: u8,
    include_invite_code: bool,
) -> anyhow::Result<()> {
    let invite_code = if include_invite_code {
        let federation = bridge.federations.get_federation(&federation_id)?;
        Some(federation.get_invite_code().await)
    } else {
        None
    };

    bridge
        .nostril
        .rate_federation(federation_id, rating, invite_code)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrCreateCommunity(
    bridge: &BridgeFull,
    community_json_str: String,
) -> anyhow::Result<RpcCommunity> {
    bridge
        .nostril
        .create_community(serde_json::from_str(&community_json_str)?)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrListOurCommunities(bridge: &BridgeFull) -> anyhow::Result<Vec<RpcCommunity>> {
    bridge.nostril.list_our_communities().await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrEditCommunity(
    bridge: &BridgeFull,
    community_hex_uuid: String,
    new_community_json_str: String,
) -> anyhow::Result<()> {
    bridge
        .nostril
        .edit_community(
            &community_hex_uuid,
            serde_json::from_str(&new_community_json_str)?,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn nostrDeleteCommunity(
    bridge: &BridgeFull,
    community_hex_uuid: String,
) -> anyhow::Result<()> {
    bridge.nostril.delete_community(&community_hex_uuid).await
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
async fn spv2SubscribeAccountInfo(
    federation: Arc<FederationV2>,
    stream_id: RpcStreamId<RpcSPv2CachedSyncResponse>,
) -> anyhow::Result<()> {
    let stream = federation.spv2_subscribe_account_info().await?;
    federation
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
        .await
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

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2OurPaymentAddress(
    federation: Arc<FederationV2>,
    include_invite: bool,
) -> anyhow::Result<String> {
    let federation_invite = if include_invite {
        federation.get_invite_code().await.parse().ok()
    } else {
        None
    };
    let address = Spv2PaymentAddress {
        account_id: federation
            .client
            .spv2()?
            .our_account(AccountType::Seeker)
            .id(),
        federation_id_prefix: federation.federation_id().to_prefix(),
        federation_invite,
    };
    Ok(address.to_string())
}

#[derive(TS, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
struct RpcSpv2ParsedPaymentAddress {
    account_id: RpcAccountId,
    federation: RpcSpv2PaymentAddressFederation,
}

#[derive(TS, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
enum RpcSpv2PaymentAddressFederation {
    Joined { federation_id: RpcFederationId },
    NotJoined { federation_invite: Option<String> },
}

#[macro_rules_derive(rpc_method!)]
async fn spv2ParsePaymentAddress(
    federations: &Federations,
    address: String,
) -> anyhow::Result<RpcSpv2ParsedPaymentAddress> {
    let payment_address = address.parse::<Spv2PaymentAddress>()?;
    anyhow::ensure!(
        payment_address.account_id.acc_type() == AccountType::Seeker,
        "invalid account type"
    );
    let account_id = RpcAccountId(payment_address.account_id.to_string());
    let federation_id =
        federations.find_federation_id_for_prefix(payment_address.federation_id_prefix);

    let federation = match federation_id {
        Some(id) => RpcSpv2PaymentAddressFederation::Joined {
            federation_id: RpcFederationId(id),
        },
        None => RpcSpv2PaymentAddressFederation::NotJoined {
            federation_invite: payment_address.federation_invite.map(|i| i.to_string()),
        },
    };

    Ok(RpcSpv2ParsedPaymentAddress {
        account_id,
        federation,
    })
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2Transfer(
    federation: Arc<FederationV2>,
    account_id: RpcAccountId,
    amount: RpcFiatAmount,
    frontend_meta: FrontendMetadata,
) -> anyhow::Result<RpcOperationId> {
    let account_id: AccountId = account_id.0.parse()?;
    anyhow::ensure!(
        account_id.acc_type() == AccountType::Seeker,
        "invalid account type"
    );
    federation
        .spv2_simple_transfer(
            account_id,
            FiatAmount(amount.0),
            rpc_types::SPv2TransferMetadata::StableBalance {
                frontend_metadata: Some(frontend_meta),
            },
            Spv2TransferTxMeta::default(),
        )
        .await
        .map(Into::into)
}

#[macro_rules_derive(federation_rpc_method!)]
async fn spv2StartFastSync(federation: Arc<FederationV2>) -> anyhow::Result<()> {
    federation.spv2_start_fast_sync()
}

#[macro_rules_derive(rpc_method!)]
async fn getSensitiveLog(runtime: Arc<Runtime>) -> anyhow::Result<bool> {
    Ok(runtime.sensitive_log().await)
}

#[macro_rules_derive(rpc_method!)]
async fn setSensitiveLog(runtime: Arc<Runtime>, enable: bool) -> anyhow::Result<()> {
    runtime.set_sensitive_log(enable).await
}

#[macro_rules_derive(rpc_method!)]
async fn internalMarkBridgeExport(runtime: Arc<Runtime>) -> anyhow::Result<()> {
    runtime.app_state.set_internal_bridge_export(true).await
}

#[macro_rules_derive(rpc_method!)]
async fn internalExportBridgeState(bridge: &Bridge, path: String) -> anyhow::Result<()> {
    #[cfg(not(target_family = "wasm"))]
    bridge.export_bridge_state(path.into()).await?;
    Ok(())
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
async fn matrixInitializeStatus(
    bridge: &Bridge,
    stream_id: RpcStreamId<RpcMatrixInitializeStatus>,
) -> anyhow::Result<()> {
    let runtime: Arc<Runtime> = bridge.try_get()?;
    let bg_matrix: &BgMatrix = bridge.try_get()?;
    runtime
        .stream_pool
        .register_stream(stream_id, bg_matrix.subscribe_status())
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn fetchRegisteredDevices(
    bridge: Arc<BridgeOnboarding>,
) -> anyhow::Result<Vec<RpcRegisteredDevice>> {
    bridge.fetch_registered_devices().await
}

#[macro_rules_derive(rpc_method!)]
async fn onboardRegisterAsNewDevice(bridge: &Bridge) -> anyhow::Result<()> {
    let onboarding: Arc<BridgeOnboarding> = bridge.try_get()?;
    let device_index = onboarding
        .fetch_registered_devices()
        .await?
        .len()
        .try_into()?;
    onboarding
        .register_device_with_index(device_index, false)
        .await?;
    bridge
        .complete_onboarding(OnboardingCompletionMethod::GotDeviceIndex(device_index))
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn onboardTransferExistingDeviceRegistration(
    bridge: &Bridge,
    index: u8,
) -> anyhow::Result<()> {
    let onboarding: Arc<BridgeOnboarding> = bridge.try_get()?;
    onboarding.register_device_with_index(index, true).await?;
    drop(onboarding);
    bridge
        .complete_onboarding(OnboardingCompletionMethod::GotDeviceIndex(index))
        .await
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
    bridge: Arc<Runtime>,
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

#[macro_rules_derive(rpc_method!)]
async fn matrixGetAccountSession(
    bg_matrix: &BgMatrix,
    cached: bool,
) -> anyhow::Result<RpcMatrixAccountSession> {
    let matrix = bg_matrix.wait().await;
    matrix
        .get_account_session(cached, &matrix.runtime.app_state)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSubscribeRoomList(
    bg_matrix: &BgMatrix,
    stream_id: RpcVecDiffStreamId<RpcRoomId>,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let stream = matrix.room_list().await;
    matrix
        .runtime
        .stream_pool
        .register_stream(stream_id.0, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSubscribeRoomTimelineItems(
    bg_matrix: &BgMatrix,
    stream_id: RpcVecDiffStreamId<RpcTimelineItem>,
    room_id: RpcRoomId,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let stream = matrix.room_timeline_items(&room_id.into_typed()?).await?;
    matrix
        .runtime
        .stream_pool
        .register_stream(stream_id.0, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomPreviewContent(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
) -> anyhow::Result<Vec<RpcTimelineItem>> {
    let matrix = bg_matrix.wait().await;
    matrix.preview_room_content(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendAttachment(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    filename: String,
    file_path: PathBuf,
    params: RpcMediaUploadParams,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
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
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    event_num: u16,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix
        .room_timeline_items_paginate_backwards(&room_id.into_typed()?, event_num)
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus(
    bg_matrix: &BgMatrix,
    stream_id: RpcStreamId<RpcBackPaginationStatus>,
    room_id: RpcRoomId,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let stream = matrix
        .subscribe_timeline_items_paginate_backwards_status(&room_id.into_typed()?)
        .await?;
    matrix
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn streamCancel(bridge: &Bridge, stream_id: u32) -> anyhow::Result<()> {
    let runtime: Arc<Runtime> = bridge.try_get()?;
    runtime.stream_pool.cancel_stream(stream_id.into()).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendMessage(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    data: SendMessageData,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.send_message(&room_id.into_typed()?, data).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendReply(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    reply_to_event_id: RpcEventId,
    data: SendMessageData,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix
        .send_reply(
            &room_id.into_typed()?,
            &OwnedEventId::try_from(&*reply_to_event_id.0)?,
            data,
        )
        .await
}

ts_type_de!(CreateRoomRequest: matrix::create_room::Request = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomCreate(
    bg_matrix: &BgMatrix,
    request: CreateRoomRequest,
) -> anyhow::Result<RpcRoomId> {
    let matrix = bg_matrix.wait().await;
    matrix.room_create(request.0).await.map(RpcRoomId::from)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomCreateOrGetDm(
    bg_matrix: &BgMatrix,
    user_id: RpcUserId,
) -> anyhow::Result<RpcRoomId> {
    let matrix = bg_matrix.wait().await;
    matrix
        .create_or_get_dm(&user_id.into_typed()?)
        .await
        .map(RpcRoomId::from)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomJoin(bridge: &BridgeFull, room_id: RpcRoomId) -> anyhow::Result<()> {
    let matrix = bridge.matrix.wait().await;
    matrix.room_join(&room_id.into_typed()?).await?;
    bridge.sp_transfers_services.account_id_responder.trigger();
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomJoinPublic(bg_matrix: &BgMatrix, room_id: RpcRoomId) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.room_join_public(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomLeave(bg_matrix: &BgMatrix, room_id: RpcRoomId) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.room_leave(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSubscribeInfo(
    bg_matrix: &BgMatrix,
    stream_id: RpcStreamId<RpcSerializedRoomInfo>,
    room_id: RpcRoomId,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let stream = matrix.subscribe_room_info(&room_id.into_typed()?).await?;
    matrix
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSubscribeSyncIndicator(
    bg_matrix: &BgMatrix,
    stream_id: RpcStreamId<RpcSyncIndicator>,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let stream = matrix.subscribe_sync_status();
    matrix
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomInviteUserById(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let room_id = room_id.into_typed()?;
    matrix
        .room_invite_user_by_id(&room_id, &user_id.into_typed()?)
        .await?;
    let multispend_matrix = bg_matrix.wait_multispend().await;
    multispend_matrix
        .maybe_send_multispend_reannouncement(&room_id)
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetName(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    name: String,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.room_set_name(&room_id.into_typed()?, name).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetTopic(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    topic: String,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.room_set_topic(&room_id.into_typed()?, topic).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixIgnoreUser(bg_matrix: &BgMatrix, user_id: RpcUserId) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.ignore_user(&user_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUnignoreUser(bg_matrix: &BgMatrix, user_id: RpcUserId) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.unignore_user(&user_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixListIgnoredUsers(bg_matrix: &BgMatrix) -> anyhow::Result<Vec<RpcUserId>> {
    let matrix = bg_matrix.wait().await;
    matrix.list_ignored_users().await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomKickUser(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
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
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
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
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    user_id: RpcUserId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
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
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
) -> anyhow::Result<Vec<RpcRoomMember>> {
    let matrix = bg_matrix.wait().await;
    matrix.room_get_members(&room_id.into_typed()?).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUserDirectorySearch(
    bg_matrix: &BgMatrix,
    search_term: String,
    limit: u32,
) -> anyhow::Result<RpcMatrixUserDirectorySearchResponse> {
    let matrix = bg_matrix.wait().await;
    matrix
        .search_user_directory(&search_term, limit.into())
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixPublicRoomInfo(
    bg_matrix: &BgMatrix,
    room_id: String,
) -> anyhow::Result<RpcPublicRoomInfo> {
    let matrix = bg_matrix.wait().await;
    matrix.public_room_info(&room_id).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSetDisplayName(bg_matrix: &BgMatrix, display_name: String) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.set_display_name(display_name).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSetAvatarUrl(bg_matrix: &BgMatrix, avatar_url: String) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.set_avatar_url(avatar_url).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixUploadMedia(
    bg_matrix: &BgMatrix,
    path: PathBuf,
    mime_type: String,
) -> anyhow::Result<RpcMatrixUploadResult> {
    let matrix = bg_matrix.wait().await;
    let mime = mime_type.parse::<Mime>().context(ErrorCode::BadRequest)?;
    let file = matrix.runtime.get_matrix_media_file(path).await?;
    matrix.upload_file(mime, file).await
}

ts_type_serde!(RpcRoomPowerLevelsEventContent: RoomPowerLevelsEventContent = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetPowerLevels(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
) -> anyhow::Result<RpcRoomPowerLevelsEventContent> {
    let matrix = bg_matrix.wait().await;
    Ok(RpcRoomPowerLevelsEventContent(
        matrix.room_get_power_levels(&room_id.into_typed()?).await?,
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetPowerLevels(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    new: RpcRoomPowerLevelsEventContent,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix
        .room_change_power_levels(&room_id.into_typed()?, new.0)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSendReceipt(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    event_id: String,
) -> anyhow::Result<bool> {
    let matrix = bg_matrix.wait().await;
    matrix
        .room_send_receipt(&room_id.into_typed()?, &event_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomSetNotificationMode(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    mode: RpcRoomNotificationMode,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix
        .room_set_notification_mode(&room_id.into_typed()?, mode)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomGetNotificationMode(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
) -> anyhow::Result<Option<RpcRoomNotificationMode>> {
    let matrix = bg_matrix.wait().await;
    matrix
        .room_get_notification_mode(&room_id.into_typed()?)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRoomMarkAsUnread(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    unread: bool,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix
        .room_mark_as_unread(&room_id.into_typed()?, unread)
        .await
}

ts_type_ser!(UserProfile: get_profile::v3::Response = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixUserProfile(
    bg_matrix: &BgMatrix,
    user_id: RpcUserId,
) -> anyhow::Result<UserProfile> {
    let matrix = bg_matrix.wait().await;
    matrix
        .user_profile(&user_id.into_typed()?)
        .await
        .map(UserProfile)
}

ts_type_de!(RpcPusher: Pusher = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixSetPusher(bg_matrix: &BgMatrix, pusher: RpcPusher) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix.set_pusher(pusher.0).await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixEditMessage(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    event_id: RpcTimelineEventItemId,
    new_content: SendMessageData,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix
        .edit_message(&room_id.into_typed()?, &event_id.into(), new_content)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixDeleteMessage(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    event_id: RpcTimelineEventItemId,
    reason: Option<String>,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    matrix
        .delete_message(&room_id.into_typed()?, &event_id.into(), reason)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSaveComposerDraft(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    draft: RpcComposerDraft,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let room = matrix.room(&room_id.into_typed()?).await?;
    room.save_composer_draft(draft.to_sdk()?, None).await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixLoadComposerDraft(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
) -> anyhow::Result<Option<RpcComposerDraft>> {
    let matrix = bg_matrix.wait().await;
    let room = matrix.room(&room_id.into_typed()?).await?;
    let draft = room.load_composer_draft(None).await?;
    Ok(draft.map(RpcComposerDraft::from_sdk))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixClearComposerDraft(bg_matrix: &BgMatrix, room_id: RpcRoomId) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let room = matrix.room(&room_id.into_typed()?).await?;
    room.clear_composer_draft(None).await?;
    Ok(())
}

ts_type_de!(RpcMediaSource: MediaSource = "JSONObject");
#[macro_rules_derive(rpc_method!)]
async fn matrixDownloadFile(
    bg_matrix: &BgMatrix,
    path: PathBuf,
    media_source: RpcMediaSource,
) -> anyhow::Result<PathBuf> {
    let matrix = bg_matrix.wait().await;
    let content = matrix.download_file(media_source.0).await?;
    matrix.runtime.storage.write_file(&path, content).await?;
    Ok(matrix.runtime.storage.platform_path(&path))
}

#[macro_rules_derive(rpc_method!)]
async fn matrixStartPoll(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    question: String,
    answers: Vec<String>,
    is_multiple_choice: bool,
    is_disclosed: bool,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
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
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    poll_start_id: String,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let poll_start_event_id = OwnedEventId::try_from(poll_start_id)?;
    matrix
        .end_poll(&room_id.into_typed()?, &poll_start_event_id)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRespondToPoll(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    poll_start_id: String,
    answer_ids: Vec<String>,
) -> anyhow::Result<()> {
    let matrix = bg_matrix.wait().await;
    let poll_start_event_id = OwnedEventId::try_from(poll_start_id)?;
    matrix
        .respond_to_poll(&room_id.into_typed()?, &poll_start_event_id, answer_ids)
        .await
}
ts_type_ser!(RpcMediaPreviewResponse: get_media_preview::v1::Response = "JSONObject");

#[macro_rules_derive(rpc_method!)]
async fn matrixGetMediaPreview(
    bg_matrix: &BgMatrix,
    url: String,
) -> anyhow::Result<RpcMediaPreviewResponse> {
    let matrix = bg_matrix.wait().await;
    Ok(RpcMediaPreviewResponse(
        matrix.get_media_preview(url).await?,
    ))
}

#[macro_rules_derive(rpc_method!)]
async fn getFeatureCatalog(runtime: Arc<Runtime>) -> anyhow::Result<Arc<FeatureCatalog>> {
    Ok(runtime.feature_catalog.clone())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSubscribeMultispendGroup(
    bg_matrix: &BgMatrix,
    stream_id: RpcStreamId<RpcMultispendGroupStatus>,
    room_id: RpcRoomId,
) -> anyhow::Result<()> {
    let multispend_matrix = bg_matrix.wait_multispend().await;
    let stream = multispend_matrix
        .subscribe_multispend_group(room_id.into_typed()?)
        .await;
    multispend_matrix
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSubscribeMultispendAccountInfo(
    bridge: &BridgeFull,
    room_id: RpcRoomId,
    stream_id: RpcStreamId<Result<RpcSPv2SyncResponse, NetworkError>>,
) -> anyhow::Result<()> {
    let multispend_matrix = bridge.matrix.wait_multispend().await;
    let finalized_group = multispend_matrix
        .get_multispend_finalized_group(room_id.clone())
        .await?
        .context("multispend group not finalized yet")?;

    let room_id = room_id.into_typed()?;
    let federation_provider = Arc::new(FederationProviderWrapper(bridge.federations.clone()));
    let stream = multispend_matrix
        .subscribe_multispend_account_info(
            federation_provider,
            finalized_group.federation_id.0.clone(),
            room_id,
            &finalized_group,
        )
        .await;
    multispend_matrix
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
pub async fn matrixMultispendListEvents(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    start_after: Option<u32>,
    limit: u32,
) -> anyhow::Result<Vec<MultispendListedEvent>> {
    let multispend_matrix = bg_matrix.wait_multispend().await;
    Ok(multispend_matrix
        .list_multispend_events(
            &room_id,
            start_after.map(Into::into),
            usize::try_from(limit).unwrap(),
        )
        .await)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendMultispendGroupInvitation(
    bridge: &BridgeFull,
    room_id: RpcRoomId,
    signers: BTreeSet<RpcUserId>,
    threshold: u32,
    federation_id: RpcFederationId,
    federation_name: String,
) -> anyhow::Result<()> {
    let fed = bridge.federations.get_federation(&federation_id.0)?;
    let proposer_pubkey = fed.multispend_public_key(room_id.0.clone())?;
    let invitation = GroupInvitation {
        signers,
        threshold: threshold.into(),
        federation_invite_code: fed.get_invite_code().await,
        federation_name,
    };
    let multispend_matrix = bridge.matrix.wait_multispend().await;
    multispend_matrix
        .send_multispend_group_invitation(
            &room_id.into_typed()?,
            invitation,
            RpcPublicKey(proposer_pubkey),
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixApproveMultispendGroupInvitation(
    bridge: &BridgeFull,
    room_id: RpcRoomId,
    invitation: RpcEventId,
) -> anyhow::Result<()> {
    let multispend_matrix = bridge.matrix.wait_multispend().await;
    let Some(MsEventData::GroupInvitation(GroupInvitationWithKeys { federation_id, .. })) =
        multispend_matrix
            .get_multispend_event_data(&room_id, &invitation)
            .await
    else {
        anyhow::bail!("invalid matrix invitation id")
    };
    multispend_matrix
        .vote_multispend_group_invitation(
            &room_id.into_typed()?,
            invitation,
            MultispendGroupVoteType::Accept {
                member_pubkey: RpcPublicKey(
                    bridge
                        .federations
                        .get_federation(&federation_id.0)?
                        .multispend_public_key(room_id.0.clone())?,
                ),
            },
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixRejectMultispendGroupInvitation(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    invitation: RpcEventId,
) -> anyhow::Result<()> {
    let multispend_matrix = bg_matrix.wait_multispend().await;
    multispend_matrix
        .vote_multispend_group_invitation(
            &room_id.into_typed()?,
            invitation,
            MultispendGroupVoteType::Reject,
        )
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixCancelMultispendGroupInvitation(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
) -> anyhow::Result<()> {
    let multispend_matrix = bg_matrix.wait_multispend().await;
    multispend_matrix
        .cancel_multispend_group_invitation(&room_id.into_typed()?)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixMultispendDeposit(
    bridge: &BridgeFull,
    room_id: RpcRoomId,
    amount: RpcFiatAmount,
    description: String,
    frontend_meta: FrontendMetadata,
) -> anyhow::Result<()> {
    let multispend_matrix = bridge.matrix.wait_multispend().await;
    let finalized_group = multispend_matrix
        .get_multispend_finalized_group(room_id.clone())
        .await?
        .context("multispend group not finalized yet")?;
    let fed = bridge
        .federations
        .get_federation(&finalized_group.federation_id.0)?;
    fed.multispend_deposit(
        FiatAmount(amount.0),
        finalized_group.spv2_account.id(),
        room_id,
        description,
        frontend_meta,
    )
    .await?;
    Ok(())
}
#[macro_rules_derive(rpc_method!)]
async fn matrixSendMultispendWithdrawalRequest(
    bridge: &BridgeFull,
    room_id: RpcRoomId,
    amount: RpcFiatAmount,
    description: String,
) -> anyhow::Result<()> {
    let multispend_matrix = bridge.matrix.wait_multispend().await;
    let finalized_group = multispend_matrix
        .get_multispend_finalized_group(room_id.clone())
        .await?
        .context("multispend group not finalized yet")?;
    let fed = bridge
        .federations
        .get_federation(&finalized_group.federation_id.0)?;
    let transfer_request =
        fed.multispend_create_transfer_request(FiatAmount(amount.0), finalized_group.spv2_account)?;
    multispend_matrix
        .send_multispend_withdraw_request(&room_id.into_typed()?, transfer_request, description)
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendMultispendWithdrawalApprove(
    bridge: &BridgeFull,
    room_id: RpcRoomId,
    withdraw_request_id: RpcEventId,
) -> anyhow::Result<()> {
    let multispend_matrix = bridge.matrix.wait_multispend().await;
    let finalized_group = multispend_matrix
        .get_multispend_finalized_group(room_id.clone())
        .await?
        .context("multispend group not finalized yet")?;
    let Some(MsEventData::WithdrawalRequest(WithdrawRequestWithApprovals {
        request: transfer_request,
        ..
    })) = multispend_matrix
        .get_multispend_event_data(&room_id, &withdraw_request_id)
        .await
    else {
        anyhow::bail!("invalid matrix withdraw request id")
    };
    let fed = bridge
        .federations
        .get_federation(&finalized_group.federation_id.0)?;
    let signature = fed.multispend_approve_withdrawal(room_id.0.clone(), &transfer_request)?;

    multispend_matrix
        .respond_multispend_withdraw(
            &room_id.into_typed()?,
            withdraw_request_id,
            WithdrawalResponseType::Approve {
                signature: RpcSignature(signature),
            },
        )
        .await?;

    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSendMultispendWithdrawalReject(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    withdraw_request_id: RpcEventId,
) -> anyhow::Result<()> {
    let multispend_matrix = bg_matrix.wait_multispend().await;
    multispend_matrix
        .respond_multispend_withdraw(
            &room_id.into_typed()?,
            withdraw_request_id,
            WithdrawalResponseType::Reject,
        )
        .await?;
    Ok(())
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSpTransferSend(
    bridge: &BridgeFull,
    room_id: RpcRoomId,
    amount: RpcFiatAmount,
    federation_id: RpcFederationId,
    federation_invite: Option<String>,
) -> anyhow::Result<RpcEventId> {
    let event_id = bridge
        .matrix
        .wait_spt()
        .await
        .send_transfer(
            &room_id.into_typed()?,
            amount,
            federation_id,
            federation_invite,
        )
        .await?;
    Ok(event_id)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSpTransferObserveState(
    bg_matrix: &BgMatrix,
    stream_id: RpcStreamId<RpcSpTransferState>,
    room_id: RpcRoomId,
    event_id: RpcEventId,
) -> anyhow::Result<()> {
    let spt_matrix = bg_matrix.wait_spt().await;
    let stream = spt_matrix.subscribe_transfer_state(SpMatrixTransferId { room_id, event_id });
    spt_matrix
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
        .await
}

#[macro_rules_derive(rpc_method!)]
async fn matrixMultispendEventData(
    bg_matrix: &BgMatrix,
    room_id: RpcRoomId,
    event_id: RpcEventId,
) -> anyhow::Result<Option<MsEventData>> {
    let multispend_matrix = bg_matrix.wait_multispend().await;
    Ok(multispend_matrix
        .get_multispend_event_data(&room_id, &event_id)
        .await)
}

#[macro_rules_derive(rpc_method!)]
async fn matrixSubscribeMultispendEventData(
    bg_matrix: &BgMatrix,
    stream_id: RpcStreamId<MsEventData>,
    room_id: RpcRoomId,
    event_id: RpcEventId,
) -> anyhow::Result<()> {
    let multispend_matrix = bg_matrix.wait_multispend().await;
    let stream = multispend_matrix
        .subscribe_multispend_event_data(room_id, event_id)
        .await?;
    multispend_matrix
        .runtime
        .stream_pool
        .register_stream(stream_id, stream)
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
    getPrevPayInvoiceResult,
    listGateways,
    switchGateway,
    // On-Chain
    supportsSafeOnchainDeposit,
    generateAddress,
    recheckPeginAddress,
    previewPayAddress,
    payAddress,
    // Ecash
    calculateMaxGenerateEcash,
    generateEcash,
    receiveEcash,
    parseEcash,
    parseInviteCode,
    cancelEcash,
    repairWallet,
    // Transactions
    updateCachedFiatFXInfo,
    listTransactions,
    getTransaction,
    updateTransactionNotes,
    // Recovery
    backupNow,
    getMnemonic,
    checkMnemonic,
    restoreMnemonic,
    completeOnboardingNewSeed,
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
    setGuardianPassword,
    getGuardianPassword,
    // LNURL
    signLnurlMessage,
    supportsRecurringdLnurl,
    getRecurringdLnurl,
    // Nostr
    getNostrPubkey,
    getNostrSecret,
    guardianitoGetOrCreateBot,
    signNostrEvent,
    nostrEncrypt,
    nostrDecrypt,
    nostrEncrypt04,
    nostrDecrypt04,
    nostrRateFederation,
    nostrCreateCommunity,
    nostrListOurCommunities,
    nostrEditCommunity,
    nostrDeleteCommunity,
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
    spv2SubscribeAccountInfo,
    spv2NextCycleStartTime,
    spv2DepositToSeek,
    spv2Withdraw,
    spv2WithdrawAll,
    spv2AverageFeeRate,
    spv2AvailableLiquidity,
    spv2OurPaymentAddress,
    spv2ParsePaymentAddress,
    spv2Transfer,
    spv2StartFastSync,
    // Developer
    getSensitiveLog,
    setSensitiveLog,
    internalMarkBridgeExport,
    internalExportBridgeState,
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
    onboardRegisterAsNewDevice,
    onboardTransferExistingDeviceRegistration,

    streamCancel,

    // Matrix
    matrixInitializeStatus,
    matrixGetAccountSession,
    matrixSubscribeSyncIndicator,
    matrixSubscribeRoomList,
    matrixSubscribeRoomTimelineItems,
    matrixRoomTimelineItemsPaginateBackwards,
    matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus,
    matrixSendMessage,
    matrixSendAttachment,
    matrixRoomCreate,
    matrixRoomCreateOrGetDm,
    matrixRoomJoin,
    matrixRoomJoinPublic,
    matrixRoomLeave,
    matrixRoomSubscribeInfo,
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
    matrixSendReply,
    matrixDownloadFile,
    matrixStartPoll,
    matrixEndPoll,
    matrixRespondToPoll,
    matrixGetMediaPreview,
    matrixSaveComposerDraft,
    matrixLoadComposerDraft,
    matrixClearComposerDraft,
    // SP Transfer
    matrixSpTransferSend,
    matrixSpTransferObserveState,
    // multispend
    matrixSubscribeMultispendGroup,
    matrixSubscribeMultispendAccountInfo,
    matrixMultispendListEvents,
    matrixSendMultispendGroupInvitation,
    matrixApproveMultispendGroupInvitation,
    matrixRejectMultispendGroupInvitation,
    matrixCancelMultispendGroupInvitation,
    matrixMultispendEventData,
    matrixSubscribeMultispendEventData,
    matrixSendMultispendWithdrawalRequest,
    matrixSendMultispendWithdrawalApprove,
    matrixSendMultispendWithdrawalReject,
    matrixMultispendDeposit,
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
    let sensitive_log = match bridge.runtime() {
        Ok(runtime) => runtime.sensitive_log().await,
        Err(_) => false,
    };
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
