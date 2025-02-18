use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use fedimint_derive_secret::DerivableSecret;
use futures::StreamExt;
use matrix_sdk::attachment::{
    AttachmentConfig, AttachmentInfo, BaseFileInfo, BaseImageInfo, BaseVideoInfo,
};
use matrix_sdk::encryption::BackupDownloadStrategy;
use matrix_sdk::media::{MediaFormat, MediaRequest};
use matrix_sdk::notification_settings::NotificationSettings;
pub use matrix_sdk::ruma::api::client::account::register::v3 as register;
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
use matrix_sdk::ruma::events::message::TextContentBlock;
use matrix_sdk::ruma::events::poll::end::PollEndEventContent;
use matrix_sdk::ruma::events::poll::response::{PollResponseEventContent, SelectionsContentBlock};
use matrix_sdk::ruma::events::poll::start::{
    PollAnswer, PollAnswers, PollContentBlock, PollStartEventContent,
};
use matrix_sdk::ruma::events::receipt::ReceiptThread;
use matrix_sdk::ruma::events::room::encryption::RoomEncryptionEventContent;
use matrix_sdk::ruma::events::room::message::{
    MessageType, RoomMessageEventContent, RoomMessageEventContentWithoutRelation,
};
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use matrix_sdk::ruma::events::room::MediaSource;
use matrix_sdk::ruma::events::{AnySyncTimelineEvent, InitialStateEvent};
use matrix_sdk::ruma::{assign, EventId, OwnedMxcUri, RoomId, UInt, UserId};
use matrix_sdk::sliding_sync::Ranges;
use matrix_sdk::{Client, RoomInfo, RoomMemberships};
use matrix_sdk_ui::sync_service::{self, SyncService};
use matrix_sdk_ui::timeline::default_event_filter;
use matrix_sdk_ui::{room_list_service, RoomListService};
use mime::Mime;
use tracing::{error, info, warn};

use crate::bridge::BridgeRuntime;
use crate::error::ErrorCode;
use crate::observable::{Observable, ObservablePool, ObservableVec};
use crate::storage::AppState;
use crate::types::RpcMediaUploadParams;

mod types;
pub use types::*;

#[derive(Clone)]
pub struct Matrix {
    /// matrix client
    client: Client,
    /// sync service to load new messages
    sync_service: Arc<SyncService>,
    /// manages list of room visible to user.
    room_list_service: Arc<RoomListService>,
    pub runtime: Arc<BridgeRuntime>,
    notification_settings: NotificationSettings,
    pub observable_pool: ObservablePool,
}

impl Matrix {
    async fn build_client(
        base_dir: &Path,
        home_server: String,
        passphrase: &str,
    ) -> Result<Client> {
        let builder = Client::builder()
            .homeserver_url(home_server)
            // make backup and recovery automagically work.
            .with_encryption_settings(matrix_sdk::encryption::EncryptionSettings {
                auto_enable_cross_signing: true,
                backup_download_strategy: BackupDownloadStrategy::OneShot,
                auto_enable_backups: true,
            })
            .handle_refresh_tokens();
        #[cfg(not(target_family = "wasm"))]
        let builder = builder.sqlite_store(base_dir.join("db.sqlite"), Some(passphrase));
        #[cfg(target_family = "wasm")]
        let builder = builder.indexeddb_store("matrix-db", Some(passphrase));

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

        client.set_sliding_sync_proxy(Some(url::Url::parse(&sliding_sync_proxy)?));
        let sync_service = SyncService::builder(client.clone()).build().await?;
        let matrix = Self {
            notification_settings: client.notification_settings().await,
            client,
            room_list_service: sync_service.room_list_service(),
            sync_service: Arc::new(sync_service),
            observable_pool: ObservablePool::new(
                runtime.event_sink.clone(),
                runtime.task_group.clone(),
            ),
            runtime,
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
                        sync_service::State::Idle | sync_service::State::Running => {}
                    }
                    fedimint_core::task::sleep(Duration::from_millis(500)).await;
                }
            });

        let this = self.clone();
        self.runtime
            .task_group
            .spawn_cancellable("matrix::Recovery::enable", {
                async move {
                    // if there are no backups on server, enable backups
                    if this
                        .client
                        .encryption()
                        .backups()
                        .exists_on_server()
                        .await
                        .is_ok_and(|x| x)
                    {
                        return;
                    }
                    // enable auto backups with passphrase for e2e keys.
                    // TODO: subscribe to backup progress
                    this.client
                        .encryption()
                        .recovery()
                        .enable()
                        .with_passphrase(&encryption_passphrase)
                        .await
                        .inspect_err(|err| error!(%err, "unable to enable recovery (start backup)"))
                        .ok();
                }
            });
        let this = self.clone();
        // use session token changed stream to update the token in app state
        self.runtime
            .task_group
            .spawn_cancellable("matrix::session_token_changed", async move {
                let Some(mut session_token_changed) =
                    this.client.matrix_auth().session_tokens_stream()
                else {
                    return;
                };
                while let Some(token) = session_token_changed.next().await {
                    if let Err(err) = this
                        .runtime
                        .app_state
                        .with_write_lock(|w| {
                            if let Some(session) = w.matrix_session.as_mut() {
                                session.tokens = token;
                            }
                        })
                        .await
                    {
                        error!(%err, "unable to update session token");
                    }
                }
            });
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
                        a.matrix_session = Some(matrix_session);
                    })
                    .await?;
            }
            Some(_) => warn!("unknown session"),
            None => warn!("session not found after login"),
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

    pub async fn observable_cancel(&self, id: u64) -> Result<()> {
        self.observable_pool.observable_cancel(id).await
    }

    /// All chats in matrix are rooms, whether DM or group chats.
    pub async fn room_list(&self, observable_id: u64) -> Result<ObservableVec<RpcRoomListEntry>> {
        self.room_list_to_observable(observable_id, self.room_list_service.all_rooms().await?)
            .await
    }

    async fn room_list_to_observable(
        &self,
        observable_id: u64,
        list: room_list_service::RoomList,
    ) -> Result<Observable<imbl::Vector<RpcRoomListEntry>>> {
        let (initial, stream) = list.entries();
        self.observable_pool
            .make_observable_from_vec_diff_stream(observable_id, initial, stream)
            .await
    }

    pub async fn room_list_update_ranges(&self, ranges: Ranges) -> Result<()> {
        self.room_list_service
            .apply_input(room_list_service::Input::Viewport(ranges))
            .await?;
        Ok(())
    }

    /// Sync status is used to display "Waiting for network" indicator on
    /// frontend.
    ///
    /// We delay the events by 2 seconds to avoid flickering.
    pub async fn observe_sync_status(
        &self,
        observable_id: u64,
    ) -> Result<Observable<RpcSyncIndicator>> {
        self.observable_pool
            .make_observable_from_stream(
                observable_id,
                None,
                self.room_list_service
                    .sync_indicator(Duration::from_secs(2), Duration::from_secs(2)),
            )
            .await
    }

    async fn room(
        &self,
        room_id: &RoomId,
    ) -> Result<room_list_service::Room, room_list_service::Error> {
        self.room_list_service.room(room_id)
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
        let (initial, stream) = timeline.subscribe_batched().await;
        self.observable_pool
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
        self.observable_pool
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
        msgtype: String,
        body: String,
        data: serde_json::Map<String, serde_json::Value>,
    ) -> anyhow::Result<()> {
        let timeline = self.timeline(room_id).await?;
        timeline
            .send(
                RoomMessageEventContent::new(
                    MessageType::new(&msgtype, body, data).context(ErrorCode::BadRequest)?,
                )
                .into(),
            )
            .await?;
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
        self.observable_pool
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
            .room_power_levels()
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
        let result = self.client.media().upload(&mime, file).await?;
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
            .send(
                assign!(
                    get_message_events::v3::Request::new(
                        room_id.into(),
                        matrix_sdk::ruma::api::Direction::Forward,
                    ),
                    { limit: 50000u32.into() }
                ),
                None,
            )
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
        event_id: &EventId,
        new_content: String,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;
        let edit_info = timeline
            .edit_info_from_event_id(event_id)
            .await
            .context("failed to get edit info")?;

        let new_content = RoomMessageEventContentWithoutRelation::text_plain(new_content);

        timeline.edit(new_content, edit_info).await?;

        Ok(())
    }

    pub async fn delete_message(
        &self,
        room_id: &RoomId,
        event_id: &EventId,
        reason: Option<String>,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;
        let event = timeline
            .item_by_event_id(event_id)
            .await
            .ok_or_else(|| anyhow::anyhow!("Event not found"))?;

        timeline.redact(&event, reason.as_deref()).await?;

        Ok(())
    }

    pub async fn download_file(&self, source: MediaSource) -> Result<Vec<u8>> {
        let request = MediaRequest {
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
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;

        let poll_answers: PollAnswers = answers
            .into_iter()
            .enumerate()
            .map(|(i, text)| PollAnswer::new(i.to_string(), TextContentBlock::plain(text)))
            .collect::<Vec<_>>()
            .try_into()
            .map_err(|_| anyhow::anyhow!("Invalid number of poll answers"))?;

        let poll_content =
            PollContentBlock::new(TextContentBlock::plain(question.clone()), poll_answers);

        let content = PollStartEventContent::new(
            TextContentBlock::plain(format!("Poll: {}", question)),
            poll_content,
        );

        timeline.send(content.into()).await?;
        Ok(())
    }

    pub async fn end_poll(&self, room_id: &RoomId, poll_start_id: &EventId) -> Result<()> {
        let timeline = self.timeline(room_id).await?;

        let content =
            PollEndEventContent::with_plain_text("This poll has ended", poll_start_id.to_owned());

        timeline.send(content.into()).await?;
        Ok(())
    }

    pub async fn respond_to_poll(
        &self,
        room_id: &RoomId,
        poll_start_id: &EventId,
        selections: Vec<String>,
    ) -> Result<()> {
        let timeline = self.timeline(room_id).await?;

        let selections_content = SelectionsContentBlock::from(selections);

        let content = PollResponseEventContent::new(selections_content, poll_start_id.to_owned());

        timeline.send(content.into()).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;
    use std::sync::atomic::{AtomicU64, Ordering};

    use fedimint_bip39::Bip39RootSecretStrategy;
    use fedimint_client::secret::RootSecretStrategy as _;
    use fedimint_derive_secret::ChildId;
    use fedimint_logging::TracingSetup;
    use rand::{thread_rng, Rng};
    use tempfile::TempDir;
    use tokio::sync::mpsc;
    use tracing::info;

    use super::*;
    use crate::constants::MATRIX_CHILD_ID;
    use crate::event::IEventSink;
    use crate::features::{FeatureCatalog, RuntimeEnvironment};
    use crate::ffi::PathBasedStorage;
    use crate::rpc::tests::MockFediApi;

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
}
