use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::util::backoff_util::background_backoff;
use fedimint_core::util::retry;
use futures::StreamExt as _;
use rpc_types::SPv2TransferMetadata;
use tokio::sync::Notify;

use super::FederationProvider;
use super::db::MultispendPendingApprovedWithdrawalRequestKeyPrefix;

#[derive(Default)]
pub struct WithdrawalService {
    notify: Notify,
}

impl WithdrawalService {
    pub fn check_pending_approved_withdrawal_requests(&self) {
        self.notify.notify_one();
    }

    pub async fn run(&self, multispend_db: &Database, federations: &dyn FederationProvider) {
        loop {
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

    /// Submit every queued request. A request leaves the queue once
    /// submitted, so a retry after a failed one submits no request twice.
    async fn run_once(
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
            if let Err(err) = federations
                .spv2_transfer(
                    &request.federation_id.0,
                    request.transfer_request.clone(),
                    SPv2TransferMetadata::MultispendWithdrawal {
                        room: request.room_id.clone(),
                        request_id: request.request_event_id.clone(),
                    },
                )
                .await
            {
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
