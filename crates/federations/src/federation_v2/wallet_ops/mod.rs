mod v1;
mod v2;

use anyhow::Result;
use bitcoin::Network;
use bitcoin::address::NetworkUnchecked;
use fedimint_client::module::oplog::OperationLogEntry;
use fedimint_core::core::OperationId;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send};
use rpc_types::{FrontendMetadata, RpcFeeDetails};
pub use v1::WalletOpsV1;
pub use v2::WalletOpsV2;

use super::{FederationTransactionParts, FederationV2};

#[apply(async_trait_maybe_send!)]
pub trait WalletOps: MaybeSend + MaybeSync {
    /// Get the bitcoin network type this federation's wallet module is using
    fn get_network(&self, fed: &FederationV2) -> Network;

    /// Whether this federation supports the safe on-chain deposit flow, which
    /// is what gates offering an on-chain receive address in the app. Fallible
    /// because for some wallet versions answering means querying the
    /// federation.
    async fn supports_safe_deposit(&self, fed: &FederationV2) -> Result<bool>;

    /// Generate bitcoin address
    async fn generate_address(
        &self,
        fed: &FederationV2,
        frontend_meta: FrontendMetadata,
    ) -> Result<String>;

    async fn recheck_pegin_address(
        &self,
        fed: &FederationV2,
        operation_id: OperationId,
    ) -> Result<()>;

    /// Returns the fee details for making a payment on-chain.
    /// Returns an error in case the amount exceeds the max spendable amount.
    async fn preview_pay_address(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
    ) -> Result<RpcFeeDetails>;

    /// Pay an onchain address
    async fn pay_address(
        &self,
        fed: &FederationV2,
        address: bitcoin::Address<NetworkUnchecked>,
        amount: bitcoin::Amount,
        frontend_meta: FrontendMetadata,
    ) -> Result<OperationId>;

    async fn subscribe_to_onchain_addresses(&self, fed: &FederationV2);

    async fn subscribe_pay_address(&self, fed: &FederationV2, op_id: OperationId) -> Result<()>;

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
