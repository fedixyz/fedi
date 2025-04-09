use std::sync::Arc;

use fedimint_core::task::{MaybeSend, MaybeSync};
use serde::{Deserialize, Serialize};
use stability_pool_client::{
    StabilityPoolDepositOperationState, StabilityPoolTransferOperationState,
    StabilityPoolWithdrawalOperationState,
};
use ts_rs::TS;

use super::types::{RpcFederationId, RpcOperationId, RpcTransaction, SocialRecoveryApproval};
use crate::observable::ObservableUpdate;
use crate::types::{RpcAmount, RpcCommunity, RpcFederationMaybeLoading};

#[derive(Serialize, Deserialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TransactionEvent {
    pub federation_id: RpcFederationId,
    pub transaction: RpcTransaction,
}

#[derive(Serialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LogEvent {
    pub log: String,
}

#[derive(Serialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SocialRecoveryEvent {
    pub approvals: Vec<SocialRecoveryApproval>,
    pub remaining: usize,
}

#[derive(Serialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PanicEvent {
    pub message: String,
}

#[derive(Serialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BalanceEvent {
    pub federation_id: RpcFederationId,
    pub balance: RpcAmount,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StabilityPoolDepositEvent {
    pub federation_id: RpcFederationId,
    pub operation_id: RpcOperationId,
    pub state: StabilityPoolDepositState,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum StabilityPoolDepositState {
    Initiated,
    TxAccepted,
    TxRejected(String),
    PrimaryOutputError(String),
    Success,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SPv2DepositEvent {
    pub federation_id: RpcFederationId,
    pub operation_id: RpcOperationId,
    pub state: SPv2DepositState,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SPv2DepositState {
    Initiated,
    TxAccepted,
    TxRejected(String),
    PrimaryOutputError(String),
    Success,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SPv2WithdrawalEvent {
    pub federation_id: RpcFederationId,
    pub operation_id: RpcOperationId,
    pub state: SPv2WithdrawalState,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SPv2WithdrawalState {
    Initiated,
    UnlockTxAccepted,
    UnlockTxRejected(String),
    UnlockProcessingError(String),
    WithdrawalInitiated(RpcAmount),
    WithdrawalTxAccepted(RpcAmount),
    WithdrawalTxRejected(String),
    PrimaryOutputError(String),
    Success(RpcAmount),
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SPv2TransferEvent {
    pub federation_id: RpcFederationId,
    pub operation_id: RpcOperationId,
    pub state: SPv2TransferState,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SPv2TransferState {
    Initiated,
    Success,
    TxRejected(String),
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StabilityPoolWithdrawalEvent {
    pub federation_id: RpcFederationId,
    pub operation_id: RpcOperationId,
    pub state: StabilityPoolWithdrawalState,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum StabilityPoolWithdrawalState {
    InvalidOperationType,
    WithdrawUnlockedInitiated,
    TxRejected(String),
    WithdrawUnlockedAccepted,
    PrimaryOutputError(String),
    Success,
    CancellationSubmissionFailure(String),
    CancellationInitiated,
    CancellationAccepted,
    AwaitCycleTurnoverError(String),
    WithdrawIdleSubmissionFailure(String),
    WithdrawIdleInitiated,
    WithdrawIdleAccepted,
}

#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RecoveryCompleteEvent {
    pub federation_id: RpcFederationId,
}

/// Progress of the recovery
///
/// This includes "magic" value: if `total` is `0` the progress is "not started
/// yet"/"empty"/"none"
///
/// total and complete are unitless.
#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RecoveryProgressEvent {
    pub federation_id: RpcFederationId,
    /// completed units of work
    pub complete: u32,
    /// total units of work that are to be completed
    pub total: u32,
}

/// Status of device registration with Fedi's server
#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DeviceRegistrationEvent {
    pub state: DeviceRegistrationState,
}

/// Notifier for partial/whole unfilled stability pool deposit having been
/// claimed back as e-cash.
#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StabilityPoolUnfilledDepositSweptEvent {
    pub amount: RpcAmount,
}

/// States representing the different outcomes for device registration requests
/// sent to Fedi's servers
#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum DeviceRegistrationState {
    /// This is a fresh device because we do not have a device index set within
    /// AppState. Moreover, the list of registered devices per Fedi's servers is
    /// non-empty, and this device's identifier is not to be found in that
    /// list. So in order to proceed using the app, user action is required to
    /// either register this device as a new device with a particular index, or
    /// to transfer an existing device's registration to it.
    NewDeviceNeedsAssignment,

    /// Another device has taken over the index which was previously registered
    /// to this device. Normal app usage is no longer recommended/supported on
    /// this device.
    Conflict,

    /// We were able to successfully register/renew this device against its
    /// original device index, and won't need to talk to Fedi's server until a
    /// later time, when we will attempt to renew the registration.
    Success,

    /// We need to imminently talk to Fedi's servers to renew this device's
    /// registration against th device index assigned to it. But we just tried
    /// and were not able to due to network errors or other temporary server
    /// errors. We will keep retrying and we eventually expect this to resolve,
    /// at which time we would either get back a success or a conflict as
    /// response.
    Overdue,
}

/// Notify front-end that a particular community's metadata has updated
#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommunityMetadataUpdatedEvent {
    pub new_community: RpcCommunity,
}

/// Notify front-end that given federation has failed the e-cash blind nonce
/// reuse check and must be rejoined using a recovery-from-scratch.
#[derive(Serialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NonceReuseCheckFailedEvent {
    pub federation_id: RpcFederationId,
}

#[derive(Debug, TS)]
#[ts(export)]
#[ts(rename_all = "camelCase")]
pub enum Event {
    Transaction(Box<TransactionEvent>),
    Log(LogEvent),
    Federation(RpcFederationMaybeLoading),
    Balance(BalanceEvent),
    Panic(PanicEvent),
    SPv2Deposit(SPv2DepositEvent),
    SPv2Withdrawal(SPv2WithdrawalEvent),
    SPv2Transfer(SPv2TransferEvent),
    StabilityPoolDeposit(StabilityPoolDepositEvent),
    StabilityPoolWithdrawal(StabilityPoolWithdrawalEvent),
    RecoveryComplete(RecoveryCompleteEvent),
    RecoveryProgress(RecoveryProgressEvent),
    DeviceRegistration(DeviceRegistrationEvent),
    StabilityPoolUnfilledDepositSwept(StabilityPoolUnfilledDepositSweptEvent),
    CommunityMetadataUpdated(CommunityMetadataUpdatedEvent),
    NonceReuseCheckFailed(NonceReuseCheckFailedEvent),
}

impl Event {
    pub fn transaction(federation_id: String, transaction: RpcTransaction) -> Self {
        Self::Transaction(Box::new(TransactionEvent {
            federation_id: RpcFederationId(federation_id),
            transaction,
        }))
    }
    pub fn log(log: String) -> Self {
        Self::Log(LogEvent { log })
    }
    pub fn federation(federation: RpcFederationMaybeLoading) -> Self {
        Self::Federation(federation)
    }
    pub fn balance(federation_id: String, balance: fedimint_core::Amount) -> Self {
        Self::Balance(BalanceEvent {
            federation_id: RpcFederationId(federation_id),
            balance: RpcAmount(balance),
        })
    }
    pub fn recovery_complete(federation_id: String) -> Self {
        Self::RecoveryComplete(RecoveryCompleteEvent {
            federation_id: RpcFederationId(federation_id),
        })
    }

    pub fn spv2_deposit(
        federation_id: String,
        operation_id: fedimint_core::core::OperationId,
        state: StabilityPoolDepositOperationState,
    ) -> Self {
        Self::SPv2Deposit(SPv2DepositEvent {
            federation_id: RpcFederationId(federation_id),
            operation_id: RpcOperationId(operation_id),
            state: match state {
                StabilityPoolDepositOperationState::Initiated => SPv2DepositState::Initiated,
                StabilityPoolDepositOperationState::TxAccepted => SPv2DepositState::TxAccepted,
                StabilityPoolDepositOperationState::TxRejected(e) => {
                    SPv2DepositState::TxRejected(e)
                }
                StabilityPoolDepositOperationState::PrimaryOutputError(e) => {
                    SPv2DepositState::PrimaryOutputError(e)
                }
                StabilityPoolDepositOperationState::Success => SPv2DepositState::Success,
            },
        })
    }

    pub fn spv2_withdrawal(
        federation_id: String,
        operation_id: fedimint_core::core::OperationId,
        state: StabilityPoolWithdrawalOperationState,
    ) -> Self {
        Self::SPv2Withdrawal(SPv2WithdrawalEvent {
            federation_id: RpcFederationId(federation_id),
            operation_id: RpcOperationId(operation_id),
            state: match state {
                StabilityPoolWithdrawalOperationState::Initiated => SPv2WithdrawalState::Initiated,
                StabilityPoolWithdrawalOperationState::UnlockTxAccepted => {
                    SPv2WithdrawalState::UnlockTxAccepted
                }
                StabilityPoolWithdrawalOperationState::UnlockTxRejected(e) => {
                    SPv2WithdrawalState::UnlockTxRejected(e)
                }
                StabilityPoolWithdrawalOperationState::UnlockProcessingError(e) => {
                    SPv2WithdrawalState::UnlockProcessingError(e)
                }
                StabilityPoolWithdrawalOperationState::WithdrawalInitiated(amt) => {
                    SPv2WithdrawalState::WithdrawalInitiated(RpcAmount(amt))
                }
                StabilityPoolWithdrawalOperationState::WithdrawalTxAccepted(amt) => {
                    SPv2WithdrawalState::WithdrawalTxAccepted(RpcAmount(amt))
                }
                StabilityPoolWithdrawalOperationState::WithdrawalTxRejected(e) => {
                    SPv2WithdrawalState::WithdrawalTxRejected(e)
                }
                StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => {
                    SPv2WithdrawalState::PrimaryOutputError(e)
                }
                StabilityPoolWithdrawalOperationState::Success(amt) => {
                    SPv2WithdrawalState::Success(RpcAmount(amt))
                }
            },
        })
    }

    pub fn spv2_transfer(
        federation_id: String,
        operation_id: fedimint_core::core::OperationId,
        state: StabilityPoolTransferOperationState,
    ) -> Self {
        Self::SPv2Transfer(SPv2TransferEvent {
            federation_id: RpcFederationId(federation_id),
            operation_id: RpcOperationId(operation_id),
            state: match state {
                StabilityPoolTransferOperationState::Initiated => SPv2TransferState::Initiated,
                StabilityPoolTransferOperationState::Success => SPv2TransferState::Success,
                StabilityPoolTransferOperationState::TxRejected(e) => {
                    SPv2TransferState::TxRejected(e)
                }
            },
        })
    }

    pub fn stability_pool_deposit(
        federation_id: String,
        operation_id: fedimint_core::core::OperationId,
        state: stability_pool_client_old::StabilityPoolDepositOperationState,
    ) -> Self {
        Self::StabilityPoolDeposit(StabilityPoolDepositEvent {
            federation_id: RpcFederationId(federation_id),
            operation_id: RpcOperationId(operation_id),
            state: match state {
                stability_pool_client_old::StabilityPoolDepositOperationState::Initiated => {
                    StabilityPoolDepositState::Initiated
                }
                stability_pool_client_old::StabilityPoolDepositOperationState::TxAccepted => {
                    StabilityPoolDepositState::TxAccepted
                }
                stability_pool_client_old::StabilityPoolDepositOperationState::TxRejected(e) => {
                    StabilityPoolDepositState::TxRejected(e.to_string())
                }
                stability_pool_client_old::StabilityPoolDepositOperationState::PrimaryOutputError(
                    e,
                ) => StabilityPoolDepositState::PrimaryOutputError(e.to_string()),
                stability_pool_client_old::StabilityPoolDepositOperationState::Success => {
                    StabilityPoolDepositState::Success
                }
            },
        })
    }

    pub fn stability_pool_withdrawal(
        federation_id: String,
        operation_id: fedimint_core::core::OperationId,
        state: stability_pool_client_old::StabilityPoolWithdrawalOperationState,
    ) -> Self {
        Self::StabilityPoolWithdrawal(StabilityPoolWithdrawalEvent {
            federation_id: RpcFederationId(federation_id),
            operation_id: RpcOperationId(operation_id),
            state: match state {
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::InvalidOperationType => StabilityPoolWithdrawalState::InvalidOperationType,
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawUnlockedInitiated(_) => StabilityPoolWithdrawalState::WithdrawUnlockedInitiated,
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::TxRejected(e) => StabilityPoolWithdrawalState::TxRejected(e.to_string()),
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawUnlockedAccepted(_) => StabilityPoolWithdrawalState::WithdrawUnlockedAccepted,
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::PrimaryOutputError(e) => StabilityPoolWithdrawalState::PrimaryOutputError(e),
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::Success(_) => StabilityPoolWithdrawalState::Success,
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::CancellationSubmissionFailure(e) => StabilityPoolWithdrawalState::CancellationSubmissionFailure(e),
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::CancellationInitiated(_) => StabilityPoolWithdrawalState::CancellationInitiated,
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::CancellationAccepted(_) => StabilityPoolWithdrawalState::CancellationAccepted,
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::AwaitCycleTurnoverError(e) => StabilityPoolWithdrawalState::AwaitCycleTurnoverError(e),
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawIdleSubmissionFailure(e) => StabilityPoolWithdrawalState::WithdrawIdleSubmissionFailure(e),
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawIdleInitiated(_) => StabilityPoolWithdrawalState::WithdrawIdleInitiated,
                stability_pool_client_old::StabilityPoolWithdrawalOperationState::WithdrawIdleAccepted(_) => StabilityPoolWithdrawalState::WithdrawIdleAccepted,
            },
        })
    }

    pub fn device_registration(state: DeviceRegistrationState) -> Self {
        Self::DeviceRegistration(DeviceRegistrationEvent { state })
    }

    pub fn stability_pool_unfilled_deposit_swept(amount: RpcAmount) -> Self {
        Self::StabilityPoolUnfilledDepositSwept(StabilityPoolUnfilledDepositSweptEvent { amount })
    }

    pub fn community_metadata_updated(new_community: RpcCommunity) -> Self {
        Self::CommunityMetadataUpdated(CommunityMetadataUpdatedEvent { new_community })
    }

    pub fn nonce_reuse_check_failed(federation_id: RpcFederationId) -> Self {
        Self::NonceReuseCheckFailed(NonceReuseCheckFailedEvent { federation_id })
    }
}

/// Sends events to iOS / Android layer
pub trait IEventSink: MaybeSend + MaybeSync + 'static {
    /// Send event. Body is JSON-serialized
    fn event(&self, event_type: String, body: String);
    fn events(&self) -> Vec<(String, String)> {
        panic!("IEventSink.events() is only for testing")
    }
    fn num_events_of_type(&self, _event_type: String) -> usize {
        panic!("IEventSink.num_events_of_type() is only for testing")
    }
}

pub type EventSink = Arc<dyn IEventSink>;

pub trait TypedEventExt: IEventSink {
    fn observable_update<T: Serialize>(&self, update: ObservableUpdate<T>) {
        IEventSink::event(
            self,
            "observableUpdate".into(),
            serde_json::to_string(&update).expect("failed to json serialize"),
        );
    }

    fn typed_event(&self, event: &Event) {
        match event {
            Event::Log(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "log".into(), body);
            }
            Event::Transaction(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "transaction".into(), body);
            }
            Event::Federation(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "federation".into(), body);
            }
            Event::Balance(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "balance".into(), body);
            }
            Event::Panic(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "panic".into(), body);
            }
            Event::SPv2Deposit(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "spv2Deposit".into(), body);
            }
            Event::SPv2Withdrawal(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "spv2Withdrawal".into(), body);
            }
            Event::SPv2Transfer(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "spv2Transfer".into(), body);
            }
            Event::StabilityPoolDeposit(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "stabilityPoolDeposit".into(), body);
            }
            Event::StabilityPoolWithdrawal(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "stabilityPoolWithdrawal".into(), body);
            }
            Event::RecoveryComplete(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "recoveryComplete".into(), body);
            }
            Event::RecoveryProgress(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "recoveryProgress".into(), body);
            }
            Event::DeviceRegistration(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "deviceRegistration".into(), body);
            }
            Event::StabilityPoolUnfilledDepositSwept(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "stabilityPoolUnfilledDepositSwept".into(), body);
            }
            Event::CommunityMetadataUpdated(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "communityMetadataUpdated".into(), body);
            }
            Event::NonceReuseCheckFailed(event) => {
                let body = serde_json::to_string(&event).expect("failed to json serialize");
                IEventSink::event(self, "nonceReuseCheckFailed".into(), body);
            }
        };
    }
}

impl<T: IEventSink + ?Sized> TypedEventExt for T {}
