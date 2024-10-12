use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

use anyhow::{anyhow, bail};
use async_recursion::async_recursion;
use bitcoin::Network;
use fedimint_core::core::ModuleKind;
use fedimint_core::db::IDatabaseTransactionOpsCoreTyped;
use fedimint_core::task::TaskGroup;
use fedimint_core::Amount;
use fedimint_ln_client::{LightningClientModule, OutgoingLightningPayment};
use futures::StreamExt;
use lightning_invoice::Bolt11Invoice;
use tokio::sync::{Mutex, OwnedMutexGuard};
use tracing::{error, info, instrument, warn};

use crate::api::IFediApi;
use crate::constants::MILLION;
use crate::federation_v2::db::{
    OutstandingFediFeesPerTXTypeKey, OutstandingFediFeesPerTXTypeKeyPrefix,
};
use crate::federation_v2::{zero_gateway_fees, FederationV2};
use crate::storage::{AppState, FediFeeSchedule, ModuleFediFeeSchedule};
use crate::types::{LightningSendMetadata, RpcTransactionDirection};

/// Helper struct to encapsulate all state and logic related to Fedi fee. This
/// struct can be consumed by both the bridge and each individual federation
/// instance. That way we have a single source of truth.
pub struct FediFeeHelper {
    fedi_api: Arc<dyn IFediApi>,
    app_state: Arc<AppState>,
    task_group: TaskGroup,
}

#[derive(Debug, thiserror::Error)]
pub enum FediFeeHelperError {
    #[error("Provided federation ID {0} is not registered")]
    UnknownFederation(String),
    #[error("Provided module {0} is not known")]
    UnknownModule(ModuleKind),
}

impl FediFeeHelper {
    pub fn new(
        fedi_api: Arc<dyn IFediApi>,
        app_state: Arc<AppState>,
        task_group: TaskGroup,
    ) -> Self {
        Self {
            fedi_api,
            app_state,
            task_group,
        }
    }

    /// In a separate task, queries Fedi api to fetch the fee schedule and
    /// updates the AppState
    pub async fn fetch_and_update_fedi_fee_schedule(
        &self,
        fed_network_map: HashMap<String, Network>,
    ) {
        let fedi_api = self.fedi_api.clone();
        let app_state = self.app_state.clone();
        self.task_group
            .spawn_cancellable("fetch and update fedi fee schedule", async move {
                // Fetch fee schedule from Fedi API. Presently the endpoint is different per
                // network (mainnet, mutinynet etc.). So we iterate through the mapping of
                // federation => network and collect a set-union of all the networks. Then we
                // make an API call for each network we need, and finally we update each
                // federation's FederationInfo within AppState with the correct fee schedule.
                let networks = fed_network_map.values().cloned().collect::<HashSet<_>>();
                let api_calls = networks.iter().map(|network| {
                    let fedi_api = fedi_api.clone();
                    async move {
                        match fedi_api.fetch_fedi_fee_schedule(*network).await {
                            Ok(fedi_fee_schedule) => (*network, Some(fedi_fee_schedule)),
                            Err(error) => {
                                error!(%network, ?error, "Failed to fetch fedi fee schedule");
                                (*network, None)
                            }
                        }
                    }
                });
                let network_fee_schedule_map = futures::future::join_all(api_calls)
                    .await
                    .into_iter()
                    .filter_map(|(network, schedule)| Some((network, schedule?)))
                    .collect::<HashMap<_, _>>();
                let app_state_update_res = app_state
                    .with_write_lock(|state| {
                        state.joined_federations.iter_mut().for_each(|(id, info)| {
                            // Only proceed if this federation was provided in the input map
                            let Some(network) = fed_network_map.get(id) else {
                                warn!(%id, "Federation not provided as input to fee-fetch task");
                                return;
                            };

                            // Only proceed if we have fetched a fee schedule for the fed's network
                            let Some(fedi_fee_schedule) = network_fee_schedule_map.get(network)
                            else {
                                return;
                            };

                            info.fedi_fee_schedule = fedi_fee_schedule.clone();
                        })
                    })
                    .await;

                if let Err(error) = app_state_update_res {
                    error!(
                        ?error,
                        "Failed to update app state with new fedi fee schedule"
                    )
                }
            });
    }

    /// For the given federation ID returns the full Fedi fee schedule. If the
    /// federation ID is unknown, returns an error.
    pub async fn get_federation_schedule(
        &self,
        federation_id_str: String,
    ) -> anyhow::Result<FediFeeSchedule, FediFeeHelperError> {
        self.app_state
            .with_read_lock(move |state| {
                state
                    .joined_federations
                    .get(&federation_id_str)
                    .ok_or(FediFeeHelperError::UnknownFederation(federation_id_str))
                    .map(|fed_info| fed_info.fedi_fee_schedule.clone())
            })
            .await
    }

    /// Returns the fedi fee to be charged in ppm. If either the federation ID
    /// or the module is unknown, returns an error.
    pub async fn get_fedi_fee_ppm(
        &self,
        federation_id_str: String,
        module: ModuleKind,
        direction: RpcTransactionDirection,
    ) -> anyhow::Result<u64, FediFeeHelperError> {
        self.app_state
            .with_read_lock(move |state| {
                state
                    .joined_federations
                    .get(&federation_id_str)
                    .ok_or(FediFeeHelperError::UnknownFederation(federation_id_str))
                    .map(|fed_info| {
                        fed_info
                            .fedi_fee_schedule
                            .modules
                            .get(&module)
                            .ok_or(FediFeeHelperError::UnknownModule(module))
                            .map(|module_schedule| match direction {
                                RpcTransactionDirection::Receive => module_schedule.receive_ppm,
                                RpcTransactionDirection::Send => module_schedule.send_ppm,
                            })
                    })
            })
            .await?
    }

    /// Sets the ModuleFediFeeSchedule. If the federation ID is unknown, returns
    /// an error.
    pub async fn set_module_fee_schedule(
        &self,
        federation_id_str: String,
        module: ModuleKind,
        fee_schedule: ModuleFediFeeSchedule,
    ) -> anyhow::Result<()> {
        self.app_state
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

    /// Queries Fedi api to fetch a lightning invoice for the given amount so
    /// that accrued oustanding fees may be remitted. Note that fee is accrued
    /// and remitted at the federation-level (and not at the bridge-level), even
    /// though this method is federation agnostic (because only an amount is
    /// needed to ask for an invoice).
    pub async fn fetch_fedi_fee_invoice(
        &self,
        amount: Amount,
        network: Network,
        module: ModuleKind,
        tx_direction: RpcTransactionDirection,
    ) -> anyhow::Result<Bolt11Invoice> {
        self.fedi_api
            .fetch_fedi_fee_invoice(amount, network, module, tx_direction)
            .await
    }
}

type ModuleTXDirectionLockMap = BTreeMap<(ModuleKind, RpcTransactionDirection), Arc<Mutex<()>>>;

#[derive(Clone)]
pub struct FediFeeRemittanceService {
    // held while remit the fees
    locks_map: Arc<Mutex<ModuleTXDirectionLockMap>>,
}

impl FediFeeRemittanceService {
    /// On initialization, spawn a background task that attempts all remittances
    /// one by one.
    pub fn init(fed: &FederationV2) -> Self {
        let service = Self {
            locks_map: Default::default(),
        };

        let fed2 = fed.clone();
        let service2 = service.clone();
        fed.task_group
            .spawn_cancellable("init_fee_remittance_service", async move {
                let tx_types = fed2
                    .dbtx()
                    .await
                    .find_by_prefix(&OutstandingFediFeesPerTXTypeKeyPrefix)
                    .await
                    .map(|(key, _)| (key.0, key.1))
                    .collect::<Vec<_>>()
                    .await;

                for (module, tx_direction) in tx_types {
                    service2
                        .remit_fedi_fee_if_threshold_met(&fed2, module, tx_direction)
                        .await;
                }
            });

        service
    }
    /// Checks whether the accrued outstanding fedi fees has surpassed the
    /// remittance threshold. If yes, queries the fee helper to obtain a
    /// lightning invoice to remit the fees. If the fees HAS surpassed
    /// the threshold, and spawns a task in background to remit fees.
    #[instrument(skip(self, fed))]
    pub async fn remit_fedi_fee_if_threshold_met(
        &self,
        fed: &FederationV2,
        module: ModuleKind,
        tx_direction: RpcTransactionDirection,
    ) {
        // remit task is already running
        let Ok(guard) = self
            .locks_map
            .lock()
            .await
            .entry((module.clone(), tx_direction.clone()))
            .or_default()
            .clone()
            .try_lock_owned()
        else {
            info!("Fedi fee remittance already running");
            return;
        };
        let outstanding_fees = fed
            .dbtx()
            .await
            .into_nc()
            .get_value(&OutstandingFediFeesPerTXTypeKey(
                module.clone(),
                tx_direction.clone(),
            ))
            .await
            .unwrap_or(Amount::ZERO);
        let remittance_threshold = fed.fedi_fee_schedule().await.remittance_threshold_msat;
        if outstanding_fees.msats < remittance_threshold {
            info!("Fedi fee remittance not initiated, accrued fee doesn't exceed threshold");
            return;
        }
        let fed2 = fed.clone();
        fed.task_group
            .spawn_cancellable("remit_fedi_fee", async move {
                let _ = Self::remit_fedi_fee(guard, &fed2, outstanding_fees, module, tx_direction)
                    .await;
            });
    }

    #[instrument(skip(guard, fed), fields(federation_id = %fed.federation_id()) , err, ret)]
    #[cfg_attr(target_family = "wasm", async_recursion(?Send))]
    #[cfg_attr(not(target_family = "wasm"), async_recursion)]
    async fn remit_fedi_fee(
        guard: OwnedMutexGuard<()>,
        fed: &FederationV2,
        outstanding_fees: Amount,
        module: ModuleKind,
        tx_direction: RpcTransactionDirection,
    ) -> anyhow::Result<()> {
        info!("fedi fee threshold exceeded, remitting");
        let gateway = fed.select_gateway().await?;
        let gateway_fees = gateway
            .as_ref()
            .map(|g| g.fees)
            .unwrap_or(zero_gateway_fees());

        // We want to ensure that any gateway fees is debited from the accrued
        // outstanding fees. This means that the invoice amount for remitting fees will
        // actually be less than the accrued outstanding fees.

        // Let's say that the accrued oustanding fees is Q and the desired invoice
        // amount is X. Gateway fees is made up of two components, (base) and (ppm).
        // Therefore, the following equation must be satisfied:
        // X + (gateway fees) = Q
        //
        // Expanding (gateway fees), we get:
        // X + (base) + [(X/M)(ppm)] = Q, where M is the constant for MILLION
        //
        // Solving for X, we get:
        // X[1 + (ppm)/M] = Q - base
        //
        // Finally:
        // X = [(M)(Q - base)]/(M + ppm)
        //
        // We keep division as the very last step to ensure minimal loss in precision.
        // We also perform regular (floor) division to ensure that the invoice is never
        // overestimated.
        let invoice_amt_numerator =
            MILLION * (outstanding_fees.msats - gateway_fees.base_msat as u64);
        let invoice_amt_denominator = MILLION + gateway_fees.proportional_millionths as u64;
        let invoice_amt = invoice_amt_numerator / invoice_amt_denominator;

        let invoice = fed
            .fedi_fee_helper
            .fetch_fedi_fee_invoice(
                Amount::from_msats(invoice_amt),
                fed.get_network().ok_or(anyhow!(
                    "Federation recovering during fee remittance, unexpected!"
                ))?,
                module.clone(),
                tx_direction.clone(),
            )
            .await?;

        // If pay_bolt11_invoice() returns successfully, we optimistically zero out
        // oustanding fedi fees. This is ok since as part of pay_bolt11_invoice(), the
        // ecash to pay the invoice would have already been deducted from the "real"
        // balance and therefore the "virtual" balance should remain unaffected even if
        // we zero out the accrued oustanding fees at this point. Note that it is still
        // possible for the lightning payment to fail for a variety of reasons but we
        // will address such edge cases and race conditions later. For now, losing fee
        // sometimes is a much better outcome than double-charging fees.
        let extra_meta = LightningSendMetadata {
            is_fedi_fee_remittance: true,
        };
        let ln = fed.client.get_first_module::<LightningClientModule>();
        let OutgoingLightningPayment { payment_type, .. } = ln
            .pay_bolt11_invoice(gateway, invoice.to_owned(), extra_meta.clone())
            .await?;
        fed.client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let outstanding_key =
                            OutstandingFediFeesPerTXTypeKey(module.clone(), tx_direction.clone());
                        async move {
                            let current_outstanding_fees = dbtx
                                .get_value(&outstanding_key)
                                .await
                                .unwrap_or(Amount::ZERO);
                            let new_outstanding_fees =
                                current_outstanding_fees.saturating_sub(outstanding_fees);
                            dbtx.insert_entry(&outstanding_key, &new_outstanding_fees)
                                .await;
                            Ok::<(), anyhow::Error>(())
                        }
                    })
                },
                Some(100),
            )
            .await
            .map_err(|e| match e {
                fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => last_error,
                fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
            })?;

        let mutex = OwnedMutexGuard::mutex(&guard).clone();
        drop(guard);
        // If payment fails, un-zero the oustanding fee before returning the error.
        if let Err(e) = fed
            .subscribe_to_ln_pay(payment_type, extra_meta, invoice.clone())
            .await
        {
            let _guard = mutex.lock().await;
            fed.client
                .db()
                .autocommit(
                    |dbtx, _| {
                        Box::pin({
                            let outstanding_key = OutstandingFediFeesPerTXTypeKey(
                                module.clone(),
                                tx_direction.clone(),
                            );
                            async move {
                                let current_outstanding_fees = dbtx
                                    .get_value(&outstanding_key)
                                    .await
                                    .unwrap_or(Amount::ZERO);
                                let new_outstanding_fees =
                                    current_outstanding_fees + outstanding_fees;
                                dbtx.insert_entry(&outstanding_key, &new_outstanding_fees)
                                    .await;
                                Ok::<(), anyhow::Error>(())
                            }
                        })
                    },
                    Some(100),
                )
                .await
                .map_err(|e| match e {
                    fedimint_core::db::AutocommitError::CommitFailed { last_error, .. } => {
                        last_error
                    }
                    fedimint_core::db::AutocommitError::ClosureError { error, .. } => error,
                })?;
            return Err(e);
        }

        Ok(())
    }
}
