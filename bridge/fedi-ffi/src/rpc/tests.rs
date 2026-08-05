use std::collections::{BTreeMap, HashMap};
use std::ops::ControlFlow;
use std::panic;
use std::path::Path;
use std::str::{self, FromStr};
use std::sync::Once;
use std::thread::available_parallelism;
use std::time::Duration;

use anyhow::{Context, anyhow, bail};
use api_types::invoice_generator::FirstCommunityInviteCodeState;
use assert_matches::assert_matches;
use bridge::RuntimeExt as _;
use devi::DevFed;
use devimint::cmd;
use devimint::util::FedimintCli;
use federations::federation_sm::FederationState;
use federations::federation_v2::FederationV2;
use federations::fedi_fee::{FediFeeStream, parse_fedi_guardian_fee_config};
use fedi_social_client::common::VerificationDocument;
use fedimint_core::Amount;
use fedimint_core::db::IDatabaseTransactionOpsCore;
use fedimint_core::encoding::Encodable;
use fedimint_core::task::sleep_in_test;
use fedimint_core::util::backoff_util::aggressive_backoff;
use fedimint_core::util::{BoxFuture, FmtCompact as _, FmtCompactAnyhow as _, retry};
use fedimint_logging::TracingSetup;
use nostr::nips::nip44;
use rpc_types::communities::{CommunityInvite, CommunityInviteV1};
use rpc_types::event::TransactionEvent;
use rpc_types::{
    RpcLnPayState, RpcLnReceiveState, RpcOOBReissueState, RpcOnchainDepositState,
    RpcOnchainWithdrawState, RpcReturningMemberStatus, RpcSPV2TransferInState,
    RpcTransactionDirection, RpcTransactionKind,
};
use runtime::constants::{COMMUNITY_V1_TO_V2_MIGRATION_KEY, FEDI_FILE_V0_PATH, MILLION};
use runtime::db::BridgeDbPrefix;
use runtime::envs::USE_UPSTREAM_FEDIMINTD_ENV;
use runtime::storage::BRIDGE_DB_PREFIX;
use runtime::storage::state::CommunityJson;
use stability_pool_client::common::Account;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tracing::{info, warn};

mod matrix;
mod multispend_tests;
mod nostr_tests;
mod sp_transfer_tests;
mod utils;

// nosemgrep: ban-wildcard-imports
use crate::rpc::*;
use crate::test_device::{MockFediApi, TestDevice, use_lnd_gateway};

static INIT_TRACING: Once = Once::new();

fn get_fixture_dir() -> PathBuf {
    std::env::current_dir().unwrap().join("../fixtures")
}

async fn amount_from_ecash(ecash_string: String) -> anyhow::Result<fedimint_core::Amount> {
    if let Ok(ecash) = fedimint_mint_client::OOBNotes::from_str(&ecash_string) {
        Ok(ecash.total_amount())
    } else if let Ok(ecash) = fedimint_core::base32::decode_prefixed::<fedimint_mintv2_client::ECash>(
        fedimint_core::base32::FEDIMINT_PREFIX,
        &ecash_string,
    ) {
        Ok(ecash.amount())
    } else {
        bail!("failed to parse ecash")
    }
}

async fn cli_generate_ecash(amount: fedimint_core::Amount) -> anyhow::Result<String> {
    // On a kind-two federation the internal client's funds live in mintv2;
    // the v1 `spend` command has no module (or no balance) to draw from.
    if devimint::util::supports_mint_v2() {
        let ecash_string = cmd!(
            FedimintCli,
            "module",
            "mintv2",
            "send",
            amount.msats.to_string()
        )
        .out_json()
        .await?
        .as_str()
        .map(|s| s.to_owned())
        .context("mintv2 send must return the ecash string")?;
        return Ok(ecash_string);
    }
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

async fn cli_receive_ecash(ecash: String) -> anyhow::Result<()> {
    // The bridge emits mintv2 ecash on a kind-two federation; the v1
    // `reissue` command cannot decode it.
    if devimint::util::supports_mint_v2() {
        cmd!(FedimintCli, "module", "mintv2", "receive", ecash)
            .run()
            .await?;
        return Ok(());
    }
    cmd!(FedimintCli, "reissue", ecash).run().await?;
    Ok(())
}

async fn cli_submit_guardian_fee_meta(
    remittance_account: String,
    guardian_fee_send_ppm: u64,
) -> anyhow::Result<()> {
    let fed_size = std::env::var("FM_FED_SIZE")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(4);
    let meta_json = serde_json::json!({
        "stability_pool_disabled": "false",
        "multispend_disabled": "false",
        "fedi:guardian_fee_send_ppm": guardian_fee_send_ppm.to_string(),
        "fedi:guardian_fee_remittance_account": remittance_account,
    })
    .to_string();

    for peer in 0..fed_size {
        cmd!(
            FedimintCli,
            "--our-id",
            peer,
            "--password",
            "pass",
            "module",
            "meta",
            "submit",
            &meta_json,
        )
        .run()
        .await?;
    }

    Ok(())
}

async fn cli_wait_for_guardian_fee_meta(expected_send_ppm: u64) -> anyhow::Result<()> {
    retry("wait meta consensus", aggressive_backoff(), || async {
        let value = cmd!(FedimintCli, "module", "meta", "get")
            .out_json()
            .await?;
        let value = value
            .get("value")
            .and_then(serde_json::Value::as_object)
            .context("meta consensus value is missing")?;
        let send_ppm = value
            .get("fedi:guardian_fee_send_ppm")
            .and_then(serde_json::Value::as_str)
            .context("guardian fee send ppm missing from meta consensus")?;
        if send_ppm != expected_send_ppm.to_string() {
            bail!("guardian fee send ppm not in consensus yet");
        }
        let remittance_account = value
            .get("fedi:guardian_fee_remittance_account")
            .and_then(serde_json::Value::as_str)
            .context("guardian remittance account missing from meta consensus")?;
        let _: Account = serde_json::from_str(remittance_account)
            .context("invalid guardian remittance account in meta consensus")?;
        Ok(())
    })
    .await
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

async fn bitcoin_cli_new_address() -> anyhow::Result<String> {
    let btc_port = std::env::var("FM_PORT_BTC_RPC").unwrap_or(String::from("18443"));
    cmd!(
        BitcoinCli,
        "-rpcport={btc_port}",
        "-rpcwallet=",
        "getnewaddress"
    )
    .out_string()
    .await
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

// The lnv2 recurringd URL is hardcoded to the Fedi-operated production
// service, which a dev federation cannot use, so recurringd-dependent tests
// only run on kind-one (whose v1 path takes the devimint recurringd URL
// from federation meta).
fn should_skip_test_needing_dev_recurringd() -> bool {
    if !devimint::util::supports_lnv1() {
        info!("Skipping test as the lnv2 recurringd URL is hardcoded to production");
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
                (stringify!($test_name), Box::pin($test_name(dev_fed.clone())) as BoxFuture<anyhow::Result<()>>)
            ),*]
        };
    }

    let tests = tests_array![
        test_join_and_leave_and_join,
        test_join_concurrent,
        matrix::test_matrix_login,
        matrix::test_matrix_access_token_expiry_repro,
        matrix::test_matrix_dms,
        matrix::test_matrix_recovery,
        matrix::test_matrix_create_room,
        matrix::test_matrix_message_reactions,
        matrix::test_send_and_download_attachment,
        matrix::test_matrix_pinned_messages,
        multispend_tests::test_multispend_minimal,
        multispend_tests::test_multispend_group_acceptance,
        multispend_tests::test_multispend_group_rejection,
        multispend_tests::test_multispend_last_seen_cache_churn_does_not_panic,
        sp_transfer_tests::test_end_to_end,
        sp_transfer_tests::test_receiver_joins_federation_later,
        test_lightning_send_and_receive,
        test_lnurl_receive,
        test_ecash,
        test_ecash_duplicate_receive_rejected,
        test_ecash_overissue,
        test_on_chain,
        test_on_chain_v2,
        test_walletv2_awaiting_deposit,
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
        nostr_tests::test_nostr_community_deletion,
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
            Err(e) => {
                warn!("test {} failed: {}", &tests_names[&e.id()], e.fmt_compact());
                // goal: cancel background tasks before returning and ending tokio runtime
                // so devfed only gets dropped while tokio runtime is alive
                tests_set.shutdown().await;
                bail!("test {} failed: {}", &tests_names[&e.id()], e.fmt_compact());
            }
            Ok((id, Err(e))) => {
                warn!(
                    "test {} failed: {}",
                    &tests_names[&id],
                    e.fmt_compact_anyhow()
                );
                // goal: cancel background tasks before returning and ending tokio runtime
                // so devfed only gets dropped while tokio runtime is alive
                tests_set.shutdown().await;
                bail!(
                    "test {} failed: {}",
                    &tests_names[&id],
                    e.fmt_compact_anyhow()
                );
            }
            Ok((id, Ok(_))) => {
                info!("test {} OK", &tests_names[&id]);
            }
        }
    }
    Ok(())
}

async fn test_doesnt_overwrite_seed_in_invalid_fedi_file(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
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
    let td = TestDevice::new().await?;
    let bridge = td.bridge_full().await?;
    let env_invite_code = std::env::var("FM_INVITE_CODE").unwrap();
    joinFederation(bridge, env_invite_code.clone(), false).await?;

    // Can't re-join a federation we're already a member of
    assert!(
        joinFederation(bridge, env_invite_code.clone(), false)
            .await
            .is_err()
    );

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
    let mut tb = TestDevice::new().await?;
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
async fn test_lightning_send_and_receive(dev_fed: DevFed) -> anyhow::Result<()> {
    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_lightning_send_and_receive_with_fedi_fees(&dev_fed, send_ppm, receive_ppm).await?;
    }

    Ok(())
}

async fn test_lightning_send_and_receive_with_fedi_fees(
    dev_fed: &DevFed,
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
    let (bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);
    // Pin the LND gateway: the external side of this test pays and issues
    // invoices via the LDK gateway's node, so automatic selection landing
    // on that same gateway would make it pay itself.
    use_lnd_gateway(federation).await?;
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

    assert!(
        listTransactions(federation.clone(), None, None)
            .await?
            .iter()
            .any(|entry| matches!(
                entry,
                Ok(RpcTransactionListEntry {
                    transaction: RpcTransaction {
                        kind: RpcTransactionKind::LnReceive {
                            ln_invoice,
                            state: Some(
                                RpcLnReceiveState::Created
                                    | RpcLnReceiveState::WaitingForPayment { .. }
                            ),
                            ..
                        },
                        ..
                    },
                    ..
                }) if *ln_invoice == invoice_string
            )),
        "unpaid receive invoice must show as pending in transaction history"
    );

    dev_fed
        .gw_ldk
        .client()
        .pay_invoice(Bolt11Invoice::from_str(&invoice_string).expect("Invoice must be valid"))
        .await?;

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

    let expected_balance = receive_amount.checked_sub(fedi_fee).expect("Can't fail");
    let balance = federation.get_balance().await;
    if devimint::util::supports_mint_v2() {
        // On kind-two the lnv2 gateway receive fee and the mintv2 issuance
        // fees come out of the received amount. Allow the same 10% slack as
        // the dev-fed peg-in.
        assert!(
            balance <= expected_balance
                && balance >= Amount::from_msats(expected_balance.msats * 9 / 10),
            "balance {balance} out of range for expected {expected_balance}"
        );
    } else {
        assert_eq!(expected_balance, balance);
    }

    // get invoice
    let send_amount = Amount::from_sats(50);
    let invoice = dev_fed
        .gw_ldk
        .client()
        .create_invoice(send_amount.msats)
        .await?;

    assert!(
        !getPrevPayInvoiceResult(federation.clone(), invoice.to_string())
            .await?
            .completed,
        "unpaid invoice must not report a completed previous payment"
    );

    // check balance
    payInvoice(
        federation.clone(),
        invoice.to_string(),
        FrontendMetadata::default(),
    )
    .await?;

    dev_fed
        .gw_ldk
        .client()
        .wait_bolt11_invoice(invoice.payment_hash().consensus_encode_to_vec())
        .await?;

    // Chat payment receipts rely on this to detect an already-paid invoice.
    assert!(
        getPrevPayInvoiceResult(federation.clone(), invoice.to_string())
            .await?
            .completed,
        "paid invoice must report a completed previous payment"
    );

    assert!(
        listTransactions(federation.clone(), None, None)
            .await?
            .iter()
            .any(|entry| matches!(
                entry,
                Ok(RpcTransactionListEntry {
                    transaction: RpcTransaction {
                        kind: RpcTransactionKind::LnPay {
                            ln_invoice,
                            state: Some(RpcLnPayState::Success { .. }),
                            ..
                        },
                        ..
                    },
                    ..
                }) if *ln_invoice == invoice.to_string()
            )),
        "paid send must show as succeeded in transaction history"
    );

    // TODO shaurya unsure how to account for gateway fee when verifying fedi fee
    // amount
    Ok(())
}

async fn test_lnurl_receive(dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_needing_dev_recurringd() {
        return Ok(());
    }

    // Try to pay same user 10x via lnurl
    {
        let td = TestDevice::new().await?;
        let (_bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);
        let td_lnurl = getRecurringdLnurl(federation.clone()).await?;

        for count in 1..=10 {
            let prev_balance = federation.get_balance().await;

            // Use static method to get invoice from LNURL
            let receive_amount = fedimint_core::Amount::from_sats(count * 100);
            let invoice =
                fedimint_ln_client::get_invoice(&td_lnurl, Some(receive_amount), None).await?;

            // Pay invoice using gateway's node
            dev_fed.gw_ldk.client().pay_invoice(invoice).await?;

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
                    if matches!(
                        transaction.kind,
                        RpcTransactionKind::LnRecurringdReceive {
                            state: Some(RpcLnReceiveState::Claimed),
                            ..
                        }
                    ) && transaction.amount.0.msats == count * 100 * 1000
                    {
                        break 'check;
                    }
                }

                fedimint_core::task::sleep_in_test(
                    "waiting for external lnurl recv",
                    Duration::from_millis(1000),
                )
                .await;
            }

            assert_eq!(
                receive_amount,
                federation.get_balance().await.saturating_sub(prev_balance),
            );
        }
    }

    // Try to pay 10 different users back-to-back with lnurl
    {
        for _count in 1..=10 {
            let td = TestDevice::new().await?;
            let (_bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);
            let td_lnurl = getRecurringdLnurl(federation.clone()).await?;

            let prev_balance = federation.get_balance().await;

            // Use static method to get invoice from LNURL
            let receive_amount = fedimint_core::Amount::from_sats(100);
            let invoice =
                fedimint_ln_client::get_invoice(&td_lnurl, Some(receive_amount), None).await?;

            // Pay invoice using gateway's node
            dev_fed.gw_ldk.client().pay_invoice(invoice).await?;

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
                    if matches!(
                        transaction.kind,
                        RpcTransactionKind::LnRecurringdReceive {
                            state: Some(RpcLnReceiveState::Claimed),
                            ..
                        }
                    ) {
                        break 'check;
                    }
                }

                fedimint_core::task::sleep_in_test(
                    "waiting for external lnurl recv",
                    Duration::from_millis(1000),
                )
                .await;
            }

            assert_eq!(
                receive_amount,
                federation.get_balance().await.saturating_sub(prev_balance),
            );
        }
    }

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
    let td = TestDevice::new().await?;
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
    wait_for_balance(
        federation,
        ecash_receive_amount
            .checked_sub(receive_fedi_fee)
            .expect("Can't fail"),
    )
    .await?;

    // spend ecash
    // If fedi_fee != 0, we expect this to fail since we cannot spend all of
    // ecash_receive_amount
    if receive_fedi_fee != Amount::ZERO {
        assert!(
            generateEcash(
                federation.clone(),
                RpcAmount(ecash_receive_amount),
                false,
                FrontendMetadata::default()
            )
            .await
            .is_err()
        );
    }
    let ecash_send_amount = Amount::from_msats(ecash_receive_amount.msats / 2);
    let send_fedi_fee =
        Amount::from_msats((ecash_send_amount.msats * fedi_fees_send_ppm).div_ceil(MILLION));
    let estimated_send_fees =
        estimateEcashFees(federation.clone(), RpcAmount(ecash_send_amount)).await?;
    assert_eq!(RpcAmount(send_fedi_fee), estimated_send_fees.fedi_app_fee);
    assert_eq!(
        RpcAmount(Amount::ZERO),
        estimated_send_fees.fedi_guardian_fee
    );
    assert_eq!(RpcAmount(Amount::ZERO), estimated_send_fees.network_fee);
    assert_eq!(RpcAmount(Amount::ZERO), estimated_send_fees.federation_fee);

    let send_ecash = generateEcash(
        federation.clone(),
        RpcAmount(ecash_send_amount),
        false,
        FrontendMetadata::default(),
    )
    .await?
    .ecash;

    wait_for_balance(
        federation,
        ecash_receive_amount
            .checked_sub(receive_fedi_fee)
            .expect("Can't fail")
            .checked_sub(ecash_send_amount)
            .expect("Can't fail")
            .checked_sub(send_fedi_fee)
            .expect("Can't fail"),
    )
    .await?;

    // receive with fedimint-cli
    cli_receive_ecash(send_ecash).await?;

    Ok(())
}

// Mintv1 transfers are fee-free, so balances match test expectations exactly;
// mintv2 charges per-note fees the expectations don't model. Accept up to a
// 1% shortfall there.
fn assert_balance_close_enough(expected: fedimint_core::Amount, actual: fedimint_core::Amount) {
    if devimint::util::supports_mint_v2() {
        assert!(
            actual <= expected && expected.msats - actual.msats <= expected.msats / 100,
            "balance {actual} too far below expected {expected}"
        );
    } else {
        assert_eq!(expected, actual, "balance mismatch");
    }
}

// A receive's fedi fee is subtracted from the virtual balance only once the
// success accrual runs, which happens asynchronously after the operation
// settles (pending receive fees are tracked as ppm, not amounts); poll for the
// expected balance instead of asserting instantly.
async fn wait_for_balance(
    federation: &FederationV2,
    expected: fedimint_core::Amount,
) -> Result<(), anyhow::Error> {
    devimint::util::poll("waiting for expected balance", || async {
        let balance = federation.get_balance().await;
        if balance == expected {
            Ok(())
        } else {
            Err(ControlFlow::Continue(anyhow!(
                "balance {balance}, expected {expected}"
            )))
        }
    })
    .await
}

// A mintv2 transaction's change is issued by state machines that keep running
// after the operation reports success; wait for them so the balance includes
// the change.
async fn wait_for_operation_settlement(federation: &FederationV2, operation_id: OperationId) {
    while federation.client.has_active_states(operation_id).await {
        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }
}

// The balance credited by an ecash receive: the face value minus mint fees.
// Checks it against the face value and returns it for downstream expectations.
async fn balance_after_receiving_ecash(
    federation: &FederationV2,
    face_amount: fedimint_core::Amount,
) -> fedimint_core::Amount {
    let balance = federation.get_balance().await;
    assert_balance_close_enough(face_amount, balance);
    balance
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

/// Regression test: receiving the same ecash notes a second time must fail
/// instead of reporting success.
///
/// mintv2's client-side `receive()` derives the operation id from the notes
/// and, for notes that were already received, returns the existing operation
/// id as if the call had just succeeded. The bridge then reports success to
/// the caller and writes the pending fedi receive fee again for the same
/// operation, without any new funds arriving. The v1 mint rejects a duplicate
/// receive; mintv2 must observably do the same.
async fn test_ecash_duplicate_receive_rejected(_dev_fed: DevFed) -> anyhow::Result<()> {
    // Receiver with a nonzero receive fee, so a double-charged fee would be
    // observable in the outstanding fee accrual.
    let td_recv = TestDevice::new().await?;
    let (bridge, receiver) = (
        td_recv.bridge_full().await?,
        td_recv.join_default_fed().await?,
    );
    setMintModuleFediFeeSchedule(bridge, receiver.rpc_federation_id(), 0, 10_000).await?;

    let ecash = cli_generate_ecash(Amount::from_msats(100_000)).await?;

    receiveEcash(receiver.clone(), ecash.clone(), FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(receiver).await?;
    let balance_after_receive = receiver.get_balance().await;
    let fees_after_receive = receiver
        .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
        .await;

    let second_receive = receiveEcash(receiver.clone(), ecash, FrontendMetadata::default()).await;
    assert!(
        second_receive.is_err(),
        "receiving the same ecash twice must fail, got {second_receive:?}"
    );
    assert_eq!(
        receiver.get_balance().await,
        balance_after_receive,
        "duplicate receive must not change the balance"
    );
    assert_eq!(
        receiver
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await,
        fees_after_receive,
        "duplicate receive must not accrue another receive fee"
    );

    // Concurrent duplicates: both calls can pass any client-side fast path, so
    // the atomic operation-id check in fedimint's transaction submission must
    // let exactly one win.
    let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
    let (first, second) = tokio::join!(
        receiveEcash(receiver.clone(), ecash.clone(), FrontendMetadata::default()),
        receiveEcash(receiver.clone(), ecash, FrontendMetadata::default()),
    );
    assert_eq!(
        usize::from(first.is_ok()) + usize::from(second.is_ok()),
        1,
        "exactly one concurrent duplicate receive must succeed, got {first:?} and {second:?}"
    );
    wait_for_ecash_reissue(receiver).await?;
    Ok(())
}

async fn test_ecash_overissue(_dev_fed: DevFed) -> anyhow::Result<()> {
    // The tight fee accounting here is v1-mint-specific: mintv2 charges
    // per-note fees and issues change asynchronously, so repeated tiny sends
    // race the change issuance and the exact math doesn't hold. The mintv2
    // send/receive roundtrip is covered by test_ecash.
    if devimint::util::supports_mint_v2() {
        return Ok(());
    }

    let td = TestDevice::new().await?;
    let (bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);

    // receive ecash
    let ecash_requested_amount = fedimint_core::Amount::from_msats(10000);
    let ecash = cli_generate_ecash(ecash_requested_amount).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(federation.as_ref()).await?;

    // check balance
    let credited = balance_after_receiving_ecash(federation.as_ref(), ecash_receive_amount).await;

    let fedi_fee_ppm = bridge
        .federations
        .fedi_fee_helper
        .get_fee_ppm(
            FediFeeStream::App,
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
    assert_balance_close_enough(
        credited
            .checked_sub((iteration_amount + iteration_expected_fee) * iterations)
            .expect("Can't fail"),
        federation.get_balance().await,
    );

    Ok(())
}

// on chain is marked experimental for 0.4
async fn test_on_chain(_dev_fed: DevFed) -> anyhow::Result<()> {
    // This test is v1-shaped throughout: it expects a deposit operation to
    // exist per generated address and reads the v1 wallet fee consensus,
    // while walletv2 deposits are auto-claimed by a background scanner with
    // no per-address operation. See `test_on_chain_v2` for the kind-two
    // counterpart.
    if devimint::util::supports_wallet_v2() {
        return Ok(());
    }

    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_on_chain_with_fedi_fees(send_ppm, receive_ppm).await?;
        test_on_chain_with_fedi_fees_with_restart(send_ppm, receive_ppm).await?;
    }

    Ok(())
}

/// The kind-two counterpart of `test_on_chain`. walletv2 has no per-address
/// deposit operation — the background scanner creates one when it spots the
/// UTXO — so this polls for the deposit to appear and claim rather than
/// asserting an operation exists the moment the address is funded. The peg-in
/// fee is read off the resulting transaction instead of from the v1 wallet's
/// fee consensus.
async fn test_on_chain_v2(_dev_fed: DevFed) -> anyhow::Result<()> {
    if !devimint::util::supports_wallet_v2() {
        info!("Skipping kind-two onchain test on a kind-one federation");
        return Ok(());
    }

    let td = TestDevice::new().await?;
    let (bridge, federation) = (td.bridge_full().await?, td.join_default_fed().await?);

    // WalletOpsV2 resolves fedi fees under the v1 wallet kind, so the v1
    // schedule setter is still the right one here.
    setWalletModuleFediFeeSchedule(bridge, federation.rpc_federation_id(), 0, 0).await?;

    let address = generateAddress(federation.clone(), FrontendMetadata::default()).await?;
    bitcoin_cli_send_to_address(&address, "0.1").await?;

    // Poll until the scanner has created the deposit operation and it reaches a
    // claimed state. `peg_in_fees` comes from the walletv2 receive meta.
    let peg_in_fees = devimint::util::poll("waiting for walletv2 deposit claim", || async {
        let txns = listTransactions(federation.clone(), None, None).await;
        for entry in txns.into_iter().flatten().flatten() {
            if let RpcTransactionKind::OnchainDeposit {
                onchain_address,
                peg_in_fees,
                state: Some(RpcOnchainDepositState::Claimed(_)),
            } = entry.transaction.kind
            {
                if onchain_address == address {
                    return Ok(peg_in_fees);
                }
            }
        }
        Err(ControlFlow::Continue(anyhow!("deposit not claimed yet")))
    })
    .await?;

    // 0.1 BTC was sent. The credited balance is that minus the federation's
    // peg-in fee; mintv2 issuance fees are why this is a close-enough check.
    let deposited = Amount::from_sats(10_000_000);
    let expected_balance = Amount::from_msats(deposited.msats - peg_in_fees.0.msats);
    // The deposit reaches a claimed state in the transaction list before the
    // balance ledger catches up. Reading the balance once races that gap and
    // sees zero when the rest of the suite is running, so wait for the credit
    // to land and only then hold it to the expected amount.
    let credited = devimint::util::poll("waiting for the deposit to credit", || async {
        let balance = federation.get_balance().await;
        if balance.msats == 0 {
            return Err(ControlFlow::Continue(anyhow!("balance not credited yet")));
        }
        Ok(balance)
    })
    .await?;
    assert_balance_close_enough(expected_balance, credited);

    // Now send some of it back on-chain and check the withdrawal reaches a
    // terminal success state carrying a txid.
    let withdraw_address = bitcoin_cli_new_address().await?;
    let withdraw_amount = Amount::from_sats(1_000_000);

    let preview = previewPayAddress(
        federation.clone(),
        withdraw_address.clone(),
        withdraw_amount.sats_round_down(),
    )
    .await?;
    assert!(
        preview.network_fee.0.msats > 0,
        "walletv2 send_fee must report a non-zero network fee"
    );

    payAddress(
        federation.clone(),
        withdraw_address.clone(),
        withdraw_amount.sats_round_down(),
        FrontendMetadata::default(),
    )
    .await?;

    // Match on the destination address. Several tests share this federation, so
    // an unrelated withdrawal reaching a terminal state must not satisfy this.
    devimint::util::poll("waiting for walletv2 withdrawal", || async {
        let txns = listTransactions(federation.clone(), None, None).await;
        for entry in txns.into_iter().flatten().flatten() {
            if let RpcTransactionKind::OnchainWithdraw {
                onchain_address,
                state: Some(RpcOnchainWithdrawState::Succeeded { .. }),
                ..
            } = entry.transaction.kind
            {
                if onchain_address == withdraw_address {
                    return Ok(());
                }
            }
        }
        Err(ControlFlow::Continue(anyhow!("withdrawal not settled yet")))
    })
    .await?;

    Ok(())
}

/// walletv2 creates no operation until its scanner claims, so the bridge
/// records each generated address and shows it as an awaiting deposit.
async fn test_walletv2_awaiting_deposit(_dev_fed: DevFed) -> anyhow::Result<()> {
    if !devimint::util::supports_wallet_v2() {
        info!("Skipping walletv2 awaiting-deposit test on a kind-one federation");
        return Ok(());
    }

    let td = TestDevice::new().await?;
    let federation = td.join_default_fed().await?;

    // the awaiting-deposit entry must show before any coin moves
    let address = generateAddress(federation.clone(), FrontendMetadata::default()).await?;
    assert_matches!(
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
    );

    // the pending entry's id is address-derived, the claim's is not
    let pending_id = match &listTransactions(federation.clone(), None, None).await?[0] {
        Ok(entry) => entry.transaction.id.clone(),
        Err(e) => bail!("expected an awaiting deposit entry: {e}"),
    };
    updateTransactionNotes(
        federation.clone(),
        pending_id.clone(),
        "coffee money".to_owned(),
    )
    .await?;
    assert_eq!(
        listTransactions(federation.clone(), None, None).await?[0]
            .as_ref()
            .ok()
            .and_then(|entry| entry.transaction.txn_notes.clone()),
        Some("coffee money".to_owned()),
    );

    bitcoin_cli_send_to_address(&address, "0.1").await?;

    // the bridge only subscribes to an op the first time the tx list is read,
    // so poll listTransactions here; the event sink won't fire for the claim.
    // any cursor at all skips the awaiting-deposit merge, so keep this one:
    // it is what makes the render, not the merge, hand the note over
    let claim = loop {
        let past_first_page = listTransactions(federation.clone(), Some(u32::MAX), None).await?;
        let claimed = past_first_page.into_iter().flatten().find(|entry| {
            matches!(
                &entry.transaction.kind,
                RpcTransactionKind::OnchainDeposit {
                    onchain_address,
                    state: Some(RpcOnchainDepositState::Claimed(_)),
                    ..
                } if onchain_address == &address
            )
        });
        if let Some(entry) = claimed {
            break entry.transaction;
        }
        fedimint_core::task::sleep_in_test(
            "waiting for walletv2 deposit to be claimed",
            Duration::from_secs(1),
        )
        .await;
    };
    assert_ne!(claim.id, pending_id);
    assert_eq!(claim.txn_notes.as_deref(), Some("coffee money"));

    // the claim issues the credited notes asynchronously, so the balance
    // settles a moment after the Claimed state. 90% floor covers the note
    // issuance fees, matching devimint's own v2 peg-in balance check.
    devimint::util::poll("walletv2 deposit credited", || async {
        let balance = federation.get_balance().await;
        if balance >= Amount::from_sats(9_000_000) {
            Ok(())
        } else {
            Err(ControlFlow::Continue(anyhow!(
                "balance {balance} not yet credited"
            )))
        }
    })
    .await?;

    // the awaiting entry was reconciled into the claim, not left as a duplicate
    let deposits: Vec<_> = listTransactions(federation.clone(), None, None)
        .await?
        .into_iter()
        .filter_map(|entry| match entry {
            Ok(entry)
                if matches!(
                    entry.transaction.kind,
                    RpcTransactionKind::OnchainDeposit { .. }
                ) =>
            {
                Some(entry.transaction)
            }
            _ => None,
        })
        .collect();
    assert_eq!(deposits.len(), 1);
    assert_ne!(deposits[0].id, pending_id);
    assert_eq!(deposits[0].txn_notes.as_deref(), Some("coffee money"));

    // walletv2 only advances its receive address after the scanner claims,
    // and that search lags, so asking again can hand back the used address
    let reissued = generateAddress(federation.clone(), FrontendMetadata::default()).await?;
    let onchain_rows = listTransactions(federation.clone(), None, None)
        .await?
        .into_iter()
        .flatten()
        .filter(|entry| {
            matches!(
                entry.transaction.kind,
                RpcTransactionKind::OnchainDeposit { .. }
            )
        })
        .count();
    assert_eq!(onchain_rows, if reissued == address { 1 } else { 2 });

    Ok(())
}

async fn test_on_chain_with_fedi_fees(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
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

    assert_matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit { state: Some(_), .. },
                ..
            },
            ..
        })
    );
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
    let pegin_fees = federation.client.wallet()?.get_fee_consensus().peg_in_abs;
    assert_matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit {
                    peg_in_fees,
                    state: Some(RpcOnchainDepositState::Claimed(_)),
                    ..
                },
                ..
            },
            ..
        }) if peg_in_fees == RpcAmount(pegin_fees)
    );

    let btc_amount = Amount::from_sats(10_000_000);
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
    let mut td = TestDevice::new().await?;
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

    assert_matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit { state: Some(_), .. },
                ..
            },
            ..
        })
    );
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
    let pegin_fees = federation.client.wallet()?.get_fee_consensus().peg_in_abs;
    assert_matches!(
        listTransactions(federation.clone(), None, None).await?[0],
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::OnchainDeposit {
                    peg_in_fees,
                    state: Some(RpcOnchainDepositState::Claimed(_)),
                    ..
                },
                ..
            },
            ..
        }) if peg_in_fees == RpcAmount(pegin_fees)
    );

    let btc_amount = Amount::from_sats(10_000_000);
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
    let td = TestDevice::new().await?;
    let federation = td.join_default_fed().await?;

    // receive ecash
    let ecash_receive_amount = fedimint_core::Amount::from_msats(100);
    let ecash = cli_generate_ecash(ecash_receive_amount).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
    wait_for_ecash_reissue(federation.as_ref()).await?;

    // check balance
    balance_after_receiving_ecash(federation.as_ref(), ecash_receive_amount).await;

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
        let mut td = TestDevice::new().await?;
        let bridge = td.bridge_full().await?;
        let federation = td.join_default_fed().await?;
        // receive ecash
        let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
        let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
        federation
            .receive_ecash(ecash, FrontendMetadata::default())
            .await?;
        wait_for_ecash_reissue(federation).await?;
        balance_after_receiving_ecash(federation, ecash_receive_amount).await;

        // Interact with stability pool
        let fedi_fee_ppm = bridge
            .federations
            .fedi_fee_helper
            .get_fee_ppm(
                FediFeeStream::App,
                federation.rpc_federation_id().0,
                stability_pool_client_old::common::KIND,
                RpcTransactionDirection::Send,
            )
            .await?;
        expected_fedi_fee =
            Amount::from_msats((fedi_fee_ppm * sp_amount_to_deposit.msats).div_ceil(MILLION));
        let deposit_op =
            stabilityPoolDepositToSeek(federation.clone(), RpcAmount(sp_amount_to_deposit)).await?;
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

            fedimint_core::task::sleep(Duration::from_millis(10)).await;
        }
        wait_for_operation_settlement(federation, deposit_op.0).await;

        ecash_balance_before = federation.get_balance().await;

        backupNow(federation.clone()).await?;
        // give some time for backup to complete before shutting down the bridge
        fedimint_core::task::sleep(Duration::from_secs(1)).await;

        // get mnemonic and drop old federation / bridge so no background stuff runs
        mnemonic = getMnemonic(bridge.runtime.clone()).await?;
        td.shutdown().await?;
    }

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let td = TestDevice::new().await?;
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
    // The wallet had activity before the backup, so the mint recovery scan has
    // items to walk and must have reported progress along the way (the UI
    // shows a silent stuck restore otherwise).
    assert!(
        td.event_sink()
            .num_events_of_type("recoveryProgress".into())
            >= 1,
        "mint recovery must emit progress events"
    );
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
    let td = TestDevice::new().await?;
    let bridge = td.bridge_full().await?;
    let v2_ecash = "AgEEsuFO5gD3AwQBmW/h68gy6W5cgnl93aTdduN1OnnFofSCqjth03Q6CA+fXnKlVXQSIVSLqcHzsbhozAuo2q5jPMsO6XMZZZXaYvZyIdXzCUIuDNhdCHkGJWAgAa9M5zsSPPVWDVeCWgkerg0Z+Xv8IQGMh7rsgpLh77NCSVRKA2i4fBYNwPglSbkGs42Yllmz6HJtgmmtl/tdjcyVSR30Nc2cfkZYTJcEEnRjQAGC8ZX5eLYQB8rCAZiX5/gQX2QtjasZMy+BJ67kJ0klVqsS9G1IVWhea6ILISOd9H1MJElma8aHBiWBaWeGjrCXru8Ns7Lz4J18CbxFdHyWEQ==";
    parseEcash(&bridge.federations, v2_ecash.into()).await?;
    Ok(())
}

async fn test_social_backup_and_recovery(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mut td1 = TestDevice::new().await?;
    let original_bridge = td1.bridge_full().await?;
    let federation = td1.join_default_fed().await?;

    // receive ecash
    let ecash = cli_generate_ecash(Amount::from_msats(200_000)).await?;
    let ecash_receive_amount = amount_from_ecash(ecash.clone()).await?;
    federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(federation).await?;
    balance_after_receiving_ecash(federation, ecash_receive_amount).await;

    // Interact with stability pool
    let amount_to_deposit = Amount::from_msats(110_000);
    let fedi_fee_ppm = original_bridge
        .federations
        .fedi_fee_helper
        .get_fee_ppm(
            FediFeeStream::App,
            federation.rpc_federation_id().0,
            stability_pool_client_old::common::KIND,
            RpcTransactionDirection::Send,
        )
        .await?;
    let expected_fedi_fee =
        Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
    let deposit_op =
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;

    loop {
        // Wait until deposit operation succeeds
        // Initiated -> TxAccepted -> Success
        if td1
            .event_sink()
            .num_events_of_type("stabilityPoolDeposit".into())
            == 3
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(10)).await;
    }
    wait_for_operation_settlement(federation, deposit_op.0).await;
    let ecash_balance_before = federation.get_balance().await;

    // set username and do a backup
    let federation_id = federation.rpc_federation_id();
    backupNow(federation.clone()).await?;

    // Get original mnemonic (for comparison later)
    let initial_words = getMnemonic(original_bridge.runtime.clone()).await?;
    info!("initial mnemnoic {:?}", &initial_words);

    // Upload backup
    let video_file_path = get_fixture_dir().join("verification_doc.txt"); // should be video in practice
    let video_file_contents = tokio::fs::read(&video_file_path).await?;
    let recovery_file_path =
        uploadBackupFile(original_bridge, federation_id.clone(), video_file_path).await?;
    let locate_recovery_file_path = locateRecoveryFile(original_bridge.runtime.clone()).await?;
    assert_eq!(recovery_file_path, locate_recovery_file_path);

    // original device is down
    td1.shutdown().await?;

    // use new bridge from here (simulating a new app install)
    let td2 = TestDevice::new().await?;
    let recovery_bridge = td2.bridge_maybe_onboarding().await?;

    let td3 = TestDevice::new().await?;
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
    let password = "pass";
    let verification_doc_path = socialRecoveryDownloadVerificationDoc(
        guardian_bridge,
        federation_id.clone(),
        recovery_id,
        RpcPeerId(fedimint_core::PeerId::from(1)),
        password.into(),
    )
    .await?
    .unwrap();
    let contents = tokio::fs::read(verification_doc_path).await?;
    let _ = VerificationDocument::from_raw(&contents);
    assert_eq!(contents, video_file_contents);

    // 3 guardians approves
    for i in 0..3 {
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
    let td = TestDevice::new().await?;
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
    let credited = balance_after_receiving_ecash(federation, receive_amount).await;
    let estimated_deposit_fees =
        estimateStabilityPoolDepositFees(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    assert_eq!(
        RpcAmount(deposit_fedi_fee),
        estimated_deposit_fees.fedi_app_fee
    );
    assert_eq!(
        RpcAmount(Amount::ZERO),
        estimated_deposit_fees.fedi_guardian_fee
    );
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

    assert_balance_close_enough(
        credited
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

    assert_balance_close_enough(
        (credited
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

async fn spv2_force_sync(federation: &Arc<FederationV2>) {
    federation
        .spv2_sync_service
        .get()
        .expect("Sync service must be initialized")
        .update_once()
        .await
        .expect("Sync service update mustn't fail");
}

async fn test_spv2(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // Vec of tuple of (send_ppm, receive_ppm)
    let fee_ppm_values = vec![(0, 0), (10, 5), (100, 50)];
    for (send_ppm, receive_ppm) in fee_ppm_values {
        test_spv2_with_fedi_fees(send_ppm, receive_ppm)
            .await
            .with_context(|| format!("spv2 fees send_ppm={send_ppm} receive_ppm={receive_ppm}"))?;
    }

    Ok(())
}

async fn test_spv2_with_fedi_fees(
    fedi_fees_send_ppm: u64,
    fedi_fees_receive_ppm: u64,
) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
    let bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;
    setSPv2ModuleFediFeeSchedule(
        bridge,
        federation.rpc_federation_id(),
        fedi_fees_send_ppm,
        fedi_fees_receive_ppm,
    )
    .await?;

    // Test default account info state. SPv2 sync is initialized asynchronously
    // after joining, so wait until the first cache entry exists before reading it.
    let RpcSPv2CachedSyncResponse { sync_response, .. } = retry(
        "wait initial spv2 account info",
        aggressive_backoff(),
        || {
            let federation = federation.clone();
            async move {
                federation
                    .spv2_sync_service
                    .get()
                    .context("spv2 sync service must be initialized")?
                    .update_once()
                    .await
                    .context("initial spv2 sync")?;
                spv2AccountInfo(federation.clone())
                    .await
                    .context("initial spv2 account info")
            }
        },
    )
    .await?;
    assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
    assert_eq!(sync_response.staged.btc.0, Amount::ZERO);
    assert_eq!(sync_response.locked.btc.0, Amount::ZERO);
    assert!(sync_response.pending_unlock.is_none());

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
    let credited = balance_after_receiving_ecash(federation, receive_amount).await;
    let estimated_deposit_fees =
        estimateSPv2DepositFees(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    assert_eq!(
        RpcAmount(deposit_fedi_fee),
        estimated_deposit_fees.fedi_app_fee
    );
    assert_eq!(
        RpcAmount(Amount::ZERO),
        estimated_deposit_fees.fedi_guardian_fee
    );
    let deposit_events_before = td.event_sink().num_events_of_type("spv2Deposit".into());
    spv2DepositToSeek(
        federation.clone(),
        RpcAmount(amount_to_deposit),
        FrontendMetadata::default(),
    )
    .await?;
    loop {
        // Wait until deposit operation succeeds
        // Initiated -> TxAccepted -> Success
        if td.event_sink().num_events_of_type("spv2Deposit".into()) >= deposit_events_before + 3 {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    assert_balance_close_enough(
        credited
            .checked_sub(amount_to_deposit)
            .expect("Can't fail")
            .checked_sub(deposit_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );

    spv2_force_sync(federation).await;
    let RpcSPv2CachedSyncResponse { sync_response, .. } =
        spv2AccountInfo(federation.clone()).await?;
    assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
    let deposited_msats = sync_response.staged.btc.0.msats + sync_response.locked.btc.0.msats;
    // DevFed seeds provider liquidity with a non-zero fee rate, so a tiny underage
    // from fee rounding is expected in this shared wrapper environment.
    assert!(deposited_msats <= amount_to_deposit.msats);
    assert!(amount_to_deposit.msats - deposited_msats <= 2);
    assert!(sync_response.pending_unlock.is_none());

    // Withdraw and verify account info
    let amount_to_withdraw = Amount::from_msats(200_000);
    let withdraw_fedi_fee =
        Amount::from_msats((amount_to_withdraw.msats * fedi_fees_receive_ppm).div_ceil(MILLION));
    let withdrawal_events_before = td.event_sink().num_events_of_type("spv2Withdrawal".into());
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
        if td.event_sink().num_events_of_type("spv2Withdrawal".into())
            >= withdrawal_events_before + 5
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    // At this point, we will have two SP transactions: one pending deposit, and one
    // completed withdrawal. The withdrawal event can arrive before the SPv2
    // account-history cache has observed the completed withdrawal state, so wait
    // for listTransactions to reflect it. listTransactions returns transactions
    // in reverse chronological order.
    let mut transactions = Vec::new();
    for _ in 0..100 {
        spv2_force_sync(federation).await;
        transactions = listTransactions(federation.clone(), None, None).await?;
        let last_tx = transactions.first().expect("must exist");
        if matches!(
            last_tx,
            Ok(RpcTransactionListEntry {
                transaction: RpcTransaction {
                    kind: RpcTransactionKind::SPV2Withdrawal {
                        state: rpc_types::RpcSPV2WithdrawalState::CompletedWithdrawal { .. },
                        ..
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
    let last_tx = transactions.first().expect("must exist");
    assert_matches!(
        last_tx,
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::SPV2Withdrawal {
                    state: rpc_types::RpcSPV2WithdrawalState::CompletedWithdrawal { .. },
                    ..
                },
                ..
            },
            ..
        })
    );

    let second_last_tx = transactions.get(1).expect("must exist");
    assert_matches!(
        second_last_tx,
        Ok(RpcTransactionListEntry {
            transaction: RpcTransaction {
                kind: RpcTransactionKind::SPV2Deposit {
                    state: rpc_types::RpcSPV2DepositState::PendingDeposit { .. }
                        | rpc_types::RpcSPV2DepositState::CompletedDeposit { .. }
                },
                ..
            },
            ..
        })
    );

    assert_balance_close_enough(
        (credited
            .checked_sub(amount_to_deposit)
            .expect("Can't fail")
            .checked_sub(deposit_fedi_fee)
            .expect("Can't fail")
            + amount_to_withdraw)
            .checked_sub(withdraw_fedi_fee)
            .expect("Can't fail"),
        federation.get_balance().await,
    );

    spv2_force_sync(federation).await;
    let RpcSPv2CachedSyncResponse { sync_response, .. } =
        spv2AccountInfo(federation.clone()).await?;
    assert_eq!(sync_response.idle_balance.0, Amount::ZERO);
    let remaining_msats = sync_response.staged.btc.0.msats + sync_response.locked.btc.0.msats;
    let expected_remaining_msats = amount_to_deposit.msats - amount_to_withdraw.msats;
    // DevFed seeds provider liquidity with a non-zero fee rate, so a small
    // underage from fee rounding is expected in this shared wrapper
    // environment. The fee is skimmed per cycle, so the underage grows the
    // longer the run takes; allow a per-mille rather than a fixed couple of
    // msats.
    assert!(remaining_msats <= expected_remaining_msats);
    assert!(expected_remaining_msats - remaining_msats <= 10 + expected_remaining_msats / 1000);
    assert!(sync_response.pending_unlock.is_none());

    // Let's withdraw the remaining amount
    let withdrawal_events_before = td.event_sink().num_events_of_type("spv2Withdrawal".into());
    federation
        .spv2_withdraw(FiatOrAll::All, FrontendMetadata::default())
        .await?;
    loop {
        // Wait until withdrawal operation succeeds
        // Initiated -> UnlockTxAccepted -> WithdrawalInitiated -> WithdrawalTxAccepted
        // -> Success
        if td.event_sink().num_events_of_type("spv2Withdrawal".into())
            >= withdrawal_events_before + 5
        {
            break;
        }

        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    // At this point, our SP deposit will be marked as completed since it has been
    // fully drained and we shouldn't expect to have a lingering pending deposit
    loop {
        // Force an SPv2 sync and wait for it to complete
        spv2_force_sync(federation).await;

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
    let td = TestDevice::new().await?;
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
    let mut td = TestDevice::new().await?;
    let bridge = td.bridge_full().await?;
    assert_matches!(
        federationPreview(&bridge.federations, invite_code.clone())
            .await?
            .returning_member_status,
        RpcReturningMemberStatus::NewMember
    );

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
    let td2 = TestDevice::new().await?;
    let bridge = td2.bridge_maybe_onboarding().await?;
    restoreMnemonic(bridge.try_get()?, mnemonic).await?;
    // Re-register device as index 0 since it's the same device
    onboardTransferExistingDeviceRegistration(bridge.try_get()?, 0).await?;
    let bridge = td2.bridge_full().await?;

    assert_matches!(
        federationPreview(&bridge.federations, invite_code.clone())
            .await?
            .returning_member_status,
        RpcReturningMemberStatus::ReturningMember
    );

    Ok(())
}

async fn test_onboarding_fails_without_restore_mnemonic(_dev_fed: DevFed) -> anyhow::Result<()> {
    let mock_fedi_api = Arc::new(MockFediApi::default());
    let mut td = TestDevice::new().await?;
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
    let mut td2 = TestDevice::new().await?;
    td2.with_fedi_api(mock_fedi_api);
    let recovery_bridge = td2.bridge_maybe_onboarding().await?;
    assert!(
        onboardRegisterAsNewDevice(recovery_bridge, None)
            .await
            .is_err(),
        "onboarding failed because you didn't restore the mnemonic"
    );
    Ok(())
}

async fn test_transfer_device_registration_no_feds(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mock_fedi_api = Arc::new(MockFediApi::default());
    let mut td1 = TestDevice::new().await?;
    td1.with_fedi_api(mock_fedi_api.clone());
    let bridge_1 = td1.bridge_full().await?;

    // give some time for backup to complete before shutting down the bridge
    fedimint_core::task::sleep(Duration::from_secs(1)).await;

    // get mnemonic (not dropping old bridge so we can assert device
    // index being stolen)
    let mnemonic = getMnemonic(bridge_1.runtime.clone()).await?;

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let mut td2 = TestDevice::new().await?;
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
    let mut td3 = TestDevice::new().await?;
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
    let mut td1 = TestDevice::new().await?;
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
    balance_after_receiving_ecash(federation, ecash_receive_amount).await;

    // Interact with stability pool
    let amount_to_deposit = Amount::from_msats(110_000);
    let fedi_fee_ppm = backup_bridge
        .federations
        .fedi_fee_helper
        .get_fee_ppm(
            FediFeeStream::App,
            federation.rpc_federation_id().0,
            stability_pool_client_old::common::KIND,
            RpcTransactionDirection::Send,
        )
        .await?;
    let expected_fedi_fee =
        Amount::from_msats((fedi_fee_ppm * amount_to_deposit.msats).div_ceil(MILLION));
    let deposit_op =
        stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    wait_for_operation_settlement(federation, deposit_op.0).await;

    let ecash_balance_before = federation.get_balance().await;

    backupNow(federation.clone()).await?;
    // give some time for backup to complete before shutting down the bridge
    fedimint_core::task::sleep(Duration::from_secs(1)).await;

    // get mnemonic (not dropping old bridge so we can assert device
    // index being stolen)
    let mnemonic = getMnemonic(backup_bridge.runtime.clone()).await?;

    // create new bridge which hasn't joined federation yet and recover mnemnonic
    let mut td2 = TestDevice::new().await?;
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
    let mut td1 = TestDevice::new().await?;
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
    balance_after_receiving_ecash(federation, ecash_receive_amount).await;

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
    let mut td2 = TestDevice::new().await?;
    td2.with_fedi_api(mock_fedi_api.clone());
    let recovery_bridge = td2.bridge_maybe_onboarding().await?;
    restoreMnemonic(recovery_bridge.try_get()?, mnemonic).await?;
    // Register device as index 1 since it's a new device
    onboardRegisterAsNewDevice(recovery_bridge.try_get()?, None).await?;
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
    let td = TestDevice::new().await?;
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
    assert!(
        bridge
            .runtime
            .app_state
            .with_read_lock(|state| state.joined_communities.clone())
            .await
            .is_empty()
    );

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
    assert!(memory_community.info.read().await.to_owned() == app_state_community);

    Ok(())
}

async fn test_list_and_leave_community(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
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
    assert!(
        leaveCommunity(bridge, community_invite_0.to_string())
            .await
            .is_err()
    );

    // Join community 0
    joinCommunity(bridge, community_invite_0.to_string()).await?;

    // List contains community 0
    assert_matches!(
            &listCommunities(bridge).await?[..],
            [RpcCommunity { community_invite, .. }] if *community_invite == From::from(&community_invite_0));

    // Join community 1
    joinCommunity(bridge, community_invite_1.to_string()).await?;

    // List contains community 0 + community 1
    assert_matches!(
            &listCommunities(bridge).await?[..], [
                RpcCommunity { community_invite: invite_0, .. },
                RpcCommunity { community_invite: invite_1, .. }
            ] if (*invite_0 == From::from(&community_invite_0) && *invite_1 == From::from(&community_invite_1)) ||
            (*invite_0 == From::from(&community_invite_1) && *invite_1 == From::from(&community_invite_0)));

    // Leave community 0
    leaveCommunity(bridge, community_invite_0.to_string()).await?;

    // List contains only community 1
    assert_matches!(
            &listCommunities(bridge).await?[..],
            [RpcCommunity { community_invite, .. }] if *community_invite == From::from(&community_invite_1));

    // Leave community 1
    leaveCommunity(bridge, community_invite_1.to_string()).await?;

    // No joined communities
    assert!(listCommunities(bridge).await?.is_empty());

    Ok(())
}

async fn test_community_meta_bg_refresh(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
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
    assert!(memory_community.info.read().await.to_owned() == app_state_community);
    assert!(
        serde_json::to_value(memory_community.info.read().await.to_owned().json).unwrap()
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
        if memory_community.info.read().await.to_owned() != app_state_community {
            continue;
        }
        if serde_json::to_value(memory_community.info.read().await.to_owned().json).unwrap()
            == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_0).unwrap()
        {
            continue;
        }

        assert!(
            serde_json::to_value(memory_community.info.read().await.to_owned().json).unwrap()
                == serde_json::from_str::<serde_json::Value>(COMMUNITY_JSON_1).unwrap()
        );
        break;
    }

    Ok(())
}

async fn test_community_v2_migration(_dev_fed: DevFed) -> anyhow::Result<()> {
    let td = TestDevice::new().await?;
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
        let td2 = TestDevice::new().await?;
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

type MintedFeeInvoice = Arc<std::sync::Mutex<Option<Bolt11Invoice>>>;

/// MockFediApi whose fee-invoice endpoint mints an invoice on the LDK
/// gateway's node for the exact amount the bridge requests, since the
/// requested amount (outstanding fees minus the quoted gateway fee) is not
/// predictable by the test. Also returns the slot the minted invoice lands
/// in.
fn fee_invoice_generator_mock(dev_fed: &DevFed) -> (MockFediApi, MintedFeeInvoice) {
    let minted = MintedFeeInvoice::default();
    let mut mock = MockFediApi::default();
    let gw_ldk_client = dev_fed.gw_ldk.client();
    let slot = minted.clone();
    mock.set_fedi_fee_invoice_generator(Box::new(move |amount| {
        let gw_ldk_client = gw_ldk_client.clone();
        let slot = slot.clone();
        Box::pin(async move {
            let invoice = gw_ldk_client.create_invoice(amount.msats).await?;
            *slot.lock().unwrap() = Some(invoice.clone());
            Ok(invoice)
        })
    }));
    (mock, minted)
}

async fn await_minted_fee_invoice_paid(
    dev_fed: &DevFed,
    minted: &MintedFeeInvoice,
) -> anyhow::Result<()> {
    let gw_ldk_client = dev_fed.gw_ldk.client();
    retry("fedi fee remitting", aggressive_backoff(), || {
        let gw_ldk_client = gw_ldk_client.clone();
        let minted = minted.clone();
        async move {
            let invoice = minted
                .lock()
                .unwrap()
                .clone()
                .context("fee invoice not requested yet")?;
            gw_ldk_client
                .wait_bolt11_invoice(invoice.payment_hash().consensus_encode_to_vec())
                .await
        }
    })
    .await
}

async fn test_fee_remittance_on_startup(dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let mut td = TestDevice::new().await?;
    let bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;
    // Pin the LND gateway: the remittance invoice is issued by the LDK
    // gateway's node, and lnv2 gateway selection prefers the invoice
    // issuer's own gateway, which cannot pay itself. The override is
    // stored in the client db, so it survives the bridge restart.
    use_lnd_gateway(federation).await?;
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
    assert_eq!(
        Amount::ZERO,
        federation
            .get_pending_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );
    assert_eq!(
        Amount::ZERO,
        federation
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );

    // Make SP deposit, verify pending fees
    let amount_to_deposit = Amount::from_msats(5_000_000);
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    assert_eq!(
        Amount::from_msats(105_000),
        federation
            .get_pending_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );
    assert_eq!(
        Amount::ZERO,
        federation
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );

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
    assert_eq!(
        Amount::ZERO,
        federation
            .get_pending_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );
    assert_eq!(
        Amount::from_msats(105_000),
        federation
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );

    // No fee can be remitted just yet cuz we haven't mocked invoice endpoint

    // Extract data dir and drop bridge
    let federation_id = federation.federation_id();
    td.shutdown().await?;

    // Mock fee remittance endpoint
    let (mock_fedi_api, minted_invoice) = fee_invoice_generator_mock(&dev_fed);
    td.with_fedi_api(mock_fedi_api.into());
    let new_bridge = td.bridge_full().await?;

    // Wait for fedi fee to be remitted
    await_minted_fee_invoice_paid(&dev_fed, &minted_invoice).await?;

    // Ensure outstanding fee has been cleared
    let federation = wait_for_federation_loading(new_bridge, &federation_id.to_string()).await?;
    assert_eq!(
        Amount::ZERO,
        federation
            .get_pending_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );
    assert_eq!(
        Amount::ZERO,
        federation
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );

    Ok(())
}

async fn test_fee_remittance_post_successful_tx(dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    // Mock fee remittance endpoint
    let (mock_fedi_api, minted_invoice) = fee_invoice_generator_mock(&dev_fed);
    let mut td = TestDevice::new().await?;
    td.with_fedi_api(Arc::new(mock_fedi_api));

    // Setup bridge, join test federation, set SP send fee ppm
    let bridge = td.bridge_full().await?;
    let federation = td.join_default_fed().await?;
    // Pin the LND gateway: the remittance invoice is issued by the LDK
    // gateway's node, and lnv2 gateway selection prefers the invoice
    // issuer's own gateway, which cannot pay itself. The override is
    // stored in the client db, so it survives the bridge restart.
    use_lnd_gateway(federation).await?;
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
    assert_eq!(
        Amount::ZERO,
        federation
            .get_pending_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );
    assert_eq!(
        Amount::ZERO,
        federation
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );

    // Make SP deposit, verify pending fees
    let amount_to_deposit = Amount::from_msats(5_000_000);
    stabilityPoolDepositToSeek(federation.clone(), RpcAmount(amount_to_deposit)).await?;
    assert_eq!(
        Amount::from_msats(105_000),
        federation
            .get_pending_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );
    assert_eq!(
        Amount::ZERO,
        federation
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );

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
    await_minted_fee_invoice_paid(&dev_fed, &minted_invoice).await?;
    // Ensure outstanding fee has been cleared
    assert_eq!(
        Amount::ZERO,
        federation
            .get_pending_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );
    assert_eq!(
        Amount::ZERO,
        federation
            .get_outstanding_fedi_fees_by_stream(FediFeeStream::App)
            .await
    );

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_guardian_remittance_account_withdraw_all() -> anyhow::Result<()> {
    if should_skip_test_using_stock_fedimintd() {
        return Ok(());
    }

    let _dev_fed = DevFed::new_with_setup(4).await?;
    let guardian_td = TestDevice::new().await?;
    let guardian_federation = guardian_td.join_default_fed().await?;
    // set guardian fees config in federation
    let guardian_account_serialized = spv2GuardianRemittanceAccount(guardian_federation.clone())
        .await?
        .serialized_account;
    let guardian_account: Account = serde_json::from_str(&guardian_account_serialized)?;
    let guardian_account_id = guardian_account.id();

    cli_submit_guardian_fee_meta(guardian_account_serialized, 209_999).await?;
    cli_wait_for_guardian_fee_meta(209_999).await?;

    let user_td = TestDevice::new().await?;
    let user_federation = user_td.join_default_fed().await?;

    retry("wait guardian fee config", aggressive_backoff(), || {
        let user_federation = user_federation.clone();
        async move {
            let cached_meta = user_federation.get_cached_meta().await;
            let parsed_cached_send_ppm = parse_fedi_guardian_fee_config(&cached_meta)
                .ok()
                .flatten()
                .map(|cfg| cfg.send_ppm);
            let Some(config) = user_federation.guardian_fee_config().await else {
                let mut cached_keys = cached_meta.keys().cloned().collect::<Vec<_>>();
                cached_keys.sort_unstable();
                bail!(
                    "guardian fee config is missing; parsed_cached_send_ppm={parsed_cached_send_ppm:?} cached_keys={cached_keys:?}"
                );
            };
            if config.send_ppm != 209_999 {
                bail!("guardian fee send ppm not updated yet");
            }
            Ok(())
        }
    })
    .await?;

    let ecash = cli_generate_ecash(Amount::from_msats(2_000_000)).await?;
    user_federation
        .receive_ecash(ecash, FrontendMetadata::default())
        .await?;
    wait_for_ecash_reissue(user_federation).await?;

    let ecash_send_amount = Amount::from_msats(1_000_000);
    let expected_guardian_fee =
        Amount::from_msats((ecash_send_amount.msats * 209_999).div_ceil(MILLION));
    let estimated_ecash_fees =
        estimateEcashFees(user_federation.clone(), RpcAmount(ecash_send_amount)).await?;
    assert_eq!(
        RpcAmount(expected_guardian_fee),
        estimated_ecash_fees.fedi_guardian_fee
    );

    let amount_to_deposit = Amount::from_msats(1_000_000);
    let estimated_spv2_deposit_fees =
        estimateSPv2DepositFees(user_federation.clone(), RpcAmount(amount_to_deposit)).await?;
    assert_eq!(
        RpcAmount(expected_guardian_fee),
        estimated_spv2_deposit_fees.fedi_guardian_fee
    );
    let deposit_events_before = user_td
        .event_sink()
        .num_events_of_type("spv2Deposit".into());
    spv2DepositToSeek(
        user_federation.clone(),
        RpcAmount(amount_to_deposit),
        FrontendMetadata::default(),
    )
    .await?;
    loop {
        if user_td
            .event_sink()
            .num_events_of_type("spv2Deposit".into())
            >= deposit_events_before + 3
        {
            break;
        }
        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    retry("wait guardian fee accrual", aggressive_backoff(), || {
        let user_federation = user_federation.clone();
        async move {
            if user_federation
                .get_outstanding_fedi_fees_by_stream(FediFeeStream::Guardian)
                .await
                == Amount::ZERO
            {
                bail!("guardian outstanding fee has not accrued yet");
            }
            Ok(())
        }
    })
    .await?;

    retry(
        "wait guardian remittance settlement",
        aggressive_backoff(),
        || {
            let user_federation = user_federation.clone();
            async move {
                if user_federation
                    .get_outstanding_fedi_fees_by_stream(FediFeeStream::Guardian)
                    .await
                    != Amount::ZERO
                {
                    bail!("guardian remittance still pending");
                }
                Ok(())
            }
        },
    )
    .await?;

    retry(
        "wait guardian remittance account balance",
        aggressive_backoff(),
        || {
            let guardian_federation = guardian_federation.clone();
            async move {
                let sync = guardian_federation
                    .multispend_group_sync_info(guardian_account_id)
                    .await?;
                let total_msats =
                    sync.idle_balance.msats + sync.staged_balance.msats + sync.locked_balance.msats;
                if total_msats == 0 {
                    bail!("guardian remittance account is still empty");
                }
                Ok(())
            }
        },
    )
    .await?;

    let withdraw_events_before = guardian_td
        .event_sink()
        .num_events_of_type("spv2Withdrawal".into());
    spv2WithdrawGuardianRemittanceAll(guardian_federation.clone()).await?;
    loop {
        if guardian_td
            .event_sink()
            .num_events_of_type("spv2Withdrawal".into())
            >= withdraw_events_before + 5
        {
            break;
        }
        fedimint_core::task::sleep(Duration::from_millis(100)).await;
    }

    retry(
        "wait guardian remittance account drained",
        aggressive_backoff(),
        || {
            let guardian_federation = guardian_federation.clone();
            async move {
                let sync = guardian_federation
                    .multispend_group_sync_info(guardian_account_id)
                    .await?;
                let total_msats =
                    sync.idle_balance.msats + sync.staged_balance.msats + sync.locked_balance.msats;
                if total_msats != 0 {
                    bail!("guardian remittance account still has balance");
                }
                Ok(())
            }
        },
    )
    .await?;

    Ok(())
}

async fn test_recurring_lnurl(_dev_fed: DevFed) -> anyhow::Result<()> {
    if should_skip_test_needing_dev_recurringd() {
        return Ok(());
    }

    let td = TestDevice::new().await?;
    let federation = td.join_default_fed().await?;
    let lnurl1 = federation.get_recurringd_lnurl().await?;
    assert!(lnurl1.starts_with("lnurl"));
    let lnurl2 = federation.get_recurringd_lnurl().await?;
    // lnurl must stay the same for the same recurringd target
    assert_eq!(lnurl1, lnurl2);
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_bridge_handles_federation_offline() -> anyhow::Result<()> {
    // The offline half of this test is v1-mint-shaped: it expects
    // generateEcash to eventually fail with OfflineExactEcashFailed, but a
    // mintv2 send spends local notes without contacting the federation, so
    // it keeps succeeding while offline. See
    // `test_bridge_handles_federation_offline_v2` for the kind-two counterpart.
    if devimint::util::supports_mint_v2() {
        return Ok(());
    }
    let mut dev_fed = DevFed::new_with_setup(4).await?;
    let invite_code = dev_fed.fed.invite_code()?;

    let mut td = TestDevice::new().await?;
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

        let event_sink = td.event_sink();
        // Wait for federation ready event for a max of 2s
        let rpc_federation = fedimint_core::task::timeout(Duration::from_secs(2), async move {
            'check: loop {
                let events = event_sink.events();
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

        let federation = bridge
            .federations
            .get_federation_maybe_recovering(&rpc_federation.id.0)?;

        // Attempt to repeatedly generateEcash for exactly 3msat.
        // After using up all locally held 1msat notes, bridge should throw
        // error. This is because we are offline, and generateEcash
        // shouldn't even attempt reissuing.
        let mut count = 0;
        loop {
            if let Err(e) = generateEcash(
                federation.clone(),
                RpcAmount(Amount::from_msats(3)),
                false,
                FrontendMetadata::default(),
            )
            .await
            {
                if RpcError::from_anyhow(&e)
                    .error_code
                    .is_some_and(|code| code == ErrorCode::OfflineExactEcashFailed)
                {
                    break;
                }
            }

            count += 1;
            if count == 10 {
                bail!("Expected generateEcash to eventually error when offline");
            }

            fedimint_core::task::sleep_in_test(
                "retrying generateEcash until failure",
                Duration::from_millis(100),
            )
            .await;
        }
    }
    Ok(())
}

/// The kind-two counterpart of `test_bridge_handles_federation_offline`. A
/// mintv2 send spends local notes without contacting the federation, so the v1
/// expectation that ecash generation fails while offline does not hold. What
/// does require the federation is a mintv2 *receive*, which submits a
/// transaction — so that is what must fail, while init and the cached balance
/// must both survive.
#[tokio::test(flavor = "multi_thread")]
async fn test_bridge_handles_federation_offline_v2() -> anyhow::Result<()> {
    if !devimint::util::supports_mint_v2() {
        info!("Skipping kind-two offline test on a kind-one federation");
        return Ok(());
    }

    let mut dev_fed = DevFed::new_with_setup(4).await?;
    let invite_code = dev_fed.fed.invite_code()?;

    let mut td = TestDevice::new().await?;
    let original_balance;
    let ecash_for_offline_receive;

    // Join and fund while the federation is up, and mint a second piece of
    // ecash from the CLI to attempt receiving later while it is down.
    {
        let bridge = td.bridge_full().await?;
        let rpc_federation = joinFederation(bridge, invite_code.clone(), false).await?;
        let federation = bridge
            .federations
            .get_federation_maybe_recovering(&rpc_federation.id.0)?;

        let ecash = cli_generate_ecash(fedimint_core::Amount::from_msats(100_000)).await?;
        receiveEcash(federation.clone(), ecash, FrontendMetadata::default()).await?;
        wait_for_ecash_reissue(&federation).await?;

        original_balance = federation.get_balance().await;
        assert!(original_balance.msats != 0);

        ecash_for_offline_receive =
            cli_generate_ecash(fedimint_core::Amount::from_msats(10_000)).await?;

        drop(federation);
        td.shutdown().await?;
    }

    // Take the federation down.
    dev_fed.fed.terminate_all_servers().await?;

    // The same device must still initialise and report the cached balance, then
    // fail the federation-dependent operation.
    {
        let bridge = td.bridge_full().await?;
        assert!(bridge.federations.get_federations_map().len() == 1);

        let event_sink = td.event_sink();
        let rpc_federation = fedimint_core::task::timeout(Duration::from_secs(2), async move {
            'check: loop {
                let events = event_sink.events();
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

        assert_eq!(
            rpc_federation.balance.0, original_balance,
            "the cached balance must survive a downed federation"
        );

        let federation = bridge
            .federations
            .get_federation_maybe_recovering(&rpc_federation.id.0)?;

        // A mintv2 receive submits a transaction, so it cannot settle while the
        // federation is unreachable. The call itself may return Ok and fail in
        // the state machine, so accept either shape and require only that the
        // reissue does not report Done.
        let receive_result = receiveEcash(
            federation.clone(),
            ecash_for_offline_receive,
            FrontendMetadata::default(),
        )
        .await;

        if receive_result.is_ok() {
            let settled = fedimint_core::task::timeout(
                Duration::from_secs(5),
                wait_for_ecash_reissue(&federation),
            )
            .await;

            assert!(
                matches!(settled, Err(_) | Ok(Err(_))),
                "a mintv2 receive must not settle while the federation is offline"
            );
        }

        // Checked on both branches, so the test cannot report success merely
        // because the receive call errored for some unrelated reason. Whatever
        // shape the failure took, nothing may have been credited.
        assert_eq!(
            federation.get_balance().await,
            original_balance,
            "an offline receive must not credit the balance"
        );
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
    let mut td = TestDevice::new().await?;
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
    let td = TestDevice::new().await?;
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
    let td_sender = TestDevice::new().await?;
    let bridge_sender = td_sender.bridge_full().await?;
    let federation_sender = td_sender.join_default_fed().await?;

    let td_receiver = TestDevice::new().await?;
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
        spv2_force_sync(federation_receiver).await;
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
