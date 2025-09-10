use std::collections::{BTreeMap, BTreeSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context as _, Result};
use bitcoin::secp256k1;
use either::Either;
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy as _;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::retry;
use fedimint_derive_secret::{ChildId, DerivableSecret};
use fedimint_logging::TracingSetup;
// nosemgrep: ban-wildcard-imports
use matrix::*;
use matrix_sdk::ruma::events::room::message::MessageType;
use multispend::multispend_matrix::MultispendMatrix;
use multispend::services::MultispendServices;
use multispend::{
    FinalizedGroup, GroupInvitation, GroupInvitationWithKeys, MsEventData, MultispendEvent,
    MultispendGroupVoteType,
};
use rand::{thread_rng, Rng};
use rpc_types::matrix::MatrixInitializeStatus;
use rpc_types::{RpcEventId, RpcFederationId, RpcMediaUploadParams, RpcPublicKey};
use runtime::bridge_runtime::Runtime;
use runtime::constants::MATRIX_CHILD_ID;
use runtime::event::IEventSink;
use runtime::features::{FeatureCatalog, RuntimeEnvironment};
use runtime::storage::state::DeviceIdentifier;
use runtime::storage::{AppState, OnboardingCompletionMethod, Storage};
use stability_pool_client::common::{AccountType, AccountUnchecked};
use tempfile::TempDir;
use tokio::sync::{mpsc, watch};
use tracing::{error, info, warn};

use crate::ffi::PathBasedStorage;
use crate::test_device::MockFediApi;

const TEST_HOME_SERVER: &str = "staging.m1.8fa.in";

async fn mk_matrix_login(
    user_name: &str,
    secret: &DerivableSecret,
) -> Result<(
    Arc<Matrix>,
    Arc<MultispendMatrix>,
    mpsc::Receiver<(String, String)>,
    TempDir,
)> {
    struct TestEventSink(mpsc::Sender<(String, String)>);
    impl IEventSink for TestEventSink {
        fn event(&self, event_type: String, body: String) {
            tokio::task::block_in_place(|| self.0.blocking_send((event_type, body)).unwrap());
        }
    }

    let (event_tx, event_rx) = mpsc::channel(1000);
    let event_sink = Arc::new(TestEventSink(event_tx));
    let tmp_dir = TempDir::new()?;
    let storage = Arc::new(PathBasedStorage::new(tmp_dir.as_ref().to_path_buf()).await?) as Storage;
    let new_identifier_v2: DeviceIdentifier =
        "bridge:test:70c2ad23-bfac-4aa2-81c3-d6f5e79ae724".parse()?;
    let global_db = storage.federation_database_v2("global").await?;
    let Either::Right(onboarding) =
        AppState::load(&storage, &global_db, new_identifier_v2.clone()).await?
    else {
        panic!("must be uncommited");
    };
    let app_state = onboarding
        .complete_onboarding(
            OnboardingCompletionMethod::NewSeed,
            new_identifier_v2.clone(),
        )
        .await
        .map_err(|(_, err)| err)?;
    let runtime = Runtime::new(
        storage,
        global_db,
        event_sink,
        Arc::new(MockFediApi::default()),
        app_state,
        FeatureCatalog::new(RuntimeEnvironment::Dev).into(),
    )
    .await?;
    let runtime = Arc::new(runtime);
    let multispend_services = MultispendServices::new(runtime.clone());
    let sender = watch::Sender::new(MatrixInitializeStatus::Starting);
    let matrix = Matrix::init(
        runtime.clone(),
        tmp_dir.as_ref(),
        secret,
        user_name,
        format!("https://{TEST_HOME_SERVER}"),
        &sender,
    )
    .await?;

    let multispend_matrix = Arc::new(MultispendMatrix::new(
        matrix.client.clone(),
        runtime,
        multispend_services,
    ));
    multispend_matrix.register_message_handler();
    matrix.start_syncing();

    Ok((matrix, multispend_matrix, event_rx, tmp_dir))
}

fn mk_secret() -> DerivableSecret {
    let (key, salt): ([u8; 32], [u8; 32]) = thread_rng().r#gen();
    DerivableSecret::new_root(&key, &salt)
}

fn mk_username() -> String {
    let username = format!("tester{id}", id = rand::random::<u64>());
    info!(%username, "creating a new user for testing");
    username
}

async fn mk_matrix_new_user() -> Result<(
    Arc<Matrix>,
    Arc<MultispendMatrix>,
    mpsc::Receiver<(String, String)>,
    TempDir,
)> {
    mk_matrix_login(&mk_username(), &mk_secret()).await
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn login() -> Result<()> {
    TracingSetup::default().init().ok();
    let (_matrix, _, _event_rx, _temp_dir) = mk_matrix_new_user().await?;
    Ok(())
}

#[ignore]
#[tokio::test(flavor = "multi_thread")]
async fn send_dm() -> Result<()> {
    TracingSetup::default().init().ok();
    let (matrix1, _, mut event_rx1, _temp_dir) = mk_matrix_new_user().await?;
    let (matrix2, _, mut event_rx2, _temp_dir) = mk_matrix_new_user().await?;
    let user2 = matrix2.client.user_id().unwrap();
    let room_id = matrix1.create_or_get_dm(user2).await?;
    matrix2.room_join(&room_id).await?;
    let id_gen = AtomicU64::new(0);
    let items1 = matrix1
        .runtime
        .observable_pool
        .make_observable(
            id_gen.fetch_add(1, Ordering::Relaxed),
            matrix1.room_timeline_items(&room_id).await?,
        )
        .await?;
    let items2 = matrix2
        .runtime
        .observable_pool
        .make_observable(
            id_gen.fetch_add(1, Ordering::Relaxed),
            matrix2.room_timeline_items(&room_id).await?,
        )
        .await?;
    info!(?items1, ?items2, "### initial items");
    matrix1
        .send_message(
            &room_id,
            matrix::SendMessageData::text("hello from bridge".into()),
        )
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
        .send_message(
            &room_id,
            matrix::SendMessageData::text("hello from 2 bridge".into()),
        )
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
    TracingSetup::default().init().ok();
    let username = mk_username();
    let secret = mk_secret();
    info!("### creating users");
    let (matrix1, _, _, _temp_dir) = mk_matrix_login(&username, &secret).await?;
    let (matrix2, _, _, _temp_dir) = mk_matrix_new_user().await?;

    info!("### creating room");
    // make room
    let user2 = matrix2.client.user_id().unwrap();
    let room_id = matrix1.create_or_get_dm(user2).await?;
    matrix2.room_join(&room_id).await?;

    info!("### sending message between two users");
    matrix1
        .send_message(
            &room_id,
            matrix::SendMessageData::text("hello from user1".to_owned()),
        )
        .await?;
    matrix2
        .send_message(
            &room_id,
            matrix::SendMessageData::text("hello from user2".to_owned()),
        )
        .await?;

    info!("### recover user 1");
    let (matrix1_new, _, mut event_rx1_new, _temp_dir) =
        mk_matrix_login(&username, &secret).await?;

    matrix1_new.wait_for_room_id(&room_id).await?;
    let id_gen = AtomicU64::new(0);
    let initial_item = matrix1_new
        .runtime
        .observable_pool
        .make_observable(
            id_gen.fetch_add(1, Ordering::Relaxed),
            matrix1_new.room_timeline_items(&room_id).await?,
        )
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
    TracingSetup::default().init().ok();
    let home_server = "matrix-synapse-homeserver2.dev.fedibtc.com";
    let mnemonic = "foo bar baz".parse::<bip39::Mnemonic>().unwrap();
    let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&mnemonic);

    let password = Matrix::home_server_password(
        &root_secret.child_key(ChildId(MATRIX_CHILD_ID)),
        home_server,
    );
    info!("password: {password}");
}
