use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use eyeball::Subscriber;
use fedimint_core::task::{MaybeSend, MaybeSync, TaskGroup};
use fedimint_derive_secret::DerivableSecret;
use futures::{Future, StreamExt};
use matrix_sdk::encryption::BackupDownloadStrategy;
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
use matrix_sdk::ruma::events::receipt::ReceiptThread;
use matrix_sdk::ruma::events::room::encryption::RoomEncryptionEventContent;
use matrix_sdk::ruma::events::room::message::{MessageType, RoomMessageEventContent};
use matrix_sdk::ruma::events::room::power_levels::RoomPowerLevelsEventContent;
use matrix_sdk::ruma::events::{AnySyncTimelineEvent, InitialStateEvent};
use matrix_sdk::ruma::{assign, OwnedMxcUri, RoomId, UserId};
use matrix_sdk::sliding_sync::Ranges;
use matrix_sdk::{Client, RoomInfo, RoomMemberships};
use matrix_sdk_ui::sync_service::{self, SyncService};
use matrix_sdk_ui::timeline::default_event_filter;
use matrix_sdk_ui::{room_list_service, RoomListService};
use mime::Mime;
use serde::Serialize;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

use crate::error::ErrorCode;
use crate::event::{EventSink, TypedEventExt};
use crate::observable::{Observable, ObservableUpdate, ObservableVec, ObservableVecUpdate};
use crate::storage::AppState;

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
    event_sink: EventSink,
    task_group: TaskGroup,
    notification_settings: NotificationSettings,
    /// list of active observables
    observables: Arc<Mutex<HashMap<u64, TaskGroup>>>,
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
        event_sink: EventSink,
        task_group: TaskGroup,
        base_dir: &Path,
        matrix_secret: &DerivableSecret,
        user_name: &str,
        home_server: String,
        sliding_sync_proxy: String,
        app_state: Arc<AppState>,
    ) -> Result<Self> {
        let matrix_session = app_state.with_read_lock(|r| r.matrix_session.clone()).await;
        let user_password = &Self::home_server_password(matrix_secret, &home_server);
        let encryption_passphrase = Self::encryption_passphrase(matrix_secret);
        let client = Self::build_client(base_dir, home_server, &encryption_passphrase).await?;

        if let Some(session) = matrix_session {
            client.restore_session(session).await?;
        } else {
            Self::login_or_register(&client, user_name, user_password, matrix_secret, &app_state)
                .await?;
        };

        client.set_sliding_sync_proxy(Some(url::Url::parse(&sliding_sync_proxy)?));
        let sync_service = SyncService::builder(client.clone()).build().await?;
        let matrix = Self {
            notification_settings: client.notification_settings().await,
            client,
            room_list_service: sync_service.room_list_service(),
            sync_service: Arc::new(sync_service),
            event_sink,
            task_group,
            observables: Default::default(),
        };
        let encryption_passphrase = Self::encryption_passphrase(matrix_secret);
        matrix
            .start_background(encryption_passphrase, app_state)
            .await?;
        Ok(matrix)
    }

    pub async fn start_background(
        &self,
        encryption_passphrase: String,
        app_state: Arc<AppState>,
    ) -> Result<()> {
        let this = self.clone();
        self.task_group
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
        self.task_group
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
        self.task_group
            .spawn_cancellable("matrix::session_token_changed", async move {
                let Some(mut session_token_changed) =
                    this.client.matrix_auth().session_tokens_stream()
                else {
                    return;
                };
                while let Some(token) = session_token_changed.next().await {
                    if let Err(err) = app_state
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
                request.initial_device_display_name =
                    app_state.device_identifier().await.map(|id| id.to_string());
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

    /// make observable with `initial` value and run `func` in a task group.
    /// `func` can send observable updates.
    pub async fn make_observable<T, Fut>(
        &self,
        initial: T,
        func: impl FnOnce(Self, u64) -> Fut + MaybeSend + 'static,
    ) -> Result<Observable<T>>
    where
        T: 'static,
        Fut: Future<Output = Result<()>> + MaybeSend + MaybeSync + 'static,
    {
        static OBSERVABLE_ID: AtomicU64 = AtomicU64::new(0);
        let id = OBSERVABLE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let observable = Observable::new(id, initial);
        let tg = self.task_group.make_subgroup().await;
        {
            let mut observables = self.observables.lock().await;
            observables.insert(id, tg.clone());
            // should be independent of number of rooms and number of messages
            const OBSERVABLE_WARN_LIMIT: usize = 20;
            let observable_counts = observables.len();
            if OBSERVABLE_WARN_LIMIT < observable_counts {
                warn!(%observable_counts, "frontend is using too many observabes, likely forgot to unsubscribe");
            }
        };
        let this = self.clone();
        tg.spawn_cancellable(
            format!("observable type={}", std::any::type_name::<T>()),
            func(this, id),
        );
        Ok(observable)
    }

    /// Convert eyeball::Subscriber to rpc Observable type.
    pub async fn make_observable_from_subscriber<T>(
        &self,
        mut sub: Subscriber<T>,
    ) -> Result<Observable<T>>
    where
        T: std::fmt::Debug + Clone + Serialize + MaybeSend + MaybeSync + 'static,
    {
        self.make_observable(sub.get(), move |this, id| async move {
            let mut update_index = 0;
            while let Some(value) = sub.next().await {
                this.send_observable_update(ObservableUpdate::new(id, update_index, value))
                    .await;
                update_index += 1;
            }
            Ok(())
        })
        .await
    }

    pub async fn observable_cancel(&self, id: u64) -> Result<()> {
        let Some(tg) = self.observables.lock().await.remove(&id) else {
            bail!(ErrorCode::UnknownObservable);
        };
        tg.shutdown_join_all(None).await?;
        Ok(())
    }

    pub async fn send_observable_update<T: Clone + Serialize + std::fmt::Debug>(
        &self,
        event: ObservableUpdate<T>,
    ) {
        self.event_sink.observable_update(event);
    }

    /// All chats in matrix are rooms, whether DM or group chats.
    pub async fn room_list(&self) -> Result<ObservableVec<RpcRoomListEntry>> {
        self.room_list_to_observable(self.room_list_service.all_rooms().await?)
            .await
    }

    async fn room_list_to_observable(
        &self,
        list: room_list_service::RoomList,
    ) -> Result<Observable<imbl::Vector<RpcRoomListEntry>>> {
        let (initial, mut stream) = list.entries();
        self.make_observable(
            initial.into_iter().map(RpcRoomListEntry::from).collect(),
            move |this, id| async move {
                let mut update_index = 0;
                while let Some(diffs) = stream.next().await {
                    this.send_observable_update(
                        ObservableVecUpdate::<RpcRoomListEntry>::new_diffs(
                            id,
                            update_index,
                            diffs
                                .into_iter()
                                .map(|x| x.map(RpcRoomListEntry::from))
                                .collect(),
                        ),
                    )
                    .await;
                    update_index += 1;
                }
                Ok(())
            },
        )
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
    pub async fn observe_sync_status(&self) -> Result<Observable<RpcSyncIndicator>> {
        let mut stream = Box::pin(
            self.room_list_service
                .sync_indicator(Duration::from_secs(2), Duration::from_secs(2)),
        );
        // first item is emitted immediately
        self.make_observable(
            stream
                .next()
                .await
                .map(|x| x.into())
                .context("first element not found in stream")?,
            |this, id| async move {
                let mut index = 0;
                while let Some(item) = stream.next().await {
                    info!("matrix sync status: {item:?}");
                    this.send_observable_update(ObservableUpdate::new(
                        id,
                        index,
                        RpcSyncIndicator::from(item),
                    ))
                    .await;
                    index += 1;
                }
                Ok(())
            },
        )
        .await
    }

    async fn room(&self, room_id: &RoomId) -> Result<room_list_service::Room, anyhow::Error> {
        Ok(self.room_list_service.room(room_id)?)
    }

    /// See [`matrix_sdk_ui::Timeline`].
    async fn timeline(&self, room_id: &RoomId) -> Result<Arc<matrix_sdk_ui::Timeline>> {
        let room = self.room(room_id).await?;
        if !room.is_timeline_initialized() {
            room.init_timeline_with_builder(
                room.default_room_timeline_builder()
                    .await?
                    .event_filter(|event, version| match event {
                        AnySyncTimelineEvent::MessageLike(
                            matrix_sdk::ruma::events::AnySyncMessageLikeEvent::RoomMessage(msg),
                        ) if msg.as_original().map_or(false, |o| {
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
        room_id: &RoomId,
    ) -> Result<ObservableVec<RpcTimelineItem>> {
        let timeline = self.timeline(room_id).await?;
        let (initial, mut stream) = timeline.subscribe_batched().await;
        self.make_observable(
            initial
                .into_iter()
                .map(RpcTimelineItem::from_timeline_item)
                .collect(),
            move |this, id| async move {
                let mut update_index = 0;
                while let Some(diffs) = stream.next().await {
                    this.send_observable_update(ObservableVecUpdate::new_diffs(
                        id,
                        update_index,
                        diffs
                            .into_iter()
                            .map(|x| x.map(RpcTimelineItem::from_timeline_item))
                            .collect(),
                    ))
                    .await;
                    update_index += 1;
                }
                Ok(())
            },
        )
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
        room_id: &RoomId,
    ) -> Result<Observable<RpcBackPaginationStatus>> {
        let timeline = self.timeline(room_id).await?;
        let (current, stream) = timeline
            .live_back_pagination_status()
            .await
            .context("we only have live rooms")?;
        self.make_observable(
            RpcBackPaginationStatus::from(current),
            move |this, id| async move {
                let mut stream = std::pin::pin!(stream);
                let mut update_index = 0;
                while let Some(value) = stream.next().await {
                    this.send_observable_update(ObservableUpdate::new(
                        id,
                        update_index,
                        RpcBackPaginationStatus::from(value),
                    ))
                    .await;
                    update_index += 1;
                }
                Ok(())
            },
        )
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
                match self.room_list_service.room(room_id) {
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

    pub async fn room_observe_info(&self, room_id: &RoomId) -> Result<Observable<RoomInfo>> {
        let sub = self.room(room_id).await?.inner_room().subscribe_info();
        self.make_observable_from_subscriber(sub).await
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

    pub async fn set_display_name(&self, display_name: String, app_state: &AppState) -> Result<()> {
        self.client
            .account()
            .set_display_name(Some(&display_name))
            .await?;
        app_state
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
}

#[cfg(test)]
mod tests {
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
    use crate::ffi::PathBasedStorage;

    const TEST_HOME_SERVER: &str = "matrix-synapse-homeserver2.dev.fedibtc.com";
    const TEST_SLIDING_SYNC: &str = "https://sliding.matrix-synapse-homeserver2.dev.fedibtc.com";

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
        let tg = TaskGroup::new();
        let tmp_dir = TempDir::new()?;
        let storage = PathBasedStorage::new(tmp_dir.as_ref().to_path_buf()).await?;
        let matrix = Matrix::init(
            event_sink,
            tg,
            tmp_dir.as_ref(),
            secret,
            user_name,
            format!("https://{TEST_HOME_SERVER}"),
            TEST_SLIDING_SYNC.to_string(),
            Arc::new(AppState::load(Arc::new(storage)).await?),
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
        let items1 = matrix1.room_timeline_items(&room_id).await?;
        let items2 = matrix2.room_timeline_items(&room_id).await?;
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
        let initial_item = matrix1_new.room_timeline_items(&room_id).await?;
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
}
