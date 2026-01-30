use std::pin::pin;

use anyhow::Context as _;
use fedimint_core::Amount;
use futures::StreamExt as _;
use rpc_types::matrix::RpcRoomId;
use rpc_types::sp_transfer::{RpcSpTransferStatus, SpMatrixTransferId};
use rpc_types::{FrontendMetadata, RpcAmount, RpcFiatAmount};

use super::*;

pub async fn test_end_to_end(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // Two devices: sender and receiver
    let td_sender = TestDevice::new().await?;
    let td_receiver = TestDevice::new().await?;
    let bridge_sender = td_sender.bridge_full().await?;
    let bridge_receiver = td_receiver.bridge_full().await?;
    let matrix_sender = td_sender.matrix().await?;
    let matrix_receiver = td_receiver.matrix().await?;

    // Join default federation for both users
    let federation_sender = td_sender.join_default_fed().await?;
    let _federation_receiver = td_receiver.join_default_fed().await?;
    let federation_id = federation_sender.rpc_federation_id();

    // Create a DM room between sender and receiver
    let room_id = matrix_sender
        .create_or_get_dm(matrix_receiver.client.user_id().unwrap())
        .await?;
    matrix_receiver.wait_for_room_id(&room_id).await?;

    // Fund the sender: receive ecash and deposit to SPv2 seek account
    let initial_balance = Amount::from_sats(500_000);
    let ecash = cli_generate_ecash(initial_balance).await?;
    receiveEcash(
        federation_sender.clone(),
        ecash,
        FrontendMetadata::default(),
    )
    .await?;
    wait_for_ecash_reissue(federation_sender).await?;

    let deposit_amount = Amount::from_sats(400_000);
    spv2DepositToSeek(
        federation_sender.clone(),
        RpcAmount(deposit_amount),
        FrontendMetadata::default(),
    )
    .await?;
    // Wait for deposit to complete (3 events: Initiated -> TxAccepted -> Success)
    loop {
        if td_sender
            .event_sink()
            .num_events_of_type("spv2Deposit".into())
            == 3
        {
            break;
        }
        fedimint_core::task::sleep_in_test(
            "waiting spv2 deposit",
            std::time::Duration::from_millis(100),
        )
        .await;
    }

    // Send SP transfer from sender to receiver
    let fiat_amount = RpcFiatAmount(10_00);
    let pending_transfer_id = matrixSpTransferSend(
        bridge_sender,
        RpcRoomId(room_id.to_string()),
        fiat_amount,
        federation_id.clone(),
        None,
    )
    .await?;

    // receiver accepts the invitation and allows sending account id
    matrixRoomJoin(bridge_receiver, room_id.clone().into()).await?;

    // user 2 is viewing the room
    // in real app this is done by frontend - paginates all dms
    let matrix_receiver = td_receiver.matrix().await?.clone();

    let room_id_clone = room_id.clone();
    bridge_receiver
        .runtime
        .task_group
        .spawn_cancellable("receiver viewing room", async move {
            tracing::info!("receiver viewing room task started");
            let mut pagination_stream = pin!(matrix_receiver
                .subscribe_timeline_items_paginate_backwards_status(&room_id_clone)
                .await
                .unwrap());
            while let Some(value) = pagination_stream.next().await {
                if let RpcBackPaginationStatus::Idle = value {
                    matrix_receiver
                        .room_timeline_items_paginate_backwards(&room_id_clone, 100)
                        .await
                        .ok();
                }
            }
        });

    // Wait for SP Transfers completion using subscribe_transfer_state on receiver
    // side
    let sp_transfers_matrix = bridge_receiver.matrix.wait_spt().await.clone();
    let mut state_stream = pin!(
        sp_transfers_matrix.subscribe_transfer_state(SpMatrixTransferId {
            room_id: room_id.clone().into(),
            event_id: pending_transfer_id,
        })
    );

    let final_state = loop {
        let state = state_stream.next().await.context("stream ended early")?;
        match state.status {
            RpcSpTransferStatus::Pending => continue,
            RpcSpTransferStatus::Complete | RpcSpTransferStatus::Failed => break state,
        }
    };

    assert_eq!(final_state.status, RpcSpTransferStatus::Complete);
    assert_eq!(final_state.amount, RpcFiatAmount(10_00));

    Ok(())
}

/// Test where receiver joins the federation AFTER receiving the transfer
/// request. This tests the AccountIdResponder triggering when the federation is
/// joined later.
pub async fn test_receiver_joins_federation_later(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // Two devices: sender and receiver
    let td_sender = TestDevice::new().await?;
    let td_receiver = TestDevice::new().await?;
    let bridge_sender = td_sender.bridge_full().await?;
    let bridge_receiver = td_receiver.bridge_full().await?;
    let matrix_sender = td_sender.matrix().await?;
    let matrix_receiver = td_receiver.matrix().await?;

    // Only sender joins the federation initially
    let federation_sender = td_sender.join_default_fed().await?;
    let federation_id = federation_sender.rpc_federation_id();

    // Create a DM room between sender and receiver
    let room_id = matrix_sender
        .create_or_get_dm(matrix_receiver.client.user_id().unwrap())
        .await?;
    matrix_receiver.wait_for_room_id(&room_id).await?;

    // Fund the sender: receive ecash and deposit to SPv2 seek account
    let initial_balance = Amount::from_sats(500_000);
    let ecash = cli_generate_ecash(initial_balance).await?;
    receiveEcash(
        federation_sender.clone(),
        ecash,
        FrontendMetadata::default(),
    )
    .await?;
    wait_for_ecash_reissue(federation_sender).await?;

    let deposit_amount = Amount::from_sats(400_000);
    spv2DepositToSeek(
        federation_sender.clone(),
        RpcAmount(deposit_amount),
        FrontendMetadata::default(),
    )
    .await?;
    // Wait for deposit to complete (3 events: Initiated -> TxAccepted -> Success)
    loop {
        if td_sender
            .event_sink()
            .num_events_of_type("spv2Deposit".into())
            == 3
        {
            break;
        }
        fedimint_core::task::sleep_in_test(
            "waiting spv2 deposit",
            std::time::Duration::from_millis(100),
        )
        .await;
    }

    // Send SP transfer from sender to receiver (receiver hasn't joined fed yet)
    let fiat_amount = RpcFiatAmount(10_00);
    let pending_transfer_id = matrixSpTransferSend(
        bridge_sender,
        RpcRoomId(room_id.to_string()),
        fiat_amount,
        federation_id.clone(),
        None,
    )
    .await?;

    // Receiver accepts the room invitation first
    matrixRoomJoin(bridge_receiver, room_id.clone().into()).await?;

    // User 2 is viewing the room (needed for event processing)
    let matrix_receiver = td_receiver.matrix().await?.clone();
    let room_id_clone = room_id.clone();
    bridge_receiver
        .runtime
        .task_group
        .spawn_cancellable("receiver viewing room", async move {
            tracing::info!("receiver viewing room task started");
            let mut pagination_stream = pin!(matrix_receiver
                .subscribe_timeline_items_paginate_backwards_status(&room_id_clone)
                .await
                .unwrap());
            while let Some(value) = pagination_stream.next().await {
                if let RpcBackPaginationStatus::Idle = value {
                    matrix_receiver
                        .room_timeline_items_paginate_backwards(&room_id_clone, 100)
                        .await
                        .ok();
                }
            }
        });

    // Give some time for room events to be processed
    fedimint_core::task::sleep_in_test(
        "waiting for room events",
        std::time::Duration::from_millis(500),
    )
    .await;

    // NOW receiver joins the federation - this should trigger AccountIdResponder
    let _federation_receiver = td_receiver.join_default_fed().await?;

    // Wait for SP Transfers completion using subscribe_transfer_state on receiver
    // side
    let sp_transfers_matrix = bridge_receiver.matrix.wait_spt().await.clone();
    let mut state_stream = pin!(
        sp_transfers_matrix.subscribe_transfer_state(SpMatrixTransferId {
            room_id: room_id.clone().into(),
            event_id: pending_transfer_id,
        })
    );

    let final_state = loop {
        let state = state_stream.next().await.context("stream ended early")?;
        match state.status {
            RpcSpTransferStatus::Pending => continue,
            RpcSpTransferStatus::Complete | RpcSpTransferStatus::Failed => break state,
        }
    };

    assert_eq!(final_state.status, RpcSpTransferStatus::Complete);
    assert_eq!(final_state.amount, RpcFiatAmount(10_00));

    Ok(())
}
