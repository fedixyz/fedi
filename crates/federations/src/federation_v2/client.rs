use fedimint_client::{Client, ClientModuleInstance};
use fedimint_ln_client::LightningClientModule;
use fedimint_lnv2_client::LightningClientModule as LightningV2ClientModule;
use fedimint_mint_client::MintClientModule;
use fedimint_mintv2_client::MintClientModule as MintV2ClientModule;
use fedimint_wallet_client::WalletClientModule;
use fedimint_walletv2_client::WalletClientModule as WalletV2ClientModule;
use stability_pool_client_old::StabilityPoolClientModule;

/// Helper functions for fedimint_client::Client
pub trait ClientExt {
    /// Attempt to get the first lightning client module instance.
    fn ln(&self) -> anyhow::Result<ClientModuleInstance<'_, LightningClientModule>>;

    /// Attempt to get the first lightning v2 client module instance.
    fn lnv2(&self) -> anyhow::Result<ClientModuleInstance<'_, LightningV2ClientModule>>;

    /// Attempt to get the first wallet client module instance.
    fn wallet(&self) -> anyhow::Result<ClientModuleInstance<'_, WalletClientModule>>;

    /// Attempt to get the first wallet v2 client module instance.
    fn walletv2(&self) -> anyhow::Result<ClientModuleInstance<'_, WalletV2ClientModule>>;

    /// Attempt to get the first stability pool client module instance.
    fn sp(&self) -> anyhow::Result<ClientModuleInstance<'_, StabilityPoolClientModule>>;

    /// Attempt to get the first stability pool v2 client module instance.
    fn spv2(
        &self,
    ) -> anyhow::Result<ClientModuleInstance<'_, stability_pool_client::StabilityPoolClientModule>>;

    /// Attempt to get the first mint (e-cash) client module instance.
    fn mint(&self) -> anyhow::Result<ClientModuleInstance<'_, MintClientModule>>;

    /// Attempt to get the first mint v2 client module instance.
    fn mintv2(&self) -> anyhow::Result<ClientModuleInstance<'_, MintV2ClientModule>>;
}

impl ClientExt for Client {
    fn ln(&self) -> anyhow::Result<ClientModuleInstance<'_, LightningClientModule>> {
        self.get_first_module::<LightningClientModule>()
    }

    fn lnv2(&self) -> anyhow::Result<ClientModuleInstance<'_, LightningV2ClientModule>> {
        self.get_first_module::<LightningV2ClientModule>()
    }

    fn wallet(&self) -> anyhow::Result<ClientModuleInstance<'_, WalletClientModule>> {
        self.get_first_module::<WalletClientModule>()
    }

    fn walletv2(&self) -> anyhow::Result<ClientModuleInstance<'_, WalletV2ClientModule>> {
        self.get_first_module::<WalletV2ClientModule>()
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

    fn mintv2(&self) -> anyhow::Result<ClientModuleInstance<'_, MintV2ClientModule>> {
        self.get_first_module::<MintV2ClientModule>()
    }
}
