use std::path::PathBuf;

use devimint::cmd;
use devimint::devfed::DevJitFed;
use devimint::envs::FM_INVITE_CODE_ENV;
use devimint::external::{Bitcoind, Esplora, Lnd};
use devimint::federation::Federation;
use devimint::gatewayd::Gatewayd;
use devimint::recurringd::Recurringd;
use devimint::util::ProcessManager;
use devimint::vars::{self, mkdir};
use fedimint_core::task::TaskGroup;
use fedimint_logging::LOG_DEVIMINT;
use rand::Rng;
use rand::distributions::Alphanumeric;
use runtime::envs::USE_UPSTREAM_FEDIMINTD_ENV;
use tracing::{debug, info, trace};

use crate::{NostrRelay, Synapse};

#[derive(Clone)]
pub struct DevFed {
    pub bitcoind: Bitcoind,
    pub lnd: Lnd,
    pub fed: Federation,
    pub gw_lnd: Gatewayd,
    pub gw_ldk: Gatewayd,
    pub gw_ldk_second: Gatewayd,
    pub esplora: Esplora,
    pub recurringd: Recurringd,
    pub synapse: Synapse,
    pub nostr_relay: NostrRelay,
}

impl DevFed {
    pub async fn new_with_setup(fed_size: usize) -> anyhow::Result<Self> {
        trace!(target: LOG_DEVIMINT, "Starting dev fed");
        let (process_mgr, _) = Self::process_setup(fed_size).await?;
        let dev_fed = DevJitFed::new(&process_mgr, false, false)?;

        debug!(target: LOG_DEVIMINT, "Peging in client and gateways");

        let gw_pegin_amount = 10_000_000;
        let seed_spv2_liquidity = std::env::var(USE_UPSTREAM_FEDIMINTD_ENV).is_err();
        let spv2_liquidity_amount_sats = 5_000_000;
        let client_pegin_amount = 10_000_000 + spv2_liquidity_amount_sats;
        let fixed_meta_json = serde_json::json!({
            "stability_pool_disabled": "false",
            "multispend_disabled": "false",
        })
        .to_string();

        let ((), (), _, synapse, nostr_relay, ()) = tokio::try_join!(
            async {
                let client = dev_fed.internal_client().await?;
                let (address, operation_id) = client.get_deposit_addr().await?;
                dev_fed
                    .bitcoind()
                    .await?
                    .send_to(address, client_pegin_amount)
                    .await?;
                dev_fed.bitcoind().await?.mine_blocks_no_wait(11).await?;
                client.await_deposit(&operation_id).await?;

                if seed_spv2_liquidity {
                    // Deposit to SPV2 stability pool as liquidity provider
                    debug!(target: LOG_DEVIMINT, "Depositing to SPV2 stability pool liquidity");
                    let spv2_min_fee_rate = 1000;
                    cmd!(
                        client,
                        "module",
                        "multi_sig_stability_pool",
                        "deposit-to-provide",
                        spv2_liquidity_amount_sats * 1000,
                        spv2_min_fee_rate
                    )
                    .run()
                    .await?;
                    info!(target: LOG_DEVIMINT, "SPV2 liquidity deposit complete");
                }
                Ok(())
            },
            async {
                let gw_ldk = dev_fed.gw_ldk_connected().await?.clone();
                let address = gw_ldk
                    .get_pegin_addr(&dev_fed.fed().await?.calculate_federation_id())
                    .await?;
                debug!(
                    target: LOG_DEVIMINT,
                    %address,
                    "Sending funds to LDK deposit addr"
                );
                dev_fed
                    .bitcoind()
                    .await?
                    .send_to(address, gw_pegin_amount)
                    .await
                    .map(|_| ())
            },
            async {
                let pegin_addr = dev_fed
                    .gw_lnd_registered()
                    .await?
                    .get_pegin_addr(&dev_fed.fed().await?.calculate_federation_id())
                    .await?;
                dev_fed
                    .bitcoind()
                    .await?
                    .send_to(pegin_addr, gw_pegin_amount)
                    .await?;
                dev_fed.bitcoind().await?.mine_blocks_no_wait(11).await
            },
            Synapse::start(&process_mgr),
            NostrRelay::start(&process_mgr),
            async {
                let client = dev_fed.internal_client().await?;
                for peer in 0..fed_size {
                    cmd!(
                        client,
                        "--our-id",
                        peer,
                        "--password",
                        "pass",
                        "module",
                        "meta",
                        "submit",
                        &fixed_meta_json,
                    )
                    .run()
                    .await?;
                }
                info!(
                    target: LOG_DEVIMINT,
                    "Submitted fixed default currency and exchange-rate federation metadata"
                );
                Ok(())
            },
        )?;

        info!(target: LOG_DEVIMINT, "Pegins completed");

        // TODO: Audit that the environment access only happens in single-threaded code.
        unsafe { std::env::set_var(FM_INVITE_CODE_ENV, dev_fed.fed().await?.invite_code()?) };
        // TODO: Audit that the environment access only happens in single-threaded code.
        unsafe { std::env::set_var("DEVI_SYNAPSE_SERVER", &synapse.url) };
        unsafe { std::env::set_var("DEVI_NOSTR_RELAY", &nostr_relay.url) };

        dev_fed.finalize(&process_mgr).await?;
        info!(target: LOG_DEVIMINT, "Devfed ready");

        let devimint = dev_fed.to_dev_fed(&process_mgr).await?;
        // Expose recurringd API for tests via env override
        unsafe {
            std::env::set_var(
                "TEST_BRIDGE_RECURRINGD_API",
                devimint.recurringd.api_url.to_string(),
            )
        };
        Ok(Self {
            bitcoind: devimint.bitcoind,
            lnd: devimint.lnd,
            fed: devimint.fed,
            gw_lnd: devimint.gw_lnd,
            gw_ldk: devimint.gw_ldk,
            gw_ldk_second: devimint.gw_ldk_second,
            esplora: devimint.esplora,
            recurringd: devimint.recurringd,
            synapse,
            nostr_relay,
        })
    }

    pub async fn process_setup(fed_size: usize) -> anyhow::Result<(ProcessManager, TaskGroup)> {
        let test_dir = std::env::temp_dir().join(format!(
            "devimint-{}-{}",
            std::process::id(),
            rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .filter(u8::is_ascii_digit)
                .take(3)
                .map(char::from)
                .collect::<String>()
        ));
        mkdir(test_dir.clone()).await?;
        let logs_dir: PathBuf = test_dir.join("logs");
        mkdir(logs_dir.clone()).await?;

        let globals = vars::Global::new(&test_dir, 1, fed_size, 0, None).await?;

        info!(target: LOG_DEVIMINT, path=%globals.FM_DATA_DIR.display() , "Devimint data dir");

        for (var, value) in globals.vars() {
            debug!(var, value, "Env variable set");
            // TODO: Audit that the environment access only happens in single-threaded code.
            unsafe { std::env::set_var(var, value) };
        }
        let process_mgr = ProcessManager::new(globals);
        let task_group = TaskGroup::new();
        Ok((process_mgr, task_group))
    }
}
