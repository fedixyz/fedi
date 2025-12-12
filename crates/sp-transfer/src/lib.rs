//! # SP Transfers - Stability Pool Transfers via Matrix
//!
//! This crate implements peer-to-peer fiat transfers between Stability Pool
//! accounts using Matrix as the coordination layer.
//!
//! ## High-Level Flow
//!
//! ```text
//! SENDER                          Matrix Room                      RECEIVER
//!   │                                 │                                │
//!   │  1. PendingTransferStart        │                                │
//!   │  (amount, federation_id, nonce) │                                │
//!   │────────────────────────────────>│───────────────────────────────>│
//!   │                                 │                                │
//!   │                                 │                                │
//!   │                                 │     2. AnnounceAccount         │
//!   │                                 │     (account_id, federation_id)│
//!   │                                 │     [after joining room+fed]   │
//!   │<────────────────────────────────│<───────────────────────────────│
//!   │                                 │                                │
//!   │  3. [Off-Matrix] Submit SPv2    │                                │
//!   │     transfer to federation      │                                │
//!   │                                 │                                │
//!   │  4. TransferSentHint            │                                │
//!   │  (pending_transfer_id, txid)    │                                │
//!   │────────────────────────────────>│───────────────────────────────>│
//!   │                                 │                                │
//! ```
//!
//! ### Sender's Database
//!
//! 1. Send PendingTransferStart
//!  - Insert `TransferEvent { pending_transfer_id }` → `{ amount,
//!    federation_id, room_id, sent_by, nonce }`
//!  - Insert `SenderAwaitingAccountAnnounceEvent { pending_transfer_id }` →
//!    `()`
//!
//! 2. Receive AnnounceAccount
//!  - Insert `KnownReceiverAccountId { room_id, federation_id }` → `account_id`
//!
//! 3. Submit SPv2 transfer
//!  - Remove `SenderAwaitingAccountAnnounceEvent { pending_transfer_id }`
//!  - On tx accepted: Insert `PendingCompletionNotification { room_id,
//!    pending_transfer_id, ... }`
//!
//! 4. Send TransferSentHint
//!  - Remove `PendingCompletionNotification { ... }`
//!  - Insert `TransferSentHint { pending_transfer_id }` → `txid`
//!
//! ### Receiver's Database
//!
//! 1. Receive PendingTransferStart
//!  - Insert `TransferEvent { pending_transfer_id }` → `{ amount,
//!    federation_id, room_id, sent_by }`
//!  - Insert `PendingReceiverAccountIdEvent { pending_transfer_id }`
//!
//! 2. Send AnnounceAccount (after joining room + federation)
//!  - Remove `PendingReceiverAccountIdEvent { pending_transfer_id }`
//!
//! 3. Receive TransferSentHint
//!  - Insert `TransferSentHint { pending_transfer_id }` → `txid`
//!
//! ## Background Services
//!
//! - TransferSubmitter (sender): Monitors `SenderAwaitingAccountAnnounceEvent`
//!   entries and submits SPv2 transfers once the receiver's account ID is known
//!   via `KnownReceiverAccountId`.
//!
//! - AccountIdResponder (receiver): Monitors `PendingReceiverAccountIdEvent`
//!   entries and sends `AnnounceAccount` once the user has joined both the room
//!   and the federation.
//!
//! - TransferCompleteNotifier (sender): Processes
//!   `PendingCompletionNotification` queue and sends `TransferSentHint`
//!   messages after SPv2 transfer is accepted.
//!
//! ## Transfer Status Resolution
//!
//! Status is resolved by checking DB entries:
//! - `SentHint`: `TransferSentHint` entry exists
//! - `Pending`: No `TransferSentHint` entry

pub mod db;
pub mod services;
pub mod sp_transfers_matrix;

pub const SP_TRANSFER_MSGTYPE: &str = "xyz.fedi.sp-transfer";
