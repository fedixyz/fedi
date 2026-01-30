use std::collections::{BTreeMap, BTreeSet};

use anyhow::Context;
use bitcoin::secp256k1;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::retry;
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
