use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

use anyhow::{anyhow, bail};
use async_recursion::async_recursion;
use bitcoin::Network;
use bitcoin::hex::DisplayHex;
use fedimint_core::Amount;
use fedimint_core::config::FederationId;
use fedimint_core::core::ModuleKind;
use fedimint_core::db::IDatabaseTransactionOpsCoreTyped;
use fedimint_ln_client::OutgoingLightningPayment;
use futures::StreamExt;
use lightning_invoice::Bolt11Invoice;
use rpc_types::{LightningSendMetadata, RpcTransactionDirection};
use runtime::api::TransactionDirection;
use runtime::bridge_runtime::Runtime;
use runtime::constants::{
    FEDI_FEE_REMITTANCE_MAX_DELAY, FEDI_GIFT_CHILD_ID, FEDI_GIFT_EXCLUDED_COMMUNITIES, MILLION,
};
use runtime::storage::state::{
    FediFeeSchedule, FirstCommunityInviteCodeState, ModuleFediFeeSchedule,
};
use stability_pool_client::common::AccountId;
use tokio::sync::{Mutex, OwnedMutexGuard};
use tracing::{error, info, instrument, warn};

use crate::federation_v2::client::ClientExt;
use crate::federation_v2::db::{
    FediFeesRemittanceTimestampPerTXTypeKey, OutstandingFediFeesPerTXTypeKey,
    OutstandingFediFeesPerTXTypeKeyPrefix,
};
use crate::federation_v2::{FederationV2, zero_gateway_fees};

/// Helper struct to encapsulate all state and logic related to Fedi fee. This
/// struct can be consumed by both the bridge and each individual federation
/// instance. That way we have a single source of truth.
pub struct FediFeeHelper {
    runtime: Arc<Runtime>,
}

#[derive(Debug, thiserror::Error)]
pub enum FediFeeHelperError {
    #[error("Provided federation ID {0} is not registered")]
    UnknownFederation(String),
    #[error("Provided module {0} is not known")]
    UnknownModule(ModuleKind),
}

impl FediFeeHelper {
    pub fn new(runtime: Arc<Runtime>) -> Self {
        Self { runtime }
    }

    /// In a separate task, queries Fedi api to fetch the fee schedule and
    /// updates the AppState
    pub async fn fetch_and_update_fedi_fee_schedule(
        &self,
        fed_network_map: HashMap<String, Network>,
    ) {
        let runtime = self.runtime.clone();
        self.runtime.task_group.spawn_cancellable(
            "fetch and update fedi fee schedule",
            async move {
                // Fetch fee schedule from Fedi API. Presently the endpoint is different per
                // network (mainnet, mutinynet etc.). So we iterate through the mapping of
                // federation => network and collect a set-union of all the networks. Then we
                // make an API call for each network we need, and finally we update each
                // federation's FederationInfo within AppState with the correct fee schedule.
                let networks = fed_network_map.values().cloned().collect::<HashSet<_>>();
                let api_calls = networks.iter().map(|&network| {
                    let runtime = &runtime;
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
                let app_state_update_res = runtime
                    .app_state
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
            },
        );
    }

    /// For the given federation ID returns the full Fedi fee schedule. If the
    /// federation ID is unknown, returns an error.
    pub async fn get_federation_schedule(
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

    /// Returns the fedi fee to be charged in ppm. If either the federation ID
    /// or the module is unknown, returns an error.
    pub async fn get_fedi_fee_ppm(
        &self,
        federation_id_str: String,
        module: ModuleKind,
        direction: RpcTransactionDirection,
    ) -> anyhow::Result<u64, FediFeeHelperError> {
        self.runtime
            .app_state
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
        federation_id: FederationId,
        spv2_account_id: Option<AccountId>,
    ) -> anyhow::Result<Bolt11Invoice> {
        let stable_user_id = self
            .runtime
            .app_state
            .root_secret()
            .await
            .child_key(FEDI_GIFT_CHILD_ID)
            .to_random_bytes::<32>()
            .to_lower_hex_string();
        let (first_comm_invite_code, all_comm_invite_codes) = self
            .runtime
            .app_state
            .with_read_lock(|state| {
                (
                    match &state.first_comm_invite_code {
                        FirstCommunityInviteCodeState::Set(invite_code) => {
                            Some(invite_code.clone())
                        }
                        FirstCommunityInviteCodeState::NeverSet
                        | FirstCommunityInviteCodeState::Unset => None,
                    },
                    state.joined_communities.keys().cloned().collect::<Vec<_>>(),
                )
            })
            .await;
        let other_comm_invite_codes = all_comm_invite_codes
            .into_iter()
            .filter(|code| {
                // Exclude "first community" if present, and the default fedi community
                if first_comm_invite_code
                    .as_ref()
                    .is_some_and(|first| first == code)
                {
                    return false;
                }

                if FEDI_GIFT_EXCLUDED_COMMUNITIES.contains(&code.as_str()) {
                    return false;
                }

                true
            })
            .collect();
        self.runtime
            .fedi_api
            .fetch_fedi_fee_invoice(
                amount,
                network,
                module,
                match tx_direction {
                    RpcTransactionDirection::Receive => TransactionDirection::Receive,
                    RpcTransactionDirection::Send => TransactionDirection::Send,
                },
                stable_user_id,
                spv2_account_id,
                federation_id,
                first_comm_invite_code,
                other_comm_invite_codes,
            )
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

        let service2 = service.clone();
        fed.spawn_cancellable("init_fee_remittance_service", move |fed| async move {
            let tx_types = fed
                .dbtx()
                .await
                .find_by_prefix(&OutstandingFediFeesPerTXTypeKeyPrefix)
                .await
                .map(|(key, _)| (key.0, key.1))
                .collect::<Vec<_>>()
                .await;

            for (module, tx_direction) in tx_types {
                service2
                    .remit_fedi_fee_if_threshold_met(&fed, module, tx_direction)
                    .await;
            }
        });

        service
    }
    /// Checks whether the accrued outstanding fedi fees has surpassed the
    /// remittance threshold, or if enough time has passed since the last
    /// successful remittance. If yes, queries the fee helper to obtain a
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
        // If last_remittance_timestamp has never been set, we don't force set it. We
        // simply let the next organic threshold-based remittance set it.
        let last_remittance_timestamp = fed
            .dbtx()
            .await
            .into_nc()
            .get_value(&FediFeesRemittanceTimestampPerTXTypeKey(
                module.clone(),
                tx_direction.clone(),
            ))
            .await;
        let remittance_threshold = fed.fedi_fee_schedule().await.remittance_threshold_msat;
        let should_remit = match (
            outstanding_fees.msats.cmp(&remittance_threshold),
            last_remittance_timestamp,
        ) {
            (Ordering::Equal, _) | (Ordering::Greater, _) => true,
            (Ordering::Less, Some(last_timestamp))
                if fedimint_core::time::now()
                    .duration_since(last_timestamp)
                    .unwrap_or_default()
                    > FEDI_FEE_REMITTANCE_MAX_DELAY =>
            {
                true
            }
            _ => false,
        };
        if !should_remit {
            info!("Fedi fee remittance not initiated, threshold not met AND max delay not hit");
            return;
        }
        fed.spawn_cancellable("remit_fedi_fee", move |fed2| async move {
            let _ =
                Self::remit_fedi_fee(guard, &fed2, outstanding_fees, module, tx_direction).await;
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
                fed.federation_id(),
                fed.client.spv2().ok().map(|spv2| {
                    spv2.our_account(stability_pool_client::common::AccountType::Seeker)
                        .id()
                }),
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
            frontend_metadata: None,
        };
        let ln = fed.client.ln()?;
        let OutgoingLightningPayment { payment_type, .. } = ln
            .pay_bolt11_invoice(gateway, invoice.to_owned(), extra_meta.clone())
            .await?;

        // We are going to optimistically update the remittance timestamp in the
        // autocommit block below, so we record the current value in case we need to
        // roll it back.
        let timestamp_key =
            FediFeesRemittanceTimestampPerTXTypeKey(module.clone(), tx_direction.clone());
        let old_timestamp = fed.dbtx().await.into_nc().get_value(&timestamp_key).await;
        fed.client
            .db()
            .autocommit(
                |dbtx, _| {
                    Box::pin({
                        let outstanding_key =
                            OutstandingFediFeesPerTXTypeKey(module.clone(), tx_direction.clone());
                        let timestamp_key = FediFeesRemittanceTimestampPerTXTypeKey(
                            module.clone(),
                            tx_direction.clone(),
                        );
                        async move {
                            let current_outstanding_fees = dbtx
                                .get_value(&outstanding_key)
                                .await
                                .unwrap_or(Amount::ZERO);
                            let new_outstanding_fees =
                                current_outstanding_fees.saturating_sub(outstanding_fees);
                            dbtx.insert_entry(&outstanding_key, &new_outstanding_fees)
                                .await;
                            dbtx.insert_entry(&timestamp_key, &fedimint_core::time::now())
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
        // Also roll back remittance timestamp update.
        if let Err(e) = fed.subscribe_to_ln_pay(payment_type, extra_meta).await {
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
                            let timestamp_key = FediFeesRemittanceTimestampPerTXTypeKey(
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
                                if let Some(timestamp) = old_timestamp {
                                    dbtx.insert_entry(&timestamp_key, &timestamp).await;
                                } else {
                                    dbtx.remove_entry(&timestamp_key).await;
                                }
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
