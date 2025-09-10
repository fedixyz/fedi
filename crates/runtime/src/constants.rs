use std::time::Duration;

use bech32::Hrp;
use fedimint_derive_secret::ChildId;

pub const REISSUE_ECASH_TIMEOUT: Duration = Duration::from_secs(60);
/// 3 days
pub const ECASH_AUTO_CANCEL_DURATION: Duration = Duration::from_secs(60 * 60 * 24 * 3);
pub const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);
pub const LNURL_CHILD_ID: u64 = 11;
pub const XMPP_CHILD_ID: u64 = 10;
pub const XMPP_PASSWORD: u64 = 0;
pub const XMPP_KEYPAIR_SEED: u64 = 1;
pub const NOSTR_CHILD_ID: ChildId = ChildId(12);
pub const MILLION: u64 = 1_000_000;
pub const MATRIX_CHILD_ID: u64 = 13;
pub const DEVICE_REGISTRATION_CHILD_ID: ChildId = ChildId(14);
pub const FEDI_GIFT_CHILD_ID: ChildId = ChildId(15);

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

// In addition to amount threshold, remit fedi fee every 7 days
pub const FEDI_FEE_REMITTANCE_MAX_DELAY: Duration = Duration::from_secs(7 * 24 * 60 * 60);

// Fedi file path
pub const FEDI_FILE_V0_PATH: &str = "./fedi_file.json";

// Operation types in fedimint client
pub const LIGHTNING_OPERATION_TYPE: &str = "ln";
pub const MINT_OPERATION_TYPE: &str = "mint";
pub const WALLET_OPERATION_TYPE: &str = "wallet";
pub const STABILITY_POOL_OPERATION_TYPE: &str = "stability_pool";
pub const STABILITY_POOL_V2_OPERATION_TYPE: &str = "multi_sig_stability_pool";

// URL for Fedi fee schedule API
pub const FEDI_FEE_API_URL_MUTINYNET: &str =
    "https://mutinynet-fedi-fee-schedule.dev.fedibtc.com/v0/fees";
pub const FEDI_FEE_API_URL_MAINNET: &str =
    "https://mainnet-fedi-fee-schedule.dev.fedibtc.com/v0/fees";

// URL for Fedi fee lightning invoice generator API
pub const FEDI_INVOICE_API_URL_MUTINYNET: &str =
    "https://staging.fee-collection.dev.fedibtc.com/v2/generate-invoice";
pub const FEDI_INVOICE_API_URL_MAINNET: &str =
    "https://prod.fee-collection.dev.fedibtc.com/v2/generate-invoice";

pub const COMMUNITY_INVITE_CODE_HRP: Hrp = Hrp::parse_unchecked("fedi:community");

pub const RECURRINGD_API_META: &str = "recurringd_api";

// Global community invite codes used across environments
// s3://join-community/001/meta.json
pub const FEDI_GLOBAL_COMMUNITY_PROD: &str = "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vpsxyhk6et5vyhx5um0dc386g8m6tx";
// s3://join-community/002/meta.json
pub const FEDI_GLOBAL_COMMUNITY_STAGING: &str = "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vpsxghk6et5vyhx5um0dc386kjjczw";

// List of communities to be excluded from consideration as either the "first"
// or "other" communities within the scope of the Fedi Gift project.
pub const FEDI_GIFT_EXCLUDED_COMMUNITIES: &[&str] = &[
    // Global community codes
    FEDI_GLOBAL_COMMUNITY_PROD,
    FEDI_GLOBAL_COMMUNITY_STAGING,
    // Additional placeholder communities for future
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vpsxvhk6et5vyhx5um0dc386ux4p93",
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vpsxshk6et5vyhx5um0dc386r3qus7",
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vpsx5hk6et5vyhx5um0dc386f989hp",
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vpsxchk6et5vyhx5um0dc386hsw87f",
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vpsxuhk6et5vyhx5um0dc386ayf7ek",
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vps8qhk6et5vyhx5um0dc386wzmpua",
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vps8yhk6et5vyhx5um0dc386ykucmz",
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309a4x76tw943k7mtdw4hxjare9eenxtnpd4sh5mmwv9mhxtnrdakj7vp3xqhk6et5vyhx5um0dc386z2cee7",
    // 1 placeholder for QA testing
    "fedi:community10v3xxmmdd46ku6t5090k6et5v90h2unvygazy6r5w3c8xw309ankjum59enkjargw4382um9wf3k7mn5v4h8gtnrdakj7cnswf5kxefk9ucxgv3evyekgd3h8qcrve35vser2dmz89jx2drzxfjkgd34vvergtmjv9mjylglx5n2j",
];
