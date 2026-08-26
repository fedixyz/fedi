//! Fedi-owned client for Manifold's installation-scoped push gateway.
//!
//! The native layer supplies only the current FCM token and platform. This
//! adapter owns deterministic recipient identity, the stable installation id,
//! NIP-98 signing, bounded HTTP, and creation of the bearer callback handed to
//! `fi-client`. Callback URLs and FCM tokens must never enter logs or RPC
//! responses.

#[cfg(not(target_arch = "wasm32"))]
use std::net::IpAddr;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose;
use fedi_decentralized_push_gateway_types::{
    CreateHookRequest, CreateHookResponse, DeviceInstallationId, FcmRegistrationToken, HookId,
    HookNotificationSettings, HookOpenBehavior, HookOpenSettings, HookPolicySettings, HookPrivacy,
    NotificationKind, Platform, RegisterInstallationRequest, RegisterInstallationResponse,
};
use fedi_decentralized_service_fleet_manager::{DkgCompletionCallback, DkgCompletionCallbackInput};
use fedimint_core::module::serde_json;
use fedimint_derive_secret::DerivableSecret;
#[cfg(not(target_arch = "wasm32"))]
use nostr::SecretKey;
use nostr::event::EventBuilder;
use nostr::hashes::Hash as _;
use nostr::hashes::sha256::Hash as Sha256Hash;
use nostr::{Keys, Kind, Tag};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Method, Url};
#[cfg(not(target_arch = "wasm32"))]
use runtime::constants::FI_PUSH_RECIPIENT_CHILD_ID;
use runtime::features::RuntimeEnvironment;
use runtime::storage::state::DeviceIdentifier;
use runtime::utils::unix_now;
use serde::Serialize;
use serde::de::DeserializeOwned;

#[cfg(not(target_arch = "wasm32"))]
const RECIPIENT_DOMAIN_LABEL: &str = "fedi-push-gateway/recipient-auth-nostr/v1";
#[cfg(not(target_arch = "wasm32"))]
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
#[cfg(not(target_arch = "wasm32"))]
const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const FORMATION_HOOK_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;
const FORMATION_HOOK_MAX_CLOCK_SKEW_SECONDS: i64 = 5 * 60;
const FORMATION_NOTIFICATION_KIND: &str = "fi_formation_update";
const FORMATION_HOOK_LABEL: &str = "Fedi FI Wallet Service completion";
const FORMATION_NOTIFICATION_TITLE: &str = "Wallet Service update";
const FORMATION_NOTIFICATION_BODY: &str = "Open Fedi to continue.";
const FORMATION_WORKFLOW: &str = "federation_creation";
const FORMATION_ACTION: &str = "resume";

/// Client for one seed-derived recipient and one physical app installation.
///
/// Intentionally has no `Debug` implementation: it owns a signing key and
/// sends bearer/token material even though neither is retained here.
#[derive(Clone)]
pub(crate) struct BridgeFiPushGateway {
    base_url: Url,
    keys: Keys,
    installation_id: DeviceInstallationId,
    client: Client,
}

/// Callback and public management handle for one formation notification.
///
/// `DkgCompletionCallback` redacts its bearer URL from `Debug`; this wrapper
/// deliberately does not add another formatter.
#[derive(Clone)]
pub(crate) struct FiDkgPushHook {
    pub(crate) callback: DkgCompletionCallback,
    hook_id: HookId,
}

impl FiDkgPushHook {
    pub(crate) fn new(callback: DkgCompletionCallback, hook_id: HookId) -> Self {
        Self { callback, hook_id }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FiPushPlatform {
    Android,
    Ios,
}

impl FiPushPlatform {
    fn wire_value(self) -> Platform {
        Platform(
            match self {
                Self::Android => "android",
                Self::Ios => "ios",
            }
            .to_owned(),
        )
    }
}

/// Sanitized failure returned to the FI RPC projection.
#[derive(Debug, thiserror::Error)]
pub(crate) enum FiPushError {
    #[error("FI push notifications are not configured for this environment")]
    Unavailable,
    #[error("FI push notification configuration is invalid")]
    InvalidConfiguration,
    #[error("FI push notification request could not be encoded")]
    RequestEncoding,
    #[error("FI push notification service is unreachable")]
    Transport,
    #[cfg(not(target_arch = "wasm32"))]
    #[error("FI push notification service rejected the request ({status}, {code})")]
    Rejected { status: u16, code: String },
    #[error("FI push notification service returned an invalid response")]
    InvalidResponse,
}

impl BridgeFiPushGateway {
    #[cfg(not(target_arch = "wasm32"))]
    pub(crate) fn from_parts(
        root_secret: &DerivableSecret,
        environment: RuntimeEnvironment,
        device_identifier: &DeviceIdentifier,
        base_url: Option<Url>,
    ) -> Result<Self, FiPushError> {
        let base_url = base_url.ok_or(FiPushError::Unavailable)?;
        let allow_loopback_http = matches!(
            environment,
            RuntimeEnvironment::Dev | RuntimeEnvironment::Tests
        );
        let base_url = validate_base_url(base_url, allow_loopback_http)?;
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|_| FiPushError::InvalidConfiguration)?;
        Ok(Self {
            base_url,
            keys: derive_recipient_keys(root_secret, environment),
            installation_id: DeviceInstallationId(device_identifier.to_string()),
            client,
        })
    }

    /// Browser builds have neither a native FCM installation nor a redirect-
    /// rejecting `reqwest` transport. Keep the RPC surface compilable while
    /// failing push setup closed instead of silently weakening the bearer and
    /// token transport boundary.
    #[cfg(target_arch = "wasm32")]
    pub(crate) fn from_parts(
        _root_secret: &DerivableSecret,
        _environment: RuntimeEnvironment,
        _device_identifier: &DeviceIdentifier,
        _base_url: Option<Url>,
    ) -> Result<Self, FiPushError> {
        Err(FiPushError::Unavailable)
    }

    pub(crate) fn recipient_id(&self) -> String {
        self.keys.public_key.to_hex()
    }

    pub(crate) fn installation_id(&self) -> &str {
        &self.installation_id.0
    }

    pub(crate) async fn register_installation(
        &self,
        fcm_token: FcmRegistrationToken,
        platform: FiPushPlatform,
    ) -> Result<(), FiPushError> {
        let request = RegisterInstallationRequest {
            installation_id: self.installation_id.clone(),
            fcm_token,
            platform: Some(platform.wire_value()),
        };
        let response: RegisterInstallationResponse = self
            .send_json(Method::POST, &["registrations"], &request)
            .await?;
        if response.registered && !response.unregistered && !response.disabled {
            Ok(())
        } else {
            Err(FiPushError::InvalidResponse)
        }
    }

    pub(crate) async fn unregister_installation(&self) -> Result<(), FiPushError> {
        let response: RegisterInstallationResponse = self
            .send_empty(
                Method::DELETE,
                &["registrations", self.installation_id.0.as_str()],
            )
            .await?;
        if !response.registered && response.unregistered && !response.disabled {
            Ok(())
        } else {
            Err(FiPushError::InvalidResponse)
        }
    }

    pub(crate) async fn create_formation_hook(&self) -> Result<FiDkgPushHook, FiPushError> {
        let request = CreateHookRequest {
            installation_id: self.installation_id.clone(),
            label: Some(FORMATION_HOOK_LABEL.to_owned()),
            notification: HookNotificationSettings {
                kind: Some(NotificationKind(FORMATION_NOTIFICATION_KIND.to_owned())),
                title: Some(FORMATION_NOTIFICATION_TITLE.to_owned()),
                body: Some(FORMATION_NOTIFICATION_BODY.to_owned()),
                privacy: Some(HookPrivacy::DisplayText),
            },
            open: HookOpenSettings {
                open_behavior: Some(HookOpenBehavior::OpenWorkflow),
                workflow: Some(FORMATION_WORKFLOW.to_owned()),
                action: Some(FORMATION_ACTION.to_owned()),
                deep_link: None,
            },
            data: Default::default(),
            policy: HookPolicySettings {
                expires_in_seconds: Some(FORMATION_HOOK_TTL_SECONDS),
                max_uses: Some(1),
                rate_limit: None,
            },
        };
        let request_started_at = current_unix_seconds()?;
        let response: CreateHookResponse = self
            .send_json(Method::POST, &["v1", "hooks"], &request)
            .await?;
        let response_received_at = current_unix_seconds()?;
        self.validate_hook_response(&response, request_started_at, response_received_at)?;
        let hook_id = response.hook.hook_id.clone();
        let callback = DkgCompletionCallback::new(DkgCompletionCallbackInput {
            callback_url: response.invocation_url,
            idempotency_key: format!("fi-dkg-complete:{}", hook_id.0),
        })
        .map_err(|_| FiPushError::InvalidResponse)?;
        Ok(FiDkgPushHook::new(callback, hook_id))
    }

    pub(crate) async fn revoke_hook(&self, hook: &FiDkgPushHook) -> Result<(), FiPushError> {
        // The revoke response is deliberately ignored beyond its typed JSON
        // shape by the generic sender. Revocation is best-effort cleanup after
        // Manifold proves that no durable formation owns the callback.
        let _: serde_json::Value = self
            .send_empty(Method::DELETE, &["v1", "hooks", hook.hook_id.0.as_str()])
            .await?;
        Ok(())
    }

    fn validate_hook_response(
        &self,
        response: &CreateHookResponse,
        request_started_at: i64,
        response_received_at: i64,
    ) -> Result<(), FiPushError> {
        let expected_expires_at = response
            .hook
            .created_at
            .checked_add(FORMATION_HOOK_TTL_SECONDS)
            .ok_or(FiPushError::InvalidResponse)?;
        let earliest_created_at = request_started_at
            .checked_sub(FORMATION_HOOK_MAX_CLOCK_SKEW_SECONDS)
            .ok_or(FiPushError::InvalidResponse)?;
        let latest_created_at = response_received_at
            .checked_add(FORMATION_HOOK_MAX_CLOCK_SKEW_SECONDS)
            .ok_or(FiPushError::InvalidResponse)?;
        if response.hook.recipient_id.0 != self.recipient_id()
            || response_received_at < request_started_at
            || response.hook.created_at < earliest_created_at
            || response.hook.created_at > latest_created_at
            || expected_expires_at <= response_received_at
            || response.hook.installation_id != self.installation_id
            || response.hook.label.as_deref() != Some(FORMATION_HOOK_LABEL)
            || response.hook.policy.max_uses != Some(1)
            || response
                .hook
                .policy
                .rate_limit
                .as_ref()
                .is_some_and(|rate_limit| {
                    rate_limit.window_seconds <= 0
                        || rate_limit.max_requests <= 0
                        || rate_limit.window_started_at.is_some()
                        || rate_limit.count != 0
                })
            || response.hook.policy.expires_at != Some(expected_expires_at)
            || response.hook.revoked_at.is_some()
            || response.hook.use_count != 0
            || response.hook.last_used_at.is_some()
            || response
                .hook
                .notification
                .kind
                .as_ref()
                .map(|kind| kind.0.as_str())
                != Some(FORMATION_NOTIFICATION_KIND)
            || response.hook.notification.title.as_deref() != Some(FORMATION_NOTIFICATION_TITLE)
            || response.hook.notification.body.as_deref() != Some(FORMATION_NOTIFICATION_BODY)
            || response.hook.notification.privacy != HookPrivacy::DisplayText
            || response.hook.open.open_behavior != HookOpenBehavior::OpenWorkflow
            || response.hook.open.workflow.as_deref() != Some(FORMATION_WORKFLOW)
            || response.hook.open.action.as_deref() != Some(FORMATION_ACTION)
            || response.hook.open.deep_link.is_some()
            || !response.hook.data.is_empty()
            || response.hook_secret.is_empty()
        {
            return Err(FiPushError::InvalidResponse);
        }
        let callback_url =
            Url::parse(&response.invocation_url).map_err(|_| FiPushError::InvalidResponse)?;
        if callback_url.origin() != self.base_url.origin()
            || callback_url.username() != self.base_url.username()
            || callback_url.password() != self.base_url.password()
            || callback_url.query().is_some()
            || callback_url.fragment().is_some()
        {
            return Err(FiPushError::InvalidResponse);
        }
        let components = callback_url
            .path_segments()
            .ok_or(FiPushError::InvalidResponse)?
            .collect::<Vec<_>>();
        if components.as_slice()
            != [
                "hooks",
                response.hook.hook_id.0.as_str(),
                response.hook_secret.as_str(),
            ]
        {
            return Err(FiPushError::InvalidResponse);
        }
        Ok(())
    }

    async fn send_json<Request, Response>(
        &self,
        method: Method,
        path_segments: &[&str],
        request: &Request,
    ) -> Result<Response, FiPushError>
    where
        Request: Serialize,
        Response: DeserializeOwned,
    {
        let endpoint = endpoint_with_segments(&self.base_url, path_segments)?;
        let body = serde_json::to_vec(request).map_err(|_| FiPushError::RequestEncoding)?;
        let authorization = self.authorization(&endpoint, &method, Some(&body))?;
        let response = self
            .client
            .request(method, endpoint)
            .header(CONTENT_TYPE, "application/json")
            .header(AUTHORIZATION, authorization)
            .body(body)
            .send()
            .await
            .map_err(|_| FiPushError::Transport)?;
        decode_response(response).await
    }

    async fn send_empty<Response>(
        &self,
        method: Method,
        path_segments: &[&str],
    ) -> Result<Response, FiPushError>
    where
        Response: DeserializeOwned,
    {
        let endpoint = endpoint_with_segments(&self.base_url, path_segments)?;
        let authorization = self.authorization(&endpoint, &method, None)?;
        let response = self
            .client
            .request(method, endpoint)
            .header(AUTHORIZATION, authorization)
            .send()
            .await
            .map_err(|_| FiPushError::Transport)?;
        decode_response(response).await
    }

    fn authorization(
        &self,
        endpoint: &Url,
        method: &Method,
        body: Option<&[u8]>,
    ) -> Result<String, FiPushError> {
        let http_method = match *method {
            Method::POST => "POST",
            Method::DELETE => "DELETE",
            _ => return Err(FiPushError::RequestEncoding),
        };
        let nonce = hex::encode(rand::random::<[u8; 16]>());
        // nostr's typed NIP-98 helper does not currently model DELETE even
        // though the gateway's management API requires it. Construct the
        // standard kind-27235 event directly so the signed method remains the
        // exact HTTP method that the gateway verifies. A signed random nonce
        // keeps otherwise identical requests within one timestamp second from
        // colliding in the gateway's replay cache.
        let mut builder = EventBuilder::new(Kind::HttpAuth, "")
            .tag(Tag::parse(["u", endpoint.as_str()]).map_err(|_| FiPushError::RequestEncoding)?)
            .tag(Tag::parse(["method", http_method]).map_err(|_| FiPushError::RequestEncoding)?)
            .tag(Tag::parse(["nonce", nonce.as_str()]).map_err(|_| FiPushError::RequestEncoding)?);
        if let Some(body) = body {
            let payload = Sha256Hash::hash(body).to_string();
            builder = builder.tag(
                Tag::parse(["payload", payload.as_str()])
                    .map_err(|_| FiPushError::RequestEncoding)?,
            );
        }
        let event = builder
            .sign_with_keys(&self.keys)
            .map_err(|_| FiPushError::RequestEncoding)?;
        let encoded = general_purpose::STANDARD
            .encode(serde_json::to_vec(&event).map_err(|_| FiPushError::RequestEncoding)?);
        Ok(format!("Nostr {encoded}"))
    }
}

fn current_unix_seconds() -> Result<i64, FiPushError> {
    unix_now()
        .map_err(|_| FiPushError::InvalidResponse)
        .and_then(|now| i64::try_from(now).map_err(|_| FiPushError::InvalidResponse))
}

#[cfg(not(target_arch = "wasm32"))]
fn derive_recipient_keys(root_secret: &DerivableSecret, environment: RuntimeEnvironment) -> Keys {
    let family_secret = root_secret.child_key(FI_PUSH_RECIPIENT_CHILD_ID);
    let family_bytes: [u8; 32] = family_secret.to_random_bytes();
    let environment = match environment {
        RuntimeEnvironment::Dev | RuntimeEnvironment::Tests => "development",
        RuntimeEnvironment::Staging => "staging",
        RuntimeEnvironment::Edge | RuntimeEnvironment::Prod => "production",
    };
    let context = format!("{RECIPIENT_DOMAIN_LABEL}\0{environment}");
    let recipient_secret = DerivableSecret::new_root(&family_bytes, context.as_bytes());
    let keypair = recipient_secret.to_secp_key(nostr::secp256k1::SECP256K1);
    Keys::new(SecretKey::from(keypair.secret_key()))
}

#[cfg(not(target_arch = "wasm32"))]
fn validate_base_url(mut base_url: Url, allow_loopback_http: bool) -> Result<Url, FiPushError> {
    let is_loopback = base_url.host_str().is_some_and(|host| {
        host.eq_ignore_ascii_case("localhost")
            || host
                .parse::<IpAddr>()
                .is_ok_and(|address| address.is_loopback())
    });
    if base_url.cannot_be_a_base()
        || base_url.host_str().is_none()
        || !base_url.username().is_empty()
        || base_url.password().is_some()
        || base_url.query().is_some()
        || base_url.fragment().is_some()
        || (base_url.scheme() != "https"
            && !(allow_loopback_http && base_url.scheme() == "http" && is_loopback))
        || !matches!(base_url.path(), "" | "/")
    {
        return Err(FiPushError::InvalidConfiguration);
    }
    base_url.set_path("/");
    Ok(base_url)
}

fn endpoint_with_segments(base_url: &Url, segments: &[&str]) -> Result<Url, FiPushError> {
    let mut endpoint = base_url.clone();
    let mut path = endpoint
        .path_segments_mut()
        .map_err(|_| FiPushError::InvalidConfiguration)?;
    path.pop_if_empty();
    for segment in segments {
        path.push(segment);
    }
    drop(path);
    Ok(endpoint)
}

#[cfg(not(target_arch = "wasm32"))]
async fn decode_response<Response>(mut response: reqwest::Response) -> Result<Response, FiPushError>
where
    Response: DeserializeOwned,
{
    let status = response.status();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| FiPushError::Transport)? {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(FiPushError::InvalidResponse);
        }
        body.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        return Err(FiPushError::Rejected {
            status: status.as_u16(),
            code: sanitized_error_code(&body),
        });
    }
    serde_json::from_slice(&body).map_err(|_| FiPushError::InvalidResponse)
}

#[cfg(target_arch = "wasm32")]
async fn decode_response<Response>(_response: reqwest::Response) -> Result<Response, FiPushError>
where
    Response: DeserializeOwned,
{
    // `BridgeFiPushGateway::from_parts` is unconstructable on this target.
    // Retaining a fail-closed decoder keeps generic methods type-checkable
    // without buffering an unbounded browser response or following redirects.
    Err(FiPushError::Unavailable)
}

#[cfg(not(target_arch = "wasm32"))]
fn sanitized_error_code(body: &[u8]) -> String {
    let code = serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("error")?.get("code")?.as_str().map(str::to_owned))
        .filter(|code| {
            !code.is_empty()
                && code.len() <= 128
                && code
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        });
    code.unwrap_or_else(|| "request_rejected".to_owned())
}

#[cfg(test)]
mod tests;
