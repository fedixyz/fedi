// Fedi's WASM runtime is single-threaded; retain `Arc` to keep shared
// native/WASM APIs uniform.
#![cfg_attr(target_family = "wasm", allow(clippy::arc_with_non_send_sync))]

use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::str::FromStr;

use db::{
    MultispendChronologicalEventData, MultispendChronologicalEventKeyPrefix,
    MultispendDepositEventKey, MultispendGroupStatus, MultispendGroupStatusKey,
    MultispendInvalidEvent, MultispendInvitationKey, MultispendPendingApprovedWithdrawalRequestKey,
    MultispendPendingApprovedWithdrawalRequestKeyRequestPrefix, MultispendWithdrawRequestKey,
    insert_multispend_chronological_event,
};
use fedimint_core::core::OperationId;
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped};
use fedimint_core::encoding::{Decodable, Encodable};
use fedimint_core::invite_code::InviteCode;
use fedimint_core::task::{MaybeSend, MaybeSync};
use fedimint_core::{apply, async_trait_maybe_send};
use futures::StreamExt as _;
use rpc_types::matrix::{RpcRoomId, RpcUserId};
pub use rpc_types::multispend::{
    BTC_MULTISPEND_MSGTYPE, GroupInvitation, MULTISPEND_MSGTYPE, MsEvent, MultispendAmount,
    MultispendGroupKind, MultispendGroupVoteType, MultispendTransferRequest,
    SignedMultispendTransferRequest, WithdrawalResponseType,
};
use rpc_types::{
    RpcEventId, RpcFederationId, RpcPublicKey, RpcSignature, RpcTransactionId, SPv2TransferMetadata,
};
use serde::{Deserialize, Serialize};
use stability_pool_client::common::{
    Account, AccountId, AccountType, AccountUnchecked, FiatAmount, SyncResponse,
};
use tracing::{error, info};
use ts_rs::TS;

pub mod completion_notification_service;
pub mod db;
pub mod migration;
pub mod multispend_matrix;
pub mod rescanner;
pub mod services;
pub mod withdrawal_service;

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// Group invitation with extra state accumlated over the events.
pub struct GroupInvitationWithKeys {
    pub invitation: GroupInvitation,
    pub kind: MultispendGroupKind,
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
    pub kind: MultispendGroupKind,
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
        kind: MultispendGroupKind,
        proposer: RpcUserId,
        proposer_pubkey: RpcPublicKey,
        federation_id: RpcFederationId,
    ) -> Self {
        let mut pubkeys = BTreeMap::new();
        pubkeys.insert(proposer.clone(), proposer_pubkey);

        Self {
            invitation,
            kind,
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
                acc_type: self.kind.account_type(),
                pub_keys: self.pubkeys.values().cloned().map(|pk| pk.0).collect(),
                threshold: self.invitation.threshold,
            };

            if let Ok(spv2_account) = account.try_into() {
                return Some(FinalizedGroup {
                    proposer: self.proposer.clone(),
                    invitation: self.invitation.clone(),
                    kind: self.kind,
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
    #[ts(
        type = "{ kind: \"fiat\"; transfer_amount: RpcFiatAmount } | { kind: \"btc\"; transfer_amount: RpcAmount }"
    )]
    pub request: MultispendTransferRequest,
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
    pub fn new(request: MultispendTransferRequest, description: String, sender: RpcUserId) -> Self {
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
                let member_key = finalized_group
                    .pubkeys
                    .get(&sender)
                    .ok_or(ProcessEventError::InvalidMessage)?
                    .0
                    .x_only_public_key()
                    .0;
                signature
                    .0
                    .verify(
                        &bitcoin::secp256k1::Message::from(&self.request.id()),
                        &member_key,
                    )
                    .map_err(|_| ProcessEventError::InvalidMessage)?;
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
            WithdrawalResponseType::Complete { amount: _, txid } => {
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
    /// `fiatAmount` or `btcAmount`, as before bitcoin groups for fiat.
    #[serde(flatten)]
    pub amount: MultispendAmount,
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
        signed_request: SignedMultispendTransferRequest,
        meta: SPv2TransferMetadata,
    ) -> anyhow::Result<OperationId>;

    async fn multispend_group_sync_info(
        &self,
        federation_id: &str,
        account_id: AccountId,
    ) -> anyhow::Result<SyncResponse>;

    /// A bitcoin withdrawal paying `to` completed, whichever device submitted
    /// it; sweep the payout account if `to` is ours.
    fn multispend_btc_payout_received(&self, federation_id: &str, to: &AccountId);

    /// Whether `to` is an account of this device that a withdrawal pays: its
    /// seeker account or its bitcoin payout account. Those keys differ per
    /// device index, so this tells apart devices of the same Matrix user.
    fn is_own_withdrawal_destination(
        &self,
        federation_id: &str,
        to: &AccountId,
    ) -> anyhow::Result<bool>;
}

pub struct MultispendContext {
    pub check_pending_approved_withdrawal_requests: bool,
    pub our_id: RpcUserId,
    pub refresh_account_info: bool,
    /// Recipients of the bitcoin withdrawals completed by these events.
    pub btc_payouts: Vec<(RpcFederationId, AccountId)>,
}

/// Process one event from matrix and persist it to database.
pub async fn process_event_db(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    sender: RpcUserId,
    event_id: RpcEventId,
    event: MsEvent,
    event_time: u64,
    context: &mut MultispendContext,
) {
    info!("processing multispend event");
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
        error!("Invalid multispend event");
        dbtx.insert_new_entry(&MultispendInvalidEvent(event_id), &())
            .await;
    }
}

pub async fn process_event_db_raw(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    sender: RpcUserId,
    event_id: RpcEventId,
    event: MsEvent,
    event_time: u64,
    context: &mut MultispendContext,
) -> Result<(), ProcessEventError> {
    // a room holds one group per kind, and the msgtype of an event selects
    // the group it belongs to
    let kind = event.group_kind();
    let status_key = MultispendGroupStatusKey(room_id.clone(), kind);
    match event {
        MsEvent::GroupInvitation {
            group_kind,
            invitation,
            proposer_pubkey,
        } => {
            // already finalized
            if let Some(MultispendGroupStatus::Finalized { .. }) = dbtx.get_value(&status_key).await
            {
                return Err(ProcessEventError::InvalidMessage);
            }

            let invite_code = InviteCode::from_str(&invitation.federation_invite_code)
                .map_err(|_| ProcessEventError::InvalidMessage)?;
            dbtx.insert_new_entry(
                &MultispendInvitationKey(room_id.clone(), kind, event_id.clone()),
                &GroupInvitationWithKeys::new(
                    invitation,
                    group_kind,
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

        MsEvent::GroupReannounce {
            group_kind,
            invitation_id,
            invitation,
            proposer,
            pubkeys,
            rejections,
        } => {
            let invitation_key =
                MultispendInvitationKey(room_id.clone(), kind, invitation_id.clone());
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
                kind: group_kind,
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
        MsEvent::GroupInvitationVote {
            invitation, vote, ..
        } => {
            // this is not the active invite
            if !matches!(
                dbtx.get_value(&status_key).await,
                Some(MultispendGroupStatus::ActiveInvitation {
                    active_invite_id,
                }) if invitation == active_invite_id
            ) {
                return Err(ProcessEventError::InvalidMessage);
            }

            let key = MultispendInvitationKey(room_id.clone(), kind, invitation.clone());
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
        MsEvent::GroupInvitationCancel { invitation, .. } => {
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

        MsEvent::WithdrawalRequest {
            request,
            description,
        } => {
            let finalized_group = get_finalized_group_db(dbtx, room_id, kind)
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;
            if !is_valid_withdrawal_request(&finalized_group, &request) {
                return Err(ProcessEventError::InvalidMessage);
            }
            let key = MultispendWithdrawRequestKey {
                room_id: room_id.clone(),
                withdraw_request_event_id: event_id.clone(),
            };

            let new_state = WithdrawRequestWithApprovals::new(request, description, sender);
            dbtx.insert_new_entry(&key, &new_state).await;
            insert_multispend_chronological_event(dbtx, room_id, kind, &event_id, event_time).await;
        }

        MsEvent::WithdrawalResponse {
            request, response, ..
        } => {
            let finalized_group = get_finalized_group_db(dbtx, room_id, kind)
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;

            let key = MultispendWithdrawRequestKey {
                room_id: room_id.clone(),
                withdraw_request_event_id: request.clone(),
            };

            let mut state = dbtx
                .get_value(&key)
                .await
                .filter(|state| state.request.kind() == kind)
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
                            transfer_request: SignedMultispendTransferRequest::new(
                                state.request.clone(),
                                signatures,
                            )
                            .map_err(|_| ProcessEventError::InvalidMessage)?,
                            federation_id: finalized_group.federation_id.clone(),
                        },
                        &(),
                    )
                    .await;
                }
                outcome @ (WithdrawalProcessResponseOutcome::Completed
                | WithdrawalProcessResponseOutcome::TxRejected) => {
                    if matches!(outcome, WithdrawalProcessResponseOutcome::Completed) {
                        context.refresh_account_info = true;
                        if let MultispendTransferRequest::Btc(request) = &state.request {
                            context
                                .btc_payouts
                                .push((finalized_group.federation_id.clone(), *request.to()));
                        }
                    }
                    // A rescan from scratch replays the approval before this response,
                    // so drop the submission it queued.
                    dbtx.remove_by_prefix(
                        &MultispendPendingApprovedWithdrawalRequestKeyRequestPrefix {
                            room_id: room_id.clone(),
                            request_event_id: request,
                        },
                    )
                    .await;
                }
                _ => {}
            }
            dbtx.insert_entry(&key, &state).await;
        }

        MsEvent::DepositNotification {
            amount,
            txid,
            description,
        } => {
            context.refresh_account_info = true;
            get_finalized_group_db(dbtx, room_id, kind)
                .await
                .ok_or(ProcessEventError::InvalidMessage)?;
            let key = MultispendDepositEventKey {
                room_id: room_id.clone(),
                deposit_event_id: event_id.clone(),
            };
            let new_state = MultispendDepositEventData {
                user: sender.clone(),
                amount,
                txid,
                description,
            };
            dbtx.insert_new_entry(&key, &new_state).await;
            insert_multispend_chronological_event(dbtx, room_id, kind, &event_id, event_time).await;
        }
    }
    Ok(())
}

/// Matrix events are untrusted, so members only see requests that move some
/// funds out of the group account into another account. Any room member may
/// request a withdrawal. A bitcoin request must pay a btc-depositor account.
fn is_valid_withdrawal_request(
    finalized_group: &FinalizedGroup,
    request: &MultispendTransferRequest,
) -> bool {
    request.from() == &finalized_group.spv2_account
        && *request.to() != finalized_group.spv2_account.id()
        && match request {
            MultispendTransferRequest::Fiat(request) => request.amount() != FiatAmount(0),
            MultispendTransferRequest::Btc(request) => {
                request.to().acc_type() == AccountType::BtcDepositor
                    && request.amount() != fedimint_core::Amount::ZERO
            }
        }
}

/// Get all accumulated data for an event id.
pub async fn get_event_data_db(
    tx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    event_id: &RpcEventId,
) -> Option<MsEventData> {
    // only a reannouncement can put invitations of both kinds under one id,
    // and older clients show the fiat one
    for kind in [MultispendGroupKind::Fiat, MultispendGroupKind::Btc] {
        let invite_key = MultispendInvitationKey(room_id.clone(), kind, event_id.clone());
        if let Some(invite) = tx.get_value(&invite_key).await {
            return Some(MsEventData::GroupInvitation(invite));
        }
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
    kind: MultispendGroupKind,
) -> Option<MultispendGroupStatus> {
    tx.get_value(&MultispendGroupStatusKey(room_id.clone(), kind))
        .await
}

pub async fn get_finalized_group_db(
    tx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    kind: MultispendGroupKind,
) -> Option<FinalizedGroup> {
    if let Some(MultispendGroupStatus::Finalized {
        finalized_group, ..
    }) = get_group_status_db(tx, room_id, kind).await
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

/// Paginate the events of the `kind` group of a room using the event counter.
pub async fn list_multispend_events(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    kind: MultispendGroupKind,
    start_after: Option<u64>,
    limit: usize,
) -> Vec<MultispendListedEvent> {
    let events: Vec<(u64, MultispendChronologicalEventData)> = dbtx
        .find_by_prefix_sorted_descending(&MultispendChronologicalEventKeyPrefix {
            room_id: room_id.clone(),
            kind,
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

    use assert_matches::assert_matches;
    use bitcoin::secp256k1;
    use fedimint_core::db::Database;
    use fedimint_core::db::mem_impl::MemDatabase;
    use fedimint_core::module::registry::ModuleDecoderRegistry;
    use rpc_types::RpcFiatAmount;
    use stability_pool_client::common::{FiatAmount, TransferRequest, TransferRequestId};

    use super::*;
    use crate::db::{
        MultispendPendingApprovedWithdrawalRequestKey,
        MultispendPendingApprovedWithdrawalRequestKeyPrefix,
    };

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
            btc_payouts: Vec::new(),
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
        let event = MsEvent::GroupInvitation {
            group_kind: MultispendGroupKind::Fiat,
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
        let event = MsEvent::GroupInvitationVote {
            group_kind: MultispendGroupKind::Fiat,
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
        let event = MsEvent::GroupInvitation {
            group_kind: MultispendGroupKind::Fiat,
            invitation: invitation.clone(),
            proposer_pubkey: pk1,
        };
        assert_matches!(
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
        );

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

    #[tokio::test]
    async fn test_rescan_does_not_requeue_settled_withdrawals() {
        let user1 = RpcUserId("@alice:example.com".to_string());
        let user2 = RpcUserId("@bob:example.com".to_string());
        let room_id = RpcRoomId("test_room".to_string());
        let invitation_id = RpcEventId("$invitation".to_string());
        let request_id = RpcEventId("$withdrawal".to_string());
        let keys = [1, 2].map(|byte| {
            secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, &[byte; 32]).unwrap()
        });
        let invitation = GroupInvitation {
            signers: BTreeSet::from([user1.clone(), user2.clone()]),
            threshold: 2,
            federation_invite_code: "fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75".to_string(),
            federation_name: "test".to_string(),
        };
        let account: Account = AccountUnchecked {
            acc_type: AccountType::Seeker,
            pub_keys: keys.iter().map(|key| key.public_key()).collect(),
            threshold: 2,
        }
        .try_into()
        .unwrap();
        let recipient: Account = AccountUnchecked {
            acc_type: AccountType::Seeker,
            pub_keys: BTreeSet::from([keys[0].public_key()]),
            threshold: 1,
        }
        .try_into()
        .unwrap();
        let request = TransferRequest::new(
            1,
            account,
            FiatAmount(100),
            recipient.id(),
            vec![],
            u64::MAX,
            None,
        )
        .unwrap();
        let message = secp256k1::Message::from(&TransferRequestId::from(&request));
        let mut queue_counts = Vec::new();
        for terminal_response in [
            None,
            Some(WithdrawalResponseType::Complete {
                amount: MultispendAmount::FiatAmount(RpcFiatAmount(100)),
                txid: RpcTransactionId(
                    "0000000000000000000000000000000000000000000000000000000000000001"
                        .parse()
                        .unwrap(),
                ),
            }),
            Some(WithdrawalResponseType::TxRejected {
                error: "transfer rejected".to_string(),
            }),
        ] {
            let db = Database::new(MemDatabase::new(), ModuleDecoderRegistry::default());
            let mut tx = db.begin_transaction().await;
            let mut context = MultispendContext {
                our_id: user1.clone(),
                check_pending_approved_withdrawal_requests: false,
                refresh_account_info: false,
                btc_payouts: Vec::new(),
            };
            let mut events = vec![
                (
                    user1.clone(),
                    invitation_id.clone(),
                    MsEvent::GroupInvitation {
                        group_kind: MultispendGroupKind::Fiat,
                        invitation: invitation.clone(),
                        proposer_pubkey: RpcPublicKey(keys[0].public_key()),
                    },
                ),
                (
                    user2.clone(),
                    RpcEventId("$accept".to_string()),
                    MsEvent::GroupInvitationVote {
                        group_kind: MultispendGroupKind::Fiat,
                        invitation: invitation_id.clone(),
                        vote: MultispendGroupVoteType::Accept {
                            member_pubkey: RpcPublicKey(keys[1].public_key()),
                        },
                    },
                ),
                (
                    user1.clone(),
                    request_id.clone(),
                    MsEvent::WithdrawalRequest {
                        request: MultispendTransferRequest::Fiat(request.clone()),
                        description: "withdrawal".to_string(),
                    },
                ),
            ];
            for (index, user) in [user1.clone(), user2.clone()].into_iter().enumerate() {
                events.push((
                    user,
                    RpcEventId(format!("$approval{index}")),
                    MsEvent::WithdrawalResponse {
                        group_kind: MultispendGroupKind::Fiat,
                        request: request_id.clone(),
                        response: WithdrawalResponseType::Approve {
                            signature: RpcSignature(
                                secp256k1::SECP256K1
                                    .sign_schnorr_no_aux_rand(&message, &keys[index]),
                            ),
                        },
                    },
                ));
            }
            if let Some(response) = terminal_response {
                events.push((
                    user1.clone(),
                    RpcEventId("$terminal".to_string()),
                    MsEvent::WithdrawalResponse {
                        group_kind: MultispendGroupKind::Fiat,
                        request: request_id.clone(),
                        response,
                    },
                ));
            }
            // Replay the room into an empty database in one transaction, like the
            // rescanner.
            for (index, (sender, event_id, event)) in events.into_iter().enumerate() {
                process_event_db_raw(
                    &mut tx.to_ref_nc(),
                    &room_id,
                    sender,
                    event_id,
                    event,
                    index as u64,
                    &mut context,
                )
                .await
                .unwrap();
            }
            assert!(context.btc_payouts.is_empty(), "a fiat withdrawal paid out");
            queue_counts.push(
                tx.find_by_prefix(&MultispendPendingApprovedWithdrawalRequestKeyPrefix)
                    .await
                    .count()
                    .await,
            );
        }
        assert_eq!(
            queue_counts[0], 1,
            "approval without a terminal response must stay queued"
        );
        assert_eq!(
            queue_counts,
            [1, 0, 0],
            "queue counts for approval-only, Complete, TxRejected"
        );
    }

    const INVITE_CODE: &str = "fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75";

    fn keypair(byte: u8) -> secp256k1::Keypair {
        secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, &[byte; 32]).unwrap()
    }

    fn user(name: &str) -> RpcUserId {
        RpcUserId(format!("@{name}:example.com"))
    }

    fn txid(byte: u8) -> RpcTransactionId {
        RpcTransactionId(format!("{byte:064x}").parse().unwrap())
    }

    /// One room whose events are processed one by one, as the rescanner does.
    struct Room {
        db: Database,
        room_id: RpcRoomId,
        our_id: RpcUserId,
        events: u64,
        /// Recipients of the bitcoin withdrawals completed so far.
        btc_payouts: Vec<(RpcFederationId, AccountId)>,
    }

    impl Room {
        fn new(our_id: RpcUserId) -> Self {
            Self {
                db: Database::new(MemDatabase::new(), ModuleDecoderRegistry::default()),
                room_id: RpcRoomId("!room:example.com".to_string()),
                our_id,
                events: 0,
                btc_payouts: Vec::new(),
            }
        }

        /// Process `event` and return its id and whether it was valid.
        async fn send(&mut self, sender: &RpcUserId, event: MsEvent) -> (RpcEventId, bool) {
            self.events += 1;
            let event_id = RpcEventId(format!("$event{}", self.events));
            let mut dbtx = self.db.begin_transaction().await;
            let mut context = MultispendContext {
                our_id: self.our_id.clone(),
                check_pending_approved_withdrawal_requests: false,
                refresh_account_info: false,
                btc_payouts: Vec::new(),
            };
            process_event_db(
                &mut dbtx.to_ref_nc(),
                &self.room_id,
                sender.clone(),
                event_id.clone(),
                event,
                self.events,
                &mut context,
            )
            .await;
            dbtx.commit_tx().await;
            self.btc_payouts.extend(context.btc_payouts);
            let mut dbtx = self.db.begin_transaction_nc().await;
            let valid = !is_invalid_event(&mut dbtx, event_id.clone()).await;
            (event_id, valid)
        }

        async fn status(&self, kind: MultispendGroupKind) -> Option<MultispendGroupStatus> {
            get_group_status_db(
                &mut self.db.begin_transaction_nc().await,
                &self.room_id,
                kind,
            )
            .await
        }

        /// Counter and id of the listed events of the `kind` group, newest
        /// first.
        async fn events(&self, kind: MultispendGroupKind) -> Vec<(u64, RpcEventId)> {
            let mut dbtx = self.db.begin_transaction_nc().await;
            list_multispend_events(&mut dbtx, &self.room_id, kind, None, 10)
                .await
                .into_iter()
                .map(|event| (event.counter, event.event_id))
                .collect()
        }

        async fn withdrawal(&self, request_id: &RpcEventId) -> WithdrawRequestWithApprovals {
            let mut dbtx = self.db.begin_transaction_nc().await;
            match get_event_data_db(&mut dbtx, &self.room_id, request_id).await {
                Some(MsEventData::WithdrawalRequest(request)) => request,
                other => panic!("not a withdrawal request: {other:?}"),
            }
        }

        async fn queued(&self) -> Vec<MultispendPendingApprovedWithdrawalRequestKey> {
            self.db
                .begin_transaction_nc()
                .await
                .find_by_prefix(&MultispendPendingApprovedWithdrawalRequestKeyPrefix)
                .await
                .map(|(key, ())| key)
                .collect()
                .await
        }

        async fn invite(
            &mut self,
            kind: MultispendGroupKind,
            members: &[RpcUserId],
            threshold: u64,
        ) -> (RpcEventId, bool) {
            self.send(&members[0], invitation(kind, members, threshold))
                .await
        }

        /// Finalize a group where `members[i]` holds `keypair(i + 1)`.
        async fn finalize(
            &mut self,
            kind: MultispendGroupKind,
            members: &[RpcUserId],
            threshold: u64,
        ) -> FinalizedGroup {
            let (invitation, valid) = self.invite(kind, members, threshold).await;
            assert!(valid);
            for (index, member) in members.iter().enumerate().skip(1) {
                let vote = MsEvent::GroupInvitationVote {
                    group_kind: kind,
                    invitation: invitation.clone(),
                    vote: MultispendGroupVoteType::Accept {
                        member_pubkey: RpcPublicKey(keypair(index as u8 + 1).public_key()),
                    },
                };
                assert!(self.send(member, vote).await.1);
            }
            match self.status(kind).await {
                Some(MultispendGroupStatus::Finalized {
                    finalized_group, ..
                }) => finalized_group,
                other => panic!("group not finalized: {other:?}"),
            }
        }
    }

    fn invitation(kind: MultispendGroupKind, members: &[RpcUserId], threshold: u64) -> MsEvent {
        MsEvent::GroupInvitation {
            group_kind: kind,
            invitation: GroupInvitation {
                signers: members.iter().cloned().collect(),
                threshold,
                federation_invite_code: INVITE_CODE.to_string(),
                federation_name: "test".to_string(),
            },
            proposer_pubkey: RpcPublicKey(keypair(1).public_key()),
        }
    }

    fn btc_request(group: &FinalizedGroup, msats: u64) -> MultispendTransferRequest {
        btc_request_from(&group.spv2_account, msats)
    }

    fn btc_request_from(from: &Account, msats: u64) -> MultispendTransferRequest {
        let payout = Account::single(keypair(42).public_key(), AccountType::BtcDepositor);
        MultispendTransferRequest::Btc(
            stability_pool_client::common::BtcTransferRequest::new(
                7,
                from.clone(),
                fedimint_core::Amount::from_msats(msats),
                payout.id(),
                vec![],
                u64::MAX,
            )
            .unwrap(),
        )
    }

    /// `request` with one JSON field replaced, as a forged Matrix event would
    /// carry it. Deserializing skips the checks of the request constructor.
    fn forge<T: Serialize + serde::de::DeserializeOwned>(
        request: &T,
        field: &str,
        value: serde_json::Value,
    ) -> T {
        let mut json = serde_json::to_value(request).unwrap();
        json[field] = value;
        serde_json::from_value(json).unwrap()
    }

    fn approve(request: &MultispendTransferRequest, key: &secp256k1::Keypair) -> MsEvent {
        MsEvent::WithdrawalResponse {
            group_kind: request.kind(),
            request: RpcEventId(String::new()),
            response: WithdrawalResponseType::Approve {
                signature: RpcSignature(
                    secp256k1::SECP256K1
                        .sign_schnorr_no_aux_rand(&secp256k1::Message::from(&request.id()), key),
                ),
            },
        }
    }

    fn respond(request_id: &RpcEventId, event: MsEvent) -> MsEvent {
        let MsEvent::WithdrawalResponse {
            group_kind,
            response,
            ..
        } = event
        else {
            unreachable!()
        };
        MsEvent::WithdrawalResponse {
            group_kind,
            request: request_id.clone(),
            response,
        }
    }

    fn withdrawal_request(request: MultispendTransferRequest) -> MsEvent {
        MsEvent::WithdrawalRequest {
            request,
            description: "withdrawal".to_string(),
        }
    }

    #[tokio::test]
    async fn btc_group_is_a_btc_depositor_multisig() {
        let members = [user("alice"), user("bob"), user("carol")];
        let group = Room::new(members[0].clone())
            .finalize(MultispendGroupKind::Btc, &members, 2)
            .await;
        assert_eq!(group.kind, MultispendGroupKind::Btc);
        let expected: Account = AccountUnchecked {
            acc_type: AccountType::BtcDepositor,
            pub_keys: [1, 2, 3].map(|byte| keypair(byte).public_key()).into(),
            threshold: 2,
        }
        .try_into()
        .unwrap();
        assert_eq!(group.spv2_account, expected);
    }

    #[tokio::test]
    async fn fiat_and_btc_groups_share_a_room() {
        use MultispendGroupKind::{Btc, Fiat};
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[0].clone());

        // an open bitcoin invitation does not hold up a fiat group
        let (btc_invitation, valid) = room.invite(Btc, &members, 2).await;
        assert!(valid);
        let fiat_group = room.finalize(Fiat, &members, 2).await;
        assert_matches!(
            room.status(Btc).await,
            Some(MultispendGroupStatus::ActiveInvitation { active_invite_id }) if active_invite_id == btc_invitation
        );
        let btc_group = room.finalize(Btc, &members, 2).await;
        assert_eq!(fiat_group.kind, Fiat);
        assert_eq!(btc_group.kind, Btc);
        // each finalized group refuses another invitation of its kind
        for kind in [Fiat, Btc] {
            assert!(!room.invite(kind, &members, 2).await.1);
        }

        // a request out of the other group's account is invalid
        let btc_from_fiat = forge(
            &btc_request(&btc_group, 1_000_000),
            "from",
            serde_json::to_value(&fiat_group.spv2_account).unwrap(),
        );
        assert!(
            !room
                .send(&members[0], withdrawal_request(btc_from_fiat))
                .await
                .1
        );
        let fiat_from_btc = forge(
            &fiat_request(&fiat_group),
            "from",
            serde_json::to_value(&btc_group.spv2_account).unwrap(),
        );
        assert!(
            !room
                .send(
                    &members[0],
                    withdrawal_request(MultispendTransferRequest::Fiat(fiat_from_btc))
                )
                .await
                .1
        );

        // each group lists only its own withdrawals and deposits
        let mut sent = vec![];
        for (sender, event) in [
            (
                &members[0],
                withdrawal_request(MultispendTransferRequest::Fiat(fiat_request(&fiat_group))),
            ),
            (
                &members[1],
                MsEvent::DepositNotification {
                    amount: MultispendAmount::BtcAmount(rpc_types::RpcAmount(
                        fedimint_core::Amount::from_msats(1_000_000),
                    )),
                    txid: txid(1),
                    description: String::new(),
                },
            ),
            (
                &members[0],
                withdrawal_request(btc_request(&btc_group, 1_000_000)),
            ),
            (
                &members[1],
                MsEvent::DepositNotification {
                    amount: MultispendAmount::FiatAmount(RpcFiatAmount(100)),
                    txid: txid(2),
                    description: String::new(),
                },
            ),
        ] {
            let (event_id, valid) = room.send(sender, event).await;
            assert!(valid);
            sent.push(event_id);
        }
        assert_eq!(
            room.events(Fiat).await,
            [(1, sent[3].clone()), (0, sent[0].clone())]
        );
        assert_eq!(
            room.events(Btc).await,
            [(1, sent[2].clone()), (0, sent[1].clone())]
        );
    }

    #[tokio::test]
    async fn old_client_fiat_group_finalizes_after_an_open_btc_invitation() {
        use MultispendGroupKind::{Btc, Fiat};
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[0].clone());
        let (btc_invitation, valid) = room.invite(Btc, &members, 2).await;
        assert!(valid);

        // a client from before bitcoin groups sends its events under the
        // plain multispend msgtype, which is the fiat one
        let old_client = |event: MsEvent| {
            let (_, content) = event.to_matrix();
            MsEvent::from_matrix(rpc_types::multispend::MULTISPEND_MSGTYPE, content).unwrap()
        };
        let (fiat_invitation, valid) = room
            .send(&members[0], old_client(invitation(Fiat, &members, 2)))
            .await;
        assert!(valid);
        let vote = old_client(MsEvent::GroupInvitationVote {
            group_kind: Fiat,
            invitation: fiat_invitation.clone(),
            vote: MultispendGroupVoteType::Accept {
                member_pubkey: RpcPublicKey(keypair(2).public_key()),
            },
        });
        assert!(room.send(&members[1], vote).await.1);

        assert_matches!(
            room.status(Fiat).await,
            Some(MultispendGroupStatus::Finalized { invite_event_id, finalized_group })
                if invite_event_id == fiat_invitation && finalized_group.kind == Fiat
        );
        assert_matches!(
            room.status(Btc).await,
            Some(MultispendGroupStatus::ActiveInvitation { active_invite_id }) if active_invite_id == btc_invitation
        );
    }

    #[tokio::test]
    async fn btc_reannouncement_cannot_take_over_a_fiat_invitation() {
        use MultispendGroupKind::{Btc, Fiat};
        let members = [user("alice"), user("bob")];
        let mut original = Room::new(members[0].clone());
        let group = original.finalize(Fiat, &members, 2).await;
        let Some(MultispendGroupStatus::Finalized {
            invite_event_id, ..
        }) = original.status(Fiat).await
        else {
            unreachable!()
        };
        let Some(MsEventData::GroupInvitation(state)) = get_event_data_db(
            &mut original.db.begin_transaction_nc().await,
            &original.room_id,
            &invite_event_id,
        )
        .await
        else {
            panic!("invitation is gone")
        };
        let reannounce = |group_kind, pubkeys| MsEvent::GroupReannounce {
            group_kind,
            invitation_id: invite_event_id.clone(),
            invitation: state.invitation.clone(),
            proposer: state.proposer.clone(),
            pubkeys,
            rejections: BTreeSet::new(),
        };

        // a new client rebuilds the room from reannouncements, and a bitcoin
        // one naming the fiat invitation arrives first
        let mut rebuilt = Room::new(members[0].clone());
        let forged_pubkeys = BTreeMap::from([
            (members[0].clone(), RpcPublicKey(keypair(7).public_key())),
            (members[1].clone(), RpcPublicKey(keypair(8).public_key())),
        ]);
        rebuilt
            .send(&members[1], reannounce(Btc, forged_pubkeys))
            .await;
        assert!(
            rebuilt
                .send(&members[0], reannounce(Fiat, state.pubkeys.clone()))
                .await
                .1
        );

        assert_matches!(
            rebuilt.status(Fiat).await,
            Some(MultispendGroupStatus::Finalized { invite_event_id: id, finalized_group })
                if id == invite_event_id && finalized_group == group
        );
        assert_eq!(
            get_event_data_db(
                &mut rebuilt.db.begin_transaction_nc().await,
                &rebuilt.room_id,
                &invite_event_id,
            )
            .await,
            Some(MsEventData::GroupInvitation(state))
        );
    }

    #[tokio::test]
    async fn non_signer_member_can_request_a_withdrawal() {
        use MultispendGroupKind::{Btc, Fiat};
        let members = [user("alice"), user("bob")];
        for kind in [Fiat, Btc] {
            // carol is in the room but not a signer, and the UI offers her
            // withdrawals like any member
            let mut room = Room::new(user("carol"));
            let group = room.finalize(kind, &members, 2).await;
            let to = Account::single(keypair(3).public_key(), kind.account_type()).id();
            let request = match kind {
                Fiat => MultispendTransferRequest::Fiat(
                    TransferRequest::new(
                        1,
                        group.spv2_account.clone(),
                        FiatAmount(100),
                        to,
                        vec![],
                        u64::MAX,
                        None,
                    )
                    .unwrap(),
                ),
                Btc => MultispendTransferRequest::Btc(
                    stability_pool_client::common::BtcTransferRequest::new(
                        7,
                        group.spv2_account.clone(),
                        fedimint_core::Amount::from_msats(1_000_000),
                        to,
                        vec![],
                        u64::MAX,
                    )
                    .unwrap(),
                ),
            };
            let (request_id, valid) = room
                .send(&user("carol"), withdrawal_request(request.clone()))
                .await;
            assert!(valid);
            for (member, key) in members.iter().zip([1, 2]) {
                let approval = respond(&request_id, approve(&request, &keypair(key)));
                assert!(room.send(member, approval).await.1);
            }
            let queued = room.queued().await;
            assert_eq!(queued.len(), 1);
            assert_eq!(queued[0].request_event_id, request_id);
            assert_eq!(queued[0].transfer_request.kind(), kind);
        }
    }

    #[tokio::test]
    async fn forged_btc_withdrawal_requests_are_invalid() {
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[0].clone());
        let group = room.finalize(MultispendGroupKind::Btc, &members, 2).await;
        let valid = btc_request(&group, 1_000_000);
        let MultispendTransferRequest::Btc(valid_btc) = &valid else {
            unreachable!()
        };

        // same keys, but 1-of-2: any single member could sign for it
        let lower_threshold: Account = AccountUnchecked {
            acc_type: AccountType::BtcDepositor,
            pub_keys: group.spv2_account.pub_keys().copied().collect(),
            threshold: 1,
        }
        .try_into()
        .unwrap();
        let seeker = Account::single(keypair(42).public_key(), AccountType::Seeker);
        for (field, value) in [
            ("from", serde_json::to_value(&lower_threshold).unwrap()),
            ("to", serde_json::to_value(seeker.id()).unwrap()),
            ("to", serde_json::to_value(group.spv2_account.id()).unwrap()),
            ("transfer_amount", serde_json::json!(0)),
        ] {
            let forged = forge(valid_btc, field, value.clone());
            let (_, accepted) = room
                .send(
                    &members[0],
                    withdrawal_request(MultispendTransferRequest::Btc(forged)),
                )
                .await;
            assert!(!accepted, "accepted a request with {field} = {value}");
        }
        assert!(room.send(&members[0], withdrawal_request(valid)).await.1);
    }

    fn fiat_request(group: &FinalizedGroup) -> TransferRequest {
        TransferRequest::new(
            1,
            group.spv2_account.clone(),
            FiatAmount(100),
            Account::single(keypair(42).public_key(), AccountType::Seeker).id(),
            vec![],
            u64::MAX,
            None,
        )
        .unwrap()
    }

    /// Refuses the first submission of each request in `loading`, as the
    /// bridge does while the request's federation is still loading.
    struct LoadingFederations {
        loading: std::sync::Mutex<Vec<RpcEventId>>,
        submitted: std::sync::Mutex<Vec<RpcEventId>>,
    }

    #[apply(async_trait_maybe_send!)]
    impl FederationProvider for LoadingFederations {
        async fn spv2_transfer(
            &self,
            _federation_id: &str,
            _signed_request: SignedMultispendTransferRequest,
            meta: SPv2TransferMetadata,
        ) -> anyhow::Result<OperationId> {
            let SPv2TransferMetadata::MultispendWithdrawal { request_id, .. } = meta else {
                panic!("not a multispend withdrawal")
            };
            let mut loading = self.loading.lock().unwrap();
            if let Some(index) = loading.iter().position(|id| *id == request_id) {
                loading.remove(index);
                anyhow::bail!("Federation is still loading");
            }
            self.submitted.lock().unwrap().push(request_id);
            Ok(OperationId::new_random())
        }

        async fn multispend_group_sync_info(
            &self,
            _federation_id: &str,
            _account_id: AccountId,
        ) -> anyhow::Result<SyncResponse> {
            unimplemented!()
        }

        fn multispend_btc_payout_received(&self, _federation_id: &str, _to: &AccountId) {}

        fn is_own_withdrawal_destination(
            &self,
            _federation_id: &str,
            _to: &AccountId,
        ) -> anyhow::Result<bool> {
            Ok(true)
        }
    }

    #[tokio::test]
    async fn withdrawal_service_retries_a_failed_submission() {
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[0].clone());
        let group = room.finalize(MultispendGroupKind::Fiat, &members, 2).await;
        let request = MultispendTransferRequest::Fiat(fiat_request(&group));
        let mut request_ids = Vec::new();
        for _ in 0..2 {
            let (request_id, _) = room
                .send(&members[0], withdrawal_request(request.clone()))
                .await;
            for (member, key) in members.iter().zip([1, 2]) {
                let approval = respond(&request_id, approve(&request, &keypair(key)));
                assert!(room.send(member, approval).await.1);
            }
            request_ids.push(request_id);
        }
        assert_eq!(room.queued().await.len(), 2);

        // only the second request's federation is still loading at first
        let federations = LoadingFederations {
            loading: std::sync::Mutex::new(vec![request_ids[1].clone()]),
            submitted: Default::default(),
        };
        let service = crate::withdrawal_service::WithdrawalService::default();
        // nothing notifies the service after its first run
        let drained = async {
            while !room.queued().await.is_empty() {
                fedimint_core::runtime::sleep(std::time::Duration::from_millis(100)).await;
            }
        };
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            tokio::select! {
                () = service.run(&room.db, &federations) => unreachable!(),
                () = drained => {}
            }
        })
        .await
        .expect("the failed submission was not retried");
        // the first request, submitted before the failure, is not submitted
        // again
        assert_eq!(*federations.submitted.lock().unwrap(), request_ids);
    }

    #[tokio::test]
    async fn forged_fiat_withdrawal_requests_are_invalid() {
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[0].clone());
        let group = room.finalize(MultispendGroupKind::Fiat, &members, 2).await;
        let valid = fiat_request(&group);

        // same keys, but 1-of-2: any single member could sign for it
        let lower_threshold: Account = AccountUnchecked {
            acc_type: AccountType::Seeker,
            pub_keys: group.spv2_account.pub_keys().copied().collect(),
            threshold: 1,
        }
        .try_into()
        .unwrap();
        for (field, value) in [
            ("from", serde_json::to_value(&lower_threshold).unwrap()),
            ("to", serde_json::to_value(group.spv2_account.id()).unwrap()),
            ("transfer_amount", serde_json::json!(0)),
        ] {
            let forged = forge(&valid, field, value.clone());
            let (_, accepted) = room
                .send(
                    &members[0],
                    withdrawal_request(MultispendTransferRequest::Fiat(forged)),
                )
                .await;
            assert!(!accepted, "accepted a request with {field} = {value}");
        }
        let valid = MultispendTransferRequest::Fiat(valid);
        assert!(room.send(&members[0], withdrawal_request(valid)).await.1);
    }

    #[tokio::test]
    async fn fiat_approval_with_a_bad_signature_is_invalid() {
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[0].clone());
        let group = room.finalize(MultispendGroupKind::Fiat, &members, 2).await;
        let request = MultispendTransferRequest::Fiat(fiat_request(&group));
        let (request_id, valid) = room
            .send(&members[0], withdrawal_request(request.clone()))
            .await;
        assert!(valid);
        // bob signs with alice's key; on master this panicked alice's rescan
        // at the threshold
        let forged = respond(&request_id, approve(&request, &keypair(1)));
        assert!(!room.send(&members[1], forged).await.1);
        for (member, key) in members.iter().zip([1, 2]) {
            let approval = respond(&request_id, approve(&request, &keypair(key)));
            assert!(room.send(member, approval).await.1);
        }
        let queued = room.queued().await;
        assert_eq!(queued.len(), 1);
        let SignedMultispendTransferRequest::Fiat(signed) = &queued[0].transfer_request else {
            panic!("queued a bitcoin transfer")
        };
        signed.validate_signatures().unwrap();
    }

    #[tokio::test]
    async fn events_must_match_the_group_kind() {
        use MultispendGroupKind::{Btc, Fiat};
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[0].clone());
        // the same members hold a bitcoin group, so their keys are valid
        // for both groups
        room.finalize(Btc, &members, 2).await;

        // a vote under the other msgtype does not count for the invitation
        let (invitation, _) = room.invite(Fiat, &members, 2).await;
        let vote = |group_kind| MsEvent::GroupInvitationVote {
            group_kind,
            invitation: invitation.clone(),
            vote: MultispendGroupVoteType::Accept {
                member_pubkey: RpcPublicKey(keypair(2).public_key()),
            },
        };
        assert!(!room.send(&members[1], vote(Btc)).await.1);
        assert!(room.send(&members[1], vote(Fiat)).await.1);

        // nor does an approval in the finalized group
        let Some(MultispendGroupStatus::Finalized {
            finalized_group, ..
        }) = room.status(Fiat).await
        else {
            panic!("group not finalized")
        };
        let request = MultispendTransferRequest::Fiat(fiat_request(&finalized_group));
        let (request_id, _) = room
            .send(&members[0], withdrawal_request(request.clone()))
            .await;
        let approval = |group_kind| {
            let MsEvent::WithdrawalResponse { response, .. } = approve(&request, &keypair(1))
            else {
                unreachable!()
            };
            MsEvent::WithdrawalResponse {
                group_kind,
                request: request_id.clone(),
                response,
            }
        };
        assert!(!room.send(&members[0], approval(Btc)).await.1);
        assert!(room.send(&members[0], approval(Fiat)).await.1);
    }

    #[tokio::test]
    async fn btc_withdrawal_queues_once_at_threshold() {
        let members = [user("alice"), user("bob"), user("carol")];
        for our_id in [members[0].clone(), members[1].clone()] {
            let requester_is_us = our_id == members[0];
            let mut room = Room::new(our_id);
            let group = room.finalize(MultispendGroupKind::Btc, &members, 2).await;
            let request = btc_request(&group, 2_000_000);
            let (request_id, valid) = room
                .send(&members[0], withdrawal_request(request.clone()))
                .await;
            assert!(valid);
            let approve = |key: u8| respond(&request_id, approve(&request, &keypair(key)));

            // carol's approval signed with bob's key does not count, nor does
            // alice's signature over another request
            assert!(!room.send(&members[2], approve(2)).await.1);
            let other = btc_request(&group, 2_000_001);
            assert!(
                !room
                    .send(
                        &members[0],
                        respond(&request_id, super::tests::approve(&other, &keypair(1)))
                    )
                    .await
                    .1
            );
            assert!(room.send(&members[0], approve(1)).await.1);
            assert!(room.queued().await.is_empty(), "queued below threshold");
            // a second vote by alice and a vote by a stranger are invalid
            assert!(!room.send(&members[0], approve(1)).await.1);
            assert!(!room.send(&user("mallory"), approve(4)).await.1);
            assert!(room.queued().await.is_empty());

            assert!(room.send(&members[1], approve(2)).await.1);
            let queued = room.queued().await;
            if !requester_is_us {
                assert!(queued.is_empty(), "queued another member's withdrawal");
                continue;
            }
            assert_eq!(queued.len(), 1);
            let SignedMultispendTransferRequest::Btc(signed) = &queued[0].transfer_request else {
                panic!("queued a fiat transfer")
            };
            assert_eq!(
                MultispendTransferRequest::Btc(signed.details().clone()),
                request
            );
            signed.validate_signatures().unwrap();
            assert_eq!(queued[0].request_event_id, request_id);

            // an approval past the threshold leaves the one queued submission
            assert!(room.send(&members[2], approve(3)).await.1);
            assert_eq!(room.queued().await.len(), 1);
            assert_eq!(room.withdrawal(&request_id).await.signatures.len(), 3);
        }
    }

    #[tokio::test]
    async fn btc_rescan_does_not_requeue_settled_withdrawals() {
        let members = [user("alice"), user("bob")];
        let amount = MultispendAmount::BtcAmount(rpc_types::RpcAmount(
            fedimint_core::Amount::from_msats(3_000_000),
        ));
        for (terminal, queued) in [
            (None, 1),
            (
                Some(WithdrawalResponseType::Complete {
                    amount,
                    txid: txid(9),
                }),
                0,
            ),
            (
                Some(WithdrawalResponseType::TxRejected {
                    error: "rejected".to_string(),
                }),
                0,
            ),
        ] {
            // a fresh database replays the whole room, approvals first
            let mut room = Room::new(members[0].clone());
            let group = room.finalize(MultispendGroupKind::Btc, &members, 2).await;
            let request = btc_request(&group, 3_000_000);
            let (request_id, _) = room
                .send(&members[0], withdrawal_request(request.clone()))
                .await;
            for (member, key) in members.iter().zip([1, 2]) {
                assert!(
                    room.send(
                        member,
                        respond(&request_id, approve(&request, &keypair(key)))
                    )
                    .await
                    .1
                );
            }
            if let Some(response) = terminal {
                let event = MsEvent::WithdrawalResponse {
                    group_kind: MultispendGroupKind::Btc,
                    request: request_id.clone(),
                    response,
                };
                assert!(room.send(&members[0], event).await.1);
            }
            assert_eq!(room.queued().await.len(), queued);
        }
    }

    /// A device of one Matrix user, owning `destination` if it is the device
    /// the withdrawal pays.
    struct Device {
        destination: Option<AccountId>,
        submitted: std::sync::Mutex<Vec<RpcEventId>>,
    }

    #[apply(async_trait_maybe_send!)]
    impl FederationProvider for Device {
        async fn spv2_transfer(
            &self,
            _federation_id: &str,
            _signed_request: SignedMultispendTransferRequest,
            meta: SPv2TransferMetadata,
        ) -> anyhow::Result<OperationId> {
            let SPv2TransferMetadata::MultispendWithdrawal { request_id, .. } = meta else {
                panic!("not a multispend withdrawal")
            };
            self.submitted.lock().unwrap().push(request_id);
            Ok(OperationId::new_random())
        }

        async fn multispend_group_sync_info(
            &self,
            _federation_id: &str,
            _account_id: AccountId,
        ) -> anyhow::Result<SyncResponse> {
            unimplemented!()
        }

        fn multispend_btc_payout_received(&self, _federation_id: &str, _to: &AccountId) {}

        fn is_own_withdrawal_destination(
            &self,
            _federation_id: &str,
            to: &AccountId,
        ) -> anyhow::Result<bool> {
            Ok(self.destination == Some(*to))
        }
    }

    // alice's devices 0 and 1 both see her request reach the threshold
    #[tokio::test]
    async fn only_the_device_a_withdrawal_pays_submits_it() {
        let members = [user("alice"), user("bob")];
        for kind in [MultispendGroupKind::Fiat, MultispendGroupKind::Btc] {
            let mut submitted = Vec::new();
            for pays_this_device in [true, false] {
                let mut room = Room::new(members[0].clone());
                let group = room.finalize(kind, &members, 2).await;
                let request = match kind {
                    MultispendGroupKind::Fiat => {
                        MultispendTransferRequest::Fiat(fiat_request(&group))
                    }
                    MultispendGroupKind::Btc => btc_request(&group, 3_000_000),
                };
                let (request_id, _) = room
                    .send(&members[0], withdrawal_request(request.clone()))
                    .await;
                for (member, key) in members.iter().zip([1, 2]) {
                    let approval = respond(&request_id, approve(&request, &keypair(key)));
                    assert!(room.send(member, approval).await.1);
                }
                assert_eq!(room.queued().await.len(), 1);
                let device = Device {
                    destination: pays_this_device.then_some(*request.to()),
                    submitted: Default::default(),
                };
                crate::withdrawal_service::WithdrawalService::default()
                    .run_once(&room.db, &device)
                    .await
                    .unwrap();
                assert!(room.queued().await.is_empty());
                submitted.push(device.submitted.into_inner().unwrap().len());
            }
            assert_eq!(submitted, [1, 0], "{kind:?}");
        }
    }

    // bob's other device, or bob himself as the requester, may have
    // submitted the withdrawal; either way bob sees whom it paid
    #[tokio::test]
    async fn btc_completion_comes_from_the_requester() {
        let members = [user("alice"), user("bob")];
        let mut room = Room::new(members[1].clone());
        let group = room.finalize(MultispendGroupKind::Btc, &members, 2).await;
        let request = btc_request(&group, 3_000_000);
        let (request_id, _) = room
            .send(&members[0], withdrawal_request(request.clone()))
            .await;
        let complete = |amount| MsEvent::WithdrawalResponse {
            group_kind: MultispendGroupKind::Btc,
            request: request_id.clone(),
            response: WithdrawalResponseType::Complete {
                amount,
                txid: txid(9),
            },
        };
        let btc = |msats| {
            MultispendAmount::BtcAmount(rpc_types::RpcAmount(fedimint_core::Amount::from_msats(
                msats,
            )))
        };
        // only the requester completes
        assert!(!room.send(&members[1], complete(btc(3_000_000))).await.1);
        assert!(room.btc_payouts.is_empty());
        assert!(room.send(&members[0], complete(btc(3_000_000))).await.1);
        assert_eq!(
            room.withdrawal(&request_id).await.tx_submission_status,
            WithdrawTxSubmissionStatus::Accepted { txid: txid(9) }
        );
        assert_eq!(
            room.btc_payouts,
            [(group.federation_id.clone(), *request.to())]
        );
    }
}
