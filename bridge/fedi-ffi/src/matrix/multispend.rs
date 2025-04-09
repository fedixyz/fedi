use std::collections::{BTreeMap, BTreeSet};

use db::{
    insert_multispend_chronological_event, MultispendChronologicalEventData,
    MultispendChronologicalEventKeyPrefix, MultispendDepositEventKey, MultispendGroupStatus,
    MultispendGroupStatusKey, MultispendInvitationKey, MultispendWithdrawRequestKey,
};
use fedimint_core::db::{DatabaseTransaction, IDatabaseTransactionOpsCoreTyped as _};
use fedimint_core::encoding::{Decodable, Encodable};
use futures::StreamExt as _;
use serde::{Deserialize, Serialize};
use stability_pool_client::common::{Account, AccountType, AccountUnchecked, TransferRequest};
use tracing::error;
use ts_rs::TS;

use super::{RpcRoomId, RpcUserId};
use crate::types::{RpcEventId, RpcFiatAmount, RpcPublicKey, RpcSignature, RpcTransactionId};

pub mod db;

pub const MULTISPEND_MSGTYPE: &str = "xyz.fedi.multispend";

#[derive(
    Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, TS, Encodable, Decodable,
)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GroupInvitation {
    pub signers: BTreeSet<RpcUserId>,
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

    GroupInvitationCancel {},

    DepositNotification {
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
    },

    WithdrawalRequest {
        #[ts(type = "JSONObject")]
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
    pub pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
    pub rejections: BTreeSet<RpcUserId>,
}

impl GroupInvitationWithKeys {
    /// Create a new GroupInvitationWithKeys from a GroupInvitation and the
    /// proposer details
    pub fn new(
        invitation: GroupInvitation,
        proposer: RpcUserId,
        proposer_pubkey: RpcPublicKey,
    ) -> Self {
        let mut pubkeys = BTreeMap::new();
        pubkeys.insert(proposer, proposer_pubkey);

        Self {
            invitation,
            pubkeys,
            rejections: BTreeSet::new(),
        }
    }

    /// Process a vote from a user (either accept or reject)
    /// Returns Ok(Some(Account)) if all signers have accepted and the account
    /// is finalized Returns Ok(None) if the vote was processed but the
    /// account is not yet finalized
    pub fn process_vote(
        &mut self,
        sender: RpcUserId,
        vote: MultispendGroupVoteType,
    ) -> Result<Option<Account>, ProcessEventError> {
        if !self.invitation.signers.contains(&sender)
            || self.pubkeys.contains_key(&sender)
            || self.rejections.contains(&sender)
        {
            return Err(ProcessEventError::InvalidMessage);
        }

        match vote {
            MultispendGroupVoteType::Accept { member_pubkey } => {
                self.pubkeys.insert(sender, member_pubkey);
                if self.pubkeys.len() == self.invitation.signers.len() {
                    let account = AccountUnchecked {
                        acc_type: AccountType::Seeker,
                        pub_keys: self.pubkeys.values().cloned().map(|pk| pk.0).collect(),
                        threshold: self.invitation.threshold,
                    };

                    return Ok(account.try_into().ok());
                }
            }
            MultispendGroupVoteType::Reject => {
                self.rejections.insert(sender);
            }
        }

        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// Withdrawal request with extra data accumulated over events.
pub struct WithdrawRequestWithApprovals {
    #[ts(type = "JSONObject")]
    pub request: TransferRequest,
    pub description: String,
    pub signatures: BTreeMap<RpcUserId, RpcSignature>,
    pub rejections: BTreeSet<RpcUserId>,
    pub completed: Option<RpcTransactionId>,
}

impl WithdrawRequestWithApprovals {
    /// Create a new WithdrawRequestWithApprovals
    pub fn new(request: TransferRequest, description: String) -> Self {
        Self {
            request,
            description,
            signatures: BTreeMap::new(),
            rejections: BTreeSet::new(),
            completed: None,
        }
    }

    fn check_can_vote(
        &self,
        sender: &RpcUserId,
        finalized_group: &GroupInvitationWithKeys,
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
    pub fn process_response(
        &mut self,
        sender: RpcUserId,
        response: WithdrawalResponseType,
        finalized_group: &GroupInvitationWithKeys,
    ) -> Result<(), ProcessEventError> {
        match response {
            WithdrawalResponseType::Approve { signature } => {
                self.check_can_vote(&sender, finalized_group)?;
                self.signatures.insert(sender, signature);
            }
            WithdrawalResponseType::Reject => {
                self.check_can_vote(&sender, finalized_group)?;
                self.rejections.insert(sender);
            }
            WithdrawalResponseType::Complete {
                fiat_amount: _,
                txid,
            } => {
                if self.completed.is_some() {
                    return Err(ProcessEventError::InvalidMessage);
                }
                self.completed = Some(txid);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Encodable, Decodable, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
/// Deposit notification saved to db.
pub struct MultispendDepositEventData {
    pub user: RpcUserId,
    pub fiat_amount: RpcFiatAmount,
    pub txid: RpcTransactionId,
}

/// Collected details for a given event id.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MsEventData {
    WithdrawalRequest(WithdrawRequestWithApprovals),
    GroupInvitation(GroupInvitationWithKeys),
    DepositNotification(MultispendDepositEventData),
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
}

/// Process one event from matrix and persist it to database.
pub async fn process_event_db(
    dbtx: &mut DatabaseTransaction<'_>,
    room_id: &RpcRoomId,
    sender: RpcUserId,
    event_id: RpcEventId,
    event: MultispendEvent,
    event_time: u64,
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

            dbtx.insert_new_entry(
                &MultispendInvitationKey(room_id.clone(), event_id.clone()),
                &GroupInvitationWithKeys::new(invitation, sender, proposer_pubkey),
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
            if let Some(sp_account) = state.process_vote(sender, vote)? {
                dbtx.insert_entry(
                    &status_key,
                    &MultispendGroupStatus::Finalized {
                        finalized_group: state.clone(),
                        sp_account,
                    },
                )
                .await;
            }
            dbtx.insert_entry(&key, &state).await;
        }
        MultispendEvent::GroupInvitationCancel {} => {
            let status_key = MultispendGroupStatusKey(room_id.clone());
            // there is no active invite
            if !matches!(
                dbtx.get_value(&status_key).await,
                Some(MultispendGroupStatus::ActiveInvitation { .. })
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

            let new_state = WithdrawRequestWithApprovals::new(request, description);
            dbtx.insert_new_entry(&key, &new_state).await;
            insert_multispend_chronological_event(dbtx, room_id, &event_id, event_time).await;
        }

        MultispendEvent::WithdrawalResponse { request, response } => {
            let (finalized_group, _) = get_finalized_group_db(dbtx, room_id)
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
            state.process_response(sender, response, &finalized_group)?;
            dbtx.insert_entry(&key, &state).await;
        }

        MultispendEvent::DepositNotification { fiat_amount, txid } => {
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
    event_id: RpcEventId,
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

    None
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
) -> Option<(GroupInvitationWithKeys, Account)> {
    if let Some(MultispendGroupStatus::Finalized {
        finalized_group,
        sp_account,
    }) = get_group_status_db(tx, room_id).await
    {
        Some((finalized_group, sp_account))
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
        if let Some(ms_event) = get_event_data_db(dbtx, room_id, event_data.event_id.clone()).await
        {
            result.push(MultispendListedEvent {
                counter,
                time: event_data.event_time,
                event: ms_event,
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
    use fedimint_core::db::mem_impl::MemDatabase;
    use fedimint_core::db::Database;
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

        let invitation = GroupInvitation {
            signers: BTreeSet::from([user1.clone(), user2.clone()]),
            threshold: 2,
            federation_invite_code: "test".to_string(),
            federation_name: "test".to_string(),
        };

        let pk1 = gen_test_pubkey();
        let pk2 = gen_test_pubkey();

        // Send invitation
        let event = MultispendEvent::GroupInvitation {
            invitation: invitation.clone(),
            proposer_pubkey: pk1,
        };
        assert!(process_event_db(
            &mut tx.to_ref_nc(),
            &room_id,
            user1.clone(),
            event1_id.clone(),
            event,
            1
        )
        .await
        .is_ok());

        // Accept invitation
        let event = MultispendEvent::GroupInvitationVote {
            invitation: event1_id.clone(),
            vote: MultispendGroupVoteType::Accept { member_pubkey: pk2 },
        };
        assert!(process_event_db(
            &mut tx.to_ref_nc(),
            &room_id,
            user2.clone(),
            event2_id.clone(),
            event,
            2
        )
        .await
        .is_ok());

        // Try to send another invitation after finalization (should fail)
        let event = MultispendEvent::GroupInvitation {
            invitation: invitation.clone(),
            proposer_pubkey: pk1,
        };
        assert!(matches!(
            process_event_db(
                &mut tx.to_ref_nc(),
                &room_id,
                user1.clone(),
                event3_id.clone(),
                event,
                3
            )
            .await,
            Err(ProcessEventError::InvalidMessage)
        ));

        // Verify the data through get_event_data_db.
        if let Some(MsEventData::GroupInvitation(invite)) =
            get_event_data_db(&mut tx.to_ref_nc(), &room_id, event1_id).await
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
