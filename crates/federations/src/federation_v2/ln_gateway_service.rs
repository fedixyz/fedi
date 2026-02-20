use std::collections::HashSet;
use std::str::FromStr;
use std::time::Duration;

use anyhow::Context as _;
use bitcoin::secp256k1::{self, PublicKey};
use fedimint_client::Client;
use fedimint_core::db::{AutocommitError, IDatabaseTransactionOpsCoreTyped};
use fedimint_ln_common::{LightningGateway, LightningGatewayAnnouncement};
use tokio::sync::Mutex;
use tracing::warn;

use super::FederationV2;
use super::client::ClientExt;
use super::db::GatewayOverrideKey;

pub const META_VETTED_GATEWAYS_KEY: &str = "vetted_gateways";

#[derive(Debug)]
pub struct LnGatewayService {
    last_gateway: Mutex<Option<secp256k1::PublicKey>>,
}

/// Duration to fetch updates before gateways are about to expire
const ABOUT_TO_EXPIRE_DURATION: Duration = Duration::from_secs(30);

impl LnGatewayService {
    pub fn new(fed: &FederationV2) -> Self {
        fed.spawn_cancellable("gateway_update_cache", |fed| async move {
            if let Ok(ln) = fed.client.ln() {
                ln.update_gateway_cache_continuously(|gws| {
                    Self::maybe_filter_vetted_gateways(&fed.client, gws)
                })
                .await
            }
        });
        Self {
            last_gateway: Mutex::new(None),
        }
    }

    pub async fn set_gateway_override(
        &self,
        client: &Client,
        gw_id: Option<&secp256k1::PublicKey>,
    ) -> anyhow::Result<()> {
        client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async {
                        if let Some(gw_id) = gw_id {
                            dbtx.insert_entry(&GatewayOverrideKey, gw_id).await;
                        } else {
                            dbtx.remove_entry(&GatewayOverrideKey).await;
                        }
                        Ok(())
                    })
                },
                None,
            )
            .await
            .map_err(|e| match e {
                AutocommitError::CommitFailed { last_error, .. } => anyhow::anyhow!(last_error),
                AutocommitError::ClosureError { error, .. } => error,
            })
    }

    pub async fn get_gateway_override(&self, client: &Client) -> Option<secp256k1::PublicKey> {
        let mut dbtx = client.db().begin_transaction_nc().await;
        dbtx.get_value(&GatewayOverrideKey).await
    }

    async fn maybe_filter_vetted_gateways(
        client: &Client,
        gateways: Vec<LightningGatewayAnnouncement>,
    ) -> Vec<LightningGatewayAnnouncement> {
        let meta_service = client.meta_service();
        let vetted_gws = meta_service
            .get_field::<Vec<String>>(client.db(), META_VETTED_GATEWAYS_KEY)
            .await
            .map_or(Vec::new(), |v| v.value.unwrap_or_default())
            .into_iter()
            .filter_map(|str| {
                PublicKey::from_str(&str)
                    .inspect_err(|err| warn!(?err, %str, "failed to parse vetted gateway"))
                    .ok()
            })
            .collect::<HashSet<_>>();

        let (vetted, unvetted) = gateways
            .into_iter()
            .partition::<Vec<_>, _>(|g| vetted_gws.contains(&g.info.gateway_id));

        if !vetted.is_empty() { vetted } else { unvetted }
    }

    async fn selectable_gateways(
        client: &Client,
        gateways: Vec<LightningGatewayAnnouncement>,
    ) -> Vec<LightningGatewayAnnouncement> {
        let gws: Vec<LightningGatewayAnnouncement> =
            Self::maybe_filter_vetted_gateways(client, gateways)
                .await
                .into_iter()
                // filter out all gateways are about to expire
                .filter(|g| ABOUT_TO_EXPIRE_DURATION < g.ttl)
                .collect();

        // In bridge tests don't use iroh gateways
        #[cfg(feature = "test-support")]
        let gws = gws
            .into_iter()
            .filter(|g| g.info.api.scheme() != "iroh")
            .collect();

        gws
    }

    pub async fn select_gateway(
        &self,
        client: &Client,
    ) -> anyhow::Result<Option<LightningGateway>> {
        let ln = client.ln()?;
        let gateway_override = self.get_gateway_override(client).await;
        let mut gws = Self::selectable_gateways(client, ln.list_gateways().await).await;

        // this should be rare, the background service should keep the gateways updated.
        if gws.is_empty() {
            if let Err(error) = ln.update_gateway_cache().await {
                warn!(?error, "updating gateway cache failed");
            }
            gws = Self::selectable_gateways(client, ln.list_gateways().await).await;
        }

        // If override is set, it must be available or we error out
        if let Some(override_id) = gateway_override {
            let gw = gws
                .iter()
                .find(|g| g.info.gateway_id == override_id)
                .context("gateway override is set but gateway is unavailable")?;
            return Ok(Some(gw.info.clone()));
        }

        if gws.is_empty() {
            return Ok(None);
        }

        // Round-robin gateway selection:
        // Gateways are sorted by ID for a stable ordering. We track the last
        // selected gateway ID in memory and pick the first gateway whose ID is
        // strictly greater than it. When we reach the end (no ID is greater),
        // we wrap around to index 0. This naturally handles gateways being
        // added or removed: if the last gateway disappears, we still advance
        // to the next one in sorted order rather than getting stuck.
        gws.sort_by_key(|g| g.info.gateway_id);
        let mut last = self.last_gateway.lock().await;
        let idx = match *last {
            Some(prev) => gws
                .iter()
                .position(|g| g.info.gateway_id > prev)
                .unwrap_or(0),
            None => 0,
        };
        let chosen = &gws[idx];
        *last = Some(chosen.info.gateway_id);
        Ok(Some(chosen.info.clone()))
    }
}
