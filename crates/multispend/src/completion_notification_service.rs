use std::sync::Arc;

use anyhow::Context;
use fedimint_core::TransactionId;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::util::backoff_util::background_backoff;
use fedimint_core::util::retry;
use futures::StreamExt as _;
use matrix_sdk::ruma::TransactionId as MatrixTransactionId;
use rpc_types::matrix::RpcRoomId;
use rpc_types::{RpcEventId, RpcFiatAmount, RpcTransactionId};
use runtime::bridge_runtime::Runtime;
use stability_pool_client::common::FiatAmount;
use tokio::sync::Notify;
use tracing::error;

use super::MultispendEvent;
use super::db::{
    MultispendPendingCompletionNotification, MultispendPendingCompletionNotificationPrefix,
    MultispendPendingCompletionNotificationTxnIdKey,
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

    // Get a matrix transaction id for a given pending notificaton, based on its
    // request id(for withdrawal) or fedimint transaction id (for deposits). An ID
    // is generated random and persisted forever. This is get idempotency from
    // matrix server and avoid duplicated messages.
    async fn ensure_matrix_transaction_id(
        dbtx: &mut DatabaseTransaction<'_>,
        pending_notification: &MultispendPendingCompletionNotification,
    ) -> String {
        let key =
            MultispendPendingCompletionNotificationTxnIdKey(pending_notification.notification_id());
        if let Some(existing) = dbtx.get_value(&key).await {
            return existing;
        }

        let transaction_id = MatrixTransactionId::new().to_string();
        dbtx.insert_entry(&key, &transaction_id).await;
        transaction_id
    }

    async fn send_completion_notification_event(
        multispend_matrix: &MultispendMatrix,
        room_id: &matrix_sdk::ruma::RoomId,
        event: MultispendEvent,
        matrix_transaction_id: String,
    ) -> anyhow::Result<()> {
        let _send_lock = multispend_matrix.send_multispend_mutex().lock().await;

        multispend_matrix
            .send_message_json_no_queue(
                room_id,
                super::MULTISPEND_MSGTYPE,
                String::from("This group has new multispend activity"),
                serde_json::to_value(event)?
                    .as_object()
                    .context("invalid serialization of content")?
                    .clone(),
                Some(matrix_transaction_id),
            )
            .await?;
        Ok(())
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
            let matrix_transaction_id =
                Self::ensure_matrix_transaction_id(&mut dbtx.to_ref_nc(), &pending_operation).await;
            if let Err(err) = Self::send_completion_notification_event(
                multispend_matrix,
                &room_id,
                event,
                matrix_transaction_id,
            )
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
