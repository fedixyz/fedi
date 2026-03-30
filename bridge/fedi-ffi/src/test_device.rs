use std::path::Path;
use std::str::FromStr;
use std::sync::{Arc, OnceLock, RwLock};
use std::time::Duration;

use anyhow::{bail, Context};
use bridge::onboarding::{BridgeOnboarding, RpcOnboardingStage};
use bridge::{Bridge, BridgeFull};
use devimint::cmd;
use devimint::util::LnCli;
use federations::federation_v2::FederationV2;
use fedimint_connectors::ConnectorRegistry;
use matrix::Matrix;
use multispend::multispend_matrix::MultispendMatrix;
use nostr::secp256k1::PublicKey;
use redb_storage::PathBasedRedbStorage;
pub use runtime::api::MockFediApi;
use runtime::event::IEventSink;
use runtime::features::{FeatureCatalog, RuntimeEnvironment};
use runtime::storage::state::DeviceIdentifier;
use runtime::storage::{OnboardingCompletionMethod, Storage};
use tempfile::TempDir;
use tokio::sync::OnceCell;

use crate::rpc::{self, TryGet};

/// A device for running the bridge, restarting the bridge, read from storage.
pub struct TestDevice {
    // once{cell,lock} is for laziness of computing (the default) values
    // when user overrides the values, we just overwrite the entire OnceCell.
    storage: OnceCell<Storage>,
    connectors: ConnectorRegistry,
    device_identifier: OnceLock<DeviceIdentifier>,
    fedi_api: OnceLock<Arc<MockFediApi>>,
    feature_catalog: OnceLock<Arc<FeatureCatalog>>,
    event_sink: OnceLock<Arc<FakeEventSink>>,
    bridge_uncommited: OnceCell<Arc<Bridge>>,
    bridge_full: OnceCell<Arc<BridgeFull>>,
    default_client: OnceCell<Arc<FederationV2>>,
}

struct TempDataDir(Arc<TempDir>);
impl AsRef<Path> for TempDataDir {
    fn as_ref(&self) -> &Path {
        self.0.path()
    }
}

impl TestDevice {
    pub async fn new() -> anyhow::Result<Self> {
        Ok(Self {
            storage: Default::default(),
            connectors: ConnectorRegistry::build_from_testing_defaults()
                .bind()
                .await?,
            device_identifier: Default::default(),
            fedi_api: Default::default(),
            feature_catalog: Default::default(),
            event_sink: Default::default(),
            bridge_uncommited: Default::default(),
            bridge_full: Default::default(),
            default_client: Default::default(),
        })
    }

    pub async fn with_data_dir(
        &mut self,
        data_dir: impl Into<Arc<TempDir>>,
    ) -> anyhow::Result<&mut Self> {
        self.storage = OnceCell::from(Arc::new(
            PathBasedRedbStorage::new(TempDataDir(data_dir.into())).await?,
        ) as Storage);
        Ok(self)
    }

    pub fn with_device_identifier(&mut self, device_identifier: impl Into<String>) -> &mut Self {
        self.device_identifier = OnceLock::from(
            DeviceIdentifier::from_str(&device_identifier.into())
                .expect("Invalid device identifier"),
        );
        self
    }

    pub fn with_fedi_api(&mut self, fedi_api: Arc<MockFediApi>) -> &mut Self {
        self.fedi_api = OnceLock::from(fedi_api);
        self
    }

    pub fn with_feature_catalog(&mut self, feature_catalog: Arc<FeatureCatalog>) -> &mut Self {
        self.feature_catalog = OnceLock::from(feature_catalog);
        self
    }

    pub async fn storage(&self) -> anyhow::Result<&Storage> {
        self.storage
            .get_or_try_init(|| async {
                Ok(Arc::new(
                    PathBasedRedbStorage::new(TempDataDir(Arc::new(TempDir::new()?))).await?,
                ) as _)
            })
            .await
    }

    pub async fn connectors(&self) -> &ConnectorRegistry {
        &self.connectors
    }

    fn device_identifier(&self) -> DeviceIdentifier {
        self.device_identifier
            .get_or_init(|| DeviceIdentifier::from_str("test:device:default").unwrap())
            .clone()
    }

    pub fn fedi_api(&self) -> Arc<MockFediApi> {
        self.fedi_api
            .get_or_init(|| Arc::new(MockFediApi::default()))
            .clone()
    }

    fn feature_catalog(&self) -> Arc<FeatureCatalog> {
        self.feature_catalog
            .get_or_init(|| Arc::new(FeatureCatalog::new(RuntimeEnvironment::Tests)))
            .clone()
    }

    pub fn event_sink(&self) -> Arc<FakeEventSink> {
        self.event_sink
            .get_or_init(|| Arc::new(FakeEventSink::default()))
            .clone()
    }

    pub async fn bridge_maybe_onboarding(&self) -> anyhow::Result<&Arc<Bridge>> {
        self.bridge_uncommited
            .get_or_try_init(|| async {
                Ok(Arc::new(
                    Bridge::new(
                        self.storage().await?.clone(),
                        self.connectors().await.clone(),
                        self.event_sink(),
                        self.fedi_api(),
                        self.feature_catalog(),
                        self.device_identifier(),
                    )
                    .await?,
                ))
            })
            .await
    }

    /// Auto completes onboarding if needed
    pub async fn bridge_full(&self) -> anyhow::Result<&Arc<BridgeFull>> {
        self.bridge_full
            .get_or_try_init(|| async {
                let bridge = self.bridge_maybe_onboarding().await?;
                if let Ok(b) = TryGet::<Arc<BridgeOnboarding>>::try_get(&**bridge) {
                    if let RpcOnboardingStage::Init = b.stage().await? {
                        bridge
                            .complete_onboarding(OnboardingCompletionMethod::NewSeed)
                            .await?;
                    }
                }
                Ok(bridge.full()?.clone())
            })
            .await
    }

    pub async fn matrix(&self) -> anyhow::Result<&Arc<Matrix>> {
        Ok(self.bridge_full().await?.matrix.wait().await)
    }

    pub async fn multispend(&self) -> anyhow::Result<&Arc<MultispendMatrix>> {
        Ok(self.bridge_full().await?.matrix.wait_multispend().await)
    }

    pub async fn join_default_fed(&self) -> anyhow::Result<&Arc<FederationV2>> {
        self.default_client
            .get_or_try_init(|| async {
                let bridge = self.bridge_full().await?;
                let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
                let fedimint_federation = rpc::joinFederation(bridge, invite_code, false).await?;
                let federation = bridge
                    .federations
                    .get_federation_maybe_recovering(&fedimint_federation.id.0)?;
                use_lnd_gateway(&federation).await?;
                Ok(federation)
            })
            .await
    }

    pub fn drop_default_fed(&mut self) -> anyhow::Result<()> {
        self.default_client.take().context("federation not exist")?;
        Ok(())
    }

    pub async fn shutdown(&mut self) -> anyhow::Result<()> {
        self.default_client.take();
        self.bridge_full.take();
        if let Some(bridge) = self.bridge_uncommited.take() {
            if let Ok(runtime) = bridge.runtime() {
                runtime
                    .task_group
                    .clone()
                    .shutdown_join_all(Duration::from_secs(5))
                    .await?;
            }
        }
        // also reset the event sink
        self.event_sink.take();
        Ok(())
    }
}

// shutdown everything to release tasks earlier
impl Drop for TestDevice {
    fn drop(&mut self) {
        self.default_client.take();
        self.bridge_full.take();
        if let Some(bridge) = self.bridge_uncommited.take() {
            if let Ok(runtime) = bridge.runtime() {
                runtime.task_group.shutdown();
            }
        }
        // also reset the event sink
        self.event_sink.take();
    }
}

#[derive(Default)]
pub struct FakeEventSink {
    pub events: Arc<RwLock<Vec<(String, String)>>>,
}

impl IEventSink for FakeEventSink {
    fn event(&self, event_type: String, body: String) {
        let mut events = self
            .events
            .write()
            .expect("couldn't acquire FakeEventSink lock");
        events.push((event_type, body));
    }
}

impl FakeEventSink {
    pub fn events(&self) -> Vec<(String, String)> {
        self.events
            .read()
            .expect("FakeEventSink could not acquire read lock")
            .clone()
    }
    pub fn num_events_of_type(&self, event_type: String) -> usize {
        self.events().iter().filter(|e| e.0 == event_type).count()
    }
}

/// Get LND pubkey using lncli, then have `federation` switch to using
/// whatever gateway is using that node pubkey
pub async fn use_lnd_gateway(federation: &FederationV2) -> anyhow::Result<()> {
    let lnd_node_pubkey: PublicKey = cmd!(LnCli, "getinfo").out_json().await?["identity_pubkey"]
        .as_str()
        .map(|s| s.to_owned())
        .unwrap()
        .parse()
        .unwrap();
    let mut gateways = federation.list_gateways().await?;
    if gateways.is_empty() {
        federation.select_gateway().await?;
        gateways = federation.list_gateways().await?;
    }
    for gateway in gateways {
        if gateway.node_pub_key.0 == lnd_node_pubkey {
            federation
                .set_gateway_override(Some(&gateway.gateway_id.0))
                .await?;
            return Ok(());
        }
    }
    bail!("No gateway is using LND's node pubkey")
}
