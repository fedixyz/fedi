use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex as StdMutex;

use anyhow::bail;
use fediffi::storage::IStorage;
use fedimint_core::{apply, async_trait_maybe_send};
use rexie::{ObjectStore, Rexie, TransactionMode};
use wasm_bindgen::{JsCast, JsValue};

use crate::db::{rexie_to_anyhow, MemAndIndexedDb};

pub struct WasmStorage {
    rexie_files: Rexie,
    federation: StdMutex<HashMap<String, MemAndIndexedDb>>,
}

impl WasmStorage {
    pub async fn new() -> anyhow::Result<Self> {
        let rexie_files = Rexie::builder("files")
            .version(1)
            .add_object_store(ObjectStore::new("default"))
            .build()
            .await
            .map_err(rexie_to_anyhow)?;
        Ok(Self {
            rexie_files,
            federation: StdMutex::new(HashMap::new()),
        })
    }
}

#[apply(async_trait_maybe_send!)]
impl IStorage for WasmStorage {
    async fn federation_database_v2(
        &self,
        db_name: &str,
    ) -> anyhow::Result<fedimint_core::db::Database> {
        let db = MemAndIndexedDb::new(&format!("{db_name}")).await?;
        let mut fed = self.federation.lock().unwrap();
        fed.insert(db_name.to_string(), db.clone());
        Ok(fedimint_core::db::Database::new(db, Default::default()))
    }

    async fn delete_federation_db(&self, db_name: &str) -> anyhow::Result<()> {
        let mut fed = self.federation.lock().unwrap();
        let _db = fed.remove(db_name).unwrap();
        drop(fed);
        // FIXME: this blocks forever due to being in used in client.
        // db.delete().await?;
        Ok(())
    }

    async fn read_file(&self, path: &Path) -> anyhow::Result<Option<Vec<u8>>> {
        let transaction = self
            .rexie_files
            .transaction(&["default"], TransactionMode::ReadOnly)
            .map_err(rexie_to_anyhow)?;
        let store = transaction.store("default").map_err(rexie_to_anyhow)?;
        let key = JsValue::from_str(&path.to_str().expect("path is valid unicode"));
        let value = store.get(&key).await;
        match value {
            Ok(value) if value.is_undefined() => Ok(None),
            Ok(value) => match value.dyn_into::<js_sys::Uint8Array>() {
                Ok(v) => Ok(Some(v.to_vec())),
                Err(e) => bail!(format!("failed to read_file: {e:?}")),
            },
            Err(e) => Err(rexie_to_anyhow(e)),
        }
    }

    async fn write_file(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()> {
        let transaction = self
            .rexie_files
            .transaction(&["default"], TransactionMode::ReadWrite)
            .map_err(rexie_to_anyhow)?;
        let store = transaction.store("default").map_err(rexie_to_anyhow)?;
        let key = JsValue::from_str(&path.to_str().expect("path is valid unicode"));
        let value = js_sys::Uint8Array::from(&data[..]);
        store
            .put(&value, Some(&key))
            .await
            .map_err(rexie_to_anyhow)?;
        Ok(())
    }

    fn platform_path(&self, path: &Path) -> PathBuf {
        path.to_owned()
    }
}
