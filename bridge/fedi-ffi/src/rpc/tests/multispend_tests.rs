use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

use ::matrix::{Matrix as FediMatrix, SendMessageData};
use anyhow::Context;
use bitcoin::secp256k1;
use federations::federation_v2::db::LastMultispendBtcPayoutSweepKey;
use fedimint_client::transaction::{
    ClientInput, ClientInputBundle, ClientOutput, ClientOutputBundle, TransactionBuilder,
};
use fedimint_core::core::{IntoDynInstance as _, OperationId};
use fedimint_core::module::Amounts;
use fedimint_core::util::backoff_util::{FibonacciBackoff, custom_backoff};
use fedimint_core::util::retry;
use futures::{FutureExt, StreamExt};
use matrix_sdk::ruma::RoomId;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use multispend::db::MultispendScannerLastEventKey;
use multispend::{
    FinalizedGroup, GroupInvitation, GroupInvitationWithKeys, MsEvent, MsEventData,
    MultispendAmount, MultispendGroupKind, MultispendGroupVoteType,
};
use rpc_types::matrix::{RpcRoomId, RpcUserId};
use rpc_types::{RpcEventId, RpcFederationId, RpcPublicKey, SPv2WithdrawMetadata};
use stability_pool_client::api::StabilityPoolApiExt as _;
use stability_pool_client::common::{
    AccountId, AccountType, AccountUnchecked, BtcBalanceDepositMetadata, DepositToBtcBalanceOutput,
    FiatOrAll, SeekRequest, StabilityPoolInput, StabilityPoolInputV0, StabilityPoolOutput,
    StabilityPoolOutputV1, SyncResponse, UnlockForWithdrawalInput,
};
use stability_pool_client::{OwnAccount, StabilityPoolMeta};

use super::*;

const MOCK_FEDERATION_INVITE_CODE: &str = "fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75";
const MOCK_FEDERATION_ID: &str = "15db8cb4f1ec8e484d73b889372bec94812580f929e8148b7437d359af422cd3";

/// Cross-client multispend waits travel client -> synapse -> the other
/// client's sync loop. Under a fully loaded CI runner even
/// aggressive_backoff_long gets exhausted (seen repeatedly on unrelated
/// branches), so these waits get a longer budget.
///
/// backon's fibonacci overshoots the 5s cap to 6.8s and then holds there,
/// so with a 200ms floor the per-retry delays are
/// 0.2, 0.2, 0.4, 0.6, 1.0, 1.6, 2.6, 4.2, then 6.8 repeating. The pinned
/// aggressive_backoff_long is Some(25) = ~126.4s of sleeps (+ up to 5s
/// jitter); Some(28) here is ~146.8s (+ up to ~5.6s jitter), a genuine
/// ~20s more before giving up.
///
/// The ceiling nesting holds because the wrapper's wall time tracks its
/// slowest sub-test chain (a stalled wait here) plus a small overhead, so
/// wait ~152s + overhead < wrapper nextest window 200s (.config/nextest.toml)
/// < fm-run-test's 245s command timeout < the 300s CI job timeout.
fn multispend_sync_backoff() -> FibonacciBackoff {
    custom_backoff(Duration::from_millis(200), Duration::from_secs(5), Some(28))
}

async fn send_text_messages(
    matrix: &FediMatrix,
    room_id: &RoomId,
    prefix: &str,
    count: usize,
) -> anyhow::Result<()> {
    for i in 0..count {
        matrix
            .send_message(room_id, SendMessageData::text(format!("{prefix}-{i}")))
            .await?;
    }
    Ok(())
}

pub async fn test_multispend_minimal(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let matrix = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let multispend_matrix = td1.multispend().await?;

    // Create a room
    let room_id = matrix
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;

    // Test initial state
    assert!(
        multispend_matrix
            .get_multispend_finalized_group(
                RpcRoomId(room_id.to_string()),
                MultispendGroupKind::Fiat
            )
            .await?
            .is_none()
    );

    // Send group invitation
    let user1 = RpcUserId(matrix.client.user_id().unwrap().to_string());
    let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
    let (_, pk1) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
    let invitation = GroupInvitation {
        signers: BTreeSet::from([user1.clone(), user2.clone()]),
        threshold: 2,
        federation_invite_code: MOCK_FEDERATION_INVITE_CODE.to_string(),
        federation_name: "test".to_string(),
    };
    let event = MsEvent::GroupInvitation {
        group_kind: MultispendGroupKind::Fiat,
        invitation: invitation.clone(),
        proposer_pubkey: RpcPublicKey(pk1),
    };
    multispend_matrix
        .send_multispend_event(&room_id, event)
        .await?;

    // Test event data
    let timeline = matrix.timeline(&room_id).await?;
    let event_id = timeline.latest_event_id().await.unwrap();
    let _event_data = retry(
        "wait for event data to be available",
        multispend_sync_backoff(),
        || async {
            multispend_matrix
                .get_multispend_event_data(
                    &RpcRoomId(room_id.to_string()),
                    &RpcEventId(event_id.to_string()),
                )
                .await
                .context("event data not yet available")
        },
    )
    .await?;

    Ok(())
}

pub async fn test_multispend_group_acceptance(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let multispend_matrix1 = td1.multispend().await?;
    let multispend_matrix2 = td2.multispend().await?;

    let room_id = matrix1
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;
    matrix2.wait_for_room_id(&room_id).await?;
    matrix2.room_join(&room_id).await?;

    let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
    let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
    let (_, pk1) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
    let (_, pk2) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());

    let invitation = GroupInvitation {
        signers: BTreeSet::from([user1.clone(), user2.clone()]),
        threshold: 2,
        federation_invite_code: MOCK_FEDERATION_INVITE_CODE.to_string(),
        federation_name: "test".to_string(),
    };

    let event = MsEvent::GroupInvitation {
        group_kind: MultispendGroupKind::Fiat,
        invitation: invitation.clone(),
        proposer_pubkey: RpcPublicKey(pk1),
    };
    multispend_matrix1
        .send_multispend_event(&room_id, event)
        .await?;

    let timeline = matrix1.timeline(&room_id).await?;
    let invitation_event_id = RpcEventId(timeline.latest_event_id().await.unwrap().to_string());

    let event_data1 = retry(
        "wait for user1 event data",
        multispend_sync_backoff(),
        || async {
            multispend_matrix1
                .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
                .await
                .context("event not found")
        },
    )
    .await?;

    assert_eq!(
        event_data1,
        MsEventData::GroupInvitation(GroupInvitationWithKeys {
            kind: MultispendGroupKind::Fiat,
            proposer: user1.clone(),
            invitation: invitation.clone(),
            pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
            rejections: BTreeSet::new(),
            federation_id: RpcFederationId(MOCK_FEDERATION_ID.into())
        })
    );
    let event_data2 = retry(
        "wait for user2 to receive",
        multispend_sync_backoff(),
        || async {
            multispend_matrix2
                .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
                .await
                .context("event not found")
        },
    )
    .await?;
    assert_eq!(event_data1, event_data2);
    {
        use futures::StreamExt as _;
        let mut stream = std::pin::pin!(
            multispend_matrix2
                .subscribe_multispend_event_data(
                    RpcRoomId(room_id.to_string()),
                    invitation_event_id.clone(),
                )
                .await?
        );
        let first = fedimint_core::task::timeout(Duration::from_secs(10), stream.next())
            .await
            .context("event stream sent nothing for an existing event")?;
        assert_eq!(first, Some(event_data2.clone()));
    }

    let event = MsEvent::GroupInvitationVote {
        group_kind: MultispendGroupKind::Fiat,
        invitation: invitation_event_id.clone(),
        vote: MultispendGroupVoteType::Accept {
            member_pubkey: RpcPublicKey(pk2),
        },
    };
    multispend_matrix2
        .send_multispend_event(&room_id, event)
        .await?;

    // Verify group is finalized in matrix1
    let final_group1 = retry(
        "wait for group to be finalized",
        multispend_sync_backoff(),
        || async {
            multispend_matrix2
                .get_multispend_finalized_group(
                    RpcRoomId(room_id.to_string()),
                    MultispendGroupKind::Fiat,
                )
                .await?
                .context("finalized group not found")
        },
    )
    .await?;
    assert_eq!(
        final_group1,
        FinalizedGroup {
            kind: MultispendGroupKind::Fiat,
            proposer: user1.clone(),
            pubkeys: BTreeMap::from_iter([
                (user1.clone(), RpcPublicKey(pk1)),
                (user2.clone(), RpcPublicKey(pk2))
            ]),
            spv2_account: AccountUnchecked {
                acc_type: AccountType::Seeker,
                pub_keys: BTreeSet::from_iter([pk1, pk2]),
                threshold: invitation.threshold
            }
            .try_into()
            .unwrap(),
            invitation,
            federation_id: RpcFederationId(MOCK_FEDERATION_ID.into()),
        }
    );

    // Verify group is finalized in matrix2 as well
    let final_group2 = multispend_matrix2
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()), MultispendGroupKind::Fiat)
        .await?;

    assert_eq!(Some(final_group1), final_group2);
    Ok(())
}

pub async fn test_multispend_group_rejection(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let multispend_matrix1 = td1.multispend().await?;
    let multispend_matrix2 = td2.multispend().await?;

    let room_id = matrix1
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;
    matrix2.wait_for_room_id(&room_id).await?;
    matrix2.room_join(&room_id).await?;

    let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
    let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
    let (_, pk1) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());

    let invitation = GroupInvitation {
        signers: BTreeSet::from([user1.clone(), user2.clone()]),
        threshold: 2,
        federation_invite_code: MOCK_FEDERATION_INVITE_CODE.to_string(),
        federation_name: "test".to_string(),
    };

    let event = MsEvent::GroupInvitation {
        group_kind: MultispendGroupKind::Fiat,
        invitation: invitation.clone(),
        proposer_pubkey: RpcPublicKey(pk1),
    };
    multispend_matrix1
        .send_multispend_event(&room_id, event)
        .await?;

    let timeline = matrix1.timeline(&room_id).await?;
    let invitation_event_id = RpcEventId(timeline.latest_event_id().await.unwrap().to_string());

    let event_data1 = retry(
        "wait for user1 event data",
        multispend_sync_backoff(),
        || async {
            multispend_matrix1
                .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
                .await
                .context("event not found")
        },
    )
    .await?;

    assert_eq!(
        event_data1,
        MsEventData::GroupInvitation(GroupInvitationWithKeys {
            kind: MultispendGroupKind::Fiat,
            proposer: user1.clone(),
            invitation: invitation.clone(),
            pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
            rejections: BTreeSet::new(),
            federation_id: RpcFederationId(MOCK_FEDERATION_ID.into())
        })
    );

    let event_data2 = retry(
        "wait for user2 to receive",
        multispend_sync_backoff(),
        || async {
            multispend_matrix2
                .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
                .await
                .context("event not found")
        },
    )
    .await?;
    assert_eq!(event_data1, event_data2);

    // Send rejection from user2
    let event = MsEvent::GroupInvitationVote {
        group_kind: MultispendGroupKind::Fiat,
        invitation: invitation_event_id.clone(),
        vote: MultispendGroupVoteType::Reject,
    };
    multispend_matrix2
        .send_multispend_event(&room_id, event)
        .await?;

    // Verify invitation state has the rejection recorded
    let event_data1 = retry(
        "wait for rejection to be recorded",
        multispend_sync_backoff(),
        || async {
            let data = multispend_matrix1
                .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
                .await
                .unwrap();

            match &data {
                MsEventData::GroupInvitation(group) if group.rejections.contains(&user2) => {
                    Ok(data)
                }
                _ => anyhow::bail!("Rejection not yet recorded"),
            }
        },
    )
    .await?;

    assert_eq!(
        event_data1,
        MsEventData::GroupInvitation(GroupInvitationWithKeys {
            kind: MultispendGroupKind::Fiat,
            proposer: user1.clone(),
            invitation: invitation.clone(),
            pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
            rejections: BTreeSet::from([user2.clone()]),
            federation_id: RpcFederationId(MOCK_FEDERATION_ID.into())
        })
    );

    // Verify matrix2 has the same data
    let event_data2 = multispend_matrix2
        .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
        .await;
    assert_eq!(Some(event_data1), event_data2);

    // Verify group is not finalized in matrix1
    let final_group1 = multispend_matrix1
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()), MultispendGroupKind::Fiat)
        .await?;
    assert_eq!(final_group1, None);

    // Verify group is not finalized in matrix2 either
    let final_group2 = multispend_matrix2
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()), MultispendGroupKind::Fiat)
        .await?;
    assert_eq!(final_group2, None);

    Ok(())
}

pub async fn test_multispend_last_seen_cache_churn_does_not_panic(
    _dev_fed: DevFed,
) -> anyhow::Result<()> {
    const PRE_MESSAGES: usize = 25;
    const POST_MESSAGES: usize = 120;
    // The event cache shrinks in a task the sdk spawns when the last
    // subscription drops, so under load the shrink can lag well behind our
    // subscribe/check cycle; give it a generous window.
    const SHRINK_NUDGE_ATTEMPTS: usize = 120;
    const STRESS_ATTEMPTS: usize = 8;

    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;

    let room_id = matrix1
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;
    matrix2.wait_for_room_id(&room_id).await?;
    matrix2.room_join(&room_id).await?;

    // Phase 1 (setup): build room history with a marker event in the middle.
    // We later call all_message_since(marker), so this forces backward pagination.
    send_text_messages(matrix1, &room_id, "multispend-repro-pre", PRE_MESSAGES).await?;

    matrix1
        .send_message(
            &room_id,
            SendMessageData::text("multispend-repro-marker".to_owned()),
        )
        .await?;

    let marker_event_id = RpcEventId(
        matrix1
            .timeline(&room_id)
            .await?
            .latest_event_id()
            .await
            .context("expected marker event id")?
            .to_string(),
    );

    send_text_messages(matrix1, &room_id, "multispend-repro-post", POST_MESSAGES).await?;

    let room = matrix1
        .client
        .get_room(&room_id)
        .context("room doesn't exist")?;
    let (room_event_cache, _tasks) = room.event_cache().await?;

    // Phase 2 (setup): wait until the marker is no longer in the currently
    // loaded cache window. This creates the realistic "need to paginate" state.
    let marker_id = marker_event_id.0.clone();
    let mut marker_unloaded = false;
    for i in 0..SHRINK_NUDGE_ATTEMPTS {
        let (loaded_events, subscription) = room_event_cache.subscribe().await?;
        marker_unloaded = !loaded_events
            .iter()
            .any(|event| event.event_id().is_some_and(|id| id == marker_id));
        drop(subscription);

        if marker_unloaded {
            break;
        }

        matrix2
            .send_message(
                &room_id,
                SendMessageData::text(format!("multispend-repro-shrink-nudge-{i}")),
            )
            .await?;
        tokio::time::sleep(Duration::from_millis(250)).await;
    }

    anyhow::ensure!(
        marker_unloaded,
        "failed to auto-shrink event cache into realistic state where marker is not initially loaded"
    );

    // Phase 3 (actual test): run all_message_since while room traffic and
    // subscription churn happen concurrently, and assert it never panics.
    for attempt in 0..STRESS_ATTEMPTS {
        let room_event_cache_clone = room_event_cache.clone();
        let churn_task = tokio::spawn(async move {
            // Frequent subscribe/drop encourages the same cache lifecycle churn
            // seen in production.
            for _ in 0..200 {
                let (_loaded_events, subscription) =
                    room_event_cache_clone.subscribe().await.unwrap();
                drop(subscription);
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        });

        let matrix2_clone = matrix2.clone();
        let room_id_clone = room_id.clone();
        let sender_task = tokio::spawn(async move {
            // Live incoming messages while we run all_message_since.
            for i in 0..30 {
                let _ = matrix2_clone
                    .send_message(
                        &room_id_clone,
                        SendMessageData::text(format!("multispend-repro-live-{attempt}-{i}")),
                    )
                    .await;
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        });

        let panic_result = std::panic::AssertUnwindSafe(tokio::time::timeout(
            Duration::from_secs(20),
            multispend::rescanner::all_message_since(&room, Some(marker_event_id.clone())),
        ))
        .catch_unwind()
        .await;

        churn_task.abort();
        let _ = sender_task.await;

        match panic_result {
            Err(_) => {
                anyhow::bail!(
                    "all_message_since panicked under realistic cache churn on attempt {}",
                    attempt + 1
                )
            }
            Ok(Err(_)) => {
                anyhow::bail!(
                    "all_message_since timed out under realistic cache churn on attempt {}",
                    attempt + 1
                )
            }
            Ok(Ok(_)) => {}
        }
    }

    Ok(())
}

/// Wait until a device's scanner shows the withdrawal request with a
/// submission status matching `done`.
async fn wait_for_withdrawal_status(
    bridge: &BridgeFull,
    room_id: &RoomId,
    request_id: &RpcEventId,
    done: fn(&multispend::WithdrawTxSubmissionStatus) -> bool,
) -> anyhow::Result<()> {
    retry(
        "wait for withdrawal status",
        multispend_sync_backoff(),
        || async {
            match matrixMultispendEventData(
                &bridge.matrix,
                RpcRoomId(room_id.to_string()),
                request_id.clone(),
            )
            .await?
            {
                Some(MsEventData::WithdrawalRequest(request))
                    if done(&request.tx_submission_status) =>
                {
                    Ok(())
                }
                other => anyhow::bail!("withdrawal not settled yet: {other:?}"),
            }
        },
    )
    .await
}

/// Staged plus locked balance of a group account.
async fn group_balance(federation: &FederationV2, account_id: AccountId) -> anyhow::Result<Amount> {
    let sync = federation.multispend_group_sync_info(account_id).await?;
    Ok(sync.staged_balance + sync.locked_balance)
}

/// Request a withdrawal from td1, approve it from td2 and return its id.
async fn request_and_approve_withdrawal(
    td1: &TestDevice,
    td2: &TestDevice,
    room_id: &RoomId,
    amount: MultispendAmount,
) -> anyhow::Result<RpcEventId> {
    let bridge2 = td2.bridge_full().await?;
    matrixSendMultispendWithdrawalRequest(
        td1.bridge_full().await?,
        RpcRoomId(room_id.to_string()),
        amount,
        "withdraw".to_string(),
    )
    .await?;
    let request_id = RpcEventId(
        td1.matrix()
            .await?
            .timeline(room_id)
            .await?
            .latest_event_id()
            .await
            .context("no latest event")?
            .to_string(),
    );
    retry(
        "wait for td2 to scan withdrawal request",
        multispend_sync_backoff(),
        || async {
            matrixMultispendEventData(
                &bridge2.matrix,
                RpcRoomId(room_id.to_string()),
                request_id.clone(),
            )
            .await?
            .context("request not scanned yet")
        },
    )
    .await?;
    matrixSendMultispendWithdrawalApprove(
        bridge2,
        RpcRoomId(room_id.to_string()),
        request_id.clone(),
    )
    .await?;
    Ok(request_id)
}

/// A device recovered from seed rebuilds its multispend state by rescanning
/// the whole room. Replaying the approvals of withdrawals it requested must not
/// submit them to the federation again: a withdrawal the federation already
/// executed would be refused and reported as a failure in the room, and one
/// the federation refused at the time could now go through.
pub async fn test_multispend_seed_recovery_does_not_resubmit_withdrawals(
    _dev_fed: DevFed,
) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }
    let mut td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let bridge1 = td1.bridge_full().await?;
    let bridge2 = td2.bridge_full().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let fed1 = td1.join_default_fed().await?;
    let fed2 = td2.join_default_fed().await?;

    // invitations need a non-DM room where td1 sees td2 as an active member
    let mut request = ::matrix::create_room::Request::default();
    request.name = Some("multispend test group".to_string());
    let room_id = matrix1.room_create(request).await?;
    matrix1
        .room_invite_user_by_id(&room_id, matrix2.client.user_id().unwrap())
        .await?;
    matrix2.wait_for_room_id(&room_id).await?;
    matrix2.room_join(&room_id).await?;
    retry(
        "wait for td1 to see td2 joined",
        multispend_sync_backoff(),
        || async {
            let room = matrix1.client.get_room(&room_id).context("no room")?;
            let members = room.members(matrix_sdk::RoomMemberships::ACTIVE).await?;
            anyhow::ensure!(members.len() > 1);
            Ok(())
        },
    )
    .await?;

    // 1-of-2 stable group: td2's approval alone settles td1's requests
    let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
    let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
    matrixSendMultispendGroupInvitation(
        bridge1,
        RpcRoomId(room_id.to_string()),
        MultispendGroupKind::Fiat,
        BTreeSet::from([user1, user2]),
        1,
        fed1.rpc_federation_id(),
        "test".to_string(),
    )
    .await?;
    let invitation_event_id = RpcEventId(
        matrix1
            .timeline(&room_id)
            .await?
            .latest_event_id()
            .await
            .unwrap()
            .to_string(),
    );
    retry(
        "wait for td2 to scan invitation",
        multispend_sync_backoff(),
        || async {
            matrixMultispendEventData(
                &bridge2.matrix,
                RpcRoomId(room_id.to_string()),
                invitation_event_id.clone(),
            )
            .await?
            .context("invitation not scanned yet")
        },
    )
    .await?;
    matrixApproveMultispendGroupInvitation(
        bridge2,
        RpcRoomId(room_id.to_string()),
        invitation_event_id,
    )
    .await?;
    let multispend_matrix1 = td1.multispend().await?;
    let group = retry(
        "wait for group finalization",
        multispend_sync_backoff(),
        || async {
            multispend_matrix1
                .get_multispend_finalized_group(
                    RpcRoomId(room_id.to_string()),
                    MultispendGroupKind::Fiat,
                )
                .await?
                .context("not finalized")
        },
    )
    .await?;
    let group_account_id = group.spv2_account.id();

    // fund td1's seeker account, then the group
    let ecash = cli_generate_ecash(Amount::from_sats(500_000)).await?;
    receiveEcash(fed1.clone(), ecash, FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(fed1).await?;
    spv2DepositToSeek(
        fed1.clone(),
        RpcAmount(Amount::from_sats(400_000)),
        FrontendMetadata::default(),
    )
    .await?;
    retry(
        "wait for seeker deposit",
        multispend_sync_backoff(),
        || async {
            anyhow::ensure!(td1.event_sink().num_events_of_type("spv2Deposit".into()) >= 3);
            Ok(())
        },
    )
    .await?;
    let group_room_id = RpcRoomId(room_id.to_string());
    let deposit_to_group = |amount: RpcFiatAmount| {
        let group_room_id = group_room_id.clone();
        async move {
            let balance_before = group_balance(fed1, group_account_id).await?;
            matrixMultispendDeposit(
                bridge1,
                group_room_id,
                MultispendAmount::FiatAmount(amount),
                "deposit".to_string(),
                FrontendMetadata::default(),
            )
            .await?;
            retry(
                "wait for group deposit",
                multispend_sync_backoff(),
                || async {
                    anyhow::ensure!(group_balance(fed1, group_account_id).await? > balance_before);
                    Ok(())
                },
            )
            .await
        }
    };
    deposit_to_group(RpcFiatAmount(10_00)).await?;

    // more than the group holds: the federation refuses it
    let refused_id = request_and_approve_withdrawal(
        &td1,
        &td2,
        &room_id,
        MultispendAmount::FiatAmount(RpcFiatAmount(20_00)),
    )
    .await?;
    wait_for_withdrawal_status(bridge1, &room_id, &refused_id, |status| {
        matches!(
            status,
            multispend::WithdrawTxSubmissionStatus::Rejected { .. }
        )
    })
    .await?;
    let executed_id = request_and_approve_withdrawal(
        &td1,
        &td2,
        &room_id,
        MultispendAmount::FiatAmount(RpcFiatAmount(5_00)),
    )
    .await?;
    wait_for_withdrawal_status(bridge1, &room_id, &executed_id, |status| {
        matches!(
            status,
            multispend::WithdrawTxSubmissionStatus::Accepted { .. }
        )
    })
    .await?;
    // the group can now cover the refused withdrawal
    deposit_to_group(RpcFiatAmount(25_00)).await?;
    // the deposit notification reaches the room after the transfer lands; wait
    // for it so the room is settled before recovery
    retry(
        "wait for td2 to list both deposits and withdrawals",
        multispend_sync_backoff(),
        || async {
            let events = matrixMultispendListEvents(
                &bridge2.matrix,
                group_room_id.clone(),
                MultispendGroupKind::Fiat,
                None,
                10,
            )
            .await?;
            anyhow::ensure!(events.len() == 4, "listed {} events", events.len());
            Ok(())
        },
    )
    .await?;

    let group_before = group_balance(fed2, group_account_id).await?;
    let latest_event_before = matrix2.timeline(&room_id).await?.latest_event_id().await;

    backupNow(fed1.clone()).await?;
    sleep_in_test(
        "matrix needs some time to upload room keys",
        Duration::from_secs(10),
    )
    .await;
    let mnemonic = getMnemonic(bridge1.runtime.clone()).await?;
    td1.shutdown().await?;

    let mut td1 = TestDevice::new().await?;
    let onboarding = td1.bridge_maybe_onboarding().await?;
    restoreMnemonic(onboarding.try_get()?, mnemonic).await?;
    onboardTransferExistingDeviceRegistration(onboarding.try_get()?, 0).await?;
    let bridge1 = td1.bridge_full().await?;
    join_test_fed_recovery(bridge1, false).await?;
    retry(
        "wait for federation recovery",
        multispend_sync_backoff(),
        || async {
            anyhow::ensure!(
                td1.event_sink()
                    .num_events_of_type("recoveryComplete".into())
                    == 1
            );
            Ok(())
        },
    )
    .await?;

    // the user opening the group scans the whole room history
    td1.matrix().await?.wait_for_room_id(&room_id).await?;
    let multispend_matrix1 = td1.multispend().await?;
    multispend_matrix1
        .rescanner
        .wait_for_scanned(&room_id)
        .await;
    wait_for_withdrawal_status(bridge1, &room_id, &refused_id, |status| {
        matches!(
            status,
            multispend::WithdrawTxSubmissionStatus::Rejected { .. }
        )
    })
    .await?;
    wait_for_withdrawal_status(bridge1, &room_id, &executed_id, |status| {
        matches!(
            status,
            multispend::WithdrawTxSubmissionStatus::Accepted { .. }
        )
    })
    .await?;

    // the withdrawal service only drains its queue when woken by a scan or on
    // launch, so relaunch the app on the recovered data as well
    td1.shutdown().await?;
    td1.bridge_full().await?;

    // a resubmission is refused or executed within seconds
    sleep_in_test(
        "give a resubmission time to reach the federation",
        Duration::from_secs(20),
    )
    .await;
    // seeker fees shave a few msats each cycle; a withdrawal moves $20
    let group_after = group_balance(fed2, group_account_id).await?;
    assert!(
        group_before.msats.saturating_sub(group_after.msats) < Amount::from_sats(1_000).msats,
        "group balance dropped from {group_before} to {group_after} after recovery"
    );
    assert_eq!(
        matrix2.timeline(&room_id).await?.latest_event_id().await,
        latest_event_before,
        "recovered device posted into the room"
    );

    Ok(())
}

/// Every device of the requester sees the approval that reaches the
/// threshold. Only the device the withdrawal pays may submit it: a second
/// submission is refused, and its rejection could land first and mark the
/// paid withdrawal as rejected in the room.
pub async fn test_multispend_withdrawal_is_submitted_by_the_paid_device(
    _dev_fed: DevFed,
) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }
    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let bridge1 = td1.bridge_full().await?;
    let bridge2 = td2.bridge_full().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let fed1 = td1.join_default_fed().await?;
    td2.join_default_fed().await?;
    let federation_id = fed1.rpc_federation_id();

    let mut request = ::matrix::create_room::Request::default();
    request.name = Some("multispend two devices".to_string());
    let room_id = matrix1.room_create(request).await?;
    matrix1
        .room_invite_user_by_id(&room_id, matrix2.client.user_id().unwrap())
        .await?;
    matrix2.wait_for_room_id(&room_id).await?;
    matrix2.room_join(&room_id).await?;
    retry(
        "wait for td1 to see td2 joined",
        multispend_sync_backoff(),
        || async {
            let room = matrix1.client.get_room(&room_id).context("no room")?;
            let members = room.members(matrix_sdk::RoomMemberships::ACTIVE).await?;
            anyhow::ensure!(members.len() > 1);
            Ok(())
        },
    )
    .await?;
    let group_room_id = RpcRoomId(room_id.to_string());

    // 1-of-2 bitcoin group: td2's approval settles td1's request
    let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
    let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
    matrixSendMultispendGroupInvitation(
        bridge1,
        group_room_id.clone(),
        MultispendGroupKind::Btc,
        BTreeSet::from([user1, user2]),
        1,
        federation_id,
        "test".to_string(),
    )
    .await?;
    let invitation_event_id = RpcEventId(
        matrix1
            .timeline(&room_id)
            .await?
            .latest_event_id()
            .await
            .unwrap()
            .to_string(),
    );
    retry(
        "wait for td2 to scan invitation",
        multispend_sync_backoff(),
        || async {
            matrixMultispendEventData(
                &bridge2.matrix,
                group_room_id.clone(),
                invitation_event_id.clone(),
            )
            .await?
            .context("invitation not scanned yet")
        },
    )
    .await?;
    matrixApproveMultispendGroupInvitation(bridge2, group_room_id.clone(), invitation_event_id)
        .await?;
    let multispend_matrix1 = td1.multispend().await?;
    let group = retry(
        "wait for group finalization",
        multispend_sync_backoff(),
        || async {
            multispend_matrix1
                .get_multispend_finalized_group(group_room_id.clone(), MultispendGroupKind::Btc)
                .await?
                .context("not finalized")
        },
    )
    .await?;
    let group_account_id = group.spv2_account.id();

    let ecash = cli_generate_ecash(Amount::from_sats(500_000)).await?;
    receiveEcash(fed1.clone(), ecash, FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(fed1).await?;
    let deposit = Amount::from_sats(100_000);
    matrixMultispendDeposit(
        bridge1,
        group_room_id.clone(),
        MultispendAmount::BtcAmount(RpcAmount(deposit)),
        "deposit".to_string(),
        FrontendMetadata::default(),
    )
    .await?;
    retry(
        "wait for group deposit",
        multispend_sync_backoff(),
        || async {
            let balance = group_balance(fed1, group_account_id).await?;
            anyhow::ensure!(balance == deposit, "group holds {balance}");
            Ok(())
        },
    )
    .await?;

    // td1's user on a second device, index 1, which has its own keys; it
    // reads the earlier room events with the keys td1 backed up
    sleep_in_test(
        "matrix needs some time to upload room keys",
        Duration::from_secs(10),
    )
    .await;
    let td1b = TestDevice::new().await?;
    let onboarding = td1b.bridge_maybe_onboarding().await?;
    restoreMnemonic(
        onboarding.try_get()?,
        getMnemonic(bridge1.runtime.clone()).await?,
    )
    .await?;
    onboardRegisterAsNewDevice(onboarding.try_get()?, Some(1)).await?;
    let bridge1b = td1b.bridge_full().await?;
    assert_eq!(bridge1b.runtime.app_state.device_index().await, 1);
    let fed1b = join_test_fed_recovery(bridge1b, false).await?;
    let matrix1b = td1b.matrix().await?;
    assert_eq!(matrix1b.client.user_id(), matrix1.client.user_id());
    matrix1b.wait_for_room_id(&room_id).await?;
    let multispend_matrix1b = td1b.multispend().await?;
    // a new device scans a room's history once the user opens it
    multispend_matrix1b
        .rescanner
        .wait_for_scanned(&room_id)
        .await;
    retry(
        "wait for the second device to see the group",
        multispend_sync_backoff(),
        || async {
            multispend_matrix1b
                .get_multispend_finalized_group(group_room_id.clone(), MultispendGroupKind::Btc)
                .await?
                .context("not finalized")
        },
    )
    .await?;

    let withdrawal = Amount::from_sats(40_000);
    let request_id = request_and_approve_withdrawal(
        &td1,
        &td2,
        &room_id,
        MultispendAmount::BtcAmount(RpcAmount(withdrawal)),
    )
    .await?;
    for bridge in [bridge1, bridge2, bridge1b] {
        wait_for_withdrawal_status(bridge, &room_id, &request_id, |status| {
            matches!(
                status,
                multispend::WithdrawTxSubmissionStatus::Accepted { .. }
            )
        })
        .await?;
    }
    sleep_in_test(
        "give the second device time to submit the request too",
        Duration::from_secs(5),
    )
    .await;
    assert_eq!(
        group_balance(fed1, group_account_id).await?,
        deposit - withdrawal
    );
    let transfers = fed1b
        .client
        .operation_log()
        .paginate_operations_rev(100, None)
        .await
        .into_iter()
        .filter(|(_, entry)| {
            matches!(
                entry.try_meta::<StabilityPoolMeta>(),
                Ok(StabilityPoolMeta::BtcTransfer { .. })
            )
        })
        .count();
    assert_eq!(transfers, 0, "the second device submitted the withdrawal");

    Ok(())
}

pub async fn test_multispend_btc_group_deposit_withdraw_sweep(
    _dev_fed: DevFed,
) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }
    // td2 runs with the btc_multispend feature off: the feature gates joining
    // and depositing into bitcoin groups, not withdrawals or payout sweeps
    let td1 = TestDevice::new().await?;
    let mut td2 = TestDevice::new().await?;
    let mut flag_off = FeatureCatalog::new(
        &Database::new(MemDatabase::new(), Default::default()),
        RuntimeEnvironment::Tests,
    )
    .await;
    flag_off.btc_multispend = None;
    td2.with_feature_catalog(Arc::new(flag_off));
    let bridge1 = td1.bridge_full().await?;
    let bridge2 = td2.bridge_full().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let fed1 = td1.join_default_fed().await?;
    let fed2 = td2.join_default_fed().await?;
    let federation_id = fed1.rpc_federation_id();

    // invitations need a non-DM room where td1 sees td2 as an active member
    let mut request = ::matrix::create_room::Request::default();
    request.name = Some("multispend btc test group".to_string());
    let room_id = matrix1.room_create(request).await?;
    matrix1
        .room_invite_user_by_id(&room_id, matrix2.client.user_id().unwrap())
        .await?;
    matrix2.wait_for_room_id(&room_id).await?;
    matrix2.room_join(&room_id).await?;
    retry(
        "wait for td1 to see td2 joined",
        multispend_sync_backoff(),
        || async {
            let room = matrix1.client.get_room(&room_id).context("no room")?;
            let members = room.members(matrix_sdk::RoomMemberships::ACTIVE).await?;
            anyhow::ensure!(members.len() > 1);
            Ok(())
        },
    )
    .await?;
    let group_room_id = RpcRoomId(room_id.to_string());

    // 1-of-2 bitcoin group: one approval settles a request
    let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
    let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
    assert!(
        matrixSendMultispendGroupInvitation(
            bridge2,
            group_room_id.clone(),
            MultispendGroupKind::Btc,
            BTreeSet::from([user1.clone(), user2.clone()]),
            1,
            federation_id.clone(),
            "test".to_string(),
        )
        .await
        .is_err()
    );
    matrixSendMultispendGroupInvitation(
        bridge1,
        group_room_id.clone(),
        MultispendGroupKind::Btc,
        BTreeSet::from([user1, user2]),
        1,
        federation_id.clone(),
        "test".to_string(),
    )
    .await?;
    let invitation_event_id = RpcEventId(
        matrix1
            .timeline(&room_id)
            .await?
            .latest_event_id()
            .await
            .unwrap()
            .to_string(),
    );
    retry(
        "wait for td2 to scan invitation",
        multispend_sync_backoff(),
        || async {
            matrixMultispendEventData(
                &bridge2.matrix,
                group_room_id.clone(),
                invitation_event_id.clone(),
            )
            .await?
            .context("invitation not scanned yet")
        },
    )
    .await?;
    assert!(
        matrixApproveMultispendGroupInvitation(
            bridge2,
            group_room_id.clone(),
            invitation_event_id.clone()
        )
        .await
        .is_err()
    );
    // so td2 joins below the RPC, as a member with the feature on would
    td2.multispend()
        .await?
        .vote_multispend_group_invitation(
            &room_id,
            invitation_event_id,
            MultispendGroupVoteType::Accept {
                member_pubkey: RpcPublicKey(fed2.multispend_public_key(room_id.to_string())?),
            },
        )
        .await?;
    let multispend_matrix1 = td1.multispend().await?;
    let group = retry(
        "wait for group finalization",
        multispend_sync_backoff(),
        || async {
            multispend_matrix1
                .get_multispend_finalized_group(group_room_id.clone(), MultispendGroupKind::Btc)
                .await?
                .context("not finalized")
        },
    )
    .await?;
    assert_eq!(group.kind, MultispendGroupKind::Btc);
    assert_eq!(group.spv2_account.acc_type(), AccountType::BtcDepositor);
    let group_account_id = group.spv2_account.id();

    // the room has no fiat group to withdraw from
    assert!(
        matrixSendMultispendWithdrawalRequest(
            bridge1,
            group_room_id.clone(),
            MultispendAmount::FiatAmount(RpcFiatAmount(1_00)),
            "fiat".to_string(),
        )
        .await
        .is_err()
    );

    for fed in [fed1, fed2] {
        let ecash = cli_generate_ecash(Amount::from_sats(500_000)).await?;
        receiveEcash(fed.clone(), ecash, FrontendMetadata::default()).await?;
        wait_for_ecash_reissue(fed).await?;
    }

    let deposit = Amount::from_sats(100_000);
    assert!(
        matrixMultispendDeposit(
            bridge2,
            group_room_id.clone(),
            MultispendAmount::BtcAmount(RpcAmount(deposit)),
            "deposit".to_string(),
            FrontendMetadata::default(),
        )
        .await
        .is_err()
    );
    matrixMultispendDeposit(
        bridge1,
        group_room_id.clone(),
        MultispendAmount::BtcAmount(RpcAmount(deposit)),
        "deposit".to_string(),
        FrontendMetadata::default(),
    )
    .await?;
    // bitcoin balances hold exact msats, nothing is shaved per cycle
    retry(
        "wait for group deposit",
        multispend_sync_backoff(),
        || async {
            let balance = group_balance(fed1, group_account_id).await?;
            anyhow::ensure!(balance == deposit, "group holds {balance}");
            Ok(())
        },
    )
    .await?;
    retry(
        "wait for td2 to list the deposit",
        multispend_sync_backoff(),
        || async {
            let events = matrixMultispendListEvents(
                &bridge2.matrix,
                group_room_id.clone(),
                MultispendGroupKind::Btc,
                None,
                10,
            )
            .await?;
            anyhow::ensure!(events.len() == 1, "listed {} events", events.len());
            Ok(())
        },
    )
    .await?;

    // each app synced its payout account once at startup, and neither
    // joining a group, depositing nor ecash activity syncs it again
    for fed in [fed1, fed2] {
        assert_eq!(payout_syncs(fed), 1);
    }

    // td2 approves with the feature off; td1's withdrawal pays td1's payout
    // account, which td1 sweeps once its transfer is accepted and again on
    // the completion event, as if another of its devices had submitted it
    let withdrawal = Amount::from_sats(40_000);
    let ecash_before = fed1.get_balance().await;
    let request_id = request_and_approve_withdrawal(
        &td1,
        &td2,
        &room_id,
        MultispendAmount::BtcAmount(RpcAmount(withdrawal)),
    )
    .await?;
    wait_for_withdrawal_status(bridge2, &room_id, &request_id, |status| {
        matches!(
            status,
            multispend::WithdrawTxSubmissionStatus::Accepted { .. }
        )
    })
    .await?;
    assert_eq!(
        group_balance(fed1, group_account_id).await?,
        deposit - withdrawal
    );
    wait_for_payout_swept(fed1, ecash_before, withdrawal).await?;
    // td2, which the withdrawal did not pay, does not sync its payout account
    assert_eq!(payout_syncs(fed2), 1);

    // td2 requests with the feature off, and its payout is swept regardless
    let second_withdrawal = Amount::from_sats(30_000);
    let ecash_before = fed2.get_balance().await;
    let request_id = request_and_approve_withdrawal(
        &td2,
        &td1,
        &room_id,
        MultispendAmount::BtcAmount(RpcAmount(second_withdrawal)),
    )
    .await?;
    wait_for_withdrawal_status(bridge1, &room_id, &request_id, |status| {
        matches!(
            status,
            multispend::WithdrawTxSubmissionStatus::Accepted { .. }
        )
    })
    .await?;
    assert_eq!(
        group_balance(fed1, group_account_id).await?,
        deposit - withdrawal - second_withdrawal
    );
    wait_for_payout_swept(fed2, ecash_before, second_withdrawal).await?;
    let first_sweeps = payout_sweeps(fed2).await;
    assert_eq!(first_sweeps.len(), 1);

    // a withdrawal cut short after its unlock leaves the payout idle
    let idle = Amount::from_sats(20_000);
    deposit_to_payout(fed2, idle).await?;
    unlock_multispend_btc_payout(fed2).await?;
    let sync = payout_sync(fed2).await?;
    assert_eq!(
        (sync.staged_balance, sync.idle_balance),
        (Amount::ZERO, idle)
    );

    // the sweep and its marker commit together, so the app going down right
    // after starting it still finds it, and the startup sweep awaits it
    // rather than starting another
    let ecash_before = fed2.get_balance().await;
    let operation_id = fed2
        .start_multispend_btc_payout_sweep()
        .await?
        .context("idle payout not swept")?;
    td2.shutdown().await?;
    let bridge2 = td2.bridge_full().await?;
    let fed2 = wait_for_federation_loading(bridge2, &federation_id.0).await?;
    wait_for_payout_swept(&fed2, ecash_before, idle).await?;
    retry(
        "wait for the resumed sweep to finish",
        multispend_sync_backoff(),
        || async {
            anyhow::ensure!(
                fed2.dbtx()
                    .await
                    .get_value(&LastMultispendBtcPayoutSweepKey)
                    .await
                    .is_none()
            );
            Ok(())
        },
    )
    .await?;
    let mut sweeps = payout_sweeps(&fed2).await;
    sweeps.sort();
    let mut expected = vec![first_sweeps[0], operation_id];
    expected.sort();
    assert_eq!(sweeps, expected);
    assert_eq!(fed2.sweep_multispend_btc_payout().await?, None);

    // a payout landing while a sweep is in flight is swept by the trigger
    // that joins that sweep, without a restart
    let first = Amount::from_sats(20_000);
    deposit_to_payout(&fed2, first).await?;
    unlock_multispend_btc_payout(&fed2).await?;
    let second = Amount::from_sats(10_000);
    // the second payout is paid out of ecash after this
    let ecash_before = fed2.get_balance().await.saturating_sub(second);
    let in_flight = fed2
        .start_multispend_btc_payout_sweep()
        .await?
        .context("idle payout not swept")?;
    deposit_to_payout(&fed2, second).await?;
    assert_eq!(
        fed2.sweep_multispend_btc_payout().await?,
        Some(first + second)
    );
    wait_for_payout_swept(&fed2, ecash_before, first + second).await?;
    let sweeps = payout_sweeps(&fed2).await;
    assert_eq!(sweeps.len(), 4);
    assert!(sweeps.contains(&in_flight));

    Ok(())
}

fn payout_syncs(fed: &FederationV2) -> u64 {
    fed.multispend_btc_payout_syncs
        .load(std::sync::atomic::Ordering::Relaxed)
}

/// Wait until the payout account is empty and its msats, less mint fees,
/// reached the ecash balance.
async fn wait_for_payout_swept(
    fed: &FederationV2,
    ecash_before: Amount,
    payout: Amount,
) -> anyhow::Result<()> {
    retry(
        "wait for the payout sweep",
        multispend_sync_backoff(),
        || async {
            let sync = payout_sync(fed).await?;
            anyhow::ensure!(
                sync.staged_balance == Amount::ZERO && sync.idle_balance == Amount::ZERO,
                "payout holds {} staged, {} idle",
                sync.staged_balance,
                sync.idle_balance
            );
            let gained = fed.get_balance().await.saturating_sub(ecash_before);
            anyhow::ensure!(
                payout.saturating_sub(Amount::from_sats(1_000)) < gained && gained <= payout,
                "ecash balance gained {gained}"
            );
            Ok(())
        },
    )
    .await
}

async fn payout_sync(fed: &FederationV2) -> anyhow::Result<SyncResponse> {
    let spv2 = fed.client.spv2()?;
    Ok(spv2
        .api
        .account_sync(spv2.own_account(OwnAccount::MultispendBtcPayout).id())
        .await?)
}

/// Unlock the whole payout account without withdrawing the unlocked msats, as a
/// withdrawal cut short by a restore from seed leaves it.
async fn unlock_multispend_btc_payout(fed: &FederationV2) -> anyhow::Result<()> {
    let spv2 = fed.client.spv2()?;
    let input = ClientInput {
        amounts: Amounts::ZERO,
        input: StabilityPoolInput::V0(StabilityPoolInputV0::UnlockForWithdrawal(
            UnlockForWithdrawalInput {
                account: spv2.own_account(OwnAccount::MultispendBtcPayout),
                amount: FiatOrAll::All,
            },
        )),
        keys: vec![spv2.own_keypair(OwnAccount::MultispendBtcPayout)],
    };
    submit_test_tx(
        fed,
        TransactionBuilder::new()
            .with_inputs(ClientInputBundle::new_no_sm(vec![input]).into_dyn(spv2.id)),
    )
    .await
}

/// Deposit ecash straight into the payout account, which no withdrawal does
/// and so triggers no sweep.
async fn deposit_to_payout(fed: &FederationV2, amount: Amount) -> anyhow::Result<()> {
    let spv2 = fed.client.spv2()?;
    let output = ClientOutput {
        amounts: Amounts::new_bitcoin(amount),
        output: StabilityPoolOutput::V1(StabilityPoolOutputV1::DepositToBtcBalance(
            DepositToBtcBalanceOutput {
                account_id: spv2.own_account(OwnAccount::MultispendBtcPayout).id(),
                seek_request: SeekRequest(amount),
                metadata: BtcBalanceDepositMetadata(vec![]),
            },
        )),
    };
    submit_test_tx(
        fed,
        TransactionBuilder::new()
            .with_outputs(ClientOutputBundle::new_no_sm(vec![output]).into_dyn(spv2.id)),
    )
    .await
}

/// Submit `tx` and wait for its acceptance. It is not a stability pool
/// operation, so a relaunch leaves it alone.
async fn submit_test_tx(fed: &FederationV2, tx: TransactionBuilder) -> anyhow::Result<()> {
    let operation_id = OperationId::new_random();
    let outpoints = fed
        .client
        .finalize_and_submit_transaction(operation_id, "multispend_test", |_| (), tx)
        .await?;
    fed.client
        .transaction_updates(operation_id)
        .await
        .await_tx_accepted(outpoints.txid)
        .await
        .map_err(|e| anyhow::anyhow!(e))
}

/// Operations sweeping the payout account, staged or idle.
async fn payout_sweeps(fed: &FederationV2) -> Vec<OperationId> {
    fed.client
        .operation_log()
        .paginate_operations_rev(100, None)
        .await
        .into_iter()
        .filter(|(_, entry)| {
            let extra_meta = match entry.try_meta::<StabilityPoolMeta>() {
                Ok(
                    StabilityPoolMeta::Withdrawal { extra_meta, .. }
                    | StabilityPoolMeta::WithdrawIdleBalance { extra_meta, .. },
                ) => extra_meta,
                _ => return false,
            };
            matches!(
                serde_json::from_value(extra_meta),
                Ok(SPv2WithdrawMetadata::MultispendBtcPayout)
            )
        })
        .map(|(key, _)| key.operation_id)
        .collect()
}

pub async fn test_multispend_rescan_processes_every_synced_event(
    _dev_fed: DevFed,
) -> anyhow::Result<()> {
    // a sync response reaches the event cache room by room in room id order, so
    // rooms sorting before the multispend room delay it past the queued rescan
    const FILLER_ROOMS: usize = 11;
    const EVENTS: usize = 20;

    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let multispend_matrix1 = td1.multispend().await?;

    let mut room_ids = Vec::new();
    for i in 0..=FILLER_ROOMS {
        let mut request = ::matrix::create_room::Request::default();
        request.name = Some(format!("rescan race {i}"));
        let room_id = matrix1.room_create(request).await?;
        matrix1
            .room_invite_user_by_id(&room_id, matrix2.client.user_id().unwrap())
            .await?;
        matrix2.wait_for_room_id(&room_id).await?;
        matrix2.room_join(&room_id).await?;
        room_ids.push(room_id);
    }
    room_ids.sort();
    let multispend_room_id = room_ids.pop().context("rooms were created")?;
    let multispend_room = matrix2
        .client
        .get_room(&multispend_room_id)
        .context("td2 joined the multispend room")?;
    let filler_rooms = room_ids
        .iter()
        .map(|room_id| {
            matrix2
                .client
                .get_room(room_id)
                .context("td2 joined the filler room")
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    multispend_matrix1
        .mark_room_for_scanning(&multispend_room_id)
        .await;
    multispend_matrix1
        .rescanner
        .wait_for_scanned(&multispend_room_id)
        .await;
    let mut scans = std::pin::pin!(
        multispend_matrix1
            .rescanner
            .scan_complete_stream(&multispend_room_id)
    );
    // the stream yields once before any scan completes
    scans.next().await;

    let last_scanned_key = MultispendScannerLastEventKey(RpcRoomId(multispend_room_id.to_string()));
    for i in 0..EVENTS {
        let fillers = futures::future::join_all(filler_rooms.iter().map(|room| async move {
            room.send(RoomMessageEventContent::text_plain(format!("filler {i}")))
                .await
        }));
        let (filler_results, sent) = futures::join!(fillers, async {
            multispend_room
                .send(RoomMessageEventContent::text_plain(format!("rescan {i}")))
                .await
        });
        for result in filler_results {
            result?;
        }
        let event_id = sent?.response.event_id;
        fedimint_core::task::timeout(Duration::from_secs(120), scans.next())
            .await
            .context("td1 never rescanned the multispend room")?;
        let last_scanned = multispend_matrix1
            .runtime
            .multispend_db()
            .begin_transaction_nc()
            .await
            .get_value(&last_scanned_key)
            .await;
        anyhow::ensure!(
            last_scanned
                .as_ref()
                .is_some_and(|last| last.0 == event_id.as_str()),
            "event {i} ({event_id}) reached td1 but its rescan stopped at {last_scanned:?}"
        );
    }

    Ok(())
}

pub async fn test_multispend_send_returns_when_sync_skips_own_event(
    _dev_fed: DevFed,
) -> anyhow::Result<()> {
    use matrix_sdk::ruma::events::room::message::OriginalSyncRoomMessageEvent;

    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let matrix1 = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;
    let multispend_matrix1 = td1.multispend().await?;

    let room_id = matrix1
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;
    matrix2.wait_for_room_id(&room_id).await?;
    matrix2.room_join(&room_id).await?;
    let room2 = matrix2
        .client
        .get_room(&room_id)
        .context("td2 joined the room")?;

    retry(
        "wait for td2 to sync its joined membership",
        multispend_sync_backoff(),
        || async {
            let member = room2
                .get_member_no_sync(matrix2.client.user_id().unwrap())
                .await?;
            anyhow::ensure!(
                room2.state() == matrix_sdk::RoomState::Joined
                    && member.is_some_and(|member| {
                        member.membership()
                            == &matrix_sdk::ruma::events::room::member::MembershipState::Join
                    }),
                "td2 has not synced its joined membership"
            );
            Ok(())
        },
    )
    .await?;

    // event handlers run inside sync response processing, so blocking one
    // pauses td1's sync until `resume` is notified
    let paused = Arc::new(tokio::sync::Notify::new());
    let resume = Arc::new(tokio::sync::Notify::new());
    matrix1.client.add_event_handler({
        let paused = paused.clone();
        let resume = resume.clone();
        move |event: OriginalSyncRoomMessageEvent| {
            let paused = paused.clone();
            let resume = resume.clone();
            async move {
                if event.content.body() == "pause sync" {
                    paused.notify_one();
                    resume.notified().await;
                }
            }
        }
    });
    let multispend_seen = Arc::new(tokio::sync::Notify::new());
    matrix2.client.add_event_handler({
        let multispend_seen = multispend_seen.clone();
        move |event: OriginalSyncRoomMessageEvent| {
            let multispend_seen = multispend_seen.clone();
            async move {
                if event.content.msgtype() == multispend::MULTISPEND_MSGTYPE {
                    multispend_seen.notify_one();
                }
            }
        }
    });

    room2
        .send(RoomMessageEventContent::text_plain("pause sync"))
        .await?;
    fedimint_core::task::timeout(Duration::from_secs(60), paused.notified())
        .await
        .context("td1 never synced the pause message")?;

    let user1 = RpcUserId(matrix1.client.user_id().unwrap().to_string());
    let user2 = RpcUserId(matrix2.client.user_id().unwrap().to_string());
    let (_, pk1) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
    let event = MsEvent::GroupInvitation {
        group_kind: MultispendGroupKind::Fiat,
        invitation: GroupInvitation {
            signers: BTreeSet::from([user1, user2]),
            threshold: 2,
            federation_invite_code: MOCK_FEDERATION_INVITE_CODE.to_string(),
            federation_name: "test".to_string(),
        },
        proposer_pubkey: RpcPublicKey(pk1),
    };
    // the send gives up waiting for sync after 30s and leaves the event to the
    // rescanner
    let send = fedimint_core::task::timeout(
        Duration::from_secs(45),
        multispend_matrix1.send_multispend_event(&room_id, event),
    );
    // td1's next sync holds two new events in the room, and the room list
    // timeline limit of 1 drops td1's own multispend event from the response
    let interleave = async {
        fedimint_core::task::timeout(Duration::from_secs(60), multispend_seen.notified())
            .await
            .context("td2 never synced td1's multispend event")?;
        room2
            .send(RoomMessageEventContent::text_plain("after multispend"))
            .await?;
        resume.notify_one();
        anyhow::Ok(())
    };
    let (sent, interleaved) = futures::join!(send, interleave);
    interleaved?;
    sent.context("send_multispend_event never returned")??;

    retry(
        "wait for td1 to scan its invitation",
        multispend_sync_backoff(),
        || async {
            match multispend_matrix1
                .get_multispend_group_status(&room_id, MultispendGroupKind::Fiat)
                .await
            {
                multispend::db::RpcMultispendGroupStatus::ActiveInvitation { .. } => Ok(()),
                status => anyhow::bail!("invitation not scanned yet: {status:?}"),
            }
        },
    )
    .await?;
    Ok(())
}
