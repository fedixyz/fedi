use std::time::Duration;

pub const PAY_INVOICE_TIMEOUT: Duration = Duration::from_secs(90);
pub const REISSUE_ECASH_TIMEOUT: Duration = Duration::from_secs(60);
pub const ONE_WEEK: Duration = Duration::from_secs(604800);
pub const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);
pub const LNURL_CHILD_ID: u64 = 11;
pub const XMPP_CHILD_ID: u64 = 10;
pub const XMPP_PASSWORD: u64 = 0;
pub const XMPP_KEYPAIR_SEED: u64 = 1;
pub const NOSTR_CHILD_ID: u64 = 12;
pub const MILLION: u64 = 1_000_000;
pub const MATRIX_CHILD_ID: u64 = 13;

// Backup twice per day
pub const BACKUP_FREQUENCY: Duration = Duration::from_secs(12 * 60 * 60);

// Fedi file path
pub const FEDI_FILE_PATH: &str = "./fedi_file.json";

// Operation types in fedimint client
pub const LIGHTNING_OPERATION_TYPE: &str = "ln";
pub const MINT_OPERATION_TYPE: &str = "mint";
pub const WALLET_OPERATION_TYPE: &str = "wallet";
pub const STABILITY_POOL_OPERATION_TYPE: &str = "stability_pool";

// URL for Fedi fee schedule API
pub const FEDI_FEE_API_URL_MUTINYNET: &str =
    "https://mutinynet-fedi-fee-schedule.dev.fedibtc.com/v0/fees";
pub const FEDI_FEE_API_URL_MAINNET: &str =
    "https://mainnet-fedi-fee-schedule.dev.fedibtc.com/v0/fees";

// URL for Fedi fee lightning invoice generator API
pub const FEDI_INVOICE_API_URL_MUTINYNET: &str =
    "https://mutinynet-fedi-fee-collection.dev.fedibtc.com/v0/generate-invoice";
pub const FEDI_INVOICE_API_URL_MAINNET: &str =
    "https://mainnet-fedi-fee-collection.dev.fedibtc.com/v0/generate-invoice";

// URL for Fedi's device registration API
// TODO shaurya replace with production URL when deployed (currently staging)
pub const FEDI_DEVICE_REGISTRATION_URL: &str = "https://staging-device-control.dev.fedibtc.com/v0";
