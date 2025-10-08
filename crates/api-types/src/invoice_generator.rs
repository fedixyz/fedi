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

// v3 - extended fee collection info with tri-state enum and no hashing

/// As part of the "Fedi Gift" project, we track the first community that
/// the user joins (barring the default Fedi community).
///
/// For users that are already part of non-default communities, the
/// following logic applies:
/// - If they are part of only one non-default community, that becomes their
///   "first community". Should they leave this community in the future, their
///   "first community" remains null forever.
/// - If they are part of multiple non-default communities, their "first
///   community" remains null forever
///
/// For users that are not part of non-default communities, the following
/// logic applies:
/// - The first non-default community that they join becomes their "first
///   community". Should they leave this community in the future, their "first
///   community" remains null forever.
///
/// We see from the above logic that we need a tri-state enum.
#[derive(Serialize, Deserialize, Clone, PartialEq, Default, Debug)]
pub enum FirstCommunityInviteCodeState {
    /// the first community has never been set and may be set in
    /// the future
    #[default]
    NeverSet,
    /// User has a first community
    Set(String),
    /// The first community may or may not have been set in the
    /// past, but can never be set going forward.
    Unset,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v3")]
pub struct GenerateInvoiceRequestV3 {
    pub amount_msat: u64,
    pub module: String,
    pub tx_direction: TransactionDirection,
    pub stable_id: String,
    pub spv2_account_id: Option<String>,
    pub federation_id: String,
    pub first_comm_invite_code: FirstCommunityInviteCodeState,
    pub other_comm_invite_codes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v3")]
pub struct InvoiceRequestMemoV3 {
    pub module: String,
    pub tx_direction: TransactionDirection,
    pub stable_id: String,
    pub spv2_account_id: Option<String>,
    pub federation_id: String,
    pub first_comm_invite_code: FirstCommunityInviteCodeState,
    pub other_comm_invite_codes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename = "v3")]
pub struct GenerateInvoiceResponseV3 {
    pub invoice: String,
}
