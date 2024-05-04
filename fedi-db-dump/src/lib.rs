use std::io::Cursor;

use fedimint_core::db::{Database, DatabaseTransaction, IDatabaseTransactionOpsCore};
use fedimint_core::encoding::{Decodable, Encodable};
use futures::StreamExt;

pub const MAGIC_PREFIX_V0: &[u8; 8] = b"\xFE\xD1DBDMP\x00";

/// Dump the database into single buffer.
pub async fn dump_db(db: &Database, buffer: &mut Vec<u8>) -> anyhow::Result<()> {
    // assume we will write 1MB
    buffer.reserve(1024 * 1024);
    buffer.extend_from_slice(MAGIC_PREFIX_V0);
    let mut dbtx = db.begin_transaction_nc().await;
    let mut stream = dbtx.raw_find_by_prefix(&[]).await?;
    // format: series of fedimint encoding of (Vec<u8>, Vec<u8>)
    while let Some(entry) = stream.next().await {
        <(Vec<u8>, Vec<u8>)>::consensus_encode(&entry, buffer)?;
    }
    Ok(())
}

/// Import a database dump.
pub async fn import_db_dump(dbtx: &mut DatabaseTransaction<'_>, dump: &[u8]) -> anyhow::Result<()> {
    anyhow::ensure!(dump.starts_with(MAGIC_PREFIX_V0), "Invalid database dump");
    let dump = &dump[MAGIC_PREFIX_V0.len()..];
    let mut cursor = Cursor::new(dump);
    while cursor.position() < dump.len() as u64 {
        let (key, value) =
            <(Vec<u8>, Vec<u8>)>::consensus_decode(&mut cursor, &Default::default())?;
        dbtx.raw_insert_bytes(&key, &value).await?;
    }
    Ok(())
}
