use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

use crate::RpcAmount;

#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    #[error("Intialization failed")]
    InitializationFailed,
    #[error("Not initialized")]
    NotInialized,
    #[error("Bad request")]
    BadRequest,
    #[error("Already joined this federation")]
    AlreadyJoined,
    #[error("Invalid invoice")]
    InvalidInvoice,
    #[error("Invalid Mnemonic")]
    InvalidMnemonic,
    #[error("Ecash cancel failed, the e-cash notes have been spent by someone else already")]
    EcashCancelFailed,
    #[error("Bridge panicked")]
    Panic,
    #[error("Invalid social recovery file")]
    InvalidSocialRecoveryFile,
    #[error("Insufficient balance for spend amount plus fees, max spendable is {0}")]
    InsufficientBalance(RpcAmount),
    #[error("Matrix not initialized")]
    MatrixNotInitialized,
    #[error("Unknown Observable")]
    UnknownObservable,
    #[error("Observable with ID {0} already exists")]
    DuplicateObservableID(u64),
    #[error("Operation timed out")]
    Timeout,
    #[error("Not allowed while recovering")]
    Recovery,
    #[error("Deserializing JSON failed: {0}")]
    InvalidJson(String),
    #[error("Community version {0} is not supported")]
    UnsupportedCommunityVersion(u32),
    #[error("pay_invoice is already paid")]
    PayLnInvoiceAlreadyPaid,
    #[error("pay_invoice is already in progress")]
    PayLnInvoiceAlreadyInProgress,
    #[error("No Lightning gateway is available")]
    NoLnGatewayAvailable,
    #[error("Module of type {0} is not available")]
    ModuleNotFound(String),
    #[error("Federation {0} previously failed nonce reuse check; must recover from scratch")]
    FederationPendingRejoinFromScratch(String),
    #[error("Invalid Multispend event, likely something changed in multispend state")]
    InvalidMsEvent,
    #[error("Recurringd api not set in federation meta")]
    RecurringdMetaNotFound,
    #[error("Unknown federation")]
    UnknownFederation,
    #[error("Exact notes unavailable offline and guardians unreachable")]
    OfflineExactEcashFailed,
    #[error("Community marked as deleted by creator, cannot preview to join")]
    CommunityDeleted,
}

#[derive(Debug, Serialize, Deserialize, TS, Clone)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RpcError {
    pub error: String,
    pub detail: String,
    pub error_code: Option<ErrorCode>,
}

impl RpcError {
    pub fn from_anyhow(err: &anyhow::Error) -> Self {
        Self {
            error: err.to_string(),
            detail: format!("{err:?}"),
            error_code: get_error_code(err),
        }
    }
}

fn get_error_code(err: &anyhow::Error) -> Option<ErrorCode> {
    err.downcast_ref().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_can_add_error() {
        let err = anyhow::anyhow!("Hello world").context(ErrorCode::InitializationFailed);
        let code = get_error_code(&err);
        assert_eq!(code, Some(ErrorCode::InitializationFailed));
    }

    #[test]
    fn test_just_error_code() {
        let err = anyhow::anyhow!(ErrorCode::InitializationFailed);
        let code = get_error_code(&err);
        assert_eq!(code, Some(ErrorCode::InitializationFailed));
    }
}
