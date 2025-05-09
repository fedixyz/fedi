use anyhow::Context as _;
use fedimint_core::db::{Database, IDatabaseTransactionOpsCoreTyped};
use futures::StreamExt as _;
use rpc_types::SPv2TransferMetadata;
use tokio::sync::Notify;
use tracing::warn;

use crate::federation::Federations;
use crate::matrix::multispend::db::MultispendPendingApprovedWithdrawalRequestKeyPrefix;

#[derive(Default)]
pub struct WithdrawalService {
    notify: Notify,
}

impl WithdrawalService {
    pub fn check_pending_approved_withdrawal_requests(&self) {
        self.notify.notify_one();
    }

    pub async fn run_continuously(&self, multispend_db: &Database, federations: &Federations) {
        loop {
            if let Err(err) = self.run_once(multispend_db, federations).await {
                warn!(?err, "Withdrawal service processing failed");
            }
            // wait for notification
            self.notify.notified().await;
        }
    }

    async fn run_once(
        &self,
        multispend_db: &Database,
        federations: &Federations,
    ) -> anyhow::Result<()> {
        let mut dbtx = multispend_db.begin_transaction().await;
        let approved_requests = dbtx
            .find_by_prefix(&MultispendPendingApprovedWithdrawalRequestKeyPrefix)
            .await
            .map(|(k, _)| k)
            .collect::<Vec<_>>()
            .await;
        for request in approved_requests {
            dbtx.remove_entry(&request).await;
            let fed = federations
                .get_federation(&request.federation_id.0)
                .context("federation left")?;
            fed.spv2_transfer(
                request.transfer_request,
                SPv2TransferMetadata::MultispendWithdrawal {
                    room: request.room_id,
                    request_id: request.request_event_id,
                },
            )
            .await?;
        }
        dbtx.commit_tx().await;
        Ok(())
    }
}
