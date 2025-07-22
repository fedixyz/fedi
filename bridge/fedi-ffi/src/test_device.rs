use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{Duration, SystemTime};

use anyhow::{bail, Context};
use bitcoin::Network;
use bridge::onboarding::{BridgeOnboarding, RpcOnboardingStage};
use bridge::{Bridge, BridgeFull};
use devimint::cmd;
use devimint::util::LnCli;
use federations::federation_v2::FederationV2;
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy as _;
use fedimint_client::ModuleKind;
use fedimint_core::{apply, async_trait_maybe_send, Amount};
use lightning_invoice::Bolt11Invoice;
use nostr::secp256k1::PublicKey;
use runtime::api::{IFediApi, RegisterDeviceError, RegisteredDevice, TransactionDirection};
use runtime::event::IEventSink;
use runtime::features::{FeatureCatalog, RuntimeEnvironment};
use runtime::storage::state::{DeviceIdentifier, FediFeeSchedule};
use runtime::storage::{OnboardingCompletionMethod, Storage};
use tempfile::TempDir;
use tokio::sync::{Mutex, OnceCell};

use crate::ffi::PathBasedStorage;
use crate::rpc::{self, TryGet};

/// A device for running the bridge, restarting the bridge, read from storage.
#[derive(Default)]
pub struct TestDevice {
    // once{cell,lock} is for laziness of computing (the default) values
    // when user overrides the values, we just overwrite the entire OnceCell.
    storage: OnceCell<Storage>,
    device_identifier: OnceLock<DeviceIdentifier>,
    fedi_api: OnceLock<Arc<MockFediApi>>,
    feature_catalog: OnceLock<Arc<FeatureCatalog>>,
    event_sink: OnceLock<Arc<dyn IEventSink>>,
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
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn with_data_dir(
        &mut self,
        data_dir: impl Into<Arc<TempDir>>,
    ) -> anyhow::Result<&mut Self> {
        self.storage = OnceCell::from(Arc::new(
            PathBasedStorage::new(TempDataDir(data_dir.into())).await?,
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

    pub fn with_event_sink(&mut self, event_sink: Arc<dyn IEventSink>) -> &mut Self {
        self.event_sink = OnceLock::from(event_sink);
        self
    }

    pub async fn storage(&self) -> anyhow::Result<&Storage> {
        self.storage
            .get_or_try_init(|| async {
                Ok(
                    Arc::new(PathBasedStorage::new(TempDataDir(Arc::new(TempDir::new()?))).await?)
                        as _,
                )
            })
            .await
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
            .get_or_init(|| Arc::new(FeatureCatalog::new(RuntimeEnvironment::Dev)))
            .clone()
    }

    fn event_sink(&self) -> Arc<dyn IEventSink> {
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

    pub async fn join_default_fed(&self) -> anyhow::Result<&Arc<FederationV2>> {
        self.default_client
            .get_or_try_init(|| async {
                let bridge = self.bridge_full().await?;
                let invite_code = std::env::var("FM_INVITE_CODE").unwrap();
                let fedimint_federation =
                    rpc::joinFederation(&bridge.federations, invite_code, false).await?;
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

type DeviceIndex = u8;

#[derive(Default)]
pub struct MockFediApi {
    // (seed, index) => (encrypted device identifier, last registration timestamp)
    device_registation_registry:
        Mutex<HashMap<(bip39::Mnemonic, DeviceIndex), (String, SystemTime)>>,

    // Invoice that will be returned whenever fetch_fedi_invoice is called
    fedi_fee_invoice: Option<Bolt11Invoice>,
}

impl MockFediApi {
    pub fn set_fedi_fee_invoice(&mut self, invoice: Bolt11Invoice) {
        self.fedi_fee_invoice = Some(invoice);
    }
}

#[apply(async_trait_maybe_send!)]
impl IFediApi for MockFediApi {
    async fn fetch_fedi_fee_schedule(&self, _network: Network) -> anyhow::Result<FediFeeSchedule> {
        Ok(FediFeeSchedule::default())
    }

    async fn fetch_fedi_fee_invoice(
        &self,
        _amount: Amount,
        _network: Network,
        _module: ModuleKind,
        _tx_direction: TransactionDirection,
    ) -> anyhow::Result<Bolt11Invoice> {
        self.fedi_fee_invoice
            .clone()
            .ok_or(anyhow::anyhow!("Invoice not set"))
    }

    async fn fetch_registered_devices_for_seed(
        &self,
        seed: bip39::Mnemonic,
    ) -> anyhow::Result<Vec<RegisteredDevice>> {
        let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&seed);
        let mut devices = self
            .device_registation_registry
            .lock()
            .await
            .iter()
            .filter_map(|(k, v)| {
                if k.0 == seed {
                    Some(
                        match DeviceIdentifier::from_encrypted_string(&v.0, &root_secret) {
                            Ok(identifier) => Ok(RegisteredDevice {
                                index: k.1,
                                identifier,
                                last_renewed: v.1,
                            }),
                            Err(e) => Err(e),
                        },
                    )
                } else {
                    None
                }
            })
            .collect::<anyhow::Result<Vec<_>>>()?;

        devices.sort_by_key(|r| r.index);
        Ok(devices)
    }

    async fn register_device_for_seed(
        &self,
        seed: bip39::Mnemonic,
        device_index: u8,
        encrypted_device_identifier: String,
        force_overwrite: bool,
    ) -> anyhow::Result<(), RegisterDeviceError> {
        let mut registry = self.device_registation_registry.lock().await;
        if let Some(value) = registry.get_mut(&(seed.clone(), device_index)) {
            if force_overwrite || encrypted_device_identifier == value.0 {
                value.0 = encrypted_device_identifier;
                value.1 = fedimint_core::time::now();
                Ok(())
            } else {
                Err(RegisterDeviceError::AnotherDeviceOwnsIndex(format!(
                    "{} already owned by {}, not overwriting",
                    device_index, value.0
                )))
            }
        } else {
            registry.insert(
                (seed, device_index),
                (encrypted_device_identifier, fedimint_core::time::now()),
            );
            Ok(())
        }
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
    fn events(&self) -> Vec<(String, String)> {
        self.events
            .read()
            .expect("FakeEventSink could not acquire read lock")
            .clone()
    }
    fn num_events_of_type(&self, event_type: String) -> usize {
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
            federation.switch_gateway(&gateway.gateway_id.0).await?;
            return Ok(());
        }
    }
    bail!("No gateway is using LND's node pubkey")
}
