use std::collections::{BTreeMap, BTreeSet};
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context as _, Result};
use bitcoin::secp256k1;
use bridge_inner::matrix::multispend::MultispendGroupVoteType;
// nosemgrep: ban-wildcard-imports
use bridge_inner::matrix::*;
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy as _;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::retry;
use fedimint_derive_secret::{ChildId, DerivableSecret};
use fedimint_logging::TracingSetup;
use matrix_sdk::ruma::events::room::message::MessageType;
use multispend::services::MultispendServices;
use multispend::{
    FinalizedGroup, GroupInvitation, GroupInvitationWithKeys, MsEventData, MultispendEvent,
};
use rand::{thread_rng, Rng};
use rpc_types::{RpcEventId, RpcFederationId, RpcMediaUploadParams, RpcPublicKey};
use runtime::bridge_runtime::Runtime;
use runtime::constants::MATRIX_CHILD_ID;
use runtime::event::IEventSink;
use runtime::features::{FeatureCatalog, RuntimeEnvironment};
use stability_pool_client::common::{AccountType, AccountUnchecked};
use tempfile::TempDir;
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::ffi::PathBasedStorage;
use crate::test_device::MockFediApi;

const TEST_HOME_SERVER: &str = "staging.m1.8fa.in";
const TEST_SLIDING_SYNC: &str = "https://staging.sliding.m1.8fa.in";

async fn mk_matrix_login(
    user_name: &str,
    secret: &DerivableSecret,
) -> Result<(Arc<Matrix>, mpsc::Receiver<(String, String)>, TempDir)> {
    struct TestEventSink(mpsc::Sender<(String, String)>);
    impl IEventSink for TestEventSink {
        fn event(&self, event_type: String, body: String) {
            tokio::task::block_in_place(|| self.0.blocking_send((event_type, body)).unwrap());
        }
    }

    let (event_tx, event_rx) = mpsc::channel(1000);
    let event_sink = Arc::new(TestEventSink(event_tx));
    let tmp_dir = TempDir::new()?;
    let storage = PathBasedStorage::new(tmp_dir.as_ref().to_path_buf()).await?;
    let runtime = Runtime::new(
        Arc::new(storage),
        event_sink,
        Arc::new(MockFediApi::default()),
        FromStr::from_str("bridge:test:70c2ad23-bfac-4aa2-81c3-d6f5e79ae724")?,
        FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
    )
    .await?;
    let runtime = Arc::new(runtime);
    let multispend_services = MultispendServices::new(runtime.clone());
    let matrix = Matrix::init(
        runtime,
        tmp_dir.as_ref(),
        secret,
        user_name,
        format!("https://{TEST_HOME_SERVER}"),
        TEST_SLIDING_SYNC.to_string(),
        multispend_services,
    )
    .await?;
    Ok((matrix, event_rx, tmp_dir))
}

fn mk_secret() -> DerivableSecret {
    let (key, salt): ([u8; 32], [u8; 32]) = thread_rng().gen();
    DerivableSecret::new_root(&key, &salt)
}

fn mk_username() -> String {
    let username = format!("tester{id}", id = rand::random::<u64>());
    info!(%username, "creating a new user for testing");
    username
}

async fn mk_matrix_new_user() -> Result<(Arc<Matrix>, mpsc::Receiver<(String, String)>, TempDir)> {
    mk_matrix_login(&mk_username(), &mk_secret()).await
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn login() -> Result<()> {
    TracingSetup::default().init().unwrap();
    let (_matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn send_dm() -> Result<()> {
    TracingSetup::default().init().unwrap();
    let (matrix1, mut event_rx1, _temp_dir) = mk_matrix_new_user().await?;
    let (matrix2, mut event_rx2, _temp_dir) = mk_matrix_new_user().await?;
    let user2 = matrix2.client.user_id().unwrap();
    let room_id = matrix1.create_or_get_dm(user2).await?;
    matrix2.room_join(&room_id).await?;
    let id_gen = AtomicU64::new(0);
    let items1 = matrix1
        .room_timeline_items(id_gen.fetch_add(1, Ordering::Relaxed), &room_id)
        .await?;
    let items2 = matrix2
        .room_timeline_items(id_gen.fetch_add(1, Ordering::Relaxed), &room_id)
        .await?;
    info!(?items1, ?items2, "### initial items");
    matrix1
        .send_message_text(&room_id, "hello from bridge".into())
        .await?;
    info!("waiting for server to echo back the message");
    while let Some((ev, body)) = event_rx2.recv().await {
        info!("### event2: {ev} {body}");
        if ev == "observableUpdate"
            && body.contains(r#""localEcho":false"#)
            && body.contains("hello from bridge")
        {
            break;
        }
    }
    matrix2
        .send_message_text(&room_id, "hello from 2 bridge".into())
        .await?;
    info!("waiting for server to echo back the message");
    while let Some((ev, body)) = event_rx1.recv().await {
        info!("### event1: {ev} {body}");
        if ev == "observableUpdate"
            && body.contains(r#""localEcho":false"#)
            && body.contains("hello from 2 bridge")
        {
            break;
        }
    }

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn test_recovery() -> Result<()> {
    TracingSetup::default().init().unwrap();
    let username = mk_username();
    let secret = mk_secret();
    info!("### creating users");
    let (matrix1, _, _temp_dir) = mk_matrix_login(&username, &secret).await?;
    let (matrix2, _, _temp_dir) = mk_matrix_new_user().await?;

    info!("### creating room");
    // make room
    let user2 = matrix2.client.user_id().unwrap();
    let room_id = matrix1.create_or_get_dm(user2).await?;
    matrix2.room_join(&room_id).await?;

    info!("### sending message between two users");
    matrix1
        .send_message_text(&room_id, "hello from user1".to_owned())
        .await?;
    matrix2
        .send_message_text(&room_id, "hello from user2".to_owned())
        .await?;

    info!("### recover user 1");
    let (matrix1_new, mut event_rx1_new, _temp_dir) = mk_matrix_login(&username, &secret).await?;

    matrix1_new.wait_for_room_id(&room_id).await?;
    let id_gen = AtomicU64::new(0);
    let initial_item = matrix1_new
        .room_timeline_items(id_gen.fetch_add(1, Ordering::Relaxed), &room_id)
        .await?;
    info!("### waiting for user 2 message");
    if !serde_json::to_string(&initial_item)?.contains("hello from user2") {
        while let Some((ev, body)) = event_rx1_new.recv().await {
            info!("### event1_new: {ev} {body}");
            if ev == "observableUpdate"
                && body.contains(r#""localEcho":false"#)
                && body.contains("hello from user2")
            {
                break;
            }
        }
    }
    info!("### waiting for user 1 message");
    if !serde_json::to_string(&initial_item)?.contains("hello from user1") {
        while let Some((ev, body)) = event_rx1_new.recv().await {
            info!("### event1_new: {ev} {body}");
            if ev == "observableUpdate"
                && body.contains(r#""localEcho":false"#)
                && body.contains("hello from user1")
            {
                break;
            }
        }
    }
    info!("### got all messages");
    Ok(())
}

#[test]
#[ignore]
fn matrix_password() {
    TracingSetup::default().init().unwrap();
    let home_server = "matrix-synapse-homeserver2.dev.fedibtc.com";
    let mnemonic = "foo bar baz".parse::<bip39::Mnemonic>().unwrap();
    let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&mnemonic);

    let password = Matrix::home_server_password(
        &root_secret.child_key(ChildId(MATRIX_CHILD_ID)),
        home_server,
    );
    info!("password: {password}");
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn test_create_room() -> Result<()> {
    TracingSetup::default().init().unwrap();
    let (matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
    let mut request = create_room::Request::default();
    let room_name = "my name is one".to_string();
    request.name = Some(room_name.clone());
    let room_id = matrix.room_create(request).await?;
    let room = matrix.room(&room_id).await?;
    while room.name() != Some(room_name.clone()) {
        warn!("## WAITING");
        fedimint_core::runtime::sleep(Duration::from_millis(100)).await;
    }
    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn test_send_and_download_attachment() -> Result<()> {
    TracingSetup::default().init().unwrap();
    let (matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
    let (matrix2, _event_rx, _temp_dir) = mk_matrix_new_user().await?;

    // Create a room
    let room_id = matrix
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;

    // Prepare attachment data
    let filename = "test.txt".to_string();
    let mime_type = "text/plain".to_string();
    let data = b"Hello, World!".to_vec();

    // Send attachment
    matrix
        .send_attachment(
            &room_id,
            filename.clone(),
            RpcMediaUploadParams {
                mime_type,
                width: None,
                height: None,
            },
            data.clone(),
        )
        .await?;
    fedimint_core::task::sleep(Duration::from_millis(100)).await;

    let timeline = matrix.timeline(&room_id).await?;
    let event = timeline
        .latest_event()
        .await
        .context("expected last event")?;
    let source = match event.content().as_message().unwrap().msgtype() {
        MessageType::File(f) => f.source.clone(),
        _ => unreachable!(),
    };

    // Download the file
    let downloaded_data = matrix.download_file(source).await?;

    // Assert that the downloaded data matches the original data
    assert_eq!(
        downloaded_data, data,
        "Downloaded data does not match original data"
    );

    Ok(())
}

const MOCK_FEDERATION_INVITE_CODE: &str = "fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75";
const MOCK_FEDERATION_ID: &str = "15db8cb4f1ec8e484d73b889372bec94812580f929e8148b7437d359af422cd3";
#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn test_multispend_minimal() -> Result<()> {
    TracingSetup::default()
        .with_directive("fediffi=trace")
        .init()
        .ok();
    let (matrix, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
    let (matrix2, _event_rx, _temp_dir) = mk_matrix_new_user().await?;

    // Create a room
    let room_id = matrix
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;

    // Test initial state
    assert!(matrix
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
    matrix.send_multispend_event(&room_id, event).await?;
    error!("SENT MESSAGE");
    matrix.rescanner.wait_for_scanned(&room_id).await;
    error!("DONE SCANNING");

    // Test event data
    let timeline = matrix.timeline(&room_id).await?;
    let last_event = timeline.latest_event().await.unwrap();
    let event_id = last_event.event_id().unwrap();
    let event_data = matrix
        .get_multispend_event_data(
            &RpcRoomId(room_id.to_string()),
            &RpcEventId(event_id.to_string()),
        )
        .await;
    assert!(event_data.is_some());

    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn test_multispend_group_acceptance() -> Result<()> {
    TracingSetup::default()
        .with_directive("fediffi=trace")
        .init()
        .ok();
    let (matrix1, _event_rx1, _temp_dir1) = mk_matrix_new_user().await?;
    let (matrix2, _event_rx2, _temp_dir2) = mk_matrix_new_user().await?;

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
    matrix1.send_multispend_event(&room_id, event).await?;

    matrix1.rescanner.wait_for_scanned(&room_id).await;
    matrix2.rescanner.wait_for_scanned(&room_id).await;

    let timeline = matrix1.timeline(&room_id).await?;
    let last_event = timeline.latest_event().await.unwrap();
    let invitation_event_id = RpcEventId(last_event.event_id().unwrap().to_string());

    let event_data1 = matrix1
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
            matrix2
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
    matrix2.send_multispend_event(&room_id, event).await?;

    matrix1.rescanner.wait_for_scanned(&room_id).await;
    matrix2.rescanner.wait_for_scanned(&room_id).await;

    // Verify group is finalized in matrix1
    let final_group1 = retry(
        "wait for group to be finalized",
        aggressive_backoff(),
        || async {
            matrix1
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
    let final_group2 = matrix2
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
        .await?;

    assert_eq!(Some(final_group1), final_group2);
    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn test_multispend_group_rejection() -> Result<()> {
    TracingSetup::default()
        .with_directive("fediffi=trace")
        .init()
        .ok();
    let (matrix1, _event_rx1, _temp_dir1) = mk_matrix_new_user().await?;
    let (matrix2, _event_rx2, _temp_dir2) = mk_matrix_new_user().await?;

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
    matrix1.send_multispend_event(&room_id, event).await?;

    matrix1.rescanner.wait_for_scanned(&room_id).await;
    matrix2.rescanner.wait_for_scanned(&room_id).await;

    let timeline = matrix1.timeline(&room_id).await?;
    let last_event = timeline.latest_event().await.unwrap();
    let invitation_event_id = RpcEventId(last_event.event_id().unwrap().to_string());

    let event_data1 = matrix1
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
            matrix2
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
    matrix2.send_multispend_event(&room_id, event).await?;

    matrix1.rescanner.wait_for_scanned(&room_id).await;
    matrix2.rescanner.wait_for_scanned(&room_id).await;

    // Verify invitation state has the rejection recorded
    let event_data1 = retry(
        "wait for rejection to be recorded",
        aggressive_backoff(),
        || async {
            let data = matrix1
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
    let event_data2 = matrix2
        .get_multispend_event_data(&RpcRoomId(room_id.to_string()), &invitation_event_id)
        .await;
    assert_eq!(Some(event_data1), event_data2);

    // Verify group is not finalized in matrix1
    let final_group1 = matrix1
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
        .await?;
    assert_eq!(final_group1, None);

    // Verify group is not finalized in matrix2 either
    let final_group2 = matrix2
        .get_multispend_finalized_group(RpcRoomId(room_id.to_string()))
        .await?;
    assert_eq!(final_group2, None);

    Ok(())
}
