//! Uses immutable data structures and saves to redb on commit.

use std::fmt::Debug;
use std::io;
use std::ops::Range;
use std::sync::{Arc, Mutex};

use anyhow::{Context as _, Result};
use fedimint_core::db::{
    IDatabaseTransactionOps, IDatabaseTransactionOpsCore, IRawDatabase, IRawDatabaseTransaction,
    PrefixStream,
};
use fedimint_core::{apply, async_trait_maybe_send};
use futures::stream;
use imbl::OrdMap;
use redb::{Database, ReadableTable, StorageBackend, TableDefinition};
use tracing::instrument;
use web_sys::wasm_bindgen::JsValue;
use web_sys::{FileSystemReadWriteOptions, FileSystemSyncAccessHandle};

const KV_TABLE: TableDefinition<&[u8], &[u8]> = TableDefinition::new("fedimint_kv");

#[derive(Debug, Default)]
pub struct DatabaseInsertOperation {
    pub key: Vec<u8>,
    pub value: Vec<u8>,
    pub old_value: Option<Vec<u8>>,
}

#[derive(Debug, Default)]
pub struct DatabaseDeleteOperation {
    pub key: Vec<u8>,
    pub old_value: Option<Vec<u8>>,
}

#[derive(Debug)]
pub enum DatabaseOperation {
    Insert(DatabaseInsertOperation),
    Delete(DatabaseDeleteOperation),
}

#[derive(Clone)]
pub struct MemAndRedb {
    data: Arc<Mutex<OrdMap<Vec<u8>, Vec<u8>>>>,
    db: Arc<Database>,
}

impl Debug for MemAndRedb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MemDatabase").finish_non_exhaustive()
    }
}

#[derive(Debug)]
pub struct MemAndRedbTransaction<'a> {
    operations: Vec<DatabaseOperation>,
    tx_data: OrdMap<Vec<u8>, Vec<u8>>,
    db: &'a MemAndRedb,
}

#[derive(Debug)]
struct WasmBackend {
    sync_handle: FileSystemSyncAccessHandle,
}

fn js_error_to_anyhow(unknown_error: impl Into<JsValue>) -> anyhow::Error {
    match gloo_utils::errors::JsError::try_from(unknown_error.into()) {
        Ok(error) => error.into(),
        Err(error) => anyhow::format_err!(error.to_string()),
    }
}
fn js_error_to_io_error(err: impl Into<JsValue>) -> std::io::Error {
    std::io::Error::other(js_error_to_anyhow(err))
}

impl WasmBackend {
    fn new(sync_handle: FileSystemSyncAccessHandle) -> Self {
        Self { sync_handle }
    }
}

impl StorageBackend for WasmBackend {
    fn len(&self) -> io::Result<u64> {
        let size = self.sync_handle.get_size().map_err(js_error_to_io_error)?;
        Ok(size as u64)
    }

    fn read(&self, offset: u64, len: usize) -> io::Result<Vec<u8>> {
        let mut buffer = vec![0u8; len];
        let mut bytes_read = 0;
        let options = FileSystemReadWriteOptions::new();
        // redb wants exact reads
        while bytes_read != len {
            assert!(bytes_read < len);
            options.set_at((offset + bytes_read as u64) as f64);

            bytes_read += self
                .sync_handle
                .read_with_u8_array_and_options(&mut buffer[bytes_read..], &options)
                .map_err(js_error_to_io_error)? as usize;
        }
        Ok(buffer)
    }

    fn set_len(&self, len: u64) -> io::Result<()> {
        self.sync_handle
            .truncate_with_f64(len as f64)
            .map_err(js_error_to_io_error)?;
        Ok(())
    }

    fn sync_data(&self, _eventual: bool) -> io::Result<()> {
        self.sync_handle.flush().map_err(js_error_to_io_error)?;
        Ok(())
    }

    fn write(&self, offset: u64, data: &[u8]) -> io::Result<()> {
        let options = FileSystemReadWriteOptions::new();
        options.set_at(offset as f64);
        let mut bytes_written = 0;
        // redb wants exact writes
        while bytes_written != data.len() {
            assert!(bytes_written < data.len());
            options.set_at((offset + bytes_written as u64) as f64);

            bytes_written += self
                .sync_handle
                .write_with_u8_array_and_options(&data[bytes_written..], &options)
                .map_err(js_error_to_io_error)? as usize;
        }
        Ok(())
    }
}

// SAFETY: we don't use threads in wasm, this will fail very loudly at runtime
// if this get sent across threads
unsafe impl Send for WasmBackend {}
unsafe impl Sync for WasmBackend {}

impl MemAndRedb {
    pub fn new(file: FileSystemSyncAccessHandle) -> Result<Self> {
        let backend = WasmBackend::new(file);
        let db = Database::builder()
            .create_with_backend(backend)
            .context("Failed to create/open redb database")?;
        let db = Arc::new(db);
        let mut data = OrdMap::new();

        // Load existing data from redb
        let read_txn = db
            .begin_read()
            .context("Failed to begin read transaction")?;
        if let Ok(table) = read_txn.open_table(KV_TABLE) {
            for entry in table.iter()? {
                let (key, value) = entry?;
                data.insert(key.value().to_vec(), value.value().to_vec());
            }
        }
        // Table might not exist on first run, which is fine

        Ok(Self {
            data: Arc::new(Mutex::new(data)),
            db,
        })
    }
}

#[apply(async_trait_maybe_send!)]
impl IRawDatabase for MemAndRedb {
    type Transaction<'a> = MemAndRedbTransaction<'a>;
    #[instrument(skip_all, fields(id))]
    async fn begin_transaction<'a>(&'a self) -> MemAndRedbTransaction<'a> {
        MemAndRedbTransaction {
            operations: Vec::new(),
            tx_data: {
                let data_lock = self.data.lock().expect("poison");
                data_lock.clone()
            },
            db: self,
        }
    }

    fn checkpoint(&self, _: &std::path::Path) -> Result<(), anyhow::Error> {
        unimplemented!()
    }
}

#[apply(async_trait_maybe_send!)]
impl<'a> IDatabaseTransactionOpsCore for MemAndRedbTransaction<'a> {
    async fn raw_insert_bytes(&mut self, key: &[u8], value: &[u8]) -> Result<Option<Vec<u8>>> {
        let val = IDatabaseTransactionOpsCore::raw_get_bytes(self, key).await;
        // Insert data from copy so we can read our own writes
        let old_value = self.tx_data.insert(key.to_vec(), value.to_vec());
        self.operations
            .push(DatabaseOperation::Insert(DatabaseInsertOperation {
                key: key.to_vec(),
                value: value.to_vec(),
                old_value,
            }));
        val
    }

    async fn raw_get_bytes(&mut self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        Ok(self.tx_data.get(key).cloned())
    }

    async fn raw_remove_entry(&mut self, key: &[u8]) -> Result<Option<Vec<u8>>> {
        // Remove data from copy so we can read our own writes
        let old_value = self.tx_data.remove(&key.to_vec());
        self.operations
            .push(DatabaseOperation::Delete(DatabaseDeleteOperation {
                key: key.to_vec(),
                old_value: old_value.clone(),
            }));
        Ok(old_value)
    }

    async fn raw_find_by_range(&mut self, range: Range<&[u8]>) -> Result<PrefixStream<'_>> {
        let data = self
            .tx_data
            .range::<_, Vec<u8>>(Range {
                start: range.start.to_vec(),
                end: range.end.to_vec(),
            })
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<Vec<_>>();

        Ok(Box::pin(stream::iter(data)))
    }

    async fn raw_find_by_prefix(&mut self, key_prefix: &[u8]) -> Result<PrefixStream<'_>> {
        let data = self
            .tx_data
            .range::<_, Vec<u8>>((key_prefix.to_vec())..)
            .take_while(|(key, _)| key.starts_with(key_prefix))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<Vec<_>>();

        Ok(Box::pin(stream::iter(data)))
    }

    async fn raw_remove_by_prefix(&mut self, key_prefix: &[u8]) -> anyhow::Result<()> {
        let keys = self
            .tx_data
            .range::<_, Vec<u8>>((key_prefix.to_vec())..)
            .take_while(|(key, _)| key.starts_with(key_prefix))
            .map(|(key, _)| key.clone())
            .collect::<Vec<_>>();
        for key in keys.iter() {
            let old_value = self.tx_data.remove(&key.to_vec());
            self.operations
                .push(DatabaseOperation::Delete(DatabaseDeleteOperation {
                    key: key.to_vec(),
                    old_value,
                }));
        }
        Ok(())
    }

    async fn raw_find_by_prefix_sorted_descending(
        &mut self,
        key_prefix: &[u8],
    ) -> Result<PrefixStream<'_>> {
        let mut data = self
            .tx_data
            .range::<_, Vec<u8>>((key_prefix.to_vec())..)
            .take_while(|(key, _)| key.starts_with(key_prefix))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<Vec<_>>();
        data.sort_by(|a, b| a.cmp(b).reverse());

        Ok(Box::pin(stream::iter(data)))
    }
}

#[apply(async_trait_maybe_send!)]
impl<'a> IDatabaseTransactionOps for MemAndRedbTransaction<'a> {
    async fn rollback_tx_to_savepoint(&mut self) -> Result<()> {
        unimplemented!()
    }

    async fn set_tx_savepoint(&mut self) -> Result<()> {
        unimplemented!()
    }
}

// In-memory database transaction should only be used for test code and never
// for production as it doesn't properly implement MVCC
#[apply(async_trait_maybe_send!)]
impl<'a> IRawDatabaseTransaction for MemAndRedbTransaction<'a> {
    async fn commit_tx(self) -> Result<()> {
        let mut data_locked = self.db.data.lock().expect("poison");
        let write_txn = self.db.db.begin_write()?;
        let operations = self.operations;
        let mut data_new = data_locked.clone();
        {
            let mut table = write_txn
                .open_table(KV_TABLE)
                .context("Failed to open redb table")?;

            // Apply all operations
            for op in operations {
                match op {
                    DatabaseOperation::Insert(insert_op) => {
                        table
                            .insert(&insert_op.key[..], &insert_op.value[..])
                            .context("Failed to insert into redb")?;
                        let old_value = data_new.insert(insert_op.key, insert_op.value);
                        anyhow::ensure!(old_value == insert_op.old_value, "write-write conflict");
                    }
                    DatabaseOperation::Delete(delete_op) => {
                        table
                            .remove(&delete_op.key[..])
                            .context("Failed to delete from redb")?;
                        let old_value = data_new.remove(&delete_op.key);
                        anyhow::ensure!(old_value == delete_op.old_value, "write-write conflict");
                    }
                }
            }
        }
        // Commit redb transaction
        write_txn
            .commit()
            .context("Failed to commit redb transaction")?;

        // Update in-memory data
        *data_locked = data_new;
        Ok(())
    }
}
