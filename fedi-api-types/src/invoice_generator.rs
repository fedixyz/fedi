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
