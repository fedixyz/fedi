use anyhow::Context as _;
use matrix_sdk::ruma::events::Mentions;
use matrix_sdk::ruma::events::room::message::{
    MessageType, RoomMessageEventContentWithoutRelation,
};
use rpc_types::error::ErrorCode;
use rpc_types::matrix::RpcUserId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub struct SendMessageData {
    msgtype: String,
    body: String,
    #[ts(type = "JSONObject")]
    data: serde_json::Map<String, serde_json::Value>,
    mentions: Option<RpcMentions>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub struct RpcMentions {
    users: Vec<RpcUserId>,
    room: bool,
}

impl SendMessageData {
    pub fn text(body: impl Into<String>) -> Self {
        Self {
            msgtype: "m.text".to_string(),
            body: body.into(),
            data: Default::default(),
            mentions: None,
        }
    }
}

impl TryFrom<SendMessageData> for RoomMessageEventContentWithoutRelation {
    type Error = anyhow::Error;
    fn try_from(value: SendMessageData) -> Result<Self, Self::Error> {
        let mut content = RoomMessageEventContentWithoutRelation::new(
            MessageType::new(&value.msgtype, value.body, value.data)
                .context(ErrorCode::BadRequest)?,
        );

        if let Some(mentions) = value.mentions {
            let user_ids: Vec<matrix_sdk::ruma::OwnedUserId> = mentions
                .users
                .into_iter()
                .filter_map(|id| id.into_typed().ok())
                .collect();
            let mut m = Mentions::with_user_ids(user_ids);
            if mentions.room {
                m.room = true;
            }
            content = content.add_mentions(m);
        }

        Ok(content)
    }
}
