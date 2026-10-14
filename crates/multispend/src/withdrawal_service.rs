use std::collections::BTreeSet;
use std::sync::Mutex;

use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::util::backoff_util::background_backoff;
use fedimint_core::util::retry;
use futures::StreamExt as _;
use rpc_types::{RpcFederationId, SPv2TransferMetadata};
use runtime::utils::PoisonedLockExt as _;
use stability_pool_client::common::AccountId;
use tokio::sync::Notify;

use super::FederationProvider;
use super::db::MultispendPendingApprovedWithdrawalRequestKeyPrefix;

#[derive(Default)]
pub struct WithdrawalService {
    notify: Notify,
    /// Recipients of completed bitcoin withdrawals, not yet passed on.
    btc_payouts: Mutex<BTreeSet<(String, AccountId)>>,
}

impl WithdrawalService {
    pub fn check_pending_approved_withdrawal_requests(&self) {
        self.notify.notify_one();
    }

    pub fn btc_payouts_received(&self, payouts: Vec<(RpcFederationId, AccountId)>) {
        self.btc_payouts.ensure_lock().extend(
            payouts
                .into_iter()
                .map(|(federation_id, to)| (federation_id.0, to)),
        );
        self.notify.notify_one();
    }

    pub async fn run(&self, multispend_db: &Database, federations: &dyn FederationProvider) {
        loop {
            for (federation_id, to) in std::mem::take(&mut *self.btc_payouts.ensure_lock()) {
                federations.multispend_btc_payout_received(&federation_id, &to);
            }
            // a request whose federation is still loading at startup must not
            // wait for the next approval to be submitted
            retry(
                "submit approved withdrawal requests",
                background_backoff(),
                || self.run_once(multispend_db, federations),
            )
            .await
            .expect("never fails");
            // wait for notification
            self.notify.notified().await;
        }
    }

    /// Submit every queued request this device is paid by and drop the
    /// others. A request leaves the queue once handled, so a retry after a
    /// failed one submits no request twice.
    pub(crate) async fn run_once(
        &self,
        multispend_db: &Database,
        federations: &dyn FederationProvider,
    ) -> anyhow::Result<()> {
        let approved_requests = multispend_db
            .begin_transaction_nc()
            .await
            .find_by_prefix(&MultispendPendingApprovedWithdrawalRequestKeyPrefix)
            .await
            .map(|(k, _)| k)
            .collect::<Vec<_>>()
            .await;
        let mut result = Ok(());
        for request in approved_requests {
            // every device of the requester queues the request, and only the
            // device it pays submits it; a second submission would be refused
            // and could report the paid withdrawal as rejected
            let handled = async {
                if federations.is_own_withdrawal_destination(
                    &request.federation_id.0,
                    request.transfer_request.to(),
                )? {
                    federations
                        .spv2_transfer(
                            &request.federation_id.0,
                            request.transfer_request.clone(),
                            SPv2TransferMetadata::MultispendWithdrawal {
                                room: request.room_id.clone(),
                                request_id: request.request_event_id.clone(),
                            },
                        )
                        .await?;
                }
                anyhow::Ok(())
            }
            .await;
            if let Err(err) = handled {
                result = Err(err);
                continue;
            }
            let mut dbtx = multispend_db.begin_transaction().await;
            dbtx.remove_entry(&request).await;
            dbtx.commit_tx().await;
        }
        result
    }
}
