//! # Matrix Room Rescanner Service
//!
//! This module provides functionality for scanning Matrix rooms to multispend
//! events and storing them in easy to query database.

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::iter;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use async_stream::stream;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::util::backoff_util::background_backoff;
use futures::{stream, Stream, StreamExt, TryStreamExt};
use matrix_sdk::crypto::types::events::UtdCause;
use matrix_sdk::deserialized_responses::{TimelineEvent, TimelineEventKind};
use matrix_sdk::event_cache::EventCacheError;
use matrix_sdk::locks::RwLock;
use matrix_sdk::ruma::events::{
    AnySyncMessageLikeEvent, AnySyncTimelineEvent, SyncMessageLikeEvent,
};
use matrix_sdk::ruma::{OwnedEventId, OwnedRoomId, RoomId};
use matrix_sdk::{Client, Room};
use rpc_types::RpcEventId;
use runtime::bridge_runtime::Runtime;
use tokio::sync::Notify;
use tracing::{debug, error, info, instrument, warn};

use super::db::MultispendScannerLastEventKey;
use super::services::MultispendServices;
use super::{MultispendContext, MultispendEvent, RpcRoomId, RpcUserId, MULTISPEND_MSGTYPE};

/// Represents the current state of a room rescan operation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoomRescanState {
    /// No rescan is currently scheduled or running
    Idle,
    /// A rescan has been requested but not yet started.
    Queued,
    /// A rescan is currently in progress
    Running,
}

/// Manages room rescanning operations
pub struct RoomRescannerManager {
    client: Client,
    /// Maps room IDs to their state sender channels.
    /// see methods for explaination.
    rescan_states: RwLock<HashMap<OwnedRoomId, Arc<MultispendRoom>>>,
    new_room_notify: Notify,
    /// Reference to the bridge runtime for spawning tasks
    runtime: Arc<Runtime>,
    multispend_services: Arc<MultispendServices>,
}

struct MultispendRoom {
    state: RwLock<RoomRescanState>,
    /// triggered every time state transitions to queued
    task_wakeup: Notify,
    /// triggered every time state transitions to idle
    idle_notify: Notify,
    // notification for refreshing balance of multispend account
    account_info_refresh: Notify,
}

impl RoomRescannerManager {
    /// Creates a new RoomRescannerManager
    pub fn new(
        client: Client,
        runtime: Arc<Runtime>,
        multispend_services: Arc<MultispendServices>,
    ) -> Self {
        Self {
            client,
            rescan_states: RwLock::new(HashMap::new()),
            new_room_notify: Notify::new(),
            runtime,
            multispend_services,
        }
    }

    /// Wait for any rescan operations to complete for this room
    /// Queues a rescan if this room was not scanned in this run.
    pub async fn wait_for_scanned(self: &Arc<Self>, room_id: &RoomId) {
        let never_scanned = { !self.rescan_states.read().contains_key(room_id) };
        if never_scanned {
            self.queue_rescan(room_id);
        }
        let room_state = {
            self.rescan_states
                .read()
                .get(room_id)
                .expect("queue inserts the state")
                .clone()
        };
        let notification = room_state.idle_notify.notified();
        if *room_state.state.read() != RoomRescanState::Idle {
            // Just wait for idle state, the background task will notify us when done.
            notification.await
        }
    }

    async fn wait_for_room(&self, room_id: &RoomId) -> Arc<MultispendRoom> {
        loop {
            let new_room_notification = self.new_room_notify.notified();
            if let Some(room_state) = self.rescan_states.read().get(room_id) {
                break room_state.clone();
            }
            // no service running for this room, wait for someone to call queue_rescan
            new_room_notification.await;
        }
    }

    /// A stream that yields items whenever a scan for this room completes.
    pub fn scan_complete_stream<'a>(&'a self, room_id: &'a RoomId) -> impl Stream<Item = ()> + 'a {
        stream! {
            let room_state = self.wait_for_room(room_id).await;
            loop {
                // note: subscribe before yielding
                let notify = room_state.idle_notify.notified();
                yield ();
                notify.await
            }
        }
    }

    /// A stream that yields items whenever a scan for this room completes.
    pub fn subscribe_to_account_info_refresh<'a>(
        &'a self,
        room_id: &'a RoomId,
    ) -> impl Stream<Item = ()> + 'a {
        stream! {
            let room_state = self.wait_for_room(room_id).await;
            loop {
                // note: subscribe before yielding
                let notify = room_state.account_info_refresh.notified();
                yield ();
                notify.await
            }
        }
    }

    /// Queues a room for rescanning
    // Just sets the room state to `Queued` and background service will eventually
    // completes.
    pub fn queue_rescan(self: &Arc<Self>, room_id: &RoomId) {
        let mut states = self.rescan_states.write();
        match states.entry(room_id.to_owned()) {
            // if task was running, just update the state, the task will pick this up.
            Entry::Occupied(room_state) => {
                *room_state.get().state.write() = RoomRescanState::Queued;
                room_state.get().task_wakeup.notify_one();
            }
            Entry::Vacant(v) => {
                // if no task is running for this room, we need to start it.
                let room_state = Arc::new(MultispendRoom {
                    state: RwLock::new(RoomRescanState::Queued),
                    task_wakeup: Notify::new(),
                    idle_notify: Notify::new(),
                    account_info_refresh: Notify::new(),
                });
                v.insert(room_state.clone());
                drop(states);
                self.new_room_notify.notify_waiters();

                // Start background task using the runtime
                let room_id = room_id.to_owned();
                let this = self.clone();
                self.runtime.task_group.spawn_cancellable(
                    format!("room_rescanner::{room_id}"),
                    async move {
                        this.run_room_rescan_task(&room_id, &room_state).await;
                    },
                );
            }
        }

        debug!(?room_id, "Room rescan queued");
    }

    /// Background task that handles the actual room rescanning
    #[instrument(skip(self, room_state))]
    async fn run_room_rescan_task(&self, room_id: &RoomId, room_state: &MultispendRoom) {
        debug!("Started rescanning room task");
        loop {
            // Transition to running
            // this is mark for checking after the scanning if there was any rescans queued
            // while we were rescanning
            *room_state.state.write() = RoomRescanState::Running;

            info!(?room_id, "Started rescanning room");

            // Perform the rescanning
            let db = self.runtime.multispend_db();
            let mut dbtx = db.begin_transaction().await;

            let mut context = MultispendContext {
                check_pending_approved_withdrawal_requests: false,
                refresh_account_info: false,
                our_id: RpcUserId(
                    self.client
                        .user_id()
                        .expect("must be logged in before processing multispend events")
                        .to_string(),
                ),
            };
            if let Err(err) = self
                .process_multispend_events(room_id, &mut dbtx.to_ref_nc(), &mut context)
                .await
            {
                warn!(?err, ?room_id, "Error rescanning room");
            }

            dbtx.commit_tx().await;
            if context.check_pending_approved_withdrawal_requests {
                self.multispend_services
                    .withdrawal
                    .check_pending_approved_withdrawal_requests();
            }
            if context.refresh_account_info {
                room_state.account_info_refresh.notify_waiters();
            }
            info!("Room rescanning completed");

            // Only transition to idle if still in running state
            // this will be Queued state if a rescan was queued while this rescan was
            // running.
            {
                let mut lock = room_state.state.write();
                if *lock == RoomRescanState::Running {
                    *lock = RoomRescanState::Idle;
                    // notify all wait_for_idle()
                    room_state.idle_notify.notify_waiters();
                }
            }
            // wait for wakeup before next rescan.
            // this works because .notify_one() stores a permit inside if there is no active
            // listener
            room_state.task_wakeup.notified().await
        }
    }

    /// Reads the timeline events in the given room and, for each multispend
    /// event, runs multispend::process_event_db to update the database
    /// state.
    async fn process_multispend_events(
        &self,
        room_id: &RoomId,
        dbtx: &mut DatabaseTransaction<'_>,
        context: &mut MultispendContext,
    ) -> anyhow::Result<()> {
        let room = self
            .client
            .get_room(room_id)
            .context("room doesn't exist")?;
        // we maintain what event was last scanned by this process. this makes process
        // incremental. even if this called multispend, the subsequent calls will be
        // fast and noop if there are no event.
        //
        // note: last_scan_event_id can be non multispend event.
        let last_scan_event_id: Option<RpcEventId> = dbtx
            .get_value(&MultispendScannerLastEventKey(RpcRoomId(
                room_id.to_string(),
            )))
            .await;

        info!(?last_scan_event_id);
        // find all events since our last seen event, first time this will scan the
        // entire* room history.
        // * see hack bellow in all_message_since.
        let events_to_process =
            all_message_since_retry_decryption(&room, last_scan_event_id).await?;

        let event_ids_found = events_to_process
            .iter()
            .map(|e| e.event_id())
            .collect::<Vec<_>>();

        info!(?event_ids_found);

        let new_latest_event_id = events_to_process
            .iter()
            .rev()
            .find_map(|e| e.event_id())
            .map(|event_id| RpcEventId(event_id.to_string()));

        info!(?new_latest_event_id);

        let new_multispend_events = events_to_process
            .iter()
            .filter_map(|event| match event.raw().deserialize().ok()? {
                AnySyncTimelineEvent::MessageLike(AnySyncMessageLikeEvent::RoomMessage(
                    SyncMessageLikeEvent::Original(m),
                )) => Some(m),
                _ => None,
            })
            .filter(|m| m.content.msgtype() == MULTISPEND_MSGTYPE)
            .filter_map(|m| {
                let event_time = u64::from(m.origin_server_ts.get());

                let data = m.content.msgtype.data().into_owned();
                let mevent =
                    serde_json::from_value::<MultispendEvent>(serde_json::Value::Object(data))
                        .inspect_err(|err| error!(%err, "invalid multispend event"))
                        .ok()?;

                Some((
                    RpcUserId(m.sender.to_string()),
                    RpcEventId(m.event_id.to_string()),
                    mevent,
                    event_time,
                ))
            });

        for (sender, event_id, event, event_time) in new_multispend_events {
            super::process_event_db(
                dbtx,
                &RpcRoomId(room_id.to_string()),
                sender.clone(),
                event_id.clone(),
                event.clone(),
                event_time,
                context,
            )
            .await;
        }

        if let Some(event_id) = new_latest_event_id {
            // save the new last seen event
            dbtx.insert_entry(
                &MultispendScannerLastEventKey(RpcRoomId(room_id.to_string())),
                &event_id,
            )
            .await;
        }

        Ok(())
    }
}

/// Returns all events in this room after last seen event.
pub async fn all_message_since(
    room: &Room,
    last_seen_event: Option<RpcEventId>,
) -> anyhow::Result<Vec<TimelineEvent>> {
    let is_last_seen_event = |event_id: OwnedEventId| {
        last_seen_event
            .as_ref()
            .is_some_and(|last_event| last_event.0 == event_id)
    };
    let (room_event_cache, _tasks) = room
        .event_cache()
        .await
        .map_err(event_cache_error_to_anyhow)?;
    let (mut loaded_events, _) = room_event_cache.subscribe().await;
    if let Some(idx) = loaded_events
        .iter()
        .position(|event| event.event_id().is_some_and(is_last_seen_event))
    {
        // case: the last seen event is already loaded, so return the remain items
        loaded_events.drain(0..=idx);
        return Ok(loaded_events);
    }

    // NOTE: this loads all events of the room in memory because matrix doesn't have
    // api to scan without reading everything into memory.

    let mut timestamp_hack_used = false;
    // Paginate backward to find events that aren't loaded yet
    const BATCH_SIZE: u16 = 20;
    let start_reached = loop {
        let outcome = room_event_cache
            .pagination()
            .run_backwards_once(BATCH_SIZE)
            .await
            .map_err(event_cache_error_to_anyhow)?;
        // Stop if we've reached the start of the timeline
        if outcome.reached_start {
            break true;
        }
        // HACK: stop if we find event older than release of multispend feature
        // date +%s -d "2025-03-12" --utc
        // TODO: bump when releasing
        const MULTISPEND_RELEASE_TIMESTAMP: u64 = 1741737600;

        if outcome.events.iter().any(|event| {
            if event.event_id().is_some_and(is_last_seen_event) {
                true
            }
            // don't use hack in case of incremental scan
            else if last_seen_event.is_none()
                && event.raw().deserialize().is_ok_and(|event| {
                    u64::from(event.origin_server_ts().as_secs()) < MULTISPEND_RELEASE_TIMESTAMP
                })
            {
                timestamp_hack_used = true;
                true
            } else {
                false
            }
        }) {
            break false;
        }
    };

    let (mut loaded_events, _) = room_event_cache.subscribe().await;

    if let Some(idx) = loaded_events
        .iter()
        .position(|event| event.event_id().is_some_and(is_last_seen_event))
    {
        // so return events after last seen
        loaded_events.drain(0..=idx);
        Ok(loaded_events)
    } else {
        assert!(
            start_reached || timestamp_hack_used,
            "if we didn't find event id we must have loaded all the events or we used the timestamp hack"
        );
        if last_seen_event.is_some() {
            // caller might be specified event id from another room.
            // or that event was not retained by the server.
            warn!("failed to find event in room timeline");
        }
        Ok(loaded_events)
    }
}

// some times the events arrive before room key to decrypt that event, so we
// have to wait for room key.
pub async fn all_message_since_retry_decryption(
    room: &Room,
    last_seen_event: Option<RpcEventId>,
) -> anyhow::Result<Vec<TimelineEvent>> {
    let events = all_message_since(room, last_seen_event.clone()).await?;
    let crypto_context_info = room.crypto_context_info().await;
    let push_ctx = room.push_context().await?;
    stream::iter(events)
        .then(|event| async {
            let mut event = event;
            // We have infinitely retries because we can't do anything better.
            // If we skip an event, our state will diverge from other peers.
            // If we get stuck in a loop, it will be very visible in logs.
            //
            // don't sleep first time
            let mut backoff = iter::once(Duration::ZERO).chain(background_backoff());
            let mut tries = 0;
            loop {
                tries += 1;
                let TimelineEventKind::UnableToDecrypt {
                    event: raw_event,
                    utd_info,
                } = &event.kind
                else {
                    break;
                };
                // is this a permanent error? see docs
                if !utd_info.reason.is_missing_room_key() {
                    break;
                }
                let cause = UtdCause::determine(raw_event, crypto_context_info, utd_info);
                // if an event was sent before we joined, we will never be able to decrypt it.
                //
                // I have seen UtdCause::Unknown and UtdCause::SentBeforeWeJoined
                // because is_missing_key restricts the UtdReason a lot, only these are
                // reachable if backup/recovery is setup properly
                if cause == UtdCause::SentBeforeWeJoined {
                    break;
                }

                fedimint_core::task::sleep(backoff.next().expect("unlimited")).await;
                if tries <= 1 {
                    debug!(%tries, ?cause, "utd: retrying decryption");
                } else {
                    info!(%tries, ?cause, "utd: retrying decryption");
                }

                event = room
                    .decrypt_event(raw_event.cast_ref(), push_ctx.as_ref())
                    .await?;
            }
            if tries != 1 {
                info!("utd: fixed after {tries} tries");
            }
            anyhow::Ok(event)
        })
        // No need for concurrency, because network side (receiving rooms keys) is happening in
        // tasks already
        .try_collect()
        .await
}

// event cache error is not send on wasm
fn event_cache_error_to_anyhow(error: EventCacheError) -> anyhow::Error {
    #[cfg(not(target_family = "wasm"))]
    return error.into();

    #[cfg(target_family = "wasm")]
    return anyhow::format_err!("{error}");
}
