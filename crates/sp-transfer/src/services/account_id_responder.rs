use std::sync::Arc;

use anyhow::Context as _;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::util::backoff_util::background_backoff;
use fedimint_core::util::retry;
use futures::StreamExt as _;
use rpc_types::matrix::room_is_joined;
use rpc_types::sp_transfer::{RpcAccountId, RpcSpTransferEvent, SpMatrixTransferId};
use runtime::bridge_runtime::Runtime;
use tokio::sync::Notify;
use tracing::instrument;

use crate::db::{
    PendingReceiverAccountIdEventKey, PendingReceiverAccountIdEventKeyPrefix, SpTransferStatus,
    TransferEventKey, resolve_status_db,
};
use crate::services::SptFederationProvider;
use crate::sp_transfers_matrix::SpTransfersMatrix;

pub struct SptAccountIdResponder {
    runtime: Arc<Runtime>,
    provider: Arc<dyn SptFederationProvider>,
    notify: Notify,
}

impl SptAccountIdResponder {
    pub fn new(runtime: Arc<Runtime>, provider: Arc<dyn SptFederationProvider>) -> Self {
        Self {
            runtime,
            provider,
            notify: Notify::new(),
        }
    }

    /// Trigger sending AnnounceAccount for eligible transfers.
    pub fn trigger(&self) {
        self.notify.notify_one();
    }

    pub async fn run_continuously(&self, sp_transfers_matrix: &SpTransfersMatrix) {
        loop {
            retry(
                "send sp_transfers account announcements",
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
        let items = dbtx
            .find_by_prefix(&PendingReceiverAccountIdEventKeyPrefix)
            .await
            .collect::<Vec<_>>()
            .await;
        for (PendingReceiverAccountIdEventKey(transfer_id), _) in items {
            if self
                .process_pending_item(&mut dbtx.to_ref_nc(), &transfer_id, sp_transfers_matrix)
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

    #[instrument(skip_all, fields(pending_transfer_id = %transfer_id.event_id.0), err)]
    async fn process_pending_item(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        transfer_id: &SpMatrixTransferId,
        sp_transfers_matrix: &SpTransfersMatrix,
    ) -> anyhow::Result<()> {
        let transfer = dbtx
            .get_value(&TransferEventKey(transfer_id.clone()))
            .await
            .context("pending without transfer details, db corrupt")?;

        // already done
        if resolve_status_db(dbtx, transfer_id, &transfer, &self.runtime).await
            != SpTransferStatus::Pending
        {
            dbtx.remove_entry(&PendingReceiverAccountIdEventKey(transfer_id.clone()))
                .await;
            return Ok(());
        }

        let Some(account_id) = self
            .provider
            .our_seeker_account_id(&transfer.federation_id.0.clone())
            .await
        else {
            return Ok(());
        };
        let room_id = transfer_id.room_id.clone().into_typed()?;
        if !room_is_joined(&sp_transfers_matrix.client, &room_id) {
            // matrixRoomJoin rpc will trigger us again
            return Ok(());
        }
        sp_transfers_matrix
            .send_spt_event(
                &room_id,
                RpcSpTransferEvent::AnnounceAccount {
                    account_id: RpcAccountId(account_id.to_string()),
                    federation_id: transfer.federation_id.clone(),
                },
            )
            .await?;
        dbtx.remove_entry(&PendingReceiverAccountIdEventKey(transfer_id.clone()))
            .await;
        Ok(())
    }
}
