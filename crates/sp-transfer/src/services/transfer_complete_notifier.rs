use std::sync::Arc;

use anyhow::Context as _;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::util::backoff_util::background_backoff;
use fedimint_core::util::retry;
use futures::StreamExt as _;
use rpc_types::sp_transfer::{RpcSpTransferEvent, SpMatrixTransferId};
use runtime::bridge_runtime::Runtime;
use tokio::sync::Notify;
use tracing::instrument;

use crate::db::{SptPendingCompletionNotification, SptPendingCompletionNotificationPrefix};
use crate::sp_transfers_matrix::SpTransfersMatrix;

pub struct SptTransferCompleteNotifier {
    notify: Notify,
    runtime: Arc<Runtime>,
}

impl SptTransferCompleteNotifier {
    pub fn new(runtime: Arc<Runtime>) -> Self {
        Self {
            notify: Notify::new(),
            runtime,
        }
    }

    fn trigger(&self) {
        self.notify.notify_one();
    }

    pub async fn add_completion_notification(
        &self,
        transfer_id: SpMatrixTransferId,
        federation_id: String,
        fiat_amount_cents: u64,
        txid: fedimint_core::TransactionId,
    ) {
        let spt_db = self.runtime.sp_transfers_db();
        let mut dbtx = spt_db.begin_transaction().await;
        dbtx.insert_entry(
            &SptPendingCompletionNotification::Success {
                transfer_id,
                federation_id: rpc_types::RpcFederationId(federation_id),
                fiat_amount: rpc_types::RpcFiatAmount(fiat_amount_cents),
                txid: rpc_types::RpcTransactionId(txid),
            },
            &(),
        )
        .await;
        dbtx.commit_tx().await;
        self.trigger();
    }

    pub async fn add_failed_notification(&self, transfer_id: SpMatrixTransferId) {
        let spt_db = self.runtime.sp_transfers_db();
        let mut dbtx = spt_db.begin_transaction().await;
        dbtx.insert_entry(
            &SptPendingCompletionNotification::Failed { transfer_id },
            &(),
        )
        .await;
        dbtx.commit_tx().await;
        self.trigger();
    }

    pub async fn run_continuously(&self, sp_transfers_matrix: &SpTransfersMatrix) {
        loop {
            retry(
                "send sp_transfers queued notifications",
                background_backoff(),
                || async { self.run_once(sp_transfers_matrix).await },
            )
            .await
            .expect("never fail");
            self.notify.notified().await;
        }
    }

    async fn run_once(&self, sp_transfers_matrix: &SpTransfersMatrix) -> anyhow::Result<()> {
        let spt_db = self.runtime.sp_transfers_db();
        let mut dbtx = spt_db.begin_transaction().await;
        let mut did_fail = false;
        let pending = dbtx
            .find_by_prefix(&SptPendingCompletionNotificationPrefix)
            .await
            .map(|(k, _)| k)
            .collect::<Vec<_>>()
            .await;
        for item in pending {
            if self
                .process_notification_item(&mut dbtx.to_ref_nc(), item, sp_transfers_matrix)
                .await
                .is_err()
            {
                did_fail = true;
            }
        }
        dbtx.commit_tx().await;
        if did_fail {
            anyhow::bail!("something failed, retrying")
        }
        Ok(())
    }

    #[instrument(skip_all)]
    async fn process_notification_item(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        item: SptPendingCompletionNotification,
        sp_transfers_matrix: &SpTransfersMatrix,
    ) -> anyhow::Result<()> {
        let (room_id, event) = match &item {
            SptPendingCompletionNotification::Success {
                transfer_id, txid, ..
            } => (
                transfer_id.room_id.clone(),
                RpcSpTransferEvent::TransferSentHint {
                    pending_transfer_id: transfer_id.event_id.clone(),
                    transaction_id: *txid,
                },
            ),
            SptPendingCompletionNotification::Failed { transfer_id } => (
                transfer_id.room_id.clone(),
                RpcSpTransferEvent::TransferFailed {
                    pending_transfer_id: transfer_id.event_id.clone(),
                },
            ),
        };
        let room_id = room_id
            .into_typed()
            .context("invalid room id in sp_transfers database")?;
        sp_transfers_matrix
            .send_spt_event(&room_id, event)
            .await
            .context("failed to send sp_transfers event")?;
        dbtx.remove_entry(&item).await;
        Ok(())
    }
}
