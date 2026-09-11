use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool as TestAtomicBool, AtomicUsize, Ordering as AtomicOrdering};

use fedimint_core::db::mem_impl::MemDatabase;
use fedimint_core::db::{
    Database, DatabaseValue, DecodingError, IDatabaseTransactionOpsCore,
    IDatabaseTransactionOpsCoreTyped, IRawDatabaseExt,
};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::impl_db_record;
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::task::TaskGroup;
use fi_client::{UnavailableFiFeeAccountProvider, UnavailablePayments};
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

fn fedimintd_dkg_version(version: &str) -> fi_client::FedimintdDkgVersion {
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
enum TestFiDbPrefix {
    ActiveFormation = 0x00,
}

#[derive(Debug, Decodable, Encodable)]
struct TestActiveFormationKey;

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
struct TestStoredFormation {
    schema_version: u16,
    fi_id: Option<FiId>,
    formation_id: fi_client::FormationId,
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
        serde_json::to_vec(self).expect("FI identity fixture must serialize")
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
    db_prefix = TestFiDbPrefix::ActiveFormation,
);

#[derive(Clone, Default)]
struct TestRegistry;

impl FiNostrClient for TestRegistry {
    async fn fetch_fman_advertisement(
        &self,
        _fman_pubkey: PublicKey,
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

    async fn fetch_fman_advertisements(&self, _timeout: Duration) -> NostrClientResult<Vec<Event>> {
        panic!("identity reopen does not access the registry")
    }
}

#[derive(Default)]
struct TestConnector;

impl FleetManagerConnector for TestConnector {
    type Client = FleetManagerServiceClient;

    async fn connect(
        &self,
        _locator: &Locator,
    ) -> Result<Self::Client, FleetManagerConnectorError> {
        panic!("identity reopen does not connect to a Fleet Manager")
    }

    async fn get_availability(
        &self,
        _client: &Self::Client,
        _request: GetAvailabilityRequest,
    ) -> Result<Result<GetAvailabilityResponse, FleetManagerError>, FleetManagerCallError> {
        panic!("identity reopen does not call a Fleet Manager")
    }

    async fn get_quote(
        &self,
        _client: &Self::Client,
        _request: GetQuoteRequest,
    ) -> Result<Result<SignedResponse<GetQuoteResponse>, FleetManagerError>, FleetManagerCallError>
    {
        panic!("identity reopen does not call a Fleet Manager")
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

type TestBridgeFiClient = FiClient<
    BridgeFiIdentity,
    UnavailablePayments,
    TestRegistry,
    TestConnector,
    TestConsensusReader,
>;

async fn open_test_fi_client(
    database: Database,
    identity: BridgeFiIdentity,
) -> FiResult<TestBridgeFiClient> {
    let profile = ManifoldEnvironment::Development
        .profile()
        .expect("development profile is valid");
    let verifier = PeerBadgeVerifier::try_from_profile(&profile)
        .expect("development PeerBadge profile is valid");
    FiClient::open(
        database,
        identity,
        UnavailablePayments,
        TestRegistry,
        TestConnector,
        verifier,
        TestConsensusReader,
        UnavailableFiFeeAccountProvider,
    )
    .await
}

fn bridge_fi_id(identity: &BridgeFiIdentity) -> FiId {
    let keypair = identity
        .scoped_root()
        .child_key(fedimint_derive_secret::ChildId(0))
        .to_secp_key(bitcoin::secp256k1::SECP256K1);
    serde_json::from_value(serde_json::to_value(keypair.x_only_public_key().0).unwrap()).unwrap()
}

async fn seed_identity_bound_formation(database: &Database, fi_id: FiId) {
    let mut dbtx = database.begin_transaction().await;
    dbtx.insert_entry(
        &TestActiveFormationKey,
        &TestStoredFormation {
            schema_version: 9,
            fi_id: Some(fi_id),
            formation_id: fi_client::FormationId("identity-vector".to_owned()),
            phase: TestStoredFormationPhase::Initialized,
            intent: ResolvedFormationIntent {
                federation_name: fi_client::FederationName("Identity vector federation".to_owned()),
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
    let identity = BridgeFiIdentity::from_root_secret(&root);
    let fi_id = bridge_fi_id(&identity);
    let development = ManifoldEnvironment::Development
        .profile()
        .expect("development profile is valid");
    let staging = ManifoldEnvironment::Staging
        .profile()
        .expect("staging profile is valid");
    let database = MemDatabase::new().into_database();
    seed_identity_bound_formation(&database, fi_id).await;
    let mut dbtx = database.begin_transaction().await;
    let bytes = dbtx
        .raw_get_bytes(FI_ACTIVE_FORMATION_KEY)
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
        FI_ACTIVE_FORMATION_KEY,
        &serde_json::to_vec(&formation).unwrap(),
    )
    .await
    .unwrap();
    dbtx.commit_tx().await;

    migrate_fi_guardian_fee_field(&database)
        .await
        .expect("the old field migrates");
    open_test_fi_client(database, identity)
        .await
        .expect("Manifold reopens the migrated formation");
}

#[tokio::test]
async fn guardian_fee_migration_leaves_current_and_absent_records_alone() {
    let database = MemDatabase::new().into_database();
    migrate_fi_guardian_fee_field(&database)
        .await
        .expect("an absent formation needs no migration");

    let current = serde_json::json!({
        "formation_meta_target": {
            "guardian_verification_fee_account": "current"
        }
    });
    let current_bytes = serde_json::to_vec(&current).unwrap();
    let mut dbtx = database.begin_transaction().await;
    dbtx.raw_insert_bytes(FI_ACTIVE_FORMATION_KEY, &current_bytes)
        .await
        .unwrap();
    dbtx.commit_tx().await;

    migrate_fi_guardian_fee_field(&database)
        .await
        .expect("a current formation needs no migration");
    let saved = database
        .begin_transaction_nc()
        .await
        .raw_get_bytes(FI_ACTIVE_FORMATION_KEY)
        .await
        .unwrap();
    assert_eq!(saved.as_deref(), Some(current_bytes.as_slice()));
}

#[tokio::test]
async fn fi_identity_has_a_golden_vector_and_resets_legacy_formation_before_owner_checks() {
    let first_root = DerivableSecret::new_root(&[1; 32], b"fi-client-test");
    let second_root = DerivableSecret::new_root(&[2; 32], b"fi-client-test");

    let first_identity = BridgeFiIdentity::from_root_secret(&first_root);
    let first = bridge_fi_id(&first_identity);
    let repeated = bridge_fi_id(&BridgeFiIdentity::from_root_secret(&first_root));
    let second = bridge_fi_id(&BridgeFiIdentity::from_root_secret(&second_root));

    assert_eq!(first, repeated);
    assert_ne!(first, second);
    assert_eq!(
        first.0.to_string(),
        "aa70a4ebfdb888b375e86f007873fae0f22118add2ca6f60309fc7ab8902e3bd"
    );
    assert_eq!(FI_CLIENT_CHILD_ID.0, 17);

    let database = MemDatabase::new().into_database();
    seed_identity_bound_formation(&database, first).await;
    let reopened = open_test_fi_client(
        database.clone(),
        BridgeFiIdentity::from_root_secret(&first_root),
    )
    .await
    .expect("the same app root resets incompatible pre-production FI state");
    assert!(matches!(reopened.status(), FiStatus::Idle));

    let different_root =
        open_test_fi_client(database, BridgeFiIdentity::from_root_secret(&second_root))
            .await
            .expect("the reset runs before an incompatible legacy owner is checked");
    assert!(matches!(different_root.status(), FiStatus::Idle));
}

#[test]
fn formation_uses_the_bridge_release_range() {
    let intent = formation_intent_from_rpc(RpcFiFormationIntent {
        federation_name: Some("Paid federation".to_owned()),
        federation_size: 7,
        plan: RpcFiPlanPreference::InfiniteBestEffort,
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
    let request = selection_request_from_rpc(RpcFiSelectionPreviewRequest {
        federation_size: 7,
        plan: RpcFiPlanPreference::InfiniteBestEffort,
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
        RpcFiFederationMetadataUpdate::Name {
            value: "New Federation".to_owned(),
        },
        RpcFiFederationMetadataUpdate::IconUrl {
            value: "https://example.com/icon.png".to_owned(),
        },
        RpcFiFederationMetadataUpdate::WelcomeMessage {
            value: "Welcome members".to_owned(),
        },
        RpcFiFederationMetadataUpdate::TermsOfService {
            value: "https://example.com/terms".to_owned(),
        },
    ];
    for update in updates {
        assert!(metadata_update_from_rpc(update).is_ok());
    }

    let error = metadata_update_from_rpc(RpcFiFederationMetadataUpdate::IconUrl {
        value: "data:image/png;base64,AA==".to_owned(),
    })
    .expect_err("raw image data is outside the maintenance contract");
    assert_eq!(error.code, RpcFiErrorCode::InvalidIntent);
}

#[test]
fn terms_rpc_preserves_the_url_and_rejects_invalid_values() {
    let url = "https://example.com/terms";
    let update = metadata_update_from_rpc(RpcFiFederationMetadataUpdate::TermsOfService {
        value: url.to_owned(),
    })
    .unwrap();
    let (key, value) = update.into_field();
    assert_eq!(key.0, "fedi:tos_url");
    assert_eq!(value.0, url);

    for value in ["", "not a URL", "file:///terms", "http://localhost/terms"] {
        let error = metadata_update_from_rpc(RpcFiFederationMetadataUpdate::TermsOfService {
            value: value.to_owned(),
        })
        .expect_err("invalid terms must be rejected before contacting guardians");
        assert_eq!(error.code, RpcFiErrorCode::InvalidIntent);
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
    let FiStatus::Formation(mut formed) =
        test_formation(FormationPhase::Formed, FormationFreshness::Fresh)
    else {
        unreachable!("test fixture is a formation");
    };
    formed.invite_code = Some(InviteCode(invite.to_string()));
    assert_eq!(
        formed_federation_id(&FiStatus::Formation(formed)).unwrap(),
        expected.to_string()
    );

    let restored = test_restored_formation(FormationFreshness::Fresh);
    assert_eq!(
        formed_federation_id(&FiStatus::Restored(restored)).unwrap(),
        "22".repeat(32)
    );

    let FiStatus::Formation(mut incomplete) =
        test_formation(FormationPhase::Preparing, FormationFreshness::Fresh)
    else {
        unreachable!("test fixture is a formation");
    };
    incomplete.invite_code = Some(InviteCode(invite.to_string()));
    assert_eq!(
        formed_federation_id(&FiStatus::Formation(incomplete))
            .unwrap_err()
            .code,
        RpcFiErrorCode::InvalidIntent
    );
    assert_eq!(
        formed_federation_id(&FiStatus::Idle).unwrap_err().code,
        RpcFiErrorCode::NoActiveFormation
    );

    let mut unsynced = test_formation(FormationPhase::Formed, FormationFreshness::Unsynced);
    let FiStatus::Formation(ref mut formation) = unsynced else {
        unreachable!("test fixture is a formation");
    };
    formation.invite_code = Some(InviteCode(invite.to_string()));
    assert_eq!(
        formed_federation_id(&unsynced).unwrap_err().code,
        RpcFiErrorCode::InvalidIntent
    );
    assert_eq!(
        formed_federation_id(&FiStatus::Restored(test_restored_formation(
            FormationFreshness::Unsynced
        )))
        .unwrap_err()
        .code,
        RpcFiErrorCode::InvalidIntent
    );
}

#[test]
fn auto_join_uses_only_a_fresh_formed_invite() {
    let expected: fedimint_core::config::FederationId = "22".repeat(32).parse().unwrap();
    let invite = FedimintInviteCode::new(
        "wss://guardian.example.com".parse().unwrap(),
        fedimint_core::PeerId::from(0),
        expected,
        None,
    );
    let mut fresh = test_formation(FormationPhase::Formed, FormationFreshness::Fresh);
    let FiStatus::Formation(formation) = &mut fresh else {
        unreachable!("test fixture is a formation");
    };
    formation.invite_code = Some(InviteCode(invite.to_string()));
    assert_eq!(
        formed_federation_invite(&fresh),
        Some((invite.to_string(), expected.to_string()))
    );

    let mut unsynced = fresh;
    let FiStatus::Formation(formation) = &mut unsynced else {
        unreachable!("test fixture is a formation");
    };
    formation.freshness = FormationFreshness::Unsynced;
    assert!(formed_federation_invite(&unsynced).is_none());

    let restored = test_restored_formation(FormationFreshness::Fresh);
    let restored_invite = restored.federation_invite.0.clone();
    assert_eq!(
        formed_federation_invite(&FiStatus::Restored(restored)),
        Some((restored_invite, "22".repeat(32)))
    );
    assert!(
        formed_federation_invite(&FiStatus::Restored(test_restored_formation(
            FormationFreshness::Unsynced
        )))
        .is_none()
    );
}

#[tokio::test]
async fn auto_join_completion_is_durable_by_federation_id() {
    let database = MemDatabase::new().into_database();
    complete_fi_federation_auto_join(&database, "federation").await;
    assert!(fi_federation_auto_join_completed(&database, "federation").await);
    assert!(!fi_federation_auto_join_completed(&database, "other").await);
}

#[tokio::test]
async fn auto_join_handoff_lock_is_scoped_by_federation_id() {
    let locks = FiFederationHandoffLocks::default();
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

/// Drives [`run_fi_federation_auto_join`] through a scripted sequence of
/// federation states, so the order of the join, the reported states, and the
/// completion marker can be checked without a real `Federations`.
struct ScriptedAutoJoinTarget {
    /// One entry per `state` call. `None` means "not joined". The last entry
    /// is sticky, so a wait loop settles on it.
    states: Mutex<VecDeque<Option<AutoJoinFederationState>>>,
    join_error: Option<String>,
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
            join_error: join_error.map(ToOwned::to_owned),
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
        match &self.join_error {
            Some(error) => Err(anyhow::anyhow!(error.clone())),
            None => Ok(()),
        }
    }
}

/// Runs the auto-join sequence and returns the states it reported.
async fn drive_auto_join(
    target: &ScriptedAutoJoinTarget,
    database: &Database,
) -> Vec<RpcFiFederationJoinState> {
    let locks = FiFederationHandoffLocks::default();
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
    handoff_locks: &FiFederationHandoffLocks,
    federation_id: &str,
    poll_interval: Duration,
) -> Vec<RpcFiFederationJoinState> {
    let reported = Arc::new(Mutex::new(Vec::new()));
    let sink = reported.clone();
    let report = move |state: RpcFiFederationJoinState| {
        sink.lock().expect("report lock is healthy").push(state);
    };
    let on_joined = || {};
    run_fi_federation_auto_join(
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
async fn auto_join_emits_failed_and_leaves_no_marker_when_join_errors() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(Some("guardian unreachable"), vec![None]);

    let states = drive_auto_join(&target, &database).await;

    assert_eq!(
        states,
        vec![
            RpcFiFederationJoinState::Joining,
            RpcFiFederationJoinState::Failed {
                message: "guardian unreachable".to_owned()
            }
        ]
    );
    assert!(!fi_federation_auto_join_completed(&database, "federation").await);
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
            RpcFiFederationJoinState::Joining,
            RpcFiFederationJoinState::Recovering,
            RpcFiFederationJoinState::Ready
        ]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 1);
    assert!(fi_federation_auto_join_completed(&database, "federation").await);
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
            RpcFiFederationJoinState::Joining,
            RpcFiFederationJoinState::Recovering,
            RpcFiFederationJoinState::Failed {
                message: "federation left during recovery".to_owned()
            }
        ]
    );
    assert!(!fi_federation_auto_join_completed(&database, "federation").await);
}

/// Waiting for a recovering federation can take minutes, and never ends for a
/// stuck one. Holding the handoff lock for that wait would block
/// `leave_federation`, which takes the same lock, so the user could not leave
/// the federation the wait is stuck on.
#[tokio::test]
async fn auto_join_releases_the_handoff_lock_while_waiting() {
    let database = MemDatabase::new().into_database();
    let locks = Arc::new(FiFederationHandoffLocks::default());
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
            RpcFiFederationJoinState::Joining,
            RpcFiFederationJoinState::Recovering,
            RpcFiFederationJoinState::Ready
        ]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 1);
    assert!(fi_federation_auto_join_completed(&database, "federation").await);
}

/// A leave during the wait removes the federation. The wait must then stop
/// without writing the completion marker, and must leave the handoff lock free
/// for the leave that follows it.
#[tokio::test]
async fn auto_join_does_not_mark_after_a_leave_during_recovery() {
    let database = MemDatabase::new().into_database();
    let locks = FiFederationHandoffLocks::default();
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
            RpcFiFederationJoinState::Joining,
            RpcFiFederationJoinState::Recovering,
            RpcFiFederationJoinState::Failed {
                message: "federation left during recovery".to_owned()
            }
        ]
    );
    assert!(!fi_federation_auto_join_completed(&database, "federation").await);
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
    let locks = Arc::new(FiFederationHandoffLocks::default());
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
    complete_fi_federation_auto_join(&database, "federation").await;
    target.push_state(None);

    let states = tokio::time::timeout(Duration::from_secs(10), driver)
        .await
        .expect("the auto-join stops once the federation is gone")
        .expect("the auto-join task does not panic");

    assert_eq!(
        states,
        vec![
            RpcFiFederationJoinState::Joining,
            RpcFiFederationJoinState::Recovering
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

    let locks = Arc::new(FiFederationHandoffLocks::default());
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
            RpcFiFederationJoinState::Joining,
            RpcFiFederationJoinState::Recovering,
            RpcFiFederationJoinState::Ready
        ]
    );
    assert!(fi_federation_auto_join_completed(&database, &federation_id.to_string()).await);
}

#[tokio::test]
async fn auto_join_reports_ready_without_rejoining_an_already_ready_federation() {
    let database = MemDatabase::new().into_database();
    let target = ScriptedAutoJoinTarget::new(None, vec![Some(AutoJoinFederationState::Ready)]);

    let states = drive_auto_join(&target, &database).await;

    assert_eq!(states, vec![RpcFiFederationJoinState::Ready]);
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
    assert!(fi_federation_auto_join_completed(&database, "federation").await);

    // A later run still reports Ready, and still does not rejoin — but it is
    // the live state that says so, not the marker.
    let rerun = ScriptedAutoJoinTarget::new(None, vec![Some(AutoJoinFederationState::Ready)]);
    assert_eq!(
        drive_auto_join(&rerun, &database).await,
        vec![RpcFiFederationJoinState::Ready]
    );
    assert_eq!(rerun.joins.load(AtomicOrdering::SeqCst), 0);
}

/// `leave_federation` writes the same completion marker to suppress the
/// auto-join, so a marker plus an absent federation is a deliberate leave.
/// Reporting `Ready` for it would claim a federation the bridge is not in.
#[tokio::test]
async fn auto_join_says_nothing_when_the_marker_outlives_a_left_federation() {
    let database = MemDatabase::new().into_database();
    complete_fi_federation_auto_join(&database, "federation").await;

    let target = ScriptedAutoJoinTarget::new(None, vec![None]);
    let states = drive_auto_join(&target, &database).await;

    assert_eq!(states, vec![]);
    // and it must not undo the leave by rejoining
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
}

#[tokio::test]
async fn auto_join_reports_ready_when_the_marker_matches_a_ready_federation() {
    let database = MemDatabase::new().into_database();
    complete_fi_federation_auto_join(&database, "federation").await;

    let target = ScriptedAutoJoinTarget::new(None, vec![Some(AutoJoinFederationState::Ready)]);
    let states = drive_auto_join(&target, &database).await;

    assert_eq!(states, vec![RpcFiFederationJoinState::Ready]);
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
            RpcFiFederationJoinState::Recovering,
            RpcFiFederationJoinState::Ready
        ]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
    assert!(fi_federation_auto_join_completed(&database, "federation").await);
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
        vec![RpcFiFederationJoinState::Failed {
            message: "federation failed to load".to_owned()
        }]
    );
    assert_eq!(target.joins.load(AtomicOrdering::SeqCst), 0);
    assert!(!fi_federation_auto_join_completed(&database, "federation").await);
}

#[tokio::test]
async fn auto_join_report_re_delivers_the_last_state_to_every_status_read() {
    let report = FiFederationJoinReport::default();
    assert!(report.last().is_none());

    report.record(FiFederationJoinEvent {
        federation_id: RpcFederationId("federation".to_owned()),
        state: RpcFiFederationJoinState::Failed {
            message: "guardian unreachable".to_owned(),
        },
    });

    for _ in 0..2 {
        let retained = report.last().expect("a state was reported");
        assert_eq!(retained.federation_id.0, "federation");
        assert_eq!(
            retained.state,
            RpcFiFederationJoinState::Failed {
                message: "guardian unreachable".to_owned()
            }
        );
    }
}

#[tokio::test]
async fn auto_join_report_stops_re_delivering_after_the_federation_is_left() {
    let report = FiFederationJoinReport::default();
    report.record(FiFederationJoinEvent {
        federation_id: RpcFederationId("federation".to_owned()),
        state: RpcFiFederationJoinState::Ready,
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
        RpcFiErrorCode::InvalidIntent
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
    assert_eq!(recovery.next_delay(), FI_RESUME_INITIAL_BACKOFF);
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
            &[ItemAllocationStatus::ActionRequired],
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
    assert_eq!(recovery.next_delay(), FI_RESUME_INITIAL_BACKOFF);
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
    assert_eq!(recovery.next_delay(), FI_RESUME_INITIAL_BACKOFF * 2);
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
                    .ok_or_else(|| FiError::Liquidity("unexpected current read".to_owned()))
            },
            move |operation_id| async move {
                resumed.lock().unwrap().push(operation_id.0.clone());
                if operation_id.0 == first_id
                    && first_attempts.fetch_add(1, AtomicOrdering::SeqCst) == 0
                {
                    Err(FiError::Liquidity("provider timeout".to_owned()))
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

#[test]
fn liquidity_gateway_intent_preserves_bounds() {
    let intent = liquidity_intent_from_rpc(RpcFiLiquidityRequestIntent {
        amounts: RpcFiLiquidityAmountBounds {
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
    let error = liquidity_intent_from_rpc(RpcFiLiquidityRequestIntent {
        amounts: RpcFiLiquidityAmountBounds {
            gateway_min_sats: 10,
            gateway_max_sats: None,
            stability_min_sats: 0,
            stability_max_sats: None,
        },
        approved_provider_pubkeys: vec![Keys::generate().public_key().to_string()],
    })
    .expect_err("caller-supplied allowlists fail closed: registry trust replaced them");

    assert_eq!(error.code, RpcFiErrorCode::InvalidIntent);
    assert!(
        error
            .message
            .contains("provider allowlists are no longer supported")
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

    let rpc = liquidity_operation_to_rpc(snapshot);
    assert_eq!(rpc.details_payload_hash, "2a".repeat(32));
    assert!(rpc.gateway_view_verified);
    assert_eq!(rpc.item_statuses.len(), 2);
    assert_eq!(
        rpc.item_statuses[0].completion_evidence,
        Some(RpcFiLiquidityCompletionEvidence::Gateway {
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
}

#[test]
fn liquidity_page_projection_preserves_exclusive_cursor() {
    let result = liquidity_operation_page_to_rpc(LiquidityOperationPage {
        operations: Vec::new(),
        next_after: Some(LiquidityOperationId("next-operation".to_owned())),
    });
    assert_eq!(
        result,
        RpcFiLiquidityOperationPageResult::Page {
            page: RpcLiquidityOperationPage {
                operations: Vec::new(),
                next_after: Some("next-operation".to_owned()),
            },
        }
    );
}

#[test]
fn selection_preview_uses_manifolds_two_minute_capability_window() {
    assert_eq!(
        fi_client::FMAN_SELECTION_PREVIEW_VALIDITY,
        Duration::from_secs(2 * 60)
    );
}

#[test]
fn missing_process_local_preview_has_typed_expiry_detail() {
    let RpcFiOperationResult::Error { error } = preview_expired_result() else {
        panic!("an unavailable preview must require fresh authorization");
    };
    assert_eq!(error.code, RpcFiErrorCode::SelectionReauthorizationRequired);
    assert!(matches!(
        error.detail,
        Some(
            RpcFiOperationErrorDetail::SelectionReauthorizationRequired {
                reason: RpcFiSelectionReauthorizationReason::PreviewExpired,
            }
        )
    ));
}

#[test]
fn replacement_state_projects_stable_rows_and_narrow_payment_action() {
    let locator = test_locator();
    let replacement_seat = fi_client::GuardianReplacementSeat {
        index: 2,
        previous_fman_id: None,
        previous_quote_id: fi_client::QuoteId([9; 32]),
        previous_locator: locator.clone(),
    };
    let requirements: GuardianReplacementRequirements = serde_json::from_value(serde_json::json!({
        "replacement_id": hex::encode([0x2a; 32]),
        "seats": [replacement_seat],
    }))
    .expect("valid replacement requirements");
    let mut snapshot = FormationSnapshot {
        formation_id: fi_client::FormationId("formation".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: FederationName("Federation".to_owned()),
            federation_size: FederationSize(7),
            plan: PlanPreference::InfiniteBestEffort,
            fedimintd_versions: fedimintd_version_range("0.11.1"),
            fedimintd_dkg_version: fedimintd_dkg_version("0.11.1"),
            max_total_msats: Some(100_000),
        },
        phase: FormationPhase::Preparing,
        seats: vec![fi_client::SeatProgress {
            index: 2,
            fman_id: None,
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
    assert_eq!(rpc.seats[0].phase, RpcFiSeatPhase::ReplacementRequired);
    match rpc.action_required.expect("replacement action") {
        RpcFiFormationActionRequired::ReplaceGuardians { requirements } => {
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
        fi_client::PaymentRequirements {
            authorization_id: payment_authorization_id(2),
            total_msats: 12_000,
            max_total_msats: Some(10_000),
            seats: vec![fi_client::SeatPaymentRequirement {
                index: 2,
                fman_id: None,
                quote_id: fi_client::QuoteId([8; 32]),
                payment_federation_id: FederationId("payer".to_owned()),
                amount_msats: 12_000,
            }],
        },
    ));
    let rpc = formation_snapshot_to_rpc(snapshot);
    assert!(matches!(
        rpc.action_required,
        Some(RpcFiFormationActionRequired::AuthorizeReplacementPayments { requirements })
            if requirements.authorization_id == hex::encode([2; 32])
                && requirements.total_msats == RpcFiMsats(12_000)
                && requirements.max_total_msats == Some(RpcFiMsats(10_000))
    ));
}

#[test]
fn supervisor_retries_only_unattended_nonterminal_formation() {
    let snapshot = FormationSnapshot {
        formation_id: fi_client::FormationId("formation".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: fi_client::FederationName("Federation".to_owned()),
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

    assert!(!should_auto_resume(&FiStatus::Idle));
    assert!(should_auto_resume(&FiStatus::Restored(
        test_restored_formation(FormationFreshness::Unsynced)
    )));
    assert!(!should_auto_resume(&FiStatus::Restored(
        test_restored_formation(FormationFreshness::Fresh)
    )));
    assert!(should_auto_resume(&FiStatus::Formation(snapshot.clone())));

    let mut formed = snapshot.clone();
    formed.phase = FormationPhase::Formed;
    formed.freshness = FormationFreshness::Fresh;
    assert!(!should_auto_resume(&FiStatus::Formation(formed)));

    let mut formed_unsynced = snapshot.clone();
    formed_unsynced.phase = FormationPhase::Formed;
    formed_unsynced.freshness = FormationFreshness::Unsynced;
    assert!(should_auto_resume(&FiStatus::Formation(
        formed_unsynced.clone()
    )));
    assert!(!formation_milestones(&formed_unsynced).wallet_service_created);

    let mut formed_fresh = snapshot.clone();
    formed_fresh.phase = FormationPhase::Formed;
    formed_fresh.freshness = FormationFreshness::Fresh;
    assert!(formation_milestones(&formed_fresh).wallet_service_created);

    let mut awaiting_user = snapshot.clone();
    awaiting_user.action_required = Some(FormationActionRequired::AuthorizePayments(
        fi_client::PaymentRequirements {
            authorization_id: payment_authorization_id(1),
            total_msats: 10_000,
            max_total_msats: Some(100_000),
            seats: Vec::new(),
        },
    ));
    assert!(!should_auto_resume(&FiStatus::Formation(awaiting_user)));

    let mut needs_reauthorization = snapshot.clone();
    needs_reauthorization.last_error = Some(FiErrorCode::SelectionReauthorizationRequired);
    assert!(!should_auto_resume(&FiStatus::Formation(
        needs_reauthorization
    )));

    let mut retryable_failure = snapshot;
    retryable_failure.last_error = Some(FiErrorCode::Timeout);
    assert!(should_auto_resume(&FiStatus::Formation(retryable_failure)));
}

#[test]
fn supervisor_backoff_resets_on_progress_and_caps_at_five_minutes() {
    assert_eq!(
        next_retry_delay(Duration::ZERO, false),
        FI_RESUME_INITIAL_BACKOFF
    );
    assert_eq!(
        next_retry_delay(FI_RESUME_INITIAL_BACKOFF, false),
        FI_RESUME_INITIAL_BACKOFF * 2
    );
    assert_eq!(
        next_retry_delay(FI_RESUME_MAX_BACKOFF, false),
        FI_RESUME_MAX_BACKOFF
    );
    assert_eq!(
        next_retry_delay(FI_RESUME_MAX_BACKOFF, true),
        FI_RESUME_INITIAL_BACKOFF
    );
}

#[test]
fn fi_errors_map_to_stable_rpc_codes_and_messages() {
    let error = fi_error_to_rpc(&FiError::Timeout("waiting for DKG".to_owned()));
    assert_eq!(error.code, RpcFiErrorCode::Timeout);
    assert_eq!(error.message, "The FI operation timed out");
}

#[test]
fn fi_rpc_errors_do_not_expose_internal_or_remote_details() {
    const PRIVATE_DETAIL: &str = "private-remote-error-detail";
    let errors = [
        FiError::Storage(PRIVATE_DETAIL.to_owned()),
        FiError::Identity(PRIVATE_DETAIL.to_owned()),
        FiError::InvalidFleetManagers(PRIVATE_DETAIL.to_owned()),
        FiError::FleetManager {
            index: 3,
            message: PRIVATE_DETAIL.to_owned(),
        },
        FiError::Payment(PRIVATE_DETAIL.to_owned()),
        FiError::Liquidity(PRIVATE_DETAIL.to_owned()),
        FiError::SeatRefused {
            index: 4,
            reason: PRIVATE_DETAIL.to_owned(),
        },
        FiError::Timeout(PRIVATE_DETAIL.to_owned()),
    ];

    for error in errors {
        let rpc_error = fi_error_to_rpc(&error);
        assert!(
            !rpc_error.message.contains(PRIVATE_DETAIL),
            "{error:?} leaked its internal detail"
        );
        assert_eq!(rpc_error.message, fi_error_message(rpc_error.code));
    }
}

#[tokio::test]
async fn fi_status_stream_emits_current_formation_and_typed_init_failure() {
    let locator: Locator = serde_json::from_str(
        r#"{"version":1,"endpoint_addr":{"id":"8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c","addrs":[]},"service_pubkey":"4d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766"}"#,
    )
    .unwrap();
    let snapshot = FormationSnapshot {
        formation_id: fi_client::FormationId("formation-current".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: fi_client::FederationName("Current Federation".to_owned()),
            federation_size: FederationSize(7),
            plan: PlanPreference::InfiniteBestEffort,
            fedimintd_versions: fedimintd_version_range("0.11.1"),
            fedimintd_dkg_version: fedimintd_dkg_version("0.11.1"),
            max_total_msats: Some((1_u64 << 53) + 1),
        },
        phase: FormationPhase::DkgUnderway,
        seats: vec![fi_client::SeatProgress {
            index: 0,
            fman_id: None,
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
        last_error: Some(FiErrorCode::Timeout),
    };
    let (_sender, receiver) = watch::channel(FiStatus::Formation(snapshot));
    let mut stream = fi_client_status_stream(Ok(receiver));

    let current = stream.next().await.expect("watch current state");
    let RpcFiClientStatus::Ready {
        status: RpcFiStatus::Formation { formation },
    } = current
    else {
        panic!("current status must be the valid formation snapshot");
    };
    assert_eq!(formation.formation_id, "formation-current");
    assert_eq!(formation.phase, RpcFiFormationPhase::DkgUnderway);
    assert_eq!(
        formation.intent.max_total_msats,
        Some(RpcFiMsats((1_u64 << 53) + 1))
    );
    assert_eq!(formation.seats.len(), 1);
    assert_eq!(formation.seats[0].phase, RpcFiSeatPhase::DkgUnderway);

    let expected_error = RpcFiOperationError {
        code: RpcFiErrorCode::Storage,
        message: "FI storage is unavailable".to_owned(),
        detail: None,
    };
    let mut failed = fi_client_status_stream(Err(expected_error.clone()));
    assert_eq!(
        failed.next().await,
        Some(RpcFiClientStatus::Failed {
            error: expected_error
        })
    );
    assert!(failed.next().await.is_none());
}

#[test]
fn restored_status_projects_recovery_facts() {
    let RpcFiStatus::Restored { formation } = fi_status_to_rpc(FiStatus::Restored(
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
    assert_eq!(formation.phase, RpcFiFormationPhase::Formed);
    assert_eq!(formation.freshness, RpcFiFormationFreshness::Unsynced);
    assert!(formation.seats.is_empty());
}

struct TestDriverBackend {
    status: Mutex<FiStatus>,
    next_status: Mutex<Option<FiStatus>>,
    block: TestAtomicBool,
    started: Notify,
    release: Notify,
    completed: Notify,
    calls: AtomicUsize,
    cancelled_in_flight: TestAtomicBool,
}

impl TestDriverBackend {
    fn new(status: FiStatus, next_status: Option<FiStatus>, block: bool) -> Self {
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
    Arc::new(FormationLocalState::new(Err(Arc::new(
        FiPushError::Transport,
    ))))
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
impl FiDriverBackend for TestDriverBackend {
    fn status(&self) -> FiStatus {
        self.status.lock().expect("status lock is healthy").clone()
    }

    async fn execute(
        &self,
        _operation: FiDriverOperation,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiDriverResponse {
        self.calls.fetch_add(1, AtomicOrdering::SeqCst);
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
        FiDriverResponse::Formation(RpcFiOperationResult::Success)
    }

    async fn current_liquidity_operation(&self) -> FiResult<Option<LiquidityOperationSnapshot>> {
        Ok(None)
    }

    async fn resume_liquidity_on_launch(
        &self,
        _operation_id: LiquidityOperationId,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiResult<LiquidityOperationSnapshot> {
        Err(FiError::Liquidity(
            "unexpected test liquidity resume".to_owned(),
        ))
    }

    async fn sleep(&self, delay: Duration) {
        fedimint_core::task::sleep(delay).await;
    }
}

fn test_formation(phase: FormationPhase, freshness: FormationFreshness) -> FiStatus {
    FiStatus::Formation(FormationSnapshot {
        formation_id: fi_client::FormationId("formation".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: fi_client::FederationName("Federation".to_owned()),
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
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FiCommandSender {
        sender,
        operation_active,
    };
    let operations = Arc::new(Mutex::new(Vec::new()));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FI abandon driver test", {
        let operations = operations.clone();
        async move {
            run_driver_loop(receiver, move |operation| {
                let operations = operations.clone();
                async move {
                    let name = match operation {
                        FiDriverOperation::Abandon => "abandon",
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
        driver.request(FiDriverOperation::Abandon).await,
        RpcFiOperationResult::Success
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
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FiCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let backend = Arc::new(TestDriverBackend::new(FiStatus::Idle, None, true));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FI production supervisor test", {
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

    let abandoned_caller = fedimint_core::task::spawn("abandoned FI caller", {
        let driver = driver.clone();
        async move { driver.request(FiDriverOperation::Resume).await }
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
            driver.request(FiDriverOperation::Resume)
        )
        .await
        .expect("Busy is returned without waiting"),
        operation_error_result(
            RpcFiErrorCode::Busy,
            "An FI operation is already in progress"
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
            driver.request(FiDriverOperation::Resume)
        )
        .await
        .expect("the next command completes"),
        RpcFiOperationResult::Success
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
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FiCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let backend = Arc::new(TestDriverBackend::new(FiStatus::Idle, None, true));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FI production shutdown test", {
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
    let caller = fedimint_core::task::spawn("FI shutdown caller", {
        let driver = driver.clone();
        async move { driver.request(FiDriverOperation::Resume).await }
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
        RpcFiOperationResult::Error {
            error: driver_unavailable_error(),
        }
    );
}

async fn assert_startup_reconciles(initial: FiStatus) {
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let final_status = test_formation(FormationPhase::Formed, FormationFreshness::Fresh);
    let backend = Arc::new(TestDriverBackend::new(
        initial,
        Some(final_status.clone()),
        false,
    ));
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FI production restart test", {
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

struct LiquidityResponseBackend {
    operations: Mutex<Vec<&'static str>>,
    current_reads: AtomicUsize,
    response: RpcFiLiquidityOperationResult,
}

#[apply(async_trait_maybe_send!)]
impl FiDriverBackend for LiquidityResponseBackend {
    fn status(&self) -> FiStatus {
        FiStatus::Idle
    }

    async fn execute(
        &self,
        operation: FiDriverOperation,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiDriverResponse {
        let operation_name = match operation {
            FiDriverOperation::StartLiquidity { .. } => "start",
            FiDriverOperation::ResumeLiquidity { .. } => "resume",
            _ => panic!("unexpected non-liquidity command"),
        };
        self.operations
            .lock()
            .expect("operation lock is healthy")
            .push(operation_name);
        FiDriverResponse::Liquidity(self.response.clone())
    }

    async fn current_liquidity_operation(&self) -> FiResult<Option<LiquidityOperationSnapshot>> {
        self.current_reads.fetch_add(1, AtomicOrdering::SeqCst);
        Ok(None)
    }

    async fn resume_liquidity_on_launch(
        &self,
        _operation_id: LiquidityOperationId,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiResult<LiquidityOperationSnapshot> {
        Err(FiError::Liquidity(
            "unexpected test liquidity resume".to_owned(),
        ))
    }

    async fn sleep(&self, delay: Duration) {
        fedimint_core::task::sleep(delay).await;
    }
}

#[tokio::test]
async fn command_channel_preserves_typed_start_and_resume_liquidity_responses() {
    let expected = RpcFiLiquidityOperationResult::Operation {
        operation: RpcFiLiquidityOperation {
            operation_id: "operation".to_owned(),
            formation_id: "formation".to_owned(),
            provider_pubkey: "provider".to_owned(),
            endpoint_hint: Some("iroh://provider".to_owned()),
            details_payload_hash: "2a".repeat(32),
            amounts: RpcFiLiquidityAmountBounds {
                gateway_min_sats: 10,
                gateway_max_sats: Some(20),
                stability_min_sats: 0,
                stability_max_sats: None,
            },
            phase: RpcFiLiquidityOperationPhase::Prepared,
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
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let driver = FiCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FI typed liquidity response test", {
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
            .request_liquidity(FiDriverOperation::StartLiquidity {
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
            .request_liquidity(FiDriverOperation::ResumeLiquidity {
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
