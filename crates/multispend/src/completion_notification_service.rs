use std::sync::Arc;

use fedimint_core::db::IDatabaseTransactionOpsCoreTyped as _;
use fedimint_core::util::backoff_util::background_backoff;
use fedimint_core::util::retry;
use fedimint_core::TransactionId;
use futures::StreamExt as _;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{RpcEventId, RpcFiatAmount, RpcTransactionId};
use runtime::bridge_runtime::Runtime;
use stability_pool_client::common::FiatAmount;
use tokio::sync::Notify;
use tracing::error;

use super::db::{
    MultispendPendingCompletionNotification, MultispendPendingCompletionNotificationPrefix,
};
use super::multispend_matrix::MultispendMatrix;

// This service maintains a list of pending multispend notifications and sends
// them into the room.
//
// This list will be small in practice (<5).
pub struct CompletionNotificationService {
    notify: Notify,
    runtime: Arc<Runtime>,
}

impl CompletionNotificationService {
    pub fn new(runtime: Arc<Runtime>) -> Self {
        Self {
            notify: Notify::new(),
            runtime,
        }
    }

    fn trigger(&self) {
        self.notify.notify_one();
    }

    pub async fn add_withdrawal_notification(
        &self,
        room_id: RpcRoomId,
        request_id: RpcEventId,
        fiat_amount: FiatAmount,
        txid: TransactionId,
    ) {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction().await;
        dbtx.insert_entry(
            &MultispendPendingCompletionNotification::Withdrawal {
                room_id,
                request_id,
                fiat_amount: RpcFiatAmount(fiat_amount.0),
                txid: RpcTransactionId(txid),
            },
            &(),
        )
        .await;
        dbtx.commit_tx().await;
        self.trigger();
    }

    pub async fn add_failed_withdrawal_notification(
        &self,
        room_id: RpcRoomId,
        request_id: RpcEventId,
        error: String,
    ) {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction().await;
        dbtx.insert_entry(
            &MultispendPendingCompletionNotification::FailedWithdrawal {
                room_id,
                request_id,
                error,
            },
            &(),
        )
        .await;
        dbtx.commit_tx().await;
        self.trigger();
    }

    pub async fn add_deposit_notification(
        &self,
        room_id: RpcRoomId,
        fiat_amount: FiatAmount,
        txid: TransactionId,
        description: String,
    ) {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction().await;
        dbtx.insert_entry(
            &MultispendPendingCompletionNotification::Deposit {
                room_id,
                fiat_amount: RpcFiatAmount(fiat_amount.0),
                txid: RpcTransactionId(txid),
                description,
            },
            &(),
        )
        .await;
        dbtx.commit_tx().await;
        self.trigger();
    }

    pub async fn run_continuously(&self, multispend_matrix: &MultispendMatrix) {
        loop {
            // run at least once
            retry(
                "send queued notifications",
                background_backoff(),
                || async { self.run_once(multispend_matrix).await },
            )
            .await
            .expect("never fail");
            // and then wait for notification
            self.notify.notified().await;
        }
    }

    async fn run_once(&self, multispend_matrix: &MultispendMatrix) -> anyhow::Result<()> {
        let multispend_db = self.runtime.multispend_db();
        let mut dbtx = multispend_db.begin_transaction().await;
        let mut network_error = false;
        let pending_operations = dbtx
            .find_by_prefix(&MultispendPendingCompletionNotificationPrefix)
            .await
            .map(|(k, _)| k)
            .collect::<Vec<_>>()
            .await;
        for pending_operation in pending_operations {
            let room_id = pending_operation.room_id();
            let Ok(room_id) = room_id.into_typed() else {
                error!("invalid room id in multispend database");
                continue;
            };
            let event = pending_operation.multispend_event();
            if let Err(err) = multispend_matrix
                .send_multispend_event(&room_id, event)
                .await
            {
                error!(%err, "failed to send multispend completion event");
                network_error = true;
                continue;
            } else {
                // we are done with operation, delete it
                dbtx.remove_entry(&pending_operation).await;
            }
        }
        dbtx.commit_tx().await;
        if network_error {
            anyhow::bail!("network error")
        }
        Ok(())
    }
}
