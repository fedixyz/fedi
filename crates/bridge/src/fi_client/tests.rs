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
use manifold_secp256k1::Secp256k1 as ManifoldSecp256k1;
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
    Locator::parse(
        &serde_json::json!({
            "version": 1,
            "endpoint_addr": endpoint_addr,
            "service_pubkey": service_pubkey,
        })
        .to_string(),
    )
    .expect("valid test locator")
}

fn payment_authorization_id(byte: u8) -> PaymentAuthorizationId {
    PaymentAuthorizationId::try_from_opaque(hex::encode([byte; 32]))
        .expect("valid payment authorization digest")
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
                fedimintd_version: "0.11.1-fedi10".parse().expect("fixed version is valid"),
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
    let fi_id = identity.public_key().expect("valid derived key");
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
async fn fi_identity_has_a_golden_vector_and_reopens_only_for_the_same_root() {
    let first_root = DerivableSecret::new_root(&[1; 32], b"fi-client-test");
    let second_root = DerivableSecret::new_root(&[2; 32], b"fi-client-test");

    let first_identity = BridgeFiIdentity::from_root_secret(&first_root);
    let first = first_identity.public_key().expect("valid derived key");
    let repeated = BridgeFiIdentity::from_root_secret(&first_root)
        .public_key()
        .expect("valid derived key");
    let second = BridgeFiIdentity::from_root_secret(&second_root)
        .public_key()
        .expect("valid derived key");

    assert_eq!(first, repeated);
    assert_ne!(first, second);
    assert_eq!(
        first.0.to_string(),
        "615a1aca40d5090f62d0f734dbb8ea8b0e7d250c9ad0ca028fc659a7db7f818b"
    );
    assert_eq!(FI_CLIENT_CHILD_ID.0, 17);

    let digest = [0x42; 32];
    let signature = first_identity
        .sign_digest(digest)
        .expect("the derived identity signs");
    ManifoldSecp256k1::verification_only()
        .verify_schnorr(&signature.0, &digest, &first.0)
        .expect("the signature verifies through Manifold's protocol types");

    let database = MemDatabase::new().into_database();
    seed_identity_bound_formation(&database, first).await;
    let reopened = open_test_fi_client(
        database.clone(),
        BridgeFiIdentity::from_root_secret(&first_root),
    )
    .await
    .expect("the same app root reopens its persisted FI formation");
    assert!(matches!(
        reopened.status(),
        FiStatus::Formation(FormationSnapshot {
            freshness: FormationFreshness::Unsynced,
            ..
        })
    ));

    let wrong_root =
        open_test_fi_client(database, BridgeFiIdentity::from_root_secret(&second_root)).await;
    assert!(matches!(
        wrong_root,
        Err(FiError::Storage(message)) if message.contains("different identity")
    ));
}

#[test]
fn paid_formation_uses_zero_fee_before_post_formation_maintenance() {
    let intent = formation_intent_from_rpc(RpcFiFormationIntent {
        federation_name: Some("Paid federation".to_owned()),
        federation_size: 7,
        plan: RpcFiPlanPreference::InfiniteBestEffort,
        fedimintd_version: "0.11.1".to_owned(),
    })
    .expect("paid setup is supported before separate fee maintenance");

    assert_eq!(intent.plan(), PlanPreference::InfiniteBestEffort);
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
        RpcFiFederationMetadataUpdate::TermsOfService,
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
        endpoint_hint: Url("iroh://provider-endpoint".to_owned()),
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
        endpoint_hint: Url("iroh://provider-endpoint".to_owned()),
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
            fedimintd_version: "0.11.1".parse().expect("valid version"),
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
            fedimintd_version: "0.11.1".parse().expect("valid version"),
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
    let locator = Locator::parse(
        r#"{"version":1,"endpoint_addr":{"id":"8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c","addrs":[]},"service_pubkey":"4d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766"}"#,
    )
    .unwrap();
    let snapshot = FormationSnapshot {
        formation_id: fi_client::FormationId("formation-current".to_owned()),
        intent: ResolvedFormationIntent {
            federation_name: fi_client::FederationName("Current Federation".to_owned()),
            federation_size: FederationSize(7),
            plan: PlanPreference::InfiniteBestEffort,
            fedimintd_version: "0.11.1".parse().unwrap(),
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
            fedimintd_version: "0.11.1-fedi10".parse().expect("valid version"),
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
            endpoint_hint: "iroh://provider".to_owned(),
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
