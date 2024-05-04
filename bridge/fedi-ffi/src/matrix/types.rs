use std::sync::Arc;

use anyhow::{Context, Result};
use matrix_sdk::room::RoomMember;
use matrix_sdk::ruma::api::client::user_directory::search_users::v3 as search_user_directory;
use matrix_sdk::ruma::events::room::member::MembershipState;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use matrix_sdk::ruma::MilliSecondsSinceUnixEpoch;
use matrix_sdk::RoomListEntry;
use matrix_sdk_ui::room_list_service::SyncIndicator;
use matrix_sdk_ui::timeline::{
    BackPaginationStatus, EventSendState, TimelineItem, TimelineItemContent, TimelineItemKind,
    VirtualTimelineItem,
};
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::error::ErrorCode;

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(tag = "kind", content = "value")]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcTimelineItem {
    Event(RpcTimelineItemEvent),
    /// A divider between messages of two days.
    ///
    /// The value is a timestamp in milliseconds since Unix Epoch on the given
    /// day in local time.
    DayDivider(#[ts(type = "number")] MilliSecondsSinceUnixEpoch),
    /// The user's own read marker.
    ReadMarker,
    Unknown,
}

/// This type represents the "send state" of a local event timeline item.
#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(tag = "kind")]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcTimelineEventSendState {
    /// The local event has not been sent yet.
    NotSentYet,
    /// The local event has been sent to the server, but unsuccessfully: The
    /// sending has failed.
    SendingFailed {
        /// Details about how sending the event failed.
        error: String,
    },
    /// Sending has been cancelled because an earlier event in the
    /// message-sending queue failed.
    Cancelled,
    /// The local event has been sent successfully to the server.
    Sent {
        /// The event ID assigned by the server.
        event_id: String,
    },
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcTimelineItemEvent {
    pub(crate) id: String,
    pub(crate) txn_id: Option<String>,
    pub(crate) event_id: Option<String>,
    pub(crate) content: RpcTimelineItemContent,
    pub(crate) local_echo: bool,
    #[ts(type = "number")]
    pub(crate) timestamp: MilliSecondsSinceUnixEpoch,
    #[ts(type = "string")]
    pub(crate) sender: matrix_sdk::ruma::OwnedUserId,
    pub(crate) send_state: Option<RpcTimelineEventSendState>,
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(tag = "kind", content = "value")]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcTimelineItemContent {
    Message(#[ts(type = "any")] RoomMessageEventContent),
    Json(#[ts(type = "any")] serde_json::Value),
    RedactedMessage,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcBackPaginationStatus {
    Idle,
    Paginating,
    TimelineStartReached,
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcMatrixUserDirectorySearchUser {
    pub user_id: RpcUserId,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

impl RpcMatrixUserDirectorySearchUser {
    pub fn from_user(user: search_user_directory::User) -> Self {
        let avatar_url = user.avatar_url.map(|url| url.to_string());
        Self {
            user_id: user.user_id.into(),
            display_name: user.display_name,
            avatar_url,
        }
    }
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcMatrixUserDirectorySearchResponse {
    pub(crate) results: Vec<RpcMatrixUserDirectorySearchUser>,
    pub(crate) limited: bool,
}

impl RpcMatrixUserDirectorySearchResponse {
    pub fn from_response(response: search_user_directory::Response) -> Self {
        Self {
            results: response
                .results
                .into_iter()
                .map(RpcMatrixUserDirectorySearchUser::from_user)
                .collect(),
            limited: response.limited,
        }
    }
}

impl From<BackPaginationStatus> for RpcBackPaginationStatus {
    fn from(value: BackPaginationStatus) -> Self {
        match value {
            BackPaginationStatus::Idle => Self::Idle,
            BackPaginationStatus::Paginating => Self::Paginating,
            BackPaginationStatus::TimelineStartReached => Self::TimelineStartReached,
        }
    }
}

impl RpcTimelineItem {
    pub fn from_timeline_item(item: Arc<TimelineItem>) -> Self {
        match **item {
            TimelineItemKind::Event(ref e) => {
                let content = if let Some(json) = e.latest_json() {
                    RpcTimelineItemContent::Json(
                        json.deserialize_as::<serde_json::Value>()
                            .expect("failed to deserialize event"),
                    )
                } else {
                    match e.content() {
                        TimelineItemContent::Message(m) => RpcTimelineItemContent::Message(
                            RoomMessageEventContent::from(m.clone()),
                        ),
                        TimelineItemContent::RedactedMessage => {
                            RpcTimelineItemContent::RedactedMessage
                        }
                        _ => RpcTimelineItemContent::Unknown,
                    }
                };
                let send_state = e.send_state().map(|s| match s {
                    EventSendState::NotSentYet => RpcTimelineEventSendState::NotSentYet,
                    EventSendState::SendingFailed { error } => {
                        RpcTimelineEventSendState::SendingFailed {
                            error: error.to_string(),
                        }
                    }
                    EventSendState::Cancelled => RpcTimelineEventSendState::Cancelled,
                    EventSendState::Sent { event_id } => RpcTimelineEventSendState::Sent {
                        event_id: event_id.to_string(),
                    },
                });
                Self::Event(RpcTimelineItemEvent {
                    id: item.unique_id().to_string(),
                    txn_id: e.transaction_id().map(|s| s.to_string()),
                    event_id: e.event_id().map(|s| s.to_string()),
                    content,
                    local_echo: e.is_local_echo(),
                    timestamp: e.timestamp(),
                    sender: e.sender().into(),
                    send_state,
                })
            }
            TimelineItemKind::Virtual(ref v) => match v {
                VirtualTimelineItem::DayDivider(t) => Self::DayDivider(*t),
                VirtualTimelineItem::ReadMarker => Self::ReadMarker,
            },
        }
    }

    pub fn unknown() -> Self {
        warn!("unknown timeline item");
        Self::Unknown
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcRoomId(String);

impl RpcRoomId {
    pub fn into_typed(&self) -> Result<matrix_sdk::ruma::OwnedRoomId> {
        self.0.parse().context(ErrorCode::BadRequest)
    }
}

impl From<matrix_sdk::ruma::OwnedRoomId> for RpcRoomId {
    fn from(value: matrix_sdk::ruma::OwnedRoomId) -> Self {
        RpcRoomId(value.to_string())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcUserId(String);

impl RpcUserId {
    pub fn into_typed(&self) -> Result<matrix_sdk::ruma::OwnedUserId> {
        self.0.parse().context(ErrorCode::BadRequest)
    }
}

impl From<matrix_sdk::ruma::OwnedUserId> for RpcUserId {
    fn from(value: matrix_sdk::ruma::OwnedUserId) -> Self {
        RpcUserId(value.to_string())
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, ts_rs::TS)]
#[serde(tag = "kind", content = "value")]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcRoomListEntry {
    /// The list knows there is an entry but this entry has not been loaded yet,
    /// thus it's marked as empty.
    #[default]
    Empty,
    /// The list has loaded this entry in the past, but the entry is now out of
    /// range and may no longer be synced, thus it's marked as invalidated (to
    /// use the spec's term).
    Invalidated(String),
    /// The list has loaded this entry, and it's up-to-date.
    Filled(String),
}

impl From<RoomListEntry> for RpcRoomListEntry {
    fn from(value: RoomListEntry) -> Self {
        match value {
            RoomListEntry::Empty => Self::Empty,
            RoomListEntry::Invalidated(r) => Self::Invalidated(r.into()),
            RoomListEntry::Filled(r) => Self::Filled(r.into()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcMatrixAccountSession {
    #[ts(type = "string")]
    pub user_id: matrix_sdk::ruma::OwnedUserId,
    #[ts(type = "string")]
    pub device_id: matrix_sdk::ruma::OwnedDeviceId,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcMatrixUploadResult {
    pub content_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcMatrixMembership {
    /// The user is banned.
    Ban,
    /// The user has been invited.
    Invite,
    /// The user has joined.
    Join,
    /// The user has requested to join.
    Knock,
    /// The user has left.
    Leave,
    /// Some unknown or custom membership type.
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub enum RpcSyncIndicator {
    Hide,
    Show,
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "target/bindings/")]
pub struct RpcRoomMember {
    pub user_id: RpcUserId,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    #[ts(type = "number")]
    pub power_level: i64,
    pub membership: RpcMatrixMembership,
}

impl From<RoomMember> for RpcRoomMember {
    fn from(member: RoomMember) -> Self {
        let membership = match member.membership() {
            MembershipState::Ban => RpcMatrixMembership::Ban,
            MembershipState::Invite => RpcMatrixMembership::Invite,
            MembershipState::Join => RpcMatrixMembership::Join,
            MembershipState::Knock => RpcMatrixMembership::Knock,
            MembershipState::Leave => RpcMatrixMembership::Leave,
            _ => RpcMatrixMembership::Unknown,
        };

        Self {
            user_id: RpcUserId(member.user_id().into()),
            avatar_url: member.avatar_url().map(|uri| uri.to_string()),
            display_name: member.display_name().map(|s| s.to_string()),
            power_level: member.power_level(),
            membership,
        }
    }
}

impl From<SyncIndicator> for RpcSyncIndicator {
    fn from(value: SyncIndicator) -> Self {
        match value {
            SyncIndicator::Show => Self::Show,
            SyncIndicator::Hide => Self::Hide,
        }
    }
}
