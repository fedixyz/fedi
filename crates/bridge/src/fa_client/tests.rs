use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool as TestAtomicBool, AtomicUsize, Ordering as AtomicOrdering};

use fa_client::{UnavailableFaFeeAccountProvider, UnavailablePayments};
use fedimint_core::db::mem_impl::MemDatabase;
use fedimint_core::db::{
    Database, DatabaseValue, DecodingError, IDatabaseTransactionOpsCore,
    IDatabaseTransactionOpsCoreTyped, IRawDatabaseExt,
};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::impl_db_record;
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::task::TaskGroup;
use futures::StreamExt as _;
use runtime::db::FederationPendingRejoinFromScratchKey;
use tokio::sync::Notify;

use super::*; // nosemgrep: ban-wildcard-imports -- split test module

mod push_lifecycle;

fn test_locator() -> Locator {
    let endpoint_addr = fedi_iroh_rpc::iroh::EndpointAddr::new(
        fedi_iroh_rpc::iroh::SecretKey::from_bytes(&[7; 32]).public(),
    );
    let service_pubkey =
        bitcoin::secp256k1::Keypair::from_seckey_slice(bitcoin::secp256k1::SECP256K1, &[5; 32])
            .expect("valid test secret")
            .x_only_public_key()
            .0
            .to_string();
    serde_json::from_value(serde_json::json!({
        "version": 1,
        "endpoint_addr": endpoint_addr,
        "service_pubkey": service_pubkey,
    }))
    .expect("valid test locator")
}

fn payment_authorization_id(byte: u8) -> PaymentAuthorizationId {
    PaymentAuthorizationId::try_from_opaque(hex::encode([byte; 32]))
        .expect("valid payment authorization digest")
}

fn fedimintd_version_range(version: &str) -> FedimintdVersionRange {
    FedimintdVersionRange::one_core(
        version
            .parse::<FedimintdVersion>()
            .expect("test Fedimint version is valid")
            .core(),
    )
    .expect("test Fedimint version can form a range")
}

fn fedimintd_dkg_version(version: &str) -> fa_client::FedimintdDkgVersion {
    version
        .parse::<FedimintdVersion>()
        .expect("test Fedimint version is valid")
        .dkg_version()
}

fn test_restored_formation(freshness: FormationFreshness) -> RestoredFormationSnapshot {
    let federation_id: fedimint_core::config::FederationId = "22".repeat(32).parse().unwrap();
    let invite = FedimintInviteCode::new(
        "wss://guardian.example.com".parse().unwrap(),
        fedimint_core::PeerId::from(0),
        federation_id,
        None,
    );
    RestoredFormationSnapshot {
        snapshot_generation: 3,
        formation_id: FormationId("restored-formation".to_owned()),
        federation_invite: InviteCode(invite.to_string()),
        federation_name: Some(FederationName("Restored Federation".to_owned())),
        seats: Vec::new(),
        phase: FormationPhase::Formed,
        freshness,
        backup_eligible: false,
    }
}

#[repr(u8)]
enum TestFaDbPrefix {
    ActiveFormation = 0x00,
}

#[derive(Debug, Decodable, Encodable)]
struct TestActiveFormationKey;

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
struct TestStoredFormation {
    schema_version: u16,
    #[serde(rename = "fi_id")]
    fa_id: Option<FaId>,
    formation_id: fa_client::FormationId,
    phase: TestStoredFormationPhase,
    intent: ResolvedFormationIntent,
    seat_count: u16,
    creation_mode: TestFormationCreationMode,
    payment_authorization: Option<serde_json::Value>,
    payment_reservation_id: Option<serde_json::Value>,
    payment_authorization_recorded: bool,
    payment_outputs_started: bool,
    invite_code: Option<InviteCode>,
    seat_bindings: Option<String>,
}

impl DatabaseValue for TestStoredFormation {
    fn from_bytes(data: &[u8], _modules: &ModuleDecoderRegistry) -> Result<Self, DecodingError> {
        serde_json::from_slice(data).map_err(DecodingError::other)
    }

    fn to_bytes(&self) -> Vec<u8> {
        serde_json::to_vec(self).expect("FA identity fixture must serialize")
    }
}

#[derive(Clone, Copy, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
enum TestStoredFormationPhase {
    Initialized,
}

#[derive(Clone, Copy, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
enum TestFormationCreationMode {
    Pinned,
}

impl_db_record!(
    key = TestActiveFormationKey,
    value = TestStoredFormation,
    db_prefix = TestFaDbPrefix::ActiveFormation,
);

#[derive(Clone, Default)]
struct TestRegistry;

impl FaNostrClient for TestRegistry {
    async fn fetch_mg_advertisement(
        &self,
        _mg_pubkey: PublicKey,
        _timeout: Duration,
    ) -> NostrClientResult<Event> {
        panic!("identity reopen does not access the registry")
    }

    async fn fetch_setup_payment_federations(
        &self,
        _publisher: PublicKey,
        _timeout: Duration,
    ) -> NostrClientResult<Vec<Event>> {
        panic!("identity reopen does not access the registry")
    }

    async fn fetch_mg_advertisements(&self, _timeout: Duration) -> NostrClientResult<Vec<Event>> {
        panic!("identity reopen does not access the registry")
    }
}

#[derive(Default)]
struct TestConnector;

impl ManifoldGuardianConnector for TestConnector {
    type Client = ManifoldGuardianServiceClient;

    async fn connect(
        &self,
        _locator: &Locator,
    ) -> Result<Self::Client, ManifoldGuardianConnectorError> {
        panic!("identity reopen does not connect to a Manifold Guardian")
    }

    async fn get_availability(
        &self,
        _client: &Self::Client,
        _request: GetAvailabilityRequest,
    ) -> Result<Result<GetAvailabilityResponse, ManifoldGuardianError>, ManifoldGuardianCallError>
    {
        panic!("identity reopen does not call a Manifold Guardian")
    }

    async fn get_quote(
        &self,
        _client: &Self::Client,
        _request: GetQuoteRequest,
    ) -> Result<
        Result<SignedResponse<GetQuoteResponse>, ManifoldGuardianError>,
        ManifoldGuardianCallError,
    > {
        panic!("identity reopen does not call a Manifold Guardian")
    }
}

#[derive(Clone)]
struct TestConsensusReader;

impl FederationConsensusReader for TestConsensusReader {
    async fn read_consensus(
        &self,
        _invite_code: &InviteCode,
    ) -> Result<FederationConsensusSnapshot, FederationConsensusError> {
        panic!("identity reopen does not read federation consensus")
    }

    async fn read_lnv2_gateways(
        &self,
        _invite_code: &InviteCode,
    ) -> Result<Vec<GatewayApiUrl>, FederationConsensusError> {
        panic!("identity reopen does not read federation gateways")
    }
}

type TestBridgeFaClient = FaClient<
    BridgeFaIdentity,
    UnavailablePayments,
    TestRegistry,
    TestConnector,
    TestConsensusReader,
>;

async fn open_test_fa_client(
    database: Database,
    identity: BridgeFaIdentity,
) -> FaResult<TestBridgeFaClient> {
    let profile = ManifoldEnvironment::Development
        .profile()
        .expect("development profile is valid");
    let verifier = PeerBadgeVerifier::try_from_profile(&profile)
        .expect("development PeerBadge profile is valid");
    FaClient::open(
        database,
        identity,
        UnavailablePayments,
        TestRegistry,
        TestConnector,
        verifier,
        TestConsensusReader,
        UnavailableFaFeeAccountProvider,
    )
    .await
}

fn bridge_fa_id(identity: &BridgeFaIdentity) -> FaId {
    let keypair = identity
        .scoped_root()
        .child_key(fedimint_derive_secret::ChildId(0))
        .to_secp_key(bitcoin::secp256k1::SECP256K1);
    serde_json::from_value(serde_json::to_value(keypair.x_only_public_key().0).unwrap()).unwrap()
}

async fn seed_identity_bound_formation(database: &Database, fa_id: FaId) {
    let mut dbtx = database.begin_transaction().await;
    dbtx.insert_entry(
        &TestActiveFormationKey,
        &TestStoredFormation {
            schema_version: 9,
            fa_id: Some(fa_id),
            formation_id: fa_client::FormationId("identity-vector".to_owned()),
            phase: TestStoredFormationPhase::Initialized,
            intent: ResolvedFormationIntent {
                federation_name: fa_client::FederationName("Identity vector federation".to_owned()),
                // This storage fixture exercises only the identity-owner
                // tombstone. A zero-seat record avoids copying Manifold's
                // private seat schema into the consumer regression.
                federation_size: FederationSize(0),
                plan: PlanPreference::InfiniteBestEffort,
                fedimintd_versions: fedimintd_version_range("0.11.1-fedi10"),
                fedimintd_dkg_version: fedimintd_dkg_version("0.11.1-fedi10"),
                max_total_msats: Some(100_000),
            },
            seat_count: 0,
            creation_mode: TestFormationCreationMode::Pinned,
            payment_authorization: None,
            payment_reservation_id: None,
            payment_authorization_recorded: false,
            payment_outputs_started: false,
            invite_code: None,
            seat_bindings: None,
        },
    )
    .await;
    dbtx.commit_tx().await;
}

#[tokio::test]
async fn old_guardian_fee_field_is_migrated_before_manifold_opens() {
    let root = DerivableSecret::new_root(&[1; 32], b"fi-client-migration-test");
    let identity = BridgeFaIdentity::from_root_secret(&root);
    let fa_id = bridge_fa_id(&identity);
    let development = ManifoldEnvironment::Development
        .profile()
        .expect("development profile is valid");
    let staging = ManifoldEnvironment::Staging
        .profile()
        .expect("staging profile is valid");
    let database = MemDatabase::new().into_database();
    seed_identity_bound_formation(&database, fa_id).await;
    let mut dbtx = database.begin_transaction().await;
    let bytes = dbtx
        .raw_get_bytes(FA_ACTIVE_FORMATION_KEY)
        .await
        .unwrap()
        .expect("test formation exists");
    let mut formation: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    formation["schema_version"] = serde_json::json!(10);
    formation["formation_meta_target"] = serde_json::json!({
        "seat_bindings": "[]",
        "binding_entries": [],
        "fi_fee_account": staging.guardian_verification_fee_account(),
        "fedi_fee_account": development.guardian_verification_fee_account(),
        "send_ppm": 0,
        "recipients": "[]",
        "confirmed": false,
    });
    formation["dkg_completion_callback"] = serde_json::Value::Null;
    dbtx.raw_insert_bytes(
        FA_ACTIVE_FORMATION_KEY,
        &serde_json::to_vec(&formation).unwrap(),
    )
    .await
    .unwrap();
    dbtx.commit_tx().await;

    migrate_fa_guardian_fee_field(&database)
        .await
        .expect("the old field migrates");
    open_test_fa_client(database, identity)
        .await
        .expect("Manifold reopens the migrated formation");
}

#[tokio::test]
async fn guardian_fee_migration_leaves_current_and_absent_records_alone() {
    let database = MemDatabase::new().into_database();
    migrate_fa_guardian_fee_field(&database)
        .await
        .expect("an absent formation needs no migration");

    let current = serde_json::json!({
        "formation_meta_target": {
            "guardian_verification_fee_account": "current"
        }
    });
    let current_bytes = serde_json::to_vec(&current).unwrap();
    let mut dbtx = database.begin_transaction().await;
    dbtx.raw_insert_bytes(FA_ACTIVE_FORMATION_KEY, &current_bytes)
        .await
        .unwrap();
    dbtx.commit_tx().await;

    migrate_fa_guardian_fee_field(&database)
        .await
        .expect("a current formation needs no migration");
    let saved = database
        .begin_transaction_nc()
        .await
        .raw_get_bytes(FA_ACTIVE_FORMATION_KEY)
        .await
        .unwrap();
    assert_eq!(saved.as_deref(), Some(current_bytes.as_slice()));
}

#[tokio::test]
async fn fa_identity_has_a_golden_vector_and_resets_legacy_formation_before_owner_checks() {
    let first_root = DerivableSecret::new_root(&[1; 32], b"fi-client-test");
    let second_root = DerivableSecret::new_root(&[2; 32], b"fi-client-test");

    let first_identity = BridgeFaIdentity::from_root_secret(&first_root);
    let first = bridge_fa_id(&first_identity);
    let repeated = bridge_fa_id(&BridgeFaIdentity::from_root_secret(&first_root));
    let second = bridge_fa_id(&BridgeFaIdentity::from_root_secret(&second_root));

    assert_eq!(first, repeated);
    assert_ne!(first, second);
    assert_eq!(
        first.0.to_string(),
        "aa70a4ebfdb888b375e86f007873fae0f22118add2ca6f60309fc7ab8902e3bd"
    );
    assert_eq!(FA_CLIENT_CHILD_ID.0, 17);

    let database = MemDatabase::new().into_database();
    seed_identity_bound_formation(&database, first).await;
    let reopened = open_test_fa_client(
        database.clone(),
        BridgeFaIdentity::from_root_secret(&first_root),
    )
    .await
    .expect("the same app root resets incompatible pre-production FA state");
    assert!(matches!(reopened.status(), FaStatus::Idle));

    let different_root =
        open_test_fa_client(database, BridgeFaIdentity::from_root_secret(&second_root))
            .await
            .expect("the reset runs before an incompatible legacy owner is checked");
    assert!(matches!(different_root.status(), FaStatus::Idle));
}

#[test]
fn formation_uses_the_bridge_release_range() {
    let intent = formation_intent_from_rpc(RpcFaFormationIntent {
        federation_name: Some("Paid federation".to_owned()),
        federation_size: 7,
        plan: RpcFaPlanPreference::InfiniteBestEffort,
    })
    .expect("paid setup is supported before separate fee maintenance");

    assert_eq!(intent.plan(), PlanPreference::InfiniteBestEffort);
    assert_eq!(
        intent.fedimintd_versions().minimum().to_string(),
        FEDIMINTD_MINIMUM
    );
    assert_eq!(
        intent.fedimintd_versions().maximum_exclusive().to_string(),
        FEDIMINTD_MAXIMUM_EXCLUSIVE
    );
}

#[test]
fn selection_preview_uses_the_bridge_release_range() {
    let request = selection_request_from_rpc(RpcFaSelectionPreviewRequest {
        federation_size: 7,
        plan: RpcFaPlanPreference::InfiniteBestEffort,
    })
    .expect("selection request is valid");

    assert_eq!(
        request.fedimintd_versions().minimum().to_string(),
        FEDIMINTD_MINIMUM
    );
    assert_eq!(
        request.fedimintd_versions().maximum_exclusive().to_string(),
        FEDIMINTD_MAXIMUM_EXCLUSIVE
    );
}

#[test]
fn maintenance_rpc_constructs_only_supported_typed_metadata() {
    let updates = [
        RpcFaFederationMetadataUpdate::Name {
            value: "New Federation".to_owned(),
        },
        RpcFaFederationMetadataUpdate::IconUrl {
            value: "https://example.com/icon.png".to_owned(),
        },
        RpcFaFederationMetadataUpdate::WelcomeMessage {
            value: "Welcome members".to_owned(),
        },
        RpcFaFederationMetadataUpdate::TermsOfService {
            value: "https://example.com/terms".to_owned(),
        },
    ];
    for update in updates {
        assert!(metadata_update_from_rpc(update).is_ok());
    }

    let error = metadata_update_from_rpc(RpcFaFederationMetadataUpdate::IconUrl {
        value: "data:image/png;base64,AA==".to_owned(),
    })
    .expect_err("raw image data is outside the maintenance contract");
    assert_eq!(error.code, RpcFaErrorCode::InvalidIntent);
}

#[test]
fn app_settings_preserve_exact_keys_and_values_from_json() {
    let cases = [
        ("autojoinCommunities", "autojoin_communities", "[]"),
        (
            "defaultGroupChats",
            "default_group_chats",
            r#"["!room:example.com"]"#,
        ),
        ("pinnedMessage", "pinned_message", "Welcome back"),
        ("defaultCurrency", "default_currency", "USD"),
        ("stabilityPoolDisabled", "stability_pool_disabled", "false"),
        ("multispendDisabled", "multispend_disabled", "false"),
        ("inviteCodesDisabled", "invite_codes_disabled", "true"),
        ("newMembersDisabled", "new_members_disabled", "true"),
        ("offlineWalletDisabled", "offline_wallet_disabled", "false"),
        (
            "onchainDepositsDisabled",
            "onchain_deposits_disabled",
            "false",
        ),
        ("maxBalanceMsats", "max_balance_msats", "9007199254740993"),
        ("maxInvoiceMsats", "max_invoice_msats", "0"),
        (
            "maxStableBalanceMsats",
            "max_stable_balance_msats",
            "2100000000000000000",
        ),
        ("defaultGroupChats", "default_group_chats", "[]"),
        ("pinnedMessage", "pinned_message", ""),
    ];
    for (setting, key, value) in cases {
        let json = serde_json::json!({ "type": "appSetting", "setting": setting, "value": value });
        let update: RpcFaFederationMetadataUpdate = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(serde_json::to_value(&update).unwrap(), json);
        let (actual_key, actual_value) = metadata_update_from_rpc(update).unwrap().into_field();
        assert_eq!(actual_key.0, format!("fedi:{key}"));
        assert_eq!(actual_value.0, value);
    }
}

#[test]
fn app_settings_reject_invalid_values_before_dispatch() {
    for (setting, value) in [
        (RpcFaAppSetting::AutojoinCommunities, r#"["not-an-invite"]"#),
        (RpcFaAppSetting::DefaultGroupChats, r#"["not-a-room"]"#),
        (RpcFaAppSetting::PinnedMessage, "hello\nworld"),
        (RpcFaAppSetting::DefaultCurrency, "not-a-currency"),
        (RpcFaAppSetting::StabilityPoolDisabled, "False"),
        (RpcFaAppSetting::MaxBalanceMsats, "01"),
        (RpcFaAppSetting::MaxInvoiceMsats, "-1"),
        (
            RpcFaAppSetting::MaxStableBalanceMsats,
            "2100000000000000001",
        ),
    ] {
        let error = metadata_update_from_rpc(RpcFaFederationMetadataUpdate::AppSetting {
            setting,
            value: value.to_owned(),
        })
        .unwrap_err();
        assert_eq!(error.code, RpcFaErrorCode::InvalidIntent);
    }
    for setting in [
        "fedimods",
        "vetted_gateways",
        "fixedExchangeRate",
        "popupEndTimestamp",
    ] {
        assert!(
            serde_json::from_value::<RpcFaFederationMetadataUpdate>(serde_json::json!({
                "type": "appSetting", "setting": setting, "value": "[]",
            }))
            .is_err()
        );
    }
    // Amounts and flags must arrive as exact text, never JavaScript numbers or
    // booleans.
    for value in [
        serde_json::json!(9007199254740993_u64),
        serde_json::json!(false),
    ] {
        assert!(
            serde_json::from_value::<RpcFaFederationMetadataUpdate>(serde_json::json!({
                "type": "appSetting", "setting": "maxBalanceMsats", "value": value,
            }))
            .is_err()
        );
    }
}

#[test]
fn unsupported_maintenance_has_typed_detail_without_guardian_data() {
    let error = fa_error_to_rpc(&FaError::MaintenanceUnsupported {
        unsupported: vec![0, 1],
        required: 3,
    });
    assert_eq!(error.code, RpcFaErrorCode::MaintenanceRejected);
    assert_eq!(
        serde_json::to_value(error.detail).unwrap(),
        serde_json::json!({ "type": "maintenanceUnsupported" }),
    );
}

#[test]
fn terms_rpc_preserves_the_url_and_rejects_invalid_values() {
    let url = "https://example.com/terms";
    let update = metadata_update_from_rpc(RpcFaFederationMetadataUpdate::TermsOfService {
        value: url.to_owned(),
    })
    .unwrap();
    let (key, value) = update.into_field();
    assert_eq!(key.0, "fedi:tos_url");
    assert_eq!(value.0, url);

    for value in ["", "not a URL", "file:///terms", "http://localhost/terms"] {
        let error = metadata_update_from_rpc(RpcFaFederationMetadataUpdate::TermsOfService {
            value: value.to_owned(),
        })
        .expect_err("invalid terms must be rejected before contacting guardians");
        assert_eq!(error.code, RpcFaErrorCode::InvalidIntent);
    }
}

#[test]
fn maintenance_is_bound_to_the_exact_formed_invite() {
    let expected: fedimint_core::config::FederationId = "11".repeat(32).parse().unwrap();
    let invite = FedimintInviteCode::new(
        "wss://guardian.example.com".parse().unwrap(),
        fedimint_core::PeerId::from(0),
        expected,
        None,
    );
    let FaStatus::Formation(mut formed) =
        test_formation(FormationPhase::Formed, FormationFreshness::Fresh)
    else {
        unreachable!("test fixture is a formation");
    };
    formed.invite_code = Some(InviteCode(invite.to_string()));
    assert_eq!(
        formed_federation_id(&FaStatus::Formation(formed)).unwrap(),
        expected.to_string()
    );

    let restored = test_restored_formation(FormationFreshness::Fresh);
    assert_eq!(
        formed_federation_id(&FaStatus::Restored(restored)).unwrap(),
        "22".repeat(32)
    );

    let FaStatus::Formation(mut incomplete) =
        test_formation(FormationPhase::Preparing, FormationFreshness::Fresh)
    else {
        unreachable!("test fixture is a formation");
    };
    incomplete.invite_code = Some(InviteCode(invite.to_string()));
    assert_eq!(
        formed_federation_id(&FaStatus::Formation(incomplete))
            .unwrap_err()
            .code,
        RpcFaErrorCode::InvalidIntent
    );
    assert_eq!(
        formed_federation_id(&FaStatus::Idle).unwrap_err().code,
        RpcFaErrorCode::NoActiveFormation
    );

    let mut unsynced = test_formation(FormationPhase::Formed, FormationFreshness::Unsynced);
    let FaStatus::Formation(ref mut formation) = unsynced else {
        unreachable!("test fixture is a formation");
    };
    formation.invite_code = Some(InviteCode(invite.to_string()));
    assert_eq!(
        formed_federation_id(&unsynced).unwrap_err().code,
        RpcFaErrorCode::InvalidIntent
    );
    assert_eq!(
        formed_federation_id(&FaStatus::Restored(test_restored_formation(
            FormationFreshness::Unsynced
        )))
        .unwrap_err()
        .code,
        RpcFaErrorCode::InvalidIntent
    );
}

#[test]
fn auto_join_uses_the_invite_from_dkg_complete_onwards() {
    let expected: fedimint_core::config::FederationId = "22".repeat(32).parse().unwrap();
    let invite = FedimintInviteCode::new(
        "wss://guardian.example.com".parse().unwrap(),
        fedimint_core::PeerId::from(0),
        expected,
        None,
    );
    let formation_with_invite = |phase, freshness| {
        let mut status = test_formation(phase, freshness);
        let FaStatus::Formation(formation) = &mut status else {
            unreachable!("test fixture is a formation");
        };
        formation.invite_code = Some(InviteCode(invite.to_string()));
        status
    };

    for phase in [
        FormationPhase::DkgComplete,
        FormationPhase::PublishingSeatBindings,
        FormationPhase::Formed,
    ] {
        for freshness in [FormationFreshness::Fresh, FormationFreshness::Unsynced] {
            assert_eq!(
                formed_federation_invite(&formation_with_invite(phase, freshness)),
                Some((invite.to_string(), expected.to_string())),
                "{phase:?} with {freshness:?} should offer the invite"
            );
        }
    }

    for phase in [
        FormationPhase::Preparing,
        FormationPhase::AwaitingPaymentReadiness,
        FormationPhase::AcquiringSeats,
        FormationPhase::PreparingDkg,
        FormationPhase::DkgUnderway,
    ] {
        assert!(
            formed_federation_invite(&formation_with_invite(phase, FormationFreshness::Fresh))
                .is_none(),
            "{phase:?} should not offer the invite"
        );
    }

    let restored = test_restored_formation(FormationFreshness::Fresh);
    let restored_invite = restored.federation_invite.0.clone();
    assert_eq!(
        formed_federation_invite(&FaStatus::Restored(restored)),
        Some((restored_invite, "22".repeat(32)))
    );
    assert!(
        formed_federation_invite(&FaStatus::Restored(test_restored_formation(
            FormationFreshness::Unsynced
        )))
        .is_none()
    );
}

#[tokio::test]
async fn auto_join_completion_is_durable_by_federation_id() {
    let database = MemDatabase::new().into_database();
    complete_fa_federation_auto_join(&database, "federation").await;
    assert!(fa_federation_auto_join_completed(&database, "federation").await);
    assert!(!fa_federation_auto_join_completed(&database, "other").await);
}

#[tokio::test]
async fn auto_join_handoff_lock_is_scoped_by_federation_id() {
    let locks = FaFederationHandoffLocks::default();
    let first_guard = locks.lock("first").await;

    assert!(
        tokio::time::timeout(Duration::from_secs(1), locks.lock("second"))
            .await
            .is_ok()
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(25), locks.lock("first"))
            .await
            .is_err()
    );

    drop(first_guard);
    assert!(
        tokio::time::timeout(Duration::from_secs(1), locks.lock("first"))
            .await
            .is_ok()
    );
}

/// Drives [`run_fa_federation_auto_join`] through a scripted sequence of
/// federation states, so the order of the join, the reported states, and the
/// completion marker can be checked without a real `Federations`.
struct ScriptedAutoJoinTarget {
    /// One entry per `state` call. `None` means "not joined". The last entry
    /// is sticky, so a wait loop settles on it.
    states: Mutex<VecDeque<Option<AutoJoinFederationState>>>,
    join_error: Mutex<Option<String>>,
    joins: AtomicUsize,
    /// How often the script was read, so a test can tell that the driver
    /// reached its wait loop.
    state_calls: AtomicUsize,
}

impl ScriptedAutoJoinTarget {
    fn new(join_error: Option<&str>, states: Vec<Option<AutoJoinFederationState>>) -> Self {
        assert!(!states.is_empty(), "the state script must not be empty");
        Self {
            states: Mutex::new(states.into()),
            join_error: Mutex::new(join_error.map(ToOwned::to_owned)),
            joins: AtomicUsize::new(0),
            state_calls: AtomicUsize::new(0),
        }
    }

    /// Appends to the script while the driver runs, which ends the stickiness
    /// of the last entry.
    fn push_state(&self, state: Option<AutoJoinFederationState>) {
        self.states
            .lock()
            .expect("script lock is healthy")
            .push_back(state);
    }
}

#[apply(async_trait_maybe_send!)]
impl AutoJoinTarget for ScriptedAutoJoinTarget {
    fn state(&self, _federation_id: &str) -> anyhow::Result<AutoJoinFederationState> {
        self.state_calls.fetch_add(1, AtomicOrdering::SeqCst);
        let mut states = self.states.lock().expect("script lock is healthy");
        let next = if states.len() > 1 {
            states.pop_front().expect("script is not empty")
        } else {
            states.front().cloned().expect("script is not empty")
        };
        next.ok_or_else(|| anyhow::anyhow!("federation is not joined"))
    }

    async fn join(&self, _invite_code: String) -> anyhow::Result<()> {
        self.joins.fetch_add(1, AtomicOrdering::SeqCst);
        match self
            .join_error
            .lock()
            .expect("join error lock is healthy")
            .take()
        {
            Some(error) => Err(anyhow::anyhow!(error)),
            None => Ok(()),
        }
    }
}

/// Runs the auto-join sequence and returns the states it reported.
async fn drive_auto_join(
    target: &ScriptedAutoJoinTarget,
    database: &Database,
) -> Vec<RpcFaFederationJoinState> {
    let locks = FaFederationHandoffLocks::default();
    drive_auto_join_with(
        target,
        database,
        &locks,
        "federation",
        Duration::from_millis(1),
    )
    .await
}

/// The same drive, with the federation id, the handoff locks and the poll
/// interval a test that watches the lock or the database needs to control.
async fn drive_auto_join_with(
    target: &ScriptedAutoJoinTarget,
    database: &Database,
    handoff_locks: &FaFederationHandoffLocks,
    federation_id: &str,
    poll_interval: Duration,
) -> Vec<RpcFaFederationJoinState> {
    let reported = Arc::new(Mutex::new(Vec::new()));
    let sink = reported.clone();
    let report = move |state: RpcFaFederationJoinState| {
        sink.lock().expect("report lock is healthy").push(state);
    };
    let on_joined = || {};
    run_fa_federation_auto_join(
        target,
        database,
        handoff_locks,
        "invite".to_owned(),
        federation_id,
        poll_interval,
        &report,
        &on_joined,
    )
    .await;
    let reported = reported.lock().expect("report lock is healthy");
    reported.clone()
}

/// Parks until the driver has read the state script `calls` times, which says
/// it reached its wait loop.
async fn wait_for_state_calls(target: &ScriptedAutoJoinTarget, calls: usize) {
    tokio::time::timeout(Duration::from_secs(10), async {
        while target.state_calls.load(AtomicOrdering::SeqCst) < calls {
            fedimint_core::task::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("the auto-join reaches its wait loop");
}

#[tokio::test]
async fn auto_join_retries_after_a_join_error() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(
        Some("guardian unreachable"),
        vec![None, None, Some(AutoJoinFederationState::Ready)],
    );

    let states = tokio::time::timeout(Duration::from_secs(10), drive_auto_join(&target, &database))
        .await
        .expect("the second join succeeds without restarting the task");

    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Joining,
            RpcFaFederationJoinState::Ready
        ]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 2);
    assert!(fa_federation_auto_join_completed(&database, "federation").await);
}

#[tokio::test]
async fn auto_join_stops_if_the_user_leaves_during_the_retry_delay() {
    let database = MemDatabase::new().into_database();
    let locks = FaFederationHandoffLocks::default();
    let target = ScriptedAutoJoinTarget::new(Some("guardian unreachable"), vec![None]);
    let driver = drive_auto_join_with(
        &target,
        &database,
        &locks,
        "federation",
        Duration::from_millis(100),
    );
    tokio::pin!(driver);

    tokio::select! {
        _ = &mut driver => panic!("the join should wait to retry"),
        () = async {
            wait_for_state_calls(&target, 1).await;
            let _guard = tokio::time::timeout(Duration::from_millis(50), locks.lock("federation"))
                .await
                .expect("a leave can take the lock during the retry delay");
            assert!(!fa_federation_auto_join_completed(&database, "federation").await);
            complete_fa_federation_auto_join(&database, "federation").await;
        } => {}
    }

    let states = tokio::time::timeout(Duration::from_secs(10), driver)
        .await
        .expect("the leave stops the retry");
    assert_eq!(states, vec![RpcFaFederationJoinState::Joining]);
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 1);
}

#[tokio::test(start_paused = true)]
async fn auto_join_backs_off_after_repeated_errors() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(Some("guardian unreachable"), vec![None]);
    let driver = drive_auto_join(&target, &database);
    tokio::pin!(driver);

    for (attempt, seconds) in [1, 2, 4, 8, 16, 32, 64, 128, 256, 300, 300]
        .into_iter()
        .enumerate()
    {
        assert!(futures::poll!(&mut driver).is_pending());
        assert_eq!(target.joins.load(AtomicOrdering::SeqCst), attempt + 1);
        tokio::time::advance(Duration::from_secs(seconds) - Duration::from_millis(1)).await;
        assert!(futures::poll!(&mut driver).is_pending());
        assert_eq!(target.joins.load(AtomicOrdering::SeqCst), attempt + 1);
        *target.join_error.lock().unwrap() = Some("guardian unreachable".to_owned());
        tokio::time::advance(Duration::from_millis(1)).await;
    }
}

#[tokio::test]
async fn auto_join_writes_marker_only_once_ready() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(
        None,
        vec![
            None,
            Some(AutoJoinFederationState::Recovering),
            Some(AutoJoinFederationState::Recovering),
            Some(AutoJoinFederationState::Ready),
        ],
    );

    let states = drive_auto_join(&target, &database).await;

    // Recovering is reported once, not once per poll.
    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Joining,
            RpcFaFederationJoinState::Recovering,
            RpcFaFederationJoinState::Ready
        ]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 1);
    assert!(fa_federation_auto_join_completed(&database, "federation").await);
}

#[tokio::test]
async fn auto_join_leaves_no_marker_when_the_federation_is_left_during_recovery() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(
        None,
        vec![None, Some(AutoJoinFederationState::Recovering), None],
    );

    let states = drive_auto_join(&target, &database).await;

    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Joining,
            RpcFaFederationJoinState::Recovering,
            RpcFaFederationJoinState::Failed {
                message: "federation left during recovery".to_owned()
            }
        ]
    );
    assert!(!fa_federation_auto_join_completed(&database, "federation").await);
}

/// Waiting for a recovering federation can take minutes, and never ends for a
/// stuck one. Holding the handoff lock for that wait would block
/// `leave_federation`, which takes the same lock, so the user could not leave
/// the federation the wait is stuck on.
#[tokio::test]
async fn auto_join_releases_the_handoff_lock_while_waiting() {
    let database = MemDatabase::new().into_database();
    let locks = Arc::new(FaFederationHandoffLocks::default());
    // The last entry is sticky, so the driver stays in the wait loop until the
    // test appends `Ready`.
    let target = Arc::new(ScriptedAutoJoinTarget::new(
        None,
        vec![None, Some(AutoJoinFederationState::Recovering)],
    ));

    let driver = fedimint_core::task::spawn("auto-join handoff lock test", {
        let target = target.clone();
        let database = database.clone();
        let locks = locks.clone();
        async move {
            drive_auto_join_with(
                &target,
                &database,
                &locks,
                "federation",
                Duration::from_millis(10),
            )
            .await
        }
    });

    // Park until the driver has polled the recovering federation twice.
    wait_for_state_calls(&target, 3).await;

    let guard = tokio::time::timeout(Duration::from_secs(1), locks.lock("federation"))
        .await
        .expect("the handoff lock is free while the auto-join waits");
    drop(guard);

    target.push_state(Some(AutoJoinFederationState::Ready));
    let states = tokio::time::timeout(Duration::from_secs(10), driver)
        .await
        .expect("the auto-join finishes once the federation is ready")
        .expect("the auto-join task does not panic");

    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Joining,
            RpcFaFederationJoinState::Recovering,
            RpcFaFederationJoinState::Ready
        ]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 1);
    assert!(fa_federation_auto_join_completed(&database, "federation").await);
}

/// A leave during the wait removes the federation. The wait must then stop
/// without writing the completion marker, and must leave the handoff lock free
/// for the leave that follows it.
#[tokio::test]
async fn auto_join_does_not_mark_after_a_leave_during_recovery() {
    let database = MemDatabase::new().into_database();
    let locks = FaFederationHandoffLocks::default();
    let target = ScriptedAutoJoinTarget::new(
        None,
        vec![None, Some(AutoJoinFederationState::Recovering), None],
    );

    let states = drive_auto_join_with(
        &target,
        &database,
        &locks,
        "federation",
        Duration::from_millis(1),
    )
    .await;

    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Joining,
            RpcFaFederationJoinState::Recovering,
            RpcFaFederationJoinState::Failed {
                message: "federation left during recovery".to_owned()
            }
        ]
    );
    assert!(!fa_federation_auto_join_completed(&database, "federation").await);
    assert!(
        tokio::time::timeout(Duration::from_secs(1), locks.lock("federation"))
            .await
            .is_ok(),
        "the auto-join must not keep the handoff lock after it stops"
    );
}

/// `leave_federation` suppresses the auto-join by writing the completion
/// marker, and clears the retained join report under the same lock. A `Failed`
/// emitted after that clear is retained forever, and the Wallet Service then
/// shows a recovery failure for a federation the user left on purpose. The
/// wait must stay silent for it, exactly like the marker check that runs after
/// the federation was already `Ready`.
#[tokio::test]
async fn auto_join_says_nothing_when_a_leave_marks_the_federation_during_the_wait() {
    let database = MemDatabase::new().into_database();
    let locks = Arc::new(FaFederationHandoffLocks::default());
    // The last entry is sticky, so the driver stays in the wait loop until the
    // test appends the leave.
    let target = Arc::new(ScriptedAutoJoinTarget::new(
        None,
        vec![None, Some(AutoJoinFederationState::Recovering)],
    ));

    let driver = fedimint_core::task::spawn("auto-join leave-during-wait test", {
        let target = target.clone();
        let database = database.clone();
        let locks = locks.clone();
        async move {
            drive_auto_join_with(
                &target,
                &database,
                &locks,
                "federation",
                Duration::from_millis(10),
            )
            .await
        }
    });

    wait_for_state_calls(&target, 3).await;

    // What `leave_federation` does: suppress the auto-join, then leave.
    complete_fa_federation_auto_join(&database, "federation").await;
    target.push_state(None);

    let states = tokio::time::timeout(Duration::from_secs(10), driver)
        .await
        .expect("the auto-join stops once the federation is gone")
        .expect("the auto-join task does not panic");

    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Joining,
            RpcFaFederationJoinState::Recovering
        ]
    );
}

/// A failed nonce-reuse check leaves the federation and records that it must be
/// rejoined from scratch. The federation is absent, but the user did not leave
/// it and the app is about to rejoin it, so the wait keeps waiting instead of
/// reporting a recovery failure.
#[tokio::test]
async fn auto_join_keeps_waiting_while_the_federation_is_pending_a_rejoin_from_scratch() {
    let database = MemDatabase::new().into_database();
    let federation_id: fedimint_core::config::FederationId = "33".repeat(32).parse().unwrap();
    let invite = FedimintInviteCode::new(
        "wss://guardian.example.com".parse().unwrap(),
        fedimint_core::PeerId::from(0),
        federation_id,
        None,
    );
    let mut dbtx = database.begin_transaction().await;
    dbtx.insert_entry(
        &FederationPendingRejoinFromScratchKey {
            invite_code_str: invite.to_string(),
        },
        &(),
    )
    .await;
    dbtx.commit_tx().await;

    let locks = Arc::new(FaFederationHandoffLocks::default());
    // Sticky `None`: the federation stays absent until the test rejoins it.
    let target = Arc::new(ScriptedAutoJoinTarget::new(None, vec![None]));

    let driver = fedimint_core::task::spawn("auto-join rejoin-from-scratch test", {
        let target = target.clone();
        let database = database.clone();
        let locks = locks.clone();
        let federation_id = federation_id.to_string();
        async move {
            drive_auto_join_with(
                &target,
                &database,
                &locks,
                &federation_id,
                Duration::from_millis(10),
            )
            .await
        }
    });

    wait_for_state_calls(&target, 3).await;
    target.push_state(Some(AutoJoinFederationState::Ready));

    let states = tokio::time::timeout(Duration::from_secs(10), driver)
        .await
        .expect("the auto-join finishes once the federation is back and ready")
        .expect("the auto-join task does not panic");

    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Joining,
            RpcFaFederationJoinState::Recovering,
            RpcFaFederationJoinState::Ready
        ]
    );
    assert!(fa_federation_auto_join_completed(&database, &federation_id.to_string()).await);
}

#[tokio::test]
async fn auto_join_reports_ready_without_rejoining_an_already_ready_federation() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(None, vec![Some(AutoJoinFederationState::Ready)]);

    let states = drive_auto_join(&target, &database).await;

    assert_eq!(states, vec![RpcFaFederationJoinState::Ready]);
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
    assert!(fa_federation_auto_join_completed(&database, "federation").await);

    // A later run still reports Ready, and still does not rejoin — but it is
    // the live state that says so, not the marker.
    let rerun = ScriptedAutoJoinTarget::new(None, vec![Some(AutoJoinFederationState::Ready)]);
    assert_eq!(
        drive_auto_join(&rerun, &database).await,
        vec![RpcFaFederationJoinState::Ready]
    );
    assert_eq!(rerun.joins.load(AtomicOrdering::SeqCst), 0);
}

/// `leave_federation` writes the same completion marker to suppress the
/// auto-join, so a marker plus an absent federation is a deliberate leave.
/// Reporting `Ready` for it would claim a federation the bridge is not in.
#[tokio::test]
async fn auto_join_says_nothing_when_the_marker_outlives_a_left_federation() {
    let database = MemDatabase::new().into_database();
    complete_fa_federation_auto_join(&database, "federation").await;

    let target = ScriptedAutoJoinTarget::new(None, vec![None]);
    let states = drive_auto_join(&target, &database).await;

    assert_eq!(states, vec![]);
    // and it must not undo the leave by rejoining
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
}

#[tokio::test]
async fn auto_join_reports_ready_when_the_marker_matches_a_ready_federation() {
    let database = MemDatabase::new().into_database();
    complete_fa_federation_auto_join(&database, "federation").await;

    let target = ScriptedAutoJoinTarget::new(None, vec![Some(AutoJoinFederationState::Ready)]);
    let states = drive_auto_join(&target, &database).await;

    assert_eq!(states, vec![RpcFaFederationJoinState::Ready]);
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
}

#[tokio::test]
async fn auto_join_waits_through_a_loading_federation_at_start() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(
        None,
        vec![
            Some(AutoJoinFederationState::Loading),
            Some(AutoJoinFederationState::Loading),
            Some(AutoJoinFederationState::Ready),
        ],
    );

    let states = drive_auto_join(&target, &database).await;

    // Loading is not an answer, so the task waits instead of going silent.
    assert_eq!(
        states,
        vec![
            RpcFaFederationJoinState::Recovering,
            RpcFaFederationJoinState::Ready
        ]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
    assert!(fa_federation_auto_join_completed(&database, "federation").await);
}

#[tokio::test]
async fn auto_join_reports_failed_and_leaves_no_marker_for_a_failed_federation_at_start() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(
        None,
        vec![Some(AutoJoinFederationState::Failed(
            "federation failed to load".to_owned(),
        ))],
    );

    let states = drive_auto_join(&target, &database).await;

    assert_eq!(
        states,
        vec![RpcFaFederationJoinState::Failed {
            message: "federation failed to load".to_owned()
        }]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
    assert!(!fa_federation_auto_join_completed(&database, "federation").await);
}

#[tokio::test]
async fn auto_join_report_re_delivers_the_last_state_to_every_status_read() {
    let report = FaFederationJoinReport::default();
    assert!(report.last().is_none());

    report.record(FaFederationJoinEvent {
        federation_id: RpcFederationId("federation".to_owned()),
        state: RpcFaFederationJoinState::Failed {
            message: "guardian unreachable".to_owned(),
        },
    });

    for _ in 0..2 {
        let retained = report.last().expect("a state was reported");
        assert_eq!(retained.federation_id.0, "federation");
        assert_eq!(
            retained.state,
            RpcFaFederationJoinState::Failed {
                message: "guardian unreachable".to_owned()
            }
        );
    }
}

#[tokio::test]
async fn auto_join_report_stops_re_delivering_after_the_federation_is_left() {
    let report = FaFederationJoinReport::default();
    report.record(FaFederationJoinEvent {
        federation_id: RpcFederationId("federation".to_owned()),
        state: RpcFaFederationJoinState::Ready,
    });

    // Leaving another federation must not erase this state.
    report.clear("other");
    assert!(report.last().is_some());

    report.clear("federation");
    assert!(report.last().is_none());
}

#[test]
fn guardian_fee_rpc_enforces_product_range_at_one_ppm_precision() {
    assert_eq!(guardian_fee_from_rpc(0).unwrap().value(), 0);
    assert_eq!(
        guardian_fee_from_rpc(MAX_GUARDIAN_FEE_PPM).unwrap().value(),
        MAX_GUARDIAN_FEE_PPM
    );
    assert_eq!(guardian_fee_from_rpc(2_501).unwrap().value(), 2_501);
    assert_eq!(
        guardian_fee_from_rpc(MAX_GUARDIAN_FEE_PPM + 1)
            .unwrap_err()
            .code,
        RpcFaErrorCode::InvalidIntent
    );
}

fn liquidity_recovery_snapshot(
    operation_id: &str,
    phase: LiquidityOperationPhase,
    statuses: &[ItemAllocationStatus],
) -> LiquidityOperationSnapshot {
    LiquidityOperationSnapshot {
        operation_id: LiquidityOperationId(operation_id.to_owned()),
        formation_id: FormationId("formation".to_owned()),
        provider_pubkey: Pubkey(Keys::generate().public_key().to_string()),
        endpoint_hint: Some(Url("iroh://provider-endpoint".to_owned())),
        details_payload_hash: Sha256Digest([0x2a; 32]),
        amounts: LiquidityAmountBounds {
            gateway_min_amount: Sats(0),
            gateway_max_amount: None,
            stability_min_amount: Sats(10),
            stability_max_amount: None,
        },
        phase,
        item_statuses: statuses
            .iter()
            .enumerate()
            .map(|(index, status)| AllocationItemStatus {
                target: AllocationItemTarget::StabilityPool {
                    item_id: ItemId(format!("item-{index}")),
                    amount: Sats(10),
                },
                status: *status,
                fulfilled_amount: None,
                completion_evidence: None,
                failure: None,
                updated_at: Timestamp(100),
            })
            .collect(),
        rejection_code: (phase == LiquidityOperationPhase::Rejected)
            .then(|| "provider_rejected".to_owned()),
        gateway_view_verified: false,
    }
}

fn completed_gateway_with_stability_status(
    operation_id: &str,
    stability_status: ItemAllocationStatus,
) -> LiquidityOperationSnapshot {
    let mut snapshot = liquidity_recovery_snapshot(
        operation_id,
        LiquidityOperationPhase::Accepted,
        &[stability_status],
    );
    snapshot.amounts.gateway_min_amount = Sats(10);
    snapshot.amounts.gateway_max_amount = Some(Sats(20));
    snapshot.item_statuses.insert(
        0,
        AllocationItemStatus {
            target: AllocationItemTarget::Gateway {
                item_id: ItemId("gateway-item".to_owned()),
                gateway_id: GatewayId("provider-gateway".to_owned()),
                gateway_name: GatewayName("Provider gateway".to_owned()),
                amount: Sats(20),
            },
            status: ItemAllocationStatus::Completed,
            fulfilled_amount: Some(Sats(20)),
            completion_evidence: Some(CompletionEvidence::Gateway(GatewayCompletionEvidence {
                gateway_id: GatewayId("provider-gateway".to_owned()),
                gateway_api: GatewayApiUrl::try_from("https://gateway.example/api")
                    .expect("valid gateway API"),
                fulfilled_amount: Sats(20),
                observed_gateway_balance: Sats(20),
                observed_at: Timestamp(100),
                withdrawal_txid: None,
                wallet_operation_id: None,
            })),
            failure: None,
            updated_at: Timestamp(100),
        },
    );
    snapshot
}

#[test]
fn liquidity_launch_recovery_uses_current_and_skips_non_resumable_operations() {
    let prepared_id = "01".repeat(32);
    let prepared =
        liquidity_recovery_snapshot(&prepared_id, LiquidityOperationPhase::Prepared, &[]);
    let mut recovery = LiquidityLaunchRecovery::new();

    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::ReadCurrent)
    ));
    recovery.record_current(Some(prepared));

    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::Resume { operation_id }) if operation_id.0 == prepared_id
    ));
    let running = liquidity_recovery_snapshot(
        &prepared_id,
        LiquidityOperationPhase::Accepted,
        &[ItemAllocationStatus::Running],
    );
    recovery.record_resume_success(running.clone());
    assert!(recovery.has_work());
    assert_eq!(recovery.next_delay(), FA_RESUME_INITIAL_BACKOFF);
    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::ReadCurrent)
    ));
    recovery.record_current(Some(running));
    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::Resume { .. })
    ));
    recovery.record_resume_success(liquidity_recovery_snapshot(
        &prepared_id,
        LiquidityOperationPhase::Accepted,
        &[ItemAllocationStatus::Completed],
    ));
    assert!(!recovery.has_work());

    for stability_status in [
        ItemAllocationStatus::Failed,
        ItemAllocationStatus::Cancelled,
        ItemAllocationStatus::ActionRequired,
    ] {
        let mut gateway_recovery = LiquidityLaunchRecovery::new();
        assert!(matches!(
            gateway_recovery.next_step(),
            Some(LiquidityRecoveryStep::ReadCurrent)
        ));
        gateway_recovery.record_current(Some(completed_gateway_with_stability_status(
            &"02".repeat(32),
            stability_status,
        )));
        assert!(matches!(
            gateway_recovery.next_step(),
            Some(LiquidityRecoveryStep::Resume { .. })
        ));
    }

    let mut completed_and_verified =
        completed_gateway_with_stability_status(&"03".repeat(32), ItemAllocationStatus::Cancelled);
    completed_and_verified.gateway_view_verified = true;
    for operation in [
        liquidity_recovery_snapshot(&"04".repeat(32), LiquidityOperationPhase::Rejected, &[]),
        completed_and_verified,
        liquidity_recovery_snapshot(
            &"05".repeat(32),
            LiquidityOperationPhase::Accepted,
            &[
                ItemAllocationStatus::Failed,
                ItemAllocationStatus::Cancelled,
            ],
        ),
    ] {
        let mut recovery = LiquidityLaunchRecovery::new();
        assert!(matches!(
            recovery.next_step(),
            Some(LiquidityRecoveryStep::ReadCurrent)
        ));
        recovery.record_current(Some(operation));
        assert!(!recovery.has_work());
    }
}

#[test]
fn liquidity_launch_recovery_failure_rereads_the_canonical_operation() {
    let failed_id = LiquidityOperationId("07".repeat(32));
    let prepared =
        liquidity_recovery_snapshot(&failed_id.0, LiquidityOperationPhase::Prepared, &[]);
    let mut recovery = LiquidityLaunchRecovery::new();
    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::ReadCurrent)
    ));
    recovery.record_current(Some(prepared.clone()));

    let Some(LiquidityRecoveryStep::Resume { .. }) = recovery.next_step() else {
        panic!("prepared operation must be resumed");
    };
    recovery.record_failure();
    assert_eq!(recovery.next_delay(), FA_RESUME_INITIAL_BACKOFF);
    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::ReadCurrent)
    ));
    recovery.record_current(Some(prepared));
    assert_eq!(recovery.next_delay(), Duration::ZERO);
    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::Resume { .. })
    ));
    recovery.record_failure();
    assert_eq!(recovery.next_delay(), FA_RESUME_INITIAL_BACKOFF * 2);
    assert!(matches!(
        recovery.next_step(),
        Some(LiquidityRecoveryStep::ReadCurrent)
    ));
    recovery.record_current(None);
    assert!(!recovery.has_work());
}

#[tokio::test]
async fn liquidity_recovery_composes_current_reads_retries_and_claim_release() {
    let first_id = "0d".repeat(32);
    let current = Arc::new(Mutex::new(VecDeque::from([
        Some(liquidity_recovery_snapshot(
            &first_id,
            LiquidityOperationPhase::Prepared,
            &[],
        )),
        Some(liquidity_recovery_snapshot(
            &first_id,
            LiquidityOperationPhase::Accepted,
            &[ItemAllocationStatus::Running],
        )),
    ])));
    let current_reads = Arc::new(AtomicUsize::new(0));
    let resumed = Arc::new(Mutex::new(Vec::new()));
    let first_attempts = Arc::new(AtomicUsize::new(0));
    let operation_active = Arc::new(AtomicBool::new(false));
    let mut recovery = LiquidityLaunchRecovery::new();

    for _ in 0..4 {
        let current = current.clone();
        let current_reads = current_reads.clone();
        let resumed = resumed.clone();
        let first_attempts = first_attempts.clone();
        let first_id = first_id.clone();
        reconcile_one_liquidity_step(
            &mut recovery,
            &operation_active,
            move || async move {
                current_reads.fetch_add(1, AtomicOrdering::SeqCst);
                current
                    .lock()
                    .unwrap()
                    .pop_front()
                    .ok_or_else(|| FaError::Liquidity("unexpected current read".to_owned()))
            },
            move |operation_id| async move {
                resumed.lock().unwrap().push(operation_id.0.clone());
                if operation_id.0 == first_id
                    && first_attempts.fetch_add(1, AtomicOrdering::SeqCst) == 0
                {
                    Err(FaError::Liquidity("provider timeout".to_owned()))
                } else {
                    Ok(liquidity_recovery_snapshot(
                        &operation_id.0,
                        LiquidityOperationPhase::Accepted,
                        &[ItemAllocationStatus::Completed],
                    ))
                }
            },
        )
        .await;
        assert!(!operation_active.load(Ordering::Acquire));
    }

    assert_eq!(current_reads.load(AtomicOrdering::SeqCst), 2);
    assert_eq!(*resumed.lock().unwrap(), vec![first_id.clone(), first_id]);
    assert!(!recovery.has_work());
}

fn gateway_only_snapshot(
    operation_id: &str,
    status: ItemAllocationStatus,
) -> LiquidityOperationSnapshot {
    let mut snapshot =
        completed_gateway_with_stability_status(operation_id, ItemAllocationStatus::Completed);
    snapshot.amounts.stability_min_amount = Sats(0);
    snapshot.item_statuses.truncate(1);
    let gateway = &mut snapshot.item_statuses[0];
    gateway.status = status;
    if status != ItemAllocationStatus::Completed {
        gateway.fulfilled_amount = None;
        gateway.completion_evidence = None;
    }
    if status == ItemAllocationStatus::ActionRequired {
        gateway.failure = Some(LiquidityFailure {
            code: LiquidityFailureCode::GatewayAttachFailed,
            reason: None,
        });
    }
    snapshot
}

/// The provider reports `gateway_attach_failed`, its operator retries, and the
/// allocation completes hours later. Recovery must keep polling slowly so the
/// completion is fetched and the gateway gets registered.
#[tokio::test]
async fn liquidity_recovery_follows_action_required_until_provider_completes() {
    let operation_id = "0e".repeat(32);
    let attach_failed = gateway_only_snapshot(&operation_id, ItemAllocationStatus::ActionRequired);
    let mut completed = gateway_only_snapshot(&operation_id, ItemAllocationStatus::Completed);
    completed.gateway_view_verified = true;
    let current = Arc::new(Mutex::new(VecDeque::from([
        Some(gateway_only_snapshot(
            &operation_id,
            ItemAllocationStatus::Running,
        )),
        Some(attach_failed.clone()),
        Some(attach_failed.clone()),
    ])));
    let resumes = Arc::new(Mutex::new(VecDeque::from([
        attach_failed.clone(),
        attach_failed,
        completed,
    ])));
    let mut recovery = LiquidityLaunchRecovery::new();
    let operation_active = Arc::new(AtomicBool::new(false));
    let mut delays_before_reads = Vec::new();

    while recovery.has_work() {
        delays_before_reads.push(recovery.next_delay());
        let current = current.clone();
        let resumes = resumes.clone();
        reconcile_one_liquidity_step(
            &mut recovery,
            &operation_active,
            move || async move {
                current
                    .lock()
                    .unwrap()
                    .pop_front()
                    .ok_or_else(|| FaError::Liquidity("unexpected current read".to_owned()))
            },
            move |_| async move {
                resumes
                    .lock()
                    .unwrap()
                    .pop_front()
                    .ok_or_else(|| FaError::Liquidity("unexpected resume".to_owned()))
            },
        )
        .await;
    }

    assert!(resumes.lock().unwrap().is_empty(), "completion was fetched");
    assert!(current.lock().unwrap().is_empty());
    // Read, resume (attach failed), slow read, resume (still failed), slow
    // read, resume (completed and registered).
    assert_eq!(
        delays_before_reads,
        vec![
            Duration::ZERO,
            Duration::ZERO,
            FA_LIQUIDITY_OPERATOR_POLL_INTERVAL,
            Duration::ZERO,
            FA_LIQUIDITY_OPERATOR_POLL_INTERVAL,
            Duration::ZERO,
        ]
    );
}

#[test]
fn liquidity_gateway_intent_preserves_bounds() {
    let intent = liquidity_intent_from_rpc(RpcFaLiquidityRequestIntent {
        amounts: RpcFaLiquidityAmountBounds {
            gateway_min_sats: 10,
            gateway_max_sats: Some(50_000),
            stability_min_sats: 0,
            stability_max_sats: None,
        },
        approved_provider_pubkeys: Vec::new(),
    })
    .expect("gateway-only bounds without an allowlist are supported");

    assert_eq!(intent.amounts.gateway_min_amount, Sats(10));
    assert_eq!(intent.amounts.gateway_max_amount, Some(Sats(50_000)));
    assert_eq!(intent.amounts.stability_min_amount, Sats(0));
    assert_eq!(intent.amounts.stability_max_amount, None);
}

#[test]
fn liquidity_intent_rejects_provider_allowlists() {
    let error = liquidity_intent_from_rpc(RpcFaLiquidityRequestIntent {
        amounts: RpcFaLiquidityAmountBounds {
            gateway_min_sats: 10,
            gateway_max_sats: None,
            stability_min_sats: 0,
            stability_max_sats: None,
        },
        approved_provider_pubkeys: vec![Keys::generate().public_key().to_string()],
    })
    .expect_err("caller-supplied allowlists fail closed: registry trust replaced them");

    assert_eq!(error.code, RpcFaErrorCode::InvalidIntent);
    assert!(
        error
            .message
            .contains("provider allowlists are no longer supported")
    );
}

#[test]
fn liquidity_failure_logs_preserve_known_codes_but_hide_unknown_remote_text() {
    assert_eq!(
        liquidity_failure_log_code(&LiquidityFailureCode::InsufficientProviderFunds),
        "insufficient_provider_funds"
    );
    assert_eq!(
        liquidity_failure_log_code(&LiquidityFailureCode::Unknown(
            "untrusted remote detail".to_owned()
        )),
        "unknown"
    );
}

#[test]
fn liquidity_snapshot_projects_authoritative_evidence_without_private_failure_reason() {
    const PRIVATE_PROVIDER_REASON: &str = "private provider diagnostics";
    let snapshot = LiquidityOperationSnapshot {
        operation_id: LiquidityOperationId("operation".to_owned()),
        formation_id: FormationId("formation".to_owned()),
        provider_pubkey: Pubkey(Keys::generate().public_key().to_string()),
        endpoint_hint: Some(Url("iroh://provider-endpoint".to_owned())),
        details_payload_hash: Sha256Digest([0x2a; 32]),
        amounts: LiquidityAmountBounds {
            gateway_min_amount: Sats(10),
            gateway_max_amount: Some(Sats(20)),
            stability_min_amount: Sats(0),
            stability_max_amount: None,
        },
        phase: LiquidityOperationPhase::Accepted,
        item_statuses: vec![
            AllocationItemStatus {
                target: AllocationItemTarget::Gateway {
                    item_id: ItemId("gateway-item".to_owned()),
                    gateway_id: GatewayId("provider-opaque-gateway".to_owned()),
                    gateway_name: GatewayName("Provider gateway".to_owned()),
                    amount: Sats(20),
                },
                status: ItemAllocationStatus::Completed,
                fulfilled_amount: Some(Sats(20)),
                completion_evidence: Some(CompletionEvidence::Gateway(GatewayCompletionEvidence {
                    gateway_id: GatewayId("provider-opaque-gateway".to_owned()),
                    gateway_api: GatewayApiUrl::try_from("https://gateway.example/api")
                        .expect("valid public gateway API"),
                    fulfilled_amount: Sats(20),
                    observed_gateway_balance: Sats(25),
                    observed_at: Timestamp(101),
                    withdrawal_txid: Some("txid".to_owned()),
                    wallet_operation_id: Some(WalletOperationId("wallet-op".to_owned())),
                })),
                failure: None,
                updated_at: Timestamp(102),
            },
            AllocationItemStatus {
                target: AllocationItemTarget::StabilityPool {
                    item_id: ItemId("stability-item".to_owned()),
                    amount: Sats(10),
                },
                status: ItemAllocationStatus::Failed,
                fulfilled_amount: None,
                completion_evidence: None,
                failure: Some(LiquidityFailure {
                    code: LiquidityFailureCode::InsufficientProviderFunds,
                    reason: Some(PRIVATE_PROVIDER_REASON.to_owned()),
                }),
                updated_at: Timestamp(103),
            },
        ],
        rejection_code: None,
        gateway_view_verified: true,
    };

    let rpc = liquidity_operation_to_rpc(snapshot.clone());
    assert_eq!(rpc.details_payload_hash, "2a".repeat(32));
    assert!(rpc.gateway_view_verified);
    assert_eq!(rpc.item_statuses.len(), 2);
    assert_eq!(
        rpc.item_statuses[0].completion_evidence,
        Some(RpcFaLiquidityCompletionEvidence::Gateway {
            gateway_id: "provider-opaque-gateway".to_owned(),
            fulfilled_sats: 20,
            observed_gateway_balance_sats: 25,
            observed_at: 101,
            withdrawal_txid: Some("txid".to_owned()),
            wallet_operation_id: Some("wallet-op".to_owned()),
        })
    );
    assert_eq!(
        rpc.item_statuses[1].failure_code.as_deref(),
        Some("insufficient_provider_funds")
    );
    let serialized = serde_json::to_string(&rpc).expect("RPC projection serializes");
    assert!(!serialized.contains(PRIVATE_PROVIDER_REASON));

    // The failure vocabulary is open: a future provider must not hide an
    // operation or its siblings in status/current/history projections.
    for code in ["future_failure_code", "gateway_attribution_abandoned"] {
        let mut stored = serde_json::to_value(&snapshot).unwrap();
        stored["item_statuses"][1]["failure"]["code"] = serde_json::json!(code);
        let recovered: LiquidityOperationSnapshot = serde_json::from_value(stored).unwrap();
        let rpc = liquidity_operation_to_rpc(recovered.clone());
        assert_eq!(rpc.item_statuses.len(), 2);
        assert_eq!(rpc.item_statuses[1].phase, RpcFaLiquidityItemPhase::Failed);
        assert_eq!(rpc.item_statuses[1].failure_code.as_deref(), Some(code));
        assert_eq!(
            rpc.item_statuses[0].phase,
            RpcFaLiquidityItemPhase::Completed
        );
        assert!(rpc.item_statuses[0].completion_evidence.is_some());
        assert!(
            !serde_json::to_string(&rpc)
                .unwrap()
                .contains(PRIVATE_PROVIDER_REASON)
        );
        let RpcFaLiquidityOperationPageResult::Page { page } =
            liquidity_operation_page_to_rpc(LiquidityOperationPage {
                operations: vec![recovered],
                next_after: Some(LiquidityOperationId("next-operation".to_owned())),
            })
        else {
            panic!("a future failure code must not make history unreadable");
        };
        assert_eq!(page.operations, vec![rpc]);
        assert_eq!(page.next_after.as_deref(), Some("next-operation"));
    }
}

#[test]
fn liquidity_page_projection_preserves_exclusive_cursor() {
    let result = liquidity_operation_page_to_rpc(LiquidityOperationPage {
        operations: Vec::new(),
        next_after: Some(LiquidityOperationId("next-operation".to_owned())),
    });
    assert_eq!(
        result,
        RpcFaLiquidityOperationPageResult::Page {
            page: RpcLiquidityOperationPage {
                operations: Vec::new(),
                next_after: Some("next-operation".to_owned()),
            },
        }
    );
}

#[test]
fn selection_preview_uses_manifolds_five_minute_capability_window() {
    assert_eq!(
        fa_client::MG_SELECTION_PREVIEW_VALIDITY,
        Duration::from_secs(5 * 60)
    );
}

#[test]
fn missing_process_local_preview_has_typed_expiry_detail() {
    let RpcFaOperationResult::Error { error } = preview_expired_result() else {
        panic!("an unavailable preview must require fresh authorization");
    };
    assert_eq!(error.code, RpcFaErrorCode::SelectionReauthorizationRequired);
    assert!(matches!(
        error.detail,
        Some(
            RpcFaOperationErrorDetail::SelectionReauthorizationRequired {
                reason: RpcFaSelectionReauthorizationReason::PreviewExpired,
            }
        )
    ));
}

#[test]
fn replacement_state_projects_stable_rows_and_narrow_payment_action() {
    let locator = test_locator();
    let replacement_seat = fa_client::GuardianReplacementSeat {
        index: 2,
        previous_mg_id: Keys::generate().public_key(),
        previous_quote_id: fa_client::QuoteId([9; 32]),
        previous_locator: locator.clone(),
    };
    let requirements: GuardianReplacementRequirements = serde_json::from_value(serde_json::json!({
        "replacement_id": hex::encode([0x2a; 32]),
        "seats": [replacement_seat],
    }))
    .expect("valid replacement requirements");
    let mut snapshot = FormationSnapshot {
        formation_id: fa_client::FormationId("formation".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: FederationName("Federation".to_owned()),
            federation_size: FederationSize(7),
            plan: PlanPreference::InfiniteBestEffort,
            fedimintd_versions: fedimintd_version_range("0.11.1"),
            fedimintd_dkg_version: fedimintd_dkg_version("0.11.1"),
            max_total_msats: Some(100_000),
        },
        phase: FormationPhase::Preparing,
        seats: vec![fa_client::SeatProgress {
            index: 2,
            mg_id: Keys::generate().public_key(),
            locator,
            seat_id: None,
            guardian_code: None,
            phase: SeatPhase::ReplacementRequired,
            freshness: FormationFreshness::Fresh,
        }],
        freshness: FormationFreshness::Fresh,
        action_required: Some(FormationActionRequired::ReplaceGuardians(requirements)),
        payment_outputs_started: true,
        invite_code: None,
        last_error: None,
    };

    let rpc = formation_snapshot_to_rpc(snapshot.clone());
    assert_eq!(rpc.seats[0].phase, RpcFaSeatPhase::ReplacementRequired);
    match rpc.action_required.expect("replacement action") {
        RpcFaFormationActionRequired::ReplaceGuardians { requirements } => {
            assert_eq!(requirements.replacement_id, hex::encode([0x2a; 32]));
            assert_eq!(requirements.seats[0].index, 2);
            assert_eq!(
                requirements.seats[0].previous_quote_id,
                hex::encode([9; 32])
            );
        }
        other => panic!("unexpected replacement projection: {other:?}"),
    }

    snapshot.action_required = Some(FormationActionRequired::AuthorizePayments(
        fa_client::PaymentRequirements {
            authorization_id: payment_authorization_id(2),
            total_msats: 12_000,
            max_total_msats: Some(10_000),
            seats: vec![fa_client::SeatPaymentRequirement {
                index: 2,
                mg_id: Keys::generate().public_key(),
                quote_id: fa_client::QuoteId([8; 32]),
                payment_federation_id: FederationId("payer".to_owned()),
                amount_msats: 12_000,
            }],
        },
    ));
    let rpc = formation_snapshot_to_rpc(snapshot);
    assert!(matches!(
        rpc.action_required,
        Some(RpcFaFormationActionRequired::AuthorizeReplacementPayments { requirements })
            if requirements.authorization_id == hex::encode([2; 32])
                && requirements.total_msats == RpcFaMsats(12_000)
                && requirements.max_total_msats == Some(RpcFaMsats(10_000))
    ));
}

#[test]
fn supervisor_retries_only_unattended_nonterminal_formation() {
    let snapshot = FormationSnapshot {
        formation_id: fa_client::FormationId("formation".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: fa_client::FederationName("Federation".to_owned()),
            federation_size: FederationSize(7),
            plan: PlanPreference::InfiniteBestEffort,
            fedimintd_versions: fedimintd_version_range("0.11.1"),
            fedimintd_dkg_version: fedimintd_dkg_version("0.11.1"),
            max_total_msats: Some(100_000),
        },
        phase: FormationPhase::Preparing,
        seats: Vec::new(),
        freshness: FormationFreshness::Fresh,
        action_required: None,
        payment_outputs_started: false,
        invite_code: None,
        last_error: None,
    };

    assert!(!should_auto_resume(&FaStatus::Idle));
    assert!(should_auto_resume(&FaStatus::Restored(
        test_restored_formation(FormationFreshness::Unsynced)
    )));
    assert!(!should_auto_resume(&FaStatus::Restored(
        test_restored_formation(FormationFreshness::Fresh)
    )));
    assert!(should_auto_resume(&FaStatus::Formation(snapshot.clone())));

    let mut formed = snapshot.clone();
    formed.phase = FormationPhase::Formed;
    formed.freshness = FormationFreshness::Fresh;
    assert!(!should_auto_resume(&FaStatus::Formation(formed)));

    let mut formed_unsynced = snapshot.clone();
    formed_unsynced.phase = FormationPhase::Formed;
    formed_unsynced.freshness = FormationFreshness::Unsynced;
    assert!(should_auto_resume(&FaStatus::Formation(
        formed_unsynced.clone()
    )));
    // Confirmed completion survives the launch recheck: the phase and the
    // milestone stay put, only `freshness` says a check is running.
    assert!(formation_milestones(&formed_unsynced).wallet_service_created);
    let projected = formation_snapshot_to_rpc(formed_unsynced.clone());
    assert_eq!(projected.phase, RpcFaFormationPhase::Formed);
    assert_eq!(projected.freshness, RpcFaFormationFreshness::Unsynced);
    assert!(projected.milestones.wallet_service_created);

    let mut formed_fresh = snapshot.clone();
    formed_fresh.phase = FormationPhase::Formed;
    formed_fresh.freshness = FormationFreshness::Fresh;
    assert!(formation_milestones(&formed_fresh).wallet_service_created);

    let mut dkg_complete = snapshot.clone();
    dkg_complete.phase = FormationPhase::DkgComplete;
    assert!(should_auto_resume(&FaStatus::Formation(
        dkg_complete.clone()
    )));
    let projected = formation_snapshot_to_rpc(dkg_complete);
    assert_eq!(projected.phase, RpcFaFormationPhase::DkgComplete);
    assert!(!projected.milestones.wallet_service_created);

    let mut awaiting_user = snapshot.clone();
    awaiting_user.action_required = Some(FormationActionRequired::AuthorizePayments(
        fa_client::PaymentRequirements {
            authorization_id: payment_authorization_id(1),
            total_msats: 10_000,
            max_total_msats: Some(100_000),
            seats: Vec::new(),
        },
    ));
    assert!(!should_auto_resume(&FaStatus::Formation(awaiting_user)));

    let mut needs_reauthorization = snapshot.clone();
    needs_reauthorization.last_error = Some(FaErrorCode::SelectionReauthorizationRequired);
    assert!(!should_auto_resume(&FaStatus::Formation(
        needs_reauthorization
    )));

    let mut retryable_failure = snapshot;
    retryable_failure.last_error = Some(FaErrorCode::Timeout);
    assert!(should_auto_resume(&FaStatus::Formation(retryable_failure)));
}

#[test]
fn supervisor_backoff_resets_on_progress_and_caps_at_five_minutes() {
    assert_eq!(
        next_retry_delay(Duration::ZERO, false),
        FA_RESUME_INITIAL_BACKOFF
    );
    assert_eq!(
        next_retry_delay(FA_RESUME_INITIAL_BACKOFF, false),
        FA_RESUME_INITIAL_BACKOFF * 2
    );
    assert_eq!(
        next_retry_delay(FA_RESUME_MAX_BACKOFF, false),
        FA_RESUME_MAX_BACKOFF
    );
    assert_eq!(
        next_retry_delay(FA_RESUME_MAX_BACKOFF, true),
        FA_RESUME_INITIAL_BACKOFF
    );
}

#[test]
fn fa_errors_map_to_stable_rpc_codes_and_messages() {
    let error = fa_error_to_rpc(&FaError::Timeout("waiting for DKG".to_owned()));
    assert_eq!(error.code, RpcFaErrorCode::Timeout);
    assert_eq!(error.message, "The FA operation timed out");
}

#[test]
fn fa_rpc_errors_do_not_expose_internal_or_remote_details() {
    const PRIVATE_DETAIL: &str = "private-remote-error-detail";
    let errors = [
        FaError::Storage(PRIVATE_DETAIL.to_owned()),
        FaError::Identity(PRIVATE_DETAIL.to_owned()),
        FaError::InvalidManifoldGuardians(PRIVATE_DETAIL.to_owned()),
        FaError::ManifoldGuardian {
            index: 3,
            message: PRIVATE_DETAIL.to_owned(),
        },
        FaError::Payment(PRIVATE_DETAIL.to_owned()),
        FaError::Liquidity(PRIVATE_DETAIL.to_owned()),
        FaError::Timeout(PRIVATE_DETAIL.to_owned()),
    ];

    for error in errors {
        let rpc_error = fa_error_to_rpc(&error);
        assert!(
            !rpc_error.message.contains(PRIVATE_DETAIL),
            "{error:?} leaked its internal detail"
        );
        assert_eq!(rpc_error.message, fa_error_message(rpc_error.code));
    }
}

#[tokio::test]
async fn fa_status_stream_emits_current_formation_and_typed_init_failure() {
    let locator: Locator = serde_json::from_str(
        r#"{"version":1,"endpoint_addr":{"id":"8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c","addrs":[]},"service_pubkey":"4d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766"}"#,
    )
    .unwrap();
    let snapshot = FormationSnapshot {
        formation_id: fa_client::FormationId("formation-current".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: fa_client::FederationName("Current Federation".to_owned()),
            federation_size: FederationSize(7),
            plan: PlanPreference::InfiniteBestEffort,
            fedimintd_versions: fedimintd_version_range("0.11.1"),
            fedimintd_dkg_version: fedimintd_dkg_version("0.11.1"),
            max_total_msats: Some((1_u64 << 53) + 1),
        },
        phase: FormationPhase::DkgUnderway,
        seats: vec![fa_client::SeatProgress {
            index: 0,
            mg_id: Keys::generate().public_key(),
            locator,
            seat_id: None,
            guardian_code: None,
            phase: SeatPhase::DkgUnderway,
            freshness: FormationFreshness::Unsynced,
        }],
        freshness: FormationFreshness::Unsynced,
        action_required: None,
        payment_outputs_started: false,
        invite_code: None,
        last_error: Some(FaErrorCode::Timeout),
    };
    let (_sender, receiver) = watch::channel(FaStatus::Formation(snapshot));
    let mut stream = fa_client_status_stream(Ok(receiver));

    let current = stream.next().await.expect("watch current state");
    let RpcFaClientStatus::Ready {
        status: RpcFaStatus::Formation { formation },
    } = current
    else {
        panic!("current status must be the valid formation snapshot");
    };
    assert_eq!(formation.formation_id, "formation-current");
    assert_eq!(formation.phase, RpcFaFormationPhase::DkgUnderway);
    assert_eq!(
        formation.intent.max_total_msats,
        Some(RpcFaMsats((1_u64 << 53) + 1))
    );
    assert_eq!(formation.seats.len(), 1);
    assert_eq!(formation.seats[0].phase, RpcFaSeatPhase::DkgUnderway);

    let expected_error = RpcFaOperationError {
        code: RpcFaErrorCode::Storage,
        message: "FA storage is unavailable".to_owned(),
        detail: None,
    };
    let mut failed = fa_client_status_stream(Err(expected_error.clone()));
    assert_eq!(
        failed.next().await,
        Some(RpcFaClientStatus::Failed {
            error: expected_error
        })
    );
    assert!(failed.next().await.is_none());
}

#[tokio::test]
async fn recovery_status_tracks_gate_without_calling_idle_success() {
    let (status_sender, status) = watch::channel(FaStatus::Recovery { last_error: None });
    let mut stream = fa_client_status_stream(Ok(status));
    assert_eq!(
        stream.next().await,
        Some(RpcFaClientStatus::Ready {
            status: RpcFaStatus::Recovery { error: None },
        })
    );

    let error = operation_error(
        RpcFaErrorCode::Registry,
        fa_error_message(RpcFaErrorCode::Registry),
    );
    status_sender.send_replace(FaStatus::Recovery {
        last_error: Some(FaErrorCode::Registry),
    });
    assert_eq!(
        stream.next().await,
        Some(RpcFaClientStatus::Ready {
            status: RpcFaStatus::Recovery { error: Some(error) },
        })
    );
    status_sender.send_replace(FaStatus::Idle);
    assert_eq!(
        stream.next().await,
        Some(RpcFaClientStatus::Ready {
            status: RpcFaStatus::Idle
        })
    );

    // The same status stream publishes restored facts once recovery is ready.
    status_sender.send_replace(FaStatus::Restored(test_restored_formation(
        FormationFreshness::Unsynced,
    )));
    assert!(matches!(
        stream.next().await,
        Some(RpcFaClientStatus::Ready {
            status: RpcFaStatus::Restored { .. }
        })
    ));
}

#[test]
fn restored_status_projects_recovery_facts() {
    let RpcFaStatus::Restored { formation } = fa_status_to_rpc(FaStatus::Restored(
        test_restored_formation(FormationFreshness::Unsynced),
    )) else {
        panic!("restored status must remain distinguishable at the RPC boundary");
    };

    assert_eq!(formation.snapshot_generation, 3);
    assert_eq!(formation.formation_id, "restored-formation");
    assert_eq!(
        formation.federation_name.as_deref(),
        Some("Restored Federation")
    );
    assert_eq!(formation.phase, RpcFaFormationPhase::Formed);
    assert_eq!(formation.freshness, RpcFaFormationFreshness::Unsynced);
    assert!(formation.seats.is_empty());
}

struct TestDriverBackend {
    status: Mutex<FaStatus>,
    next_status: Mutex<Option<FaStatus>>,
    block: TestAtomicBool,
    started: Notify,
    release: Notify,
    completed: Notify,
    calls: AtomicUsize,
    cancelled_in_flight: TestAtomicBool,
}

impl TestDriverBackend {
    fn new(status: FaStatus, next_status: Option<FaStatus>, block: bool) -> Self {
        Self {
            status: Mutex::new(status),
            next_status: Mutex::new(next_status),
            block: TestAtomicBool::new(block),
            started: Notify::new(),
            release: Notify::new(),
            completed: Notify::new(),
            calls: AtomicUsize::new(0),
            cancelled_in_flight: TestAtomicBool::new(false),
        }
    }
}

fn test_formation_local_state() -> Arc<FormationLocalState> {
    Arc::new(FormationLocalState::new(
        Err(Arc::new(FaPushError::Transport)),
        FaManifoldEnvironment::Staging,
    ))
}

struct TestExecutionGuard<'a> {
    cancelled: &'a TestAtomicBool,
    completed: bool,
}

impl Drop for TestExecutionGuard<'_> {
    fn drop(&mut self) {
        if !self.completed {
            self.cancelled.store(true, AtomicOrdering::SeqCst);
        }
    }
}

#[apply(async_trait_maybe_send!)]
impl FaDriverBackend for TestDriverBackend {
    fn status(&self) -> FaStatus {
        self.status.lock().expect("status lock is healthy").clone()
    }

    async fn execute(
        &self,
        operation: FaDriverOperation,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaDriverResponse {
        self.calls.fetch_add(1, AtomicOrdering::SeqCst);
        if matches!(operation, FaDriverOperation::RestartDkg) {
            return FaDriverResponse::Formation(RpcFaOperationResult::Success);
        }
        let mut guard = TestExecutionGuard {
            cancelled: &self.cancelled_in_flight,
            completed: false,
        };
        self.started.notify_one();
        if self.block.load(AtomicOrdering::SeqCst) {
            self.release.notified().await;
        }
        if let Some(next) = self
            .next_status
            .lock()
            .expect("next status lock is healthy")
            .take()
        {
            *self.status.lock().expect("status lock is healthy") = next;
        }
        guard.completed = true;
        self.completed.notify_one();
        FaDriverResponse::Formation(RpcFaOperationResult::Success)
    }

    async fn current_liquidity_operation(&self) -> FaResult<Option<LiquidityOperationSnapshot>> {
        Ok(None)
    }

    async fn resume_liquidity_on_launch(
        &self,
        _operation_id: LiquidityOperationId,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaResult<LiquidityOperationSnapshot> {
        Err(FaError::Liquidity(
            "unexpected test liquidity resume".to_owned(),
        ))
    }

    async fn sleep(&self, delay: Duration) {
        fedimint_core::task::sleep(delay).await;
    }
}

fn test_formation(phase: FormationPhase, freshness: FormationFreshness) -> FaStatus {
    FaStatus::Formation(FormationSnapshot {
        formation_id: fa_client::FormationId("formation".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: fa_client::FederationName("Federation".to_owned()),
            federation_size: FederationSize(7),
            plan: PlanPreference::InfiniteBestEffort,
            fedimintd_versions: fedimintd_version_range("0.11.1-fedi10"),
            fedimintd_dkg_version: fedimintd_dkg_version("0.11.1-fedi10"),
            max_total_msats: Some(100_000),
        },
        phase,
        seats: Vec::new(),
        freshness,
        action_required: None,
        payment_outputs_started: false,
        invite_code: None,
        last_error: None,
    })
}

async fn wait_for_claim_release(operation_active: &AtomicBool) {
    tokio::time::timeout(Duration::from_secs(2), async {
        while operation_active.load(Ordering::Acquire) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("the production supervisor releases its mutation claim");
}

#[tokio::test]
async fn abandon_formation_is_serialized_through_the_driver() {
    let (sender, receiver) = mpsc::channel(FA_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FaCommandSender {
        sender,
        operation_active,
    };
    let operations = Arc::new(Mutex::new(Vec::new()));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FA abandon driver test", {
        let operations = operations.clone();
        async move {
            run_driver_loop(receiver, move |operation| {
                let operations = operations.clone();
                async move {
                    let name = match operation {
                        FaDriverOperation::Abandon => "abandon",
                        _ => "unexpected",
                    };
                    operations.lock().unwrap().push(name);
                    Ok(())
                }
            })
            .await;
        }
    });

    assert_eq!(
        driver.request(FaDriverOperation::Abandon).await,
        RpcFaOperationResult::Success
    );
    assert_eq!(*operations.lock().unwrap(), vec!["abandon"]);

    drop(driver);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the abandon driver test shuts down");
}

#[tokio::test]
async fn production_supervisor_outlives_a_dropped_caller_and_serializes_commands() {
    let (sender, receiver) = mpsc::channel(FA_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FaCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let backend = Arc::new(TestDriverBackend::new(FaStatus::Idle, None, true));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FA production supervisor test", {
        let backend = backend.clone();
        let operation_active = operation_active.clone();
        async move {
            run_supervised_driver_loop(
                backend,
                Arc::new(BridgeLiquidityConnector::default()),
                test_formation_local_state(),
                receiver,
                operation_active,
            )
            .await;
        }
    });

    let abandoned_caller = fedimint_core::task::spawn("abandoned FA caller", {
        let driver = driver.clone();
        async move { driver.request(FaDriverOperation::Resume).await }
    });
    tokio::time::timeout(Duration::from_secs(2), backend.started.notified())
        .await
        .expect("the production supervisor accepts the command");
    abandoned_caller.abort();
    tokio::time::timeout(Duration::from_secs(2), abandoned_caller)
        .await
        .expect("the abandoned caller joins promptly")
        .expect_err("the caller was cancelled");

    assert_eq!(
        tokio::time::timeout(
            Duration::from_secs(2),
            driver.request(FaDriverOperation::Resume)
        )
        .await
        .expect("Busy is returned without waiting"),
        operation_error_result(
            RpcFaErrorCode::Busy,
            "An FA operation is already in progress"
        )
    );

    backend.release.notify_one();
    tokio::time::timeout(Duration::from_secs(2), backend.completed.notified())
        .await
        .expect("accepted work completes after its caller disappears");
    wait_for_claim_release(&operation_active).await;

    backend.block.store(false, AtomicOrdering::SeqCst);
    assert_eq!(
        tokio::time::timeout(
            Duration::from_secs(2),
            driver.request(FaDriverOperation::Resume)
        )
        .await
        .expect("the next command completes"),
        RpcFaOperationResult::Success
    );
    assert_eq!(backend.calls.load(AtomicOrdering::SeqCst), 2);

    drop(driver);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the production supervisor shuts down");
}

#[tokio::test]
async fn production_supervisor_shutdown_cancels_in_flight_work_without_detaching_it() {
    let (sender, receiver) = mpsc::channel(FA_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FaCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let backend = Arc::new(TestDriverBackend::new(FaStatus::Idle, None, true));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FA production shutdown test", {
        let backend = backend.clone();
        let operation_active = operation_active.clone();
        async move {
            run_supervised_driver_loop(
                backend,
                Arc::new(BridgeLiquidityConnector::default()),
                test_formation_local_state(),
                receiver,
                operation_active,
            )
            .await;
        }
    });
    let caller = fedimint_core::task::spawn("FA shutdown caller", {
        let driver = driver.clone();
        async move { driver.request(FaDriverOperation::Resume).await }
    });
    tokio::time::timeout(Duration::from_secs(2), backend.started.notified())
        .await
        .expect("the operation starts");

    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("task-group shutdown cancels the driver");
    assert!(backend.cancelled_in_flight.load(AtomicOrdering::SeqCst));
    assert!(!operation_active.load(Ordering::Acquire));
    assert_eq!(backend.calls.load(AtomicOrdering::SeqCst), 1);
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(2), caller)
            .await
            .expect("the caller is released on shutdown")
            .expect("the caller task itself remains healthy"),
        RpcFaOperationResult::Error {
            error: driver_unavailable_error(),
        }
    );
}

async fn assert_startup_reconciles(initial: FaStatus) {
    let (sender, receiver) = mpsc::channel(FA_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let final_status = test_formation(FormationPhase::Formed, FormationFreshness::Fresh);
    let backend = Arc::new(TestDriverBackend::new(
        initial,
        Some(final_status.clone()),
        false,
    ));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FA production restart test", {
        let backend = backend.clone();
        let operation_active = operation_active.clone();
        async move {
            run_supervised_driver_loop(
                backend,
                Arc::new(BridgeLiquidityConnector::default()),
                test_formation_local_state(),
                receiver,
                operation_active,
            )
            .await;
        }
    });
    tokio::time::timeout(Duration::from_secs(2), backend.completed.notified())
        .await
        .expect("startup reconciliation completes");
    assert_eq!(backend.calls.load(AtomicOrdering::SeqCst), 1);
    assert_eq!(backend.status(), final_status);
    wait_for_claim_release(&operation_active).await;
    drop(sender);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the restart supervisor shuts down");
}

#[tokio::test]
async fn production_supervisor_reconciles_nonterminal_and_formed_unsynced_restarts() {
    assert_startup_reconciles(test_formation(
        FormationPhase::Preparing,
        FormationFreshness::Unsynced,
    ))
    .await;
    assert_startup_reconciles(test_formation(
        FormationPhase::Formed,
        FormationFreshness::Unsynced,
    ))
    .await;
}

async fn start_blocked_resume(
    status: FaStatus,
) -> (
    FaCommandSender,
    Arc<FormationLocalState>,
    Arc<TestDriverBackend>,
    TaskGroup,
) {
    let (sender, receiver) = mpsc::channel(FA_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FaCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let formation_state = test_formation_local_state();
    let backend = Arc::new(TestDriverBackend::new(status, None, true));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FA DKG restart supervisor test", {
        let backend = backend.clone();
        let formation_state = formation_state.clone();
        async move {
            run_supervised_driver_loop(
                backend,
                Arc::new(BridgeLiquidityConnector::default()),
                formation_state,
                receiver,
                operation_active,
            )
            .await;
        }
    });
    tokio::time::timeout(Duration::from_secs(2), backend.started.notified())
        .await
        .expect("the background resume starts");
    (driver, formation_state, backend, task_group)
}

#[tokio::test]
async fn dkg_restart_cancels_a_background_resume_waiting_on_dkg() {
    let (driver, formation_state, backend, task_group) = start_blocked_resume(test_formation(
        FormationPhase::DkgUnderway,
        FormationFreshness::Fresh,
    ))
    .await;

    assert_eq!(
        tokio::time::timeout(
            Duration::from_secs(4),
            driver.request_restart_dkg(&formation_state.dkg_restart_requested),
        )
        .await
        .expect("the restart does not wait for the resume run to time out"),
        RpcFaOperationResult::Success
    );
    assert!(backend.cancelled_in_flight.load(AtomicOrdering::SeqCst));
    assert_eq!(backend.calls.load(AtomicOrdering::SeqCst), 2);

    drop(driver);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the restart supervisor shuts down");
}

#[tokio::test]
async fn dkg_restart_leaves_a_resume_outside_dkg_running() {
    let (driver, formation_state, backend, task_group) = start_blocked_resume(test_formation(
        FormationPhase::AcquiringSeats,
        FormationFreshness::Fresh,
    ))
    .await;

    assert_eq!(
        tokio::time::timeout(
            Duration::from_secs(4),
            driver.request_restart_dkg(&formation_state.dkg_restart_requested),
        )
        .await
        .expect("the restart gives up while the resume keeps its claim"),
        operation_error_result(
            RpcFaErrorCode::Busy,
            "An FA operation is already in progress",
        )
    );
    assert!(!backend.cancelled_in_flight.load(AtomicOrdering::SeqCst));
    assert_eq!(backend.calls.load(AtomicOrdering::SeqCst), 1);

    backend.release.notify_one();
    tokio::time::timeout(Duration::from_secs(2), backend.completed.notified())
        .await
        .expect("the resume finishes on its own");
    drop(driver);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the restart supervisor shuts down");
}

struct LiquidityResponseBackend {
    operations: Mutex<Vec<&'static str>>,
    current_reads: AtomicUsize,
    response: RpcFaLiquidityOperationResult,
}

#[apply(async_trait_maybe_send!)]
impl FaDriverBackend for LiquidityResponseBackend {
    fn status(&self) -> FaStatus {
        FaStatus::Idle
    }

    async fn execute(
        &self,
        operation: FaDriverOperation,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaDriverResponse {
        let operation_name = match operation {
            FaDriverOperation::StartLiquidity { .. } => "start",
            FaDriverOperation::ResumeLiquidity { .. } => "resume",
            _ => panic!("unexpected non-liquidity command"),
        };
        self.operations
            .lock()
            .expect("operation lock is healthy")
            .push(operation_name);
        FaDriverResponse::Liquidity(self.response.clone())
    }

    async fn current_liquidity_operation(&self) -> FaResult<Option<LiquidityOperationSnapshot>> {
        self.current_reads.fetch_add(1, AtomicOrdering::SeqCst);
        Ok(None)
    }

    async fn resume_liquidity_on_launch(
        &self,
        _operation_id: LiquidityOperationId,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FaResult<LiquidityOperationSnapshot> {
        Err(FaError::Liquidity(
            "unexpected test liquidity resume".to_owned(),
        ))
    }

    async fn sleep(&self, delay: Duration) {
        fedimint_core::task::sleep(delay).await;
    }
}

#[tokio::test]
async fn command_channel_preserves_typed_start_and_resume_liquidity_responses() {
    let expected = RpcFaLiquidityOperationResult::Operation {
        operation: RpcFaLiquidityOperation {
            operation_id: "operation".to_owned(),
            formation_id: "formation".to_owned(),
            provider_pubkey: "provider".to_owned(),
            endpoint_hint: Some("iroh://provider".to_owned()),
            details_payload_hash: "2a".repeat(32),
            amounts: RpcFaLiquidityAmountBounds {
                gateway_min_sats: 10,
                gateway_max_sats: Some(20),
                stability_min_sats: 0,
                stability_max_sats: None,
            },
            phase: RpcFaLiquidityOperationPhase::Prepared,
            item_statuses: Vec::new(),
            rejection_code: None,
            gateway_view_verified: false,
        },
    };
    let backend = Arc::new(LiquidityResponseBackend {
        operations: Mutex::new(Vec::new()),
        current_reads: AtomicUsize::new(0),
        response: expected.clone(),
    });
    let (sender, receiver) = mpsc::channel(FA_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FaCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FA typed liquidity response test", {
        let backend = backend.clone();
        let operation_active = operation_active.clone();
        async move {
            run_supervised_driver_loop(
                backend,
                Arc::new(BridgeLiquidityConnector::default()),
                test_formation_local_state(),
                receiver,
                operation_active,
            )
            .await;
        }
    });

    let intent = LiquidityRequestIntent {
        amounts: LiquidityAmountBounds {
            gateway_min_amount: Sats(10),
            gateway_max_amount: Some(Sats(20)),
            stability_min_amount: Sats(0),
            stability_max_amount: None,
        },
    };
    tokio::time::timeout(Duration::from_secs(2), async {
        while backend.current_reads.load(AtomicOrdering::SeqCst) == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("startup checks canonical liquidity recovery");
    let startup_reads = backend.current_reads.load(AtomicOrdering::SeqCst);
    assert_eq!(
        driver
            .request_liquidity(FaDriverOperation::StartLiquidity {
                formation_id: FormationId("formation".to_owned()),
                provider_pubkey: Pubkey("provider".to_owned()),
                intent,
            })
            .await,
        expected
    );
    tokio::time::timeout(Duration::from_secs(2), async {
        while backend.current_reads.load(AtomicOrdering::SeqCst) <= startup_reads {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("start re-arms canonical recovery");
    let reads_after_start = backend.current_reads.load(AtomicOrdering::SeqCst);
    assert_eq!(
        driver
            .request_liquidity(FaDriverOperation::ResumeLiquidity {
                operation_id: LiquidityOperationId("operation".to_owned()),
            })
            .await,
        expected
    );
    tokio::time::timeout(Duration::from_secs(2), async {
        while backend.current_reads.load(AtomicOrdering::SeqCst) <= reads_after_start {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("explicit resume re-arms canonical recovery");
    assert_eq!(
        *backend
            .operations
            .lock()
            .expect("operation lock is healthy"),
        vec!["start", "resume"]
    );

    drop(driver);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the typed response supervisor shuts down");
}
