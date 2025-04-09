use std::future::pending;
use std::path::{Path, PathBuf};
use std::pin::pin;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
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
use matrix_sdk::room::Room;
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
use matrix_sdk::ruma::{assign, EventId, OwnedEventId, OwnedMxcUri, RoomId, UInt, UserId};
use matrix_sdk::{sliding_sync, Client, RoomInfo, RoomMemberships};
use matrix_sdk_ui::room_list_service;
use matrix_sdk_ui::sync_service::{self, SyncService};
use matrix_sdk_ui::timeline::{default_event_filter, TimelineEventItemId};
use mime::Mime;
use multispend::{GroupInvitationWithKeys, MsEventData, MultispendEvent};
use tokio::sync::{mpsc, Mutex};
use tracing::{error, info, warn};

use crate::bridge::BridgeRuntime;
use crate::error::ErrorCode;
use crate::features::StabilityPoolV2FeatureConfigState;
use crate::observable::{Observable, ObservableVec, ObservableVecUpdate};
use crate::storage::AppState;
use crate::types::{RpcEventId, RpcMediaUploadParams};
use crate::utils::PoisonedLockExt as _;

pub mod multispend;
mod rescanner;
mod types;
pub use types::*;

use crate::matrix::rescanner::RoomRescannerManager;

#[derive(Clone)]
pub struct Matrix {
    /// matrix client
    client: Client,
    /// sync service to load new messages
    sync_service: Arc<SyncService>,
    pub runtime: Arc<BridgeRuntime>,
    notification_settings: NotificationSettings,
    /// Manager for room rescanning operations
    rescanner: RoomRescannerManager,
    /// Mutex to prevent concurrent send_multispend_event
    send_multispend_mutex: Arc<Mutex<()>>,
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
    send_multispend_server_ack: Arc<std::sync::Mutex<Option<mpsc::Sender<OwnedEventId>>>>,
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
    fn home_server_password(matrix_secret: &DerivableSecret, home_server: &str) -> String {
        let password_bytes: [u8; 16] = matrix_secret.to_random_bytes();
        let password_secret = DerivableSecret::new_root(&password_bytes, home_server.as_bytes());
        let password_secret_bytes: [u8; 16] = password_secret.to_random_bytes();
        hex::encode(password_secret_bytes)
    }

    /// Start the matrix service.
    #[allow(clippy::too_many_arguments)]
    pub async fn init(
        runtime: Arc<BridgeRuntime>,
        base_dir: &Path,
        matrix_secret: &DerivableSecret,
        user_name: &str,
        home_server: String,
        sliding_sync_proxy: String,
    ) -> Result<Self> {
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
        let matrix = Self {
            notification_settings: client.notification_settings().await,
            client: client.clone(),
            sync_service: Arc::new(sync_service),
            runtime: runtime.clone(),
            rescanner: RoomRescannerManager::new(client, runtime),
            send_multispend_mutex: Arc::new(Mutex::new(())),
            send_multispend_server_ack: Arc::new(std::sync::Mutex::new(None)),
        };

        let encryption_passphrase = Self::encryption_passphrase(matrix_secret);
        matrix.start_background(encryption_passphrase).await?;
        Ok(matrix)
    }

    pub async fn start_background(&self, encryption_passphrase: String) -> Result<()> {
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
                        if let AnySyncMessageLikeEvent::RoomMessage(
                            SyncMessageLikeEvent::Original(m),
                        ) = event
                        {
                            if m.content.msgtype() == multispend::MULTISPEND_MSGTYPE {
                                let room_id = room.room_id();

                                // anytime we see multispend event, we rescan the room.
                                this.rescanner.queue_rescan(room_id);

                                // see docs on `send_multispend_server_ack`
                                let sender = this.send_multispend_server_ack.ensure_lock().clone();
                                if let Some(sender) = sender {
                                    sender.send(m.event_id).await.ok();
                                }
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
        runtime: Arc<BridgeRuntime>,
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
        runtime: Arc<BridgeRuntime>,
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
        runtime: Arc<BridgeRuntime>,
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

    async fn room(
        &self,
        room_id: &RoomId,
    ) -> Result<room_list_service::Room, room_list_service::Error> {
        self.sync_service.room_list_service().room(room_id)
    }

    /// See [`matrix_sdk_ui::Timeline`].
    async fn timeline(
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
                String::from("Multispend Event"),
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

    pub async fn get_multispend_finalized_group(
        &self,
        room_id: RpcRoomId,
    ) -> anyhow::Result<Option<GroupInvitationWithKeys>> {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        let finalized = multispend::get_finalized_group_db(&mut dbtx, &room_id).await;
        Ok(finalized.map(|(group, _account)| group))
    }

    /// Get all accumulated data for an event id.
    pub async fn get_multispend_event_data(
        &self,
        room_id: RpcRoomId,
        event_id: RpcEventId,
    ) -> anyhow::Result<Option<MsEventData>> {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction_nc().await;
        let data = multispend::get_event_data_db(&mut dbtx, &room_id, event_id).await;
        Ok(data)
    }

    fn is_multispend_enabled(&self) -> bool {
        self.runtime
            .feature_catalog
            .stability_pool_v2
            .as_ref()
            .is_some_and(|cfg| matches!(cfg.state, StabilityPoolV2FeatureConfigState::Multispend))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};
    use std::str::FromStr;
    use std::sync::atomic::{AtomicU64, Ordering};

    use bitcoin::secp256k1;
    use fedimint_bip39::Bip39RootSecretStrategy;
    use fedimint_client::secret::RootSecretStrategy as _;
    use fedimint_core::util::backoff_util::aggressive_backoff;
    use fedimint_core::util::retry;
    use fedimint_derive_secret::ChildId;
    use fedimint_logging::TracingSetup;
    use multispend::GroupInvitation;
    use rand::{thread_rng, Rng};
    use tempfile::TempDir;
    use tokio::sync::mpsc;
    use tracing::info;

    use super::*;
    use crate::constants::MATRIX_CHILD_ID;
    use crate::event::IEventSink;
    use crate::features::{FeatureCatalog, RuntimeEnvironment};
    use crate::ffi::PathBasedStorage;
    use crate::matrix::multispend::MultispendGroupVoteType;
    use crate::rpc::tests::MockFediApi;
    use crate::types::RpcPublicKey;

    const TEST_HOME_SERVER: &str = "staging.m1.8fa.in";
    const TEST_SLIDING_SYNC: &str = "https://staging.sliding.m1.8fa.in";

    async fn mk_matrix_login(
        user_name: &str,
        secret: &DerivableSecret,
    ) -> Result<(Matrix, mpsc::Receiver<(String, String)>, TempDir)> {
        struct TestEventSink(mpsc::Sender<(String, String)>);
        impl IEventSink for TestEventSink {
            fn event(&self, event_type: String, body: String) {
                tokio::task::block_in_place(|| self.0.blocking_send((event_type, body)).unwrap());
            }
        }

        let (event_tx, event_rx) = mpsc::channel(1000);
        let event_sink = Arc::new(TestEventSink(event_tx));
        let tmp_dir = TempDir::new()?;
        let storage = PathBasedStorage::new(tmp_dir.as_ref().to_path_buf()).await?;
        let runtime = BridgeRuntime::new(
            Arc::new(storage),
            event_sink,
            Arc::new(MockFediApi::default()),
            FromStr::from_str("bridge:test:70c2ad23-bfac-4aa2-81c3-d6f5e79ae724")?,
            FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
        )
        .await?;
        let matrix = Matrix::init(
            Arc::new(runtime),
            tmp_dir.as_ref(),
            secret,
            user_name,
            format!("https://{TEST_HOME_SERVER}"),
            TEST_SLIDING_SYNC.to_string(),
        )
        .await?;
        Ok((matrix, event_rx, tmp_dir))
    }

    fn mk_secret() -> DerivableSecret {
        let (key, salt): ([u8; 32], [u8; 32]) = thread_rng().gen();
        DerivableSecret::new_root(&key, &salt)
    }

    fn mk_username() -> String {
        let username = format!("tester{id}", id = rand::random::<u64>());
        info!(%username, "creating a new user for testing");
        username
    }

    async fn mk_matrix_new_user() -> Result<(Matrix, mpsc::Receiver<(String, String)>, TempDir)> {
        mk_matrix_login(&mk_username(), &mk_secret()).await
    }

    #[ignore]
    #[tokio::test(flavor = "multi_thread")]
    async fn login() -> Result<()> {
        TracingSetup::default().init().unwrap();
        let (_matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
        Ok(())
    }

    #[ignore]
    #[tokio::test(flavor = "multi_thread")]
    async fn send_dm() -> Result<()> {
        TracingSetup::default().init().unwrap();
        let (matrix1, mut event_rx1, _temp_dir) = mk_matrix_new_user().await?;
        let (matrix2, mut event_rx2, _temp_dir) = mk_matrix_new_user().await?;
        let user2 = matrix2.client.user_id().unwrap();
        let room_id = matrix1.create_or_get_dm(user2).await?;
        matrix2.room_join(&room_id).await?;
        let id_gen = AtomicU64::new(0);
        let items1 = matrix1
            .room_timeline_items(id_gen.fetch_add(1, Ordering::Relaxed), &room_id)
            .await?;
        let items2 = matrix2
            .room_timeline_items(id_gen.fetch_add(1, Ordering::Relaxed), &room_id)
            .await?;
        info!(?items1, ?items2, "### initial items");
        matrix1
            .send_message_text(&room_id, "hello from bridge".into())
            .await?;
        info!("waiting for server to echo back the message");
        while let Some((ev, body)) = event_rx2.recv().await {
            info!("### event2: {ev} {body}");
            if ev == "observableUpdate"
                && body.contains(r#""localEcho":false"#)
                && body.contains("hello from bridge")
            {
                break;
            }
        }
        matrix2
            .send_message_text(&room_id, "hello from 2 bridge".into())
            .await?;
        info!("waiting for server to echo back the message");
        while let Some((ev, body)) = event_rx1.recv().await {
            info!("### event1: {ev} {body}");
            if ev == "observableUpdate"
                && body.contains(r#""localEcho":false"#)
                && body.contains("hello from 2 bridge")
            {
                break;
            }
        }

        Ok(())
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn test_recovery() -> Result<()> {
        TracingSetup::default().init().unwrap();
        let username = mk_username();
        let secret = mk_secret();
        info!("### creating users");
        let (matrix1, _, _temp_dir) = mk_matrix_login(&username, &secret).await?;
        let (matrix2, _, _temp_dir) = mk_matrix_new_user().await?;

        info!("### creating room");
        // make room
        let user2 = matrix2.client.user_id().unwrap();
        let room_id = matrix1.create_or_get_dm(user2).await?;
        matrix2.room_join(&room_id).await?;

        info!("### sending message between two users");
        matrix1
            .send_message_text(&room_id, "hello from user1".to_owned())
            .await?;
        matrix2
            .send_message_text(&room_id, "hello from user2".to_owned())
            .await?;

        info!("### recover user 1");
        let (matrix1_new, mut event_rx1_new, _temp_dir) =
            mk_matrix_login(&username, &secret).await?;

        matrix1_new.wait_for_room_id(&room_id).await?;
        let id_gen = AtomicU64::new(0);
        let initial_item = matrix1_new
            .room_timeline_items(id_gen.fetch_add(1, Ordering::Relaxed), &room_id)
            .await?;
        info!("### waiting for user 2 message");
        if !serde_json::to_string(&initial_item)?.contains("hello from user2") {
            while let Some((ev, body)) = event_rx1_new.recv().await {
                info!("### event1_new: {ev} {body}");
                if ev == "observableUpdate"
                    && body.contains(r#""localEcho":false"#)
                    && body.contains("hello from user2")
                {
                    break;
                }
            }
        }
        info!("### waiting for user 1 message");
        if !serde_json::to_string(&initial_item)?.contains("hello from user1") {
            while let Some((ev, body)) = event_rx1_new.recv().await {
                info!("### event1_new: {ev} {body}");
                if ev == "observableUpdate"
                    && body.contains(r#""localEcho":false"#)
                    && body.contains("hello from user1")
                {
                    break;
                }
            }
        }
        info!("### got all messages");
        Ok(())
    }

    #[test]
    #[ignore]
    fn matrix_password() {
        TracingSetup::default().init().unwrap();
        let home_server = "matrix-synapse-homeserver2.dev.fedibtc.com";
        let mnemonic = "foo bar baz".parse::<bip39::Mnemonic>().unwrap();
        let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&mnemonic);

        let password = Matrix::home_server_password(
            &root_secret.child_key(ChildId(MATRIX_CHILD_ID)),
            home_server,
        );
        info!("password: {password}");
    }

    #[ignore]
    #[tokio::test(flavor = "multi_thread")]
    async fn test_create_room() -> Result<()> {
        TracingSetup::default().init().unwrap();
        let (matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
        let mut request = create_room::Request::default();
        let room_name = "my name is one".to_string();
        request.name = Some(room_name.clone());
        let room_id = matrix.room_create(request).await?;
        let room = matrix.room(&room_id).await?;
        while room.name() != Some(room_name.clone()) {
            warn!("## WAITING");
            fedimint_core::runtime::sleep(Duration::from_millis(100)).await;
        }
        Ok(())
    }

    #[ignore]
    #[tokio::test(flavor = "multi_thread")]
    async fn test_send_and_download_attachment() -> Result<()> {
        TracingSetup::default().init().unwrap();
        let (matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
        let (matrix2, _event_rx, _temp_dir) = mk_matrix_new_user().await?;

        // Create a room
        let room_id = matrix
            .create_or_get_dm(matrix2.client.user_id().unwrap())
            .await?;

        // Prepare attachment data
        let filename = "test.txt".to_string();
        let mime_type = "text/plain".to_string();
        let data = b"Hello, World!".to_vec();

        // Send attachment
        matrix
            .send_attachment(
                &room_id,
                filename.clone(),
                RpcMediaUploadParams {
                    mime_type,
                    width: None,
                    height: None,
                },
                data.clone(),
            )
            .await?;
        fedimint_core::task::sleep(Duration::from_millis(100)).await;

        let timeline = matrix.timeline(&room_id).await?;
        let event = timeline
            .latest_event()
            .await
            .context("expected last event")?;
        let source = match event.content().as_message().unwrap().msgtype() {
            MessageType::File(f) => f.source.clone(),
            _ => unreachable!(),
        };

        // Download the file
        let downloaded_data = matrix.download_file(source).await?;

        // Assert that the downloaded data matches the original data
        assert_eq!(
            downloaded_data, data,
            "Downloaded data does not match original data"
        );

        Ok(())
    }

    #[ignore]
    #[tokio::test(flavor = "multi_thread")]
    async fn test_multispend_minimal() -> Result<()> {
        TracingSetup::default()
            .with_directive("fediffi=trace")
            .init()
            .ok();
        let (matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
        let (matrix2, _event_rx, _temp_dir) = mk_matrix_new_user().await?;

        // Create a room
        let room_id = matrix
            .create_or_get_dm(matrix2.client.user_id().unwrap())
            .await?;

        // Test initial state
        assert!(matrix
            .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
            .await?
            .is_none());

        // Send group invitation
        let user1 = RpcUserId(matrix.client.user_id().unwrap().to_string());
        let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
        let (_, pk1) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
        let invitation = GroupInvitation {
            signers: BTreeSet::from([user1.clone(), user2.clone()]),
            threshold: 2,
            federation_invite_code: "test".to_string(),
            federation_name: "test".to_string(),
        };
        let event = MultispendEvent::GroupInvitation {
            invitation: invitation.clone(),
            proposer_pubkey: RpcPublicKey(pk1),
        };
        error!("SENDING MESSAGE");
        matrix.send_multispend_event(&room_id, event).await?;
        error!("SENT MESSAGE");
        matrix.rescanner.wait_for_scanned(&room_id).await;
        error!("DONE SCANNING");

        // Test event data
        let timeline = matrix.timeline(&room_id).await?;
        let last_event = timeline.latest_event().await.unwrap();
        let event_id = last_event.event_id().unwrap();
        let event_data = matrix
            .get_multispend_event_data(
                RpcRoomId(room_id.to_string()),
                RpcEventId(event_id.to_string()),
            )
            .await?;
        assert!(event_data.is_some());

        Ok(())
    }

    #[ignore]
    #[tokio::test(flavor = "multi_thread")]
    async fn test_multispend_group_acceptance() -> Result<()> {
        TracingSetup::default()
            .with_directive("fediffi=trace")
            .init()
            .ok();
        let (matrix1, _event_rx1, _temp_dir1) = mk_matrix_new_user().await?;
        let (matrix2, _event_rx2, _temp_dir2) = mk_matrix_new_user().await?;

        let room_id = matrix1
            .create_or_get_dm(matrix2.client.user_id().unwrap())
            .await?;
        matrix2.wait_for_room_id(&room_id).await?;
        matrix2.room_join(&room_id).await?;

        let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
        let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
        let (_, pk1) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
        let (_, pk2) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());

        let invitation = GroupInvitation {
            signers: BTreeSet::from([user1.clone(), user2.clone()]),
            threshold: 2,
            federation_invite_code: "test".to_string(),
            federation_name: "test".to_string(),
        };

        let event = MultispendEvent::GroupInvitation {
            invitation: invitation.clone(),
            proposer_pubkey: RpcPublicKey(pk1),
        };
        matrix1.send_multispend_event(&room_id, event).await?;

        matrix1.rescanner.wait_for_scanned(&room_id).await;
        matrix2.rescanner.wait_for_scanned(&room_id).await;

        let timeline = matrix1.timeline(&room_id).await?;
        let last_event = timeline.latest_event().await.unwrap();
        let invitation_event_id = RpcEventId(last_event.event_id().unwrap().to_string());

        let event_data1 = matrix1
            .get_multispend_event_data(RpcRoomId(room_id.to_string()), invitation_event_id.clone())
            .await?;

        assert_eq!(
            event_data1,
            Some(MsEventData::GroupInvitation(GroupInvitationWithKeys {
                invitation: invitation.clone(),
                pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
                rejections: BTreeSet::new(),
            }))
        );
        let event_data2 = retry(
            "wait for user2 to receive",
            aggressive_backoff(),
            || async {
                matrix2
                    .get_multispend_event_data(
                        RpcRoomId(room_id.to_string()),
                        invitation_event_id.clone(),
                    )
                    .await?
                    .context("event not found")
            },
        )
        .await?;
        assert_eq!(event_data1, Some(event_data2));

        let event = MultispendEvent::GroupInvitationVote {
            invitation: invitation_event_id.clone(),
            vote: MultispendGroupVoteType::Accept {
                member_pubkey: RpcPublicKey(pk2),
            },
        };
        matrix2.send_multispend_event(&room_id, event).await?;

        matrix1.rescanner.wait_for_scanned(&room_id).await;
        matrix2.rescanner.wait_for_scanned(&room_id).await;

        // Verify group is finalized in matrix1
        let final_group1 = retry(
            "wait for group to be finalized",
            aggressive_backoff(),
            || async {
                matrix1
                    .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
                    .await?
                    .context("finalized group not found")
            },
        )
        .await?;
        assert_eq!(
            final_group1,
            GroupInvitationWithKeys {
                invitation,
                pubkeys: BTreeMap::from_iter([
                    (user1.clone(), RpcPublicKey(pk1)),
                    (user2.clone(), RpcPublicKey(pk2))
                ]),
                rejections: BTreeSet::new(),
            }
        );

        // Verify group is finalized in matrix2 as well
        let final_group2 = matrix2
            .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
            .await?;

        assert_eq!(Some(final_group1), final_group2);
        Ok(())
    }

    #[ignore]
    #[tokio::test(flavor = "multi_thread")]
    async fn test_multispend_group_rejection() -> Result<()> {
        TracingSetup::default()
            .with_directive("fediffi=trace")
            .init()
            .ok();
        let (matrix1, _event_rx1, _temp_dir1) = mk_matrix_new_user().await?;
        let (matrix2, _event_rx2, _temp_dir2) = mk_matrix_new_user().await?;

        let room_id = matrix1
            .create_or_get_dm(matrix2.client.user_id().unwrap())
            .await?;
        matrix2.wait_for_room_id(&room_id).await?;
        matrix2.room_join(&room_id).await?;

        let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
        let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
        let (_, pk1) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());

        let invitation = GroupInvitation {
            signers: BTreeSet::from([user1.clone(), user2.clone()]),
            threshold: 2,
            federation_invite_code: "test".to_string(),
            federation_name: "test".to_string(),
        };

        let event = MultispendEvent::GroupInvitation {
            invitation: invitation.clone(),
            proposer_pubkey: RpcPublicKey(pk1),
        };
        matrix1.send_multispend_event(&room_id, event).await?;

        matrix1.rescanner.wait_for_scanned(&room_id).await;
        matrix2.rescanner.wait_for_scanned(&room_id).await;

        let timeline = matrix1.timeline(&room_id).await?;
        let last_event = timeline.latest_event().await.unwrap();
        let invitation_event_id = RpcEventId(last_event.event_id().unwrap().to_string());

        let event_data1 = matrix1
            .get_multispend_event_data(RpcRoomId(room_id.to_string()), invitation_event_id.clone())
            .await?;

        assert_eq!(
            event_data1,
            Some(MsEventData::GroupInvitation(GroupInvitationWithKeys {
                invitation: invitation.clone(),
                pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
                rejections: BTreeSet::new(),
            }))
        );

        let event_data2 = retry(
            "wait for user2 to receive",
            aggressive_backoff(),
            || async {
                matrix2
                    .get_multispend_event_data(
                        RpcRoomId(room_id.to_string()),
                        invitation_event_id.clone(),
                    )
                    .await?
                    .context("event not found")
            },
        )
        .await?;
        assert_eq!(event_data1, Some(event_data2));

        // Send rejection from user2
        let event = MultispendEvent::GroupInvitationVote {
            invitation: invitation_event_id.clone(),
            vote: MultispendGroupVoteType::Reject,
        };
        matrix2.send_multispend_event(&room_id, event).await?;

        matrix1.rescanner.wait_for_scanned(&room_id).await;
        matrix2.rescanner.wait_for_scanned(&room_id).await;

        // Verify invitation state has the rejection recorded
        let event_data1 = retry(
            "wait for rejection to be recorded",
            aggressive_backoff(),
            || async {
                let data = matrix1
                    .get_multispend_event_data(
                        RpcRoomId(room_id.to_string()),
                        invitation_event_id.clone(),
                    )
                    .await?
                    .unwrap();

                match &data {
                    MsEventData::GroupInvitation(group) if group.rejections.contains(&user2) => {
                        Ok(data)
                    }
                    _ => anyhow::bail!("Rejection not yet recorded"),
                }
            },
        )
        .await?;

        assert_eq!(
            event_data1,
            MsEventData::GroupInvitation(GroupInvitationWithKeys {
                invitation: invitation.clone(),
                pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
                rejections: BTreeSet::from([user2.clone()]),
            })
        );

        // Verify matrix2 has the same data
        let event_data2 = matrix2
            .get_multispend_event_data(RpcRoomId(room_id.to_string()), invitation_event_id)
            .await?;
        assert_eq!(Some(event_data1), event_data2);

        // Verify group is not finalized in matrix1
        let final_group1 = matrix1
            .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
            .await?;
        assert_eq!(final_group1, None);

        // Verify group is not finalized in matrix2 either
        let final_group2 = matrix2
            .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
            .await?;
        assert_eq!(final_group2, None);

        Ok(())
    }
}
