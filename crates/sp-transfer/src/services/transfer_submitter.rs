use std::sync::Arc;

use anyhow::Context as _;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use futures::StreamExt as _;
use rpc_types::sp_transfer::RpcSpTransferStatus;
use rpc_types::{RpcEventId, SPv2TransferMetadata};
use runtime::bridge_runtime::Runtime;
use stability_pool_client::common::FiatAmount;
use tokio::sync::Notify;
use tracing::instrument;

use crate::db::{
    KnownReceiverAccountIdKey, SenderAwaitingAccountAnnounceEventKey,
    SenderAwaitingAccountAnnounceEventKeyPrefix, TransferEventKey, resolve_status_db,
};
use crate::services::SptFederationProvider;

pub struct SptTransferSubmitter {
    runtime: Arc<Runtime>,
    provider: Arc<dyn SptFederationProvider>,
    notify: Notify,
}

impl SptTransferSubmitter {
    pub fn new(runtime: Arc<Runtime>, provider: Arc<dyn SptFederationProvider>) -> Self {
        Self {
            runtime,
            provider,
            notify: Notify::new(),
        }
    }

    /// Trigger processing of any pending transfers where the receiver account
    /// is known.
    pub fn trigger(&self) {
        self.notify.notify_one();
    }

    pub async fn run_continuously(&self) {
        loop {
            let _ = self.run_once().await;
            self.notify.notified().await;
        }
    }

    async fn run_once(&self) -> anyhow::Result<()> {
        let spt_db = self.runtime.sp_transfers_db();
        let mut dbtx = spt_db.begin_transaction().await;
        let items = dbtx
            .find_by_prefix(&SenderAwaitingAccountAnnounceEventKeyPrefix)
            .await
            .collect::<Vec<_>>()
            .await;
        for (
            SenderAwaitingAccountAnnounceEventKey {
                pending_transfer_id,
            },
            _,
        ) in items
        {
            self.process_pending_transfer(&mut dbtx.to_ref_nc(), pending_transfer_id)
                .await
                .ok();
        }
        dbtx.commit_tx().await;
        Ok(())
    }

    #[instrument(skip_all, fields(pending_transfer_id = %pending_transfer_id.0), err)]
    async fn process_pending_transfer(
        &self,
        dbtx: &mut DatabaseTransaction<'_>,
        pending_transfer_id: RpcEventId,
    ) -> anyhow::Result<()> {
        let transfer = dbtx
            .get_value(&TransferEventKey {
                pending_transfer_id: pending_transfer_id.clone(),
            })
            .await
            .context("pending without transfer details")?;

        // already done
        // only possible on
        // - a recovering device (we are reprocessing already complete transfer)
        // - duplicate calls to event handler - which is possible
        if resolve_status_db(dbtx, &pending_transfer_id, &transfer).await
            != RpcSpTransferStatus::Pending
        {
            dbtx.remove_entry(&SenderAwaitingAccountAnnounceEventKey {
                pending_transfer_id: pending_transfer_id.clone(),
            })
            .await;
            return Ok(());
        }

        // Check if we know receiver's account id; if not, skip
        let Some(account_id) = dbtx
            .get_value(&KnownReceiverAccountIdKey {
                room_id: transfer.room_id.clone().clone(),
                federation_id: transfer.federation_id.clone(),
            })
            .await
        else {
            return Ok(());
        };

        // Submit transfer with SP Transfers metadata so that on acceptance we enqueue
        // completion
        self.provider
            .spv2_transfer_with_nonce(
                &transfer.federation_id.0,
                transfer.nonce,
                account_id,
                FiatAmount(transfer.amount.0),
                SPv2TransferMetadata::MatrixSpTransfer {
                    room: transfer.room_id.clone().clone(),
                    pending_transfer_id: pending_transfer_id.clone(),
                },
            )
            .await
            .context("failed to submit SPv2 transfer")?;

        dbtx.remove_entry(&SenderAwaitingAccountAnnounceEventKey {
            pending_transfer_id: pending_transfer_id.clone(),
        })
        .await;

        Ok(())
    }
}
