use std::ops::ControlFlow;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::Context;
use clap::{Parser, Subcommand};
use devimint::cli::{setup, CommonArgs};
use devimint::tests::{latency_tests, LatencyTest};
use devimint::util::poll;
use devimint::{cmd, dev_fed, DevFed};

#[derive(Parser)]
struct Args {
    #[clap(flatten)]
    common: CommonArgs,
    #[clap(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    TestUpgrade {
        old_fedimintd: PathBuf,
        new_fedimintd: PathBuf,
    },
    TestUpgradeShutdownTogether {
        old_fedimintd: PathBuf,
        new_fedimintd: PathBuf,
    },
    #[clap(flatten)]
    Devimint(devimint::cli::Cmd),
}

use tracing::info;
async fn wait_session(client: &devimint::federation::Client) -> anyhow::Result<()> {
    info!("Waiting for a new session");
    let session_count = cmd!(client, "dev", "api", "session_count")
        .out_json()
        .await?["value"]
        .as_u64()
        .context("session count must be integer")?
        .to_owned();
    let start = Instant::now();
    poll(
        "Waiting for a new session",
        Some(Duration::from_secs(180)),
        || async {
            info!("Awaiting session outcome {session_count}");
            match cmd!(client, "dev", "api", "await_session_outcome", session_count)
                .run()
                .await
            {
                Err(e) => Err(ControlFlow::Continue(e)),
                Ok(_) => Ok(()),
            }
        },
    )
    .await?;
    let session_found_in = start.elapsed();
    info!("session found in {session_found_in:?}");
    Ok(())
}

async fn stress_test_fed(dev_fed: &DevFed) -> anyhow::Result<()> {
    tokio::try_join!(
        latency_tests(dev_fed.clone(), LatencyTest::Reissue),
        latency_tests(dev_fed.clone(), LatencyTest::LnSend),
        latency_tests(dev_fed.clone(), LatencyTest::LnReceive),
        latency_tests(dev_fed.clone(), LatencyTest::FmPay),
        latency_tests(dev_fed.clone(), LatencyTest::Restore),
    )?;
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Args = Args::parse();
    match args.cmd {
        Cmd::Devimint(cmd) => {
            std::env::set_var("FM_DISBALE_META_MODULE", "1");
            std::env::set_var("FM_USE_UNKNOWN_MODULE", "0");
            devimint::cli::handle_command(cmd, args.common).await?;
        }
        Cmd::TestUpgrade {
            old_fedimintd,
            new_fedimintd,
        } => {
            let (process_mgr, _) = setup(args.common).await?;
            std::env::set_var("FM_FEDIMINTD_BASE_EXECUTABLE", old_fedimintd);
            std::env::set_var("INCLUDE_STABILITY_POOL", "1");
            std::env::set_var("USE_STABILITY_POOL_TEST_PARAMS", "1");
            let mut dev_fed = dev_fed(&process_mgr).await?;
            let client = dev_fed.fed.new_joined_client("test-client").await?;

            tokio::try_join!(stress_test_fed(&dev_fed), wait_session(&client))?;

            dev_fed.fed.terminate_server(3).await?;
            // wait for SP cycle
            tokio::time::sleep(Duration::from_secs(30)).await;
            dev_fed.fed.terminate_server(0).await?;
            dev_fed.fed.terminate_server(1).await?;
            dev_fed.fed.terminate_server(2).await?;
            // upgrade fedimint
            std::env::set_var("FM_FEDIMINTD_BASE_EXECUTABLE", new_fedimintd);
            dev_fed.fed.start_server(&process_mgr, 2).await?;
            dev_fed.fed.start_server(&process_mgr, 1).await?;
            dev_fed.fed.start_server(&process_mgr, 0).await?;
            tokio::time::sleep(Duration::from_secs(30)).await;
            dev_fed.fed.start_server(&process_mgr, 3).await?;

            stress_test_fed(&dev_fed).await?;
        }
        Cmd::TestUpgradeShutdownTogether {
            old_fedimintd,
            new_fedimintd,
        } => {
            let (process_mgr, _) = setup(args.common).await?;
            std::env::set_var("FM_FEDIMINTD_BASE_EXECUTABLE", old_fedimintd);
            std::env::set_var("INCLUDE_STABILITY_POOL", "1");
            std::env::set_var("USE_STABILITY_POOL_TEST_PARAMS", "1");
            let mut dev_fed = dev_fed(&process_mgr).await?;
            let client = dev_fed.fed.new_joined_client("test-client").await?;

            stress_test_fed(&dev_fed).await?;
            wait_session(&client).await?;
            let futures = std::mem::take(&mut dev_fed.fed.members)
                .into_values()
                .map(|x| x.terminate());
            futures::future::try_join_all(futures).await?;
            // upgrade fedimint
            std::env::set_var("FM_FEDIMINTD_BASE_EXECUTABLE", new_fedimintd);
            dev_fed.fed.start_server(&process_mgr, 2).await?;
            dev_fed.fed.start_server(&process_mgr, 1).await?;
            dev_fed.fed.start_server(&process_mgr, 0).await?;
            dev_fed.fed.start_server(&process_mgr, 3).await?;
            stress_test_fed(&dev_fed).await?;
            wait_session(&client).await?;
            wait_session(&client).await?;
            stress_test_fed(&dev_fed).await?;
        }
    }
    Ok(())
}
