use std::collections::BTreeSet;
use std::pin::pin;
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use fedimint_core::db::IDatabaseTransactionOpsCoreTyped;
use futures::StreamExt;
use matrix_sdk::room::RoomMemberRole;
use matrix_sdk::ruma::events::room::message::{MessageType, RoomMessageEventContent};
use matrix_sdk::ruma::events::{AnySyncMessageLikeEvent, SyncMessageLikeEvent};
use matrix_sdk::ruma::{OwnedEventId, OwnedRoomId, RoomId};
use matrix_sdk::{Client, Room, RoomMemberships};
use rpc_types::error::ErrorCode;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{NetworkError, RpcEventId, RpcPublicKey, RpcSPv2SyncResponse};
use runtime::bridge_runtime::Runtime;
use runtime::observable::{Observable, ObservableUpdate};
use runtime::utils::PoisonedLockExt as _;
use stability_pool_client::common::TransferRequest;
use tokio::sync::{mpsc, Mutex};

use super::db::{MultispendGroupStatus, MultispendMarkedForScanning, RpcMultispendGroupStatus};
use super::rescanner::RoomRescannerManager;
use super::services::MultispendServices;
use super::{
    FederationProvider, FinalizedGroup, GroupInvitation, MsEventData, MultispendEvent,
    MultispendGroupVoteType, MultispendListedEvent, WithdrawalResponseType,
};

pub struct MultispendMatrix {
    pub client: Client,
    pub runtime: Arc<Runtime>,
    /// Manager for room rescanning operations
    pub rescanner: Arc<RoomRescannerManager>,
    /// Mutex to prevent concurrent send_multispend_event
    send_multispend_mutex: Mutex<()>,
    // This is used as a synchronization mechanism between sending multispend
    // events and receiving server confirmation. When sending a multispend
    // event:
    //
    // 1. A new channel is created and its sender is stored here
    // 2. After sending the event to the server, we wait on the receiver
    // 3. When the Matrix sync service receives the event back from the server, it sends the event
    //    ID through this channel
    // 4. The send_multispend_event method waits until it receives back the same event ID it sent,
    //    confirming server acknowledgment
    //
    // This ensures multispend events are properly synchronized with the server
    // before returning from the send method.
    send_multispend_server_ack: std::sync::Mutex<Option<mpsc::Sender<OwnedEventId>>>,
}

impl MultispendMatrix {
    pub fn new(
        client: Client,
        runtime: Arc<Runtime>,
        multispend_services: Arc<MultispendServices>,
    ) -> Self {
        Self {
            client: client.clone(),
            runtime: runtime.clone(),
            rescanner: Arc::new(RoomRescannerManager::new(
                client,
                runtime,
                multispend_services,
            )),
            send_multispend_mutex: Mutex::new(()),
            send_multispend_server_ack: std::sync::Mutex::new(None),
        }
    }

    pub fn register_message_handler(self: &Arc<Self>) {
        let this = Arc::downgrade(self);
        self.client
            .add_event_handler(move |event: AnySyncMessageLikeEvent, room: Room| {
                let this = this.clone();
                async move {
                    // skip if shuting down
                    let Some(this) = this.upgrade() else { return };
                    let room_id = room.room_id();
                    let event_id = event.event_id();
                    let is_multispend = matches!(
                        &event,
                        AnySyncMessageLikeEvent::RoomMessage(SyncMessageLikeEvent::Original(m))
                            if m.content.msgtype() == super::MULTISPEND_MSGTYPE
                    );

                    if is_multispend {
                        this.mark_room_for_scanning(room_id).await;
                    }

                    // anytime we see an event in room marked as multispend, we rescan the room.
                    if this.is_marked_room_for_scanning(room_id).await {
                        this.rescanner.queue_rescan(room_id);
                    }

                    if is_multispend {
                        // see docs on `send_multispend_server_ack`
                        let sender = this.send_multispend_server_ack.ensure_lock().clone();
                        if let Some(sender) = sender {
                            sender.send(event_id.to_owned()).await.ok();
                        }
                    }
                }
            });
    }
    pub fn send_multispend_mutex(&self) -> &Mutex<()> {
        &self.send_multispend_mutex
    }

    pub fn send_multispend_server_ack(
        &self,
    ) -> &std::sync::Mutex<Option<mpsc::Sender<OwnedEventId>>> {
        &self.send_multispend_server_ack
    }

    pub async fn is_marked_room_for_scanning(&self, room_id: &RoomId) -> bool {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        dbtx.get_value(&MultispendMarkedForScanning(RpcRoomId(room_id.to_string())))
            .await
            .is_some()
    }

    pub async fn mark_room_for_scanning(&self, room_id: &RoomId) {
        let multispend_db = self.runtime.multispend_db();
        multispend_db
            .autocommit(
                |dbtx, _| {
                    Box::pin(async {
                        dbtx.insert_entry(
                            &MultispendMarkedForScanning(RpcRoomId(room_id.to_string())),
                            &(),
                        )
                        .await;
                        anyhow::Ok(())
                    })
                },
                None,
            )
            .await
            .expect("No failure condition")
    }

    pub async fn send_multispend_event(
        &self,
        room_id: &RoomId,
        content: MultispendEvent,
    ) -> anyhow::Result<()> {
        // Acquire the lock to prevent concurrent sends
        let _lock = self.send_multispend_mutex.lock().await;

        self.mark_room_for_scanning(room_id).await;

        let (tx, mut rx) = tokio::sync::mpsc::channel(1);

        // Store the sender in the global field. see docs for send_mulitspend_server_ack
        *self.send_multispend_server_ack.ensure_lock() = Some(tx);

        // wait for all background events to persisted.
        self.rescanner.wait_for_scanned(room_id).await;

        // Send the message
        let event_id = self
            .send_message_json_no_queue(
                room_id,
                super::MULTISPEND_MSGTYPE,
                String::from("This group has new multispend activity"),
                serde_json::to_value(content)?
                    .as_object()
                    .context("invalid serialization of content")?
                    .clone(),
            )
            .await?;

        // Receive messages until we find the one matching our event_id
        let mut received = false;
        while let Some(received_event_id) = rx.recv().await {
            if received_event_id == event_id {
                received = true;
                break;
            }
        }
        assert!(
            received,
            "only way to get out of loop because we don't drop the sender"
        );
        // Drop the sender
        *self.send_multispend_server_ack.ensure_lock() = None;
        // wait for this event to be scanned in state.
        self.rescanner.wait_for_scanned(room_id).await;

        if self
            .is_invalid_multispend_event(RpcEventId(event_id.to_string()))
            .await
        {
            anyhow::bail!(ErrorCode::InvalidMsEvent);
        }
        Ok(())
    }

    /// Sends a message immediately without using the sendqueue for automatic
    /// retries.
    pub async fn send_message_json_no_queue(
        &self,
        room_id: &RoomId,
        msgtype: &str,
        body: String,
        data: serde_json::Map<String, serde_json::Value>,
    ) -> anyhow::Result<OwnedEventId> {
        let room = self.client.get_room(room_id).context("room not found")?;
        Ok(room
            .send(RoomMessageEventContent::new(
                MessageType::new(msgtype, body, data).context(ErrorCode::BadRequest)?,
            ))
            .await?
            .event_id)
    }

    pub async fn observe_multispend_group(
        self: &Arc<Self>,
        id: u64,
        room_id: OwnedRoomId,
    ) -> Result<Observable<RpcMultispendGroupStatus>> {
        let this = self.clone();
        self.runtime
            .observable_pool
            .make_observable(
                id,
                self.get_multispend_group_status(&room_id).await,
                move |pool, id| async move {
                    let mut update_index = 0;
                    let mut stream = pin!(this.rescanner.scan_complete_stream(&room_id));
                    while let Some(()) = stream.next().await {
                        pool.send_observable_update(ObservableUpdate::new(
                            id,
                            update_index,
                            this.get_multispend_group_status(&room_id).await,
                        ))
                        .await;
                        update_index += 1;
                    }
                    Ok(())
                },
            )
            .await
    }

    pub async fn observe_multispend_account_info(
        self: &Arc<Self>,
        id: u64,
        federation_ops: Arc<dyn FederationProvider>,
        federation_id: String,
        room_id: OwnedRoomId,
        finalized_group: &FinalizedGroup,
    ) -> Result<Observable<Result<RpcSPv2SyncResponse, NetworkError>>> {
        let account_id = finalized_group.spv2_account.id();
        let fetch = move || {
            let federation_ops = federation_ops.clone();
            let federation_id = federation_id.clone();
            async move {
                federation_ops
                    .multispend_group_sync_info(&federation_id, account_id)
                    .await
                    .map(RpcSPv2SyncResponse::from)
                    .map_err(|_| NetworkError {})
            }
        };
        let this = self.clone();
        self.runtime
            .observable_pool
            .make_observable(id, fetch().await, move |pool, id| async move {
                let mut update_index = 0;
                let mut stream = pin!(this.rescanner.subscribe_to_account_info_refresh(&room_id));
                while let Some(()) = stream.next().await {
                    pool.send_observable_update(ObservableUpdate::new(
                        id,
                        update_index,
                        fetch().await,
                    ))
                    .await;
                    update_index += 1;
                }
                Ok(())
            })
            .await
    }

    pub async fn get_multispend_group_status(&self, room_id: &RoomId) -> RpcMultispendGroupStatus {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        let room_id = RpcRoomId(room_id.to_string());
        match super::get_group_status_db(&mut dbtx, &room_id).await {
            Some(MultispendGroupStatus::ActiveInvitation { active_invite_id }) => {
                let Some(MsEventData::GroupInvitation(state)) =
                    super::get_event_data_db(&mut dbtx, &room_id, &active_invite_id).await
                else {
                    panic!("inconsistent multispend db")
                };
                RpcMultispendGroupStatus::ActiveInvitation {
                    active_invite_id,
                    state,
                }
            }
            Some(MultispendGroupStatus::Finalized {
                invite_event_id,
                finalized_group,
            }) => RpcMultispendGroupStatus::Finalized {
                invite_event_id,
                finalized_group,
            },
            None => RpcMultispendGroupStatus::Inactive,
        }
    }

    pub async fn list_multispend_events(
        &self,
        room_id: &RpcRoomId,
        start_after: Option<u64>,
        limit: usize,
    ) -> Vec<MultispendListedEvent> {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        super::list_multispend_events(&mut dbtx, room_id, start_after, limit).await
    }

    pub async fn send_multispend_group_invitation(
        &self,
        room_id: &RoomId,
        invitation: GroupInvitation,
        proposer_pubkey: RpcPublicKey,
    ) -> Result<()> {
        let room = self.client.get_room(room_id).context("room not found")?;
        let own_member = room.member_with_sender_info(room.own_user_id()).await?;
        anyhow::ensure!(
            own_member.room_member.suggested_role_for_power_level()
                == RoomMemberRole::Administrator,
            ErrorCode::BadRequest
        );
        anyhow::ensure!(!room.is_direct().await?, ErrorCode::BadRequest);
        anyhow::ensure!(
            room.members(RoomMemberships::ACTIVE).await?.len() > 1,
            ErrorCode::BadRequest
        );
        self.send_multispend_event(
            room_id,
            MultispendEvent::GroupInvitation {
                invitation,
                proposer_pubkey,
            },
        )
        .await
    }

    pub async fn cancel_multispend_group_invitation(&self, room_id: &RoomId) -> Result<()> {
        let room = self.client.get_room(room_id).context("room not found")?;
        let own_member = room.member_with_sender_info(room.own_user_id()).await?;
        anyhow::ensure!(
            own_member.room_member.suggested_role_for_power_level()
                == RoomMemberRole::Administrator,
            ErrorCode::BadRequest
        );
        match self.get_multispend_group_status(room_id).await {
            RpcMultispendGroupStatus::ActiveInvitation {
                active_invite_id, ..
            } => {
                self.send_multispend_event(
                    room_id,
                    MultispendEvent::GroupInvitationCancel {
                        invitation: active_invite_id,
                    },
                )
                .await
            }
            RpcMultispendGroupStatus::Inactive | RpcMultispendGroupStatus::Finalized { .. } => {
                bail!("Cannot cancel inactive or finalized group")
            }
        }
    }

    pub async fn vote_multispend_group_invitation(
        &self,
        room_id: &RoomId,
        invitation: RpcEventId,
        vote: MultispendGroupVoteType,
    ) -> Result<()> {
        self.send_multispend_event(
            room_id,
            MultispendEvent::GroupInvitationVote { invitation, vote },
        )
        .await
    }

    pub async fn send_multispend_withdraw_request(
        &self,
        room_id: &RoomId,
        request: TransferRequest,
        description: String,
    ) -> anyhow::Result<()> {
        self.send_multispend_event(
            room_id,
            MultispendEvent::WithdrawalRequest {
                request,
                description,
            },
        )
        .await
    }

    pub async fn respond_multispend_withdraw(
        &self,
        room_id: &RoomId,
        request: RpcEventId,
        response: WithdrawalResponseType,
    ) -> anyhow::Result<()> {
        self.send_multispend_event(
            room_id,
            MultispendEvent::WithdrawalResponse { request, response },
        )
        .await
    }

    pub async fn get_multispend_finalized_group(
        &self,
        room_id: RpcRoomId,
    ) -> anyhow::Result<Option<FinalizedGroup>> {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        Ok(super::get_finalized_group_db(&mut dbtx, &room_id).await)
    }

    /// Get all accumulated data for an event id.
    pub async fn get_multispend_event_data(
        &self,
        room_id: &RpcRoomId,
        event_id: &RpcEventId,
    ) -> Option<MsEventData> {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        super::get_event_data_db(&mut dbtx, room_id, event_id).await
    }

    /// Get all accumulated data for an event id.
    pub async fn observe_multispend_event_data(
        self: &Arc<Self>,
        observable_id: u64,
        room_id: RpcRoomId,
        event_id: RpcEventId,
    ) -> Result<Observable<MsEventData>> {
        let this = self.clone();
        let typed_room_id = room_id.into_typed()?;
        self.rescanner.wait_for_scanned(&typed_room_id).await;
        let initial = self
            .get_multispend_event_data(&room_id, &event_id)
            .await
            .context("event not found")?;
        let mut last_value = initial.clone();
        self.runtime
            .observable_pool
            .make_observable(
                observable_id,
                initial,
                move |pool, observable_id| async move {
                    let mut update_index = 0;
                    let mut stream = pin!(this.rescanner.scan_complete_stream(&typed_room_id));
                    while let Some(()) = stream.next().await {
                        let updated = this
                            .get_multispend_event_data(&room_id, &event_id)
                            .await
                            .expect("event to not disappear after checking once above");
                        if updated != last_value {
                            last_value = updated.clone();
                            pool.send_observable_update(ObservableUpdate::new(
                                observable_id,
                                update_index,
                                updated,
                            ))
                            .await;
                            update_index += 1;
                        }
                    }
                    Ok(())
                },
            )
            .await
    }

    /// Check if this is an invalid multispend event.
    pub async fn is_invalid_multispend_event(&self, event_id: RpcEventId) -> bool {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        super::is_invalid_event(&mut dbtx, event_id).await
    }

    pub async fn maybe_send_multispend_reannouncement(
        &self,
        room_id: &RoomId,
    ) -> anyhow::Result<()> {
        match self.get_multispend_group_status(room_id).await {
            RpcMultispendGroupStatus::Finalized {
                invite_event_id,
                finalized_group,
            } => {
                self.send_multispend_event(
                    room_id,
                    MultispendEvent::GroupReannounce {
                        invitation_id: invite_event_id,
                        invitation: finalized_group.invitation,
                        proposer: finalized_group.proposer,
                        pubkeys: finalized_group.pubkeys,
                        rejections: BTreeSet::new(),
                    },
                )
                .await?;
            }
            RpcMultispendGroupStatus::ActiveInvitation {
                active_invite_id,
                state,
            } => {
                self.send_multispend_event(
                    room_id,
                    MultispendEvent::GroupReannounce {
                        invitation_id: active_invite_id,
                        invitation: state.invitation,
                        proposer: state.proposer,
                        pubkeys: state.pubkeys,
                        rejections: state.rejections,
                    },
                )
                .await?;
            }
            RpcMultispendGroupStatus::Inactive => (),
        }
        Ok(())
    }
}
