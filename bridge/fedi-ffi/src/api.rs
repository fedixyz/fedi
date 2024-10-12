use std::collections::BTreeMap;
use std::str::FromStr;
use std::time::{Duration, SystemTime};

use anyhow::Context;
use bitcoin::Network;
use fedi_api_types::device_control::request::{GetDevicesForSeedQueryV0, RegisterDeviceRequestV0};
use fedi_api_types::device_control::response::DevicesForSeedResultV0;
use fedi_api_types::device_control::{DeviceIdentifierV0, DeviceIndexV0, SeedCommitmentV0};
use fedi_api_types::fee_schedule::FeesV0;
use fedi_api_types::invoice_generator::{
    GenerateInvoiceRequestV1, GenerateInvoiceResponseV1, TransactionDirection,
};
use fedimint_aead::{decrypt, LessSafeKey};
use fedimint_bip39::Bip39RootSecretStrategy;
use fedimint_client::secret::RootSecretStrategy;
use fedimint_core::core::ModuleKind;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send, Amount};
use fedimint_derive_secret::DerivableSecret;
use lightning_invoice::Bolt11Invoice;
use reqwest::{Client, StatusCode};

use crate::constants::{
    DEVICE_REGISTRATION_CHILD_ID, FEDI_DEVICE_REGISTRATION_URL, FEDI_FEE_API_URL_MAINNET,
    FEDI_FEE_API_URL_MUTINYNET, FEDI_INVOICE_API_URL_MAINNET, FEDI_INVOICE_API_URL_MUTINYNET,
};
use crate::storage::{DeviceIdentifier, FediFeeSchedule, ModuleFediFeeSchedule};
use crate::types::RpcTransactionDirection;

/// Represents registration information of a device using our root seed as
/// recorded with Fedi's servers.
pub struct RegisteredDevice {
    /// Index assigned to the device, starting with 0. This is a critical number
    /// since it's used in the derivation path from the root mnemonic to the
    /// fedimint-client secret. In a way this is an account index, whereby each
    /// registered device mimics a different account of the user/seed. Note that
    /// this index has no bearing on app features that are
    /// fedimint-client/federation-agnostic such as global chat, since those
    /// features only depend on the root seed which is the same across all of
    /// the user's devices. The only reason we have to guard against reusing the
    /// same fedimint-client secret by way of these "device indices" is to
    /// prevent two devices from accidentally issuing the same ecash notes
    /// when one of them may be offline.
    pub index: u8,

    /// Human-readable, unique, stable string identifier assigned to the device
    pub identifier: DeviceIdentifier,

    /// Timestamp of the last successful registration renewal made from the
    /// device. The more recent, the better. We expect every device to
    /// periodically keep renewing its registration so that it can confirm that
    /// no other device has taken over the index assigned to it.
    pub last_renewed: SystemTime,
}

/// Represents the different errors we might encounter when attempting to
/// register the current device with Fedi's servers using the root seed, the
/// device identifier, and the device index. Optionally, we may also send along
/// a "force" flag as true, which means that if another device currently owns
/// the specified index, we wish to transfer that index to this device.
#[derive(Debug, thiserror::Error)]
pub enum RegisterDeviceError {
    /// Variant representing a conflict on Fedi's servers, whereby we try to
    /// register the current device with the specified index, but another device
    /// (with a different identifier) already owns the specified index in Fedi's
    /// records. Note that we should never expect this error if we pass in the
    /// "force" flag as true, since "force" would just take over the ownership
    /// to this device anyway.
    #[error("Registration conflicts with another device {0}")]
    AnotherDeviceOwnsIndex(String),

    /// Variant representing any other server error besides a conflicting device
    /// registration. We expect this error to be temporary so we will just retry
    /// later.
    #[error("Retryable server error {0}")]
    OtherServerError(String),

    /// Variant representing errors encountered while sending the request to the
    /// server. We expect this error to be temporary so we will just retry
    /// later.
    #[error("Retryable client error when attempting to send request {0}")]
    ErrorSendingRequest(String),

    /// Variant representing request timeout, meaning no response was received
    /// from the server within the allotted time. We expect this error to be
    /// temporary so we will just retry later.
    #[error("Request timed out")]
    RequestTimeout,
}

/// Trait that represents the API for communicating with Fedi-hosted services.
#[apply(async_trait_maybe_send!)]
pub trait IFediApi: MaybeSend + MaybeSync + 'static {
    /// Fetches the fee schedule for transactions conducted within a federation
    /// through the Fedi app.
    async fn fetch_fedi_fee_schedule(&self, network: Network) -> anyhow::Result<FediFeeSchedule>;

    /// Fetches the lightning invoice for the given amount from Fedi's server to
    /// remit the oustanding fees accrued so far
    async fn fetch_fedi_fee_invoice(
        &self,
        amount: Amount,
        network: Network,
        module: ModuleKind,
        tx_direction: RpcTransactionDirection,
    ) -> anyhow::Result<Bolt11Invoice>;

    /// Fetches a list of all registered devices (as recorded by Fedi's servers)
    /// that are using the provided seed.
    async fn fetch_registered_devices_for_seed(
        &self,
        seed: bip39::Mnemonic,
    ) -> anyhow::Result<Vec<RegisteredDevice>>;

    /// Attempts to register the current device with Fedi's servers using the
    /// root seed, index, and identifier. If the `force_overwrite` flag is
    /// false, the server will return an error if another device (with a
    /// different identifer) already owns the specified index. If the
    /// `force_overwrite` flag is true, the server should always honor our
    /// request, even if it means transferring ownership of the specified index
    /// to this new device.
    async fn register_device_for_seed(
        &self,
        seed: bip39::Mnemonic,
        device_index: u8,
        device_identifier: DeviceIdentifier,
        encrypted_device_identifier: String,
        force_overwrite: bool,
    ) -> anyhow::Result<(), RegisterDeviceError>;
}

/// Live code implementation of the IFediApi trait that uses a real
/// reqwest::Client to call out to Fedi's servers
pub struct LiveFediApi {
    client: Client,
}

impl LiveFediApi {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

impl Default for LiveFediApi {
    fn default() -> Self {
        Self::new()
    }
}

#[apply(async_trait_maybe_send!)]
impl IFediApi for LiveFediApi {
    async fn fetch_fedi_fee_schedule(&self, network: Network) -> anyhow::Result<FediFeeSchedule> {
        let api_url = match network {
            Network::Bitcoin => FEDI_FEE_API_URL_MAINNET,
            _ => FEDI_FEE_API_URL_MUTINYNET,
        };

        let fee_schedule_v0 = fedimint_core::task::timeout(Duration::from_secs(15), async {
            self.client.get(api_url).send().await
        })
        .await
        .context("Request to fetch fee schedule took too long")?
        .context("Fetch fee schedule response error")?
        .json::<FeesV0>()
        .await?;

        let remittance_threshold_msat = fee_schedule_v0.remittance_threshold_msat;
        let mut modules = BTreeMap::new();
        modules.insert(
            fedimint_mint_client::KIND,
            ModuleFediFeeSchedule {
                send_ppm: fee_schedule_v0.modules.mint.send_ppm,
                receive_ppm: fee_schedule_v0.modules.mint.receive_ppm,
            },
        );
        modules.insert(
            fedimint_ln_common::KIND,
            ModuleFediFeeSchedule {
                send_ppm: fee_schedule_v0.modules.ln.send_ppm,
                receive_ppm: fee_schedule_v0.modules.ln.receive_ppm,
            },
        );
        modules.insert(
            fedimint_wallet_client::KIND,
            ModuleFediFeeSchedule {
                send_ppm: fee_schedule_v0.modules.wallet.send_ppm,
                receive_ppm: fee_schedule_v0.modules.wallet.receive_ppm,
            },
        );
        modules.insert(
            stability_pool_client::common::KIND,
            ModuleFediFeeSchedule {
                send_ppm: fee_schedule_v0.modules.stability_pool.send_ppm,
                receive_ppm: fee_schedule_v0.modules.stability_pool.receive_ppm,
            },
        );

        Ok(FediFeeSchedule {
            remittance_threshold_msat,
            modules,
        })
    }

    async fn fetch_fedi_fee_invoice(
        &self,
        amount: Amount,
        network: Network,
        module: ModuleKind,
        tx_direction: RpcTransactionDirection,
    ) -> anyhow::Result<Bolt11Invoice> {
        let api_url = match network {
            Network::Bitcoin => FEDI_INVOICE_API_URL_MAINNET,
            _ => FEDI_INVOICE_API_URL_MUTINYNET,
        };

        let invoice_v0 = fedimint_core::task::timeout(Duration::from_secs(15), async {
            self.client
                .post(api_url)
                .json(&GenerateInvoiceRequestV1 {
                    amount_msat: amount.msats,
                    module: module.to_string(),
                    tx_direction: match tx_direction {
                        RpcTransactionDirection::Send => TransactionDirection::Send,
                        RpcTransactionDirection::Receive => TransactionDirection::Receive,
                    },
                })
                .send()
                .await
        })
        .await
        .context("Request to fetch fee invoice took too long")?
        .context("Fetch fee invoice response error")?
        .json::<GenerateInvoiceResponseV1>()
        .await?;

        Ok(Bolt11Invoice::from_str(&invoice_v0.invoice).context("Failed to parse fee invoice")?)
    }

    async fn fetch_registered_devices_for_seed(
        &self,
        seed: bip39::Mnemonic,
    ) -> anyhow::Result<Vec<RegisteredDevice>> {
        let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&seed);
        let seed_commitment = SeedCommitmentV0::new(root_secret.to_random_bytes());

        // Timeout of 2 minutes here since this fetch will either be performed during
        // onboarding and it's important for it to succeed, or it will be performed in a
        // background task without blocking anything.
        let registered_devices_v0 = fedimint_core::task::timeout(Duration::from_secs(120), async {
            self.client
                .get(format!(
                    "{FEDI_DEVICE_REGISTRATION_URL}/get_devices_for_seed"
                ))
                .query(&GetDevicesForSeedQueryV0 { seed_commitment })
                .send()
                .await
        })
        .await
        .context("Request to fetch registered devices took too long")?
        .context("Fetch registered devices for seed response error")?
        .json::<DevicesForSeedResultV0>()
        .await?;

        Ok(registered_devices_v0
            .devices
            .into_iter()
            .map(|info| {
                // If decrypting device identifier fails, attempt to use it as-is. It likely
                // means that the original registration happened before encryption was
                // implemented.
                Ok(RegisteredDevice {
                    index: info.device_index.0,
                    identifier: process_device_identifier(
                        &root_secret,
                        info.device_identifier.device_name,
                    )?,
                    last_renewed: info.timestamp.0.into(),
                })
            })
            .collect::<anyhow::Result<_>>()?)
    }

    async fn register_device_for_seed(
        &self,
        seed: bip39::Mnemonic,
        device_index: u8,
        device_identifier: DeviceIdentifier,
        encrypted_device_identifier: String,
        force_overwrite: bool,
    ) -> Result<(), RegisterDeviceError> {
        let registration_closure = |secret: DerivableSecret, identifier, overwrite| async move {
            let seed_commitment = SeedCommitmentV0::new(secret.to_random_bytes());

            // Timeout of 2 minutes here since this request will either be performed during
            // onboarding and it's important for it to succeed, or it will be performed in a
            // background task without blocking anything.
            let timeout_res = fedimint_core::task::timeout(Duration::from_secs(120), async {
                self.client
                    .post(format!(
                        "{FEDI_DEVICE_REGISTRATION_URL}/register_device_for_seed"
                    ))
                    .json(&RegisterDeviceRequestV0 {
                        seed_commitment,
                        device_index: DeviceIndexV0(device_index),
                        device_identifier: DeviceIdentifierV0 {
                            device_name: identifier,
                        },
                        force: force_overwrite || overwrite,
                    })
                    .send()
                    .await
            })
            .await;

            let Ok(register_device_result_v0) = timeout_res else {
                return Err(RegisterDeviceError::RequestTimeout);
            };

            match register_device_result_v0 {
                Ok(resp) if resp.status().is_success() => Ok(()),
                Ok(resp) if resp.status() == StatusCode::CONFLICT => {
                    Err(RegisterDeviceError::AnotherDeviceOwnsIndex(
                        resp.text().await.unwrap_or_default(),
                    ))
                }
                Ok(resp) => Err(RegisterDeviceError::OtherServerError(
                    resp.text().await.unwrap_or_default(),
                )),
                Err(e) => Err(RegisterDeviceError::ErrorSendingRequest(e.to_string())),
            }
        };

        // First try registering with an encrypted device identifier.
        // If an encrypted device identifier results in conflict, retry
        // with unencrypted device identifier. It likely
        // means that the original registration happened before
        // encryption was implemented.
        let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&seed);
        match registration_closure(
            root_secret.clone(),
            encrypted_device_identifier.clone(),
            false,
        )
        .await
        {
            Err(RegisterDeviceError::AnotherDeviceOwnsIndex(_)) => {
                // If registration first fails with encrypted device identifier, but then
                // succeeds with the unencrypted device identifier, we go ahead and re-register
                // with force_overwrite using the encrypted version. This is sort of like a DB
                // migration.
                registration_closure(root_secret.clone(), device_identifier.to_string(), false)
                    .await?;
                registration_closure(
                    root_secret.clone(),
                    encrypted_device_identifier.clone(),
                    true,
                )
                .await
            }
            res => res,
        }
    }
}

fn process_device_identifier(
    root_secret: &DerivableSecret,
    maybe_encrypted_device_identifier: String,
) -> anyhow::Result<DeviceIdentifier> {
    match decrypt_device_identifier(root_secret, &maybe_encrypted_device_identifier) {
        Err(_) => FromStr::from_str(&maybe_encrypted_device_identifier),
        res @ Ok(_) => res,
    }
}

fn decrypt_device_identifier(
    root_secret: &DerivableSecret,
    encrypted_device_identifier: &str,
) -> anyhow::Result<DeviceIdentifier> {
    let device_id_encryption_secret = root_secret.child_key(DEVICE_REGISTRATION_CHILD_ID);
    // Hex-decode -> decrypt -> trim padding
    let mut decoded = hex::decode(encrypted_device_identifier)?;
    let decrypted_bytes = decrypt(
        &mut decoded,
        &LessSafeKey::new(device_id_encryption_secret.to_chacha20_poly1305_key()),
    )?;
    let decrypted_string = String::from_utf8(decrypted_bytes.to_vec())?;
    let unpadded_string = decrypted_string.trim_end();
    FromStr::from_str(unpadded_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_encrypted_device_identifier() -> anyhow::Result<()> {
        let device_identifier_str =
            "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let device_identifier: DeviceIdentifier = FromStr::from_str(&device_identifier_str)?;
        let mnemonic = Bip39RootSecretStrategy::<12>::random(&mut rand::thread_rng());
        let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&mnemonic);

        let encrypted_device_identifier = device_identifier.encrypt_and_hex_encode(&root_secret)?;
        assert_eq!(
            device_identifier,
            process_device_identifier(&root_secret, encrypted_device_identifier)?
        );
        Ok(())
    }

    #[test]
    fn test_process_unencrypted_device_identifier() -> anyhow::Result<()> {
        let device_identifier_str =
            "bridge_1:test:add59709-395e-4563-9cbd-b34ab20dea75".to_string();
        let device_identifier: DeviceIdentifier = FromStr::from_str(&device_identifier_str)?;
        let mnemonic = Bip39RootSecretStrategy::<12>::random(&mut rand::thread_rng());
        let root_secret = Bip39RootSecretStrategy::<12>::to_root_secret(&mnemonic);

        assert_eq!(
            device_identifier,
            process_device_identifier(&root_secret, device_identifier_str)?
        );
        Ok(())
    }
}
