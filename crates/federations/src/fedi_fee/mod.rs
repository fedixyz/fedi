use std::collections::HashMap;
use std::sync::Arc;

use anyhow::bail;
use bitcoin::Network;
use fedimint_core::core::ModuleKind;
use fedimint_core::encoding::{Decodable, Encodable};
use futures::Stream;
use rpc_types::{RpcFediFeeStream, RpcTransactionDirection};
use runtime::bridge_runtime::Runtime;
use runtime::constants::FEDI_FEE_SCHEDULE_REFRESH_DELAY;
use runtime::nightly_panic;
use runtime::storage::state::{FediFeeSchedule, ModuleFediFeeSchedule};
use tokio::sync::watch;
use tokio_stream::wrappers::WatchStream;
use tracing::error;

pub(crate) mod app;
pub(crate) mod db;
pub(crate) mod guardian;
pub(crate) mod guardian_metadata;
pub use app::FediFeeRemittanceService;
use guardian::FEDI_GUARDIAN_FEE_SEND_PPM_MAX;
pub use guardian::{GuardianFeeRemittanceService, parse_fedi_guardian_fee_config};

/// Distinguishes the independently accrued Fedi fee streams that may be
/// charged on the same underlying transaction volume.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Encodable, Decodable)]
pub enum FediFeeStream {
    App,
    Guardian,
}

impl From<RpcFediFeeStream> for FediFeeStream {
    fn from(stream: RpcFediFeeStream) -> Self {
        match stream {
            RpcFediFeeStream::App => FediFeeStream::App,
            RpcFediFeeStream::Guardian => FediFeeStream::Guardian,
        }
    }
}

/// Helper struct to encapsulate all state and logic related to Fedi fee. This
/// struct can be consumed by both the bridge and each individual federation
/// instance. That way we have a single source of truth.
pub struct FediFeeHelper {
    runtime: Arc<Runtime>,
    fee_schedule_map: watch::Sender<Option<HashMap<Network, FediFeeSchedule>>>,
}

#[derive(Debug, thiserror::Error)]
pub enum FediFeeHelperError {
    #[error("Provided federation ID {0} is not registered")]
    UnknownFederation(String),
    #[error("Provided module {0} is not known")]
    UnknownModule(ModuleKind),
}

// maximum fedi fee ppm that bridge would pay. it is 20x our current fee in
// prod.
const FEDI_FEE_MAX_PPM: u64 = 2100 * 20;

impl FediFeeHelper {
    pub fn new(runtime: Arc<Runtime>) -> Self {
        Self {
            runtime,
            fee_schedule_map: watch::channel(None).0,
        }
    }

    /// Update app fee schedule in background.
    ///
    /// Caller should run this method in a task.
    pub async fn update_app_fee_schedule_continuously(&self) -> ! {
        loop {
            // Fetch fee schedule from Fedi API. Presently the endpoint is different per
            // network (mainnet, mutinynet etc.).
            let networks = [Network::Bitcoin, Network::Signet];
            let api_calls = networks.iter().map(|&network| {
                let runtime = &self.runtime;
                async move {
                    match runtime.fedi_api.fetch_fedi_fee_schedule(network).await {
                        Ok(fedi_fee_schedule) => (network, Some(fedi_fee_schedule)),
                        Err(error) => {
                            error!(%network, ?error, "Failed to fetch fedi fee schedule");
                            (network, None)
                        }
                    }
                }
            });
            let network_fee_schedule_map = futures::future::join_all(api_calls)
                .await
                .into_iter()
                .filter_map(|(network, schedule)| Some((network, schedule?)))
                .collect::<HashMap<_, _>>();
            self.fee_schedule_map
                .send_replace(Some(network_fee_schedule_map));
            fedimint_core::task::sleep(FEDI_FEE_SCHEDULE_REFRESH_DELAY).await;
        }
    }

    /// Subscribe to app fee schedule updates.
    pub fn subscribe_to_app_fee_schedule_updates(
        &self,
    ) -> impl Stream<Item = Option<HashMap<Network, FediFeeSchedule>>> + use<> {
        WatchStream::new(self.fee_schedule_map.subscribe())
    }

    /// Get the last fetched app fee schedule for the given network if any.
    pub fn maybe_latest_app_fee_schedule(&self, network: Network) -> Option<FediFeeSchedule> {
        self.fee_schedule_map
            .borrow()
            .as_ref()
            .and_then(|schedule_map| schedule_map.get(&network))
            .cloned()
    }

    /// For the given federation ID returns the full app fee schedule. If the
    /// federation ID is unknown, returns an error.
    pub async fn get_app_fee_schedule(
        &self,
        federation_id_str: String,
    ) -> anyhow::Result<FediFeeSchedule, FediFeeHelperError> {
        self.runtime
            .app_state
            .with_read_lock(move |state| {
                state
                    .joined_federations
                    .get(&federation_id_str)
                    .ok_or(FediFeeHelperError::UnknownFederation(federation_id_str))
                    .map(|fed_info| fed_info.fedi_fee_schedule.clone())
            })
            .await
    }

    /// Returns the fee to be charged in ppm for the given stream. If either
    /// the federation ID or the module is unknown, returns an error.
    pub async fn get_fee_ppm(
        &self,
        stream: FediFeeStream,
        federation_id_str: String,
        module: ModuleKind,
        direction: RpcTransactionDirection,
    ) -> anyhow::Result<u64, FediFeeHelperError> {
        let fee_ppm = self
            .runtime
            .app_state
            .with_read_lock(move |state| {
                state
                    .joined_federations
                    .get(&federation_id_str)
                    .ok_or(FediFeeHelperError::UnknownFederation(federation_id_str))
                    .and_then(|fed_info| match stream {
                        FediFeeStream::App => fed_info
                            .fedi_fee_schedule
                            .modules
                            .get(&module)
                            .ok_or(FediFeeHelperError::UnknownModule(module))
                            .map(|module_schedule| match direction {
                                RpcTransactionDirection::Receive => module_schedule.receive_ppm,
                                RpcTransactionDirection::Send => module_schedule.send_ppm,
                            }),
                        FediFeeStream::Guardian => Ok(fed_info
                            .guardian_fee_config
                            .as_ref()
                            .map(|config| match direction {
                                RpcTransactionDirection::Send => config.send_ppm,
                                RpcTransactionDirection::Receive => 0,
                            })
                            .unwrap_or(0)),
                    })
            })
            .await?;
        let max_fee_ppm = match stream {
            FediFeeStream::App => FEDI_FEE_MAX_PPM,
            FediFeeStream::Guardian => FEDI_GUARDIAN_FEE_SEND_PPM_MAX,
        };
        if fee_ppm >= max_fee_ppm {
            nightly_panic!(self.runtime, "fedi fee is too high: {fee_ppm}");
            Ok(max_fee_ppm)
        } else {
            Ok(fee_ppm)
        }
    }

    /// Sets the app fee schedule for a single module. If the federation ID is
    /// unknown, returns an error.
    pub async fn set_app_module_fee_schedule(
        &self,
        federation_id_str: String,
        module: ModuleKind,
        fee_schedule: ModuleFediFeeSchedule,
    ) -> anyhow::Result<()> {
        self.runtime
            .app_state
            .with_write_lock(|state| {
                let Some(fed_info) = state.joined_federations.get_mut(&federation_id_str) else {
                    bail!(FediFeeHelperError::UnknownFederation(federation_id_str));
                };
                fed_info
                    .fedi_fee_schedule
                    .modules
                    .insert(module, fee_schedule);
                Ok(())
            })
            .await?
    }
}
