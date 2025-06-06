use std::collections::BTreeMap;
use std::time::Duration;

use fedimint_api_client::api::DynGlobalApi;
use fedimint_client::db::{MetaFieldPrefix, MetaServiceInfoKey};
use fedimint_client::meta::MetaService;
use fedimint_client::module::meta::{
    fetch_meta_overrides, FetchKind, MetaFieldKey, MetaFieldValue, MetaSource, MetaValues,
};
use fedimint_core::config::ClientConfig;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::util::{backoff_util, retry};
use fedimint_core::{apply, async_trait_maybe_send};
use futures::StreamExt;

pub type MetaEntries = BTreeMap<String, String>;

#[apply(async_trait_maybe_send)]
pub trait MetaServiceExt {
    async fn entries(&self, db: &Database) -> Option<MetaEntries>;
    async fn entries_from_db(&self, db: &Database) -> Option<MetaEntries>;
}

#[apply(async_trait_maybe_send)]
impl MetaServiceExt for MetaService {
    /// Get all meta entries.
    ///
    /// This may wait for significant time on first run when there is no cached
    /// data.
    async fn entries(&self, db: &Database) -> Option<MetaEntries> {
        if let Some(value) = self.entries_from_db(db).await {
            // might be from in old cache.
            // TODO: maybe old cache should have a ttl?
            Some(value)
        } else {
            // wait for initial value
            self.wait_initialization().await;
            self.entries_from_db(db).await
        }
    }

    /// Retrieve all meta entries from the database
    async fn entries_from_db(&self, db: &Database) -> Option<MetaEntries> {
        let dbtx = &mut db.begin_transaction_nc().await;
        let info = dbtx.get_value(&MetaServiceInfoKey).await;
        #[allow(clippy::question_mark)] // more readable
        if info.is_none() {
            return None;
        }
        let entries: MetaEntries = dbtx
            .find_by_prefix(&MetaFieldPrefix)
            .await
            .map(|(k, v)| (k.0 .0, v.0 .0))
            .collect()
            .await;
        Some(entries)
    }
}

/// Legacy non-meta module config source uses client config meta and
/// meta_override_url meta field.
#[derive(Clone, Debug, Default)]
#[non_exhaustive]
pub struct LegacyMetaSourceWithExternalUrl {
    reqwest: reqwest::Client,
}

pub const META_EXTERNAL_URL_FIELD: &str = "meta_external_url";
pub const META_OVERRIDE_URL_FIELD: &str = "meta_override_url";
#[apply(async_trait_maybe_send!)]
impl MetaSource for LegacyMetaSourceWithExternalUrl {
    async fn wait_for_update(&self) {
        fedimint_core::runtime::sleep(Duration::from_secs(10 * 60)).await;
    }

    async fn fetch(
        &self,
        client_config: &ClientConfig,
        _api: &DynGlobalApi,
        fetch_kind: FetchKind,
        last_revision: Option<u64>,
    ) -> anyhow::Result<MetaValues> {
        let config_iter = client_config
            .global
            .meta
            .iter()
            .map(|(key, value)| (MetaFieldKey(key.clone()), MetaFieldValue(value.clone())));
        let backoff = match fetch_kind {
            // need to be fast the first time.
            FetchKind::Initial => backoff_util::aggressive_backoff(),
            FetchKind::Background => backoff_util::custom_backoff(
                Duration::from_secs(10),
                Duration::from_secs(10 * 60),
                None,
            ),
        };
        let overrides = retry("fetch_meta_overrides", backoff, || async {
            let static_meta = &client_config.global.meta;
            if static_meta.contains_key(META_OVERRIDE_URL_FIELD) {
                fetch_meta_overrides(&self.reqwest, client_config, META_OVERRIDE_URL_FIELD).await
            } else {
                fetch_meta_overrides(&self.reqwest, client_config, META_EXTERNAL_URL_FIELD).await
            }
        })
        .await?;
        Ok(MetaValues {
            values: config_iter.chain(overrides).collect(),
            revision: last_revision.map_or(0, |r| r + 1),
        })
    }
}
