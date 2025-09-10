use serde::{Deserialize, Serialize};

// v0 - deprecated

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v0")]
pub struct GenerateInvoiceRequestV0 {
    pub amount_msat: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v0")]
pub struct GenerateInvoiceResponseV0 {
    pub invoice: String,
}

// v1 - new api

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v1")]
pub struct GenerateInvoiceRequestV1 {
    pub amount_msat: u64,
    pub module: String,
    pub tx_direction: TransactionDirection,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TransactionDirection {
    Send,
    Receive,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v1")]
pub struct GenerateInvoiceResponseV1 {
    pub invoice: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v1")]
pub struct InvoiceRequestMemoV1 {
    pub module: String,
    pub tx_direction: TransactionDirection,
}

// v2 - extended fee collection info

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v2")]
pub struct GenerateInvoiceRequestV2 {
    pub amount_msat: u64,
    pub module: String,
    pub tx_direction: TransactionDirection,
    pub stable_id: String,
    pub spv2_account_id: Option<String>,
    pub federation_id: String,
    pub first_comm_invite_code_hash: Option<String>,
    pub other_comm_invite_codes_hashes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v2")]
pub struct InvoiceRequestMemoV2 {
    pub module: String,
    pub tx_direction: TransactionDirection,
    pub stable_id: String,
    pub spv2_account_id: Option<String>,
    pub federation_id: String,
    pub first_comm_invite_code_hash: Option<String>,
    pub other_comm_invite_codes_hashes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v2")]
pub struct GenerateInvoiceResponseV2 {
    pub invoice: String,
}
