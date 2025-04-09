//! # Matrix Room Rescanner Service
//!
//! This module provides functionality for scanning Matrix rooms to multispend
//! events and storing them in easy to query database.

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::ops::ControlFlow;
use std::sync::Arc;

use anyhow::Context;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use matrix_sdk::deserialized_responses::TimelineEvent;
use matrix_sdk::locks::Mutex;
use matrix_sdk::ruma::events::{AnySyncTimelineEvent, SyncMessageLikeEvent};
use matrix_sdk::ruma::{OwnedEventId, OwnedRoomId, RoomId};
use matrix_sdk::{Client, Room};
use tokio::sync::watch;
use tokio_stream::wrappers::WatchStream;
use tokio_stream::StreamExt;
use tracing::{debug, error, instrument, warn};

use super::multispend::db::MultispendScannerLastEventKey;
use super::multispend::{self, MultispendEvent, MULTISPEND_MSGTYPE};
use super::{RpcRoomId, RpcUserId};
use crate::bridge::BridgeRuntime;
use crate::matrix::AnySyncMessageLikeEvent;
use crate::types::RpcEventId;

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
#[derive(Clone)]
pub struct RoomRescannerManager {
    client: Client,
    /// Maps room IDs to their state sender channels.
    /// see methods for explaination.
    rescan_states: Arc<Mutex<HashMap<OwnedRoomId, watch::Sender<RoomRescanState>>>>,
    /// Reference to the bridge runtime for spawning tasks
    runtime: Arc<BridgeRuntime>,
}

impl RoomRescannerManager {
    /// Creates a new RoomRescannerManager
    pub fn new(client: Client, runtime: Arc<BridgeRuntime>) -> Self {
        Self {
            client,
            rescan_states: Arc::new(Mutex::new(HashMap::new())),
            runtime,
        }
    }

    /// Wait for any rescan operations to complete for this room
    /// Queues a rescan if this room was not scanned in this run.
    pub async fn wait_for_scanned(&self, room_id: &RoomId) {
        let never_scanned = { !self.rescan_states.lock().contains_key(room_id) };
        if never_scanned {
            self.queue_rescan(room_id);
        }
        let mut rx = {
            self.rescan_states
                .lock()
                .get(room_id)
                .expect("queue inserts the state")
                .subscribe()
        };
        // Just wait for idle state, the background task will notify us when done.
        // might fail if background task is shutdown.
        rx.wait_for(|state| *state == RoomRescanState::Idle)
            .await
            .ok();
    }

    /// Queues a room for rescanning
    // Just sets the room state to `Queued` and background service will eventually
    // completes.
    pub fn queue_rescan(&self, room_id: &RoomId) {
        let mut states = self.rescan_states.lock();
        match states.entry(room_id.to_owned()) {
            // if task was running, just update the state, the task will pick this up.
            Entry::Occupied(o) => {
                assert_ne!(o.get().receiver_count(), 0);
                o.get().send_replace(RoomRescanState::Queued);
            }
            Entry::Vacant(v) => {
                // if no task is running for this room, we need to start it.
                let (tx, rx) = watch::channel(RoomRescanState::Queued);
                v.insert(tx.clone());

                // Start background task using the runtime
                let room_id = room_id.to_owned();
                let this = self.clone();
                self.runtime.task_group.spawn_cancellable(
                    format!("room_rescanner::{}", room_id),
                    async move {
                        this.run_room_rescan_task(&room_id, tx, rx).await;
                    },
                );
            }
        }

        debug!(?room_id, "Room rescan queued");
    }

    /// Background task that handles the actual room rescanning
    #[instrument(skip(self, tx, rx))]
    async fn run_room_rescan_task(
        &self,
        room_id: &RoomId,
        tx: watch::Sender<RoomRescanState>,
        rx: watch::Receiver<RoomRescanState>,
    ) {
        // the tx and rx are of same watch channel.
        // tx is updating state of room before and after one rescanning completes.
        //
        // the watch channel here is like a mutex<state> but with notification for
        // whenever the value changes.
        debug!("Started rescanning room task");
        let mut watch_stream = WatchStream::new(rx);
        while let Some(state) = watch_stream.next().await {
            // watch changes from queued_rescan method and start scanning.
            if state != RoomRescanState::Queued {
                continue;
            }
            // Transition to running
            // this is mark for checking after the scanning if there was any rescans queued
            // while we were rescanning
            tx.send_replace(RoomRescanState::Running);

            debug!(?room_id, "Started rescanning room");

            // Perform the rescanning
            let db = self.runtime.multispend_db();
            let mut dbtx = db.begin_transaction().await;

            if let Err(err) = self
                .process_multispend_events(room_id, &mut dbtx.to_ref_nc())
                .await
            {
                warn!(?err, ?room_id, "Error rescanning room");
            }

            dbtx.commit_tx().await;

            tx.send_if_modified(|current| {
                // Only transition to idle if still in running state
                // this will be Queued state if a rescan was queued while this rescan was
                // running.
                //
                // this watch channel helps us merge multiple
                // queue_rescan into one.
                assert_ne!(*current, RoomRescanState::Idle);
                if *current == RoomRescanState::Running {
                    *current = RoomRescanState::Idle;
                    // we send a notification to wait_for_scanned task which is waiting for Idle
                    // state.
                    true
                } else {
                    false
                }
            });
            debug!("Room rescanning completed");
        }

        unreachable!("loop should never end");
    }

    /// Reads the timeline events in the given room and, for each multispend
    /// event, runs multispend::process_event_db to update the database
    /// state.
    async fn process_multispend_events(
        &self,
        room_id: &RoomId,
        dbtx: &mut DatabaseTransaction<'_>,
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

        // find all events since our last seen event, first time this will scan the
        // entire* room history.
        // * see hack bellow in all_message_since.
        let events_to_process = all_message_since(&room, last_scan_event_id).await?;

        let new_latest_event_id = events_to_process
            .iter()
            .rev()
            .find_map(|e| e.event_id())
            .map(|event_id| RpcEventId(event_id.to_string()));

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
                        .ok()?;

                Some((
                    RpcUserId(m.sender.to_string()),
                    RpcEventId(m.event_id.to_string()),
                    mevent,
                    event_time,
                ))
            });

        for (sender, event_id, event, event_time) in new_multispend_events {
            tracing::trace!(?event, "processing event");
            if let Err(err) = multispend::process_event_db(
                dbtx,
                &RpcRoomId(room_id.to_string()),
                sender.clone(),
                event_id.clone(),
                event.clone(),
                event_time,
            )
            .await
            {
                // logging the entire event, this might be privacy leaking when you share
                // the logs.
                error!(
                    ?err,
                    ?sender,
                    ?event_id,
                    ?event,
                    "Error processing multispend event"
                );
            }
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
    let (room_event_cache, _tasks) = room.event_cache().await?;
    let (mut loaded_events, _) = room_event_cache.subscribe().await?;
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
    let start_reached = room_event_cache
        .pagination()
        .run_backwards(BATCH_SIZE, |outcome, _| {
            // Stop if we've reached the start of the timeline
            if outcome.reached_start || outcome.events.is_empty() {
                return std::future::ready(ControlFlow::Break(true));
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
                return std::future::ready(ControlFlow::Break(false));
            }

            std::future::ready(ControlFlow::Continue(()))
        })
        .await?;

    let (mut loaded_events, _) = room_event_cache.subscribe().await?;

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
