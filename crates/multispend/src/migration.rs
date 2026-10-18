//! One-time rewrite of multispend records written before bitcoin groups.
//!
//! Bitcoin groups changed the encoding of the group kind, transfer requests and
//! amounts in prefixes 0x01-0x04, 0x09 and 0x0A, and added the group kind to
//! the group status (0x01), invitation (0x02) and chronological event (0x06)
//! keys. Every record
//! there was a fiat record, so each one is decoded in the old layout and
//! written back as fiat.
//! After the migration, an older app version cannot decode multispend records.
//!
//! Releases 25.5.0-25.6.0 wrote two of these layouts differently, and 25.6.1
//! read their rows without migrating them: withdrawal requests (0x03) with
//! `completed: Option<RpcTransactionId>` where 25.6.1 has
//! `tx_submission_status`, and pending completion notifications (0x0A) without
//! the `FailedWithdrawal` variant, so `Deposit` had index 1. Such rows are
//! read in their old layout, see [`OrLegacy`].

use std::collections::{BTreeMap, BTreeSet};

use anyhow::Context as _;
use fedimint_core::db::{
    Database, DatabaseTransaction, DatabaseVersion, DbMigrationFn, DbMigrationFnContext,
    IDatabaseTransactionOpsCore as _, IDatabaseTransactionOpsCoreTyped as _, apply_migrations,
};
use fedimint_core::encoding::{Decodable, DecodeError, Encodable};
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::task::{MaybeSend, MaybeSync};
use futures::StreamExt as _;
use rpc_types::matrix::{RpcRoomId, RpcUserId};
use rpc_types::{
    RpcEventId, RpcFederationId, RpcFiatAmount, RpcPublicKey, RpcSignature, RpcTransactionId,
};
use stability_pool_client::common::{Account, SignedTransferRequest, TransferRequest};
use tracing::info;

use crate::db::{
    MultispendChronologicalEventData, MultispendChronologicalEventKey, MultispendDbPrefix,
    MultispendGroupStatus, MultispendGroupStatusKey, MultispendInvitationKey,
    MultispendPendingApprovedWithdrawalRequestKey, MultispendPendingCompletionNotification,
};
use crate::{
    FinalizedGroup, GroupInvitation, GroupInvitationWithKeys, MultispendAmount,
    MultispendDepositEventData, MultispendGroupKind, MultispendTransferRequest,
    SignedMultispendTransferRequest, WithdrawRequestWithApprovals, WithdrawTxSubmissionStatus,
};

/// Bring the multispend database to the current version with fedimint's
/// migration runner. The runner keeps the version under its own
/// `DatabaseVersionKey` inside `db`, runs the pending migrations in one
/// transaction and refuses a database newer than this code. A new database
/// starts at the current version.
pub async fn migrate_multispend_db(db: &Database) -> anyhow::Result<()> {
    let mut migrations: BTreeMap<DatabaseVersion, DbMigrationFn<()>> = BTreeMap::new();
    migrations.insert(
        DatabaseVersion(0),
        Box::new(|ctx| Box::pin(migrate_to_btc_groups(ctx))),
    );
    apply_migrations(db, (), "multispend".to_string(), migrations, None, None).await
}

/// Rewrite the records written before bitcoin groups in the current encoding.
async fn migrate_to_btc_groups(mut ctx: DbMigrationFnContext<'_, ()>) -> anyhow::Result<()> {
    let mut dbtx = ctx.dbtx();
    let mut migrated = 0;
    migrated += migrate_records(
        &mut dbtx.to_ref_nc(),
        MultispendDbPrefix::MultispendGroupStatus,
        |room_id: RpcRoomId, status: GroupStatusV0| {
            let status = match status {
                GroupStatusV0::Finalized {
                    invite_event_id,
                    finalized_group,
                } => MultispendGroupStatus::Finalized {
                    invite_event_id,
                    finalized_group: FinalizedGroup {
                        invitation: finalized_group.invitation,
                        kind: MultispendGroupKind::Fiat,
                        proposer: finalized_group.proposer,
                        pubkeys: finalized_group.pubkeys,
                        spv2_account: finalized_group.spv2_account,
                        federation_id: finalized_group.federation_id,
                    },
                },
                GroupStatusV0::ActiveInvitation { active_invite_id } => {
                    MultispendGroupStatus::ActiveInvitation { active_invite_id }
                }
            };
            (
                MultispendGroupStatusKey(room_id, MultispendGroupKind::Fiat),
                status,
            )
        },
    )
    .await?;
    migrated += migrate_records(
        &mut dbtx.to_ref_nc(),
        MultispendDbPrefix::MultispendGroupInvitations,
        |key: InvitationKeyV0, invitation: GroupInvitationWithKeysV0| {
            (
                MultispendInvitationKey(key.room_id, MultispendGroupKind::Fiat, key.event_id),
                GroupInvitationWithKeys {
                    invitation: invitation.invitation,
                    kind: MultispendGroupKind::Fiat,
                    proposer: invitation.proposer,
                    pubkeys: invitation.pubkeys,
                    rejections: invitation.rejections,
                    federation_id: invitation.federation_id,
                },
            )
        },
    )
    .await?;
    migrated += migrate_values(
        &mut dbtx.to_ref_nc(),
        MultispendDbPrefix::MultispendWithdrawRequests,
        |request: OrLegacy<WithdrawRequestWithApprovalsV0, LegacyWithdrawRequestWithApprovals>| {
            let request = match request {
                OrLegacy::Current(request) => request,
                OrLegacy::Legacy(request) => WithdrawRequestWithApprovalsV0 {
                    request: request.request,
                    description: request.description,
                    signatures: request.signatures,
                    rejections: request.rejections,
                    tx_submission_status: match request.completed {
                        Some(txid) => WithdrawTxSubmissionStatus::Accepted { txid },
                        None => WithdrawTxSubmissionStatus::Unknown,
                    },
                    sender: request.sender,
                },
            };
            WithdrawRequestWithApprovals {
                request: MultispendTransferRequest::Fiat(request.request),
                description: request.description,
                signatures: request.signatures,
                rejections: request.rejections,
                tx_submission_status: request.tx_submission_status,
                sender: request.sender,
            }
        },
    )
    .await?;
    migrated += migrate_values(
        &mut dbtx.to_ref_nc(),
        MultispendDbPrefix::MultispendDepositEvent,
        |deposit: DepositEventDataV0| MultispendDepositEventData {
            user: deposit.user,
            amount: MultispendAmount::FiatAmount(deposit.fiat_amount),
            txid: deposit.txid,
            description: deposit.description,
        },
    )
    .await?;
    migrated += migrate_records(
        &mut dbtx.to_ref_nc(),
        MultispendDbPrefix::MultispendChronologicalEvent,
        |key: ChronologicalEventKeyV0, event: MultispendChronologicalEventData| {
            (
                MultispendChronologicalEventKey {
                    room_id: key.room_id,
                    kind: MultispendGroupKind::Fiat,
                    counter: key.counter,
                },
                event,
            )
        },
    )
    .await?;
    migrated += migrate_records(
        &mut dbtx.to_ref_nc(),
        MultispendDbPrefix::MultispendPendingApprovedWithdrawalRequests,
        |key: PendingApprovedWithdrawalRequestKeyV0, ()| {
            (
                MultispendPendingApprovedWithdrawalRequestKey {
                    room_id: key.room_id,
                    request_event_id: key.request_event_id,
                    federation_id: key.federation_id,
                    transfer_request: SignedMultispendTransferRequest::Fiat(key.transfer_request),
                },
                (),
            )
        },
    )
    .await?;
    migrated += migrate_records(
        &mut dbtx.to_ref_nc(),
        MultispendDbPrefix::MultispendPendingCompletionNotification,
        |notification: OrLegacy<
            PendingCompletionNotificationV0,
            LegacyPendingCompletionNotification,
        >,
         ()| {
            let notification = match notification {
                OrLegacy::Current(notification) => notification,
                OrLegacy::Legacy(LegacyPendingCompletionNotification::Withdrawal {
                    room_id,
                    request_id,
                    fiat_amount,
                    txid,
                }) => PendingCompletionNotificationV0::Withdrawal {
                    room_id,
                    request_id,
                    fiat_amount,
                    txid,
                },
                OrLegacy::Legacy(LegacyPendingCompletionNotification::Deposit {
                    room_id,
                    fiat_amount,
                    txid,
                    description,
                }) => PendingCompletionNotificationV0::Deposit {
                    room_id,
                    fiat_amount,
                    txid,
                    description,
                },
            };
            let notification = match notification {
                PendingCompletionNotificationV0::Withdrawal {
                    room_id,
                    request_id,
                    fiat_amount,
                    txid,
                } => MultispendPendingCompletionNotification::Withdrawal {
                    room_id,
                    request_id,
                    amount: MultispendAmount::FiatAmount(fiat_amount),
                    txid,
                },
                PendingCompletionNotificationV0::FailedWithdrawal {
                    room_id,
                    request_id,
                    error,
                } => MultispendPendingCompletionNotification::FailedWithdrawal {
                    room_id,
                    request_id,
                    group_kind: MultispendGroupKind::Fiat,
                    error,
                },
                PendingCompletionNotificationV0::Deposit {
                    room_id,
                    fiat_amount,
                    txid,
                    description,
                } => MultispendPendingCompletionNotification::Deposit {
                    room_id,
                    amount: MultispendAmount::FiatAmount(fiat_amount),
                    txid,
                    description,
                },
            };
            (notification, ())
        },
    )
    .await?;
    info!(migrated, "migrated multispend database");
    Ok(())
}

/// Re-encode every value under `prefix`, keeping its key.
async fn migrate_values<Old: Decodable, New: Encodable>(
    dbtx: &mut DatabaseTransaction<'_>,
    prefix: MultispendDbPrefix,
    migrate: impl Fn(Old) -> New,
) -> anyhow::Result<usize> {
    let rows = raw_rows(dbtx, prefix).await?;
    for (key, value) in &rows {
        let old = Old::consensus_decode_whole(value, &ModuleDecoderRegistry::default())
            .with_context(|| format!("decoding multispend value under {key:02x?}"))?;
        dbtx.raw_insert_bytes(key, &migrate(old).consensus_encode_to_vec())
            .await?;
    }
    Ok(rows.len())
}

/// Re-encode every key and value under `prefix`.
async fn migrate_records<OldKey: Decodable, Old: Decodable, New>(
    dbtx: &mut DatabaseTransaction<'_>,
    prefix: MultispendDbPrefix,
    migrate: impl Fn(OldKey, Old) -> (New, New::Value),
) -> anyhow::Result<usize>
where
    New: fedimint_core::db::DatabaseRecord + fedimint_core::db::DatabaseKey + MaybeSend + MaybeSync,
    New::Value: MaybeSend + MaybeSync,
{
    let decoders = ModuleDecoderRegistry::default();
    let rows = raw_rows(dbtx, prefix).await?;
    for (key, value) in &rows {
        let old_key = OldKey::consensus_decode_whole(&key[1..], &decoders)
            .with_context(|| format!("decoding multispend key {key:02x?}"))?;
        let old = Old::consensus_decode_whole(value, &decoders)
            .with_context(|| format!("decoding multispend value under {key:02x?}"))?;
        let (new_key, new) = migrate(old_key, old);
        dbtx.raw_remove_entry(key).await?;
        dbtx.insert_new_entry(&new_key, &new).await;
    }
    Ok(rows.len())
}

async fn raw_rows(
    dbtx: &mut DatabaseTransaction<'_>,
    prefix: MultispendDbPrefix,
) -> anyhow::Result<Vec<(Vec<u8>, Vec<u8>)>> {
    Ok(dbtx
        .raw_find_by_prefix(&[prefix as u8])
        .await?
        .collect()
        .await)
}

// Layouts written before bitcoin groups. Field order is the encoding.

#[derive(Encodable, Decodable)]
struct GroupInvitationWithKeysV0 {
    invitation: GroupInvitation,
    proposer: RpcUserId,
    pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
    rejections: BTreeSet<RpcUserId>,
    federation_id: RpcFederationId,
}

#[derive(Encodable, Decodable)]
struct FinalizedGroupV0 {
    invitation: GroupInvitation,
    proposer: RpcUserId,
    pubkeys: BTreeMap<RpcUserId, RpcPublicKey>,
    spv2_account: Account,
    federation_id: RpcFederationId,
}

#[derive(Encodable, Decodable)]
enum GroupStatusV0 {
    Finalized {
        invite_event_id: RpcEventId,
        finalized_group: FinalizedGroupV0,
    },
    ActiveInvitation {
        active_invite_id: RpcEventId,
    },
}

#[derive(Encodable, Decodable)]
struct WithdrawRequestWithApprovalsV0 {
    request: TransferRequest,
    description: String,
    signatures: BTreeMap<RpcUserId, RpcSignature>,
    rejections: BTreeSet<RpcUserId>,
    tx_submission_status: WithdrawTxSubmissionStatus,
    sender: RpcUserId,
}

#[derive(Encodable, Decodable)]
struct DepositEventDataV0 {
    user: RpcUserId,
    fiat_amount: RpcFiatAmount,
    txid: RpcTransactionId,
    description: String,
}

#[derive(Encodable, Decodable)]
struct InvitationKeyV0 {
    room_id: RpcRoomId,
    event_id: RpcEventId,
}

#[derive(Encodable, Decodable)]
struct ChronologicalEventKeyV0 {
    room_id: RpcRoomId,
    counter: u64,
}

#[derive(Encodable, Decodable)]
struct PendingApprovedWithdrawalRequestKeyV0 {
    room_id: RpcRoomId,
    request_event_id: RpcEventId,
    federation_id: RpcFederationId,
    transfer_request: SignedTransferRequest,
}

#[derive(Encodable, Decodable)]
enum PendingCompletionNotificationV0 {
    Withdrawal {
        room_id: RpcRoomId,
        request_id: RpcEventId,
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
    },
    FailedWithdrawal {
        room_id: RpcRoomId,
        request_id: RpcEventId,
        error: String,
    },
    Deposit {
        room_id: RpcRoomId,
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
        description: String,
    },
}

/// A record in the layout `Current`, or else in the `Legacy` layout that
/// 25.5.0-25.6.0 wrote. Each attempt must consume the whole record, which
/// tells the layouts apart; only a record whose bytes happen to be valid in
/// both would be read as `Current`. That needs, for a legacy deposit notice,
/// its amount, txid and description to also read as exactly a request id and
/// an error string, and for a legacy withdrawal request, its `completed` and
/// sender to read as exactly a submission status and a sender.
enum OrLegacy<Current, Legacy> {
    Current(Current),
    Legacy(Legacy),
}

impl<Current: Decodable, Legacy: Decodable> Decodable for OrLegacy<Current, Legacy> {
    fn consensus_decode_partial_from_finite_reader<R: std::io::Read>(
        r: &mut R,
        modules: &ModuleDecoderRegistry,
    ) -> Result<Self, DecodeError> {
        let mut bytes = Vec::new();
        r.read_to_end(&mut bytes)
            .map_err(|e| DecodeError::new_custom(e.into()))?;
        match Current::consensus_decode_whole(&bytes, modules) {
            Ok(current) => Ok(Self::Current(current)),
            // report the current layout's error if neither fits
            Err(err) => Legacy::consensus_decode_whole(&bytes, modules)
                .map(Self::Legacy)
                .map_err(|_| err),
        }
    }
}

/// [`WithdrawRequestWithApprovalsV0`] as 25.5.0-25.6.0 wrote it.
#[derive(Encodable, Decodable)]
struct LegacyWithdrawRequestWithApprovals {
    request: TransferRequest,
    description: String,
    signatures: BTreeMap<RpcUserId, RpcSignature>,
    rejections: BTreeSet<RpcUserId>,
    completed: Option<RpcTransactionId>,
    sender: RpcUserId,
}

/// [`PendingCompletionNotificationV0`] as 25.5.0-25.6.0 wrote it.
#[derive(Encodable, Decodable)]
enum LegacyPendingCompletionNotification {
    Withdrawal {
        room_id: RpcRoomId,
        request_id: RpcEventId,
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
    },
    Deposit {
        room_id: RpcRoomId,
        fiat_amount: RpcFiatAmount,
        txid: RpcTransactionId,
        description: String,
    },
}

#[cfg(test)]
mod tests {
    use fedimint_core::db::mem_impl::MemDatabase;
    use fedimint_core::db::{DatabaseVersionKey, MODULE_GLOBAL_PREFIX};
    use runtime::db::BridgeDbPrefix;
    use runtime::storage::BRIDGE_DB_PREFIX;
    use stability_pool_client::common::{AccountType, AccountUnchecked, FiatAmount};

    use super::*;
    use crate::db::{
        MultispendPendingApprovedWithdrawalRequestKeyPrefix,
        MultispendPendingCompletionNotificationId, MultispendPendingCompletionNotificationPrefix,
        MultispendPendingCompletionNotificationTxnIdKey,
    };
    use crate::{MsEventData, get_event_data_db, get_group_status_db, list_multispend_events};

    /// Every record of a master database before bitcoin groups: room
    /// `!room:example.com` holds a finalized 2-of-2 fiat group of alice (key
    /// [1; 32]) and bob (key [2; 32]), alice's $1.00 withdrawal `$withdrawal`
    /// approved by both and queued for submission, bob's $2.50 deposit
    /// `$deposit` (txid 2), and three pending completion notices. Room
    /// `!pending:example.com` has an active invitation that bob rejected.
    const MASTER_ROWS: &[(&str, &str)] = &[
        (
            "011121726f6f6d3a6578616d706c652e636f6d",
            "00fd01d30b24696e7669746174696f6e021240616c6963653a6578616d706c652e636f6d1040626f623a6578616d706c652e636f6d029a66656431317167717267766e687764656e3574653076396b387136727039656b68326172666465756b75657435393563723274747064336a687136727a7665367a75657239776368787665747964393338676365777664686b3674637171797370746b75766b6e633765726a676634656d337a666839306b66667166397372756a6e36713533643672303536653461707a65356377323768373504746573741240616c6963653a6578616d706c652e636f6d021240616c6963653a6578616d706c652e636f6d031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f1040626f623a6578616d706c652e636f6d024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766000002024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f024031356462386362346631656338653438346437336238383933373262656339343831323538306639323965383134386237343337643335396166343232636433",
        ),
        (
            "01142170656e64696e673a6578616d706c652e636f6d",
            "010f0e2470656e64696e67696e76697465",
        ),
        (
            "021121726f6f6d3a6578616d706c652e636f6d0b24696e7669746174696f6e",
            "021240616c6963653a6578616d706c652e636f6d1040626f623a6578616d706c652e636f6d029a66656431317167717267766e687764656e3574653076396b387136727039656b68326172666465756b75657435393563723274747064336a687136727a7665367a75657239776368787665747964393338676365777664686b3674637171797370746b75766b6e633765726a676634656d337a666839306b66667166397372756a6e36713533643672303536653461707a65356377323768373504746573741240616c6963653a6578616d706c652e636f6d021240616c6963653a6578616d706c652e636f6d031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f1040626f623a6578616d706c652e636f6d024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766004031356462386362346631656338653438346437336238383933373262656339343831323538306639323965383134386237343337643335396166343232636433",
        ),
        (
            "02142170656e64696e673a6578616d706c652e636f6d0e2470656e64696e67696e76697465",
            "021240616c6963653a6578616d706c652e636f6d1040626f623a6578616d706c652e636f6d029a66656431317167717267766e687764656e3574653076396b387136727039656b68326172666465756b75657435393563723274747064336a687136727a7665367a75657239776368787665747964393338676365777664686b3674637171797370746b75766b6e633765726a676634656d337a666839306b66667166397372756a6e36713533643672303536653461707a65356377323768373504746573741240616c6963653a6578616d706c652e636f6d011240616c6963653a6578616d706c652e636f6d031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f011040626f623a6578616d706c652e636f6d4031356462386362346631656338653438346437336238383933373262656339343831323538306639323965383134386237343337643335396166343232636433",
        ),
        (
            "031121726f6f6d3a6578616d706c652e636f6d0b247769746864726177616c",
            "01000002024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f02640000027c5fe1c6914193a1a1aa10988b6555c0ad9efcd9d8bbb0ccf5b7d9c3230cb300ffffffffffffffffff000a7769746864726177616c021240616c6963653a6578616d706c652e636f6db282d60c3443792a1cdaa1c36a4042a50ef6333adf2ae62077395aabcf76ad4f625c1fa0fa21c4d7307c47688d7d0ab524dc28ec115dc5acaa13a8324129c8eb1040626f623a6578616d706c652e636f6d2ac2996edda9151d5c1af8bd29682bff625bb29f4be5a48869f1749553fbd011131c11aab04e6e5cb88ccd37b3ef9e58c86e424b3bef40f5cdb40a1b3823887d0000001240616c6963653a6578616d706c652e636f6d",
        ),
        (
            "041121726f6f6d3a6578616d706c652e636f6d08246465706f736974",
            "1040626f623a6578616d706c652e636f6dfa0000000000000000000000000000000000000000000000000000000000000002076465706f736974",
        ),
        (
            "061121726f6f6d3a6578616d706c652e636f6d00",
            "0b247769746864726177616cfd03ea",
        ),
        (
            "061121726f6f6d3a6578616d706c652e636f6d01",
            "08246465706f736974fd03ed",
        ),
        (
            "091121726f6f6d3a6578616d706c652e636f6d0b247769746864726177616c403135646238636234663165633865343834643733623838393337326265633934383132353830663932396538313438623734333764333539616634323263643302002ac2996edda9151d5c1af8bd29682bff625bb29f4be5a48869f1749553fbd011131c11aab04e6e5cb88ccd37b3ef9e58c86e424b3bef40f5cdb40a1b3823887d01b282d60c3443792a1cdaa1c36a4042a50ef6333adf2ae62077395aabcf76ad4f625c1fa0fa21c4d7307c47688d7d0ab524dc28ec115dc5acaa13a8324129c8eb01000002024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f02640000027c5fe1c6914193a1a1aa10988b6555c0ad9efcd9d8bbb0ccf5b7d9c3230cb300ffffffffffffffffff00",
            "",
        ),
        (
            "0a003f1121726f6f6d3a6578616d706c652e636f6d0b247769746864726177616c640000000000000000000000000000000000000000000000000000000000000003",
            "",
        ),
        (
            "0a01221121726f6f6d3a6578616d706c652e636f6d06246f746865720872656a6563746564",
            "",
        ),
        (
            "0a023b1121726f6f6d3a6578616d706c652e636f6dfa0000000000000000000000000000000000000000000000000000000000000002076465706f736974",
            "",
        ),
    ];

    fn hex(bytes: &str) -> Vec<u8> {
        (0..bytes.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&bytes[i..i + 2], 16).unwrap())
            .collect()
    }

    /// Rows of 25.5.0-25.6.0 next to the same rows as 25.6.1 and later write
    /// them, as (key, legacy value, current value) for withdrawal requests
    /// and (legacy key, current key) for a deposit notice. The pending
    /// withdrawal `$MyW4…` has `completed: None`, the completed `$No3m…` has
    /// `completed: Some(54a68ead…)`. Made by QA from a master database.
    const LEGACY_WITHDRAW_REQUEST_ROWS: &[(&str, &str, &str)] = &[
        (
            "03242155515068756e61536347486a4f677a6a50703a73796e617073652e646576692e6f72672c244d7957344a384c7a3336566b4737546e7a337a394457666a6c71446c6c4b306f4c5a4931755a4764456849",
            "ffc3b65cb0a7b7922c00000203a72271104fef5cf314c9dda03f62d7c3e6f0903fbe6f14169676f7a6bd57cbc303b22a3eea11ec207e3f0323def52a7bfdd8e695fbc01705f1e1b8a2cc09c89cc102320000f421cf46d8b383a6d883a2212122d50128db8f58e6e512da01727602bae72b3a00ffffffffffffffffff000a77342070656e64696e6700000051406e7075623130347379773939786e716e646d6c71716b6b387438616e687838637a63736d396a6d306d676b6c726364367270306b32377834716c74657474643a73796e617073652e646576692e6f7267",
            "ffc3b65cb0a7b7922c00000203a72271104fef5cf314c9dda03f62d7c3e6f0903fbe6f14169676f7a6bd57cbc303b22a3eea11ec207e3f0323def52a7bfdd8e695fbc01705f1e1b8a2cc09c89cc102320000f421cf46d8b383a6d883a2212122d50128db8f58e6e512da01727602bae72b3a00ffffffffffffffffff000a77342070656e64696e670000000051406e7075623130347379773939786e716e646d6c71716b6b387438616e687838637a63736d396a6d306d676b6c726364367270306b32377834716c74657474643a73796e617073652e646576692e6f7267",
        ),
        (
            "03242155515068756e61536347486a4f677a6a50703a73796e617073652e646576692e6f72672c244e6f336d3332523457466334416a4f527933394c487378482d7531674876317162326b6a324e6a5438346b",
            "ff76c22ea424c9b1e300000203a72271104fef5cf314c9dda03f62d7c3e6f0903fbe6f14169676f7a6bd57cbc303b22a3eea11ec207e3f0323def52a7bfdd8e695fbc01705f1e1b8a2cc09c89cc102c80000c25b8da1f9d616ba09da29fde06c981b4725cfbe9f8934dd42aa73d6c410f46f00ffffffffffffffffff000b773120636f6d706c6574650251406e7075623130347379773939786e716e646d6c71716b6b387438616e687838637a63736d396a6d306d676b6c726364367270306b32377834716c74657474643a73796e617073652e646576692e6f7267b6d4b819e85be95d5ce40fc80668bbf528fc733fc6808355ff2906f805bbaded90c56237a38f4893990c915783e13ec49a3f2f336fc734330dd5dd1182a2970d51406e70756231676a61363967306c37393975776861716c366e64633671306a7679783637306665323536753072677835736575397875676c39717075717764703a73796e617073652e646576692e6f7267ff0b528a18d62fb8d4036de90e6e179be9bf699a92d8d11eef6ed2c237bdfcdceaf87e16dc6789ccbafa4121517bf297c614a15c5b61e3e6f3489e65148914e5000154a68eadc02b613a33addf1635dcf3685f07db86935c8e049d3b99c15b53c21b51406e70756231676a61363967306c37393975776861716c366e64633671306a7679783637306665323536753072677835736575397875676c39717075717764703a73796e617073652e646576692e6f7267",
            "ff76c22ea424c9b1e300000203a72271104fef5cf314c9dda03f62d7c3e6f0903fbe6f14169676f7a6bd57cbc303b22a3eea11ec207e3f0323def52a7bfdd8e695fbc01705f1e1b8a2cc09c89cc102c80000c25b8da1f9d616ba09da29fde06c981b4725cfbe9f8934dd42aa73d6c410f46f00ffffffffffffffffff000b773120636f6d706c6574650251406e7075623130347379773939786e716e646d6c71716b6b387438616e687838637a63736d396a6d306d676b6c726364367270306b32377834716c74657474643a73796e617073652e646576692e6f7267b6d4b819e85be95d5ce40fc80668bbf528fc733fc6808355ff2906f805bbaded90c56237a38f4893990c915783e13ec49a3f2f336fc734330dd5dd1182a2970d51406e70756231676a61363967306c37393975776861716c366e64633671306a7679783637306665323536753072677835736575397875676c39717075717764703a73796e617073652e646576692e6f7267ff0b528a18d62fb8d4036de90e6e179be9bf699a92d8d11eef6ed2c237bdfcdceaf87e16dc6789ccbafa4121517bf297c614a15c5b61e3e6f3489e65148914e500012054a68eadc02b613a33addf1635dcf3685f07db86935c8e049d3b99c15b53c21b51406e70756231676a61363967306c37393975776861716c366e64633671306a7679783637306665323536753072677835736575397875676c39717075717764703a73796e617073652e646576692e6f7267",
        ),
    ];
    const LEGACY_DEPOSIT_NOTICE_KEYS: (&str, &str) = (
        "0a015b242172554e5366514643717850784d464d49534f3a73796e617073652e646576692e6f72673c3bcb8c617be7469d0f8f681062bfa4e472289b9e201e0be66a0c6ac04c6056b11463206465702070656e64696e67206e6f74696365",
        "0a025b242172554e5366514643717850784d464d49534f3a73796e617073652e646576692e6f72673c3bcb8c617be7469d0f8f681062bfa4e472289b9e201e0be66a0c6ac04c6056b11463206465702070656e64696e67206e6f74696365",
    );

    async fn master_db() -> Database {
        let db = Database::new(MemDatabase::new(), ModuleDecoderRegistry::default());
        let mut dbtx = db.begin_transaction().await;
        for (key, value) in MASTER_ROWS {
            dbtx.raw_insert_bytes(&hex(key), &hex(value)).await.unwrap();
        }
        dbtx.commit_tx().await;
        db
    }

    async fn dump(db: &Database) -> Vec<(Vec<u8>, Vec<u8>)> {
        db.begin_transaction_nc()
            .await
            .raw_find_by_prefix(&[])
            .await
            .unwrap()
            .collect()
            .await
    }

    fn keypair(byte: u8) -> bitcoin::secp256k1::Keypair {
        bitcoin::secp256k1::Keypair::from_seckey_slice(bitcoin::secp256k1::SECP256K1, &[byte; 32])
            .unwrap()
    }

    fn user(name: &str) -> RpcUserId {
        RpcUserId(format!("@{name}:example.com"))
    }

    fn txid(byte: u8) -> RpcTransactionId {
        RpcTransactionId(format!("{byte:064x}").parse().unwrap())
    }

    #[tokio::test]
    async fn migrates_master_fiat_records() {
        let db = master_db().await;
        migrate_multispend_db(&db).await.unwrap();
        let migrated = dump(&db).await;
        // every record is rewritten in place, plus the version
        assert_eq!(migrated.len(), MASTER_ROWS.len() + 1);
        assert_eq!(version(&db).await, Some(DatabaseVersion(1)));
        // a second launch changes nothing
        migrate_multispend_db(&db).await.unwrap();
        assert_eq!(dump(&db).await, migrated);

        let room = RpcRoomId("!room:example.com".to_string());
        let mut dbtx = db.begin_transaction_nc().await;
        let Some(MultispendGroupStatus::Finalized {
            invite_event_id,
            finalized_group,
        }) = get_group_status_db(&mut dbtx, &room, MultispendGroupKind::Fiat).await
        else {
            panic!("group is no longer finalized")
        };
        assert_eq!(invite_event_id, RpcEventId("$invitation".to_string()));
        assert_eq!(finalized_group.kind, MultispendGroupKind::Fiat);
        let group_account: Account = AccountUnchecked {
            acc_type: AccountType::Seeker,
            pub_keys: [1, 2].map(|byte| keypair(byte).public_key()).into(),
            threshold: 2,
        }
        .try_into()
        .unwrap();
        assert_eq!(finalized_group.spv2_account, group_account);
        assert_eq!(
            finalized_group.pubkeys,
            BTreeMap::from([
                (user("alice"), RpcPublicKey(keypair(1).public_key())),
                (user("bob"), RpcPublicKey(keypair(2).public_key())),
            ])
        );
        assert_eq!(
            finalized_group.federation_id.0,
            "15db8cb4f1ec8e484d73b889372bec94812580f929e8148b7437d359af422cd3"
        );

        let pending_room = RpcRoomId("!pending:example.com".to_string());
        let Some(MultispendGroupStatus::ActiveInvitation { active_invite_id }) =
            get_group_status_db(&mut dbtx, &pending_room, MultispendGroupKind::Fiat).await
        else {
            panic!("invitation is no longer active")
        };
        let invitation = dbtx
            .get_value(&MultispendInvitationKey(
                pending_room.clone(),
                MultispendGroupKind::Fiat,
                active_invite_id.clone(),
            ))
            .await
            .expect("invitation is no longer a fiat invitation");
        assert!(
            dbtx.get_value(&MultispendInvitationKey(
                pending_room.clone(),
                MultispendGroupKind::Btc,
                active_invite_id,
            ))
            .await
            .is_none()
        );
        assert_eq!(invitation.kind, MultispendGroupKind::Fiat);
        assert_eq!(invitation.rejections, BTreeSet::from([user("bob")]));
        assert_eq!(invitation.proposer, user("alice"));

        let request_id = RpcEventId("$withdrawal".to_string());
        let Some(MsEventData::WithdrawalRequest(withdrawal)) =
            get_event_data_db(&mut dbtx, &room, &request_id).await
        else {
            panic!("withdrawal is gone")
        };
        let MultispendTransferRequest::Fiat(request) = &withdrawal.request else {
            panic!("withdrawal is no longer fiat")
        };
        assert_eq!(request.amount(), FiatAmount(100));
        assert_eq!(request.from(), &group_account);
        assert_eq!(withdrawal.sender, user("alice"));
        assert_eq!(
            withdrawal.signatures.keys().cloned().collect::<Vec<_>>(),
            [user("alice"), user("bob")]
        );
        assert_eq!(
            withdrawal.tx_submission_status,
            WithdrawTxSubmissionStatus::Unknown
        );

        let Some(MsEventData::DepositNotification(deposit)) =
            get_event_data_db(&mut dbtx, &room, &RpcEventId("$deposit".to_string())).await
        else {
            panic!("deposit is gone")
        };
        assert_eq!(
            deposit,
            MultispendDepositEventData {
                user: user("bob"),
                amount: MultispendAmount::FiatAmount(RpcFiatAmount(250)),
                txid: txid(2),
                description: "deposit".to_string(),
            }
        );
        let events = list_multispend_events(&mut dbtx, &room, MultispendGroupKind::Fiat, None, 10)
            .await
            .into_iter()
            .map(|event| (event.counter, event.event_id.0, event.time))
            .collect::<Vec<_>>();
        assert_eq!(
            events,
            [
                (1, "$deposit".to_string(), 1005),
                (0, "$withdrawal".to_string(), 1002),
            ]
        );
        for room in [&room, &pending_room] {
            assert!(
                get_group_status_db(&mut dbtx, room, MultispendGroupKind::Btc)
                    .await
                    .is_none()
            );
        }
        assert!(
            list_multispend_events(&mut dbtx, &room, MultispendGroupKind::Btc, None, 10)
                .await
                .is_empty()
        );

        let queued: Vec<_> = dbtx
            .find_by_prefix(&MultispendPendingApprovedWithdrawalRequestKeyPrefix)
            .await
            .map(|(key, ())| key)
            .collect()
            .await;
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].request_event_id, request_id);
        let SignedMultispendTransferRequest::Fiat(signed) = &queued[0].transfer_request else {
            panic!("queued withdrawal is no longer fiat")
        };
        assert_eq!(signed.details(), request);
        signed.validate_signatures().unwrap();

        let notifications: Vec<_> = dbtx
            .find_by_prefix(&MultispendPendingCompletionNotificationPrefix)
            .await
            .map(|(key, ())| key)
            .collect()
            .await;
        assert_eq!(notifications.len(), 3);
        assert!(notifications.iter().any(|notification| matches!(
            notification,
            MultispendPendingCompletionNotification::Withdrawal {
                request_id: id,
                amount: MultispendAmount::FiatAmount(RpcFiatAmount(100)),
                txid: notification_txid,
                ..
            } if *id == request_id && *notification_txid == txid(3)
        )));
        assert!(notifications.iter().any(|notification| matches!(
            notification,
            MultispendPendingCompletionNotification::Deposit {
                amount: MultispendAmount::FiatAmount(RpcFiatAmount(250)),
                description,
                ..
            } if description == "deposit"
        )));
        assert!(notifications.iter().any(|notification| matches!(
            notification,
            MultispendPendingCompletionNotification::FailedWithdrawal { error, .. }
                if error == "rejected"
        )));
        drop(dbtx);

        // the migrated withdrawal settles like any other
        let mut dbtx = db.begin_transaction().await;
        let mut context = crate::MultispendContext {
            check_pending_approved_withdrawal_requests: false,
            our_id: user("alice"),
            refresh_account_info: false,
            btc_payouts: Vec::new(),
        };
        crate::process_event_db_raw(
            &mut dbtx.to_ref_nc(),
            &room,
            user("alice"),
            RpcEventId("$complete".to_string()),
            crate::MsEvent::WithdrawalResponse {
                group_kind: MultispendGroupKind::Fiat,
                request: request_id,
                response: crate::WithdrawalResponseType::Complete {
                    amount: MultispendAmount::FiatAmount(RpcFiatAmount(100)),
                    txid: txid(3),
                },
            },
            2000,
            &mut context,
        )
        .await
        .unwrap();
        assert_eq!(
            dbtx.find_by_prefix(&MultispendPendingApprovedWithdrawalRequestKeyPrefix)
                .await
                .count()
                .await,
            0
        );

        // and new fiat events continue the migrated event list
        crate::process_event_db_raw(
            &mut dbtx.to_ref_nc(),
            &room,
            user("bob"),
            RpcEventId("$deposit2".to_string()),
            crate::MsEvent::DepositNotification {
                amount: MultispendAmount::FiatAmount(RpcFiatAmount(300)),
                txid: txid(4),
                description: "again".to_string(),
            },
            3000,
            &mut context,
        )
        .await
        .unwrap();
        let latest = list_multispend_events(
            &mut dbtx.to_ref_nc(),
            &room,
            MultispendGroupKind::Fiat,
            None,
            1,
        )
        .await;
        assert_eq!(latest[0].counter, 2);
        assert_eq!(latest[0].event_id, RpcEventId("$deposit2".to_string()));
    }

    async fn version(db: &Database) -> Option<DatabaseVersion> {
        db.begin_transaction_nc()
            .await
            .get_value(&DatabaseVersionKey(MODULE_GLOBAL_PREFIX.into()))
            .await
    }

    #[tokio::test]
    async fn migrates_rows_written_by_25_5_to_25_6_0() {
        // the same database written by 25.6.0 and by 25.6.1, next to records
        // that were never in a legacy layout
        let mut dbs = Vec::new();
        for legacy in [true, false] {
            let db = master_db().await;
            let mut dbtx = db.begin_transaction().await;
            for (key, legacy_value, current_value) in LEGACY_WITHDRAW_REQUEST_ROWS {
                let value = if legacy { legacy_value } else { current_value };
                dbtx.raw_insert_bytes(&hex(key), &hex(value)).await.unwrap();
            }
            let (legacy_key, current_key) = LEGACY_DEPOSIT_NOTICE_KEYS;
            let key = if legacy { legacy_key } else { current_key };
            dbtx.raw_insert_bytes(&hex(key), &[]).await.unwrap();
            dbtx.commit_tx().await;
            migrate_multispend_db(&db).await.unwrap();
            dbs.push(dump(&db).await);
        }
        assert_eq!(dbs[0], dbs[1]);

        let statuses: Vec<_> = LEGACY_WITHDRAW_REQUEST_ROWS
            .iter()
            .map(|(key, _, _)| {
                let (_, value) = dbs[0].iter().find(|(k, _)| *k == hex(key)).unwrap();
                WithdrawRequestWithApprovals::consensus_decode_whole(
                    value,
                    &ModuleDecoderRegistry::default(),
                )
                .unwrap()
                .tx_submission_status
            })
            .collect();
        assert_eq!(
            statuses,
            [
                WithdrawTxSubmissionStatus::Unknown,
                WithdrawTxSubmissionStatus::Accepted {
                    txid: RpcTransactionId(
                        "54a68eadc02b613a33addf1635dcf3685f07db86935c8e049d3b99c15b53c21b"
                            .parse()
                            .unwrap()
                    )
                },
            ]
        );
        let notices = dbs[0]
            .iter()
            .filter(|(key, _)| {
                key[0] == MultispendDbPrefix::MultispendPendingCompletionNotification as u8
            })
            .map(|(key, _)| {
                MultispendPendingCompletionNotification::consensus_decode_whole(
                    &key[1..],
                    &ModuleDecoderRegistry::default(),
                )
                .unwrap()
            })
            .filter(|notice| {
                matches!(
                    notice,
                    MultispendPendingCompletionNotification::Deposit { description, .. }
                        if description == "c dep pending notice"
                )
            })
            .count();
        assert_eq!(notices, 1);
    }

    #[tokio::test]
    async fn marks_an_empty_database_current() {
        let db = Database::new(MemDatabase::new(), ModuleDecoderRegistry::default());
        migrate_multispend_db(&db).await.unwrap();
        assert_eq!(version(&db).await, Some(DatabaseVersion(1)));
        assert_eq!(dump(&db).await.len(), 1);
    }

    #[tokio::test]
    async fn refuses_a_database_newer_than_the_code() {
        let db = master_db().await;
        let mut dbtx = db.begin_transaction().await;
        dbtx.insert_entry(
            &DatabaseVersionKey(MODULE_GLOBAL_PREFIX.into()),
            &DatabaseVersion(2),
        )
        .await;
        dbtx.commit_tx().await;
        let before = dump(&db).await;
        assert!(migrate_multispend_db(&db).await.is_err());
        assert_eq!(dump(&db).await, before);
    }

    #[tokio::test]
    async fn migrates_inside_the_bridge_multispend_namespace() {
        let global = Database::new(MemDatabase::new(), ModuleDecoderRegistry::default());
        // as `Runtime::multispend_db` opens it
        let prefix = vec![BRIDGE_DB_PREFIX, BridgeDbPrefix::MultispendPrefix as u8];
        let db = global.with_prefix(prefix.clone());
        let mut dbtx = db.begin_transaction().await;
        for (key, value) in MASTER_ROWS {
            dbtx.raw_insert_bytes(&hex(key), &hex(value)).await.unwrap();
        }
        dbtx.commit_tx().await;
        // records next to the namespace: the next bridge prefix, the
        // namespace prefix itself and a key outside the bridge prefix
        let sentinels = [
            (vec![BRIDGE_DB_PREFIX, prefix[1] + 1, 0x01], vec![0xaa]),
            (prefix.clone(), vec![0xbb]),
            (vec![BRIDGE_DB_PREFIX + 1, 0x01], vec![0xcc]),
        ];
        let mut dbtx = global.begin_transaction().await;
        for (key, value) in &sentinels {
            dbtx.raw_insert_bytes(key, value).await.unwrap();
        }
        dbtx.commit_tx().await;

        migrate_multispend_db(&db).await.unwrap();

        assert_eq!(version(&db).await, Some(DatabaseVersion(1)));
        let rows = dump(&global).await;
        for sentinel in &sentinels {
            assert!(rows.contains(sentinel), "{sentinel:02x?} changed");
        }
        // every other row is a migrated multispend record or the version
        assert_eq!(rows.len(), sentinels.len() + MASTER_ROWS.len() + 1);
        let room = RpcRoomId("!room:example.com".to_string());
        assert_matches::assert_matches!(
            get_group_status_db(
                &mut db.begin_transaction_nc().await,
                &room,
                MultispendGroupKind::Fiat
            )
            .await,
            Some(MultispendGroupStatus::Finalized { .. })
        );
    }

    #[tokio::test]
    async fn keeps_completion_notice_retry_txn_ids() {
        let db = master_db().await;
        let key = MultispendPendingCompletionNotificationTxnIdKey(
            MultispendPendingCompletionNotificationId::WithdrawalRequestId(RpcEventId(
                "$withdrawal".to_string(),
            )),
        );
        let mut dbtx = db.begin_transaction().await;
        dbtx.insert_new_entry(&key, &"txn".to_string()).await;
        dbtx.commit_tx().await;
        migrate_multispend_db(&db).await.unwrap();
        assert_eq!(
            db.begin_transaction_nc().await.get_value(&key).await,
            Some("txn".to_string())
        );
    }

    #[tokio::test]
    async fn leaves_the_database_alone_on_a_bad_record() {
        let db = master_db().await;
        let mut dbtx = db.begin_transaction().await;
        dbtx.raw_insert_bytes(&hex("041121726f6f6d3a6578616d706c652e636f6d00"), &[0xff])
            .await
            .unwrap();
        dbtx.commit_tx().await;
        let before = dump(&db).await;
        assert!(migrate_multispend_db(&db).await.is_err());
        assert_eq!(dump(&db).await, before);
    }
}
