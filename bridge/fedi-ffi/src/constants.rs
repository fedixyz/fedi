use std::time::Duration;

use bech32::Hrp;
use fedimint_derive_secret::ChildId;

pub const PAY_INVOICE_TIMEOUT: Duration = Duration::from_secs(90);
pub const REISSUE_ECASH_TIMEOUT: Duration = Duration::from_secs(60);
/// 3 days
pub const ECASH_AUTO_CANCEL_DURATION: Duration = Duration::from_secs(60 * 60 * 24 * 3);
pub const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);
pub const LNURL_CHILD_ID: u64 = 11;
pub const XMPP_CHILD_ID: u64 = 10;
pub const XMPP_PASSWORD: u64 = 0;
pub const XMPP_KEYPAIR_SEED: u64 = 1;
pub const NOSTR_CHILD_ID: u64 = 12;
pub const MILLION: u64 = 1_000_000;
pub const MATRIX_CHILD_ID: u64 = 13;
pub const DEVICE_REGISTRATION_CHILD_ID: ChildId = ChildId(14);

// Desired length for device identifier string before encrypting and uploading
// to Fedi's device registration servers. We add padding as desired. Having a
// fixed length pre-encryption enhances user privacy.
pub const DEVICE_IDENTIFIER_FIXED_LENGTH: usize = 128;

// Backup twice per day
pub const BACKUP_FREQUENCY: Duration = Duration::from_secs(12 * 60 * 60);

// Attempt to renew device registration every 15 minutes
pub const DEVICE_REGISTRATION_FREQUENCY: Duration = Duration::from_secs(15 * 60);

// If no device registration renewal has happened in 12 hours, emit event for
// front-end
pub const DEVICE_REGISTRATION_OVERDUE: Duration = Duration::from_secs(12 * 60 * 60);

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
    "https://staging.fee-collection.dev.fedibtc.com/v1/generate-invoice";
pub const FEDI_INVOICE_API_URL_MAINNET: &str =
    "https://prod.fee-collection.dev.fedibtc.com/v1/generate-invoice";

// URL for Fedi's device registration API
pub const FEDI_DEVICE_REGISTRATION_URL: &str = "https://prod-device-control.dev.fedibtc.com/v0";

pub const GLOBAL_MATRIX_SERVER: &str = "https://m1.8fa.in";
pub const GLOBAL_MATRIX_SLIDING_SYNC_PROXY: &str = "https://sliding.m1.8fa.in";

pub const COMMUNITY_INVITE_CODE_HRP: Hrp = Hrp::parse_unchecked("fedi:community");
