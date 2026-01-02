use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::Context;
use async_trait::async_trait;
use fedimint_core::db::Database;
use fedimint_core::module::registry::ModuleDecoderRegistry;
use runtime::storage::IStorage;

#[derive(Clone)]
pub struct PathBasedRedbStorage<P> {
    data_dir: P,
}

impl<P> PathBasedRedbStorage<P> {
    pub async fn new(data_dir: P) -> anyhow::Result<Self> {
        Ok(Self { data_dir })
    }
}

#[async_trait]
impl<P> IStorage for PathBasedRedbStorage<P>
where
    P: AsRef<Path> + Send + Sync + 'static,
{
    async fn federation_database_v2(&self, db_name: &str) -> anyhow::Result<Database> {
        let db_path = self.data_dir.as_ref().join(format!("{db_name}.redb"));
        let redb = fedimint_cursed_redb::MemAndRedb::new(db_path).await?;
        Ok(Database::new(redb, ModuleDecoderRegistry::default()))
    }

    async fn delete_federation_db(&self, db_name: &str) -> anyhow::Result<()> {
        let db_path = self.data_dir.as_ref().join(format!("{db_name}.redb"));
        std::fs::remove_file(db_path).context("delete redb file")?;
        Ok(())
    }

    async fn read_file(&self, path: &Path) -> anyhow::Result<Option<Vec<u8>>> {
        let path = self.platform_path(path);

        if !path.exists() {
            return Ok(None);
        }

        Ok(Some(tokio::fs::read(path).await?))
    }

    async fn write_file(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()> {
        let path = self.platform_path(path);
        // tokio::fs::write is bad, creates a second copy of data
        Ok(tokio::task::spawn_blocking(move || {
            let tmp_path = path.with_extension("tmp");
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&tmp_path)?;
            file.write_all(&data)?;
            file.flush()?;
            file.sync_data()?;
            drop(file);
            std::fs::rename(tmp_path, path)
        })
        .await??)
    }

    fn write_file_sync(&self, path: &Path, data: Vec<u8>) -> anyhow::Result<()> {
        let path = self.platform_path(path);
        let tmp_path = path.with_extension("tmp");
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&tmp_path)?;
        file.write_all(&data)?;
        file.flush()?;
        file.sync_data()?;
        drop(file);
        Ok(std::fs::rename(tmp_path, path)?)
    }

    fn platform_path(&self, path: &Path) -> PathBuf {
        if path.is_absolute() {
            path.to_owned()
        } else {
            self.data_dir.as_ref().join(path)
        }
    }
}
