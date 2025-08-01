use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use fedimint_core::encoding::{Decodable, Encodable};
use matrix_sdk::event_cache::RoomPaginationStatus;
use matrix_sdk::notification_settings::RoomNotificationMode;
use matrix_sdk::room::RoomMember;
use matrix_sdk::ruma::api::client::user_directory::search_users::v3 as search_user_directory;
use matrix_sdk::ruma::events::poll::start::PollKind;
use matrix_sdk::ruma::events::room::member::MembershipState;
use matrix_sdk::ruma::events::room::message::MessageType;
use matrix_sdk::ruma::events::AnyTimelineEvent;
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{MilliSecondsSinceUnixEpoch, OwnedTransactionId};
use matrix_sdk::{ComposerDraft, ComposerDraftType};
use matrix_sdk_ui::room_list_service::SyncIndicator;
use matrix_sdk_ui::timeline::{
    EventSendState, MsgLikeKind, PollResult, TimelineEventItemId, TimelineItem,
    TimelineItemContent, TimelineItemKind, VirtualTimelineItem,
};
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::error::{ErrorCode, RpcError};

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcComposerDraftType {
    NewMessage,
    Reply { event_id: String },
    Edit { event_id: String },
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcComposerDraft {
    pub plain_text: String,
    pub html_text: Option<String>,
    pub draft_type: RpcComposerDraftType,
}

impl RpcComposerDraft {
    pub fn from_sdk(draft: ComposerDraft) -> Self {
        RpcComposerDraft {
            plain_text: draft.plain_text,
            html_text: draft.html_text,
            draft_type: match draft.draft_type {
                ComposerDraftType::NewMessage => RpcComposerDraftType::NewMessage,
                ComposerDraftType::Reply { event_id } => RpcComposerDraftType::Reply {
                    event_id: event_id.to_string(),
                },
                ComposerDraftType::Edit { event_id } => RpcComposerDraftType::Edit {
                    event_id: event_id.to_string(),
                },
            },
        }
    }

    pub fn to_sdk(self) -> Result<ComposerDraft> {
        Ok(ComposerDraft {
            plain_text: self.plain_text,
            html_text: self.html_text,
            draft_type: match self.draft_type {
                RpcComposerDraftType::NewMessage => ComposerDraftType::NewMessage,
                RpcComposerDraftType::Reply { event_id } => ComposerDraftType::Reply {
                    event_id: event_id.parse()?,
                },
                RpcComposerDraftType::Edit { event_id } => ComposerDraftType::Edit {
                    event_id: event_id.parse()?,
                },
            },
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
#[ts(export)]
pub enum MatrixInitializeStatus {
    Starting,
    LoggingIn,
    Success,
    Error { error: RpcError },
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(tag = "kind", content = "value")]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[allow(clippy::large_enum_variant)]
pub enum RpcTimelineItem {
    Event(RpcTimelineItemEvent),
    /// A divider between messages of two days.
    ///
    /// The value is a timestamp in milliseconds since Unix Epoch on the given
    /// day in local time.
    DateDivider(#[ts(type = "number")] MilliSecondsSinceUnixEpoch),
    /// The user's own read marker.
    ReadMarker,
    Unknown,
    TimelineStart,
}

#[derive(Debug, Deserialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcTimelineEventItemId {
    TransactionId(String),
    EventId(String),
}

impl TryFrom<RpcTimelineEventItemId> for TimelineEventItemId {
    type Error = anyhow::Error;

    fn try_from(value: RpcTimelineEventItemId) -> std::result::Result<Self, Self::Error> {
        match value {
            RpcTimelineEventItemId::TransactionId(t) => Ok(TimelineEventItemId::TransactionId(
                OwnedTransactionId::from(t),
            )),
            RpcTimelineEventItemId::EventId(e) => Ok(TimelineEventItemId::EventId(e.parse()?)),
        }
    }
}

/// This type represents the "send state" of a local event timeline item.
#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(tag = "kind")]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcTimelineEventSendState {
    /// The local event has not been sent yet.
    NotSentYet,
    /// The local event has been sent to the server, but unsuccessfully: The
    /// sending has failed.
    SendingFailed {
        /// Details about how sending the event failed.
        error: String,
        is_recoverable: bool,
    },
    /// The local event has been sent successfully to the server.
    Sent {
        /// The event ID assigned by the server.
        event_id: String,
    },
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
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
#[ts(export)]
#[allow(clippy::large_enum_variant)]
pub enum RpcTimelineItemContent {
    Message(#[ts(type = "JSONObject")] MessageType),
    Json(#[ts(type = "JSONValue")] serde_json::Value),
    RedactedMessage,
    Poll(RpcPollResult),
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcBackPaginationStatus {
    Idle,
    Paginating,
    TimelineStartReached,
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcMatrixUserDirectorySearchUser {
    pub user_id: RpcUserId,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcPollKind {
    Undisclosed,
    Disclosed,
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcPollResult {
    pub body: String,
    pub kind: RpcPollKind,
    pub max_selections: u64,
    pub answers: Vec<RpcPollResultAnswer>,
    pub votes: HashMap<String, Vec<String>>,
    pub end_time: Option<u64>,
    pub has_been_edited: bool,
    pub msgtype: String,
}

impl RpcPollResult {
    fn from_timeline_item(content: &TimelineItemContent) -> Option<Self> {
        if let TimelineItemContent::MsgLike(msg) = content {
            if let MsgLikeKind::Poll(poll_state) = &msg.kind {
                return Some(RpcPollResult::from(poll_state.results()));
            }
        }
        None
    }
}

impl From<PollResult> for RpcPollResult {
    fn from(value: PollResult) -> Self {
        let end_time: Option<u64> = value.end_time.map(|t| t.get().into());

        Self {
            msgtype: String::from("m.poll"),
            body: value.question,
            kind: match value.kind {
                PollKind::Undisclosed => RpcPollKind::Undisclosed,
                _ => RpcPollKind::Disclosed,
            },
            max_selections: value.max_selections,
            answers: value
                .answers
                .iter()
                .map(|a| RpcPollResultAnswer {
                    id: a.id.to_string(),
                    text: a.text.to_string(),
                })
                .collect(),
            votes: value
                .votes
                .into_iter()
                .map(|(k, v)| (k, v.into_iter().map(|s| s.to_string()).collect()))
                .collect(),
            end_time,
            has_been_edited: value.has_been_edited,
        }
    }
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcPollResultAnswer {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcPollResponseData {
    pub sender: RpcUserId,
    #[ts(type = "number")]
    pub timestamp: MilliSecondsSinceUnixEpoch,
    pub answers: Vec<String>,
}
impl RpcMatrixUserDirectorySearchUser {
    pub fn from_user(user: search_user_directory::User) -> Self {
        let avatar_url = user.avatar_url.map(|url| url.to_string());
        Self {
            user_id: RpcUserId(user.user_id.into()),
            display_name: user.display_name,
            avatar_url,
        }
    }
}

#[derive(Debug, Serialize, Clone, ts_rs::TS)]
#[ts(export)]
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

impl From<RoomPaginationStatus> for RpcBackPaginationStatus {
    fn from(value: RoomPaginationStatus) -> Self {
        match value {
            RoomPaginationStatus::Idle {
                hit_timeline_start: false,
            } => Self::Idle,
            RoomPaginationStatus::Idle {
                hit_timeline_start: true,
            } => Self::TimelineStartReached,
            RoomPaginationStatus::Paginating => Self::Paginating,
        }
    }
}

impl From<Arc<TimelineItem>> for RpcTimelineItem {
    fn from(item: Arc<TimelineItem>) -> Self {
        match **item {
            TimelineItemKind::Event(ref e) => {
                let content = e.content();
                let content = if let Some(poll) = RpcPollResult::from_timeline_item(content) {
                    RpcTimelineItemContent::Poll(poll)
                } else if let Some(json) = e.latest_json() {
                    RpcTimelineItemContent::Json(
                        json.deserialize_as::<serde_json::Value>()
                            .expect("failed to deserialize event"),
                    )
                } else if let TimelineItemContent::MsgLike(msg) = content {
                    match &msg.kind {
                        MsgLikeKind::Message(m) => {
                            RpcTimelineItemContent::Message(m.msgtype().clone())
                        }
                        MsgLikeKind::Redacted => RpcTimelineItemContent::RedactedMessage,
                        _ => RpcTimelineItemContent::Unknown,
                    }
                } else {
                    RpcTimelineItemContent::Unknown
                };
                let send_state = e.send_state().map(|s| match s {
                    EventSendState::NotSentYet => RpcTimelineEventSendState::NotSentYet,
                    EventSendState::SendingFailed {
                        error,
                        is_recoverable,
                    } => RpcTimelineEventSendState::SendingFailed {
                        error: error.to_string(),
                        is_recoverable: *is_recoverable,
                    },
                    EventSendState::Sent { event_id } => RpcTimelineEventSendState::Sent {
                        event_id: event_id.to_string(),
                    },
                });
                Self::Event(RpcTimelineItemEvent {
                    id: item.unique_id().0.clone(),
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
                VirtualTimelineItem::DateDivider(t) => Self::DateDivider(*t),
                VirtualTimelineItem::ReadMarker => Self::ReadMarker,
                VirtualTimelineItem::TimelineStart => Self::TimelineStart,
            },
        }
    }
}

impl RpcTimelineItem {
    pub fn unknown() -> Self {
        warn!("unknown timeline item");
        Self::Unknown
    }

    pub fn from_preview_item(item: &Raw<AnyTimelineEvent>) -> Option<Self> {
        match item.deserialize().ok()? {
            AnyTimelineEvent::MessageLike(message_event) => {
                let event = RpcTimelineItemEvent {
                    id: message_event.event_id().to_string(),
                    txn_id: message_event.transaction_id().map(|tid| tid.to_string()),
                    event_id: Some(message_event.event_id().to_string()),
                    content: RpcTimelineItemContent::Json(
                        item.deserialize_as::<serde_json::Value>().ok()?,
                    ),
                    local_echo: false, // preview is never a local echo
                    timestamp: message_event.origin_server_ts(),
                    sender: message_event.sender().to_owned(),
                    send_state: None, // This is for local echos, not relevant here
                };

                Some(RpcTimelineItem::Event(event))
            }
            AnyTimelineEvent::State(_) => None, // Skip state events for the preview
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Decodable, Encodable, ts_rs::TS, PartialEq, Eq)]
#[ts(export)]
pub struct RpcRoomId(pub String);

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

#[derive(
    Clone,
    Debug,
    Serialize,
    Deserialize,
    Eq,
    PartialEq,
    ts_rs::TS,
    Hash,
    Encodable,
    Decodable,
    PartialOrd,
    Ord,
)]
#[ts(export)]
pub struct RpcUserId(pub String);

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

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
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
#[ts(export)]
pub struct RpcMatrixUploadResult {
    pub content_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
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
#[ts(export)]
pub enum RpcSyncIndicator {
    Hide,
    Show,
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcRoomMember {
    pub user_id: RpcUserId,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub ignored: bool,
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
            ignored: member.is_ignored(),
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

/// Enum representing the push notification modes for a room.
#[derive(Clone, ts_rs::TS, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcRoomNotificationMode {
    /// Receive notifications for all messages.
    AllMessages,
    /// Receive notifications for mentions and keywords only.
    MentionsAndKeywordsOnly,
    /// Do not receive any notifications.
    Mute,
}

impl From<RoomNotificationMode> for RpcRoomNotificationMode {
    fn from(value: RoomNotificationMode) -> Self {
        match value {
            RoomNotificationMode::AllMessages => Self::AllMessages,
            RoomNotificationMode::MentionsAndKeywordsOnly => Self::MentionsAndKeywordsOnly,
            RoomNotificationMode::Mute => Self::Mute,
        }
    }
}

impl From<RpcRoomNotificationMode> for RoomNotificationMode {
    fn from(value: RpcRoomNotificationMode) -> Self {
        match value {
            RpcRoomNotificationMode::AllMessages => Self::AllMessages,
            RpcRoomNotificationMode::MentionsAndKeywordsOnly => Self::MentionsAndKeywordsOnly,
            RpcRoomNotificationMode::Mute => Self::Mute,
        }
    }
}
