use clap::{Parser, Subcommand};
use devimint::cli::CommonArgs;

#[derive(Parser)]
struct Args {
    #[clap(flatten)]
    common: CommonArgs,
    #[clap(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    #[clap(flatten)]
    Devimint(devimint::cli::Cmd),
    #[clap(flatten)]
    DevimintTest(devimint::tests::TestCmd),
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
        Cmd::DevimintTest(test_cmd) => {
            devimint::tests::handle_command(test_cmd, args.common).await?
        }
    }
    Ok(())
}
