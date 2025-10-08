use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

use anyhow::{Context, Result};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::invite_code::InviteCode;
use matrix_sdk::event_cache::RoomPaginationStatus;
use matrix_sdk::notification_settings::RoomNotificationMode;
use matrix_sdk::room::RoomMember;
use matrix_sdk::ruma::api::client::user_directory::search_users::v3 as search_user_directory;
use matrix_sdk::ruma::events::AnyTimelineEvent;
use matrix_sdk::ruma::events::poll::start::PollKind;
use matrix_sdk::ruma::events::room::MediaSource;
use matrix_sdk::ruma::events::room::member::MembershipState;
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{MilliSecondsSinceUnixEpoch, events as ruma_events};
use matrix_sdk::{ComposerDraft, ComposerDraftType, RoomDisplayName, RoomState};
use matrix_sdk_ui::room_list_service::SyncIndicator;
use matrix_sdk_ui::timeline::{
    EventSendState, EventTimelineItem, InReplyToDetails, MsgLikeKind, PollResult, RoomExt,
    TimelineDetails, TimelineEventItemId, TimelineItem, TimelineItemContent, TimelineItemKind,
    VirtualTimelineItem,
};
use ruma_events::room::message::MessageType as RumaMessageType;
use serde::{Deserialize, Serialize};
use tracing::warn;
use ts_rs::TS;

use crate::error::{ErrorCode, RpcError};
use crate::matrix::ruma_events::AnyMessageLikeEvent;
use crate::multispend::MultispendEvent;

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

#[derive(Debug, Serialize, Deserialize, Clone, ts_rs::TS)]
#[ts(export)]
pub struct RpcTimelineEventItemId(#[ts(type = "Opaque<string, 'RpcTimelineEventItemId'>")] String);

impl From<RpcTimelineEventItemId> for TimelineEventItemId {
    fn from(value: RpcTimelineEventItemId) -> Self {
        match value.0.parse() {
            // if string starts with $
            Ok(event_id) => TimelineEventItemId::EventId(event_id),
            Err(_) => TimelineEventItemId::TransactionId(value.0.into()),
        }
    }
}

impl From<TimelineEventItemId> for RpcTimelineEventItemId {
    fn from(value: TimelineEventItemId) -> Self {
        match value {
            TimelineEventItemId::TransactionId(t) => RpcTimelineEventItemId(t.to_string()),
            TimelineEventItemId::EventId(e) => RpcTimelineEventItemId(e.to_string()),
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
    pub(crate) id: RpcTimelineEventItemId,
    pub content: RpcMsgLikeKind,
    pub(crate) local_echo: bool,
    #[ts(type = "number")]
    pub(crate) timestamp: MilliSecondsSinceUnixEpoch,
    #[ts(type = "string")]
    pub(crate) sender: matrix_sdk::ruma::OwnedUserId,
    pub(crate) send_state: Option<RpcTimelineEventSendState>,
    in_reply: Option<Box<RpcTimelineDetails<RpcTimelineItemEvent>>>,
}

impl From<&EventSendState> for RpcTimelineEventSendState {
    fn from(state: &EventSendState) -> Self {
        match state {
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
        }
    }
}

impl From<&EventTimelineItem> for RpcTimelineItemEvent {
    fn from(e: &EventTimelineItem) -> Self {
        let (content, in_reply) = Self::from_item_content(e.content());
        RpcTimelineItemEvent {
            id: e.identifier().into(),
            content,
            local_echo: e.is_local_echo(),
            timestamp: e.timestamp(),
            sender: e.sender().into(),
            send_state: e.send_state().map(RpcTimelineEventSendState::from),
            in_reply,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "kind")]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcTimelineDetails<T> {
    /// The details are not available yet, and have not been requested from the
    /// server.
    Unavailable,

    /// The details are not available yet, but have been requested.
    Pending,

    /// The details are available.
    Ready(T),

    /// An error occurred when fetching the details.
    Error,
}

impl<T> RpcTimelineDetails<T> {
    fn mapped<U>(details: &TimelineDetails<U>, f: impl FnOnce(&U) -> T) -> Self {
        match details {
            TimelineDetails::Unavailable => Self::Unavailable,
            TimelineDetails::Pending => Self::Pending,
            TimelineDetails::Ready(value) => Self::Ready(f(value)),
            TimelineDetails::Error(_) => Self::Error,
        }
    }
}

impl RpcTimelineItemEvent {
    fn from_item_content(
        item: &TimelineItemContent,
    ) -> (
        RpcMsgLikeKind,
        Option<Box<RpcTimelineDetails<RpcTimelineItemEvent>>>,
    ) {
        match item {
            TimelineItemContent::MsgLike(msg) => {
                let in_reply = msg.in_reply_to.as_ref().map(Self::for_reply);
                (RpcMsgLikeKind::from(&msg.kind), in_reply)
            }
            _ => (RpcMsgLikeKind::Unknown, None),
        }
    }

    fn for_reply(value: &InReplyToDetails) -> Box<RpcTimelineDetails<RpcTimelineItemEvent>> {
        Box::new(RpcTimelineDetails::mapped(&value.event, |value| {
            let (content, in_reply) = Self::from_item_content(&value.content);
            RpcTimelineItemEvent {
                id: value.identifier.clone().into(),
                content,
                local_echo: false,
                timestamp: value.timestamp,
                sender: value.sender.clone(),
                send_state: None,
                in_reply,
            }
        }))
    }
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
    #[ts(type = "number")]
    pub max_selections: u64,
    pub answers: Vec<RpcPollResultAnswer>,
    pub votes: HashMap<String, Vec<String>>,
    #[ts(type = "number | null")]
    pub end_time: Option<u64>,
    pub has_been_edited: bool,
    pub msgtype: String,
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
            TimelineItemKind::Event(ref e) => Self::Event(RpcTimelineItemEvent::from(e)),
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
                    id: RpcTimelineEventItemId(message_event.event_id().to_string()),
                    content: match &message_event {
                        AnyMessageLikeEvent::RoomMessage(msg) => {
                            RpcMsgLikeKind::from(&msg.as_original()?.content.msgtype)
                        }
                        _ => return None,
                    },
                    local_echo: false, // preview is never a local echo
                    timestamp: message_event.origin_server_ts(),
                    sender: message_event.sender().to_owned(),
                    send_state: None, // This is for local echos, not relevant here
                    in_reply: None,
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

use matrix_sdk::RoomInfo;
use matrix_sdk::room::Room;

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcMatrixRoomState {
    Joined,
    Left,
    Invited,
    Banned,
    Knocked,
}

#[derive(Clone, Debug, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcSerializedRoomInfo {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub preview: Option<RpcTimelineItemEvent>,
    pub direct_user_id: Option<String>,
    #[ts(as = "u32")]
    pub notification_count: u64,
    pub is_marked_unread: bool,
    #[ts(as = "u32")]
    pub joined_member_count: u64,
    pub is_preview: bool,
    pub is_public: Option<bool>,
    pub room_state: RpcMatrixRoomState,
}

impl RpcSerializedRoomInfo {
    pub async fn from_room_and_info(room: &Room, room_info: &RoomInfo) -> Self {
        let direct_user_id = room.direct_targets().iter().next().map(|id| id.to_string());

        Self {
            id: room_info.room_id().to_string(),
            name: match room.cached_display_name() {
                Some(RoomDisplayName::Calculated(name)) => name.clone(),
                Some(RoomDisplayName::Named(name)) => name.clone(),
                Some(RoomDisplayName::Empty) => String::new(),
                Some(RoomDisplayName::EmptyWas(name)) => name.clone(),
                Some(RoomDisplayName::Aliased(name)) => name.clone(),
                // TODO: fixme
                None => String::new(),
            },
            avatar_url: if direct_user_id.is_some() {
                room_info
                    .heroes()
                    .first()
                    .and_then(|hero| hero.avatar_url.as_ref())
                    .map(|url| url.to_string())
            } else {
                room_info.avatar_url().map(|url| url.to_string())
            },
            preview: room
                .latest_event_item()
                .await
                .map(|e| RpcTimelineItemEvent::from(&e)),
            direct_user_id,
            notification_count: room.read_receipts().num_unread,
            is_marked_unread: room.is_marked_unread(),
            joined_member_count: room_info.joined_members_count(),
            is_preview: false,
            is_public: Some(room.encryption_settings().is_none()),
            room_state: match room_info.state() {
                RoomState::Joined => RpcMatrixRoomState::Joined,
                RoomState::Left => RpcMatrixRoomState::Left,
                RoomState::Invited => RpcMatrixRoomState::Invited,
                RoomState::Knocked => RpcMatrixRoomState::Knocked,
                RoomState::Banned => RpcMatrixRoomState::Banned,
            },
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcPublicRoomInfo {
    pub id: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    #[ts(type = "number")]
    pub joined_member_count: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFormattedBody {
    pub format: String,
    pub formatted_body: String,
}

impl From<&ruma_events::room::message::FormattedBody> for RpcFormattedBody {
    fn from(formatted: &ruma_events::room::message::FormattedBody) -> Self {
        Self {
            format: formatted.format.to_string(),
            formatted_body: formatted.body.clone(),
        }
    }
}

// Shared base for text-like messages (text, notice, emote)
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcTextLikeContent {
    pub body: String,
    pub formatted: Option<RpcFormattedBody>,
}

impl From<&ruma_events::room::message::TextMessageEventContent> for RpcTextLikeContent {
    fn from(content: &ruma_events::room::message::TextMessageEventContent) -> Self {
        Self {
            body: content.body.clone(),
            formatted: content.formatted.as_ref().map(RpcFormattedBody::from),
        }
    }
}

impl From<&ruma_events::room::message::NoticeMessageEventContent> for RpcTextLikeContent {
    fn from(content: &ruma_events::room::message::NoticeMessageEventContent) -> Self {
        Self {
            body: content.body.clone(),
            formatted: content.formatted.as_ref().map(RpcFormattedBody::from),
        }
    }
}

impl From<&ruma_events::room::message::EmoteMessageEventContent> for RpcTextLikeContent {
    fn from(content: &ruma_events::room::message::EmoteMessageEventContent) -> Self {
        Self {
            body: content.body.clone(),
            formatted: content.formatted.as_ref().map(RpcFormattedBody::from),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export)]
pub struct RpcMediaSource(#[ts(type = "Opaque<unknown, 'MediaSource'>")] MediaSource);

impl From<&MediaSource> for RpcMediaSource {
    fn from(source: &MediaSource) -> Self {
        RpcMediaSource(source.clone())
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFileInfo {
    pub mimetype: Option<String>,
    #[ts(as = "Option<u32>")]
    pub size: Option<u64>,
    pub thumbnail_info: Option<Box<RpcThumbnailInfo>>,
    pub thumbnail_source: Option<RpcMediaSource>,
}

impl From<&ruma_events::room::message::FileInfo> for RpcFileInfo {
    fn from(info: &ruma_events::room::message::FileInfo) -> Self {
        Self {
            mimetype: info.mimetype.clone(),
            size: info.size.map(|s| s.into()),
            thumbnail_info: info
                .thumbnail_info
                .as_ref()
                .map(|ti| Box::new(RpcThumbnailInfo::from(ti.as_ref()))),
            thumbnail_source: info.thumbnail_source.as_ref().map(RpcMediaSource::from),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcImageInfo {
    #[ts(as = "Option<u32>")]
    pub height: Option<u64>,
    #[ts(as = "Option<u32>")]
    pub width: Option<u64>,
    pub mimetype: Option<String>,
    #[ts(as = "Option<u32>")]
    pub size: Option<u64>,
    pub thumbnail_info: Option<Box<RpcThumbnailInfo>>,
    pub thumbnail_source: Option<RpcMediaSource>,
}

impl From<&ruma_events::room::ImageInfo> for RpcImageInfo {
    fn from(info: &ruma_events::room::ImageInfo) -> Self {
        Self {
            height: info.height.map(|h| h.into()),
            width: info.width.map(|w| w.into()),
            mimetype: info.mimetype.clone(),
            size: info.size.map(|s| s.into()),
            thumbnail_info: info
                .thumbnail_info
                .as_ref()
                .map(|ti| Box::new(RpcThumbnailInfo::from(ti.as_ref()))),
            thumbnail_source: info.thumbnail_source.as_ref().map(RpcMediaSource::from),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcThumbnailInfo {
    #[ts(as = "Option<u32>")]
    pub height: Option<u64>,
    #[ts(as = "Option<u32>")]
    pub width: Option<u64>,
    pub mimetype: Option<String>,
    #[ts(as = "Option<u32>")]
    pub size: Option<u64>,
}

impl From<&ruma_events::room::ThumbnailInfo> for RpcThumbnailInfo {
    fn from(info: &ruma_events::room::ThumbnailInfo) -> Self {
        Self {
            height: info.height.map(|h| h.into()),
            width: info.width.map(|w| w.into()),
            mimetype: info.mimetype.clone(),
            size: info.size.map(|s| s.into()),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcVideoInfo {
    #[ts(as = "Option<u32>")]
    pub duration: Option<u64>,
    #[ts(as = "Option<u32>")]
    pub height: Option<u64>,
    #[ts(as = "Option<u32>")]
    pub width: Option<u64>,
    pub mimetype: Option<String>,
    #[ts(as = "Option<u32>")]
    pub size: Option<u64>,
    pub thumbnail_info: Option<Box<RpcThumbnailInfo>>,
    pub thumbnail_source: Option<RpcMediaSource>,
}

impl From<&ruma_events::room::message::VideoInfo> for RpcVideoInfo {
    fn from(info: &ruma_events::room::message::VideoInfo) -> Self {
        Self {
            duration: info.duration.map(|d| d.as_millis() as u64),
            height: info.height.map(|h| h.into()),
            width: info.width.map(|w| w.into()),
            mimetype: info.mimetype.clone(),
            size: info.size.map(|s| s.into()),
            thumbnail_info: info
                .thumbnail_info
                .as_ref()
                .map(|ti| Box::new(RpcThumbnailInfo::from(ti.as_ref()))),
            thumbnail_source: info.thumbnail_source.as_ref().map(RpcMediaSource::from),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcAudioInfo {
    #[ts(as = "Option<u32>")]
    pub duration: Option<u64>,
    pub mimetype: Option<String>,
    #[ts(as = "Option<u32>")]
    pub size: Option<u64>,
}

impl From<&ruma_events::room::message::AudioInfo> for RpcAudioInfo {
    fn from(info: &ruma_events::room::message::AudioInfo) -> Self {
        Self {
            duration: info.duration.map(|d| d.as_millis() as u64),
            mimetype: info.mimetype.clone(),
            size: info.size.map(|s| s.into()),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcMediaContent {
    pub body: String,
    pub formatted: Option<RpcFormattedBody>,
    pub filename: Option<String>,
    pub source: RpcMediaSource,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFileMessageContent {
    #[serde(flatten)]
    pub content: RpcMediaContent,
    pub info: Option<RpcFileInfo>,
}

impl From<&ruma_events::room::message::FileMessageEventContent> for RpcFileMessageContent {
    fn from(content: &ruma_events::room::message::FileMessageEventContent) -> Self {
        Self {
            content: RpcMediaContent {
                body: content.body.clone(),
                formatted: content.formatted.as_ref().map(RpcFormattedBody::from),
                filename: content.filename.clone(),
                source: RpcMediaSource::from(&content.source),
            },
            info: content.info.as_ref().map(|i| RpcFileInfo::from(i.as_ref())),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcImageMessageContent {
    #[serde(flatten)]
    pub content: RpcMediaContent,
    pub info: Option<RpcImageInfo>,
}

impl From<&ruma_events::room::message::ImageMessageEventContent> for RpcImageMessageContent {
    fn from(content: &ruma_events::room::message::ImageMessageEventContent) -> Self {
        Self {
            content: RpcMediaContent {
                body: content.body.clone(),
                formatted: content.formatted.as_ref().map(RpcFormattedBody::from),
                filename: content.filename.clone(),
                source: RpcMediaSource::from(&content.source),
            },
            info: content
                .info
                .as_ref()
                .map(|i| RpcImageInfo::from(i.as_ref())),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcVideoMessageContent {
    #[serde(flatten)]
    pub content: RpcMediaContent,
    pub info: Option<RpcVideoInfo>,
}

impl From<&ruma_events::room::message::VideoMessageEventContent> for RpcVideoMessageContent {
    fn from(content: &ruma_events::room::message::VideoMessageEventContent) -> Self {
        Self {
            content: RpcMediaContent {
                body: content.body.clone(),
                formatted: content.formatted.as_ref().map(RpcFormattedBody::from),
                filename: content.filename.clone(),
                source: RpcMediaSource::from(&content.source),
            },
            info: content
                .info
                .as_ref()
                .map(|i| RpcVideoInfo::from(i.as_ref())),
        }
    }
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcAudioMessageContent {
    #[serde(flatten)]
    pub content: RpcMediaContent,
    pub info: Option<RpcAudioInfo>,
}

impl From<&ruma_events::room::message::AudioMessageEventContent> for RpcAudioMessageContent {
    fn from(content: &ruma_events::room::message::AudioMessageEventContent) -> Self {
        Self {
            content: RpcMediaContent {
                body: content.body.clone(),
                formatted: content.formatted.as_ref().map(RpcFormattedBody::from),
                filename: content.filename.clone(),
                source: RpcMediaSource::from(&content.source),
            },
            info: content
                .info
                .as_ref()
                .map(|i| RpcAudioInfo::from(i.as_ref())),
        }
    }
}

// Custom Fedi event types
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RpcMatrixPaymentStatus {
    Pushed,
    Requested,
    Accepted,
    Rejected,
    Canceled,
    Received,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcPaymentMessageContent {
    pub body: String,
    pub status: RpcMatrixPaymentStatus,
    pub payment_id: String,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient_id: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_operation_id: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receiver_operation_id: Option<String>,
    #[ts(type = "number")]
    pub amount: u64,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_id: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ecash: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub federation_id: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bolt11: Option<String>,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invite_code: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum RpcFormType {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "radio")]
    Radio,
    #[serde(rename = "button")]
    Button,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFormOption {
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub i18n_key_label: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFormResponse {
    pub response_type: Option<RpcFormType>,
    pub response_value: RpcFormResponseValue,
    pub response_body: Option<String>,
    pub response_i18n_key: Option<String>,
    pub responding_to_event_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum RpcFormResponseValue {
    String(String),
    Number(#[ts(type = "number")] u64),
    Bool(bool),
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcFormMessageContent {
    pub body: String,
    pub i18n_key_label: Option<String>,
    #[serde(rename = "type")]
    pub form_type: Option<RpcFormType>,
    pub options: Option<Vec<RpcFormOption>>,
    pub value: Option<String>,
    pub form_response: Option<RpcFormResponse>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[serde(tag = "msgtype")]
pub enum RpcMsgLikeKind {
    #[serde(rename = "m.text")]
    Text(RpcTextLikeContent),
    #[serde(rename = "m.notice")]
    Notice(RpcTextLikeContent),
    #[serde(rename = "m.emote")]
    Emote(RpcTextLikeContent),
    #[serde(rename = "xyz.fedi.federationInvite")]
    FederationInvite(RpcTextLikeContent),
    #[serde(rename = "m.file")]
    File(RpcFileMessageContent),
    #[serde(rename = "m.image")]
    Image(RpcImageMessageContent),
    #[serde(rename = "m.video")]
    Video(RpcVideoMessageContent),
    #[serde(rename = "m.audio")]
    Audio(RpcAudioMessageContent),
    #[serde(rename = "m.poll")]
    Poll(RpcPollResult),
    #[serde(rename = "xyz.fedi.payment")]
    Payment(RpcPaymentMessageContent),
    #[serde(rename = "xyz.fedi.form")]
    Form(RpcFormMessageContent),
    #[serde(rename = "xyz.fedi.multispend")]
    Multispend(MultispendEvent),
    FailedToParseCustom {
        msg_type: String,
        error: String,
    },
    Unknown,
    Redacted,
    UnableToDecrypt,
}

impl From<&RumaMessageType> for RpcMsgLikeKind {
    fn from(value: &RumaMessageType) -> Self {
        fn parse_custom_msg<T, F>(msg: &RumaMessageType, constructor: F) -> RpcMsgLikeKind
        where
            T: for<'de> Deserialize<'de>,
            F: Fn(T) -> RpcMsgLikeKind,
        {
            let msg_type_str = msg.msgtype();
            let mut object = msg.data().into_owned();
            object.insert("body".into(), msg.body().into());
            match serde_json::from_value(serde_json::Value::Object(object)) {
                Ok(content) => constructor(content),
                Err(e) => RpcMsgLikeKind::FailedToParseCustom {
                    msg_type: msg_type_str.to_string(),
                    error: e.to_string(),
                },
            }
        }

        match value {
            RumaMessageType::Text(content)
                if content.body.starts_with("fed1")
                    && InviteCode::from_str(&content.body).is_ok() =>
            {
                RpcMsgLikeKind::FederationInvite(content.into())
            }
            RumaMessageType::Text(content) => RpcMsgLikeKind::Text(content.into()),
            RumaMessageType::Notice(content) => {
                RpcMsgLikeKind::Notice(RpcTextLikeContent::from(content))
            }
            RumaMessageType::Emote(content) => {
                RpcMsgLikeKind::Emote(RpcTextLikeContent::from(content))
            }
            RumaMessageType::File(content) => {
                RpcMsgLikeKind::File(RpcFileMessageContent::from(content))
            }
            RumaMessageType::Image(content) => {
                RpcMsgLikeKind::Image(RpcImageMessageContent::from(content))
            }
            RumaMessageType::Video(content) => {
                RpcMsgLikeKind::Video(RpcVideoMessageContent::from(content))
            }
            RumaMessageType::Audio(content) => {
                RpcMsgLikeKind::Audio(RpcAudioMessageContent::from(content))
            }
            RumaMessageType::Location(_)
            | RumaMessageType::ServerNotice(_)
            | RumaMessageType::VerificationRequest(_) => RpcMsgLikeKind::Unknown,
            msg => match msg.msgtype() {
                "xyz.fedi.multispend" => parse_custom_msg(msg, RpcMsgLikeKind::Multispend),
                "xyz.fedi.form" => parse_custom_msg(msg, RpcMsgLikeKind::Form),
                "xyz.fedi.payment" => parse_custom_msg(msg, RpcMsgLikeKind::Payment),
                _ => RpcMsgLikeKind::Unknown,
            },
        }
    }
}

impl From<&MsgLikeKind> for RpcMsgLikeKind {
    fn from(value: &MsgLikeKind) -> Self {
        match &value {
            MsgLikeKind::Message(message) => RpcMsgLikeKind::from(message.msgtype()),
            MsgLikeKind::Poll(poll_state) => {
                RpcMsgLikeKind::Poll(RpcPollResult::from(poll_state.results()))
            }
            MsgLikeKind::Redacted => RpcMsgLikeKind::Redacted,
            MsgLikeKind::Sticker(_) => RpcMsgLikeKind::Unknown,
            MsgLikeKind::UnableToDecrypt(_) => RpcMsgLikeKind::UnableToDecrypt,
        }
    }
}
