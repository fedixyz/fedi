use std::collections::{HashMap, hash_map};
use std::path::Path;
use std::pin::pin;
use std::sync::{Arc, Weak};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use async_stream::stream;
use fedimint_derive_secret::DerivableSecret;
use futures::{Stream, StreamExt, stream};
use matrix_sdk::attachment::{
    AttachmentConfig, AttachmentInfo, BaseFileInfo, BaseImageInfo, BaseVideoInfo,
};
use matrix_sdk::encryption::BackupDownloadStrategy;
use matrix_sdk::encryption::recovery::RecoveryState;
use matrix_sdk::media::{MediaFormat, MediaRequestParameters};
use matrix_sdk::notification_settings::NotificationSettings;
use matrix_sdk::room::Room;
use matrix_sdk::room::edit::EditedContent;
use matrix_sdk::room::reply::{EnforceThread, Reply};
pub use matrix_sdk::ruma::api::client::account::register::v3 as register;
use matrix_sdk::ruma::api::client::authenticated_media::get_media_preview;
use matrix_sdk::ruma::api::client::directory::get_public_rooms_filtered::v3 as get_public_rooms_filtered;
use matrix_sdk::ruma::api::client::message::get_message_events;
use matrix_sdk::ruma::api::client::profile::get_profile;
use matrix_sdk::ruma::api::client::push::Pusher;
use matrix_sdk::ruma::api::client::receipt::create_receipt::v3::ReceiptType;
use matrix_sdk::ruma::api::client::room::Visibility;
pub use matrix_sdk::ruma::api::client::room::create_room::v3 as create_room;
use matrix_sdk::ruma::api::client::state::send_state_event;
use matrix_sdk::ruma::api::client::uiaa;
use matrix_sdk::ruma::events::poll::start::PollKind;
use matrix_sdk::ruma::events::poll::unstable_end::UnstablePollEndEventContent;
use matrix_sdk::ruma::events::poll::unstable_response::UnstablePollResponseEventContent;
use matrix_sdk::ruma::events::poll::unstable_start::{
    NewUnstablePollStartEventContent, UnstablePollAnswer, UnstablePollAnswers,
    UnstablePollStartContentBlock,
};
use matrix_sdk::ruma::events::room::MediaSource;
use matrix_sdk::ruma::events::room::encryption::RoomEncryptionEventContent;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContentWithoutRelation;
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use matrix_sdk::ruma::events::{
    AnyMessageLikeEventContent, AnySyncTimelineEvent, InitialStateEvent,
};
use matrix_sdk::ruma::{EventId, OwnedMxcUri, OwnedRoomId, RoomId, UInt, UserId, assign};
use matrix_sdk::{Client, RoomMemberships, SessionChange};
use matrix_sdk_ui::eyeball_im::VectorDiff;
use matrix_sdk_ui::sync_service::{self, SyncService};
use matrix_sdk_ui::timeline::{RoomExt, TimelineEventItemId, default_event_filter};
use matrix_sdk_ui::{Timeline, room_list_service};
use mime::Mime;
use rpc_types::RpcMediaUploadParams;
use rpc_types::error::ErrorCode;
pub use rpc_types::matrix::*;
use runtime::bridge_runtime::Runtime;
use runtime::storage::AppState;
use tokio::sync::{Mutex, broadcast, watch};
use tracing::{error, info, warn};
pub use types::{RpcMentions, SendMessageData};

mod types;

pub struct Matrix {
    /// matrix client
    pub client: Client,
    /// sync service to load new messages
    sync_service: SyncService,
    pub runtime: Arc<Runtime>,
    notification_settings: NotificationSettings,
    pub timelines: Mutex<HashMap<OwnedRoomId, Weak<Timeline>>>,
}

impl Matrix {
    async fn build_client(
        base_dir: &Path,
        home_server: String,
        passphrase: &str,
    ) -> Result<Client> {
        let builder = Client::builder()
            .sliding_sync_version_builder(matrix_sdk::sliding_sync::VersionBuilder::Native)
            .homeserver_url(home_server)
            // make backup and recovery automagically work.
            .with_encryption_settings(matrix_sdk::encryption::EncryptionSettings {
                auto_enable_cross_signing: true,
                backup_download_strategy: BackupDownloadStrategy::AfterDecryptionFailure,
                auto_enable_backups: true,
            })
            .handle_refresh_tokens();
        #[cfg(not(target_family = "wasm"))]
        let builder =
            builder.sqlite_store(base_dir.join("db-native-sync.sqlite"), Some(passphrase));

        // v2 to avoid reusing the old matrix db for new redb pwa
        #[cfg(target_family = "wasm")]
        let builder = builder.indexeddb_store("matrix-db-native-sync-v2", Some(passphrase));

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
    #[allow(clippy::too_many_arguments)]
    pub async fn init(
        runtime: Arc<Runtime>,
        base_dir: &Path,
        matrix_secret: &DerivableSecret,
        user_name: &str,
        home_server: String,
        status_sender: &watch::Sender<MatrixInitializeStatus>,
    ) -> Result<Arc<Self>> {
        let matrix_session = runtime
            .app_state
            .with_read_lock(|r| r.matrix_session.clone())
            .await;
        let user_password = &Self::home_server_password(matrix_secret, &home_server);
        let encryption_passphrase = Self::encryption_passphrase(matrix_secret);
        let client = Self::build_client(base_dir, home_server, &encryption_passphrase).await?;

        if let Some(session) = matrix_session {
            client.restore_session(session).await?;
        } else {
            status_sender.send_replace(MatrixInitializeStatus::LoggingIn);
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
            timelines: Default::default(),
        });

        let encryption_passphrase = Self::encryption_passphrase(matrix_secret);
        matrix.start_background_tasks(encryption_passphrase);
        Ok(matrix)
    }

    // start sync messages from server
    pub fn start_syncing(self: &Arc<Self>) {
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
    }

    pub fn start_background_tasks(self: &Arc<Self>, encryption_passphrase: String) {
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
            Self::handle_session_tokens_updated(self.client.clone(), self.runtime.clone()),
        );
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
                        a.matrix_session = Some(matrix_session);
                    })
                    .await?;
            }
            Some(_) => warn!("unknown session"),
            None => warn!("session not found after login"),
        }
        Ok(())
    }

    async fn handle_session_tokens_updated(client: Client, runtime: Arc<Runtime>) {
        let mut changes = client.subscribe_to_session_changes();
        loop {
            match changes.recv().await {
                Ok(SessionChange::TokensRefreshed) => (),
                Ok(SessionChange::UnknownToken { .. }) => {
                    warn!("unknown session token");
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    error!("unexpected session close");
                    break;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    warn!("session token changes lagged");
                    continue;
                }
            }
            runtime
                .app_state
                .with_write_lock(|s| {
                    if let Some(value) = &mut s.matrix_session {
                        let Some(session_tokens) = client.session_tokens() else {
                            warn!("session tokens not present after refresh");
                            return;
                        };
                        value.tokens = session_tokens;
                    }
                })
                .await
                .inspect_err(|err| {
                    warn!(?err, "failed to save matrix tokens");
                })
                .ok();
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

    /// All chats in matrix are rooms, whether DM or group chats.
    pub async fn room_list(&self) -> impl Stream<Item = Vec<VectorDiff<RpcRoomId>>> + use<> {
        const PAGE_SIZE: usize = 1000;
        // manual construction required to to have correct lifetimes
        let room_list_service = self.sync_service.room_list_service();

        stream! {
            let list = room_list_service.all_rooms().await.unwrap();
            let (entries_stream, controller) = list.entries_with_dynamic_adapters(PAGE_SIZE);
            // setting filter is required to start the controller - so we use no op filter
            controller.set_filter(Box::new(|_| true));

            let mut stream = pin!(entries_stream);
            while let Some(diffs) = stream.next().await {
                yield diffs
                    .into_iter()
                    .map(|diff| diff.map(|x| RpcRoomId::from(x.room_id().to_owned())))
                    .collect();
            }
        }
    }

    /// Sync status is used to display "Waiting for network" indicator on
    /// frontend.
    pub fn subscribe_sync_status(&self) -> impl Stream<Item = RpcSyncIndicator> + use<> {
        let mut sub = self.sync_service.state();
        sub.reset();
        sub.map(|x| match x {
            sync_service::State::Offline
            | sync_service::State::Error
            | sync_service::State::Idle
            | sync_service::State::Terminated => RpcSyncIndicator::Show,
            sync_service::State::Running => RpcSyncIndicator::Hide,
        })
    }

    pub async fn room(&self, room_id: &RoomId) -> Result<Room, room_list_service::Error> {
        self.sync_service.room_list_service().room(room_id)
    }

    /// See [`matrix_sdk_ui::Timeline`].
    pub async fn build_timeline(room: &Room) -> anyhow::Result<matrix_sdk_ui::Timeline> {
        Ok(room
            .timeline_builder()
            .event_filter(|event, version| match event {
                AnySyncTimelineEvent::MessageLike(
                    matrix_sdk::ruma::events::AnySyncMessageLikeEvent::RoomMessage(msg),
                ) if msg
                    .as_original()
                    .is_some_and(|o| o.content.msgtype.msgtype().starts_with("xyz.fedi")) =>
                {
                    true
                }
                _ => default_event_filter(event, version),
            })
            .build()
            .await?)
    }

    pub async fn timeline(&self, room_id: &RoomId) -> anyhow::Result<Arc<Timeline>> {
        let room = self.room(room_id).await?;
        let mut timelines = self.timelines.lock().await;
        match timelines.entry(room_id.to_owned()) {
            hash_map::Entry::Occupied(mut o) => {
                if let Some(timeline) = o.get().upgrade() {
                    Ok(timeline)
                } else {
                    let timeline = Arc::new(Self::build_timeline(&room).await?);
                    o.insert(Arc::downgrade(&timeline));
                    Ok(timeline)
                }
            }
            hash_map::Entry::Vacant(v) => {
                let timeline = Arc::new(Self::build_timeline(&room).await?);
                v.insert(Arc::downgrade(&timeline));
                Ok(timeline)
            }
        }
    }

    pub async fn room_timeline_items(
        &self,
        room_id: &RoomId,
    ) -> Result<impl Stream<Item = Vec<VectorDiff<RpcTimelineItem>>> + use<>> {
        let timeline = self.timeline(room_id).await?;
        let (initial, stream) = timeline.subscribe().await;
        let stream = stream! {
            // First emit the initial vector
            yield vec![VectorDiff::Reset { values:
                initial.into_iter().map(RpcTimelineItem::from).collect()
            }];

            // Then emit updates as diffs
            let mut stream = pin!(stream);
            while let Some(diffs) = stream.next().await {
                yield diffs.into_iter().map(|diff| diff.map(RpcTimelineItem::from)).collect();
            }
        };
        Ok(hold_my_timeline(timeline, stream))
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

    pub async fn subscribe_timeline_items_paginate_backwards_status(
        &self,
        room_id: &RoomId,
    ) -> Result<impl Stream<Item = RpcBackPaginationStatus> + use<>> {
        let timeline = self.timeline(room_id).await?;
        let (current, stream) = timeline
            .live_back_pagination_status()
            .await
            .context("we only have live rooms")?;
        Ok(hold_my_timeline(
            timeline,
            stream::iter([current]).chain(stream).map(Into::into),
        ))
    }

    pub async fn send_message(
        &self,
        room_id: &RoomId,
        data: SendMessageData,
    ) -> anyhow::Result<()> {
        let timeline = self.timeline(room_id).await?;
        timeline
            .send(
                RoomMessageEventContentWithoutRelation::try_from(data)?
                    .with_relation(None)
                    .into(),
            )
            .await?;
        Ok(())
    }

    /// Send a reply to a specific message in a room
    pub async fn send_reply(
        &self,
        room_id: &RoomId,
        reply_to_event_id: &EventId,
        data: SendMessageData,
    ) -> anyhow::Result<()> {
        let timeline = self.timeline(room_id).await?;
        timeline
            .send_reply(
                data.try_into()?,
                Reply {
                    event_id: reply_to_event_id.to_owned(),
                    enforce_thread: EnforceThread::MaybeThreaded,
                },
            )
            .await?;
        Ok(())
    }

    /// After creating a room, it takes some time to show up in the list.
    pub async fn wait_for_room_id(&self, room_id: &RoomId) -> Result<()> {
        fedimint_core::task::timeout(Duration::from_secs(20), async {
            loop {
                match self.room(room_id).await {
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
            request.initial_state = vec![
                InitialStateEvent::new(RoomEncryptionEventContent::with_recommended_defaults())
                    .to_raw_any(),
            ];
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
        self.room(room_id).await?.join().await?;
        Ok(())
    }

    // Only works for left and invited rooms
    pub async fn room_join_public(&self, room_id: &RoomId) -> Result<()> {
        self.client.join_room_by_id(room_id).await?;
        Ok(())
    }

    // Only works for left and invited rooms
    pub async fn room_leave(&self, room_id: &RoomId) -> Result<()> {
        self.room(room_id).await?.leave().await?;
        Ok(())
    }

    pub async fn subscribe_room_info(
        &self,
        room_id: &RoomId,
    ) -> Result<impl Stream<Item = RpcSerializedRoomInfo> + use<>> {
        let room = self.room(room_id).await?;
        let mut sub = room.subscribe_info();
        // yield first item immediately
        sub.reset();
        Ok(sub.then(move |info| {
            let room = room.clone();
            async move { RpcSerializedRoomInfo::from_room_and_info(&room, &info).await }
        }))
    }

    pub async fn room_invite_user_by_id(&self, room_id: &RoomId, user_id: &UserId) -> Result<()> {
        self.room(room_id).await?.invite_user_by_id(user_id).await?;
        Ok(())
    }

    pub async fn room_get_power_levels(
        &self,
        room_id: &RoomId,
    ) -> Result<RoomPowerLevelsEventContent> {
        Ok(self.room(room_id).await?.power_levels().await?.into())
    }

    pub async fn room_change_power_levels(
        &self,
        room_id: &RoomId,
        new: RoomPowerLevelsEventContent,
    ) -> Result<()> {
        self.room(room_id).await?.send_state_event(new).await?;
        Ok(())
    }

    pub async fn room_set_name(
        &self,
        room_id: &RoomId,
        name: String,
    ) -> Result<send_state_event::v3::Response> {
        Ok(self.room(room_id).await?.set_name(name).await?)
    }

    pub async fn room_set_topic(
        &self,
        room_id: &RoomId,
        topic: String,
    ) -> Result<send_state_event::v3::Response> {
        Ok(self.room(room_id).await?.set_room_topic(&topic).await?)
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
                event_id.parse().context(ErrorCode::BadRequest)?,
            )
            .await?)
    }

    pub async fn public_room_info(&self, room_id: &str) -> Result<RpcPublicRoomInfo> {
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
        let room = response
            .chunk
            .first()
            .context("public room not found")?
            .clone();
        Ok(RpcPublicRoomInfo {
            id: room.room_id.to_string(),
            name: room.name.clone(),
            avatar_url: room.avatar_url.as_ref().map(|url| url.to_string()),
            joined_member_count: room.num_joined_members.into(),
        })
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
        self.room(room_id).await?.set_unread_flag(unread).await?;
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
        new_data: SendMessageData,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;

        timeline
            .edit(item_id, EditedContent::RoomMessage(new_data.try_into()?))
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
            .get_media_content(&request, true)
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
}

/// because we only store Weak<Timeline> in Matrix::timelines
/// we need to hold on the Arc<Timeline> while we are streaming.
///
/// NOTE: timeline still exists (because it is Timeline has internal Arc) we
/// just can't access it through our timelines store.
///
/// Example if we don't hold the Arc<Timeline>:
///
/// -> observeTimelineItems("xxx")
///  - create Arc1<Arc2<TimelineInner>
///  - store Weak1<Arc2<TimelineInner> in timelines field
///  - create the stream (stream references Arc2<TimelineInner>)
///  - drop(Arc1<Arc2<TimelineInner>>) (on function return)
///  - Weak1<Arc2<TimelineInner>> is now dead (because all Arc1 got dropped)
///
/// -> paginateBackwards("xxx")
///  - creates a new timeline and original timeline is unaffected, so will be
///    noop
///
/// in ideal version frontend would manage lifetime of Timeline and have special
/// rpc for drop timeline. but we can't trust frontend.
fn hold_my_timeline<T>(
    timeline: Arc<Timeline>,
    stream: impl Stream<Item = T>,
) -> impl Stream<Item = T> {
    stream.map(move |x| {
        let _capture = &timeline;
        x
    })
}
