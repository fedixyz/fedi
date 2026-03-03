use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

use ::matrix::{Matrix as FediMatrix, SendMessageData};
use anyhow::Context;
use bitcoin::secp256k1;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::retry;
use futures::FutureExt;
use matrix_sdk::ruma::RoomId;
use multispend::{
    FinalizedGroup, GroupInvitation, GroupInvitationWithKeys, MsEventData, MultispendEvent,
    MultispendGroupVoteType,
};
use rpc_types::matrix::{RpcRoomId, RpcUserId};
use rpc_types::{RpcEventId, RpcFederationId, RpcPublicKey};
use stability_pool_client::common::{AccountType, AccountUnchecked};

use super::*;

const MOCK_FEDERATION_INVITE_CODE: &str = "fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75";
const MOCK_FEDERATION_ID: &str = "15db8cb4f1ec8e484d73b889372bec94812580f929e8148b7437d359af422cd3";

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
    assert!(multispend_matrix
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
        .await?
        .is_none());

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
    error!("SENDING MESSAGE");
    multispend_matrix
        .send_multispend_event(&room_id, event)
        .await?;
    error!("SENT MESSAGE");
    multispend_matrix.rescanner.wait_for_scanned(&room_id).await;
    error!("DONE SCANNING");

    // Test event data
    let timeline = matrix.timeline(&room_id).await?;
    let last_event = timeline.latest_event().await.unwrap();
    let event_id = last_event.event_id().unwrap();
    let event_data = multispend_matrix
        .get_multispend_event_data(
            &RpcRoomId(room_id.to_string()),
            &RpcEventId(event_id.to_string()),
        )
        .await;
    assert!(event_data.is_some());

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

    multispend_matrix1
        .rescanner
        .wait_for_scanned(&room_id)
        .await;
    multispend_matrix2
        .rescanner
        .wait_for_scanned(&room_id)
        .await;

    let timeline = matrix1.timeline(&room_id).await?;
    let last_event = timeline.latest_event().await.unwrap();
    let invitation_event_id = RpcEventId(last_event.event_id().unwrap().to_string());

    let event_data1 = multispend_matrix1
        .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
        .await;

    assert_eq!(
        event_data1,
        Some(MsEventData::GroupInvitation(GroupInvitationWithKeys {
            proposer: user1.clone(),
            invitation: invitation.clone(),
            pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
            rejections: BTreeSet::new(),
            federation_id: RpcFederationId(MOCK_FEDERATION_ID.into())
        }))
    );
    let event_data2 = retry(
        "wait for user2 to receive",
        aggressive_backoff(),
        || async {
            multispend_matrix2
                .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
                .await
                .context("event not found")
        },
    )
    .await?;
    assert_eq!(event_data1, Some(event_data2));

    let event = MultispendEvent::GroupInvitationVote {
        invitation: invitation_event_id.clone(),
        vote: MultispendGroupVoteType::Accept {
            member_pubkey: RpcPublicKey(pk2),
        },
    };
    multispend_matrix2
        .send_multispend_event(&room_id, event)
        .await?;

    multispend_matrix1
        .rescanner
        .wait_for_scanned(&room_id)
        .await;
    multispend_matrix2
        .rescanner
        .wait_for_scanned(&room_id)
        .await;

    // Verify group is finalized in matrix1
    let final_group1 = retry(
        "wait for group to be finalized",
        aggressive_backoff(),
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

    multispend_matrix1
        .rescanner
        .wait_for_scanned(&room_id)
        .await;
    multispend_matrix2
        .rescanner
        .wait_for_scanned(&room_id)
        .await;

    let timeline = matrix1.timeline(&room_id).await?;
    let last_event = timeline.latest_event().await.unwrap();
    let invitation_event_id = RpcEventId(last_event.event_id().unwrap().to_string());

    let event_data1 = multispend_matrix1
        .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
        .await;

    assert_eq!(
        event_data1,
        Some(MsEventData::GroupInvitation(GroupInvitationWithKeys {
            proposer: user1.clone(),
            invitation: invitation.clone(),
            pubkeys: BTreeMap::from_iter([(user1.clone(), RpcPublicKey(pk1))]),
            rejections: BTreeSet::new(),
            federation_id: RpcFederationId(MOCK_FEDERATION_ID.into())
        }))
    );

    let event_data2 = retry(
        "wait for user2 to receive",
        aggressive_backoff(),
        || async {
            multispend_matrix2
                .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
                .await
                .context("event not found")
        },
    )
    .await?;
    assert_eq!(event_data1, Some(event_data2));

    // Send rejection from user2
    let event = MultispendEvent::GroupInvitationVote {
        invitation: invitation_event_id.clone(),
        vote: MultispendGroupVoteType::Reject,
    };
    multispend_matrix2
        .send_multispend_event(&room_id, event)
        .await?;

    multispend_matrix1
        .rescanner
        .wait_for_scanned(&room_id)
        .await;
    multispend_matrix2
        .rescanner
        .wait_for_scanned(&room_id)
        .await;

    // Verify invitation state has the rejection recorded
    let event_data1 = retry(
        "wait for rejection to be recorded",
        aggressive_backoff(),
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
    const SHRINK_NUDGE_ATTEMPTS: usize = 30;
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
        let (loaded_events, subscription) = room_event_cache.subscribe().await;
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
        tokio::time::sleep(Duration::from_millis(100)).await;
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
                let (_loaded_events, subscription) = room_event_cache_clone.subscribe().await;
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
