use std::fs;
use std::path::PathBuf;

use bug_report::db_dump::import_db_dump;
use clap::Parser;

#[derive(Parser)]
enum Command {
    /// Undump db.dump file created by the app into a rocksdb database.
    Undump {
        db_path: PathBuf,
        dump_path: PathBuf,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let Command::Undump { db_path, dump_path } = Command::parse();
    let db = fedimint_rocksdb::RocksDb::open(db_path).await?;
    let db = fedimint_core::db::Database::new(db, Default::default());
    let mut dbtx = db.begin_transaction().await;
    import_db_dump(&mut dbtx.to_ref_nc(), &fs::read(dump_path)?).await?;
    dbtx.commit_tx().await;
    Ok(())
}
