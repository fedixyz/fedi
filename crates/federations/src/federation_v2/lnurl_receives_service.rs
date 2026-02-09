use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::bail;
use fedimint_client::OperationId;
use fedimint_ln_client::LnReceiveState;
use futures::StreamExt;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

use super::FederationV2;
use super::client::ClientExt;

pub struct LnurlReceivesService {}

impl LnurlReceivesService {
    pub fn new(fed: &FederationV2) -> Self {
        fed.spawn_cancellable("lnurl_receives_service", |fed| async move {
            let Ok(ln) = fed.client.ln() else {
                return;
            };

            // In-memory set of LNURL recurring receives that have currently been actively
            // subscribed to. Used to ensure that we don't subscribe to the same receive
            // multiple times.
            let lnurl_subbed_op_ids: Arc<Mutex<HashSet<OperationId>>> = Default::default();
            loop {
                // Sleep in the beginning so that gateway service, meta service, etc. (other
                // services) have time to initialize
                fedimint_core::task::sleep(Duration::from_secs(30)).await;

                // Only proceed if lnurl has already been generated
                let Some(recurringd_api) = fed.get_recurringd_api().await else {
                    continue;
                };
                let recurring_payment_codes = ln.list_recurring_payment_codes().await;
                let Some((index, _)) = recurring_payment_codes
                    .into_iter()
                    .find(|(_, code)| code.recurringd_api == recurringd_api)
                else {
                    continue;
                };

                // Only proceed if we find any invoices
                let Some(invoices) = ln.list_recurring_payment_code_invoices(index).await else {
                    continue;
                };

                'inner: for (_, operation_id) in invoices {
                    let Some(operation) =
                        fed.client.operation_log().get_operation(operation_id).await
                    else {
                        error!(
                            ?operation_id,
                            "Unexpected missing recurringd receive operation"
                        );
                        continue 'inner;
                    };

                    // Ignore operations that already have outcomes
                    if operation.outcome::<serde_json::Value>().is_some() {
                        continue 'inner;
                    }

                    // Ignore operations that already have ongoing subscriptions
                    let lnurl_subbed_op_ids = lnurl_subbed_op_ids.clone();
                    {
                        let mut subbed_op_ids = lnurl_subbed_op_ids.lock().await;
                        if subbed_op_ids.contains(&operation_id) {
                            continue 'inner;
                        }

                        subbed_op_ids.insert(operation_id);
                    }

                    fed.spawn_cancellable(
                        format!(
                            "subscribe_to_recurring_payment_receive_{}",
                            operation_id.fmt_short()
                        ),
                        move |fed| async move {
                            if let Err(e) =
                                subscribe_recurring_payment_receive(fed, operation_id).await
                            {
                                warn!("subscribe_to_ln_receive error: {e:?}")
                            }
                            lnurl_subbed_op_ids.lock().await.remove(&operation_id);
                        },
                    );
                }
            }
        });
        Self {}
    }
}

async fn subscribe_recurring_payment_receive(
    fed: Arc<FederationV2>,
    operation_id: OperationId,
) -> anyhow::Result<()> {
    let Ok(ln) = fed.client.ln() else {
        bail!("Lightning module not found!");
    };
    let Ok(updates) = ln.subscribe_ln_recurring_receive(operation_id).await else {
        bail!("Lightning operation with ID {:?} not found!", operation_id);
    };
    let mut updates = updates.into_stream();
    while let Some(update) = updates.next().await {
        info!("Update: {:?}", update);
        fed.update_operation_state(operation_id, update.clone())
            .await;
        match update {
            LnReceiveState::Claimed => {
                fed.send_transaction_event(operation_id).await;
            }
            LnReceiveState::Canceled { .. } => {
                fed.send_transaction_event(operation_id).await;
            }
            _ => {}
        }
    }
    Ok(())
}
