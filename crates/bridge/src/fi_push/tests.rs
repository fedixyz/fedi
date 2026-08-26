use std::str::FromStr as _;

use fedi_decentralized_push_gateway_types::{
    HookNotificationRecord, HookOpenRecord, HookPolicyRecord, HookRecord, RecipientId,
};

use super::*; // nosemgrep: ban-wildcard-imports -- split test module

fn root(byte: u8) -> DerivableSecret {
    DerivableSecret::new_root(&[byte; 32], b"fi-push-test-root")
}

fn gateway() -> BridgeFiPushGateway {
    let device = DeviceIdentifier::from_str("phone:mobile:test-installation").unwrap();
    BridgeFiPushGateway::from_parts(
        &root(9),
        RuntimeEnvironment::Tests,
        &device,
        Some(Url::parse("http://127.0.0.1:3000/").unwrap()),
    )
    .unwrap()
}

fn hook_response(
    gateway: &BridgeFiPushGateway,
    created_at: i64,
    expires_at: Option<i64>,
) -> CreateHookResponse {
    let hook_id = HookId("hook-id".to_owned());
    let hook_secret = "hook-secret".to_owned();
    CreateHookResponse {
        hook: HookRecord {
            hook_id: hook_id.clone(),
            recipient_id: RecipientId(gateway.recipient_id()),
            installation_id: gateway.installation_id.clone(),
            label: Some(FORMATION_HOOK_LABEL.to_owned()),
            notification: HookNotificationRecord {
                kind: Some(NotificationKind(FORMATION_NOTIFICATION_KIND.to_owned())),
                title: Some(FORMATION_NOTIFICATION_TITLE.to_owned()),
                body: Some(FORMATION_NOTIFICATION_BODY.to_owned()),
                privacy: HookPrivacy::DisplayText,
            },
            open: HookOpenRecord {
                open_behavior: HookOpenBehavior::OpenWorkflow,
                workflow: Some(FORMATION_WORKFLOW.to_owned()),
                action: Some(FORMATION_ACTION.to_owned()),
                deep_link: None,
            },
            data: Default::default(),
            policy: HookPolicyRecord {
                expires_at,
                max_uses: Some(1),
                rate_limit: None,
            },
            created_at,
            revoked_at: None,
            use_count: 0,
            last_used_at: None,
        },
        invocation_url: format!("http://127.0.0.1:3000/hooks/{}/{}", hook_id.0, hook_secret),
        hook_secret,
    }
}

#[test]
fn formation_route_matches_the_shared_ui_consumer_contract_fixture() {
    let fixture =
        std::fs::read_to_string("../../ui/common/tests/fixtures/fiFormationPushRoute.json")
            .unwrap();
    let route: std::collections::BTreeMap<String, String> = serde_json::from_str(&fixture).unwrap();
    assert_eq!(
        route.get("kind").map(String::as_str),
        Some(FORMATION_NOTIFICATION_KIND)
    );
    assert_eq!(
        route.get("pg.open_behavior").map(String::as_str),
        Some("open_workflow")
    );
    assert_eq!(
        route.get("pg.privacy").map(String::as_str),
        Some("display_text")
    );
    assert_eq!(
        route.get("pg.workflow").map(String::as_str),
        Some(FORMATION_WORKFLOW)
    );
    assert_eq!(
        route.get("pg.action").map(String::as_str),
        Some(FORMATION_ACTION)
    );
    assert_eq!(route.len(), 5);
}

#[test]
fn recipient_identity_is_stable_and_environment_separated() {
    let development = derive_recipient_keys(&root(7), RuntimeEnvironment::Dev)
        .public_key
        .to_hex();
    let tests = derive_recipient_keys(&root(7), RuntimeEnvironment::Tests)
        .public_key
        .to_hex();
    let staging = derive_recipient_keys(&root(7), RuntimeEnvironment::Staging)
        .public_key
        .to_hex();
    let production = derive_recipient_keys(&root(7), RuntimeEnvironment::Prod)
        .public_key
        .to_hex();
    assert_eq!(development, tests);
    assert_ne!(development, staging);
    assert_ne!(development, production);
    assert_ne!(staging, production);
    // Golden values: changing any of them would orphan existing gateway ownership.
    assert_eq!(
        development,
        "e3d1c822253f9f11335189420a98cff91bbe7811a38bd2d8b860c29d904d549e"
    );
    assert_eq!(
        staging,
        "c5aaffb8b76ae57ef11d763936799363098d00eaa5498fc876b663b4da4ad501"
    );
    assert_eq!(
        production,
        "8e056419c4aafeb08ee7d4e33a80cc6fc0da83145cce80b603a9653fe58a65b2"
    );
}

#[test]
fn production_requires_https_and_root_origin() {
    for invalid in [
        "http://push.example/",
        "https://user@push.example/",
        "https://push.example/path",
        "https://push.example/?query=1",
    ] {
        assert!(validate_base_url(Url::parse(invalid).unwrap(), false).is_err());
    }
    assert_eq!(
        validate_base_url(Url::parse("https://push.example").unwrap(), false)
            .unwrap()
            .as_str(),
        "https://push.example/"
    );
    assert!(validate_base_url(Url::parse("http://127.0.0.1:1234").unwrap(), true).is_ok());
}

#[test]
fn endpoint_segments_encode_device_identifier_as_one_segment() {
    let endpoint = endpoint_with_segments(
        &Url::parse("https://push.example/").unwrap(),
        &["registrations", "phone/name:mobile:uuid"],
    )
    .unwrap();
    assert_eq!(
        endpoint.as_str(),
        "https://push.example/registrations/phone%2Fname:mobile:uuid"
    );
}

#[test]
fn arbitrary_server_error_content_is_not_returned() {
    assert_eq!(
        sanitized_error_code(b"bearer-secret-in-error"),
        "request_rejected"
    );
    assert_eq!(
        sanitized_error_code(br#"{"error":{"code":"invalid_fcm_token"}}"#),
        "invalid_fcm_token"
    );
    assert_eq!(
        sanitized_error_code(br#"{"error":{"code":"secret/in/path"}}"#),
        "request_rejected"
    );
}

#[test]
fn hook_response_requires_exact_fresh_non_overflowing_formation_lifetime() {
    let gateway = gateway();
    let request_started_at = 1_700_000_000;
    let response_received_at = request_started_at + 15;
    let created_at = request_started_at;
    let exact = created_at + FORMATION_HOOK_TTL_SECONDS;
    assert!(
        gateway
            .validate_hook_response(
                &hook_response(&gateway, created_at, Some(exact)),
                request_started_at,
                response_received_at,
            )
            .is_ok()
    );
    for invalid in [None, Some(exact - 1), Some(exact + 1), Some(created_at)] {
        assert!(
            gateway
                .validate_hook_response(
                    &hook_response(&gateway, created_at, invalid),
                    request_started_at,
                    response_received_at,
                )
                .is_err()
        );
    }
    assert!(
        gateway
            .validate_hook_response(
                &hook_response(&gateway, i64::MAX, Some(i64::MAX)),
                request_started_at,
                response_received_at,
            )
            .is_err()
    );

    for boundary in [
        request_started_at - FORMATION_HOOK_MAX_CLOCK_SKEW_SECONDS,
        response_received_at + FORMATION_HOOK_MAX_CLOCK_SKEW_SECONDS,
    ] {
        assert!(
            gateway
                .validate_hook_response(
                    &hook_response(
                        &gateway,
                        boundary,
                        Some(boundary + FORMATION_HOOK_TTL_SECONDS),
                    ),
                    request_started_at,
                    response_received_at,
                )
                .is_ok()
        );
    }

    for stale_or_future in [
        request_started_at - FORMATION_HOOK_MAX_CLOCK_SKEW_SECONDS - 1,
        response_received_at + FORMATION_HOOK_MAX_CLOCK_SKEW_SECONDS + 1,
    ] {
        assert!(
            gateway
                .validate_hook_response(
                    &hook_response(
                        &gateway,
                        stale_or_future,
                        Some(stale_or_future + FORMATION_HOOK_TTL_SECONDS),
                    ),
                    request_started_at,
                    response_received_at,
                )
                .is_err()
        );
    }

    assert!(
        gateway
            .validate_hook_response(
                &hook_response(&gateway, created_at, Some(exact)),
                response_received_at,
                request_started_at,
            )
            .is_err()
    );
}

#[test]
fn hook_response_rejects_malformed_or_cross_origin_callback_capabilities() {
    let gateway = gateway();
    let created_at = 1_700_000_000;
    let expires_at = Some(created_at + FORMATION_HOOK_TTL_SECONDS);

    let mut cross_origin = hook_response(&gateway, created_at, expires_at);
    cross_origin.invocation_url = "http://other.example/hooks/hook-id/hook-secret".to_owned();
    assert!(
        gateway
            .validate_hook_response(&cross_origin, created_at - 1, created_at + 1)
            .is_err()
    );

    let mut wrong_path = hook_response(&gateway, created_at, expires_at);
    wrong_path.invocation_url = "http://127.0.0.1:3000/v1/hooks/hook-id/hook-secret".to_owned();
    assert!(
        gateway
            .validate_hook_response(&wrong_path, created_at - 1, created_at + 1)
            .is_err()
    );

    let mut mismatched_secret = hook_response(&gateway, created_at, expires_at);
    mismatched_secret.hook_secret = "different-secret".to_owned();
    assert!(
        gateway
            .validate_hook_response(&mismatched_secret, created_at - 1, created_at + 1)
            .is_err()
    );
}

#[test]
fn signed_management_requests_bind_method_payload_and_unique_nonce() {
    let gateway = gateway();
    let endpoint = Url::parse("http://127.0.0.1:3000/registrations").unwrap();
    let body = br#"{"test":true}"#;
    let first = gateway
        .authorization(&endpoint, &Method::POST, Some(body))
        .unwrap();
    let second = gateway
        .authorization(&endpoint, &Method::POST, Some(body))
        .unwrap();
    assert_ne!(first, second, "auth replay ids must be unique");

    let event = decode_authorization(&first);
    assert_eq!(event.kind, Kind::HttpAuth);
    assert_eq!(tag_value(&event, "u"), Some(endpoint.as_str()));
    assert_eq!(tag_value(&event, "method"), Some("POST"));
    let payload = Sha256Hash::hash(body).to_string();
    assert_eq!(tag_value(&event, "payload"), Some(payload.as_str()));
    assert!(tag_value(&event, "nonce").is_some());

    let delete = decode_authorization(
        &gateway
            .authorization(&endpoint, &Method::DELETE, None)
            .unwrap(),
    );
    assert_eq!(tag_value(&delete, "method"), Some("DELETE"));
    assert_eq!(tag_value(&delete, "payload"), None);
}

fn decode_authorization(header: &str) -> nostr::Event {
    let encoded = header.strip_prefix("Nostr ").expect("Nostr scheme");
    let bytes = general_purpose::STANDARD.decode(encoded).unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

fn tag_value<'a>(event: &'a nostr::Event, name: &str) -> Option<&'a str> {
    event.tags.iter().find_map(|tag| {
        let values = tag.as_slice();
        (values.len() >= 2 && values[0] == name).then_some(values[1].as_str())
    })
}
