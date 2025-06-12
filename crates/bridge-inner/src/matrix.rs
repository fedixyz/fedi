use std::collections::BTreeSet;
use std::future::pending;
use std::path::{Path, PathBuf};
use std::pin::pin;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use fedimint_core::db::IDatabaseTransactionOpsCoreTyped;
use fedimint_derive_secret::DerivableSecret;
use futures::StreamExt;
use imbl::Vector;
use matrix_sdk::attachment::{
    AttachmentConfig, AttachmentInfo, BaseFileInfo, BaseImageInfo, BaseVideoInfo,
};
use matrix_sdk::encryption::recovery::RecoveryState;
use matrix_sdk::encryption::BackupDownloadStrategy;
use matrix_sdk::media::{MediaFormat, MediaRequestParameters};
use matrix_sdk::notification_settings::NotificationSettings;
use matrix_sdk::room::edit::EditedContent;
use matrix_sdk::room::{Room, RoomMemberRole};
pub use matrix_sdk::ruma::api::client::account::register::v3 as register;
use matrix_sdk::ruma::api::client::authenticated_media::get_media_preview;
use matrix_sdk::ruma::api::client::directory::get_public_rooms_filtered::v3 as get_public_rooms_filtered;
use matrix_sdk::ruma::api::client::message::get_message_events;
use matrix_sdk::ruma::api::client::profile::get_profile;
use matrix_sdk::ruma::api::client::push::Pusher;
use matrix_sdk::ruma::api::client::receipt::create_receipt::v3::ReceiptType;
pub use matrix_sdk::ruma::api::client::room::create_room::v3 as create_room;
use matrix_sdk::ruma::api::client::room::Visibility;
use matrix_sdk::ruma::api::client::state::send_state_event;
use matrix_sdk::ruma::api::client::uiaa;
use matrix_sdk::ruma::directory::PublicRoomsChunk;
use matrix_sdk::ruma::events::poll::start::PollKind;
use matrix_sdk::ruma::events::poll::unstable_end::UnstablePollEndEventContent;
use matrix_sdk::ruma::events::poll::unstable_response::UnstablePollResponseEventContent;
use matrix_sdk::ruma::events::poll::unstable_start::{
    NewUnstablePollStartEventContent, UnstablePollAnswer, UnstablePollAnswers,
    UnstablePollStartContentBlock,
};
use matrix_sdk::ruma::events::receipt::ReceiptThread;
use matrix_sdk::ruma::events::room::encryption::RoomEncryptionEventContent;
use matrix_sdk::ruma::events::room::message::{
    MessageType, RoomMessageEventContent, RoomMessageEventContentWithoutRelation,
};
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use matrix_sdk::ruma::events::room::MediaSource;
use matrix_sdk::ruma::events::{
    AnyMessageLikeEventContent, AnySyncMessageLikeEvent, AnySyncTimelineEvent, InitialStateEvent,
    SyncMessageLikeEvent,
};
use matrix_sdk::ruma::{
    assign, EventId, OwnedEventId, OwnedMxcUri, OwnedRoomId, RoomId, UInt, UserId,
};
use matrix_sdk::{sliding_sync, Client, RoomInfo, RoomMemberships};
use matrix_sdk_ui::room_list_service;
use matrix_sdk_ui::sync_service::{self, SyncService};
use matrix_sdk_ui::timeline::{default_event_filter, TimelineEventItemId};
use mime::Mime;
use multispend::db::{
    MultispendGroupStatus, MultispendMarkedForScanning, RpcMultispendGroupStatus,
};
use multispend::services::MultispendServices;
use multispend::{
    FinalizedGroup, GroupInvitation, MsEventData, MultispendEvent, MultispendGroupVoteType,
    MultispendListedEvent, WithdrawalResponseType,
};
use rpc_types::error::ErrorCode;
use rpc_types::{
    NetworkError, RpcEventId, RpcMediaUploadParams, RpcPublicKey, RpcSPv2SyncResponse,
};
use runtime::bridge_runtime::Runtime;
use runtime::features::StabilityPoolV2FeatureConfigState;
use runtime::observable::{Observable, ObservableUpdate, ObservableVec, ObservableVecUpdate};
use runtime::storage::AppState;
use runtime::utils::PoisonedLockExt as _;
use stability_pool_client::common::TransferRequest;
use tokio::sync::{mpsc, Mutex};
use tracing::{error, info, warn};

use crate::federation::federation_v2::FederationV2;

pub mod multispend;
mod rescanner;
pub use rpc_types::matrix::*;

use crate::matrix::rescanner::RoomRescannerManager;

pub struct Matrix {
    /// matrix client
    pub client: Client,
    /// sync service to load new messages
    sync_service: SyncService,
    pub runtime: Arc<Runtime>,
    notification_settings: NotificationSettings,
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

#[derive(Debug, Clone, PartialEq, Eq)]
enum ClientKind {
    SlidingSyncProxy { url: String },
    NativeSync,
}

impl Matrix {
    async fn build_client(
        base_dir: &Path,
        home_server: String,
        passphrase: &str,
        client_kind: &ClientKind,
    ) -> Result<Client> {
        let builder = Client::builder()
            .sliding_sync_version_builder(match client_kind {
                ClientKind::SlidingSyncProxy { url } => sliding_sync::VersionBuilder::Proxy {
                    url: url::Url::parse(url)?,
                },
                ClientKind::NativeSync => sliding_sync::VersionBuilder::Native,
            })
            .homeserver_url(home_server)
            // make backup and recovery automagically work.
            .with_encryption_settings(matrix_sdk::encryption::EncryptionSettings {
                auto_enable_cross_signing: true,
                backup_download_strategy: BackupDownloadStrategy::AfterDecryptionFailure,
                auto_enable_backups: true,
            })
            .handle_refresh_tokens();

        // after migration we changed db names to not delete current database in case we
        // do something bad, we can always rollback to sliding sync proxy
        // version
        let is_sliding_sync_proxy = matches!(client_kind, ClientKind::SlidingSyncProxy { .. });

        #[cfg(not(target_family = "wasm"))]
        let builder = builder.sqlite_store(
            base_dir.join(if is_sliding_sync_proxy {
                "db.sqlite"
            } else {
                "db-native-sync.sqlite"
            }),
            Some(passphrase),
        );

        #[cfg(target_family = "wasm")]
        let builder = builder.indexeddb_store(
            if is_sliding_sync_proxy {
                "matrix-db"
            } else {
                "matrix-db-native-sync"
            },
            Some(passphrase),
        );

        let client = builder.build().await?;
        Ok(client)
    }

    // Used for db encryption and matrix server encrypted key value store.
    fn encryption_passphrase(matrix_secret: &DerivableSecret) -> String {
        let passphase_bytes: [u8; 16] = matrix_secret.to_random_bytes();
        hex::encode(passphase_bytes)
    }

    /// every home server gets different password
    pub fn home_server_password(matrix_secret: &DerivableSecret, home_server: &str) -> String {
        let password_bytes: [u8; 16] = matrix_secret.to_random_bytes();
        let password_secret = DerivableSecret::new_root(&password_bytes, home_server.as_bytes());
        let password_secret_bytes: [u8; 16] = password_secret.to_random_bytes();
        hex::encode(password_secret_bytes)
    }

    /// Start the matrix service.
    pub async fn init(
        runtime: Arc<Runtime>,
        base_dir: &Path,
        matrix_secret: &DerivableSecret,
        user_name: &str,
        home_server: String,
        sliding_sync_proxy: String,
        multispend_services: Arc<MultispendServices>,
    ) -> Result<Arc<Self>> {
        Self::run_migration_task(
            runtime.clone(),
            base_dir.to_path_buf(),
            matrix_secret.clone(),
            home_server.clone(),
            sliding_sync_proxy.clone(),
        );
        let matrix_session = runtime
            .app_state
            .with_read_lock(|r| r.matrix_session_native_sync.clone())
            .await;
        let user_password = &Self::home_server_password(matrix_secret, &home_server);
        let encryption_passphrase = Self::encryption_passphrase(matrix_secret);
        // always run the new client
        let client = Self::build_client(
            base_dir,
            home_server,
            &encryption_passphrase,
            &ClientKind::NativeSync,
        )
        .await?;

        if let Some(session) = matrix_session {
            client.restore_session(session).await?;
        } else {
            Self::login_or_register(
                &client,
                user_name,
                user_password,
                matrix_secret,
                &runtime.app_state,
            )
            .await?;
        };
        assert_eq!(
            client.user_id().unwrap().localpart(),
            user_name,
            "username must stay same"
        );

        let sync_service = SyncService::builder(client.clone())
            .with_offline_mode()
            .build()
            .await?;
        let matrix = Arc::new(Self {
            notification_settings: client.notification_settings().await,
            client: client.clone(),
            sync_service,
            runtime: runtime.clone(),
            rescanner: Arc::new(RoomRescannerManager::new(
                client,
                runtime,
                multispend_services,
            )),
            send_multispend_mutex: Mutex::new(()),
            send_multispend_server_ack: std::sync::Mutex::new(None),
        });

        let encryption_passphrase = Self::encryption_passphrase(matrix_secret);
        matrix.start_background(encryption_passphrase).await?;
        Ok(matrix)
    }

    pub async fn start_background(self: &Arc<Self>, encryption_passphrase: String) -> Result<()> {
        let this = self.clone();
        self.runtime
            .task_group
            .spawn_cancellable("matrix::start_sync", async move {
                this.sync_service.start().await;
                let mut state_subscriber = this.sync_service.state();
                while let Some(state) = state_subscriber.next().await {
                    match state {
                        sync_service::State::Terminated | sync_service::State::Error => {
                            this.sync_service.start().await;
                        }
                        sync_service::State::Offline
                        | sync_service::State::Idle
                        | sync_service::State::Running => {}
                    }
                    fedimint_core::task::sleep(Duration::from_millis(500)).await;
                }
            });

        let this = self.clone();
        self.runtime
            .task_group
            .spawn_cancellable("matrix::Recovery::enable", async move {
                if let Err(err) = Self::enable_recovery(&this.client, encryption_passphrase).await {
                    warn!(?err, "failed to enable recovery");
                }
            });

        self.runtime.task_group.spawn_cancellable(
            "matrix::session_token_changed",
            Self::handle_session_tokens_updated(
                self.client.clone(),
                self.runtime.clone(),
                ClientKind::NativeSync,
            ),
        );

        if self.is_multispend_enabled() {
            let this = self.clone();
            self.client
                .add_event_handler(move |event: AnySyncMessageLikeEvent, room: Room| {
                    let this = this.clone();
                    async move {
                        let room_id = room.room_id();
                        let event_id = event.event_id();
                        let is_multispend = matches!(
                            &event,
                            AnySyncMessageLikeEvent::RoomMessage(SyncMessageLikeEvent::Original(m))
                                if m.content.msgtype() == multispend::MULTISPEND_MSGTYPE
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

        Ok(())
    }

    async fn login_or_register(
        client: &Client,
        user_name: &str,
        user_password: &String,
        matrix_secret: &DerivableSecret,
        app_state: &AppState,
    ) -> anyhow::Result<()> {
        let matrix_auth = client.matrix_auth();
        let login_result = matrix_auth.login_username(user_name, user_password).await;
        match login_result {
            Ok(_) => {
                // on every login, try to recover e2e keys
                // this is idempotent.
                // TODO: subscribe to recovery progress
                // TODO: what happens if app dies here
                let _ = client
                    .encryption()
                    .recovery()
                    .recover(&Self::encryption_passphrase(matrix_secret))
                    .await
                    .inspect_err(|err| error!(%err, "unable to recover"))
                    .inspect(|_| info!("matrix recovery completed"));
            }
            Err(login_error) => {
                // TODO: only attempt registration if it was M_FORBIDDEN
                info!("login failed, attempting registration");
                // Do an initial registration request. Only works on servers with
                // open registration enabled.
                let mut request = register::Request::new();
                request.username = Some(user_name.to_owned());
                request.password = Some(user_password.to_owned());
                request.auth = Some(uiaa::AuthData::Dummy(uiaa::Dummy::new()));
                request.initial_device_display_name = Some("Fedi".to_string());
                let register_result = matrix_auth.register(request).await;
                match register_result {
                    Ok(_) => (),
                    Err(register_error) => {
                        info!(
                            "registration failed after login failed: {:?}",
                            register_error
                        );
                        anyhow::bail!(login_error);
                    }
                }
            }
        }
        // save the session
        match client.session() {
            Some(matrix_sdk::AuthSession::Matrix(matrix_session)) => {
                app_state
                    .with_write_lock(|a| {
                        a.matrix_session_native_sync = Some(matrix_session);
                    })
                    .await?;
            }
            Some(_) => warn!("unknown session"),
            None => warn!("session not found after login"),
        }
        Ok(())
    }

    async fn handle_session_tokens_updated(
        client: Client,
        runtime: Arc<Runtime>,
        client_kind: ClientKind,
    ) {
        let Some(mut session_token_changed) = client.matrix_auth().session_tokens_stream() else {
            warn!("handle session tokens updated called on a logged out client");
            return;
        };
        while let Some(token) = session_token_changed.next().await {
            if let Err(err) = runtime
                .app_state
                .with_write_lock(|w| {
                    let session = match client_kind {
                        ClientKind::SlidingSyncProxy { .. } => {
                            w.matrix_session_sliding_sync_proxy.as_mut()
                        }
                        ClientKind::NativeSync => w.matrix_session_native_sync.as_mut(),
                    };
                    if let Some(session) = session {
                        session.tokens = token;
                    }
                })
                .await
            {
                error!(%err, "unable to update session token");
            }
        }
    }
    // backup (set of room keys) is encrypted by (a random) key called backup key
    // - auto_enable_backups enables backup process automatically.
    // - enabling recovery means encrypting this backup key with a passphrase
    // so a future client can recover the backup key and hence the room keys
    async fn enable_recovery(client: &Client, encryption_passphrase: String) -> anyhow::Result<()> {
        let mut state_stream = pin!(client.encryption().recovery().state_stream());
        while let Some(state) = state_stream.next().await {
            match state {
                RecoveryState::Unknown => {
                    // wait for matrix background tasks to fetch the recovery state
                    continue;
                }
                RecoveryState::Enabled => {
                    // recovery is already on
                    return Ok(());
                }
                RecoveryState::Incomplete | RecoveryState::Disabled => {
                    // enable auto backups with passphrase for e2e keys.
                    // TODO: subscribe to backup progress to show something in ui
                    client
                        .encryption()
                        .recovery()
                        .enable()
                        .with_passphrase(&encryption_passphrase)
                        .await?;
                    // ? means we will not enable recovery in this run, we will
                    // try again on next startup
                }
            }
        }
        Ok(())
    }

    pub fn run_migration_task(
        runtime: Arc<Runtime>,
        base_dir: PathBuf,
        matrix_secret: DerivableSecret,
        home_server: String,
        sliding_sync_proxy: String,
    ) {
        runtime
            .task_group
            .clone()
            .spawn_cancellable("matrix::migration_task", async move {
                if let Err(err) = Self::migration_task_inner(
                    runtime,
                    base_dir,
                    matrix_secret,
                    home_server,
                    sliding_sync_proxy,
                )
                .await
                {
                    warn!(?err, "migration task failed");
                }
            });
    }

    // run a client that connects to sliding sync proxy in background to get keys
    // from it.
    async fn migration_task_inner(
        runtime: Arc<Runtime>,
        base_dir: PathBuf,
        matrix_secret: DerivableSecret,
        home_server: String,
        sliding_sync_proxy: String,
    ) -> Result<()> {
        let Some(session) = runtime
            .app_state
            .with_read_lock(|r| r.matrix_session_sliding_sync_proxy.clone())
            .await
        else {
            // the user never logged in on old matrix, no migration needed
            return Ok(());
        };
        let encryption_passphrase = Self::encryption_passphrase(&matrix_secret);
        let client_kind = ClientKind::SlidingSyncProxy {
            url: sliding_sync_proxy,
        };
        let client =
            Self::build_client(&base_dir, home_server, &encryption_passphrase, &client_kind)
                .await?;
        client.restore_session(session).await?;

        // save refreshed access tokens to disk in case it refreshes.
        runtime.task_group.spawn_cancellable(
            "matrix::migration_task::session_token_changed",
            Self::handle_session_tokens_updated(client.clone(), runtime.clone(), client_kind),
        );

        let sync_service = SyncService::builder(client.clone())
            .with_offline_mode()
            .build()
            .await?;
        // start sync from sliding sync proxy in background
        sync_service.start().await;
        // maybe better to retry in case of error instead of waiting for next startup
        Self::enable_recovery(&client, encryption_passphrase).await?;
        // keep this task alive, stuff in happen in background if we don't drop (stop)
        // sync_service
        pending::<()>().await;
        Ok(())
    }

    pub async fn get_account_session(
        &self,
        cached: bool,
        app_state: &AppState,
    ) -> Result<RpcMatrixAccountSession> {
        let session_meta = self
            .client
            .session()
            .ok_or_else(|| anyhow::anyhow!("session not found, requires login"))?;
        let meta = session_meta.meta().clone();
        if cached {
            if let Some(cached_display_name) = app_state
                .with_read_lock(|r| r.matrix_display_name.clone())
                .await
            {
                return Ok(RpcMatrixAccountSession {
                    user_id: meta.user_id,
                    device_id: meta.device_id,
                    avatar_url: self
                        .client
                        .account()
                        .get_cached_avatar_url()
                        .await?
                        .map(|x| x.to_string()),
                    display_name: Some(cached_display_name),
                });
            }
        }
        let profile = self.client.account().fetch_user_profile().await?;
        let (avatar_url, display_name) = (
            profile.avatar_url.map(|uri| uri.to_string()),
            profile.displayname,
        );
        app_state
            .with_write_lock(|r| r.matrix_display_name.clone_from(&display_name))
            .await?;
        Ok(RpcMatrixAccountSession {
            user_id: meta.user_id,
            device_id: meta.device_id,
            avatar_url,
            display_name,
        })
    }

    pub async fn observable_cancel(&self, id: u64) -> Result<()> {
        self.runtime.observable_pool.observable_cancel(id).await
    }

    /// All chats in matrix are rooms, whether DM or group chats.
    pub async fn room_list(&self, observable_id: u64) -> Result<ObservableVec<RpcRoomId>> {
        const PAGE_SIZE: usize = 1000;
        // manual construction required to to have correct lifetimes
        let room_list_service = self.sync_service.room_list_service();
        self.runtime
            .observable_pool
            .make_observable(observable_id, Vector::new(), move |this, id| async move {
                let list = room_list_service.all_rooms().await?;
                let (stream, controller) = list.entries_with_dynamic_adapters(PAGE_SIZE);
                // setting filter is required to start the controller - so we use no op filter
                controller.set_filter(Box::new(|_| true));
                let mut update_index = 0;
                let mut stream = std::pin::pin!(stream);
                while let Some(diffs) = stream.next().await {
                    this.send_observable_update(ObservableVecUpdate::new_diffs(
                        id,
                        update_index,
                        diffs
                            .into_iter()
                            .map(|diff| diff.map(|x| RpcRoomId::from(x.room_id().to_owned())))
                            .collect(),
                    ))
                    .await;
                    update_index += 1;
                }
                Ok(())
            })
            .await
    }

    /// Sync status is used to display "Waiting for network" indicator on
    /// frontend.
    ///
    /// We delay the events by 2 seconds to avoid flickering.
    pub async fn observe_sync_status(
        &self,
        observable_id: u64,
    ) -> Result<Observable<RpcSyncIndicator>> {
        self.runtime
            .observable_pool
            .make_observable_from_stream(
                observable_id,
                None,
                self.sync_service
                    .room_list_service()
                    .sync_indicator(Duration::from_secs(2), Duration::from_secs(2)),
            )
            .await
    }

    pub async fn room(
        &self,
        room_id: &RoomId,
    ) -> Result<room_list_service::Room, room_list_service::Error> {
        self.sync_service.room_list_service().room(room_id)
    }

    /// See [`matrix_sdk_ui::Timeline`].
    pub async fn timeline(
        &self,
        room_id: &RoomId,
    ) -> Result<Arc<matrix_sdk_ui::Timeline>, room_list_service::Error> {
        let room = self.room(room_id).await?;
        if !room.is_timeline_initialized() {
            room.init_timeline_with_builder(
                room.default_room_timeline_builder()
                    .await?
                    .event_filter(|event, version| match event {
                        AnySyncTimelineEvent::MessageLike(
                            matrix_sdk::ruma::events::AnySyncMessageLikeEvent::RoomMessage(msg),
                        ) if msg.as_original().is_some_and(|o| {
                            o.content.msgtype.msgtype().starts_with("xyz.fedi")
                        }) =>
                        {
                            true
                        }
                        _ => default_event_filter(event, version),
                    }),
            )
            .await?;
        }
        Ok(room.timeline().unwrap())
    }

    pub async fn room_timeline_items(
        &self,
        observable_id: u64,
        room_id: &RoomId,
    ) -> Result<ObservableVec<RpcTimelineItem>> {
        let timeline = self.timeline(room_id).await?;
        let (initial, stream) = timeline.subscribe().await;
        self.runtime
            .observable_pool
            .make_observable_from_vec_diff_stream(observable_id, initial, stream)
            .await
    }

    pub async fn room_timeline_items_paginate_backwards(
        &self,
        room_id: &RoomId,
        events_limit: u16,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;
        timeline.paginate_backwards(events_limit).await?;
        Ok(())
    }

    pub async fn room_observe_timeline_items_paginate_backwards_status(
        &self,
        observable_id: u64,
        room_id: &RoomId,
    ) -> Result<Observable<RpcBackPaginationStatus>> {
        let timeline = self.timeline(room_id).await?;
        let (current, stream) = timeline
            .live_back_pagination_status()
            .await
            .context("we only have live rooms")?;
        self.runtime
            .observable_pool
            .make_observable_from_stream(observable_id, Some(current), stream)
            .await
    }

    pub async fn send_message_text(&self, room_id: &RoomId, message: String) -> anyhow::Result<()> {
        let timeline = self.timeline(room_id).await?;
        timeline
            .send(RoomMessageEventContent::text_plain(message).into())
            .await?;
        Ok(())
    }

    pub async fn send_message_json(
        &self,
        room_id: &RoomId,
        msgtype: &str,
        body: String,
        data: serde_json::Map<String, serde_json::Value>,
    ) -> anyhow::Result<()> {
        let timeline = self.timeline(room_id).await?;
        timeline
            .send(
                RoomMessageEventContent::new(
                    MessageType::new(msgtype, body, data).context(ErrorCode::BadRequest)?,
                )
                .into(),
            )
            .await?;
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
        let room = self.room(room_id).await?;
        Ok(room
            .send(RoomMessageEventContent::new(
                MessageType::new(msgtype, body, data).context(ErrorCode::BadRequest)?,
            ))
            .await?
            .event_id)
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
        if !self.is_multispend_enabled() {
            bail!("multispend feature is disabled");
        }
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
                multispend::MULTISPEND_MSGTYPE,
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

    /// After creating a room, it takes some time to show up in the list.
    pub async fn wait_for_room_id(&self, room_id: &RoomId) -> Result<()> {
        fedimint_core::task::timeout(Duration::from_secs(20), async {
            loop {
                match self.timeline(room_id).await {
                    Ok(_) => return Ok(()),
                    Err(room_list_service::Error::RoomNotFound(_)) => {
                        fedimint_core::task::sleep(Duration::from_millis(100)).await;
                    }
                    Err(e) => bail!(e),
                }
            }
        })
        .await
        .context(room_list_service::Error::RoomNotFound(room_id.into()))?
    }

    pub async fn room_create(
        &self,
        mut request: create_room::Request,
    ) -> Result<matrix_sdk::ruma::OwnedRoomId> {
        if request.visibility != Visibility::Public {
            request.initial_state = vec![InitialStateEvent::new(
                RoomEncryptionEventContent::with_recommended_defaults(),
            )
            .to_raw_any()];
        }
        let room = self.client.create_room(request).await?;
        self.wait_for_room_id(room.room_id()).await?;
        Ok(room.room_id().into())
    }

    pub async fn create_or_get_dm(
        &self,
        user_id: &UserId,
    ) -> Result<matrix_sdk::ruma::OwnedRoomId> {
        // is there a sliding sync version of this?
        if let Some(room) = self.client.get_dm_room(user_id) {
            return Ok(room.room_id().to_owned());
        }
        let room = self.client.create_dm(user_id).await?;
        self.wait_for_room_id(room.room_id()).await?;
        Ok(room.room_id().to_owned())
    }

    // Only works for left and invited rooms
    pub async fn room_join(&self, room_id: &RoomId) -> Result<()> {
        self.room(room_id).await?.inner_room().join().await?;
        Ok(())
    }

    // Only works for left and invited rooms
    pub async fn room_join_public(&self, room_id: &RoomId) -> Result<()> {
        self.client.join_room_by_id(room_id).await?;
        Ok(())
    }

    // Only works for left and invited rooms
    pub async fn room_leave(&self, room_id: &RoomId) -> Result<()> {
        self.room(room_id).await?.inner_room().leave().await?;
        Ok(())
    }

    pub async fn room_observe_info(
        &self,
        observable_id: u64,
        room_id: &RoomId,
    ) -> Result<Observable<RoomInfo>> {
        let sub = self.room(room_id).await?.inner_room().subscribe_info();
        self.runtime
            .observable_pool
            .make_observable_from_subscriber(observable_id, sub)
            .await
    }

    pub async fn room_invite_user_by_id(&self, room_id: &RoomId, user_id: &UserId) -> Result<()> {
        self.room(room_id)
            .await?
            .inner_room()
            .invite_user_by_id(user_id)
            .await?;
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

    pub async fn room_get_power_levels(
        &self,
        room_id: &RoomId,
    ) -> Result<RoomPowerLevelsEventContent> {
        Ok(self
            .room(room_id)
            .await?
            .inner_room()
            .power_levels()
            .await?
            .into())
    }

    pub async fn room_change_power_levels(
        &self,
        room_id: &RoomId,
        new: RoomPowerLevelsEventContent,
    ) -> Result<()> {
        self.room(room_id)
            .await?
            .inner_room()
            .send_state_event(new)
            .await?;
        Ok(())
    }

    pub async fn room_set_name(
        &self,
        room_id: &RoomId,
        name: String,
    ) -> Result<send_state_event::v3::Response> {
        Ok(self
            .room(room_id)
            .await?
            .inner_room()
            .set_name(name)
            .await?)
    }

    pub async fn room_set_topic(
        &self,
        room_id: &RoomId,
        topic: String,
    ) -> Result<send_state_event::v3::Response> {
        Ok(self
            .room(room_id)
            .await?
            .inner_room()
            .set_room_topic(&topic)
            .await?)
    }

    pub async fn ignore_user(&self, user_id: &UserId) -> Result<()> {
        Ok(self.client.account().ignore_user(user_id).await?)
    }

    pub async fn unignore_user(&self, user_id: &UserId) -> Result<()> {
        Ok(self.client.account().unignore_user(user_id).await?)
    }

    pub async fn list_ignored_users(&self) -> Result<Vec<RpcUserId>> {
        Ok(self
            .client
            .subscribe_to_ignore_user_list_changes()
            .get()
            .into_iter()
            .map(RpcUserId)
            .collect())
    }
    pub async fn room_kick_user(
        &self,
        room_id: &RoomId,
        user_id: &UserId,
        reason: Option<&str>,
    ) -> Result<()> {
        Ok(self.room(room_id).await?.kick_user(user_id, reason).await?)
    }
    pub async fn room_ban_user(
        &self,
        room_id: &RoomId,
        user_id: &UserId,
        reason: Option<&str>,
    ) -> Result<()> {
        Ok(self.room(room_id).await?.ban_user(user_id, reason).await?)
    }

    pub async fn room_unban_user(
        &self,
        room_id: &RoomId,
        user_id: &UserId,
        reason: Option<&str>,
    ) -> Result<()> {
        Ok(self
            .room(room_id)
            .await?
            .unban_user(user_id, reason)
            .await?)
    }

    pub async fn room_get_members(&self, room_id: &RoomId) -> Result<Vec<RpcRoomMember>> {
        let members = self
            .room(room_id)
            .await?
            .members(RoomMemberships::all())
            .await?;
        Ok(members.into_iter().map(RpcRoomMember::from).collect())
    }

    /// Read receipt upto `event_id`.
    pub async fn room_send_receipt(&self, room_id: &RoomId, event_id: &str) -> Result<bool> {
        Ok(self
            .timeline(room_id)
            .await?
            .send_single_receipt(
                ReceiptType::Read,
                ReceiptThread::Unthreaded,
                event_id.parse().context(ErrorCode::BadRequest)?,
            )
            .await?)
    }

    pub async fn public_room_info(&self, room_id: &str) -> Result<PublicRoomsChunk> {
        let response = self
            .client
            .public_rooms_filtered(assign!(get_public_rooms_filtered::Request::default(), {
                server: None,
                limit: None,
                since: None,
                filter: assign!(matrix_sdk::ruma::directory::Filter::new(), {
                    generic_search_term: Some(room_id.to_string())
                }),
                room_network: Default::default(),
            }))
            .await?;
        response
            .chunk
            .first()
            .context("public room not found")
            .cloned()
    }

    pub async fn get_public_rooms_filtered(
        &self,
        request: get_public_rooms_filtered::Request,
    ) -> Result<get_public_rooms_filtered::Response> {
        Ok(self.client.public_rooms_filtered(request).await?)
    }

    pub async fn search_user_directory(
        &self,
        search_term: &str,
        limit: u64,
    ) -> Result<RpcMatrixUserDirectorySearchResponse> {
        Ok(RpcMatrixUserDirectorySearchResponse::from_response(
            self.client.search_users(search_term, limit).await?,
        ))
    }

    pub async fn set_display_name(&self, display_name: String) -> Result<()> {
        self.client
            .account()
            .set_display_name(Some(&display_name))
            .await?;
        self.runtime
            .app_state
            .with_write_lock(|r| r.matrix_display_name = Some(display_name.clone()))
            .await?;
        Ok(())
    }

    pub async fn set_avatar_url(&self, avatar_url: String) -> Result<()> {
        let avatar_mxc_uri = OwnedMxcUri::from(avatar_url);
        self.client
            .account()
            .set_avatar_url(Some(&avatar_mxc_uri))
            .await?;
        Ok(())
    }

    pub async fn upload_file(&self, mime: Mime, file: Vec<u8>) -> Result<RpcMatrixUploadResult> {
        let result = self.client.media().upload(&mime, file, None).await?;
        Ok(RpcMatrixUploadResult {
            content_uri: result.content_uri.to_string(),
        })
    }

    pub async fn set_pusher(&self, pusher: Pusher) -> Result<()> {
        self.client.pusher().set(pusher).await?;
        Ok(())
    }

    pub async fn room_set_notification_mode(
        &self,
        room_id: &RoomId,
        mode: RpcRoomNotificationMode,
    ) -> Result<()> {
        self.notification_settings
            .set_room_notification_mode(room_id, mode.into())
            .await?;
        Ok(())
    }

    pub async fn room_get_notification_mode(
        &self,
        room_id: &RoomId,
    ) -> Result<Option<RpcRoomNotificationMode>> {
        Ok(self
            .notification_settings
            .get_user_defined_room_notification_mode(room_id)
            .await
            .map(From::from))
    }

    pub async fn user_profile(&self, user_id: &UserId) -> Result<get_profile::v3::Response> {
        Ok(self.client.account().fetch_user_profile_of(user_id).await?)
    }
    pub async fn room_mark_as_unread(&self, room_id: &RoomId, unread: bool) -> Result<()> {
        self.room(room_id)
            .await?
            .inner_room()
            .set_unread_flag(unread)
            .await?;
        Ok(())
    }
    pub async fn preview_room_content(&self, room_id: &RoomId) -> Result<Vec<RpcTimelineItem>> {
        let response: get_message_events::v3::Response = self
            .client
            .send(assign!(
                get_message_events::v3::Request::new(
                    room_id.into(),
                    matrix_sdk::ruma::api::Direction::Forward,
                ),
                { limit: 50000u32.into() }
            ))
            .await?;

        Ok(response
            .chunk
            .iter()
            .filter_map(RpcTimelineItem::from_preview_item)
            .collect())
    }

    pub async fn send_attachment(
        &self,
        room_id: &RoomId,
        filename: String,
        params: RpcMediaUploadParams,
        data: Vec<u8>,
    ) -> Result<()> {
        let mime = params
            .mime_type
            .parse::<Mime>()
            .context(ErrorCode::BadRequest)?;

        let size = Some(UInt::from(data.len() as u32));

        let width = params.width.map(UInt::from);

        let height = params.height.map(UInt::from);

        let info = match mime.type_() {
            mime::IMAGE => AttachmentInfo::Image(BaseImageInfo {
                width,
                height,
                size,
                blurhash: None,
                is_animated: None,
            }),
            mime::VIDEO => AttachmentInfo::Video(BaseVideoInfo {
                width,
                height,
                size,
                duration: None,
                blurhash: None,
            }),
            _ => AttachmentInfo::File(BaseFileInfo { size }),
        };

        let config = AttachmentConfig::default().info(info);

        self.room(room_id)
            .await?
            .send_attachment(&filename, &mime, data, config)
            .await?;
        Ok(())
    }

    pub async fn edit_message(
        &self,
        room_id: &RoomId,
        item_id: &TimelineEventItemId,
        new_content: String,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;
        let new_content = RoomMessageEventContentWithoutRelation::text_plain(new_content);

        timeline
            .edit(item_id, EditedContent::RoomMessage(new_content))
            .await?;

        Ok(())
    }

    pub async fn delete_message(
        &self,
        room_id: &RoomId,
        item_id: &TimelineEventItemId,
        reason: Option<String>,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;
        timeline.redact(item_id, reason.as_deref()).await?;

        Ok(())
    }

    pub async fn download_file(&self, source: MediaSource) -> Result<Vec<u8>> {
        let request = MediaRequestParameters {
            source,
            format: MediaFormat::File,
        };

        let content = self
            .client
            .media()
            .get_media_content(&request, false)
            .await?;
        Ok(content)
    }

    pub async fn start_poll(
        &self,
        room_id: &RoomId,
        question: String,
        answers: Vec<String>,
        is_multiple_choice: bool,
        is_disclosed: bool,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;

        let poll_answers: UnstablePollAnswers = answers
            .into_iter()
            .enumerate()
            .map(|(i, text)| UnstablePollAnswer::new(i.to_string(), text))
            .collect::<Vec<_>>()
            .try_into()
            .context(ErrorCode::BadRequest)?;

        let mut poll_content =
            UnstablePollStartContentBlock::new(question.clone(), poll_answers.clone());

        if is_multiple_choice {
            poll_content.max_selections = UInt::try_from(poll_answers.len())?;
        }

        if is_disclosed {
            poll_content.kind = PollKind::Disclosed
        } else {
            poll_content.kind = PollKind::Undisclosed
        }

        let poll_start_event_content =
            NewUnstablePollStartEventContent::plain_text(question, poll_content);

        let event_content =
            AnyMessageLikeEventContent::UnstablePollStart(poll_start_event_content.into());

        timeline.send(event_content).await?;
        Ok(())
    }

    pub async fn end_poll(&self, room_id: &RoomId, poll_start_id: &EventId) -> Result<()> {
        let timeline = self.timeline(room_id).await?;

        let poll_end_event_content =
            UnstablePollEndEventContent::new("This poll has ended", poll_start_id.to_owned());
        let event_content = AnyMessageLikeEventContent::UnstablePollEnd(poll_end_event_content);

        timeline.send(event_content).await?;
        Ok(())
    }

    pub async fn respond_to_poll(
        &self,
        room_id: &RoomId,
        poll_start_id: &EventId,
        answer_ids: Vec<String>,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;

        let poll_response_event_content =
            UnstablePollResponseEventContent::new(answer_ids, poll_start_id.into());
        let event_content =
            AnyMessageLikeEventContent::UnstablePollResponse(poll_response_event_content);

        timeline.send(event_content).await?;
        Ok(())
    }

    pub async fn get_media_preview(
        &self,
        url: String,
    ) -> anyhow::Result<get_media_preview::v1::Response> {
        Ok(self
            .client
            .send(get_media_preview::v1::Request::new(url))
            .await?)
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
        fed: Arc<FederationV2>,
        room_id: OwnedRoomId,
        finalized_group: &FinalizedGroup,
    ) -> Result<Observable<Result<RpcSPv2SyncResponse, NetworkError>>> {
        let account_id = finalized_group.spv2_account.id();
        let fetch = move || {
            let fed = fed.clone();
            async move {
                fed.multispend_group_sync_info(account_id)
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
        match multispend::get_group_status_db(&mut dbtx, &room_id).await {
            Some(MultispendGroupStatus::ActiveInvitation { active_invite_id }) => {
                let Some(MsEventData::GroupInvitation(state)) =
                    multispend::get_event_data_db(&mut dbtx, &room_id, &active_invite_id).await
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
        multispend::list_multispend_events(&mut dbtx, room_id, start_after, limit).await
    }

    pub async fn send_multispend_group_invitation(
        &self,
        room_id: &RoomId,
        invitation: GroupInvitation,
        proposer_pubkey: RpcPublicKey,
    ) -> Result<()> {
        let room = self.room(room_id).await?;
        let (own_member, _) = room.own_membership_details().await?;
        anyhow::ensure!(
            own_member.suggested_role_for_power_level() == RoomMemberRole::Administrator,
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
        let room = self.room(room_id).await?;
        let (own_member, _) = room.own_membership_details().await?;
        anyhow::ensure!(
            own_member.suggested_role_for_power_level() == RoomMemberRole::Administrator,
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
        Ok(multispend::get_finalized_group_db(&mut dbtx, &room_id).await)
    }

    /// Get all accumulated data for an event id.
    pub async fn get_multispend_event_data(
        &self,
        room_id: &RpcRoomId,
        event_id: &RpcEventId,
    ) -> Option<MsEventData> {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        multispend::get_event_data_db(&mut dbtx, room_id, event_id).await
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
        multispend::is_invalid_event(&mut dbtx, event_id).await
    }

    pub fn is_multispend_enabled(&self) -> bool {
        self.runtime
            .feature_catalog
            .stability_pool_v2
            .as_ref()
            .is_some_and(|cfg| matches!(cfg.state, StabilityPoolV2FeatureConfigState::Multispend))
    }
}
