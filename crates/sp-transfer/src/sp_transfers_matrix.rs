use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use anyhow::{Context as _, bail};
use async_stream::stream;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::module::serde_json;
use futures::stream::Stream;
use matrix_sdk::Client;
use matrix_sdk::deserialized_responses::TimelineEvent;
use matrix_sdk::ruma::events::room::message::{MessageType, RoomMessageEventContent};
use matrix_sdk::ruma::events::{
    AnySyncMessageLikeEvent, AnySyncTimelineEvent, SyncMessageLikeEvent,
};
use matrix_sdk::ruma::{OwnedEventId, RoomId};
use rpc_types::matrix::{RpcRoomId, RpcUserId};
use rpc_types::sp_transfer::{
    RpcSpTransferEvent, RpcSpTransferState, RpcSpTransferStatus, SpMatrixTransferId,
};
use rpc_types::spv2_transfer_meta::Spv2TransferTxMeta;
use rpc_types::{RpcEventId, RpcFederationId, RpcFiatAmount};
use runtime::bridge_runtime::Runtime;
use stability_pool_client::common::FiatAmount;
use stability_pool_client::db::UserOperationHistoryItemKind;
use tokio::sync::Notify;
use tracing::warn;

use crate::SP_TRANSFER_MSGTYPE;
use crate::db::{
    FederationInviteDeniedKey, KnownReceiverAccountIdKey, PendingReceiverAccountIdEventKey,
    SenderAwaitingAccountAnnounceEventKey, SpTransferStatus, TransferEventKey, TransferEventValue,
    TransferFailedKey, TransferSentHintKey,
};
use crate::services::SptServices;

pub struct SpTransfersMatrix {
    pub client: Client,
    pub runtime: Arc<Runtime>,
    pub services: Arc<SptServices>,
    event_notify: Notify,
}

impl SpTransfersMatrix {
    pub fn new(client: Client, runtime: Arc<Runtime>, services: Arc<SptServices>) -> Self {
        Self {
            client,
            runtime,
            services,
            event_notify: Notify::new(),
        }
    }

    pub(crate) async fn send_spt_event(
        &self,
        room_id: &RoomId,
        event: RpcSpTransferEvent,
    ) -> anyhow::Result<OwnedEventId> {
        if self.runtime.feature_catalog.sp_transfers_matrix.is_none() {
            bail!("sp_transfers_matrix feature is disabled");
        }
        let data = serde_json::to_value(event)?;
        let map = data
            .as_object()
            .cloned()
            .context("RpcSpTransferEvent did not serialize to object")?;
        let room = self.client.get_room(room_id).context("room not found")?;
        Ok(room
            .send(RoomMessageEventContent::new(MessageType::new(
                SP_TRANSFER_MSGTYPE,
                "Stable Balance Transfer Activity".into(),
                map,
            )?))
            .await?
            .event_id)
    }

    pub fn register_message_handler(self: &Arc<Self>) {
        if self.runtime.feature_catalog.sp_transfers_matrix.is_none() {
            return;
        }
        let this = Arc::downgrade(self);
        self.client.event_cache().add_event_handler(
            move |room_id: &RoomId, event: &TimelineEvent| {
                let this = this.clone();
                Box::pin(async move {
                    let Some(this) = this.upgrade() else { return };

                    let Ok(AnySyncTimelineEvent::MessageLike(
                        AnySyncMessageLikeEvent::RoomMessage(SyncMessageLikeEvent::Original(m)),
                    )) = event.raw().deserialize()
                    else {
                        return;
                    };
                    if m.content.msgtype() != SP_TRANSFER_MSGTYPE {
                        return;
                    }
                    let spt_db = this.runtime.sp_transfers_db();
                    let mut dbtx = spt_db.begin_transaction().await;

                    let our_user_id = this.client.user_id().expect("must be logged in");
                    let sender_user = RpcUserId::from(m.sender.clone());
                    let is_sender = m.sender == our_user_id;
                    let event_id = RpcEventId(m.event_id.to_string());

                    // Extract custom content
                    let data = m.content.msgtype.data().into_owned();
                    let value = serde_json::Value::Object(data);

                    // Try to parse SP Transfers event
                    match serde_json::from_value::<RpcSpTransferEvent>(value) {
                        Ok(event) => {
                            this.handle_event(
                                &mut dbtx.to_ref_nc(),
                                room_id,
                                &event_id,
                                is_sender,
                                sender_user.clone(),
                                m.origin_server_ts,
                                event,
                            )
                            .await;
                        }
                        Err(e) => {
                            tracing::warn!(%e, "failed to parse sp_transfers event");
                        }
                    }

                    dbtx.commit_tx().await;

                    // Trigger services after commit so they can see the new data
                    this.services.transfer_submitter.trigger();
                    this.services.account_id_responder.trigger();
                    // Notify observers about state changes
                    this.event_notify.notify_waiters();
                })
            },
        );
    }

    /// emit PendingTransferStart carrying a fresh nonce.
    /// Background services will immediately pick it up if the receiver account
    /// is already known, otherwise it will complete later once AnnounceAccount
    /// is received.
    pub async fn send_transfer(
        &self,
        room_id: &RoomId,
        amount: RpcFiatAmount,
        federation_id: RpcFederationId,
        federation_invite: Option<String>,
    ) -> anyhow::Result<RpcEventId> {
        let event = RpcSpTransferEvent::PendingTransferStart {
            amount,
            federation_id,
            federation_invite,
            nonce: rand::random(),
        };
        let event_id = self.send_spt_event(room_id, event).await?;
        Ok(RpcEventId(event_id.to_string()))
    }

    pub async fn deny_federation_invite(
        &self,
        transfer_id: &SpMatrixTransferId,
    ) -> anyhow::Result<()> {
        let room_id = transfer_id.room_id.clone().into_typed()?;
        self.send_spt_event(
            &room_id,
            RpcSpTransferEvent::FederationInviteDenied {
                pending_transfer_id: transfer_id.event_id.clone(),
            },
        )
        .await?;
        Ok(())
    }

    /// Subscribe to transfer state changes for a pending transfer.
    pub fn subscribe_transfer_state(
        self: &Arc<Self>,
        transfer_id: SpMatrixTransferId,
    ) -> impl Stream<Item = RpcSpTransferState> + use<> {
        let this = self.clone();
        stream! {
            let our_user_id = this.client.user_id().map(|u| RpcUserId::from(u.to_owned()));

            let spt_db = this.runtime.sp_transfers_db();

            // first wait for transfer to exist, it might not exist due to the order we scan events in, or some race condition
            let transfer = loop {
                let notify = this.event_notify.notified();
                let mut dbtx = spt_db.begin_transaction_nc().await;
                if let Some(transfer) = dbtx
                    .get_value(&TransferEventKey(transfer_id.clone()))
                    .await {
                        break transfer;
                    }
                notify.await;
            };

            let federation_id = transfer.federation_id.clone();
            let amount = transfer.amount;
            let invite_code = transfer.federation_invite.clone();
            let make_rpc_transfer_state = |status| {
                RpcSpTransferState {
                    status,
                    federation_id: federation_id.clone(),
                    amount,
                    invite_code: invite_code.clone(),
                }
            };
            let mut yielded_pending = false;
            let sent_hint_txid = loop {
                let notify = this.event_notify.notified();
                let mut dbtx = spt_db.begin_transaction_nc().await;
                let status = crate::db::resolve_status_db(&mut dbtx, &transfer_id, &transfer, &this.runtime).await;
                match status {
                    SpTransferStatus::Pending => {
                        // only yield pending once
                        if !yielded_pending {
                            yielded_pending = true;
                            yield make_rpc_transfer_state(RpcSpTransferStatus::Pending);
                        }
                    }
                    SpTransferStatus::Failed => {
                        yield make_rpc_transfer_state(RpcSpTransferStatus::Failed);
                        // terminal state end
                        return;
                    }
                    SpTransferStatus::FederationInviteDenied => {
                        yield make_rpc_transfer_state(RpcSpTransferStatus::FederationInviteDenied);
                        // terminal state end
                        return;
                    }
                    SpTransferStatus::Expired => {
                        yield make_rpc_transfer_state(RpcSpTransferStatus::Expired);
                        // terminal state end
                        return;
                    }
                    SpTransferStatus::SentHint { transaction_id } => {
                        break transaction_id;
                    }
                }

                notify.await;
            };

            let is_sender = our_user_id.as_ref() == Some(&transfer.sent_by);
            if is_sender {
                // we are the sender, we trust us
                yield make_rpc_transfer_state(RpcSpTransferStatus::Complete);
            } else {
                match this.services.provider.spv2_wait_for_user_operation_history_item(&federation_id.0, sent_hint_txid.0).await {
                    Ok(history_item) => {
                        let check_valid = || {
                            let meta = match &history_item.kind {
                                UserOperationHistoryItemKind::TransferIn { meta, .. } => meta,
                                _ => {
                                    warn!(?history_item.kind, "invalid operation kind in sp-transfer");
                                    return false;
                                }
                            };
                            let expected_amount = FiatAmount(transfer.amount.0)
                                .to_btc_amount(history_item.cycle.start_price)
                                .ok();
                            let amount_matches = expected_amount
                                .as_ref()
                                .is_some_and(|expected| *expected == history_item.amount);
                            if !amount_matches {
                                warn!(
                                    fiat_amount = transfer.amount.0,
                                    expected_amount = ?expected_amount,
                                    actual_amount = ?history_item.amount,
                                    price_per_btc = history_item.cycle.start_price.0,
                                    "amount mismatch in sp-transfer event"
                                );
                                return false;
                            }
                            let Ok(meta) = Spv2TransferTxMeta::decode(meta) else {
                                warn!("failed to decode meta for sp-transfer");
                                return false;
                            };
                            if !meta.is_for_sp_transfer_matrix_pending_start_event_id(&transfer_id.event_id) {
                                warn!("replay attack against sp-transfer");
                                return false;
                            }

                            true

                        };

                        if check_valid() {
                            yield make_rpc_transfer_state(RpcSpTransferStatus::Complete);
                        } else {
                            // no sending the correct amount is considered cheating and you move to failed state
                            yield make_rpc_transfer_state(RpcSpTransferStatus::Failed);
                        }
                    }
                    Err(err) => {
                        // only happens if you leave the federation for example
                        warn!(%err, "wait for transfer in failed");
                        // this is an edge case, we handle this by wait for next observable (closing the chat and reopening the chat)
                        return;
                    }
                }

            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn handle_event(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        room_id: &RoomId,
        event_id: &RpcEventId,
        is_sender: bool,
        sender_user: RpcUserId,
        origin_server_ts: matrix_sdk::ruma::MilliSecondsSinceUnixEpoch,
        event: RpcSpTransferEvent,
    ) {
        match event {
            RpcSpTransferEvent::PendingTransferStart {
                amount,
                federation_id,
                federation_invite,
                nonce,
            } => {
                let transfer_id = SpMatrixTransferId {
                    room_id: RpcRoomId(room_id.to_string()),
                    event_id: event_id.clone(),
                };
                dbtx.insert_entry(
                    &TransferEventKey(transfer_id.clone()),
                    &TransferEventValue {
                        amount,
                        federation_id,
                        sent_by: sender_user,
                        federation_invite,
                        nonce,
                        created_at: UNIX_EPOCH
                            + Duration::from_millis(origin_server_ts.get().into()),
                    },
                )
                .await;
                if is_sender {
                    dbtx.insert_entry(
                        &SenderAwaitingAccountAnnounceEventKey(transfer_id.clone()),
                        &(),
                    )
                    .await;
                } else {
                    dbtx.insert_entry(&PendingReceiverAccountIdEventKey(transfer_id.clone()), &())
                        .await;
                }
            }
            RpcSpTransferEvent::TransferSentHint {
                pending_transfer_id,
                transaction_id,
            } => {
                let transfer_id = SpMatrixTransferId {
                    room_id: RpcRoomId(room_id.to_string()),
                    event_id: pending_transfer_id.clone(),
                };
                dbtx.insert_entry(&TransferSentHintKey(transfer_id.clone()), &transaction_id)
                    .await;

                // sender already syncs it in FederationV2::subscribe_spv2_transfer
                if !is_sender
                    && let Some(transfer) = dbtx.get_value(&TransferEventKey(transfer_id)).await
                {
                    self.services
                        .provider
                        .spv2_force_sync(&transfer.federation_id.0);
                }
            }
            RpcSpTransferEvent::TransferFailed {
                pending_transfer_id,
            } => {
                let transfer_id = SpMatrixTransferId {
                    room_id: RpcRoomId(room_id.to_string()),
                    event_id: pending_transfer_id,
                };
                dbtx.insert_entry(&TransferFailedKey(transfer_id), &())
                    .await;
            }
            RpcSpTransferEvent::FederationInviteDenied {
                pending_transfer_id,
            } => {
                let transfer_id = SpMatrixTransferId {
                    room_id: RpcRoomId(room_id.to_string()),
                    event_id: pending_transfer_id,
                };
                dbtx.insert_entry(&FederationInviteDeniedKey(transfer_id), &())
                    .await;
            }
            RpcSpTransferEvent::AnnounceAccount {
                account_id,
                federation_id,
            } => {
                if !is_sender && let Ok(account_id) = account_id.0.parse() {
                    dbtx.insert_entry(
                        &KnownReceiverAccountIdKey {
                            room_id: RpcRoomId(room_id.to_string()),
                            federation_id,
                        },
                        &account_id,
                    )
                    .await;
                }
            }
        }
    }
}
