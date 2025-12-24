mod types;

use anyhow::{Context, Result};
pub use types::*;

/// Typed client for the DVD (devimint) server API.
///
/// This client provides typed access to devimint operations like generating
/// ecash, sending bitcoin, creating lightning invoices, etc.
#[derive(Clone)]
pub struct DvdClient {
    base_url: String,
    client: reqwest::Client,
}

impl DvdClient {
    /// Create a new client pointing to the given server URL.
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::Client::new(),
        }
    }

    /// Create a client from the DVD_SERVER_URL environment variable.
    pub fn from_env() -> Result<Self> {
        let url = std::env::var("DVD_SERVER_URL")
            .context("DVD_SERVER_URL environment variable not set")?;
        Ok(Self::new(url))
    }

    /// Get the federation invite code.
    pub async fn invite_code(&self) -> Result<String> {
        let resp: InviteCodeResponse = self
            .client
            .get(format!("{}/invite_code", self.base_url))
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok(resp.invite_code)
    }

    /// Generate ecash notes of the given amount.
    pub async fn generate_ecash(&self, amount_msats: u64) -> Result<String> {
        let resp: GenerateEcashResponse = self
            .client
            .post(format!("{}/ecash/generate", self.base_url))
            .json(&GenerateEcashRequest { amount_msats })
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok(resp.ecash)
    }

    /// Receive/reissue ecash notes.
    pub async fn receive_ecash(&self, ecash: String) -> Result<()> {
        self.client
            .post(format!("{}/ecash/receive", self.base_url))
            .json(&ReceiveEcashRequest { ecash })
            .send()
            .await?
            .better_error_for_status()
            .await?;
        Ok(())
    }

    /// Send bitcoin to an address and mine blocks.
    pub async fn send_bitcoin(&self, address: &str, amount_sats: u64) -> Result<String> {
        let resp: SendBitcoinResponse = self
            .client
            .post(format!("{}/bitcoin/send", self.base_url))
            .json(&SendBitcoinRequest {
                address: address.to_string(),
                amount_sats,
            })
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok(resp.txid)
    }

    /// Mine the specified number of blocks.
    pub async fn mine_blocks(&self, count: u64) -> Result<()> {
        self.client
            .post(format!("{}/bitcoin/mine", self.base_url))
            .json(&MineBlocksRequest { count })
            .send()
            .await?
            .better_error_for_status()
            .await?;
        Ok(())
    }

    /// Get a new bitcoin address.
    pub async fn bitcoin_address(&self) -> Result<String> {
        let resp: BitcoinAddressResponse = self
            .client
            .get(format!("{}/bitcoin/address", self.base_url))
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok(resp.address)
    }

    /// Create an LND invoice.
    pub async fn create_lnd_invoice(&self, amount_msats: u64) -> Result<(String, Vec<u8>)> {
        let resp: LndInvoiceResponse = self
            .client
            .post(format!("{}/lightning/invoice", self.base_url))
            .json(&CreateInvoiceRequest { amount_msats })
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok((resp.invoice, resp.payment_hash))
    }

    /// Pay an LND invoice.
    pub async fn pay_lnd_invoice(&self, invoice: &str) -> Result<()> {
        self.client
            .post(format!("{}/lightning/pay", self.base_url))
            .json(&PayInvoiceRequest {
                invoice: invoice.to_string(),
            })
            .send()
            .await?
            .better_error_for_status()
            .await?;
        Ok(())
    }

    /// Wait for an LND invoice to be paid.
    pub async fn wait_lnd_invoice(&self, payment_hash: &[u8]) -> Result<()> {
        self.client
            .post(format!("{}/lightning/wait", self.base_url))
            .json(&WaitInvoiceRequest {
                payment_hash: payment_hash.to_vec(),
            })
            .send()
            .await?
            .better_error_for_status()
            .await?;
        Ok(())
    }

    /// Get the LND node pubkey.
    pub async fn lnd_pubkey(&self) -> Result<String> {
        let resp: LndPubkeyResponse = self
            .client
            .get(format!("{}/lightning/pubkey", self.base_url))
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok(resp.pubkey)
    }

    /// Create an invoice via the LDK gateway.
    pub async fn create_gateway_invoice(&self, amount_msats: u64) -> Result<(String, Vec<u8>)> {
        let resp: GatewayInvoiceResponse = self
            .client
            .post(format!("{}/gateway/invoice", self.base_url))
            .json(&CreateInvoiceRequest { amount_msats })
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok((resp.invoice, resp.payment_hash))
    }

    /// Wait for a gateway invoice to be paid.
    pub async fn wait_gateway_invoice(&self, payment_hash: &[u8]) -> Result<()> {
        self.client
            .post(format!("{}/gateway/wait", self.base_url))
            .json(&WaitInvoiceRequest {
                payment_hash: payment_hash.to_vec(),
            })
            .send()
            .await?
            .better_error_for_status()
            .await?;
        Ok(())
    }

    /// Get the recurringd API URL.
    pub async fn recurringd_url(&self) -> Result<String> {
        let resp: RecurringdUrlResponse = self
            .client
            .get(format!("{}/recurringd/url", self.base_url))
            .send()
            .await?
            .better_error_for_status()
            .await?
            .json()
            .await?;
        Ok(resp.url)
    }
}

trait ResponseExt: Sized {
    async fn better_error_for_status(self) -> anyhow::Result<Self>;
}

impl ResponseExt for reqwest::Response {
    async fn better_error_for_status(self) -> anyhow::Result<Self> {
        let status = self.status();
        if status.is_client_error() || status.is_server_error() {
            anyhow::bail!("Status {status}: {body}", body = self.text().await?)
        } else {
            Ok(self)
        }
    }
}
