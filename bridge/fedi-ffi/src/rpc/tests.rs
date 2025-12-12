use std::collections::{BTreeMap, HashMap};
use std::ops::ControlFlow;
use std::panic;
use std::path::Path;
use std::str::{self, FromStr};
use std::sync::Once;
use std::thread::available_parallelism;
use std::time::Duration;

use anyhow::{anyhow, bail};
use api_types::invoice_generator::FirstCommunityInviteCodeState;
use bridge::RuntimeExt as _;
use devi::DevFed;
use devimint::cmd;
use devimint::util::{FedimintCli, LnCli};
use federations::federation_sm::FederationState;
use federations::federation_v2::FederationV2;
use fedi_social_client::common::VerificationDocument;
use fedimint_core::db::IDatabaseTransactionOpsCore;
use fedimint_core::encoding::Encodable;
use fedimint_core::task::sleep_in_test;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::{retry, BoxFuture};
use fedimint_core::Amount;
use fedimint_logging::TracingSetup;
use nostr::nips::nip44;
use rpc_types::communities::{CommunityInvite, CommunityInviteV1};
use rpc_types::event::TransactionEvent;
use rpc_types::{
    RpcLnReceiveState, RpcOOBReissueState, RpcOnchainDepositState, RpcReturningMemberStatus,
    RpcSPV2TransferInState, RpcTransactionDirection, RpcTransactionKind,
};
use runtime::constants::{COMMUNITY_V1_TO_V2_MIGRATION_KEY, FEDI_FILE_V0_PATH, MILLION};
use runtime::db::BridgeDbPrefix;
use runtime::envs::USE_UPSTREAM_FEDIMINTD_ENV;
use runtime::storage::state::CommunityJson;
use runtime::storage::BRIDGE_DB_PREFIX;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tracing::info;

mod matrix;
mod multispend_tests;
mod nostr_tests;
mod sp_transfer_tests;
mod utils;

// nosemgrep: ban-wildcard-imports
use crate::rpc::*;
use crate::test_device::{use_lnd_gateway, MockFediApi, TestDevice};

static INIT_TRACING: Once = Once::new();

fn get_fixture_dir() -> PathBuf {
    std::env::current_dir().unwrap().join("../fixtures")
}

async fn amount_from_ecash(ecash_string: String) -> anyhow::Result<fedimint_core::Amount> {
    if let Ok(ecash) = fedimint_mint_client::OOBNotes::from_str(&ecash_string) {
        Ok(ecash.total_amount())
    } else {
        bail!("failed to parse ecash")
    }
}

async fn cli_generate_ecash(amount: fedimint_core::Amount) -> anyhow::Result<String> {
    let ecash_string = cmd!(
        FedimintCli,
        "spend",
        "--allow-overpay",
        amount.msats.to_string()
    )
    .out_json()
    .await?["notes"]
        .as_str()
        .map(|s| s.to_owned())
        .expect("'note' key not found generating ecash with fedimint-cli");
    Ok(ecash_string)
}

async fn cli_generate_invoice(amount: &Amount) -> anyhow::Result<(Bolt11Invoice, String)> {
    let label = format!("bridge-tests-{}", rand::random::<u128>());
    let invoice_string = cmd!(LnCli, "invoice", amount.msats, &label, &label)
        .out_json()
        .await?["bolt11"]
        .as_str()
        .map(|s| s.to_owned())
        .unwrap();
    Ok((Bolt11Invoice::from_str(&invoice_string)?, label))
}

async fn cli_receive_ecash(ecash: String) -> anyhow::Result<()> {
    cmd!(FedimintCli, "reissue", ecash).run().await?;
    Ok(())
}

async fn cln_wait_invoice(label: &str) -> anyhow::Result<()> {
    let status = cmd!(LnCli, "waitinvoice", label).out_json().await?["status"]
        .as_str()
        .map(|s| s.to_owned())
        .unwrap();
    assert_eq!(status, "paid");
    Ok(())
}

fn get_command_for_alias(alias: &str, default: &str) -> devimint::util::Command {
    // try to use alias if set
    let cli = std::env::var(alias)
        .map(|s| s.split_whitespace().map(ToOwned::to_owned).collect())
        .unwrap_or_else(|_| vec![default.into()]);
    let mut cmd = tokio::process::Command::new(&cli[0]);
    cmd.args(&cli[1..]);
    devimint::util::Command {
        cmd,
        args_debug: cli,
    }
}

pub struct BitcoinCli;
impl BitcoinCli {
    pub fn cmd(self) -> devimint::util::Command {
        get_command_for_alias("FM_BTC_CLIENT", "bitcoin-cli")
    }
}

async fn bitcoin_cli_send_to_address(address: &str, amount: &str) -> anyhow::Result<()> {
    let btc_port = std::env::var("FM_PORT_BTC_RPC").unwrap_or(String::from("18443"));
    cmd!(
        BitcoinCli,
        "-rpcport={btc_port}",
        "-rpcwallet=",
        "sendtoaddress",
        address,
        amount
    )
    .run()
    .await?;

    cmd!(
        BitcoinCli,
        "-rpcport={btc_port}",
        "-rpcwallet=",
        "-generate",
        "11"
    )
    .run()
    .await?;

    Ok(())
}

async fn cln_pay_invoice(invoice_string: &str) -> anyhow::Result<()> {
    cmd!(LnCli, "pay", invoice_string).run().await?;
    Ok(())
}

async fn join_test_fed_recovery(
    bridge: &BridgeFull,
    recover_from_scratch: bool,
) -> Result<Arc<FederationV2>, anyhow::Error> {
    let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
    let fedimint_federation = joinFederation(bridge, invite_code, recover_from_scratch).await?;
    let federation = bridge
        .federations
        .get_federation_maybe_recovering(&fedimint_federation.id.0)?;
    Ok(federation)
}

fn should_skip_test_using_stock_fedimintd() -> bool {
    if std::env::var(USE_UPSTREAM_FEDIMINTD_ENV).is_ok() {
        info!("Skipping test as we're using stock/upstream fedimintd binary");
        true
    } else {
        false
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn tests_wrapper_for_bridge() -> anyhow::Result<()> {
    INIT_TRACING.call_once(|| {
        TracingSetup::default()
            .init()
            .expect("Failed to initialize tracing");
    });
    let dev_fed = DevFed::new_with_setup(4).await?;

    macro_rules! tests_array {
        ($($test_name:expr),* $(,)?) => {
            [$(
                (stringify!($test_name), Box::pin($test_name(dev_fed.clone())) as BoxFuture<_>)
            ),*]
        };
    }

    let tests = tests_array![
        test_join_and_leave_and_join,
        test_join_concurrent,
        matrix::test_matrix_login,
        matrix::test_matrix_dms,
        matrix::test_matrix_recovery,
        matrix::test_matrix_create_room,
        matrix::test_send_and_download_attachment,
        multispend_tests::test_multispend_minimal,
        multispend_tests::test_multispend_group_acceptance,
        multispend_tests::test_multispend_group_rejection,
        sp_transfer_tests::test_end_to_end,
        sp_transfer_tests::test_receiver_joins_federation_later,
        // TODO: re-enable
        // test_lightning_send_and_receive,
        test_ecash,
        test_ecash_overissue,
        test_on_chain,
        test_ecash_cancel,
        test_backup_and_recovery,
        test_backup_and_recovery_from_scratch,
        test_parse_ecash,
        test_social_backup_and_recovery,
        test_stability_pool,
        test_stability_pool_external_transfer_in,
        test_spv2,
        test_lnurl_sign_message,
        test_federation_preview,
        test_onboarding_fails_without_restore_mnemonic,
        test_transfer_device_registration_post_recovery,
        test_new_device_registration_post_recovery,
        test_fee_remittance_on_startup,
        test_fee_remittance_post_successful_tx,
        test_recurring_lnurl,
        test_doesnt_overwrite_seed_in_invalid_fedi_file,
        test_transfer_device_registration_no_feds,
        test_preview_and_join_community,
        test_list_and_leave_community,
        test_community_meta_bg_refresh,
        test_community_v2_migration,
        nostr_tests::test_nostr_community_workflow,
        nostr_tests::test_nostr_community_preview_join_leave,
        test_existing_device_identifier_v2_migration,
        test_nip44_encrypt_and_decrypt,
    ];

    let mut tests_set = JoinSet::new();
    let sem = Arc::new(Semaphore::new(available_parallelism()?.into()));
    let mut tests_names: HashMap<tokio::task::Id, String> = HashMap::new();

    // example: BRIDGE_TEST_WRAPPER_FILTER=nip44,recurring_lnurl,spv2,matrix
    let filter_set = std::env::var("BRIDGE_TEST_WRAPPER_FILTER")
        .ok()
        .filter(|x| !x.is_empty())
        .map(|x| x.split(",").map(|x| x.to_owned()).collect::<Vec<_>>());

    for (test_name, test_future) in tests {
        if let Some(filter_set) = &filter_set {
            if !filter_set.iter().any(|filter| test_name.contains(filter)) {
                continue;
            }
        }
        let id = tests_set
            .spawn({
                let sem = sem.clone();
                async move {
                    let _permit = sem.acquire().await.unwrap();
                    test_future.await
                }
            })
            .id();
        tests_names.insert(id, test_name.to_owned());
    }

    while let Some(res) = tests_set.join_next_with_id().await {
        match res {
            Err(e) => match e.try_into_panic() {
                Ok(reason) => panic::resume_unwind(reason),
                Err(e) => {
                    bail!("test {} failed: {:?}", &tests_names[&e.id()], e);
                }
            },
            Ok((id, Err(e))) => {
                bail!("test {} failed: {:?}", &tests_names[&id], e);
            }
            Ok((id, Ok(_))) => {
                info!("test {} OK", &tests_names[&id]);
            }
        }
    }
    Ok(())
}

async fn test_doesnt_overwrite_seed_in_invalid_fedi_file(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let invalid_fedi_file = String::from(r#"{"format_version": 0, "root_seed": "abcd"}"#);
    td.storage()
        .await?
        .write_file(FEDI_FILE_V0_PATH.as_ref(), invalid_fedi_file.clone().into())
        .await?;
    // start bridge with unknown data
    assert!(td.bridge_maybe_onboarding().await.is_err());
    assert_eq!(
        td.storage()
            .await?
            .read_file(FEDI_FILE_V0_PATH.as_ref())
            .await?
            .expect("fedi file not found"),
        invalid_fedi_file.into_bytes()
    );
    Ok(())
}

async fn test_join_and_leave_and_join(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;
    let env_invite_code = std::env::var("FM_INVITE_CODE").unwrap();
    joinFederation(bridge, env_invite_code.clone(), false).await?;

    // Can't re-join a federation we're already a member of
    assert!(joinFederation(bridge, env_invite_code.clone(), false)
        .await
        .is_err());

    // listTransactions works
    let federations = listFederations(&bridge.federations).await?;
    assert_eq!(federations.len(), 1);
    let RpcFederationMaybeLoading::Ready(rpc_federation) = &federations[0] else {
        panic!("federation is not loaded");
    };
    assert_eq!(env_invite_code.clone(), rpc_federation.invite_code);

    // leaveFederation works
    leaveFederation(&bridge.federations, rpc_federation.id.clone()).await?;
    assert_eq!(listFederations(&bridge.federations).await?.len(), 0);

    // rejoin without any rocksdb locking problems
    joinFederation(bridge, env_invite_code, false).await?;
    assert_eq!(listFederations(&bridge.federations).await?.len(), 1);

    Ok(())
}

async fn test_join_concurrent(_dev_fed: DevFed) -> anyhow::Result<()> {
    let mut tb = TestDevice::new();
    let federation_id;
    let amount;
    // first app launch
    {
        let bridge = tb.bridge_full().await?;
        let env_invite_code = std::env::var("FM_INVITE_CODE").unwrap();

        // Can't re-join a federation we're already a member of
        let (res1, res2) = tokio::join!(
            joinFederation(bridge, env_invite_code.clone(), false),
            joinFederation(bridge, env_invite_code.clone(), false),
        );
        federation_id = match (res1, res2) {
            (Ok(f), Err(_)) | (Err(_), Ok(f)) => f.id.0,
            _ => panic!("exactly one of two concurrent join federation must fail"),
        };

        let federation = bridge.federations.get_federation(&federation_id)?;
        let ecash = cli_generate_ecash(fedimint_core::Amount::from_msats(10_000)).await?;
        amount = receiveEcash(federation.clone(), ecash, FrontendMetadata::default())
            .await?
            .0
             .0;
        wait_for_ecash_reissue(&federation).await?;
        tb.shutdown().await?;
    }

    // second app launch
    {
        let bridge = tb.bridge_full().await?;
        let federation = wait_for_federation_loading(bridge, &federation_id).await?;
        assert_eq!(federation.get_balance().await, amount);
    }
    Ok(())
}

async fn wait_for_federation_loading(
    bridge: &BridgeFull,
    federation_id: &str,
) -> anyhow::Result<Arc<FederationV2>> {
    loop {
        match bridge.federations.get_federation_state(federation_id)? {
            FederationState::Loading => {
                sleep_in_test("loading federation", Duration::from_millis(10)).await
            }
            FederationState::Ready(f) | FederationState::Recovering(f) => return Ok(f),
            FederationState::Failed(err) => bail!(err),
        }
    }
}

#[allow(dead_code)]
async fn test_lightning_send_and_receive() -> anyhow::Result<()> {
    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_lightning_send_and_receive_with_fedi_fees(send_ppm, receive_ppm).await?;
    }

    Ok(())
}

async fn test_lightning_send_and_receive_with_fedi_fees(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let (bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);
    setLightningModuleFediFeeSchedule(
        bridge,
        federation.rpc_federation_id(),
        fedi_fees_send_ppm,
        fedi_fees_receive_ppm,
    )
    .await?;
    let receive_amount = fedimint_core::Amount::from_sats(100);
    let fedi_fee =
        Amount::from_msats((receive_amount.msats * fedi_fees_receive_ppm).div_ceil(MILLION));
    let rpc_receive_amount = RpcAmount(receive_amount);
    let description = "test".to_string();
    let invoice_string = generateInvoice(
        federation.clone(),
        rpc_receive_amount,
        description,
        None,
        FrontendMetadata::default(),
    )
    .await?;

    cln_pay_invoice(&invoice_string).await?;

    // check for event of type transaction that has ln_state
    'check: loop {
        let events = td.event_sink().events();
        for (_, ev_body) in events
            .iter()
            .rev()
            .filter(|(kind, _)| kind == "transaction")
        {
            let ev_body = serde_json::from_str::<TransactionEvent>(ev_body).unwrap();
            let transaction = ev_body.transaction;
            if matches!(transaction
                .kind,
                RpcTransactionKind::LnReceive {
                    ln_invoice, state: Some(RpcLnReceiveState::Claimed), ..
                } if ln_invoice == invoice_string
            ) {
                break 'check;
            }
        }
        fedimint_core::task::sleep_in_test(
            "waiting for external ln recv",
            Duration::from_millis(100),
        )
        .await;
    }

    assert_eq!(
        receive_amount.checked_sub(fedi_fee).expect("Can't fail"),
        federation.get_balance().await
    );

    // get invoice
    let send_amount = Amount::from_sats(50);
    let (invoice, label) = cli_generate_invoice(&send_amount).await?;
    let invoice_string = invoice.to_string();

    // check balance
    payInvoice(
        federation.clone(),
        invoice_string,
        FrontendMetadata::default(),
    )
    .await?;

    // check that core-lightning got paid
    cln_wait_invoice(&label).await?;

    // TODO shaurya unsure how to account for gateway fee when verifying fedi fee
    // amount
    Ok(())
}

async fn test_ecash(_dev_fed: DevFed) -> anyhow::Result<()> {
    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_ecash_with_fedi_fees(send_ppm, receive_ppm).await?;
    }

    Ok(())
}

async fn test_ecash_with_fedi_fees(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let (bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);
    setMintModuleFediFeeSchedule(
        bridge,
        federation.rpc_federation_id(),
        fedi_fees_send_ppm,
        fedi_fees_receive_ppm,
    )
    .await?;

    // receive ecash
    let ecash_receive_amount = fedimint_core::Amount::from_msats(10000);
    let ecash = cli_generate_ecash(ecash_receive_amount).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    let receive_fedi_fee =
        Amount::from_msats((ecash_receive_amount.msats * fedi_fees_receive_ppm).div_ceil(MILLION));
    receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(federation).await?;

    // check balance (sometimes fedimint-cli gives more than we ask for)
    assert_eq!(
        ecash_receive_amount
            .checked_sub(receive_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );

    // spend ecash
    // If fedi_fee != 0, we expect this to fail since we cannot spend all of
    // ecash_receive_amount
    if receive_fedi_fee != Amount::ZERO {
        assert!(generateEcash(
            federation.clone(),
            RpcAmount(ecash_receive_amount),
            false,
            FrontendMetadata::default()
        )
        .await
        .is_err());
    }
    let ecash_send_amount = Amount::from_msats(ecash_receive_amount.msats / 2);
    let send_fedi_fee =
        Amount::from_msats((ecash_send_amount.msats * fedi_fees_send_ppm).div_ceil(MILLION));
    let send_ecash = generateEcash(
        federation.clone(),
        RpcAmount(ecash_send_amount),
        false,
        FrontendMetadata::default(),
    )
    .await?
    .ecash;

    assert_eq!(
        ecash_receive_amount
            .checked_sub(receive_fedi_fee)
            .expect("Can't fail")
            .checked_sub(ecash_send_amount)
            .expect("Can't fail")
            .checked_sub(send_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );

    // receive with fedimint-cli
    cli_receive_ecash(send_ecash).await?;

    Ok(())
}

async fn wait_for_ecash_reissue(federation: &FederationV2) -> Result<(), anyhow::Error> {
    devimint::util::poll("waiting for ecash reissue", || async {
        let txns = federation.list_transactions(usize::MAX, None).await;
        let Ok(RpcTransactionListEntry {
            transaction:
                RpcTransaction {
                    kind: RpcTransactionKind::OobReceive { state: Some(state) },
                    ..
                },
            ..
        }) = txns
            .into_iter()
            .next()
            .context("transaction not found")
            .map_err(ControlFlow::Continue)?
        else {
            return Err(ControlFlow::Continue(anyhow!(
                "oob state must be present on ecash reissue"
            )));
        };
        match state {
            RpcOOBReissueState::Done => Ok(()),
            RpcOOBReissueState::Failed { error } => Err(ControlFlow::Break(anyhow!(error))),
            _ => Err(ControlFlow::Continue(anyhow!("not done yet"))),
        }
    })
    .await
}

async fn test_ecash_overissue(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let (bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);

    // receive ecash
    let ecash_requested_amount = fedimint_core::Amount::from_msats(10000);
    let ecash = cli_generate_ecash(ecash_requested_amount).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(federation.as_ref()).await?;

    // check balance
    assert_eq!(ecash_receive_amount, federation.get_balance().await,);

    let fedi_fee_ppm = bridge
        .federations
        .fedi_fee_helper
        .get_fedi_fee_ppm(
            federation.rpc_federation_id().0,
            fedimint_mint_client::KIND,
            RpcTransactionDirection::Send,
        )
        .await?;
    let iterations = 100;
    let iteration_amount = Amount::from_msats(ecash_receive_amount.msats / (iterations * 2));
    let iteration_expected_fee =
        Amount::from_msats((fedi_fee_ppm * iteration_amount.msats).div_ceil(MILLION));

    for _ in 0..iterations {
        generateEcash(
            federation.clone(),
            RpcAmount(iteration_amount),
            false,
            FrontendMetadata::default(),
        )
        .await
        .context("generateEcash")?;
    }
    // check balance
    assert_eq!(
        ecash_receive_amount
            .checked_sub((iteration_amount + iteration_expected_fee) * iterations)
            .expect("Can't fail"),
        federation.get_balance().await,
    );

    Ok(())
}

// on chain is marked experimental for 0.4
async fn test_on_chain(_dev_fed: DevFed) -> anyhow::Result<()> {
    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_on_chain_with_fedi_fees(send_ppm, receive_ppm).await?;
        test_on_chain_with_fedi_fees_with_restart(send_ppm, receive_ppm).await?;
    }

    Ok(())
}

async fn test_on_chain_with_fedi_fees(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let (bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);
    setWalletModuleFediFeeSchedule(
        bridge,
        federation.rpc_federation_id(),
        fedi_fees_send_ppm,
        fedi_fees_receive_ppm,
    )
    .await?;

    let address = generateAddress(federation.clone(), FrontendMetadata::default()).await?;
    bitcoin_cli_send_to_address(&address, "0.1").await?;

    assert!(matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit {
                    state: Some(RpcOnchainDepositState::WaitingForTransaction),
                    ..
                },
                ..
            },
            ..
        })
    ));
    // check for event of type transaction that has onchain_state of
    // DepositState::Claimed
    'check: loop {
        let events = td.event_sink().events();
        for (_, ev_body) in events
            .iter()
            .rev()
            .filter(|(kind, _)| kind == "transaction")
        {
            let ev_body = serde_json::from_str::<TransactionEvent>(ev_body).unwrap();
            let transaction = ev_body.transaction;
            if matches!(
                transaction.kind,
                RpcTransactionKind::OnchainDeposit {
                    onchain_address,
                    state: Some(RpcOnchainDepositState::Claimed(_)),
                    ..
                } if onchain_address == address
            ) {
                break 'check;
            }
        }
        fedimint_core::task::sleep_in_test(
            "waiting for generate to address",
            Duration::from_secs(1),
        )
        .await;
    }
    assert!(matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit {
                    state: Some(RpcOnchainDepositState::Claimed(_)),
                    ..
                },
                ..
            },
            ..
        })
    ),);

    let btc_amount = Amount::from_sats(10_000_000);
    let pegin_fees = federation.client.wallet()?.get_fee_consensus().peg_in_abs;
    let receive_fedi_fee = Amount::from_msats(
        ((btc_amount.msats - pegin_fees.msats) * fedi_fees_receive_ppm).div_ceil(MILLION),
    );
    assert_eq!(
        btc_amount,
        federation.get_balance().await + receive_fedi_fee + pegin_fees,
    );

    Ok(())
}

async fn test_on_chain_with_fedi_fees_with_restart(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let (address, federation_id);
    let mut td = TestDevice::new();
    // setup, generate address, shutdown
    {
        let bridge = td.bridge_full().await?;
        let federation = td.join_default_fed().await?;
        setWalletModuleFediFeeSchedule(
            bridge,
            federation.rpc_federation_id(),
            fedi_fees_send_ppm,
            fedi_fees_receive_ppm,
        )
        .await?;

        address = generateAddress(federation.clone(), FrontendMetadata::default()).await?;
        federation_id = federation.federation_id();
        td.shutdown().await?;
    }
    bitcoin_cli_send_to_address(&address, "0.1").await?;

    // restart bridge using same data dir
    let bridge = td.bridge_full().await?;
    let federation = wait_for_federation_loading(bridge, &federation_id.to_string()).await?;

    assert!(matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit {
                    state: Some(RpcOnchainDepositState::WaitingForTransaction),
                    ..
                },
                ..
            },
            ..
        })
    ));
    // check for event of type transaction that has onchain_state of
    // DepositState::Claimed
    'check: loop {
        let events = td.event_sink().events();
        for (_, ev_body) in events
            .iter()
            .rev()
            .filter(|(kind, _)| kind == "transaction")
        {
            let ev_body = serde_json::from_str::<TransactionEvent>(ev_body).unwrap();
            let transaction = ev_body.transaction;
            if matches!(
                transaction.kind,
                RpcTransactionKind::OnchainDeposit {
                    onchain_address,
                    state: Some(RpcOnchainDepositState::Claimed(_)),
                    ..
                } if onchain_address == address
            ) {
                break 'check;
            }
        }
        fedimint_core::task::sleep_in_test(
            "waiting for generate to address",
            Duration::from_secs(1),
        )
        .await;
    }
    assert!(matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit {
                    state: Some(RpcOnchainDepositState::Claimed(_)),
                    ..
                },
                ..
            },
            ..
        })
    ),);

    let btc_amount = Amount::from_sats(10_000_000);
    let pegin_fees = federation.client.wallet()?.get_fee_consensus().peg_in_abs;
    let receive_fedi_fee = Amount::from_msats(
        ((btc_amount.msats - pegin_fees.msats) * fedi_fees_receive_ppm).div_ceil(MILLION),
    );
    assert_eq!(
        btc_amount,
        federation.get_balance().await + receive_fedi_fee + pegin_fees,
    );

    Ok(())
}

async fn test_ecash_cancel(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let federation = td.join_default_fed().await?;

    // receive ecash
    let ecash_receive_amount = fedimint_core::Amount::from_msats(100);
    let ecash = cli_generate_ecash(ecash_receive_amount).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(federation.as_ref()).await?;

    // check balance
    assert_eq!(ecash_receive_amount, federation.get_balance().await);

    // spend half of received ecash
    let send_ecash = generateEcash(
        federation.clone(),
        RpcAmount(Amount::from_msats(ecash_receive_amount.msats / 2)),
        false,
        FrontendMetadata::default(),
    )
    .await?
    .ecash;

    // if you notice this flake in CI, revert this change
    cancelEcash(federation.clone(), send_ecash).await?;
    Ok(())
}

async fn test_backup_and_recovery(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }
    test_backup_and_recovery_inner(false).await
}

async fn test_backup_and_recovery_from_scratch(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }
    test_backup_and_recovery_inner(true).await
}

async fn test_backup_and_recovery_inner(from_scratch: bool) -> anyhow::Result<()> {
    let (mnemonic, ecash_balance_before, expected_fedi_fee);
    let sp_amount_to_deposit = Amount::from_msats(110_000);
    // create a backup on device 1
    {
        let mut td = TestDevice::new();
        let bridge = td.bridge_full().await?;
        let federation = td.join_default_fed().await?;
        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(federation).await?;
        assert_eq!(ecash_receive_amount, federation.get_balance().await);

        // Interact with stability pool
        let fedi_fee_ppm = bridge
            .federations
            .fedi_fee_helper
            .get_fedi_fee_ppm(
                federation.rpc_federation_id().0,
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        expected_fedi_fee =
            Amount::from_msats((fedi_fee_ppm * sp_amount_to_deposit.msats).div_ceil(MILLION));
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(sp_amount_to_deposit)).await?;

        ecash_balance_before = federation.get_balance().await;

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        mnemonic = getMnemonic(bridge.runtime.clone()).await?;
        td.shutdown().await?;
    }

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let td = TestDevice::new();
    let recovery_bridge = td.bridge_maybe_onboarding().await?;
    restoreMnemonic(recovery_bridge.try_get()?, mnemonic).await?;
    // Re-register device as index 0 since it's the same device
    onboardTransferExistingDeviceRegistration(recovery_bridge.try_get()?, 0).await?;
    let recovery_bridge = td.bridge_full().await?;

    // Rejoin federation and assert that balances are correct
    let recovery_federation = join_test_fed_recovery(recovery_bridge, from_scratch).await?;
    assert!(recovery_federation.recovering());
    let id = recovery_federation.rpc_federation_id();
    drop(recovery_federation);
    loop {
        // Wait until recovery complete
        if td
            .event_sink()
            .num_events_of_type("recoveryComplete".into())
            == 1
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }
    let recovery_federation = recovery_bridge.federations.get_federation(&id.0)?;
    // Currently, accrued fedi fee is merged back into balance upon recovery
    // wait atmost 10s
    for _ in 0..100 {
        if ecash_balance_before + expected_fedi_fee == recovery_federation.get_balance().await {
            break;
        }
        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(
        ecash_balance_before + expected_fedi_fee,
        recovery_federation.get_balance().await
    );

    let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
    assert_eq!(account_info.idle_balance.0, Amount::ZERO);
    assert_eq!(account_info.staged_seeks[0].0, sp_amount_to_deposit);
    assert!(account_info.staged_cancellation.is_none());
    assert!(account_info.locked_seeks.is_empty());
    Ok(())
}

async fn test_parse_ecash(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;
    let v2_ecash = "AgEEsuFO5gD3AwQBmW/h68gy6W5cgnl93aTdduN1OnnFofSCqjth03Q6CA+fXnKlVXQSIVSLqcHzsbhozAuo2q5jPMsO6XMZZZXaYvZyIdXzCUIuDNhdCHkGJWAgAa9M5zsSPPVWDVeCWgkerg0Z+Xv8IQGMh7rsgpLh77NCSVRKA2i4fBYNwPglSbkGs42Yllmz6HJtgmmtl/tdjcyVSR30Nc2cfkZYTJcEEnRjQAGC8ZX5eLYQB8rCAZiX5/gQX2QtjasZMy+BJ67kJ0klVqsS9G1IVWhea6ILISOd9H1MJElma8aHBiWBaWeGjrCXru8Ns7Lz4J18CbxFdHyWEQ==";
    parseEcash(&bridge.federations, v2_ecash.into()).await?;
    Ok(())
}

async fn test_social_backup_and_recovery(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mut td1 = TestDevice::new();
    let original_bridge = td1.bridge_full().await?;
    let federation = td1.join_default_fed().await?;

    // receive ecash
    let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;
    assert_eq!(ecash_receive_amount, federation.get_balance().await);

    // Interact with stability pool
    let amount_to_deposit = Amount::from_msats(110_000);
    let fedi_fee_ppm = original_bridge
        .federations
        .fedi_fee_helper
        .get_fedi_fee_ppm(
            federation.rpc_federation_id().0,
            stability_pool_client_old::common::KIND,
            RpcTransactionDirection::Send,
        )
        .await?;
    let expected_fedi_fee =
        Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

    let ecash_balance_before = federation.get_balance().await;

    // set username and do a backup
    let federation_id = federation.rpc_federation_id();
    backupNow(federation.clone()).await?;

    // Get original mnemonic (for comparison later)
    let initial_words = getMnemonic(original_bridge.runtime.clone()).await?;
    info!("initial mnemnoic {:?}", &initial_words);

    // Upload backup
    let video_file_path = get_fixture_dir().join("backup.fedi");
    let video_file_contents = tokio::fs::read(&video_file_path).await?;
    let recovery_file_path =
        uploadBackupFile(original_bridge, federation_id.clone(), video_file_path).await?;
    let locate_recovery_file_path = locateRecoveryFile(original_bridge.runtime.clone()).await?;
    assert_eq!(recovery_file_path, locate_recovery_file_path);

    // original device is down
    td1.shutdown().await?;

    // use new bridge from here (simulating a new app install)
    let td2 = TestDevice::new();
    let recovery_bridge = td2.bridge_maybe_onboarding().await?;

    let td3 = TestDevice::new();
    let guardian_bridge = td3.bridge_full().await?;
    td3.join_default_fed().await?;

    // Validate recovery file
    validateRecoveryFile(recovery_bridge.try_get()?, recovery_file_path).await?;

    // Generate recovery QR
    let qr = recoveryQr(recovery_bridge.try_get()?)
        .await?
        .expect("recovery must be started started");
    let recovery_id = qr.recovery_id;

    // Guardian downloads verification document
    let verification_doc_path = socialRecoveryDownloadVerificationDoc(
        guardian_bridge,
        federation_id.clone(),
        recovery_id,
        RpcPeerId(fedimint_core::PeerId::from(1)),
    )
    .await?
    .unwrap();
    let contents = tokio::fs::read(verification_doc_path).await?;
    let _ = VerificationDocument::from_raw(&contents);
    assert_eq!(contents, video_file_contents);

    // 3 guardians approves
    for i in 0..3 {
        let password = "p";
        approveSocialRecoveryRequest(
            guardian_bridge,
            federation_id.clone(),
            recovery_id,
            RpcPeerId(fedimint_core::PeerId::from(i)),
            password.into(),
        )
        .await?;
    }

    // Member checks approval status
    let social_recovery_event = socialRecoveryApprovals(recovery_bridge.try_get()?).await?;
    assert_eq!(0, social_recovery_event.remaining);
    assert_eq!(
        3,
        social_recovery_event
            .approvals
            .iter()
            .filter(|app| app.approved)
            .count()
    );

    // Member combines decryption shares, loading recovered mnemonic back into their
    // db
    completeSocialRecovery(recovery_bridge.try_get()?).await?;

    // Re-register device as index 0 since it's the same device
    onboardTransferExistingDeviceRegistration(recovery_bridge.try_get()?, 0).await?;

    let recovery_bridge = td2.bridge_full().await?;
    // Check backups match (TODO: how can I make sure that they're equal td/c
    // nothing happened?)
    let final_words: Vec<String> = getMnemonic(recovery_bridge.runtime.clone()).await?;
    assert_eq!(initial_words, final_words);

    // FIXME: auto joining
    join_test_fed_recovery(recovery_bridge, false).await?;
    // Assert that balances are correct
    let recovery_federation = recovery_bridge
        .federations
        .get_federation_maybe_recovering(&federation_id.0)?;
    assert!(recovery_federation.recovering());
    let id = recovery_federation.rpc_federation_id();
    drop(recovery_federation);
    loop {
        // Wait until recovery complete
        if td2
            .event_sink()
            .num_events_of_type("recoveryComplete".into())
            == 1
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }
    let recovery_federation = recovery_bridge.federations.get_federation(&id.0)?;
    // Currently, accrued fedi fee is merged back into balance upon recovery
    assert_eq!(
        ecash_balance_before + expected_fedi_fee,
        recovery_federation.get_balance().await
    );

    let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
    assert_eq!(account_info.idle_balance.0, Amount::ZERO);
    assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
    assert!(account_info.staged_cancellation.is_none());
    assert!(account_info.locked_seeks.is_empty());

    Ok(())
}

async fn test_stability_pool(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_stability_pool_with_fedi_fees(send_ppm, receive_ppm).await?;
    }

    Ok(())
}

async fn test_stability_pool_with_fedi_fees(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;
    setStabilityPoolModuleFediFeeSchedule(
        bridge,
        federation.rpc_federation_id(),
        fedi_fees_send_ppm,
        fedi_fees_receive_ppm,
    )
    .await?;

    // Test default account info state
    let account_info = stabilityPoolAccountInfo(federation.clone(), true).await?;
    assert_eq!(account_info.idle_balance.0, Amount::ZERO);
    assert!(account_info.staged_seeks.is_empty());
    assert!(account_info.staged_cancellation.is_none());
    assert!(account_info.locked_seeks.is_empty());

    // Receive some ecash first
    let initial_balance = Amount::from_msats(500_000);
    let ecash = cli_generate_ecash(initial_balance).await?;
    let (receive_amount, _) = federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;

    // Deposit to seek and verify account info
    let amount_to_deposit = Amount::from_msats(receive_amount.msats / 2);
    let deposit_fedi_fee =
        Amount::from_msats((amount_to_deposit.msats * fedi_fees_send_ppm).div_ceil(MILLION));
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    loop {
        // Wait until deposit operation succeeds
        // Initiated -> TxAccepted -> Success
        if td
            .event_sink()
            .num_events_of_type("stabilityPoolDeposit".into())
            == 3
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    assert_eq!(
        receive_amount
            .checked_sub(amount_to_deposit)
            .expect("Can't fail")
            .checked_sub(deposit_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );
    let account_info = stabilityPoolAccountInfo(federation.clone(), true).await?;
    assert_eq!(account_info.idle_balance.0, Amount::ZERO);
    assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
    assert!(account_info.staged_cancellation.is_none());
    assert!(account_info.locked_seeks.is_empty());

    // Withdraw and verify account info
    let amount_to_withdraw = Amount::from_msats(amount_to_deposit.msats / 2);
    let withdraw_fedi_fee =
        Amount::from_msats((amount_to_withdraw.msats * fedi_fees_receive_ppm).div_ceil(MILLION));
    stabilityPoolWithdraw(
        federation.clone(),
        RpcAmount(amount_to_withdraw),
        0, // nothing locked that can be withdrawn
    )
    .await?;
    loop {
        // Wait until withdrawal operation succeeds
        // WithdrawUnlockedInitiated -> WithdrawUnlockedAccepted ->
        // Success
        if td
            .event_sink()
            .num_events_of_type("stabilityPoolWithdrawal".into())
            == 3
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    assert_eq!(
        (receive_amount
            .checked_sub(amount_to_deposit)
            .expect("Can't fail")
            .checked_sub(deposit_fedi_fee)
            .expect("Can't fail")
            + amount_to_withdraw)
            .checked_sub(withdraw_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );
    let account_info = stabilityPoolAccountInfo(federation.clone(), true).await?;
    assert_eq!(account_info.idle_balance.0, Amount::ZERO);
    assert_eq!(
        account_info.staged_seeks[0].0.msats,
        amount_to_deposit.msats / 2
    );
    assert!(account_info.staged_cancellation.is_none());
    assert!(account_info.locked_seeks.is_empty());
    Ok(())
}

async fn test_spv2(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_spv2_with_fedi_fees(send_ppm, receive_ppm).await?;
    }

    Ok(())
}

async fn test_spv2_with_fedi_fees(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;
    setSPv2ModuleFediFeeSchedule(
        bridge,
        federation.rpc_federation_id(),
        fedi_fees_send_ppm,
        fedi_fees_receive_ppm,
    )
    .await?;

    // Test default account info state
    let RpcSPv2CachedSyncResponse { sync_response, .. } =
        spv2AccountInfo(federation.clone()).await?;
    assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
    assert_eq!(sync_response.staged_balance.0, Amount::ZERO);
    assert_eq!(sync_response.locked_balance.0, Amount::ZERO);
    assert!(sync_response.pending_unlock_request.is_none());

    // Receive some ecash first
    let initial_balance = Amount::from_msats(500_000);
    let ecash = cli_generate_ecash(initial_balance).await?;
    let (receive_amount, _) = federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;

    // Deposit to seek and verify account info
    let amount_to_deposit = Amount::from_msats(receive_amount.msats / 2);
    let deposit_fedi_fee =
        Amount::from_msats((amount_to_deposit.msats * fedi_fees_send_ppm).div_ceil(MILLION));
    spv2DepositToSeek(
        federation.clone(),
        RpcAmount(amount_to_deposit),
        FrontendMetadata::default(),
    )
    .await?;
    loop {
        // Wait until deposit operation succeeds
        // Initiated -> TxAccepted -> Success
        if td.event_sink().num_events_of_type("spv2Deposit".into()) == 3 {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    assert_eq!(
        receive_amount
            .checked_sub(amount_to_deposit)
            .expect("Can't fail")
            .checked_sub(deposit_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );
    let RpcSPv2CachedSyncResponse { sync_response, .. } =
        spv2AccountInfo(federation.clone()).await?;
    assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
    assert_eq!(sync_response.staged_balance.0, amount_to_deposit);
    assert!(sync_response.pending_unlock_request.is_none());
    assert_eq!(sync_response.locked_balance.0, Amount::ZERO);

    // Withdraw and verify account info
    let amount_to_withdraw = Amount::from_msats(200_000);
    let withdraw_fedi_fee =
        Amount::from_msats((amount_to_withdraw.msats * fedi_fees_receive_ppm).div_ceil(MILLION));
    spv2Withdraw(
        federation.clone(),
        FiatAmount::from_btc_amount(
            amount_to_withdraw,
            FiatAmount(sync_response.curr_cycle_start_price),
        )?
        .0
        .try_into()?,
        FrontendMetadata::default(),
    )
    .await?;
    loop {
        // Wait until withdrawal operation succeeds
        // Initiated -> UnlockTxAccepted -> WithdrawalInitiated -> WithdrawalTxAccepted
        // -> Success
        if td.event_sink().num_events_of_type("spv2Withdrawal".into()) == 5 {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    // At this point, we will have two SP transactions: one pending deposit, and one
    // completed withdrawal. listTransactions returns transactions in reverse
    // chronological order
    let transactions = listTransactions(federation.clone(), None, None).await?;
    let last_tx = transactions.first().expect("must exist");
    assert!(matches!(
        last_tx,
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::SPV2Withdrawal {
                    state: rpc_types::RpcSPV2WithdrawalState::CompletedWithdrawal { .. }
                },
                ..
            },
            ..
        })
    ));

    let second_last_tx = transactions.get(1).expect("must exist");
    assert!(matches!(
        second_last_tx,
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::SPV2Deposit {
                    state: rpc_types::RpcSPV2DepositState::PendingDeposit { .. }
                },
                ..
            },
            ..
        })
    ));

    assert_eq!(
        (receive_amount
            .checked_sub(amount_to_deposit)
            .expect("Can't fail")
            .checked_sub(deposit_fedi_fee)
            .expect("Can't fail")
            + amount_to_withdraw)
            .checked_sub(withdraw_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );
    let RpcSPv2CachedSyncResponse { sync_response, .. } =
        spv2AccountInfo(federation.clone()).await?;
    assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
    assert_eq!(
        sync_response.staged_balance.0.msats,
        amount_to_deposit.msats - amount_to_withdraw.msats
    );
    assert!(sync_response.pending_unlock_request.is_none());
    assert_eq!(sync_response.locked_balance.0, Amount::ZERO);

    // Let's withdraw the remaining amount
    federation
        .spv2_withdraw(FiatOrAll::All, FrontendMetadata::default())
        .await?;
    loop {
        // Wait until withdrawal operation succeeds
        // Initiated -> UnlockTxAccepted -> WithdrawalInitiated -> WithdrawalTxAccepted
        // -> Success
        if td.event_sink().num_events_of_type("spv2Withdrawal".into()) == 5 {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    // At this point, our SP deposit will be marked as completed since it has been
    // fully drained and we shouldn't expect to have a lingering pending deposit
    loop {
        // Force an SPv2 sync and wait for it to complete
        federation.spv2_force_sync();

        let transactions = listTransactions(federation.clone(), None, None).await?;
        let third_last_tx = transactions.get(2).expect("must exist");
        if matches!(
            third_last_tx,
            Ok(RpcTransactionListEntry {
                transaction: RpcTransaction {
                    kind: RpcTransactionKind::SPV2Deposit {
                        state: rpc_types::RpcSPV2DepositState::CompletedDeposit { .. }
                    },
                    ..
                },
                ..
            })
        ) {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    Ok(())
}

async fn test_lnurl_sign_message(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;
    let k1 = String::from("cfcb7616d615252180e392f509207e1f610f8d6106588c61c3e7bbe8577e4c4c");
    let message = Message::from_digest_slice(&hex::decode(k1)?)?;
    let domain1 = String::from("fedi.xyz");
    let domain2 = String::from("fedimint.com");

    // Test signing a message.
    let sig1 = bridge
        .runtime
        .sign_lnurl_message(message, domain1.clone())
        .await?;

    // Test that signing the same message twice results in identical signatures.
    let sig2 = bridge
        .runtime
        .sign_lnurl_message(message, domain1.clone())
        .await?;
    info!("Signature 2: {}", sig2.signature.to_string());
    assert_eq!(
        serde_json::to_string(&sig1.pubkey)?,
        serde_json::to_string(&sig2.pubkey)?
    );
    assert_eq!(sig1.signature, sig2.signature);

    // Test that signing the same message on a different domain results in a
    // different signature.
    let sig3 = bridge
        .runtime
        .sign_lnurl_message(message, domain2.clone())
        .await?;
    info!("Signature 3: {}", sig3.signature.to_string());
    assert_ne!(
        serde_json::to_string(&sig1.pubkey)?,
        serde_json::to_string(&sig3.pubkey)?
    );
    assert_ne!(sig1.signature, sig3.signature);

    Ok(())
}

async fn test_federation_preview(_dev_fed: DevFed) -> anyhow::Result<()> {
    let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
    let mut td = TestDevice::new();
    let bridge = td.bridge_full().await?;
    assert!(matches!(
        federationPreview(&bridge.federations, invite_code.clone())
            .await?
            .returning_member_status,
        RpcReturningMemberStatus::NewMember
    ));

    // join
    let fedimint_federation = joinFederation(bridge, invite_code.clone(), false).await?;
    let federation = bridge
        .federations
        .get_federation(&fedimint_federation.id.0)?;
    use_lnd_gateway(&federation).await?;

    // receive ecash and backup
    let ecash = cli_generate_ecash(fedimint_core::Amount::from_msats(10_000)).await?;
    federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(&federation).await?;
    let federation_id = federation.rpc_federation_id();
    backupNow(federation.clone()).await?;
    drop(federation);

    // extract mnemonic, leave federation and drop bridge
    let mnemonic = getMnemonic(bridge.runtime.clone()).await?;
    leaveFederation(&bridge.federations, federation_id.clone()).await?;
    td.shutdown().await?;

    // query preview again w/ new bridge (recovered using mnemonic), it should be
    // "returning"
    let td2 = TestDevice::new();
    let bridge = td2.bridge_maybe_onboarding().await?;
    restoreMnemonic(bridge.try_get()?, mnemonic).await?;
    // Re-register device as index 0 since it's the same device
    onboardTransferExistingDeviceRegistration(bridge.try_get()?, 0).await?;
    let bridge = td2.bridge_full().await?;

    assert!(matches!(
        federationPreview(&bridge.federations, invite_code.clone())
            .await?
            .returning_member_status,
        RpcReturningMemberStatus::ReturningMember
    ));

    Ok(())
}

async fn test_onboarding_fails_without_restore_mnemonic(_dev_fed: DevFed) -> anyhow::Result<()> {
    let mock_fedi_api = Arc::new(MockFediApi::default());
    let mut td = TestDevice::new();
    td.with_fedi_api(mock_fedi_api.clone());
    let backup_bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;

    // Device index should be 0 since it's a fresh seed
    assert_eq!(backup_bridge.runtime.app_state.device_index().await, 0);

    backupNow(federation.clone()).await?;
    // give some time for backup to complete before shutting down the bridge
    fedimint_core::task::sleep(Duration::from_secs(1)).await;

    // get mnemonic and drop old federation / bridge so no background stuff runs
    let _mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;
    td.shutdown().await?;

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let mut td2 = TestDevice::new();
    td2.with_fedi_api(mock_fedi_api);
    let recovery_bridge = td2.bridge_maybe_onboarding().await?;
    assert!(
        onboardRegisterAsNewDevice(recovery_bridge).await.is_err(),
        "onboarding failed because you didn't restore the mnemonic"
    );
    Ok(())
}

async fn test_transfer_device_registration_no_feds(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mock_fedi_api = Arc::new(MockFediApi::default());
    let mut td1 = TestDevice::new();
    td1.with_fedi_api(mock_fedi_api.clone());
    let bridge_1 = td1.bridge_full().await?;

    // give some time for backup to complete before shutting down the bridge
    fedimint_core::task::sleep(Duration::from_secs(1)).await;

    // get mnemonic (not dropping old bridge so we can assert device
    // index being stolen)
    let mnemonic = getMnemonic(bridge_1.runtime.clone()).await?;

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let mut td2 = TestDevice::new();
    td2.with_fedi_api(mock_fedi_api.clone());
    let bridge_2 = td2.bridge_maybe_onboarding().await?;
    restoreMnemonic(bridge_2.try_get()?, mnemonic.clone()).await?;
    // Register device as index 0 since it's a transfer
    onboardTransferExistingDeviceRegistration(bridge_2.try_get()?, 0).await?;

    // TODO: bring back these assertions
    // Verify that original device would see the conflict whenever its background
    // service would try to renew registration. The conflict event is what the
    // front-end uses to block further user action.
    // let registration_conflict_body =
    // serde_json::to_string(&DeviceRegistrationEvent {     state:
    // rpc_types::event::DeviceRegistrationState::Conflict, })
    // .expect("failed to json serialize");
    // assert!(!bridge_1
    //     .runtime
    //     .event_sink
    //     .events()
    //     .iter()
    //     .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
    //         && *ev_body == registration_conflict_body));
    // assert!(bridge_1.register_device_with_index(0, false).await.is_err());
    // assert!(bridge_1
    //     .runtime
    //     .event_sink
    //     .events()
    //     .iter()
    //     .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
    //         && *ev_body == registration_conflict_body));
    td1.shutdown().await?;

    // Create 3rd bridge which hasn't joined federation yet and recover mnemnonic
    let mut td3 = TestDevice::new();
    td3.with_fedi_api(mock_fedi_api);
    let bridge_3 = td3.bridge_maybe_onboarding().await?;
    restoreMnemonic(bridge_3.try_get()?, mnemonic.clone()).await?;
    // Register device as index 0 since it's a transfer
    onboardTransferExistingDeviceRegistration(bridge_3.try_get()?, 0).await?;

    // TODO: revive this
    // // Verify that 2nd device would see the conflict whenever its background
    // // service would try to renew registration.
    // assert!(bridge_2.register_device_with_index(0, false).await.is_err());

    Ok(())
}

async fn test_transfer_device_registration_post_recovery(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mock_fedi_api = Arc::new(MockFediApi::default());
    let mut td1 = TestDevice::new();
    td1.with_fedi_api(mock_fedi_api.clone());
    let backup_bridge = td1.bridge_full().await?;
    let federation = td1.join_default_fed().await?;

    // receive ecash
    let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;
    assert_eq!(ecash_receive_amount, federation.get_balance().await);

    // Interact with stability pool
    let amount_to_deposit = Amount::from_msats(110_000);
    let fedi_fee_ppm = backup_bridge
        .federations
        .fedi_fee_helper
        .get_fedi_fee_ppm(
            federation.rpc_federation_id().0,
            stability_pool_client_old::common::KIND,
            RpcTransactionDirection::Send,
        )
        .await?;
    let expected_fedi_fee =
        Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

    let ecash_balance_before = federation.get_balance().await;

    backupNow(federation.clone()).await?;
    // give some time for backup to complete before shutting down the bridge
    fedimint_core::task::sleep(Duration::from_secs(1)).await;

    // get mnemonic (not dropping old bridge so we can assert device
    // index being stolen)
    let mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let mut td2 = TestDevice::new();
    td2.with_fedi_api(mock_fedi_api.clone());
    let recovery_bridge = td2.bridge_maybe_onboarding().await?;
    restoreMnemonic(recovery_bridge.try_get()?, mnemonic).await?;
    // Register device as index 0 since it's a transfer
    onboardTransferExistingDeviceRegistration(recovery_bridge.try_get()?, 0).await?;
    let recovery_bridge = td2.bridge_full().await?;

    // Rejoin federation and assert that balances are correct
    let recovery_federation = join_test_fed_recovery(recovery_bridge, false).await?;
    assert!(recovery_federation.recovering());
    let id = recovery_federation.rpc_federation_id();
    drop(recovery_federation);
    loop {
        // Wait until recovery complete
        if td2
            .event_sink()
            .num_events_of_type("recoveryComplete".into())
            == 1
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }
    let recovery_federation = recovery_bridge.federations.get_federation(&id.0)?;
    // Currently, accrued fedi fee is merged back into balance upon recovery
    assert_eq!(
        ecash_balance_before + expected_fedi_fee,
        recovery_federation.get_balance().await
    );

    let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
    assert_eq!(account_info.idle_balance.0, Amount::ZERO);
    assert_eq!(account_info.staged_seeks[0].0, amount_to_deposit);
    assert!(account_info.staged_cancellation.is_none());
    assert!(account_info.locked_seeks.is_empty());

    // TODO: bring back these assertions
    // // Verify that original device would see the conflict whenever its background
    // // service would try to renew registration. The conflict event is what the
    // // front-end uses to block further user action.
    // let registration_conflict_body =
    // serde_json::to_string(&DeviceRegistrationEvent {     state:
    // rpc_types::event::DeviceRegistrationState::Conflict, })
    // .expect("failed to json serialize");
    // assert!(!backup_bridge
    //     .runtime
    //     .event_sink
    //     .events()
    //     .iter()
    //     .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
    //         && *ev_body == registration_conflict_body));
    // assert!(backup_bridge
    //     .register_device_with_index(0, false)
    //     .await
    //     .is_err());
    // assert!(backup_bridge
    //     .runtime
    //     .event_sink
    //     .events()
    //     .iter()
    //     .any(|(ev_type, ev_body)| ev_type == "deviceRegistration"
    //         && *ev_body == registration_conflict_body));
    Ok(())
}

async fn test_new_device_registration_post_recovery(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mock_fedi_api = Arc::new(MockFediApi::default());
    let mut td1 = TestDevice::new();
    td1.with_fedi_api(mock_fedi_api.clone());
    let backup_bridge = td1.bridge_full().await?;
    let federation = td1.join_default_fed().await?;

    // receive ecash
    let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;
    assert_eq!(ecash_receive_amount, federation.get_balance().await);

    // Interact with stability pool
    let amount_to_deposit = Amount::from_msats(110_000);
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

    backupNow(federation.clone()).await?;
    // give some time for backup to complete before shutting down the bridge
    fedimint_core::task::sleep(Duration::from_secs(1)).await;

    // get mnemonic and drop old federation / bridge so no background stuff runs
    let mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;
    td1.shutdown().await?;

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let mut td2 = TestDevice::new();
    td2.with_fedi_api(mock_fedi_api.clone());
    let recovery_bridge = td2.bridge_maybe_onboarding().await?;
    restoreMnemonic(recovery_bridge.try_get()?, mnemonic).await?;
    // Register device as index 1 since it's a new device
    onboardRegisterAsNewDevice(recovery_bridge.try_get()?).await?;
    let recovery_bridge = td2.bridge_full().await?;

    // Rejoin federation and assert that balances don't carry over (and there is no
    // backup)
    let recovery_federation = join_test_fed_recovery(recovery_bridge, false).await?;
    assert!(!recovery_federation.recovering());
    assert_eq!(Amount::ZERO, recovery_federation.get_balance().await);

    let account_info = stabilityPoolAccountInfo(recovery_federation.clone(), true).await?;
    assert_eq!(account_info.idle_balance.0, Amount::ZERO);
    assert!(account_info.staged_seeks.is_empty());
    assert!(account_info.staged_cancellation.is_none());
    assert!(account_info.locked_seeks.is_empty());
    Ok(())
}

const COMMUNITY_JSON_0: &str = r#"{
        "version": 1,
        "federation_icon_url": "https://fedi-public-snapshots.s3.amazonaws.com/icons/bitcoin-principles.png",
        "name": "0 Bitcoin Principles",
        "fedimods": "[{\"id\":\"swap\",\"url\":\"https://ln-swap.vercel.app\",\"title\":\"SWAP\",\"imageUrl\":\"https://ln-swap.vercel.app/logo.png\"},{\"id\":\"bitrefill\",\"url\":\"https://embed.bitrefill.com/?paymentMethod=lightning&ref=bezsoYNf&utm_source=fedi\",\"title\":\"Bitrefill\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/bitrefill.png\"},{\"id\":\"lngpt\",\"url\":\"https://lngpt.vercel.app\",\"title\":\"AI Assistant\",\"imageUrl\":\"https://lngpt.vercel.app/logo.png\"},{\"id\":\"tbc\",\"url\":\"https://embed.thebitcoincompany.com/giftcard\",\"title\":\"The Bitcoin Company\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/thebitcoincompany.jpg\"},{\"id\":\"btcmap\",\"url\":\"https://btcmap.org/map\",\"title\":\"BTC Map\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/btcmap.png\"},{\"id\":\"fedisupport\",\"url\":\"https://support.fedi.xyz\",\"title\":\"Support\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/fedi-faq-logo.png\"}]",
        "default_currency": "USD",
        "welcome_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "tos_url": "https://tos-fedi.replit.app/btc-principles.html",
        "preview_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "public": "false",
        "default_group_chats": "[\"fzvjqrtcwcswn4kocj1htpdd\"]"
    }"#;
const COMMUNITY_JSON_1: &str = r#"{
        "version": 1,
        "federation_icon_url": "https://fedi-public-snapshots.s3.amazonaws.com/icons/bitcoin-principles.png",
        "name": "1 Bitcoin Principles",
        "fedimods": "[{\"id\":\"swap\",\"url\":\"https://ln-swap.vercel.app\",\"title\":\"SWAP\",\"imageUrl\":\"https://ln-swap.vercel.app/logo.png\"},{\"id\":\"bitrefill\",\"url\":\"https://embed.bitrefill.com/?paymentMethod=lightning&ref=bezsoYNf&utm_source=fedi\",\"title\":\"Bitrefill\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/bitrefill.png\"},{\"id\":\"lngpt\",\"url\":\"https://lngpt.vercel.app\",\"title\":\"AI Assistant\",\"imageUrl\":\"https://lngpt.vercel.app/logo.png\"},{\"id\":\"tbc\",\"url\":\"https://embed.thebitcoincompany.com/giftcard\",\"title\":\"The Bitcoin Company\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/thebitcoincompany.jpg\"},{\"id\":\"btcmap\",\"url\":\"https://btcmap.org/map\",\"title\":\"BTC Map\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/btcmap.png\"},{\"id\":\"fedisupport\",\"url\":\"https://support.fedi.xyz\",\"title\":\"Support\",\"imageUrl\":\"https://fedi-public-snapshots.s3.amazonaws.com/icons/fedi-faq-logo.png\"}]",
        "default_currency": "USD",
        "welcome_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "tos_url": "https://tos-fedi.replit.app/btc-principles.html",
        "preview_message": "Welcome to the Bitcoin Principles Federation! Feel free to use the wallet, chat and other features. For any issues with the app, please use the Bug Report mod on the homepage.",
        "public": "false",
        "default_group_chats": "[\"fzvjqrtcwcswn4kocj1htpdd\"]"
    }"#;

async fn test_preview_and_join_community(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;

    let mut server = mockito::Server::new_async().await;
    let url = server.url();

    let invite_path = "/invite-0";
    let community_invite = CommunityInvite::V1(CommunityInviteV1 {
        community_meta_url: format!("{url}{invite_path}"),
    });

    let mock = server
        .mock("GET", invite_path)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(COMMUNITY_JSON_0)
        .create_async()
        .await;

    communityPreview(bridge, community_invite.to_string()).await?;
    mock.assert();

    // Calling preview() does not join
    assert!(bridge.communities.communities.lock().await.is_empty());
    assert!(bridge
        .runtime
        .app_state
        .with_read_lock(|state| state.joined_communities.clone())
        .await
        .is_empty());

    // Calling join() actually joins
    joinCommunity(bridge, community_invite.to_string()).await?;
    let memory_community = bridge
        .communities
        .communities
        .lock()
        .await
        .get(&community_invite.to_string())
        .unwrap()
        .clone();
    let app_state_community = bridge
        .runtime
        .app_state
        .with_read_lock(|state| state.joined_communities.clone())
        .await
        .get(&community_invite.to_string())
        .unwrap()
        .clone();
    assert!(memory_community.meta.read().await.to_owned() == app_state_community.meta);

    Ok(())
}

async fn test_list_and_leave_community(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;

    let mut server = mockito::Server::new_async().await;
    let url = server.url();

    let invite_path = "/invite-0";
    let community_invite_0 = CommunityInvite::V1(CommunityInviteV1 {
        community_meta_url: format!("{url}{invite_path}"),
    });

    server
        .mock("GET", invite_path)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(COMMUNITY_JSON_0)
        .create_async()
        .await;

    let invite_path = "/invite-1";
    let community_invite_1 = CommunityInvite::V1(CommunityInviteV1 {
        community_meta_url: format!("{url}{invite_path}"),
    });

    server
        .mock("GET", invite_path)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(COMMUNITY_JSON_1)
        .create_async()
        .await;

    // Initially no joined communities
    assert!(listCommunities(bridge).await?.is_empty());

    // Leaving throws error
    assert!(leaveCommunity(bridge, community_invite_0.to_string())
        .await
        .is_err());

    // Join community 0
    joinCommunity(bridge, community_invite_0.to_string()).await?;

    // List contains community 0
    assert!(matches!(
            &listCommunities(bridge).await?[..],
            [RpcCommunity { community_invite, .. }] if *community_invite == From::from(&community_invite_0)));

    // Join community 1
    joinCommunity(bridge, community_invite_1.to_string()).await?;

    // List contains community 0 + community 1
    assert!(matches!(
            &listCommunities(bridge).await?[..], [
                RpcCommunity { community_invite: invite_0, .. },
                RpcCommunity { community_invite: invite_1, .. }
            ] if (*invite_0 == From::from(&community_invite_0) && *invite_1 == From::from(&community_invite_1)) ||
            (*invite_0 == From::from(&community_invite_1) && *invite_1 == From::from(&community_invite_0))));

    // Leave community 0
    leaveCommunity(bridge, community_invite_0.to_string()).await?;

    // List contains only community 1
    assert!(matches!(
            &listCommunities(bridge).await?[..],
            [RpcCommunity { community_invite, .. }] if *community_invite == From::from(&community_invite_1)));

    // Leave community 1
    leaveCommunity(bridge, community_invite_1.to_string()).await?;

    // No joined communities
    assert!(listCommunities(bridge).await?.is_empty());

    Ok(())
}

async fn test_community_meta_bg_refresh(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;

    let mut server = mockito::Server::new_async().await;
    let url = server.url();

    let invite_path = "/invite-0";
    let community_invite = CommunityInvite::V1(CommunityInviteV1 {
        community_meta_url: format!("{url}{invite_path}"),
    });

    server
        .mock("GET", invite_path)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(COMMUNITY_JSON_0)
        .create_async()
        .await;

    // Calling join() actually joins
    joinCommunity(bridge, community_invite.to_string()).await?;
    let memory_community = bridge
        .communities
        .communities
        .lock()
        .await
        .get(&community_invite.to_string())
        .unwrap()
        .clone();
    let app_state_community = bridge
        .runtime
        .app_state
        .with_read_lock(|state| state.joined_communities.clone())
        .await
        .get(&community_invite.to_string())
        .unwrap()
        .clone();
    assert!(memory_community.meta.read().await.to_owned() == app_state_community.meta);
    assert!(
        serde_json::to_value(memory_community.meta.read().await.to_owned()).unwrap()
            == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_0).unwrap()
    );

    server
        .mock("GET", invite_path)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(COMMUNITY_JSON_1)
        .create_async()
        .await;
    bridge.on_app_foreground();

    loop {
        fedimint_core::task::sleep(Duration::from_millis(10)).await;
        let memory_community = bridge
            .communities
            .communities
            .lock()
            .await
            .get(&community_invite.to_string())
            .unwrap()
            .clone();
        let app_state_community = bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .get(&community_invite.to_string())
            .unwrap()
            .clone();
        if memory_community.meta.read().await.to_owned() != app_state_community.meta {
            continue;
        }
        if serde_json::to_value(memory_community.meta.read().await.to_owned()).unwrap()
            == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_0).unwrap()
        {
            continue;
        }

        assert!(
            serde_json::to_value(memory_community.meta.read().await.to_owned()).unwrap()
                == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_1).unwrap()
        );
        break;
    }

    Ok(())
}

async fn test_community_v2_migration(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;

    // Initially our FirstCommunityInviteCodeState should be "NeverSet"
    assert!(
        bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.first_comm_invite_code.clone())
            .await
            == FirstCommunityInviteCodeState::NeverSet
    );

    let mut server = mockito::Server::new_async().await;
    let url = server.url();

    let invite_path = "/invite-0";
    let community_invite = CommunityInvite::V1(CommunityInviteV1 {
        community_meta_url: format!("{url}{invite_path}"),
    });

    server
        .mock("GET", invite_path)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(COMMUNITY_JSON_0)
        .create_async()
        .await;

    // Calling join() actually joins
    joinCommunity(bridge, community_invite.to_string()).await?;
    let communities = listCommunities(bridge).await?;
    assert!(communities.len() == 1);
    assert!(communities[0].community_invite.to_string() == community_invite.to_string());

    // Now our FirstCommunityInviteCodeState should be "Set" with the v1 invite code
    assert!(
        bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.first_comm_invite_code.clone())
            .await
            == FirstCommunityInviteCodeState::Set(community_invite.to_string())
    );

    // Have another test device create a v2 nostr community and obtain its invite
    // code
    let v2_name = "Nostr Test Community".to_string();
    let v2_description = "Initial description".to_string();
    let v2_meta = BTreeMap::from([("description".to_string(), v2_description.clone())]);
    let migrate_to_v2_invite_code = {
        let td2 = TestDevice::new();
        let bridge2 = td2.bridge_full().await?;

        // Let's create a simple v2 community
        let create_payload = CommunityJson {
            name: v2_name.clone(),
            version: 2,
            meta: v2_meta.clone(),
        };
        nostrCreateCommunity(bridge2, serde_json::to_string(&create_payload)?)
            .await?
            .community_invite
            .to_string()
    };

    // Update v1 community JSON with v2 migration invite code
    let updated_community_json_0_str = {
        let mut community_json_0 = serde_json::from_str::<CommunityJson>(COMMUNITY_JSON_0)?;
        community_json_0.meta.insert(
            COMMUNITY_V1_TO_V2_MIGRATION_KEY.to_owned(),
            migrate_to_v2_invite_code.clone(),
        );
        serde_json::to_string(&community_json_0)?
    };
    server
        .mock("GET", invite_path)
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(updated_community_json_0_str)
        .create_async()
        .await;
    bridge.on_app_foreground();

    loop {
        // Wait until migration event emitted
        if td
            .event_sink()
            .num_events_of_type("communityMigratedToV2".into())
            == 1
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    // Now there should be only one community which is the v2 community
    let communities = listCommunities(bridge).await?;
    assert!(communities.len() == 1);
    assert!(communities[0].community_invite.to_string() == migrate_to_v2_invite_code);
    assert!(communities[0].meta == v2_meta);

    // Our FirstCommunityInviteCodeState should be "Set" with the v2 invite code
    // since this was a migration
    assert!(
        bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.first_comm_invite_code.clone())
            .await
            == FirstCommunityInviteCodeState::Set(migrate_to_v2_invite_code)
    );

    Ok(())
}

async fn test_fee_remittance_on_startup(dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mut td = TestDevice::new();
    let bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;
    setStabilityPoolModuleFediFeeSchedule(bridge, federation.rpc_federation_id(), 21_000, 0)
        .await?;

    // Receive ecash, verify no pending or outstanding fees
    let ecash = cli_generate_ecash(Amount::from_msats(6_000_000)).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;
    assert_eq!(ecash_receive_amount, federation.get_balance().await);
    assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
    assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

    // Make SP deposit, verify pending fees
    let amount_to_deposit = Amount::from_msats(5_000_000);
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    assert_eq!(
        Amount::from_msats(105_000),
        federation.get_pending_fedi_fees().await
    );
    assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

    // Wait for SP deposit to be accepted, verify outstanding fees
    loop {
        // Wait until deposit operation succeeds
        // Initiated -> TxAccepted -> Success
        if td
            .event_sink()
            .num_events_of_type("stabilityPoolDeposit".into())
            == 3
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
    assert_eq!(
        Amount::from_msats(105_000),
        federation.get_outstanding_fedi_fees().await
    );

    // No fee can be remitted just yet cuz we haven't mocked invoice endpoint

    // Extract data dir and drop bridge
    let federation_id = federation.federation_id();
    td.shutdown().await?;

    // Mock fee remittance endpoint
    // some of amount is gateway fees
    let fedi_fee_invoice = dev_fed.gw_ldk.create_invoice(102_691).await?;
    let mut mock_fedi_api = MockFediApi::default();
    mock_fedi_api.set_fedi_fee_invoice(fedi_fee_invoice.clone());
    td.with_fedi_api(mock_fedi_api.into());
    let new_bridge = td.bridge_full().await?;

    // Wait for fedi fee to be remitted
    retry("fedi fee remitting", aggressive_backoff(), || {
        dev_fed
            .gw_ldk
            .wait_bolt11_invoice(fedi_fee_invoice.payment_hash().consensus_encode_to_vec())
    })
    .await?;

    // Ensure outstanding fee has been cleared
    let federation = wait_for_federation_loading(new_bridge, &federation_id.to_string()).await?;
    assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
    assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

    Ok(())
}

async fn test_fee_remittance_post_successful_tx(dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // Mock fee remittance endpoint
    // some of amount is gateway fees
    let fedi_fee_invoice = dev_fed.gw_ldk.create_invoice(102_691).await?;
    let mut mock_fedi_api = MockFediApi::default();
    mock_fedi_api.set_fedi_fee_invoice(fedi_fee_invoice.clone());
    let mut td = TestDevice::new();
    td.with_fedi_api(Arc::new(mock_fedi_api));

    // Setup bridge, join test federation, set SP send fee ppm
    let bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;
    setStabilityPoolModuleFediFeeSchedule(bridge, federation.rpc_federation_id(), 21_000, 0)
        .await?;

    // Receive ecash, verify no pending or outstanding fees
    let ecash = cli_generate_ecash(Amount::from_msats(10_000_000)).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;
    assert_eq!(ecash_receive_amount, federation.get_balance().await);
    assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
    assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

    // Make SP deposit, verify pending fees
    let amount_to_deposit = Amount::from_msats(5_000_000);
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    assert_eq!(
        Amount::from_msats(105_000),
        federation.get_pending_fedi_fees().await
    );
    assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

    // Wait for SP deposit to be accepted, verify fee remittance
    loop {
        // Wait until deposit operation succeeds
        // Initiated -> TxAccepted -> Success
        if td
            .event_sink()
            .num_events_of_type("stabilityPoolDeposit".into())
            == 3
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    // Wait for fedi fee to be remitted
    retry("fedi fee remitting", aggressive_backoff(), || {
        dev_fed
            .gw_ldk
            .wait_bolt11_invoice(fedi_fee_invoice.payment_hash().consensus_encode_to_vec())
    })
    .await?;
    // Ensure outstanding fee has been cleared
    assert_eq!(Amount::ZERO, federation.get_pending_fedi_fees().await);
    assert_eq!(Amount::ZERO, federation.get_outstanding_fedi_fees().await);

    Ok(())
}

async fn test_recurring_lnurl(dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let federation = td.join_default_fed().await?;
    let lnurl1 = federation
        .get_recurringd_lnurl(dev_fed.recurringd.api_url.clone())
        .await?;
    assert!(lnurl1.starts_with("lnurl"));
    let lnurl2 = federation
        .get_recurringd_lnurl(dev_fed.recurringd.api_url.clone())
        .await?;
    // lnurl must stay same if safe url is same
    assert_eq!(lnurl1, lnurl2);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_bridge_handles_federation_offline() -> anyhow::Result<()> {
    let mut dev_fed = DevFed::new_with_setup(4).await?;
    let invite_code = dev_fed.fed.invite_code()?;

    let mut td = TestDevice::new();
    let original_balance;

    // join federation while federation is running
    {
        let bridge = td.bridge_full().await?;
        let rpc_federation = joinFederation(bridge, invite_code.clone(), false).await?;
        let federation = bridge
            .federations
            .get_federation_maybe_recovering(&rpc_federation.id.0)?;
        use_lnd_gateway(&federation).await?;

        // receive ecash
        let ecash_receive_amount = fedimint_core::Amount::from_msats(10000);
        let ecash = cli_generate_ecash(ecash_receive_amount).await?;
        receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
        wait_for_ecash_reissue(&federation).await?;
        original_balance = federation.get_balance().await;
        assert!(original_balance.msats != 0);

        drop(federation);
        td.shutdown().await?;
    }

    // Stop federation
    dev_fed.fed.terminate_all_servers().await?;

    // Bridge should initialize successfully even though federation is down
    {
        let bridge = td.bridge_full().await?;
        assert!(bridge.federations.get_federations_map().len() == 1);

        // Wait for federation ready event for a max of 2s
        let rpc_federation = fedimint_core::task::timeout(Duration::from_secs(2), async move {
            'check: loop {
                let events = td.event_sink().events();
                for (_, ev_body) in events.iter().rev().filter(|(kind, _)| kind == "federation") {
                    let ev_body =
                        serde_json::from_str::<RpcFederationMaybeLoading>(ev_body).unwrap();
                    match ev_body {
                        RpcFederationMaybeLoading::Loading { .. } => (),
                        RpcFederationMaybeLoading::Failed { error, id } => {
                            bail!("federation {:?} loading failed: {}", id, error.detail)
                        }
                        RpcFederationMaybeLoading::Ready(rpc_federation) => {
                            assert!(rpc_federation.invite_code == invite_code);
                            break 'check Ok::<_, anyhow::Error>(rpc_federation);
                        }
                    }
                }
                fedimint_core::task::sleep_in_test(
                    "waiting for federation ready event",
                    Duration::from_millis(100),
                )
                .await;
            }
        })
        .await??;

        // Ensure balance is still the same
        assert_eq!(rpc_federation.balance.0, original_balance);
    }
    Ok(())
}

async fn test_existing_device_identifier_v2_migration(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    INIT_TRACING.call_once(|| {
        TracingSetup::default()
            .init()
            .expect("Failed to initialize tracing");
    });

    // Test: existing device, successfully registered with ID v1
    //         ownership transfer to ID v2 successful
    //         recreate bridge with same ID, all good
    //         recreate bridge with different ID, borked

    // Create data directory and initialize bridge
    let mut td = TestDevice::new();
    {
        td.with_device_identifier("bridge:test:d4d743a7-b343-48e3-a5f9-90d032af3e98");
        let bridge = td.bridge_full().await?;

        // Tweak AppState to simulate existing install with only v1 identifier.
        // Transforms a freshly-created AppStateRaw that only has an
        // encrypted_device_identifier_v2 to look like an existing AppStateRaw
        // that only has an encrypted_device_identifier_v1.
        let app_state_raw_clone = bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.clone())
            .await;
        let mut app_state_raw_json = serde_json::to_value(app_state_raw_clone)?;
        let app_state_raw_object = app_state_raw_json
            .as_object_mut()
            .ok_or(anyhow!("App state must be valid JSON object"))?;
        app_state_raw_object.insert(
            "encrypted_device_identifier_v1".to_string(),
            serde_json::Value::String(bridge.runtime.app_state.encrypted_device_identifier().await),
        );
        app_state_raw_object.insert(
            "encrypted_device_identifier_v2".to_string(),
            serde_json::Value::Null,
        );

        td.shutdown().await?;
        td.storage()
            .await?
            .write_file(
                Path::new(FEDI_FILE_V0_PATH),
                serde_json::to_vec(&app_state_raw_json)?,
            )
            .await?;
        let global_db = td.storage().await?.federation_database_v2("global").await?;
        // delete app state from db to trigger.
        let bridge_db = global_db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        let mut dbtx = bridge_db.begin_transaction().await;
        dbtx.raw_remove_by_prefix(&[BridgeDbPrefix::AppState as u8])
            .await?;
        dbtx.commit_tx().await;
    }

    // Set up bridge again using same data_dir but now pass in v2 identifier
    {
        td.with_device_identifier("bridge_2:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724");
        let bridge = td.bridge_full().await?;
        // Verify ownership transfer to v2 identifier is successful (v1 must be None)
        fedimint_core::task::timeout(Duration::from_secs(2), async {
            loop {
                #[allow(deprecated)]
                if bridge
                    .runtime
                    .app_state
                    .encrypted_device_identifier_v1()
                    .await
                    .is_none()
                {
                    break Ok::<_, anyhow::Error>(());
                }
            }
        })
        .await??;
        td.shutdown().await?;
    }

    // Recreate bridge with same v2 ID, full bridge init should be successful
    {
        let _bridge = td.bridge_full().await?;
        td.shutdown().await?;
    }

    // Try to recreate bridge with different v2 ID, full bridge init should fail
    {
        td.with_device_identifier("bridge_3:test:70c25d23-bfac-4aa2-81c3-d6f5e79ae724");
        let bridge = td.bridge_maybe_onboarding().await?;
        assert!(bridge.runtime().is_ok());
        assert!(bridge.full().is_err());
        td.shutdown().await?;
    }

    Ok(())
}

async fn test_nip44_encrypt_and_decrypt(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new();
    let bridge = td.bridge_full().await?;

    let other_nsec = "nsec1u66skyesf45vd9w0u63q7qhfj2wnhjplxkympvh5t2q28h0lvz8qgglls9";
    let other_npub = "npub1e9uht8sv5msnz7gwartsntt0w2v8tzxyrzemk793lzs0ulegr4es0fafdx";
    let our_npub = getNostrPubkey(bridge).await?.npub;

    // Simulate us sending a message to other
    let our_plaintext = "Hey, Fedi is cool!";
    let ciphertext =
        nostrEncrypt(bridge, other_npub.to_string(), our_plaintext.to_string()).await?;

    // Other decrypts our encrypted message
    let other_decrypted = nip44::decrypt(
        &nostr::SecretKey::parse(other_nsec)?,
        &nostr::PublicKey::parse(&our_npub)?,
        ciphertext,
    )?;

    assert_eq!(our_plaintext, other_decrypted);

    // Simulate other sending a message to us
    let other_plaintext = "I know right, it is pretty cool!";
    let ciphertext = nip44::encrypt(
        &nostr::SecretKey::parse(other_nsec)?,
        &nostr::PublicKey::parse(&our_npub)?,
        other_plaintext,
        nip44::Version::V2,
    )?;

    // We decrypt other's message
    let our_decrypted = nostrDecrypt(bridge, other_npub.to_string(), ciphertext).await?;
    assert_eq!(other_plaintext, our_decrypted);

    Ok(())
}

async fn test_stability_pool_external_transfer_in(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // This test verifies that external SPv2 transfers (where someone transfers
    // stable balance to a user without their client's involvement) are properly
    // recorded in the transaction history with backfilled operation logs.

    // Create two test devices - sender and receiver
    let td_sender = TestDevice::new();
    let bridge_sender = td_sender.bridge_full().await?;
    let federation_sender = td_sender.join_default_fed().await?;

    let td_receiver = TestDevice::new();
    let federation_receiver = td_receiver.join_default_fed().await?;

    // Sender receives some ecash first
    let initial_balance = Amount::from_sats(500_000);
    let ecash = cli_generate_ecash(initial_balance).await?;
    federation_sender
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation_sender).await?;

    // Sender deposits to SPv2
    let deposit_amount = Amount::from_sats(400_000);
    spv2DepositToSeek(
        federation_sender.clone(),
        RpcAmount(deposit_amount),
        FrontendMetadata::default(),
    )
    .await?;

    // Wait for deposit to complete
    loop {
        if td_sender
            .event_sink()
            .num_events_of_type("spv2Deposit".into())
            == 3
        {
            break;
        }
        fedimint_core::task::sleep_in_test("spv2 deposit", Duration::from_millis(100)).await;
    }

    let receiver_payment_address =
        spv2OurPaymentAddress(federation_receiver.clone(), false).await?;
    let parsed =
        spv2ParsePaymentAddress(&bridge_sender.federations, receiver_payment_address).await?;
    let account_id = parsed.account_id;

    // Sender transfers to receiver (external transfer from receiver's perspective)
    let transfer_amount = RpcFiatAmount(10_00);
    spv2Transfer(
        federation_sender.clone(),
        account_id,
        transfer_amount,
        FrontendMetadata::default(),
    )
    .await?;

    // Wait for transfer to complete on sender side
    loop {
        if td_sender
            .event_sink()
            .num_events_of_type("spv2Transfer".into())
            == 2
        {
            break;
        }
        fedimint_core::task::sleep_in_test("spv2 transfer", Duration::from_millis(100)).await;
    }

    // Give some time for the transfer to be processed
    fedimint_core::task::sleep(Duration::from_secs(2)).await;

    let updated_receiver_txs = loop {
        federation_receiver.spv2_force_sync();
        let updated_receiver_txs =
            listTransactions(federation_receiver.clone(), None, None).await?;
        if !updated_receiver_txs.is_empty() {
            break updated_receiver_txs;
        }
        fedimint_core::task::sleep_in_test("waiting for transaction", Duration::from_millis(10))
            .await;
    };

    // Find the transfer-in transaction
    let transfer_in_tx = updated_receiver_txs
        .iter()
        .find(|tx| {
            matches!(
                tx,
                Ok(RpcTransactionListEntry {
                    transaction: RpcTransaction {
                        kind: RpcTransactionKind::SPV2TransferIn { .. },
                        ..
                    },
                    ..
                })
            )
        })
        .expect("Should find transfer-in transaction in receiver's history");

    // Verify the transaction details
    match &transfer_in_tx {
        Ok(RpcTransactionListEntry {
            transaction:
                RpcTransaction {
                    kind:
                        RpcTransactionKind::SPV2TransferIn {
                            state:
                                RpcSPV2TransferInState::CompletedTransfer {
                                    amount,
                                    fiat_amount,
                                    ..
                                },
                        },
                    ..
                },
            ..
        }) => {
            // The amount should match what was transferred
            assert!(amount.0.msats > 0, "Transfer amount should be positive");
            assert_eq!(
                *fiat_amount, 10_00,
                "Fiat amount should match transferred amount"
            );
        }
        _ => panic!("Expected SPV2TransferIn transaction kind"),
    }

    Ok(())
}
