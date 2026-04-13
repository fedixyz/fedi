use std::collections::{BTreeSet, HashMap};
use std::pin::pin;

use ::matrix::{RpcMsgLikeKind, SendMessageData};
use bitcoin::hashes::sha256;
use eyeball_im::VectorDiff;
use fedimint_core::BitcoinHash;
use futures::future::try_join;
use futures::{Stream, StreamExt};
use imbl::Vector;
use matrix_sdk::ruma::events::room::message::MessageType;
use matrix_sdk::timeout::timeout;
use rand::rngs::SmallRng;
use rand::{RngCore as _, SeedableRng as _};
use rpc_types::error::ErrorCode;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{RpcEventId, RpcMediaUploadParams};
use tracing::warn;

use super::*;

pub async fn test_matrix_login(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
    let bridge = td.bridge_full().await?;

    // Wait for matrix to initialize
    let _matrix = bridge.matrix.wait().await;

    // If we get here, matrix login was successful
    Ok(())
}

pub async fn test_matrix_access_token_expiry_repro(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let m1 = td1.matrix().await?;
    let m2 = td2.matrix().await?;
    let user2 = m2.client.user_id().unwrap();
    let room_id = m1.create_or_get_dm(user2).await?;

    m2.wait_for_room_id(&room_id).await?;
    m2.room_join(&room_id).await?;

    // Establish a known-good Matrix write before expiry.
    m1.send_message(
        &room_id,
        SendMessageData::text("matrix-expiry-repro-before".to_owned()),
    )
    .await?;

    sleep_in_test(
        "wait for matrix access token to expire",
        Duration::from_secs(25),
    )
    .await;

    m1.room_set_name(&room_id, "matrix-expiry-repro-after".to_owned())
        .await?;

    Ok(())
}

fn apply_diffs<T: Clone>(v: &mut Vector<T>, diffs: Vec<VectorDiff<T>>) {
    for diff in diffs {
        diff.apply(v);
    }
}
async fn apply_diffs_continuously<T: Clone>(
    timeline: &mut Vector<T>,
    mut items: impl Stream<Item = Vec<VectorDiff<T>>> + Unpin,
) {
    while let Some(diffs) = items.next().await {
        apply_diffs(timeline, diffs);
    }
}
async fn apply_diffs_until<T: Clone>(
    timeline: &mut Vector<T>,
    items: &mut (impl Stream<Item = Vec<VectorDiff<T>>> + Unpin),
    condition: impl Fn(&Vector<T>) -> bool,
) {
    while let Some(diffs) = items.next().await {
        apply_diffs(timeline, diffs);
        if condition(timeline) {
            return;
        }
    }
}

fn extract_text_from_item(item: &RpcTimelineItem) -> Option<String> {
    match item {
        RpcTimelineItem::Event(event) => match &event.content {
            RpcMsgLikeKind::Text(txt_like) => Some(txt_like.body.to_string()),
            RpcMsgLikeKind::Payment(payment) => Some(payment.body.to_string()),
            RpcMsgLikeKind::Unknown => None,
            RpcMsgLikeKind::UnableToDecrypt => Some("<unable-to-decrypt>".to_string()),
            other => unimplemented!("implement {other:?}"),
        },
        _ => None,
    }
}

fn timeline_as_text(items: &Vector<RpcTimelineItem>) -> Vec<Option<String>> {
    items.iter().map(extract_text_from_item).collect()
}

pub async fn test_matrix_dms(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let m1 = td1.matrix().await?;
    let m2 = td2.matrix().await?;
    let user2 = m2.client.user_id().unwrap();
    let room_id = m1.create_or_get_dm(user2).await?;
    let num_messages = 50;

    m2.wait_for_room_id(&room_id).await?;
    m2.room_join(&room_id).await?;

    let (timeline1, timeline2) = try_join(
        // user 1
        async {
            let items1 = pin!(m1.room_timeline_items(&room_id).await?);
            for i in 0..num_messages {
                m1.send_message(&room_id, SendMessageData::text(format!("#{i}")))
                    .await?;
            }

            let mut timeline1 = imbl::Vector::new();
            timeout(
                apply_diffs_continuously(&mut timeline1, items1),
                Duration::from_secs(10),
            )
            .await
            .ok();

            anyhow::Ok(timeline_as_text(&timeline1))
        },
        // user 2 is viewing the room
        async {
            sleep_in_test(
                "open the timeline after few message have been sent",
                Duration::from_secs(5),
            )
            .await;
            let mut items2 = pin!(m2.room_timeline_items(&room_id).await?);
            let mut timeline2 = imbl::Vector::new();
            timeout(
                try_join(
                    async {
                        apply_diffs_continuously(&mut timeline2, &mut items2).await;
                        anyhow::Ok(())
                    },
                    // keep scrolling to top
                    async {
                        let mut pagination_stream = pin!(
                            m2.subscribe_timeline_items_paginate_backwards_status(&room_id)
                                .await?
                        );
                        while let Some(value) = pagination_stream.next().await {
                            if let RpcBackPaginationStatus::Idle = value {
                                m2.room_timeline_items_paginate_backwards(&room_id, 100)
                                    .await?;
                            }
                        }

                        Ok(())
                    },
                ),
                Duration::from_secs(20),
            )
            .await
            .ok();

            anyhow::Ok(timeline_as_text(&timeline2))
        },
    )
    .await?;

    let timeline1_messages: Vec<String> = timeline1
        .into_iter()
        .flatten()
        .filter(|t| t.starts_with('#'))
        .collect();

    let timeline2_messages: Vec<String> = timeline2
        .into_iter()
        .flatten()
        .filter(|t| t.starts_with('#'))
        .collect();

    assert_eq!(timeline1_messages, timeline2_messages);
    assert_eq!(timeline1_messages.len(), num_messages);
    Ok(())
}

pub async fn test_matrix_recovery(_dev_fed: DevFed) -> anyhow::Result<()> {
    let mut td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let m1 = td1.matrix().await?;
    let m2 = td2.matrix().await?;
    let user2 = m2.client.user_id().unwrap();
    let room_id = m1.create_or_get_dm(user2).await?;
    m2.wait_for_room_id(&room_id).await?;
    m2.room_join(&room_id).await?;

    m1.send_message(
        &room_id,
        SendMessageData::text("hello from user1".to_owned()),
    )
    .await?;
    m2.send_message(
        &room_id,
        SendMessageData::text("hello from user2".to_owned()),
    )
    .await?;

    sleep_in_test(
        "matrix needs some time to upload room keys",
        Duration::from_secs(10),
    )
    .await;
    let mnemonic = getMnemonic(td1.bridge_full().await?.runtime.clone()).await?;
    td1.shutdown().await?;

    let td1_recovered = TestDevice::new().await?;
    let bridge = td1_recovered.bridge_maybe_onboarding().await?;
    restoreMnemonic(bridge.try_get()?, mnemonic).await?;
    onboardTransferExistingDeviceRegistration(bridge.try_get()?, 0).await?;

    let m1_recovered = td1_recovered.matrix().await?;
    m1_recovered.wait_for_room_id(&room_id).await?;

    let mut items = pin!(m1_recovered.room_timeline_items(&room_id).await?);
    let mut timeline = imbl::Vector::new();
    timeout(
        try_join(
            async {
                apply_diffs_continuously(&mut timeline, &mut items).await;
                anyhow::Ok(())
            },
            // keep scrolling to top
            async {
                let mut pagination_stream = pin!(
                    m1_recovered
                        .subscribe_timeline_items_paginate_backwards_status(&room_id)
                        .await?
                );
                while let Some(value) = pagination_stream.next().await {
                    if let RpcBackPaginationStatus::Idle = value {
                        m1_recovered
                            .room_timeline_items_paginate_backwards(&room_id, 100)
                            .await?;
                    }
                }

                Ok(())
            },
        ),
        Duration::from_secs(10),
    )
    .await
    .ok();

    let timeline_text = timeline_as_text(&timeline);
    assert!(timeline_text
        .iter()
        .any(|t| t.as_deref() == Some("hello from user1")));
    assert!(timeline_text
        .iter()
        .any(|t| t.as_deref() == Some("hello from user2")));

    Ok(())
}

pub async fn test_matrix_create_room(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
    let matrix = td.matrix().await?;
    let mut request = ::matrix::create_room::Request::default();
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

pub async fn test_send_and_download_attachment(_dev_fed: DevFed) -> anyhow::Result<()> {
    let file_size = std::env::var("MATRIX_TEST_FILE_SIZE_MB")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(1) // 1MB default
        * 1024
        * 1024;

    info!("Testing matrix file upload with file size: {}B", file_size);

    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let matrix = td1.matrix().await?;
    let matrix2 = td2.matrix().await?;

    // Create a room
    let room_id = matrix
        .create_or_get_dm(matrix2.client.user_id().unwrap())
        .await?;

    // Prepare attachment data
    let filename = "test.txt".to_string();
    let mime_type = "text/plain".to_string();

    // Generate random file content using SmallRng
    let mut rng = SmallRng::from_entropy();
    let mut data = vec![0u8; file_size];
    rng.fill_bytes(&mut data);
    let data_hash = sha256::Hash::hash(&data);

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
            data,
        )
        .await?;
    sleep_in_test("wait for attachment to be sent", Duration::from_millis(100)).await;

    if fedimint_core::envs::is_env_var_set("MATRIX_TEST_SKIP_DOWNLOAD") {
        return Ok(());
    }
    let timeline = matrix.timeline(&room_id).await?;
    let event_id = timeline
        .latest_event_id()
        .await
        .context("expected last event id")?;
    let event = timeline
        .item_by_event_id(&event_id)
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
        sha256::Hash::hash(&downloaded_data),
        data_hash,
        "Downloaded data does not match original data"
    );

    Ok(())
}

pub async fn test_matrix_pinned_messages(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td1 = TestDevice::new().await?;
    let td2 = TestDevice::new().await?;
    let bridge1 = td1.bridge_full().await?;
    let m1 = td1.matrix().await?;
    let m2 = td2.matrix().await?;
    let user2 = m2.client.user_id().unwrap();
    let room_id = m1.create_or_get_dm(user2).await?;
    let rpc_room_id = || RpcRoomId(room_id.to_string());

    m2.wait_for_room_id(&room_id).await?;
    m2.room_join(&room_id).await?;

    // Send 8 messages from user1 (msg1 is a xyz.fedi.payment, rest are plain text)
    let payment_msg: SendMessageData = serde_json::from_value(serde_json::json!({
        "msgtype": "xyz.fedi.payment",
        "body": "msg1",
        "data": {
            "status": "pushed",
            "paymentId": "test-payment-id",
            "amount": 1000
        }
    }))
    .unwrap();
    m1.send_message(&room_id, payment_msg).await?;
    for i in 2..=8 {
        m1.send_message(&room_id, SendMessageData::text(format!("msg{i}")))
            .await?;
    }

    // Wait for messages to sync to user2 by polling timeline
    let sdk_timeline = m2.timeline(&room_id).await?;
    let (initial, mut msg_stream) = sdk_timeline.subscribe().await;
    let mut items_vec = initial;
    apply_diffs_until(&mut items_vec, &mut msg_stream, |items| {
        let message_bodies = items
            .iter()
            .filter_map(|item| {
                item.as_event()?
                    .content()
                    .as_message()
                    .map(|message| message.body().to_owned())
            })
            .collect::<BTreeSet<_>>();
        (1..=8).all(|i| message_bodies.contains(&format!("msg{i}")))
    })
    .await;
    let message_event_ids: HashMap<_, _> = items_vec
        .iter()
        .filter_map(|item| {
            let event = item.as_event()?;
            let body = event.content().as_message()?.body().to_owned();
            let event_id = event.event_id()?.to_owned();
            Some((body, event_id))
        })
        .collect();
    let msg_ids: Vec<_> = (1..=8)
        .map(|i| {
            let body = format!("msg{i}");
            message_event_ids
                .get(&body)
                .cloned()
                .with_context(|| format!("expected event id for message body {body}"))
        })
        .collect::<anyhow::Result<_>>()?;

    // Regression test: pinned timeline subscription must work without first
    // opening the room's regular timeline.
    let mut stream = pin!(m1.room_pinned_timeline_items(&room_id).await?);
    let mut pinned = imbl::Vector::new();

    // Pin message 1 → should succeed (via RPC)
    matrixRoomPinMessage(
        &bridge1.matrix,
        rpc_room_id(),
        RpcEventId(msg_ids[0].to_string()),
    )
    .await?;

    // Wait for msg1 to appear in the pinned timeline
    apply_diffs_until(&mut pinned, &mut stream, |items| {
        timeline_as_text(items)
            .iter()
            .flatten()
            .any(|t| t == "msg1")
    })
    .await;
    let texts: Vec<String> = timeline_as_text(&pinned).into_iter().flatten().collect();
    assert!(
        texts.contains(&"msg1".to_string()),
        "Expected msg1 in pinned timeline, got: {texts:?}"
    );

    // Pin message 2 (via RPC)
    matrixRoomPinMessage(
        &bridge1.matrix,
        rpc_room_id(),
        RpcEventId(msg_ids[1].to_string()),
    )
    .await?;

    // Wait for msg2 to appear
    apply_diffs_until(&mut pinned, &mut stream, |items| {
        timeline_as_text(items)
            .iter()
            .flatten()
            .any(|t| t == "msg2")
    })
    .await;

    // Unpin message 1 (via RPC)
    matrixRoomUnpinMessage(
        &bridge1.matrix,
        rpc_room_id(),
        RpcEventId(msg_ids[0].to_string()),
    )
    .await?;

    // Wait for msg1 to disappear from pinned timeline
    apply_diffs_until(&mut pinned, &mut stream, |items| {
        !timeline_as_text(items)
            .iter()
            .flatten()
            .any(|t| t == "msg1")
    })
    .await;

    let texts: Vec<String> = timeline_as_text(&pinned).into_iter().flatten().collect();
    assert!(
        texts.contains(&"msg2".to_string()),
        "Expected msg2 in pinned timeline, got: {texts:?}"
    );
    assert!(
        !texts.contains(&"msg1".to_string()),
        "msg1 should not be in pinned timeline after unpin, got: {texts:?}"
    );

    // Pin messages 3-8 via RPC (6 more pins, total 7 with msg2)
    for (i, id) in msg_ids[2..8].iter().enumerate() {
        matrixRoomPinMessage(&bridge1.matrix, rpc_room_id(), RpcEventId(id.to_string())).await?;
        // Wait for pinned timeline to reflect the new pin
        let expected_count = 1 + i + 1; // msg2 (1) + however many of msgs 3-8 we've pinned
        apply_diffs_until(&mut pinned, &mut stream, |items| {
            items
                .iter()
                .filter(|item| matches!(item, RpcTimelineItem::Event(_)))
                .count()
                >= expected_count
        })
        .await;
    }

    // Try to pin msg1 (8th pin) via RPC → PinnedMessageLimitExceeded
    let err = matrixRoomPinMessage(
        &bridge1.matrix,
        rpc_room_id(),
        RpcEventId(msg_ids[0].to_string()),
    )
    .await
    .unwrap_err();
    assert_eq!(
        err.downcast_ref::<ErrorCode>(),
        Some(&ErrorCode::PinnedMessageLimitExceeded),
        "Expected PinnedMessageLimitExceeded, got: {err:?}"
    );

    // Idempotent: re-pin already-pinned msg2 via RPC → should succeed
    matrixRoomPinMessage(
        &bridge1.matrix,
        rpc_room_id(),
        RpcEventId(msg_ids[1].to_string()),
    )
    .await?;

    Ok(())
}
