use std::io::Cursor;

use fedimint_core::db::{Database, DatabaseTransaction, IDatabaseTransactionOpsCore};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_derive_secret::DerivableSecret;
use futures::StreamExt;

pub const MAGIC_PREFIX_V0: &[u8; 8] = b"\xFE\xD1DBDMP\x00";
pub const MAGIC_PREFIX_V1: &[u8; 8] = b"\xFE\xD1DBDMP\x01";

#[derive(Debug, Clone, Default, Encodable, Decodable)]
pub struct DbDumpHeader {
    pub federation_secret: Option<DerivableSecret>,
}

/// Dump the database into single buffer.
pub async fn dump_db(
    db: &Database,
    header: &DbDumpHeader,
    buffer: &mut Vec<u8>,
) -> anyhow::Result<()> {
    // assume we will write 1MB
    buffer.reserve(1024 * 1024);
    buffer.extend_from_slice(MAGIC_PREFIX_V1);
    header.consensus_encode(buffer)?;
    let mut dbtx = db.begin_transaction_nc().await;
    let mut stream = dbtx.raw_find_by_prefix(&[]).await?;
    // format: series of fedimint encoding of (Vec<u8>, Vec<u8>)
    while let Some(entry) = stream.next().await {
        <(Vec<u8>, Vec<u8>)>::consensus_encode(&entry, buffer)?;
    }
    Ok(())
}

fn decode_db_dump_header(dump: &[u8]) -> anyhow::Result<(DbDumpHeader, usize)> {
    if dump.starts_with(MAGIC_PREFIX_V1) {
        let payload = &dump[MAGIC_PREFIX_V1.len()..];
        let mut cursor = Cursor::new(payload);
        let header = DbDumpHeader::consensus_decode_partial(&mut cursor, &Default::default())?;
        return Ok((header, MAGIC_PREFIX_V1.len() + cursor.position() as usize));
    }

    if dump.starts_with(MAGIC_PREFIX_V0) {
        return Ok((DbDumpHeader::default(), MAGIC_PREFIX_V0.len()));
    }

    anyhow::bail!("Invalid database dump");
}

/// Import a database dump.
pub async fn import_db_dump(
    dbtx: &mut DatabaseTransaction<'_>,
    dump: &[u8],
) -> anyhow::Result<DbDumpHeader> {
    let (header, dump_entries_start) = decode_db_dump_header(dump)?;
    let dump_entries = &dump[dump_entries_start..];
    let mut cursor = Cursor::new(dump_entries);
    while cursor.position() < dump_entries.len() as u64 {
        let (key, value) =
            <(Vec<u8>, Vec<u8>)>::consensus_decode_partial(&mut cursor, &Default::default())?;
        dbtx.raw_insert_bytes(&key, &value).await?;
    }
    Ok(header)
}
