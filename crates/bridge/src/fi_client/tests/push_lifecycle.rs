use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use fedi_decentralized_push_gateway_types::HookId;
use fedi_decentralized_service_fleet_manager::DkgCompletionCallbackInput;
use fedimint_core::task::TaskGroup;
use fedimint_core::{apply, async_trait_maybe_send};
use tokio::sync::{Notify, mpsc};

use super::super::*;
use super::test_formation;

struct FakeFormationPushGateway {
    create_calls: AtomicUsize,
    revoke_calls: AtomicUsize,
    fail_create: bool,
    fail_revoke: bool,
    block_revoke: bool,
    revoke_started: Notify,
    continue_revoke: Notify,
    hook: FiDkgPushHook,
}

#[apply(async_trait_maybe_send!)]
impl FormationPushGateway for FakeFormationPushGateway {
    async fn create_formation_hook(&self) -> Result<FiDkgPushHook, FiPushError> {
        self.create_calls.fetch_add(1, Ordering::AcqRel);
        if self.fail_create {
            Err(FiPushError::InvalidResponse)
        } else {
            Ok(self.hook.clone())
        }
    }

    async fn revoke_hook(&self, _hook: &FiDkgPushHook) -> Result<(), FiPushError> {
        self.revoke_calls.fetch_add(1, Ordering::AcqRel);
        if self.block_revoke {
            self.revoke_started.notify_one();
            self.continue_revoke.notified().await;
        }
        if self.fail_revoke {
            Err(FiPushError::Transport)
        } else {
            Ok(())
        }
    }
}

fn fake_push_hook() -> FiDkgPushHook {
    FiDkgPushHook::new(
        DkgCompletionCallback::new(DkgCompletionCallbackInput {
            callback_url: "https://push.example/hooks/hook-id/redacted-secret".to_owned(),
            idempotency_key: "fi-dkg-complete:hook-id".to_owned(),
        })
        .unwrap(),
        HookId("hook-id".to_owned()),
    )
}

fn fake_push_gateway(
    fail_create: bool,
    fail_revoke: bool,
    block_revoke: bool,
) -> (Arc<FakeFormationPushGateway>, FormationPushGatewayHandle) {
    let gateway = Arc::new(FakeFormationPushGateway {
        create_calls: AtomicUsize::new(0),
        revoke_calls: AtomicUsize::new(0),
        fail_create,
        fail_revoke,
        block_revoke,
        revoke_started: Notify::new(),
        continue_revoke: Notify::new(),
        hook: fake_push_hook(),
    });
    let handle: Arc<dyn FormationPushGateway> = gateway.clone();
    (gateway, Ok(handle))
}

fn claimed(active: &Arc<AtomicBool>) -> FiDriverOperationClaim {
    assert!(!active.swap(true, Ordering::AcqRel));
    FiDriverOperationClaim {
        operation_active: active.clone(),
    }
}

fn successful_dispatch(
    active: &Arc<AtomicBool>,
) -> Result<(FiDriverResponse, FiDriverOperationClaim), RpcFiOperationError> {
    Ok((
        FiDriverResponse::Formation(RpcFiOperationResult::Success),
        claimed(active),
    ))
}

struct BlockingAbandonBackend {
    status: StdMutex<FiStatus>,
    result: RpcFiOperationResult,
    started: Notify,
    release: Notify,
}

fn abandonment_test_status() -> FiStatus {
    let mut status = test_formation(FormationPhase::Preparing, FormationFreshness::Fresh);
    let FiStatus::Formation(formation) = &mut status else {
        unreachable!("test fixture is a formation");
    };
    // Keep launch recovery idle so these tests exercise the explicit abandon
    // command, while retaining the authoritative Formation -> Idle transition.
    formation.last_error = Some(FiErrorCode::SelectionReauthorizationRequired);
    status
}

#[apply(async_trait_maybe_send!)]
impl FiDriverBackend for BlockingAbandonBackend {
    fn status(&self) -> FiStatus {
        self.status.lock().expect("status lock is healthy").clone()
    }

    async fn execute(
        &self,
        operation: FiDriverOperation,
        _liquidity_connector: &BridgeLiquidityConnector,
    ) -> FiDriverResponse {
        assert!(matches!(operation, FiDriverOperation::Abandon));
        self.started.notify_one();
        self.release.notified().await;
        *self.status.lock().expect("status lock is healthy") = FiStatus::Idle;
        FiDriverResponse::Formation(self.result.clone())
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
            "unexpected abandonment-test liquidity resume".to_owned(),
        ))
    }

    async fn sleep(&self, delay: Duration) {
        fedimint_core::task::sleep(delay).await;
    }
}

#[tokio::test]
async fn production_coordinator_dispatches_without_callback_when_hook_creation_fails() {
    let (gateway, handle) = fake_push_gateway(true, false, false);
    let coordinator = FormationPushCoordinator::new(handle);
    coordinator
        .install_preview("preview".to_owned(), false)
        .await;
    let callbacks = Arc::new(StdMutex::new(Vec::new()));
    let active = Arc::new(AtomicBool::new(false));

    let result = coordinator
        .dispatch_paid_formation(
            "preview",
            {
                let callbacks = callbacks.clone();
                let active = active.clone();
                move |callback| async move {
                    callbacks.lock().unwrap().push(callback);
                    successful_dispatch(&active)
                }
            },
            || false,
        )
        .await;

    // the hook is best-effort: its failure must not block the payment
    assert!(matches!(result, RpcFiOperationResult::Success));
    assert_eq!(gateway.create_calls.load(Ordering::Acquire), 1);
    let callbacks = callbacks.lock().unwrap();
    assert_eq!(callbacks.len(), 1);
    assert!(callbacks[0].is_none());
    assert!(!active.load(Ordering::Acquire));
}

#[tokio::test]
async fn production_coordinator_dispatches_without_callback_when_gateway_is_undeployed() {
    let handle: FormationPushGatewayHandle = Err(Arc::new(FiPushError::Unavailable));
    let coordinator = FormationPushCoordinator::new(handle);
    coordinator
        .install_preview("preview".to_owned(), false)
        .await;
    let callbacks = Arc::new(StdMutex::new(Vec::new()));
    let active = Arc::new(AtomicBool::new(false));

    let result = coordinator
        .dispatch_paid_formation(
            "preview",
            {
                let callbacks = callbacks.clone();
                let active = active.clone();
                move |callback| async move {
                    callbacks.lock().unwrap().push(callback);
                    successful_dispatch(&active)
                }
            },
            || false,
        )
        .await;

    assert!(matches!(result, RpcFiOperationResult::Success));
    let callbacks = callbacks.lock().unwrap();
    assert_eq!(callbacks.len(), 1);
    assert!(callbacks[0].is_none());
    assert!(!active.load(Ordering::Acquire));
}

#[tokio::test]
async fn production_coordinator_reuses_exact_callback_for_safe_payer_retry() {
    let (gateway, handle) = fake_push_gateway(false, false, false);
    let coordinator = FormationPushCoordinator::new(handle);
    coordinator
        .install_preview("preview".to_owned(), false)
        .await;
    let callbacks = Arc::new(std::sync::Mutex::new(Vec::new()));

    let first_active = Arc::new(AtomicBool::new(false));
    let first = coordinator
        .dispatch_paid_formation(
            "preview",
            {
                let callbacks = callbacks.clone();
                let first_active = first_active.clone();
                move |callback| async move {
                    callbacks.lock().unwrap().push(callback);
                    Ok((
                        FiDriverResponse::Formation(RpcFiOperationResult::Error {
                            error: fi_error_to_rpc(&FiError::SelectionReauthorizationRequired(
                                SelectionReauthorizationReason::SelectedPayerInsufficientFunds,
                            )),
                        }),
                        claimed(&first_active),
                    ))
                }
            },
            || false,
        )
        .await;
    assert!(may_retry_payer(&first));
    assert!(!first_active.load(Ordering::Acquire));

    let second_active = Arc::new(AtomicBool::new(false));
    let second = coordinator
        .dispatch_paid_formation(
            "preview",
            {
                let callbacks = callbacks.clone();
                let second_active = second_active.clone();
                move |callback| async move {
                    callbacks.lock().unwrap().push(callback);
                    successful_dispatch(&second_active)
                }
            },
            || false,
        )
        .await;

    assert!(matches!(second, RpcFiOperationResult::Success));
    assert!(!second_active.load(Ordering::Acquire));
    let callbacks = callbacks.lock().unwrap();
    assert_eq!(callbacks.len(), 2);
    assert_eq!(callbacks[0], callbacks[1]);
    assert_eq!(gateway.create_calls.load(Ordering::Acquire), 1);
    assert_eq!(gateway.revoke_calls.load(Ordering::Acquire), 1);
}

#[tokio::test]
async fn production_driver_returns_the_same_global_claim_for_callback_handoff() {
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let commands = FiCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let driver = fedimint_core::task::spawn("retained FI operation claim test", async move {
        run_driver_loop(receiver, |_| async { Ok(()) }).await;
    });

    let initial_claim = commands.try_claim_operation().unwrap();
    let (response, retained_claim) = commands
        .request_claimed_retaining(FiDriverOperation::Resume, initial_claim)
        .await
        .unwrap();

    assert!(matches!(
        response,
        FiDriverResponse::Formation(RpcFiOperationResult::Success)
    ));
    assert!(operation_active.load(Ordering::Acquire));
    assert!(commands.try_claim_operation().is_none());
    drop(retained_claim);
    assert!(!operation_active.load(Ordering::Acquire));
    drop(commands);
    driver.await.unwrap();
}

#[tokio::test]
async fn production_coordinator_holds_global_claim_through_terminal_hook_cleanup() {
    let (gateway, handle) = fake_push_gateway(false, false, true);
    let coordinator = Arc::new(FormationPushCoordinator::new(handle));
    coordinator
        .install_preview("preview".to_owned(), false)
        .await;
    let operation_active = Arc::new(AtomicBool::new(false));
    let commands = FiCommandSender {
        sender: mpsc::channel(1).0,
        operation_active: operation_active.clone(),
    };

    let dispatch = fedimint_core::task::spawn("formation callback handoff test", {
        let coordinator = coordinator.clone();
        let operation_active = operation_active.clone();
        async move {
            coordinator
                .dispatch_paid_formation(
                    "preview",
                    move |_| async move { successful_dispatch(&operation_active) },
                    || false,
                )
                .await
        }
    });
    gateway.revoke_started.notified().await;

    assert!(operation_active.load(Ordering::Acquire));
    assert!(commands.try_claim_operation().is_none());
    gateway.continue_revoke.notify_one();
    assert!(matches!(
        dispatch.await.unwrap(),
        RpcFiOperationResult::Success
    ));
    assert!(!operation_active.load(Ordering::Acquire));
    assert!(commands.try_claim_operation().is_some());
}

#[tokio::test]
async fn preview_replacement_uses_authoritative_formation_ownership_before_revocation() {
    let (gateway, handle) = fake_push_gateway(false, true, false);
    let coordinator = FormationPushCoordinator::new(handle);
    coordinator.state.lock().await.replace(StoredFormationPush {
        preview_id: "abandoned-caller".to_owned(),
        hook: Some(fake_push_hook()),
    });

    coordinator
        .install_preview("recovered".to_owned(), true)
        .await;
    assert_eq!(gateway.revoke_calls.load(Ordering::Acquire), 0);

    coordinator.state.lock().await.replace(StoredFormationPush {
        preview_id: "pre-init-terminal".to_owned(),
        hook: Some(fake_push_hook()),
    });
    coordinator.install_preview("new".to_owned(), false).await;
    assert_eq!(gateway.revoke_calls.load(Ordering::Acquire), 1);
}

#[tokio::test]
async fn dropped_abandon_caller_still_invalidates_orphaned_paid_preview() {
    let (gateway, handle) = fake_push_gateway(false, false, true);
    let formation_state = Arc::new(FormationLocalState::new(handle));
    formation_state
        .selection
        .lock()
        .await
        .replace(StoredSelection {
            preview_id: "orphaned-paid-preview".to_owned(),
            preview: None,
            approval: None,
        });
    formation_state
        .replacement
        .lock()
        .await
        .replace(StoredReplacement {
            preview_id: "orphaned-replacement-preview".to_owned(),
            preview: None,
            approval: None,
        });
    formation_state
        .formation_push
        .state
        .lock()
        .await
        .replace(StoredFormationPush {
            preview_id: "orphaned-paid-preview".to_owned(),
            hook: Some(fake_push_hook()),
        });

    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let commands = FiCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let backend = Arc::new(BlockingAbandonBackend {
        status: StdMutex::new(abandonment_test_status()),
        result: RpcFiOperationResult::Success,
        started: Notify::new(),
        release: Notify::new(),
    });
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FI dropped abandon cleanup test", {
        let backend = backend.clone();
        let formation_state = formation_state.clone();
        let operation_active = operation_active.clone();
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

    let caller = fedimint_core::task::spawn("dropped FI abandon caller", {
        let commands = commands.clone();
        async move { commands.request(FiDriverOperation::Abandon).await }
    });
    tokio::time::timeout(Duration::from_secs(2), backend.started.notified())
        .await
        .expect("the explicit abandon command starts");
    caller.abort();
    caller.await.expect_err("the abandon caller is cancelled");
    backend.release.notify_one();
    tokio::time::timeout(Duration::from_secs(2), gateway.revoke_started.notified())
        .await
        .expect("abandonment starts push-hook cleanup");

    assert!(formation_state.selection.lock().await.is_none());
    assert!(formation_state.replacement.lock().await.is_none());
    assert!(formation_state.formation_push.state.lock().await.is_none());
    assert!(operation_active.load(Ordering::Acquire));
    assert!(commands.try_claim_operation().is_none());

    gateway.continue_revoke.notify_one();
    tokio::time::timeout(Duration::from_secs(2), async {
        while operation_active.load(Ordering::Acquire) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("successful abandonment releases its claim after local cleanup");
    assert_eq!(gateway.revoke_calls.load(Ordering::Acquire), 1);

    drop(commands);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the abandonment cleanup driver shuts down");
}

#[tokio::test]
async fn durable_idle_abandonment_invalidates_state_despite_release_error() {
    let (gateway, handle) = fake_push_gateway(false, false, false);
    let formation_state = Arc::new(FormationLocalState::new(handle));
    formation_state
        .selection
        .lock()
        .await
        .replace(StoredSelection {
            preview_id: "stale-selection".to_owned(),
            preview: None,
            approval: None,
        });
    formation_state
        .replacement
        .lock()
        .await
        .replace(StoredReplacement {
            preview_id: "stale-replacement".to_owned(),
            preview: None,
            approval: None,
        });
    formation_state
        .formation_push
        .state
        .lock()
        .await
        .replace(StoredFormationPush {
            preview_id: "stale-selection".to_owned(),
            hook: Some(fake_push_hook()),
        });

    let release_error =
        operation_error_result(RpcFiErrorCode::Storage, "FI storage is unavailable");
    let backend = Arc::new(BlockingAbandonBackend {
        status: StdMutex::new(abandonment_test_status()),
        result: release_error.clone(),
        started: Notify::new(),
        release: Notify::new(),
    });
    let (sender, receiver) = mpsc::channel(FI_DRIVER_QUEUE_CAPACITY);
    let operation_active = Arc::new(AtomicBool::new(false));
    let commands = FiCommandSender {
        sender,
        operation_active: operation_active.clone(),
    };
    let task_group = TaskGroup::new();
    task_group.spawn_cancellable("FI durable abandon cleanup test", {
        let backend = backend.clone();
        let formation_state = formation_state.clone();
        let operation_active = operation_active.clone();
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

    let result = fedimint_core::task::spawn("FI abandon release-error caller", {
        let commands = commands.clone();
        async move { commands.request(FiDriverOperation::Abandon).await }
    });
    tokio::time::timeout(Duration::from_secs(2), backend.started.notified())
        .await
        .expect("the explicit abandon command starts");
    backend.release.notify_one();
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(2), result)
            .await
            .expect("the caller completes")
            .expect("the caller task remains healthy"),
        release_error
    );

    assert!(matches!(backend.status(), FiStatus::Idle));
    assert!(formation_state.selection.lock().await.is_none());
    assert!(formation_state.replacement.lock().await.is_none());
    assert!(formation_state.formation_push.state.lock().await.is_none());
    assert_eq!(gateway.revoke_calls.load(Ordering::Acquire), 1);
    assert!(!operation_active.load(Ordering::Acquire));

    drop(commands);
    task_group
        .shutdown_join_all(Duration::from_secs(2))
        .await
        .expect("the durable abandonment cleanup driver shuts down");
}
