use std::sync::{Arc, Weak};
use std::time::{Duration, SystemTime};

use bitcoin::secp256k1;
use fedimint_client::{Client, ClientHandle};
use fedimint_core::db::{AutocommitError, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::task::TaskGroup;
use fedimint_ln_client::LightningClientModule;
use fedimint_ln_common::{LightningGateway, LightningGatewayAnnouncement};
use rand::seq::SliceRandom;
use rand::{thread_rng, Rng as _};
use tokio::sync::{Mutex, RwLock};
use tracing::warn;

use super::db::LastActiveGatewayKey;

#[derive(Debug, Clone)]
pub struct LnGatewayService {
    state: Arc<State>,
}

trait GatewayAnnouncementsExt {
    /// Filter to only vetted gateways if list has any vetted gateway otherwise
    /// return the original list.
    fn maybe_filter_vetted(self) -> Vec<LightningGatewayAnnouncement>;
}

impl GatewayAnnouncementsExt for Vec<LightningGatewayAnnouncement> {
    /// Filter to only vetted gateways if list has any vetted gateway otherwise
    /// return the original list.
    fn maybe_filter_vetted(self) -> Vec<LightningGatewayAnnouncement> {
        let (vetted, unvetted): (Vec<_>, Vec<_>) = self.into_iter().partition(|g| g.vetted);
        if !vetted.is_empty() {
            vetted
        } else {
            unvetted
        }
    }
}

#[derive(Debug)]
pub struct State {
    last_updated: RwLock<SystemTime>,
    // held while updating the cache to avoid multiple updates at same time.
    updating: Mutex<()>,
}

/// Duration to fetch updates before gateways are about to expire
const ABOUT_TO_EXPIRE_DURATION: Duration = Duration::from_secs(30);

impl LnGatewayService {
    // TODO: expose and use ClientWeak from fedimint
    pub async fn new(client: Weak<ClientHandle>, task_group: &TaskGroup) -> Self {
        let this = Self {
            state: Arc::new(State {
                last_updated: RwLock::new(SystemTime::UNIX_EPOCH),
                updating: Mutex::new(()),
            }),
        };
        task_group.spawn_cancellable("ln gateway service", this.clone().run_in_background(client));
        this
    }
    pub async fn update(&self, client: &Client) -> anyhow::Result<()> {
        let old_last_updated = self.last_updated().await;
        let _guard = self.state.updating.lock();
        // just got updated by last lock holder
        if old_last_updated != self.last_updated().await {
            return Ok(());
        }

        client
            .get_first_module::<LightningClientModule>()
            .update_gateway_cache(/* apply_meta= */ true)
            .await?;

        *self.state.last_updated.write().await = fedimint_core::time::now();

        Ok(())
    }

    pub async fn last_updated(&self) -> SystemTime {
        *self.state.last_updated.read().await
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
                AutocommitError::CommitFailed { last_error, .. } => last_error,
                AutocommitError::ClosureError { error, .. } => error,
            })
    }

    pub async fn get_active_gateway(&self, client: &Client) -> Option<secp256k1::PublicKey> {
        let mut dbtx = client.db().begin_transaction_nc().await;
        dbtx.get_value(&LastActiveGatewayKey).await
    }

    async fn selectable_gateways(&self, client: &Client) -> Vec<LightningGatewayAnnouncement> {
        client
            .get_first_module::<LightningClientModule>()
            .list_gateways()
            .await
            .maybe_filter_vetted()
            .into_iter()
            // filter out all gateways are about to expire
            .filter(|g| ABOUT_TO_EXPIRE_DURATION < g.ttl)
            .collect()
    }

    pub async fn select_gateway(
        &self,
        client: &Client,
    ) -> anyhow::Result<Option<LightningGateway>> {
        let last_active_gateway_id = self.get_active_gateway(client).await;
        let mut gws = self.selectable_gateways(client).await;

        // this should be rare, the background service should keep the gateways updated.
        if gws.is_empty() {
            self.update(client).await?;
            gws = self.selectable_gateways(client).await;
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

    async fn wait_time_for_gateway_expiry(client: &Client) -> Duration {
        let gws = client
            .get_first_module::<LightningClientModule>()
            .list_gateways()
            .await
            .maybe_filter_vetted();
        gws.iter()
            .map(|g| g.ttl.saturating_sub(ABOUT_TO_EXPIRE_DURATION))
            .min()
            .unwrap_or_default()
    }

    async fn run_in_background(self, client_weak: Weak<ClientHandle>) {
        loop {
            let Some(client) = client_weak.upgrade() else {
                return;
            };
            let wait_time = Self::wait_time_for_gateway_expiry(&client).await;
            drop(client);
            fedimint_core::task::sleep(wait_time).await;

            for attempt in 1.. {
                // upgrade each time to allow shutdowns
                let Some(client) = client_weak.upgrade() else {
                    return;
                };
                match self.update(&client).await {
                    Ok(_) => break,
                    Err(_) => {
                        warn!("updating gateway cache failed, retrying");
                    }
                }
                drop(client);
                let time = 1 << attempt.min(9);
                // max = 17.1 minutes
                let time = rand::thread_rng().gen_range(time..(2 * time));
                fedimint_core::task::sleep(Duration::from_secs(time)).await;
            }
        }
    }
}
