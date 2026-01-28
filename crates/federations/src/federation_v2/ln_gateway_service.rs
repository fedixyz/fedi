use std::collections::HashSet;
use std::str::FromStr;
use std::time::Duration;

use bitcoin::secp256k1::{self, PublicKey};
use fedimint_client::Client;
use fedimint_core::db::{AutocommitError, IDatabaseTransactionOpsCoreTyped};
use fedimint_ln_common::{LightningGateway, LightningGatewayAnnouncement};
use rand::seq::SliceRandom;
use rand::thread_rng;
use tracing::warn;

use super::FederationV2;
use super::client::ClientExt;
use super::db::LastActiveGatewayKey;

pub const META_VETTED_GATEWAYS_KEY: &str = "vetted_gateways";

#[derive(Debug, Clone)]
pub struct LnGatewayService {}

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
        Self {}
    }

    pub async fn set_active_gateway(
        &self,
        client: &Client,
        gw_id: &secp256k1::PublicKey,
    ) -> anyhow::Result<()> {
        client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin(async {
                        dbtx.insert_entry(&LastActiveGatewayKey, gw_id).await;
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

    pub async fn get_active_gateway(&self, client: &Client) -> Option<secp256k1::PublicKey> {
        let mut dbtx = client.db().begin_transaction_nc().await;
        dbtx.get_value(&LastActiveGatewayKey).await
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
        Self::maybe_filter_vetted_gateways(client, gateways)
            .await
            .into_iter()
            // filter out all gateways are about to expire
            .filter(|g| ABOUT_TO_EXPIRE_DURATION < g.ttl)
            .collect()
    }

    pub async fn select_gateway(
        &self,
        client: &Client,
    ) -> anyhow::Result<Option<LightningGateway>> {
        let ln = client.ln()?;
        let last_active_gateway_id = self.get_active_gateway(client).await;
        let mut gws = Self::selectable_gateways(client, ln.list_gateways().await).await;

        // this should be rare, the background service should keep the gateways updated.
        if gws.is_empty() {
            if let Err(error) = ln.update_gateway_cache().await {
                warn!(?error, "updating gateway cache failed");
            }
            gws = Self::selectable_gateways(client, ln.list_gateways().await).await;
        }

        if let Some(gw) = gws
            .iter()
            .find(|g| Some(g.info.gateway_id) == last_active_gateway_id)
        {
            Ok(Some(gw.info.clone()))
        } else {
            // select a new random gateway
            let Some(gw) = gws.choose(&mut thread_rng()) else {
                return Ok(None);
            };
            self.set_active_gateway(client, &gw.info.gateway_id).await?;
            Ok(Some(gw.info.clone()))
        }
    }
}
