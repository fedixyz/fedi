use std::sync::Arc;

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
use rpc_types::sp_transfer::{RpcSpTransferEvent, RpcSpTransferState};
use rpc_types::{RpcEventId, RpcFederationId, RpcFiatAmount};
use runtime::bridge_runtime::Runtime;
use tokio::sync::Notify;

use crate::SP_TRANSFER_MSGTYPE;
use crate::db::{
    KnownReceiverAccountIdKey, PendingReceiverAccountIdEventKey,
    SenderAwaitingAccountAnnounceEventKey, TransferEventKey, TransferEventValue, TransferFailedKey,
    TransferSentHintKey,
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

    /// Subscribe to transfer state changes for a pending transfer.
    pub fn subscribe_transfer_state(
        self: &Arc<Self>,
        pending_transfer_id: RpcEventId,
    ) -> impl Stream<Item = RpcSpTransferState> + use<> {
        let this = self.clone();
        stream! {
            let mut last_value: Option<RpcSpTransferState> = None;
            loop {
                let notify = this.event_notify.notified();
                if let Some(state) = crate::db::resolve_transfer_state(this.runtime.clone(), &pending_transfer_id).await
                    && last_value.as_ref() != Some(&state) {
                        last_value = Some(state.clone());
                        yield state;
                    }
                notify.await;
            }
        }
    }

    async fn handle_event(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        room_id: &RoomId,
        event_id: &RpcEventId,
        is_sender: bool,
        sender_user: RpcUserId,
        event: RpcSpTransferEvent,
    ) {
        match event {
            RpcSpTransferEvent::PendingTransferStart {
                amount,
                federation_id,
                federation_invite,
                nonce,
            } => {
                dbtx.insert_entry(
                    &TransferEventKey {
                        pending_transfer_id: event_id.clone(),
                    },
                    &TransferEventValue {
                        amount,
                        federation_id,
                        room_id: RpcRoomId(room_id.to_string()),
                        sent_by: sender_user,
                        federation_invite,
                        nonce,
                    },
                )
                .await;
                if is_sender {
                    dbtx.insert_entry(
                        &SenderAwaitingAccountAnnounceEventKey {
                            pending_transfer_id: event_id.clone(),
                        },
                        &(),
                    )
                    .await;
                } else {
                    dbtx.insert_entry(
                        &PendingReceiverAccountIdEventKey {
                            pending_transfer_id: event_id.clone(),
                        },
                        &(),
                    )
                    .await;
                }
            }
            RpcSpTransferEvent::TransferSentHint {
                pending_transfer_id,
                transaction_id,
            } => {
                dbtx.insert_entry(
                    &TransferSentHintKey {
                        pending_transfer_id,
                    },
                    &transaction_id,
                )
                .await;
            }
            RpcSpTransferEvent::TransferFailed {
                pending_transfer_id,
            } => {
                dbtx.insert_entry(
                    &TransferFailedKey {
                        pending_transfer_id,
                    },
                    &(),
                )
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
