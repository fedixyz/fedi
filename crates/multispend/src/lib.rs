use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::str::FromStr;

use db::{
    MultispendChronologicalEventData, MultispendChronologicalEventKeyPrefix,
    MultispendDepositEventKey, MultispendGroupStatus, MultispendGroupStatusKey,
    MultispendInvalidEvent, MultispendInvitationKey, MultispendPendingApprovedWithdrawalRequestKey,
    MultispendWithdrawRequestKey, insert_multispend_chronological_event,
};
use fedimint_core::core::OperationId;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::invite_code::InviteCode;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send};
use futures::StreamExt as _;
use rpc_types::matrix::{RpcRoomId, RpcUserId};
use rpc_types::{
    RpcEventId, RpcFederationId, RpcFiatAmount, RpcPublicKey, RpcSignature, RpcTransactionId,
    SPv2TransferMetadata,
};
use serde::{Deserialize, Serialize};
use stability_pool_client::common::{
    Account, AccountId, AccountType, AccountUnchecked, SignedTransferRequest, SyncResponse,
    TransferRequest,
};
use tracing::{error, info};
use ts_rs::TS;

pub mod completion_notification_service;
pub mod db;
pub mod multispend_matrix;
pub mod rescanner;
pub mod services;
pub mod withdrawal_service;

pub const MULTISPEND_MSGTYPE: &str = "xyz.fedi.multispend";

#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, TS, Encodable, Decodable,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GroupInvitation {
    pub signers: BTreeSet<RpcUserId>,
    #[ts(type = "number")]
    pub threshold: u64,
    pub federation_invite_code: String,
    pub federation_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
pub enum MultispendGroupVoteType {
    Accept { member_pubkey: RpcPublicKey },
    Reject,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
pub enum WithdrawalResponseType {
    Approve {
        signature: RpcSignature,
    },
    Reject,
    Complete {
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
    },
    /// Just because a withdrawal request attained a threshold number of
    /// approvals doesn't meant that it will be accepted as a valid TX by the
    /// federation (for example, if requested withdrawal amount > group balance
    /// at time of transaction). This variant is to broadcast such TX
    /// rejections.
    TxRejected {
        error: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
/// JSON formatted event that is sent in matrix room.
pub enum MultispendEvent {
    GroupInvitation {
        invitation: GroupInvitation,
        proposer_pubkey: RpcPublicKey,
    },

    GroupInvitationVote {
        invitation: RpcEventId,
        vote: MultispendGroupVoteType,
    },

    GroupInvitationCancel {
        invitation: RpcEventId,
    },

    /// Reannouncement of group to newly invite members.
    GroupReannounce {
        invitation_id: RpcEventId,
        invitation: GroupInvitation,
        proposer: RpcUserId,
        pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
        rejections: BTreeSet<RpcUserId>,
    },

    DepositNotification {
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
        description: String,
    },

    WithdrawalRequest {
        #[ts(type = "{ transfer_amount: RpcFiatAmount }")]
        request: TransferRequest,
        description: String,
    },

    WithdrawalResponse {
        request: RpcEventId,
        response: WithdrawalResponseType,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// Group invitation with extra state accumlated over the events.
pub struct GroupInvitationWithKeys {
    pub invitation: GroupInvitation,
    pub proposer: RpcUserId,
    pub pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
    pub rejections: BTreeSet<RpcUserId>,
    pub federation_id: RpcFederationId,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FinalizedGroup {
    pub invitation: GroupInvitation,
    pub proposer: RpcUserId,
    pub pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
    #[ts(skip)]
    pub spv2_account: Account,
    pub federation_id: RpcFederationId,
}

impl GroupInvitationWithKeys {
    /// Create a new GroupInvitationWithKeys from a GroupInvitation and the
    /// proposer details
    pub fn new(
        invitation: GroupInvitation,
        proposer: RpcUserId,
        proposer_pubkey: RpcPublicKey,
        federation_id: RpcFederationId,
    ) -> Self {
        let mut pubkeys = BTreeMap::new();
        pubkeys.insert(proposer.clone(), proposer_pubkey);

        Self {
            invitation,
            proposer,
            pubkeys,
            rejections: BTreeSet::new(),
            federation_id,
        }
    }

    /// Process a vote from a user (either accept or reject)
    /// - Returns Ok(Some(finalized_group)) if all signers have accepted and the
    ///   group is finalized
    ///
    /// - Returns Ok(None) if the vote was processed but the account is not yet
    ///   finalized
    pub fn process_vote(
        &mut self,
        sender: RpcUserId,
        vote: MultispendGroupVoteType,
    ) -> Result<(), ProcessEventError> {
        if !self.invitation.signers.contains(&sender)
            || self.pubkeys.contains_key(&sender)
            || self.rejections.contains(&sender)
        {
            return Err(ProcessEventError::InvalidMessage);
        }

        match vote {
            MultispendGroupVoteType::Accept { member_pubkey } => {
                self.pubkeys.insert(sender, member_pubkey);
            }
            MultispendGroupVoteType::Reject => {
                self.rejections.insert(sender);
            }
        }
        Ok(())
    }

    pub fn to_finalized(&self) -> Option<FinalizedGroup> {
        if self.pubkeys.len() == self.invitation.signers.len() {
            let account = AccountUnchecked {
                acc_type: AccountType::Seeker,
                pub_keys: self.pubkeys.values().cloned().map(|pk| pk.0).collect(),
                threshold: self.invitation.threshold,
            };

            if let Ok(spv2_account) = account.try_into() {
                return Some(FinalizedGroup {
                    proposer: self.proposer.clone(),
                    invitation: self.invitation.clone(),
                    pubkeys: self.pubkeys.clone(),
                    spv2_account,
                    federation_id: self.federation_id.clone(),
                });
            }
        }
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// Withdrawal request with extra data accumulated over events.
pub struct WithdrawRequestWithApprovals {
    #[ts(type = "{ transfer_amount: RpcFiatAmount }")]
    pub request: TransferRequest,
    pub description: String,
    pub signatures: BTreeMap<RpcUserId, RpcSignature>,
    pub rejections: BTreeSet<RpcUserId>,
    pub tx_submission_status: WithdrawTxSubmissionStatus,
    pub sender: RpcUserId,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum WithdrawTxSubmissionStatus {
    Unknown,
    Accepted { txid: RpcTransactionId },
    Rejected { error: String },
}

impl WithdrawRequestWithApprovals {
    /// Create a new WithdrawRequestWithApprovals
    pub fn new(request: TransferRequest, description: String, sender: RpcUserId) -> Self {
        Self {
            request,
            description,
            signatures: BTreeMap::new(),
            rejections: BTreeSet::new(),
            tx_submission_status: WithdrawTxSubmissionStatus::Unknown,
            sender,
        }
    }

    fn check_can_vote(
        &self,
        sender: &RpcUserId,
        finalized_group: &FinalizedGroup,
    ) -> Result<(), ProcessEventError> {
        // Verify sender is in the finalized group's signers list
        if !finalized_group.invitation.signers.contains(sender) {
            return Err(ProcessEventError::InvalidMessage);
        }

        // Check for duplicate votes
        if self.signatures.contains_key(sender) || self.rejections.contains(sender) {
            return Err(ProcessEventError::InvalidMessage);
        }
        Ok(())
    }

    /// Process a withdrawal response (approve, reject, or complete)
    fn process_response(
        &mut self,
        sender: RpcUserId,
        response: WithdrawalResponseType,
        finalized_group: &FinalizedGroup,
    ) -> Result<WithdrawalProcessResponseOutcome, ProcessEventError> {
        let outcome = match response {
            WithdrawalResponseType::Approve { signature } => {
                self.check_can_vote(&sender, finalized_group)?;
                self.signatures.insert(sender, signature);
                match u64::try_from(self.signatures.len())
                    .unwrap_or(u64::MAX)
                    .cmp(&finalized_group.invitation.threshold)
                {
                    Ordering::Less => WithdrawalProcessResponseOutcome::NeedsMoreApproval,
                    Ordering::Equal => WithdrawalProcessResponseOutcome::Approved,
                    Ordering::Greater => WithdrawalProcessResponseOutcome::ExtraApproval,
                }
            }
            WithdrawalResponseType::Reject => {
                self.check_can_vote(&sender, finalized_group)?;
                self.rejections.insert(sender);
                WithdrawalProcessResponseOutcome::Rejection
            }
            WithdrawalResponseType::Complete {
                fiat_amount: _,
                txid,
            } => {
                // only original sender can send completion mention
                if self.sender != sender {
                    return Err(ProcessEventError::InvalidMessage);
                }

                // current Tx submission status must be unknown
                if !matches!(
                    self.tx_submission_status,
                    WithdrawTxSubmissionStatus::Unknown
                ) {
                    return Err(ProcessEventError::InvalidMessage);
                }

                self.tx_submission_status = WithdrawTxSubmissionStatus::Accepted { txid };
                WithdrawalProcessResponseOutcome::Completed
            }
            WithdrawalResponseType::TxRejected { error } => {
                // only original sender can send Tx rejection message
                if self.sender != sender {
                    return Err(ProcessEventError::InvalidMessage);
                }

                // current Tx submission status must be unknown
                if !matches!(
                    self.tx_submission_status,
                    WithdrawTxSubmissionStatus::Unknown
                ) {
                    return Err(ProcessEventError::InvalidMessage);
                }

                self.tx_submission_status = WithdrawTxSubmissionStatus::Rejected { error };
                WithdrawalProcessResponseOutcome::TxRejected
            }
        };
        Ok(outcome)
    }
}

enum WithdrawalProcessResponseOutcome {
    /// More Approval are need.
    NeedsMoreApproval,
    /// Final Approval to reach threshold.
    Approved,
    /// Approval even after threshold.
    ExtraApproval,
    Rejection,
    /// The transaction completed
    Completed,
    /// Federation rejected the transaction
    TxRejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// Deposit notification saved to db.
pub struct MultispendDepositEventData {
    pub user: RpcUserId,
    pub fiat_amount: RpcFiatAmount,
    pub txid: RpcTransactionId,
    pub description: String,
}

/// Collected details for a given event id.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MsEventData {
    WithdrawalRequest(WithdrawRequestWithApprovals),
    GroupInvitation(GroupInvitationWithKeys),
    DepositNotification(MultispendDepositEventData),
    InvalidEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MultispendListedEvent {
    #[ts(type = "number")]
    pub counter: u64,
    #[ts(type = "number")]
    pub time: u64,
    pub event: MsEventData,
    pub event_id: RpcEventId,
}

// Trait abstraction for federation operations needed by multispend
#[apply(async_trait_maybe_send!)]
pub trait FederationProvider: MaybeSend + MaybeSync {
    async fn spv2_transfer(
        &self,
        federation_id: &str,
        signed_request: SignedTransferRequest,
        meta: SPv2TransferMetadata,
    ) -> anyhow::Result<OperationId>;

    async fn multispend_group_sync_info(
        &self,
        federation_id: &str,
        account_id: AccountId,
    ) -> anyhow::Result<SyncResponse>;
}

pub struct MultispendContext {
    pub check_pending_approved_withdrawal_requests: bool,
    pub our_id: RpcUserId,
    pub refresh_account_info: bool,
}

/// Process one event from matrix and persist it to database.
pub async fn process_event_db(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    sender: RpcUserId,
    event_id: RpcEventId,
    event: MultispendEvent,
    event_time: u64,
    context: &mut MultispendContext,
) {
    info!(event_id = %event_id.0, "processing multispend event");
    if let Err(err) = process_event_db_raw(
        dbtx,
        room_id,
        sender.clone(),
        event_id.clone(),
        event.clone(),
        event_time,
        context,
    )
    .await
    {
        let ProcessEventError::InvalidMessage = err;
        // logging the entire event, this might be privacy leaking when you share
        // the logs.
        error!(?sender, ?event_id, ?event, "Invalid multispend event");
        dbtx.insert_new_entry(&MultispendInvalidEvent(event_id), &())
            .await;
    }
}

pub async fn process_event_db_raw(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    sender: RpcUserId,
    event_id: RpcEventId,
    event: MultispendEvent,
    event_time: u64,
    context: &mut MultispendContext,
) -> Result<(), ProcessEventError> {
    match event {
        MultispendEvent::GroupInvitation {
            invitation,
            proposer_pubkey,
        } => {
            let status_key = MultispendGroupStatusKey(room_id.clone());
            // already finalized
            if let Some(MultispendGroupStatus::Finalized { .. }) = dbtx.get_value(&status_key).await
            {
                return Err(ProcessEventError::InvalidMessage);
            }

            let invite_code = InviteCode::from_str(&invitation.federation_invite_code)
                .map_err(|_| ProcessEventError::InvalidMessage)?;
            dbtx.insert_new_entry(
                &MultispendInvitationKey(room_id.clone(), event_id.clone()),
                &GroupInvitationWithKeys::new(
                    invitation,
                    sender,
                    proposer_pubkey,
                    RpcFederationId(invite_code.federation_id().to_string()),
                ),
            )
            .await;
            dbtx.insert_entry(
                &status_key,
                &MultispendGroupStatus::ActiveInvitation {
                    active_invite_id: event_id.clone(),
                },
            )
            .await;
        }

        MultispendEvent::GroupReannounce {
            invitation_id,
            invitation,
            proposer,
            pubkeys,
            rejections,
        } => {
            let status_key = MultispendGroupStatusKey(room_id.clone());
            let invitation_key = MultispendInvitationKey(room_id.clone(), invitation_id.clone());
            // only processed if you have no state
            if dbtx.get_value(&status_key).await.is_some()
                || dbtx.get_value(&invitation_key).await.is_some()
            {
                return Ok(());
            }
            let invite_code = InviteCode::from_str(&invitation.federation_invite_code)
                .map_err(|_| ProcessEventError::InvalidMessage)?;
            let invitation_state = GroupInvitationWithKeys {
                invitation,
                proposer,
                pubkeys,
                rejections,
                federation_id: RpcFederationId(invite_code.federation_id().to_string()),
            };
            dbtx.insert_new_entry(&invitation_key, &invitation_state)
                .await;
            if let Some(finalized_group) = invitation_state.to_finalized() {
                dbtx.insert_new_entry(
                    &status_key,
                    &MultispendGroupStatus::Finalized {
                        invite_event_id: invitation_id,
                        finalized_group,
                    },
                )
                .await;
            } else {
                dbtx.insert_new_entry(
                    &status_key,
                    &MultispendGroupStatus::ActiveInvitation {
                        active_invite_id: invitation_id,
                    },
                )
                .await;
            }
        }
        MultispendEvent::GroupInvitationVote { invitation, vote } => {
            let status_key = MultispendGroupStatusKey(room_id.clone());

            // this is not the active invite
            if !matches!(
                dbtx.get_value(&status_key).await,
                Some(MultispendGroupStatus::ActiveInvitation {
                    active_invite_id,
                }) if invitation == active_invite_id
            ) {
                return Err(ProcessEventError::InvalidMessage);
            }

            let key = MultispendInvitationKey(room_id.clone(), invitation.clone());
            let mut state: GroupInvitationWithKeys = dbtx
                .get_value(&key)
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;
            state.process_vote(sender, vote)?;
            if let Some(finalized_group) = state.to_finalized() {
                dbtx.insert_entry(
                    &status_key,
                    &MultispendGroupStatus::Finalized {
                        invite_event_id: invitation,
                        finalized_group,
                    },
                )
                .await;
            }
            dbtx.insert_entry(&key, &state).await;
        }
        MultispendEvent::GroupInvitationCancel { invitation } => {
            let status_key = MultispendGroupStatusKey(room_id.clone());
            // there is no active invite
            if !matches!(
                dbtx.get_value(&status_key).await,
                Some(MultispendGroupStatus::ActiveInvitation {
                    active_invite_id
                }) if invitation == active_invite_id
            ) {
                return Err(ProcessEventError::InvalidMessage);
            }
            dbtx.remove_entry(&status_key).await;
        }

        MultispendEvent::WithdrawalRequest {
            request,
            description,
        } => {
            get_finalized_group_db(dbtx, room_id)
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;
            let key = MultispendWithdrawRequestKey {
                room_id: room_id.clone(),
                withdraw_request_event_id: event_id.clone(),
            };

            let new_state = WithdrawRequestWithApprovals::new(request, description, sender);
            dbtx.insert_new_entry(&key, &new_state).await;
            insert_multispend_chronological_event(dbtx, room_id, &event_id, event_time).await;
        }

        MultispendEvent::WithdrawalResponse { request, response } => {
            let finalized_group = get_finalized_group_db(dbtx, &room_id.clone())
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;

            let key = MultispendWithdrawRequestKey {
                room_id: room_id.clone(),
                withdraw_request_event_id: request.clone(),
            };

            let mut state = dbtx
                .get_value(&key)
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;
            match state.process_response(sender, response.clone(), &finalized_group)? {
                WithdrawalProcessResponseOutcome::Approved if context.our_id == state.sender => {
                    context.check_pending_approved_withdrawal_requests = true;
                    let signatures = state
                        .signatures
                        .iter()
                        .map(|(user_id, signature)| {
                            let user_pub_key = finalized_group.pubkeys.get(user_id).expect(
                                "must be validated by WithdrawalRequestWithApprovals::can_vote",
                            );
                            let key_index = finalized_group
                                .spv2_account
                                .pub_keys()
                                .position(|pub_key| &user_pub_key.0 == pub_key)
                                .expect("invariant of finalized group");
                            (u64::try_from(key_index).expect("must fit"), signature.0)
                        })
                        .collect();
                    dbtx.insert_entry(
                        &MultispendPendingApprovedWithdrawalRequestKey {
                            room_id: room_id.clone(),
                            request_event_id: request,
                            transfer_request: SignedTransferRequest::new(
                                state.request.clone(),
                                signatures,
                            )
                            .unwrap(),
                            federation_id: finalized_group.federation_id.clone(),
                        },
                        &(),
                    )
                    .await;
                }
                WithdrawalProcessResponseOutcome::Completed => {
                    context.refresh_account_info = true;
                }
                _ => {}
            }
            dbtx.insert_entry(&key, &state).await;
        }

        MultispendEvent::DepositNotification {
            fiat_amount,
            txid,
            description,
        } => {
            context.refresh_account_info = true;
            get_finalized_group_db(dbtx, room_id)
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;
            let key = MultispendDepositEventKey {
                room_id: room_id.clone(),
                deposit_event_id: event_id.clone(),
            };
            let new_state = MultispendDepositEventData {
                user: sender.clone(),
                fiat_amount,
                txid,
                description,
            };
            dbtx.insert_new_entry(&key, &new_state).await;
            insert_multispend_chronological_event(dbtx, room_id, &event_id, event_time).await;
        }
    }
    Ok(())
}

/// Get all accumulated data for an event id.
pub async fn get_event_data_db(
    tx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    event_id: &RpcEventId,
) -> Option<MsEventData> {
    let invite_key = MultispendInvitationKey(room_id.clone(), event_id.clone());
    if let Some(invite) = tx.get_value(&invite_key).await {
        return Some(MsEventData::GroupInvitation(invite));
    }

    let deposit_key = MultispendDepositEventKey {
        room_id: room_id.clone(),
        deposit_event_id: event_id.clone(),
    };
    if let Some(deposit) = tx.get_value(&deposit_key).await {
        return Some(MsEventData::DepositNotification(deposit));
    }

    let withdraw_key = MultispendWithdrawRequestKey {
        room_id: room_id.clone(),
        withdraw_request_event_id: event_id.clone(),
    };
    if let Some(withdraw) = tx.get_value(&withdraw_key).await {
        return Some(MsEventData::WithdrawalRequest(withdraw));
    }

    if is_invalid_event(tx, event_id.clone()).await {
        return Some(MsEventData::InvalidEvent);
    }

    None
}

pub async fn is_invalid_event(tx: &mut DatabaseTransaction<'_>, event_id: RpcEventId) -> bool {
    tx.get_value(&MultispendInvalidEvent(event_id.clone()))
        .await
        .is_some()
}

pub async fn get_group_status_db(
    tx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
) -> Option<MultispendGroupStatus> {
    let key = MultispendGroupStatusKey(room_id.clone());
    tx.get_value(&key).await
}

pub async fn get_finalized_group_db(
    tx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
) -> Option<FinalizedGroup> {
    if let Some(MultispendGroupStatus::Finalized {
        finalized_group, ..
    }) = get_group_status_db(tx, room_id).await
    {
        Some(finalized_group)
    } else {
        None
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ProcessEventError {
    #[error("Invalid message")]
    InvalidMessage,
}

/// Paginate multispend events for a room using the event counter.
pub async fn list_multispend_events(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    start_after: Option<u64>,
    limit: usize,
) -> Vec<MultispendListedEvent> {
    let events: Vec<(u64, MultispendChronologicalEventData)> = dbtx
        .find_by_prefix_sorted_descending(&MultispendChronologicalEventKeyPrefix {
            room_id: room_id.clone(),
        })
        .await
        .skip_while(|(key, _)| {
            let skip = if let Some(threshold) = start_after {
                key.counter >= threshold
            } else {
                false
            };
            std::future::ready(skip)
        })
        .map(|(key, data)| (key.counter, data))
        .take(limit)
        .collect()
        .await;

    let mut result = Vec::new();
    for (counter, event_data) in events {
        if let Some(ms_event) = get_event_data_db(dbtx, room_id, &event_data.event_id).await {
            result.push(MultispendListedEvent {
                counter,
                time: event_data.event_time,
                event: ms_event,
                event_id: event_data.event_id,
            });
        } else {
            error!("inconsistent database");
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use bitcoin::secp256k1;
    use fedimint_core::db::Database;
    use fedimint_core::db::mem_impl::MemDatabase;
    use fedimint_core::module::registry::ModuleDecoderRegistry;

    use super::*;

    fn gen_test_pubkey() -> RpcPublicKey {
        let (_, pk) = secp256k1::SECP256K1.generate_keypair(&mut rand::thread_rng());
        RpcPublicKey(pk)
    }

    #[tokio::test]
    async fn test_group_invitation() {
        let mem_db = MemDatabase::new();
        let module_decoders = ModuleDecoderRegistry::default();
        let db = Database::new(mem_db, module_decoders);
        let mut tx = db.begin_transaction().await;
        let room_id = RpcRoomId("test_room".to_string());
        let user1 = RpcUserId("@alice:example.com".to_string());
        let user2 = RpcUserId("@bob:example.com".to_string());
        let event1_id = RpcEventId("$CD66HAED5npg6074c6pDtLKalHjVfYb2q4Q3LZgrW6o".to_string());
        let event2_id = RpcEventId("$CE66HAED5npg6074c6pDtLKalHjVfYb2q4Q3LZgrW6o".to_string());
        let event3_id = RpcEventId("$CF66HAED5npg6074c6pDtLKalHjVfYb2q4Q3LZgrW6o".to_string());
        let mut context = MultispendContext {
            our_id: user1.clone(),
            check_pending_approved_withdrawal_requests: false,
            refresh_account_info: false,
        };

        let invitation = GroupInvitation {
            signers: BTreeSet::from([user1.clone(), user2.clone()]),
            threshold: 2,
            federation_invite_code: "fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75".to_string(),
            federation_name: "test".to_string(),
        };

        let pk1 = gen_test_pubkey();
        let pk2 = gen_test_pubkey();

        // Send invitation
        let event = MultispendEvent::GroupInvitation {
            invitation: invitation.clone(),
            proposer_pubkey: pk1,
        };
        assert!(
            process_event_db_raw(
                &mut tx.to_ref_nc(),
                &room_id,
                user1.clone(),
                event1_id.clone(),
                event,
                1,
                &mut context,
            )
            .await
            .is_ok()
        );

        // Accept invitation
        let event = MultispendEvent::GroupInvitationVote {
            invitation: event1_id.clone(),
            vote: MultispendGroupVoteType::Accept { member_pubkey: pk2 },
        };
        assert!(
            process_event_db_raw(
                &mut tx.to_ref_nc(),
                &room_id,
                user2.clone(),
                event2_id.clone(),
                event,
                2,
                &mut context,
            )
            .await
            .is_ok()
        );

        // Try to send another invitation after finalization (should fail)
        let event = MultispendEvent::GroupInvitation {
            invitation: invitation.clone(),
            proposer_pubkey: pk1,
        };
        assert!(matches!(
            process_event_db_raw(
                &mut tx.to_ref_nc(),
                &room_id,
                user1.clone(),
                event3_id.clone(),
                event,
                3,
                &mut context,
            )
            .await,
            Err(ProcessEventError::InvalidMessage)
        ));

        // Verify the data through get_event_data_db.
        if let Some(MsEventData::GroupInvitation(invite)) =
            get_event_data_db(&mut tx.to_ref_nc(), &room_id, &event1_id).await
        {
            assert_eq!(invite.invitation, invitation);
            let pubkeys: BTreeSet<_> = invite.pubkeys.values().cloned().collect();
            let expected: BTreeSet<_> = BTreeSet::from_iter([pk1, pk2]);
            assert_eq!(pubkeys, expected);
        } else {
            panic!("Expected to find group invitation data");
        };
    }
}
