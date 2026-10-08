use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

use ::matrix::{Matrix as FediMatrix, SendMessageData};
use anyhow::Context;
use bitcoin::secp256k1;
use fedimint_core::util::backoff_util::{FibonacciBackoff, custom_backoff};
use fedimint_core::util::retry;
use futures::{FutureExt, StreamExt};
use matrix_sdk::ruma::RoomId;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use multispend::db::MultispendScannerLastEventKey;
use multispend::{
    FinalizedGroup, GroupInvitation, GroupInvitationWithKeys, MsEventData, MultispendEvent,
    MultispendGroupVoteType,
};
use rpc_types::matrix::{RpcRoomId, RpcUserId};
use rpc_types::{RpcEventId, RpcFederationId, RpcPublicKey};
use stability_pool_client::common::{AccountId, AccountType, AccountUnchecked};

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
            .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
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
    let event = MultispendEvent::GroupInvitation {
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

    let event = MultispendEvent::GroupInvitation {
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

    let event = MultispendEvent::GroupInvitationVote {
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
                .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
                .await?
                .context("finalized group not found")
        },
    )
    .await?;
    assert_eq!(
        final_group1,
        FinalizedGroup {
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
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
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

    let event = MultispendEvent::GroupInvitation {
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
    let event = MultispendEvent::GroupInvitationVote {
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
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
        .await?;
    assert_eq!(final_group1, None);

    // Verify group is not finalized in matrix2 either
    let final_group2 = multispend_matrix2
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
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
    amount: RpcFiatAmount,
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
                .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
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
                amount,
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
    let refused_id =
        request_and_approve_withdrawal(&td1, &td2, &room_id, RpcFiatAmount(20_00)).await?;
    wait_for_withdrawal_status(bridge1, &room_id, &refused_id, |status| {
        matches!(
            status,
            multispend::WithdrawTxSubmissionStatus::Rejected { .. }
        )
    })
    .await?;
    let executed_id =
        request_and_approve_withdrawal(&td1, &td2, &room_id, RpcFiatAmount(5_00)).await?;
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
            let events =
                matrixMultispendListEvents(&bridge2.matrix, group_room_id.clone(), None, 10)
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
