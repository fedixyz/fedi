mod v1;
mod v2;

use anyhow::Result;
use bug_report::reused_ecash_proofs::SerializedReusedEcashProofs;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{Amount, apply, async_trait_maybe_send};
use rpc_types::{FrontendMetadata, RpcGenerateEcashResponse};
pub use v1::MintOpsV1;
#[allow(unused_imports)]
pub use v2::MintOpsV2;

use super::{FederationTransactionParts, FederationV2};

#[apply(async_trait_maybe_send!)]
pub(crate) trait MintOps: MaybeSend + MaybeSync {
    /// Fetch raw balance before Fedi fee deductions.
    async fn get_raw_balance(&self, fed: &FederationV2) -> Amount;

    /// Receive ecash
    /// TODO: use a better type than String
    async fn receive_ecash(
        &self,
        fed: &FederationV2,
        ecash: String,
        frontend_meta: FrontendMetadata,
    ) -> Result<(Amount, OperationId)>;

    async fn subscribe_to_ecash_reissue(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        amount: Amount,
    ) -> Result<()>;

    /// Generate ecash.
    async fn generate_ecash(
        &self,
        fed: &FederationV2,
        amount: Amount,
        include_invite: bool,
        frontend_meta: FrontendMetadata,
    ) -> Result<RpcGenerateEcashResponse>;

    async fn cancel_ecash(&self, fed: &FederationV2, ecash: String) -> Result<()>;

    async fn subscribe_oob_spend(&self, fed: &FederationV2, op_id: OperationId) -> Result<()>;

    async fn repair_wallet(&self, fed: &FederationV2) -> Result<()>;

    async fn had_reused_ecash(&self, fed: &FederationV2) -> bool;

    async fn generate_reused_ecash_proofs(
        &self,
        fed: &FederationV2,
    ) -> anyhow::Result<SerializedReusedEcashProofs>;

    async fn subscribe_operation(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        operation: OperationLogEntry,
    );

    async fn get_transaction(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
        entry: OperationLogEntry,
        fedi_fee_msats: u64,
    ) -> anyhow::Result<Option<FederationTransactionParts>>;
}
