use anyhow::anyhow;
use fedimint_client::module::ClientModule;
use fedimint_client::{Client, ClientModuleInstance};
use fedimint_ln_client::LightningClientModule;
use fedimint_mint_client::MintClientModule;
use fedimint_wallet_client::WalletClientModule;
use stability_pool_client::StabilityPoolClientModule;

use crate::error::ErrorCode;

/// Helper functions for fedimint_client::Client
pub trait ClientExt {
    /// Attempt to get the first module of the specified kind without panicking.
    /// Returns error if the module is not found.
    fn try_get_first_module<M: ClientModule>(&self) -> anyhow::Result<ClientModuleInstance<M>>;

    /// Attempt to get the first lightning client module instance.
    fn ln(&self) -> anyhow::Result<ClientModuleInstance<LightningClientModule>>;

    /// Attempt to get the first wallet client module instance.
    fn wallet(&self) -> anyhow::Result<ClientModuleInstance<WalletClientModule>>;

    /// Attempt to get the first stability pool client module instance.
    fn sp(&self) -> anyhow::Result<ClientModuleInstance<StabilityPoolClientModule>>;

    /// Attempt to get the first mint (e-cash) client module instance.
    fn mint(&self) -> anyhow::Result<ClientModuleInstance<MintClientModule>>;
}

impl ClientExt for Client {
    // Copied from fedimint-client
    // TODO: check during fedimint upgrade and remove if unnecessary
    fn try_get_first_module<M: ClientModule>(&self) -> anyhow::Result<ClientModuleInstance<M>> {
        let module_kind = M::kind();
        let id = self
            .get_first_instance(&module_kind)
            .ok_or(anyhow!(ErrorCode::ModuleNotFound(module_kind.to_string())))?;
        self.get_module_client_dyn(id)
            .map_err(|_| anyhow!(ErrorCode::ModuleNotFound(module_kind.to_string())))?
            .as_any()
            .downcast_ref::<M>()
            .ok_or(anyhow!(ErrorCode::ModuleNotFound(module_kind.to_string())))?;

        // We cannot construct an instance of ClientModuleInstance ourselves since the
        // module field is private. However, at this point, we've verified that
        // the module exists. So calling Client::get_first_module should
        // be successful.
        Ok(self.get_first_module::<M>())
    }

    fn ln(&self) -> anyhow::Result<ClientModuleInstance<LightningClientModule>> {
        self.try_get_first_module::<LightningClientModule>()
    }

    fn wallet(&self) -> anyhow::Result<ClientModuleInstance<WalletClientModule>> {
        self.try_get_first_module::<WalletClientModule>()
    }

    fn sp(&self) -> anyhow::Result<ClientModuleInstance<StabilityPoolClientModule>> {
        self.try_get_first_module::<StabilityPoolClientModule>()
    }

    fn mint(&self) -> anyhow::Result<ClientModuleInstance<MintClientModule>> {
        self.try_get_first_module::<MintClientModule>()
    }
}
