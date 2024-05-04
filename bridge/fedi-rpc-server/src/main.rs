#[tokio::main]
pub async fn main() -> anyhow::Result<()> {
    let data_dir = std::env::args().nth(1).expect("usage: rpc-server DATADIR");
    fediffi::remote::init(data_dir.into()).await?;
    Ok(())
}
