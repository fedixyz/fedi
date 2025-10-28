use anyhow::Context;
use base64::engine::general_purpose;
use base64::Engine as _;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::retry;
use nostr::event::EventBuilder;
use nostr::hashes::sha256::Hash as Sha256Hash;
use nostr::hashes::Hash as _;
use nostr::nips::nip98::{HttpData, HttpMethod};
use nostril::Nostril;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::Client;
use runtime::bridge_runtime::Runtime;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub async fn guardianito_get_or_create_bot(
    runtime: &Runtime,
    nostril: &Nostril,
    user_id: String,
) -> anyhow::Result<GuardianitoBot> {
    let endpoint = runtime
        .feature_catalog
        .guardianito
        .api_base_url
        .join("v1/get_or_create_bot")
        .context("guardianito api base url join failed")?;
    let request = GuardianitoBotRequest { user_id };
    let client = Client::new();

    retry(
        "guardianito get_or_create_bot",
        aggressive_backoff(),
        || async {
            let body = serde_json::to_vec(&request)?;
            let auth_header = {
                let http_data = HttpData::new(endpoint.clone(), HttpMethod::POST)
                    .payload(Sha256Hash::hash(&body));
                let event = EventBuilder::http_auth(http_data).sign_with_keys(nostril.keys())?;
                let encoded = general_purpose::STANDARD.encode(serde_json::to_vec(&event)?);
                format!("Nostr {encoded}")
            };

            Ok(client
                .post(endpoint.clone())
                .header(CONTENT_TYPE, "application/json")
                .header(AUTHORIZATION, auth_header)
                .body(body)
                .send()
                .await
                .context("Guardianito get_or_create_bot request failed")?
                .better_error_for_status()
                .await?
                .json()
                .await?)
        },
    )
    .await
}

#[derive(Debug, Clone, Serialize)]
struct GuardianitoBotRequest {
    user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GuardianitoBot {
    pub bot_user_id: String,
    pub bot_room_id: String,
}

trait ResponseExt: Sized {
    async fn better_error_for_status(self) -> anyhow::Result<Self>;
}

impl ResponseExt for reqwest::Response {
    async fn better_error_for_status(self) -> anyhow::Result<Self> {
        let status = self.status();
        if status.is_client_error() || status.is_server_error() {
            anyhow::bail!("Status {status}: {body}", body = self.text().await?)
        } else {
            Ok(self)
        }
    }
}
