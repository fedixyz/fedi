use std::path::PathBuf;

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
        let client_pegin_amount = 10_000_000;

        let ((), (), _, synapse, nostr_relay) = tokio::try_join!(
            async {
                let (address, operation_id) =
                    dev_fed.internal_client().await?.get_deposit_addr().await?;
                dev_fed
                    .bitcoind()
                    .await?
                    .send_to(address, client_pegin_amount)
                    .await?;
                dev_fed.bitcoind().await?.mine_blocks_no_wait(11).await?;
                dev_fed
                    .internal_client()
                    .await?
                    .await_deposit(&operation_id)
                    .await
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

    async fn process_setup(fed_size: usize) -> anyhow::Result<(ProcessManager, TaskGroup)> {
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
