use std::collections::{BTreeMap, BTreeSet};

use bitcoin::secp256k1::schnorr;
use fedimint_core::encoding::{Decodable, Encodable};
use serde::{Deserialize, Serialize};
use stability_pool_client::common::{
    Account, AccountId, AccountType, BtcTransferRequest, SignedBtcTransferRequest,
    SignedTransferRequest, TransferRequest, TransferRequestId,
};
use ts_rs::TS;

use crate::matrix::RpcUserId;
use crate::{RpcAmount, RpcEventId, RpcFiatAmount, RpcPublicKey, RpcSignature, RpcTransactionId};

pub const MULTISPEND_MSGTYPE: &str = "xyz.fedi.multispend";
pub const BTC_MULTISPEND_MSGTYPE: &str = "xyz.fedi.multispend.btc";

/// What a multispend group holds: a stabilized fiat balance in a seeker
/// account, or exact msats in a btc-depositor account.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS, Encodable, Decodable)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MultispendGroupKind {
    Fiat,
    Btc,
}

impl MultispendGroupKind {
    /// Matrix msgtype of the group's events. Clients without bitcoin groups
    /// ignore the bitcoin one.
    pub fn msgtype(self) -> &'static str {
        match self {
            MultispendGroupKind::Fiat => MULTISPEND_MSGTYPE,
            MultispendGroupKind::Btc => BTC_MULTISPEND_MSGTYPE,
        }
    }

    pub fn account_type(self) -> AccountType {
        match self {
            MultispendGroupKind::Fiat => AccountType::Seeker,
            MultispendGroupKind::Btc => AccountType::BtcDepositor,
        }
    }
}

/// Amount moved into or out of a multispend group.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS, Encodable, Decodable)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MultispendAmount {
    FiatAmount(RpcFiatAmount),
    BtcAmount(RpcAmount),
}

impl MultispendAmount {
    pub fn kind(self) -> MultispendGroupKind {
        match self {
            MultispendAmount::FiatAmount(_) => MultispendGroupKind::Fiat,
            MultispendAmount::BtcAmount(_) => MultispendGroupKind::Btc,
        }
    }
}

/// Request to transfer out of a group account. Serializes as the request's
/// own fields plus a `kind` tag.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Encodable, Decodable)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum MultispendTransferRequest {
    Fiat(TransferRequest),
    Btc(BtcTransferRequest),
}

impl MultispendTransferRequest {
    pub fn kind(&self) -> MultispendGroupKind {
        match self {
            MultispendTransferRequest::Fiat(_) => MultispendGroupKind::Fiat,
            MultispendTransferRequest::Btc(_) => MultispendGroupKind::Btc,
        }
    }

    pub fn from(&self) -> &Account {
        match self {
            MultispendTransferRequest::Fiat(request) => request.from(),
            MultispendTransferRequest::Btc(request) => request.from(),
        }
    }

    pub fn to(&self) -> &AccountId {
        match self {
            MultispendTransferRequest::Fiat(request) => request.to(),
            MultispendTransferRequest::Btc(request) => request.to(),
        }
    }

    pub fn amount(&self) -> MultispendAmount {
        match self {
            MultispendTransferRequest::Fiat(request) => {
                MultispendAmount::FiatAmount(RpcFiatAmount(request.amount().0))
            }
            MultispendTransferRequest::Btc(request) => {
                MultispendAmount::BtcAmount(RpcAmount(request.amount()))
            }
        }
    }

    /// The message members sign to approve the request.
    pub fn id(&self) -> TransferRequestId {
        match self {
            MultispendTransferRequest::Fiat(request) => TransferRequestId::from(request),
            MultispendTransferRequest::Btc(request) => TransferRequestId::from(request),
        }
    }
}

/// A [`MultispendTransferRequest`] with a threshold of member signatures.
#[derive(Debug, Clone, PartialEq, Eq, Encodable, Decodable)]
pub enum SignedMultispendTransferRequest {
    Fiat(SignedTransferRequest),
    Btc(SignedBtcTransferRequest),
}

impl SignedMultispendTransferRequest {
    pub fn kind(&self) -> MultispendGroupKind {
        match self {
            SignedMultispendTransferRequest::Fiat(_) => MultispendGroupKind::Fiat,
            SignedMultispendTransferRequest::Btc(_) => MultispendGroupKind::Btc,
        }
    }

    /// Fails unless the signatures meet the threshold of the `from` account.
    pub fn new(
        request: MultispendTransferRequest,
        signatures: BTreeMap<u64, schnorr::Signature>,
    ) -> anyhow::Result<Self> {
        Ok(match request {
            MultispendTransferRequest::Fiat(request) => {
                Self::Fiat(SignedTransferRequest::new(request, signatures)?)
            }
            MultispendTransferRequest::Btc(request) => {
                Self::Btc(SignedBtcTransferRequest::new(request, signatures)?)
            }
        })
    }

    pub fn to(&self) -> &AccountId {
        match self {
            SignedMultispendTransferRequest::Fiat(signed) => signed.details().to(),
            SignedMultispendTransferRequest::Btc(signed) => signed.details().to(),
        }
    }

    pub fn amount(&self) -> MultispendAmount {
        match self {
            SignedMultispendTransferRequest::Fiat(signed) => {
                MultispendAmount::FiatAmount(RpcFiatAmount(signed.details().amount().0))
            }
            SignedMultispendTransferRequest::Btc(signed) => {
                MultispendAmount::BtcAmount(RpcAmount(signed.details().amount()))
            }
        }
    }
}

impl From<SignedTransferRequest> for SignedMultispendTransferRequest {
    fn from(signed: SignedTransferRequest) -> Self {
        Self::Fiat(signed)
    }
}

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
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
        #[serde(flatten)]
        amount: MultispendAmount,
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

/// An event of a multispend group, as the bridge processes it and the UI shows
/// it. On Matrix each kind of group has its own msgtype.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export)]
pub enum MsEvent {
    GroupInvitation {
        group_kind: MultispendGroupKind,
        invitation: GroupInvitation,
        proposer_pubkey: RpcPublicKey,
    },

    GroupInvitationVote {
        group_kind: MultispendGroupKind,
        invitation: RpcEventId,
        vote: MultispendGroupVoteType,
    },

    GroupInvitationCancel {
        group_kind: MultispendGroupKind,
        invitation: RpcEventId,
    },

    /// Reannouncement of group to newly invite members.
    GroupReannounce {
        group_kind: MultispendGroupKind,
        invitation_id: RpcEventId,
        invitation: GroupInvitation,
        proposer: RpcUserId,
        pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
        rejections: BTreeSet<RpcUserId>,
    },

    DepositNotification {
        #[serde(flatten)]
        amount: MultispendAmount,
        txid: RpcTransactionId,
        description: String,
    },

    WithdrawalRequest {
        #[ts(
            type = "{ kind: \"fiat\"; transfer_amount: RpcFiatAmount } | { kind: \"btc\"; transfer_amount: RpcAmount }"
        )]
        request: MultispendTransferRequest,
        description: String,
    },

    WithdrawalResponse {
        group_kind: MultispendGroupKind,
        request: RpcEventId,
        response: WithdrawalResponseType,
    },
}

impl MsEvent {
    pub fn group_kind(&self) -> MultispendGroupKind {
        match self {
            MsEvent::GroupInvitation { group_kind, .. }
            | MsEvent::GroupInvitationVote { group_kind, .. }
            | MsEvent::GroupInvitationCancel { group_kind, .. }
            | MsEvent::GroupReannounce { group_kind, .. }
            | MsEvent::WithdrawalResponse { group_kind, .. } => *group_kind,
            MsEvent::DepositNotification { amount, .. } => amount.kind(),
            MsEvent::WithdrawalRequest { request, .. } => request.kind(),
        }
    }

    /// Parses the content of a Matrix event of `msgtype`, which fixes the
    /// group kind.
    pub fn from_matrix(msgtype: &str, content: serde_json::Value) -> anyhow::Result<Self> {
        let group_kind = match msgtype {
            MULTISPEND_MSGTYPE => MultispendGroupKind::Fiat,
            BTC_MULTISPEND_MSGTYPE => MultispendGroupKind::Btc,
            _ => anyhow::bail!("not a multispend msgtype: {msgtype}"),
        };
        let amount = |amount| -> anyhow::Result<_> {
            Ok(match group_kind {
                MultispendGroupKind::Fiat => {
                    MultispendAmount::FiatAmount(serde_json::from_value(amount)?)
                }
                MultispendGroupKind::Btc => {
                    MultispendAmount::BtcAmount(serde_json::from_value(amount)?)
                }
            })
        };
        Ok(match serde_json::from_value(content)? {
            WireEvent::GroupInvitation {
                invitation,
                proposer_pubkey,
            } => MsEvent::GroupInvitation {
                group_kind,
                invitation,
                proposer_pubkey,
            },
            WireEvent::GroupInvitationVote { invitation, vote } => MsEvent::GroupInvitationVote {
                group_kind,
                invitation,
                vote,
            },
            WireEvent::GroupInvitationCancel { invitation } => MsEvent::GroupInvitationCancel {
                group_kind,
                invitation,
            },
            WireEvent::GroupReannounce {
                invitation_id,
                invitation,
                proposer,
                pubkeys,
                rejections,
            } => MsEvent::GroupReannounce {
                group_kind,
                invitation_id,
                invitation,
                proposer,
                pubkeys,
                rejections,
            },
            WireEvent::DepositNotification {
                fiat_amount,
                txid,
                description,
            } => MsEvent::DepositNotification {
                amount: amount(fiat_amount)?,
                txid,
                description,
            },
            WireEvent::WithdrawalRequest {
                request,
                description,
            } => MsEvent::WithdrawalRequest {
                request: match group_kind {
                    MultispendGroupKind::Fiat => {
                        MultispendTransferRequest::Fiat(serde_json::from_value(request)?)
                    }
                    MultispendGroupKind::Btc => {
                        MultispendTransferRequest::Btc(serde_json::from_value(request)?)
                    }
                },
                description,
            },
            WireEvent::WithdrawalResponse { request, response } => MsEvent::WithdrawalResponse {
                group_kind,
                request,
                response: match response {
                    WireResponse::Approve { signature } => {
                        WithdrawalResponseType::Approve { signature }
                    }
                    WireResponse::Reject => WithdrawalResponseType::Reject,
                    WireResponse::Complete { fiat_amount, txid } => {
                        WithdrawalResponseType::Complete {
                            amount: amount(fiat_amount)?,
                            txid,
                        }
                    }
                    WireResponse::TxRejected { error } => {
                        WithdrawalResponseType::TxRejected { error }
                    }
                },
            },
        })
    }

    /// The msgtype and content of the Matrix event.
    pub fn to_matrix(&self) -> (&'static str, serde_json::Value) {
        let amount = |amount: &MultispendAmount| match amount {
            MultispendAmount::FiatAmount(amount) => serde_json::json!(amount),
            MultispendAmount::BtcAmount(amount) => serde_json::json!(amount),
        };
        let wire = match self.clone() {
            MsEvent::GroupInvitation {
                invitation,
                proposer_pubkey,
                ..
            } => WireEvent::GroupInvitation {
                invitation,
                proposer_pubkey,
            },
            MsEvent::GroupInvitationVote {
                invitation, vote, ..
            } => WireEvent::GroupInvitationVote { invitation, vote },
            MsEvent::GroupInvitationCancel { invitation, .. } => {
                WireEvent::GroupInvitationCancel { invitation }
            }
            MsEvent::GroupReannounce {
                invitation_id,
                invitation,
                proposer,
                pubkeys,
                rejections,
                ..
            } => WireEvent::GroupReannounce {
                invitation_id,
                invitation,
                proposer,
                pubkeys,
                rejections,
            },
            MsEvent::DepositNotification {
                amount: deposit,
                txid,
                description,
            } => WireEvent::DepositNotification {
                fiat_amount: amount(&deposit),
                txid,
                description,
            },
            MsEvent::WithdrawalRequest {
                request,
                description,
            } => WireEvent::WithdrawalRequest {
                request: match request {
                    MultispendTransferRequest::Fiat(request) => serde_json::json!(request),
                    MultispendTransferRequest::Btc(request) => serde_json::json!(request),
                },
                description,
            },
            MsEvent::WithdrawalResponse {
                request, response, ..
            } => WireEvent::WithdrawalResponse {
                request,
                response: match response {
                    WithdrawalResponseType::Approve { signature } => {
                        WireResponse::Approve { signature }
                    }
                    WithdrawalResponseType::Reject => WireResponse::Reject,
                    WithdrawalResponseType::Complete { amount: paid, txid } => {
                        WireResponse::Complete {
                            fiat_amount: amount(&paid),
                            txid,
                        }
                    }
                    WithdrawalResponseType::TxRejected { error } => {
                        WireResponse::TxRejected { error }
                    }
                },
            },
        };
        (
            self.group_kind().msgtype(),
            serde_json::to_value(wire).expect("multispend events serialize"),
        )
    }
}

/// Matrix content of an [`MsEvent`], unchanged since before bitcoin groups. A
/// bitcoin group puts msats under `fiatAmount` and a [`BtcTransferRequest`]
/// in `request`.
#[derive(Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
enum WireEvent {
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
    GroupReannounce {
        invitation_id: RpcEventId,
        invitation: GroupInvitation,
        proposer: RpcUserId,
        pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
        rejections: BTreeSet<RpcUserId>,
    },
    DepositNotification {
        fiat_amount: serde_json::Value,
        txid: RpcTransactionId,
        description: String,
    },
    WithdrawalRequest {
        request: serde_json::Value,
        description: String,
    },
    WithdrawalResponse {
        request: RpcEventId,
        response: WireResponse,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
enum WireResponse {
    Approve {
        signature: RpcSignature,
    },
    Reject,
    Complete {
        fiat_amount: serde_json::Value,
        txid: RpcTransactionId,
    },
    TxRejected {
        error: String,
    },
}

#[cfg(test)]
mod tests {
    use bitcoin::secp256k1::{Keypair, Message, SECP256K1};
    use fedimint_core::Amount;
    use serde_json::json;
    use stability_pool_client::common::FiatAmount;

    use super::*;

    fn keypair(byte: u8) -> Keypair {
        Keypair::from_seckey_slice(SECP256K1, &[byte; 32]).unwrap()
    }

    fn user(index: usize) -> RpcUserId {
        RpcUserId(format!("@user{index}:example.com"))
    }

    fn id(id: &str) -> RpcEventId {
        RpcEventId(id.to_string())
    }

    fn txid() -> RpcTransactionId {
        RpcTransactionId(format!("{:064x}", 1).parse().unwrap())
    }

    fn invitation() -> GroupInvitation {
        GroupInvitation {
            signers: BTreeSet::from([user(0), user(1)]),
            threshold: 2,
            federation_invite_code: "fed11".to_string(),
            federation_name: "test".to_string(),
        }
    }

    fn response(group_kind: MultispendGroupKind, response: WithdrawalResponseType) -> MsEvent {
        MsEvent::WithdrawalResponse {
            group_kind,
            request: id("$request"),
            response,
        }
    }

    #[test]
    fn fiat_events_serialize_like_master() {
        use MultispendGroupKind::Fiat;
        let pubkey = RpcPublicKey(keypair(1).public_key());
        let request = TransferRequest::new(
            1,
            Account::single(keypair(1).public_key(), AccountType::Seeker),
            FiatAmount(100),
            Account::single(keypair(2).public_key(), AccountType::Seeker).id(),
            vec![],
            u64::MAX,
            None,
        )
        .unwrap();
        let signature = RpcSignature(SECP256K1.sign_schnorr_no_aux_rand(
            &Message::from(&TransferRequestId::from(&request)),
            &keypair(1),
        ));
        let cases = [
            (
                MsEvent::GroupInvitation {
                    group_kind: Fiat,
                    invitation: invitation(),
                    proposer_pubkey: pubkey,
                },
                json!({
                    "kind": "groupInvitation",
                    "invitation": {
                        "signers": ["@user0:example.com", "@user1:example.com"],
                        "threshold": 2,
                        "federationInviteCode": "fed11",
                        "federationName": "test",
                    },
                    "proposerPubkey": pubkey,
                }),
            ),
            (
                MsEvent::GroupInvitationVote {
                    group_kind: Fiat,
                    invitation: id("$invitation"),
                    vote: MultispendGroupVoteType::Accept {
                        member_pubkey: pubkey,
                    },
                },
                json!({
                    "kind": "groupInvitationVote",
                    "invitation": "$invitation",
                    "vote": { "kind": "accept", "memberPubkey": pubkey },
                }),
            ),
            (
                MsEvent::GroupInvitationCancel {
                    group_kind: Fiat,
                    invitation: id("$invitation"),
                },
                json!({ "kind": "groupInvitationCancel", "invitation": "$invitation" }),
            ),
            (
                MsEvent::GroupReannounce {
                    group_kind: Fiat,
                    invitation_id: id("$invitation"),
                    invitation: invitation(),
                    proposer: user(0),
                    pubkeys: BTreeMap::from([(user(0), pubkey)]),
                    rejections: BTreeSet::from([user(1)]),
                },
                json!({
                    "kind": "groupReannounce",
                    "invitationId": "$invitation",
                    "invitation": invitation(),
                    "proposer": "@user0:example.com",
                    "pubkeys": { "@user0:example.com": pubkey },
                    "rejections": ["@user1:example.com"],
                }),
            ),
            (
                MsEvent::DepositNotification {
                    amount: MultispendAmount::FiatAmount(RpcFiatAmount(250)),
                    txid: txid(),
                    description: "deposit".to_string(),
                },
                json!({
                    "kind": "depositNotification",
                    "fiatAmount": 250,
                    "txid": txid(),
                    "description": "deposit",
                }),
            ),
            (
                MsEvent::WithdrawalRequest {
                    request: MultispendTransferRequest::Fiat(request.clone()),
                    description: "withdraw".to_string(),
                },
                json!({
                    "kind": "withdrawalRequest",
                    "request": request,
                    "description": "withdraw",
                }),
            ),
            (
                response(
                    Fiat,
                    WithdrawalResponseType::Approve {
                        signature: signature.clone(),
                    },
                ),
                json!({
                    "kind": "withdrawalResponse",
                    "request": "$request",
                    "response": { "kind": "approve", "signature": signature },
                }),
            ),
            (
                response(Fiat, WithdrawalResponseType::Reject),
                json!({
                    "kind": "withdrawalResponse",
                    "request": "$request",
                    "response": { "kind": "reject" },
                }),
            ),
            (
                response(
                    Fiat,
                    WithdrawalResponseType::Complete {
                        amount: MultispendAmount::FiatAmount(RpcFiatAmount(100)),
                        txid: txid(),
                    },
                ),
                json!({
                    "kind": "withdrawalResponse",
                    "request": "$request",
                    "response": { "kind": "complete", "fiatAmount": 100, "txid": txid() },
                }),
            ),
            (
                response(
                    Fiat,
                    WithdrawalResponseType::TxRejected {
                        error: "rejected".to_string(),
                    },
                ),
                json!({
                    "kind": "withdrawalResponse",
                    "request": "$request",
                    "response": { "kind": "txRejected", "error": "rejected" },
                }),
            ),
        ];
        for (event, expected) in cases {
            assert_eq!(event.to_matrix(), (MULTISPEND_MSGTYPE, expected.clone()));
            assert_eq!(
                MsEvent::from_matrix(MULTISPEND_MSGTYPE, expected).unwrap(),
                event
            );
        }
    }

    #[test]
    fn btc_events_have_their_own_msgtype() {
        use MultispendGroupKind::Btc;
        let group = Account::single(keypair(1).public_key(), AccountType::BtcDepositor);
        let payout = Account::single(keypair(2).public_key(), AccountType::BtcDepositor);
        let request = BtcTransferRequest::new(
            1,
            group,
            Amount::from_msats(5_000),
            payout.id(),
            vec![],
            u64::MAX,
        )
        .unwrap();
        let msats = MultispendAmount::BtcAmount(RpcAmount(Amount::from_msats(5_000)));
        let cases = [
            (
                MsEvent::GroupInvitationCancel {
                    group_kind: Btc,
                    invitation: id("$invitation"),
                },
                json!({ "kind": "groupInvitationCancel", "invitation": "$invitation" }),
            ),
            (
                MsEvent::DepositNotification {
                    amount: msats,
                    txid: txid(),
                    description: "deposit".to_string(),
                },
                json!({
                    "kind": "depositNotification",
                    "fiatAmount": 5_000,
                    "txid": txid(),
                    "description": "deposit",
                }),
            ),
            (
                MsEvent::WithdrawalRequest {
                    request: MultispendTransferRequest::Btc(request.clone()),
                    description: "withdraw".to_string(),
                },
                json!({
                    "kind": "withdrawalRequest",
                    "request": request,
                    "description": "withdraw",
                }),
            ),
            (
                response(
                    Btc,
                    WithdrawalResponseType::Complete {
                        amount: msats,
                        txid: txid(),
                    },
                ),
                json!({
                    "kind": "withdrawalResponse",
                    "request": "$request",
                    "response": { "kind": "complete", "fiatAmount": 5_000, "txid": txid() },
                }),
            ),
        ];
        for (event, expected) in cases {
            assert_eq!(
                event.to_matrix(),
                (BTC_MULTISPEND_MSGTYPE, expected.clone())
            );
            assert_eq!(
                MsEvent::from_matrix(BTC_MULTISPEND_MSGTYPE, expected).unwrap(),
                event
            );
        }
        assert!(
            MsEvent::from_matrix(
                "m.text",
                json!({ "kind": "groupInvitationCancel", "invitation": "$i" })
            )
            .is_err()
        );
    }

    #[test]
    fn ui_json_carries_the_kind() {
        let deposit = MsEvent::DepositNotification {
            amount: MultispendAmount::BtcAmount(RpcAmount(Amount::from_msats(5_000))),
            txid: txid(),
            description: String::new(),
        };
        let json = serde_json::to_value(&deposit).unwrap();
        assert_eq!(json["kind"], "depositNotification");
        assert_eq!(json["btcAmount"], 5_000);
        assert_eq!(serde_json::from_value::<MsEvent>(json).unwrap(), deposit);
        let vote = serde_json::to_value(MsEvent::GroupInvitationVote {
            group_kind: MultispendGroupKind::Btc,
            invitation: id("$invitation"),
            vote: MultispendGroupVoteType::Reject,
        })
        .unwrap();
        assert_eq!(vote["groupKind"], "btc");
    }
}
