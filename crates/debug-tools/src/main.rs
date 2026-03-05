use std::fs;
use std::path::PathBuf;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use bug_report::db_dump::{MAGIC_PREFIX_V0, MAGIC_PREFIX_V1, import_db_dump};
use clap::Parser;
use fedimint_core::encoding::Encodable;

#[derive(Parser)]
enum Command {
    /// Undump db.dump file created by the app into a rocksdb database.
    Undump {
        db_path: PathBuf,
        dump_path: PathBuf,
    },
}

fn has_dump_magic(bytes: &[u8]) -> bool {
    bytes.starts_with(MAGIC_PREFIX_V0) || bytes.starts_with(MAGIC_PREFIX_V1)
}

fn decode_dump_input(input: Vec<u8>) -> anyhow::Result<Vec<u8>> {
    if has_dump_magic(&input) {
        return Ok(input);
    }

    let text = std::str::from_utf8(&input).map_err(|_| {
        anyhow::anyhow!("Invalid database dump (not raw dump bytes or base64 text)")
    })?;
    let normalized: String = text.chars().filter(|c| !c.is_ascii_whitespace()).collect();

    if let Ok(decoded) = STANDARD.decode(normalized.as_bytes())
        && has_dump_magic(&decoded)
    {
        return Ok(decoded);
    }

    anyhow::bail!("Invalid database dump (expected raw dump bytes or base64-encoded dump)");
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let Command::Undump { db_path, dump_path } = Command::parse();
    let db = fedimint_rocksdb::RocksDb::build(db_path).open().await?;
    let db = fedimint_core::db::Database::new(db, Default::default());
    let mut dbtx = db.begin_transaction().await;
    let dump_bytes = decode_dump_input(fs::read(dump_path)?)?;
    let header = import_db_dump(&mut dbtx.to_ref_nc(), &dump_bytes).await?;
    match header.federation_secret {
        Some(federation_secret) => {
            println!("federation_secret header exists: true");
            println!(
                "federation_secret header value: {}",
                federation_secret.consensus_encode_to_hex()
            );
        }
        None => {
            println!("federation_secret header exists: false");
        }
    }
    dbtx.commit_tx().await;
    Ok(())
}
