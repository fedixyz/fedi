use fedimint_client::{Client, ClientModuleInstance};
use fedimint_ln_client::LightningClientModule;
use fedimint_mint_client::MintClientModule;
use fedimint_wallet_client::WalletClientModule;
use stability_pool_client_old::StabilityPoolClientModule;

/// Helper functions for fedimint_client::Client
pub trait ClientExt {
    /// Attempt to get the first lightning client module instance.
    fn ln(&self) -> anyhow::Result<ClientModuleInstance<'_, LightningClientModule>>;

    /// Attempt to get the first wallet client module instance.
    fn wallet(&self) -> anyhow::Result<ClientModuleInstance<'_, WalletClientModule>>;

    /// Attempt to get the first stability pool client module instance.
    fn sp(&self) -> anyhow::Result<ClientModuleInstance<'_, StabilityPoolClientModule>>;

    /// Attempt to get the first stability pool v2 client module instance.
    fn spv2(
        &self,
    ) -> anyhow::Result<ClientModuleInstance<'_, stability_pool_client::StabilityPoolClientModule>>;

    /// Attempt to get the first mint (e-cash) client module instance.
    fn mint(&self) -> anyhow::Result<ClientModuleInstance<'_, MintClientModule>>;
}

impl ClientExt for Client {
    fn ln(&self) -> anyhow::Result<ClientModuleInstance<'_, LightningClientModule>> {
        self.get_first_module::<LightningClientModule>()
    }

    fn wallet(&self) -> anyhow::Result<ClientModuleInstance<'_, WalletClientModule>> {
        self.get_first_module::<WalletClientModule>()
    }

    fn sp(&self) -> anyhow::Result<ClientModuleInstance<'_, StabilityPoolClientModule>> {
        self.get_first_module::<StabilityPoolClientModule>()
    }

    fn spv2(
        &self,
    ) -> anyhow::Result<ClientModuleInstance<'_, stability_pool_client::StabilityPoolClientModule>>
    {
        self.get_first_module::<stability_pool_client::StabilityPoolClientModule>()
    }

    fn mint(&self) -> anyhow::Result<ClientModuleInstance<'_, MintClientModule>> {
        self.get_first_module::<MintClientModule>()
    }
}
