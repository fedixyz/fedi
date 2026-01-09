use std::sync::Arc;

use runtime::bridge_runtime::Runtime;
use transfer_complete_notifier::SptTransferCompleteNotifier;

use self::account_id_responder::SptAccountIdResponder;
use self::transfer_submitter::SptTransferSubmitter;

pub mod account_id_responder;
pub mod transfer_complete_notifier;
pub mod transfer_submitter;

use fedimint_core::core::OperationId;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{TransactionId, apply, async_trait_maybe_send};
use rpc_types::SPv2TransferMetadata;
use rpc_types::spv2_transfer_meta::Spv2TransferTxMeta;
use stability_pool_client::common::{AccountId, FiatAmount};
use stability_pool_client::db::UserOperationHistoryItem;

#[apply(async_trait_maybe_send!)]
pub trait SptFederationProvider: MaybeSend + MaybeSync {
    async fn spv2_transfer_with_nonce(
        &self,
        federation_id: &str,
        nonce: u64,
        to_account: AccountId,
        amount: FiatAmount,
        extra_meta: SPv2TransferMetadata,
        transfer_meta: Spv2TransferTxMeta,
    ) -> anyhow::Result<OperationId>;

    async fn our_seeker_account_id(&self, federation_id: &str) -> Option<AccountId>;

    fn spv2_force_sync(&self, federation_id: &str);

    async fn spv2_wait_for_user_operation_history_item(
        &self,
        federation_id: &str,
        txid: TransactionId,
    ) -> anyhow::Result<UserOperationHistoryItem>;
}

pub struct SptServices {
    pub provider: Arc<dyn SptFederationProvider>,
    pub transfer_submitter: SptTransferSubmitter,
    pub account_id_responder: SptAccountIdResponder,
    pub transfer_complete_notifier: Arc<SptTransferCompleteNotifier>,
}

impl SptServices {
    pub fn new(
        runtime: Arc<Runtime>,
        provider: Arc<dyn SptFederationProvider>,
        transfer_complete_notifier: Arc<SptTransferCompleteNotifier>,
    ) -> Arc<Self> {
        Arc::new(Self {
            provider: provider.clone(),
            transfer_submitter: SptTransferSubmitter::new(runtime.clone(), provider.clone()),
            account_id_responder: SptAccountIdResponder::new(runtime.clone(), provider),
            transfer_complete_notifier,
        })
    }
}
