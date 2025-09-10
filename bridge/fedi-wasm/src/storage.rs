use std::path::{Path, PathBuf};

use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::{apply, async_trait_maybe_send, impl_db_record};
use runtime::db::BridgeDbPrefix;
use runtime::storage::{BRIDGE_DB_PREFIX, IStorage};

#[derive(Debug, Encodable, Decodable, PartialEq, Eq, PartialOrd, Ord, Clone)]
pub struct FileStorageKey(String);

#[derive(Debug, Encodable, Decodable)]
pub struct FileStorageKeyPrefix;

impl_db_record!(
    key = FileStorageKey,
    value = Vec<u8>,
    db_prefix = BridgeDbPrefix::WasmFileStorage,
);

pub struct WasmStorage {
    global_db: Database,
}

impl WasmStorage {
    pub async fn new(db: Database) -> anyhow::Result<Self> {
        Ok(Self { global_db: db })
    }
}

#[apply(async_trait_maybe_send!)]
impl IStorage for WasmStorage {
    async fn federation_database_v2(&self, db_name: &str) -> anyhow::Result<Database> {
        assert_eq!(db_name, "global");
        Ok(self.global_db.clone())
    }

    async fn delete_federation_db(&self, db_name: &str) -> anyhow::Result<()> {
        unimplemented!()
    }

    async fn read_file(&self, path: &Path) -> anyhow::Result<Option<Vec<u8>>> {
        let bridge_db = self.global_db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        let mut dbtx = bridge_db.begin_transaction_nc().await;
        Ok(dbtx
            .get_value(&FileStorageKey(path.to_string_lossy().to_string()))
            .await)
    }

    async fn write_file(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()> {
        let bridge_db = self.global_db.with_prefix(vec![BRIDGE_DB_PREFIX]);
        let mut dbtx = bridge_db.begin_transaction().await;
        dbtx.insert_entry(&FileStorageKey(path.to_string_lossy().to_string()), &data)
            .await;
        dbtx.commit_tx().await;
        Ok(())
    }

    fn platform_path(&self, path: &Path) -> PathBuf {
        path.to_owned()
    }
}
