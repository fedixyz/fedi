use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{self, Display};
use std::io;
use std::ops::Range;
use std::str::FromStr;
use std::time::SystemTime;

use anyhow::{anyhow, bail, ensure, Context};
use bitcoin::bech32::{self, Bech32m, Hrp};
use bitcoin::hashes::sha256;
use fedimint_core::core::{Decoder, ModuleInstanceId, ModuleKind};
use fedimint_core::encoding::{Decodable, DecodeError, Encodable};
use fedimint_core::module::registry::ModuleDecoderRegistry;
use fedimint_core::module::{CommonModuleInit, ModuleCommon, ModuleConsensusVersion};
use fedimint_core::{
    extensible_associated_module_type, plugin_types_trait_impl_common, Amount, BitcoinHash,
    TransactionId,
};
use secp256k1::{schnorr, PublicKey};
use serde::de::Error as _;
use serde::{Deserialize, Serialize};

pub mod config;
use config::StabilityPoolClientConfig;

pub const KIND: ModuleKind = ModuleKind::from_static_str("multi_sig_stability_pool");
pub const CONSENSUS_VERSION: ModuleConsensusVersion = ModuleConsensusVersion::new(2, 0);

pub const MSATS_PER_BTC: u128 = 100_000_000_000;

/// Wrapper new-type for fiat-denominated amounts. The value is assumed to be
/// expressed in the real-world granularity of the specific fiat currency. For
/// example: cents (or hundredths) for most currencies. However some currencies
/// may be denominated only in whole units in the real world, such as JPY or KRW
/// or VND. As long as the base unit is consistent between client-server
/// interactions and the oracle, everything should "just work".
#[derive(
    Copy,
    Default,
    Clone,
    Debug,
    Hash,
    Eq,
    PartialEq,
    Encodable,
    Decodable,
    Serialize,
    Deserialize,
    PartialOrd,
    Ord,
)]
pub struct FiatAmount(pub u64);

impl FiatAmount {
    pub fn from_btc_amount(
        btc_amount: Amount,
        price_per_btc: FiatAmount,
    ) -> anyhow::Result<FiatAmount> {
        // 1 BTC is worth price_per_btc FiatAmount
        // 1 BTC = 10^8 SATS = 10^11 MSATS
        // So 10^11 MSATS is worth price_per_btc FiatAmount
        // x MSATS is worth (price_per_btc * x) / 10^11 FiatAmount
        let price_times_amount = u128::from(price_per_btc.0) * u128::from(btc_amount.msats);
        let fiat = price_times_amount / MSATS_PER_BTC;

        // Since end result is an actual fiat value it should comfortably fit in u64
        Ok(FiatAmount(fiat.try_into()?))
    }

    pub fn to_btc_amount(&self, price_per_btc: FiatAmount) -> anyhow::Result<Amount> {
        let fiat_amount = self;
        // price_per_btc FiatAmount is worth 1 BTC
        // 1 BTC = 10^8 SATS = 10^11 MSATS
        // So price_per_btc FiatAmount is worth 10^11 MSATS
        // fiat_amount FiatAmount is worth (fiat_amount * 10^11) / price_per_btc MSATS
        let fiat_amount_times_exp = u128::from(fiat_amount.0) * MSATS_PER_BTC;
        let msats = fiat_amount_times_exp / u128::from(price_per_btc.0);

        // Since end result is an msat value it should comfortably fit in u64
        Ok(Amount::from_msats(msats.try_into()?))
    }
}

/// An account may only act as a seeker or as a provider but not both at the
/// same time.
#[derive(
    Copy,
    Clone,
    Debug,
    Hash,
    Eq,
    PartialEq,
    Encodable,
    Decodable,
    Serialize,
    Deserialize,
    PartialOrd,
    Ord,
)]
pub enum AccountType {
    Seeker,
    Provider,
    /// A BtcDepositor only wants to hold Bitcoin in the stability pool module
    /// (typically in a multisig) without any sort of fiat-value stabilization.
    /// To avoid creating new balance buckets and module input/output types, we
    /// can represent this account type as a staged-only seeker. This is
    /// hacky, yes. But one might argue that it is a lot less hacky compared
    /// to writing new data types for a bitcoin-only multisig within a
    /// stability pool module; less hacky than stuffing two different
    /// modules into one. Plus it allows for a ton of code reuse because the
    /// staging area is a well-defined state for deposits that are
    /// unstabilized, and we have already handled deposits, withdrawals and
    /// transfers associated with the staging area.
    BtcDepositor,
}

/// `Account` within the stability pool is represented as a naive multi-sig of
/// pub keys + threshold. Within the DB, keys are the hashes of `Account`
/// (represented by AccountId). However, whenever we wish to modify an account's
/// state, the client must provide the full `Account` struct so that we can
/// verify that the hash matches.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Encodable, Serialize)]
pub struct Account {
    acc_type: AccountType,
    // invariant: length > 0
    pub_keys: BTreeSet<PublicKey>,
    // invariant: 0 < threshold < keys.length
    threshold: u64,
}

/// Account without invariants that can be checked using try_into.
#[derive(Decodable, Deserialize)]
pub struct AccountUnchecked {
    pub acc_type: AccountType,
    pub pub_keys: BTreeSet<PublicKey>,
    pub threshold: u64,
}

impl TryFrom<AccountUnchecked> for Account {
    type Error = anyhow::Error;
    fn try_from(raw: AccountUnchecked) -> anyhow::Result<Account> {
        if raw.threshold > raw.pub_keys.len().try_into().expect("usize to fit in u64")
            || raw.threshold == 0
            || raw.pub_keys.is_empty()
        {
            bail!("invalid account");
        }
        Ok(Account {
            acc_type: raw.acc_type,
            pub_keys: raw.pub_keys,
            threshold: raw.threshold,
        })
    }
}

impl Decodable for Account {
    fn consensus_decode_partial<R: io::Read>(
        r: &mut R,
        modules: &ModuleDecoderRegistry,
    ) -> Result<Self, DecodeError> {
        let raw = AccountUnchecked::consensus_decode_partial(r, modules)?;
        Ok(raw.try_into()?)
    }
}

impl<'de> Deserialize<'de> for Account {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = AccountUnchecked::deserialize(deserializer)?;
        raw.try_into().map_err(D::Error::custom)
    }
}

#[derive(
    Copy,
    Clone,
    Debug,
    Hash,
    Eq,
    PartialEq,
    Deserialize,
    Serialize,
    Encodable,
    Decodable,
    PartialOrd,
    Ord,
)]
pub struct AccountId {
    acc_type: AccountType,
    hash: sha256::Hash,
}

impl Account {
    pub fn id(&self) -> AccountId {
        AccountId {
            acc_type: self.acc_type,
            hash: self.consensus_hash(),
        }
    }

    pub fn single(key: PublicKey, acc_type: AccountType) -> Self {
        Self {
            acc_type,
            pub_keys: BTreeSet::from([key]),
            threshold: 1,
        }
    }

    pub fn as_single(&self) -> Option<&PublicKey> {
        if self.pub_keys.len() == 1 && self.threshold == 1 {
            Some(self.pub_keys.first().expect("length checked above"))
        } else {
            None
        }
    }

    pub fn acc_type(&self) -> AccountType {
        self.acc_type
    }

    pub fn threshold(&self) -> u64 {
        self.threshold
    }

    pub fn pub_keys(&self) -> impl Iterator<Item = &PublicKey> {
        self.pub_keys.iter()
    }
}

impl AccountId {
    pub fn acc_type(&self) -> AccountType {
        self.acc_type
    }
}

pub const SEEKER_HRP: Hrp = Hrp::parse_unchecked("sps");
pub const PROVIDER_HRP: Hrp = Hrp::parse_unchecked("spp");
pub const BTC_DEPOSITOR_HRP: Hrp = Hrp::parse_unchecked("spd");

impl Display for AccountId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let hrp = match self.acc_type {
            AccountType::Seeker => SEEKER_HRP,
            AccountType::Provider => PROVIDER_HRP,
            AccountType::BtcDepositor => BTC_DEPOSITOR_HRP,
        };
        let encoded = bech32::encode::<Bech32m>(hrp, self.hash.as_ref()).map_err(|_| fmt::Error)?;
        write!(f, "{}", encoded)
    }
}

impl FromStr for AccountId {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let (hrp, data) = bech32::decode(s)?;

        let acc_type = if hrp.as_str() == SEEKER_HRP.as_str() {
            AccountType::Seeker
        } else if hrp.as_str() == PROVIDER_HRP.as_str() {
            AccountType::Provider
        } else if hrp.as_str() == BTC_DEPOSITOR_HRP.as_str() {
            AccountType::BtcDepositor
        } else {
            bail!("Invalid account type");
        };

        let hash = sha256::Hash::from_slice(&data).context("Invalid data")?;

        Ok(AccountId { acc_type, hash })
    }
}

/// Deposit represents user positions in the system. These positions can be
/// seeks or provides. Different types of "meta" differentiate different types
/// of positions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Deposit<M> {
    /// ID of TX that birthed this deposit.
    pub txid: TransactionId,

    /// Incrementing nonce (server-assigned) for priority
    pub sequence: u64,
    pub amount: Amount,
    pub meta: M,
}

impl<M> Encodable for Deposit<M>
where
    M: Encodable,
{
    fn consensus_encode<W: std::io::Write>(&self, writer: &mut W) -> Result<(), std::io::Error> {
        (self.txid, self.sequence, self.amount, &self.meta).consensus_encode(writer)
    }
}

impl<M> Decodable for Deposit<M>
where
    M: Decodable,
{
    fn consensus_decode_partial<R: std::io::Read>(
        r: &mut R,
        modules: &ModuleDecoderRegistry,
    ) -> Result<Self, DecodeError> {
        let (txid, sequence, amount, meta) =
            <(TransactionId, u64, Amount, M)>::consensus_decode_partial(r, modules)?;
        Ok(Self {
            txid,
            sequence,
            amount,
            meta,
        })
    }
}

/// A seek is just a deposit without any additional meta.
pub type Seek = Deposit<()>;

/// Newtype to express fee rate in PPB (parts per billion).
#[derive(
    Copy,
    Clone,
    Debug,
    Hash,
    Eq,
    PartialEq,
    Encodable,
    Decodable,
    Serialize,
    Deserialize,
    PartialOrd,
    Ord,
)]
pub struct FeeRate(pub u64);

/// A provide is just a deposit with an additional meta of [`FeeRate`]. Every
/// provide contains a minimum fee rate that the provider is willing to accept
/// for the liquidity that they are providing.
pub type Provide = Deposit<FeeRate>;

/// Withdrawal is a 2-step process whereby the first step is the client telling
/// the server to free up X cents in the idle balance, and second step is the
/// client then sweeping up the idle balance.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub enum StabilityPoolInputV0 {
    UnlockForWithdrawal(UnlockForWithdrawalInput),
    Withdrawal(WithdrawalInput),
}

impl StabilityPoolInputV0 {
    pub fn account(&self) -> Account {
        match self {
            StabilityPoolInputV0::UnlockForWithdrawal(unlock) => unlock.account.clone(),
            StabilityPoolInputV0::Withdrawal(withdrawal) => withdrawal.account.clone(),
        }
    }
}

/// UnlockForWithdrawalInput allows telling the server to set aside msats (in
/// idle balance) for the given amount of fiat (or ALL) so that the entire
/// msats might be withdrawn in a subsequent transaction.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub struct UnlockForWithdrawalInput {
    pub account: Account,
    pub amount: FiatOrAll,
}

/// Request unlocking of the given FiatAmount, or ALL of the account's holdings.
#[derive(Copy, Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub enum FiatOrAll {
    Fiat(FiatAmount),
    All,
}

impl Display for FiatOrAll {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FiatOrAll::Fiat(fiat_amount) => write!(f, "{} in fiat", fiat_amount.0),
            FiatOrAll::All => write!(f, "full balance"),
        }
    }
}

/// WithdrawalInput allows withdrawing the given amount of msats. Typically this
/// is the second step in a withdrawal operation.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub struct WithdrawalInput {
    pub account: Account,
    pub amount: Amount,
}

extensible_associated_module_type!(
    StabilityPoolInput,
    StabilityPoolInputV0,
    UnknownStabilityPoolInputVariantError
);

/// Depositing funds into the stability pool can be the purpose of seeking or
/// providing. In both these cases, the funds (input) are coming from the e-cash
/// module.
///
/// Transferring funds from one account to another is also represented via an
/// output, albeit a 0-amount output that contains valid signatures.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub enum StabilityPoolOutputV0 {
    DepositToSeek(DepositToSeekOutput),
    DepositToProvide(DepositToProvideOutput),
    Transfer(TransferOutput),
}

/// Represents a module output for depositing the given `amount` into the given
/// `account_id`s staging balance as a seek. Seeks are assigned
/// auto-incrementing sequences by the guardians.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub struct DepositToSeekOutput {
    pub account_id: AccountId,
    pub seek_request: SeekRequest,
}

/// Represents a module output for depositing the given `amount` into the given
/// `account_id`s staging balance as a provide with the specified `min_fee_rate`
/// in parts-per-billion. Provides are assigned auto-incrementing sequences by
/// the guardians.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub struct DepositToProvideOutput {
    pub account_id: AccountId,
    pub provide_request: ProvideRequest,
}

/// Represents a module output for transferring funds (staged and locked) from
/// one account to another.
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub struct TransferOutput {
    pub signed_request: SignedTransferRequest,
}

extensible_associated_module_type!(
    StabilityPoolOutput,
    StabilityPoolOutputV0,
    UnknownStabilityPoolOutputVariantError
);

#[derive(Clone, Debug, Hash, PartialEq, Eq, Encodable, Decodable, Serialize, Deserialize)]
pub struct SeekRequest(pub Amount);

#[derive(Clone, Debug, Hash, PartialEq, Eq, Encodable, Decodable, Serialize, Deserialize)]
pub struct ProvideRequest {
    pub amount: Amount,
    pub min_fee_rate: FeeRate,
}

#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub struct TransferRequest {
    /// Having a nonce as part of the TransferRequest allows for having multiple
    /// identical transfer requests as far as "from" account, "to" account, and
    /// "amount", while still allowing for signature reuse/replay prevention.
    /// As such it is the client's responsibility to ensure that nonces are not
    /// reused. This does put an upper limit of u64::MAX for transfer requests
    /// with the same "from", "to", and "amount", but that seems more than
    /// reasonable.
    nonce: u64,
    from: Account,
    transfer_amount: FiatAmount,
    to: AccountId,

    /// This meta field allows embedding additional arbitrary information as
    /// part of the transfer request.
    meta: Vec<u8>,

    /// To ensure that a signed transfer request cannot be delayed indefinitely
    /// (to abuse the "All" transfer amount, for example), we set a cycle index
    /// expiry for this transfer request.
    valid_until_cycle: u64,

    /// In case of a provider-to-provider transfer, we need to include a new fee
    /// rate which will apply for the newly created provider position of the
    /// "to" account. This is necessary because it gives the user more
    /// control, and doesn't let the server make an arbitrary decision as to
    /// what the new fee rate should be (especially if multiple provides
    /// needed to be drained from "from" to create the new provide for
    /// "to").
    new_fee_rate: Option<FeeRate>,
}

impl TransferRequest {
    pub fn new(
        nonce: u64,
        from: Account,
        transfer_amount: FiatAmount,
        to: AccountId,
        meta: Vec<u8>,
        valid_until_cycle: u64,
        new_fee_rate: Option<FeeRate>,
    ) -> anyhow::Result<Self> {
        // Ensure account types match
        ensure!(
            from.acc_type == to.acc_type,
            "From and to account types must match"
        );

        // Transfer amount must be non-zero
        ensure!(transfer_amount.0 != 0, "Transfer amount must not be 0");

        // Fee rate must only be set for a provider-to-provider transfer
        match from.acc_type {
            AccountType::Seeker | AccountType::BtcDepositor => ensure!(
                new_fee_rate.is_none(),
                "Fee rate only applies to provider-to-provider transfer"
            ),
            AccountType::Provider => ensure!(
                new_fee_rate.is_some(),
                "Fee rate only applies to provider-to-provider transfer"
            ),
        }

        Ok(Self {
            nonce,
            from,
            transfer_amount,
            to,
            meta,
            valid_until_cycle,
            new_fee_rate,
        })
    }

    pub fn from(&self) -> &Account {
        &self.from
    }

    pub fn amount(&self) -> FiatAmount {
        self.transfer_amount
    }

    pub fn to(&self) -> &AccountId {
        &self.to
    }

    pub fn valid_until_cycle(&self) -> u64 {
        self.valid_until_cycle
    }

    pub fn new_fee_rate(&self) -> Option<FeeRate> {
        self.new_fee_rate
    }

    pub fn meta(&self) -> &[u8] {
        &self.meta
    }
}

#[derive(Debug, Clone, Encodable, Decodable, Serialize, Deserialize)]
pub struct TransferRequestId(pub sha256::Hash);

impl From<&TransferRequest> for TransferRequestId {
    fn from(value: &TransferRequest) -> Self {
        Self(value.consensus_hash())
    }
}

impl From<&TransferRequestId> for secp256k1::Message {
    fn from(value: &TransferRequestId) -> Self {
        Self::from_digest(value.0.to_byte_array())
    }
}

/// Requires at least a threshold number of valid signatures, with the signed
/// message being the actual [`TransferRequest`].
#[derive(Clone, Debug, Hash, Eq, PartialEq, Deserialize, Serialize, Encodable, Decodable)]
pub struct SignedTransferRequest {
    /// Key is index (0-based) of the corresponding pubkey within the "from"
    /// Account representation. Value is Schnorr signature for the
    /// corresponding pubkey. The message that's signed is the entire
    /// [`TransferRequest`].
    signatures: BTreeMap<u64, schnorr::Signature>,
    transfer_request: TransferRequest,
}

impl SignedTransferRequest {
    /// Ensures that the signatures over the [`TransferRequest`] are valid.
    pub fn new(
        transfer_request: TransferRequest,
        signatures: BTreeMap<u64, schnorr::Signature>,
    ) -> anyhow::Result<Self> {
        let this = Self {
            signatures,
            transfer_request,
        };
        this.validate_signatures()?;
        Ok(this)
    }

    pub fn validate_signatures(&self) -> anyhow::Result<()> {
        ensure!(
            self.signatures.len() >= self.transfer_request.from.threshold.try_into()?,
            "Signature threshold not met"
        );

        let message = secp256k1::Message::from(&TransferRequestId::from(&self.transfer_request));
        for (idx, sig) in self.signatures.iter() {
            let pubkey = self
                .transfer_request
                .from
                .pub_keys
                .iter()
                .nth((*idx).try_into()?)
                .ok_or(anyhow!("Invalid pubkey index"))?;

            sig.verify(&message, &pubkey.x_only_public_key().0)?;
        }

        Ok(())
    }

    pub fn signatures(&self) -> &BTreeMap<u64, schnorr::Signature> {
        &self.signatures
    }

    pub fn details(&self) -> &TransferRequest {
        &self.transfer_request
    }
}

#[derive(Clone, Debug, Hash, PartialEq, Eq, Encodable, Decodable, Serialize, Deserialize)]
pub struct StabilityPoolOutputOutcomeV0;

extensible_associated_module_type!(
    StabilityPoolOutputOutcome,
    StabilityPoolOutputOutcomeV0,
    UnknownStabilityPoolOutputOutcomeVariantError
);

/// The stability pool's contribution to consensus is minimal and contains only
/// the data needed to progress from one cycle to the next. The philosophy here
/// is to only include the bare minimum needed so that everything else can be
/// deterministically calculated by each guardian.
///
/// Guardians use the cycle duration (which is part of the consensus
/// configuration) to realize when the next cycle needs to begin. At that
/// moment, they query the oracle to get the latest BTC/USD
/// price, and propose a new consensus item using their system clock and the
/// index of the next cycle.
///
/// When other guardians receive these proposals and consensus items, they wait
/// to see a threshold number of votes before actually processing the cycle
/// turnover. Both the start time and the start price for the
/// turnover are obtained from median values among the votes.
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encodable, Decodable, Serialize, Deserialize)]
pub struct StabilityPoolConsensusItemV0 {
    pub next_cycle_index: u64,
    pub time: SystemTime,
    pub price: FiatAmount,
}

extensible_associated_module_type!(
    StabilityPoolConsensusItem,
    StabilityPoolConsensusItemV0,
    UnknownStabilityPoolConsensusItemVariantError
);

impl StabilityPoolConsensusItem {
    pub fn new_v0(
        next_cycle_index: u64,
        time: SystemTime,
        price: FiatAmount,
    ) -> StabilityPoolConsensusItem {
        StabilityPoolConsensusItem::V0(StabilityPoolConsensusItemV0 {
            next_cycle_index,
            time,
            price,
        })
    }

    pub fn next_cycle_index(&self) -> anyhow::Result<u64> {
        match self {
            StabilityPoolConsensusItem::V0(StabilityPoolConsensusItemV0 {
                next_cycle_index,
                ..
            }) => Ok(*next_cycle_index),
            StabilityPoolConsensusItem::Default { variant, .. } => {
                bail!("Unsupported variant {variant}")
            }
        }
    }

    pub fn time(&self) -> anyhow::Result<SystemTime> {
        match self {
            StabilityPoolConsensusItem::V0(StabilityPoolConsensusItemV0 { time, .. }) => Ok(*time),
            StabilityPoolConsensusItem::Default { variant, .. } => {
                bail!("Unsupported variant {variant}")
            }
        }
    }

    pub fn price(&self) -> anyhow::Result<FiatAmount> {
        match self {
            StabilityPoolConsensusItem::V0(StabilityPoolConsensusItemV0 { price, .. }) => {
                Ok(*price)
            }
            StabilityPoolConsensusItem::Default { variant, .. } => {
                bail!("Unsupported variant {variant}")
            }
        }
    }
}

/// Errors that might be returned by the server when using an input from the
/// stability pool module.
#[derive(thiserror::Error, Debug, Clone, Eq, PartialEq, Hash, Encodable, Decodable)]
pub enum StabilityPoolInputError {
    #[error("Withdrawal amount is either 0 or not enough to cover fees.")]
    InvalidWithdrawalAmount,
    #[error("Sum of idle and staged balance is not enough to satisfy withdrawal request.")]
    InsufficientBalance,
    #[error("Multi-sig keys are not allowed for this operation.")]
    MultiSigNotAllowed,
    #[error("Temporary error, please try again later.")]
    TemporaryError,
    #[error("Previous unlock request must be completed before a new one can be accepted")]
    DuplicateUnlockRequest,
    #[error("{0}")]
    UnknownInputVariant(String),
}

/// Errors that might be returned by the server when using an output from the
/// stability pool module.
#[derive(thiserror::Error, Debug, Clone, Eq, PartialEq, Hash, Encodable, Decodable)]
pub enum StabilityPoolOutputError {
    #[error("Previous action must be fully processed before accepting new action.")]
    PreviousIntentionNotFullyProcessed,
    #[error("Cannot seek while staged/locked provides or cancellation are active.")]
    CannotSeek,
    #[error("Cannot provide while staged/locked seeks or cancellation are active.")]
    CannotProvide,
    #[error("Seeker account type cannot provide, and provider account type cannot seek")]
    InvalidAccountTypeForOperation,
    #[error("Cannot seek or provide when auto-renewal cancellation is already staged.")]
    AutoRenewalCancellationAlreadyStaged,
    #[error("Seek or provide amount is below minimum required amount.")]
    AmountTooLow,
    #[error("Provide fee rate is higher than maximum allowed by federation.")]
    FeeRateTooHigh,
    #[error("No active locks, or other staged actions present that must first be removed.")]
    CannotCancelAutoRenewal,
    #[error("Basis point value must be between 100 and 10,000.")]
    InvalidBPSForCancelAutoRenewal,
    #[error("No active request to cancel auto renewal.")]
    CannotUndoAutoRenewalCancellation,
    #[error("Transfer request rejected: {0}")]
    InvalidTransferRequest(String),
    #[error("{0}")]
    UnknownOutputVariant(String),
    #[error("Operation is not allowed before first cycle.")]
    NoCycle,
}

pub struct StabilityPoolModuleTypes;

#[derive(Debug)]
pub struct StabilityPoolCommonGen;

impl CommonModuleInit for StabilityPoolCommonGen {
    const CONSENSUS_VERSION: ModuleConsensusVersion = CONSENSUS_VERSION;

    const KIND: ModuleKind = KIND;

    type ClientConfig = StabilityPoolClientConfig;

    fn decoder() -> Decoder {
        StabilityPoolModuleTypes::decoder_builder().build()
    }
}

plugin_types_trait_impl_common!(
    KIND,
    StabilityPoolModuleTypes,
    StabilityPoolClientConfig,
    StabilityPoolInput,
    StabilityPoolOutput,
    StabilityPoolOutputOutcome,
    StabilityPoolConsensusItem,
    StabilityPoolInputError,
    StabilityPoolOutputError
);

impl Display for StabilityPoolInputV0 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StabilityPoolInputV0::UnlockForWithdrawal(unlock) => write!(
                f,
                "Input to unlock {} fiat amount from account {}",
                match unlock.amount {
                    FiatOrAll::Fiat(fiat) => fiat.0.to_string(),
                    FiatOrAll::All => "all".to_string(),
                },
                unlock.account.id(),
            ),
            StabilityPoolInputV0::Withdrawal(withdrawal) => {
                write!(
                    f,
                    "Input to withdraw {} from account {}",
                    withdrawal.amount,
                    withdrawal.account.id()
                )
            }
        }
    }
}

impl Display for StabilityPoolOutputV0 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StabilityPoolOutputV0::DepositToSeek(seek_output) => write!(
                f,
                "Deposit {} into account {} for seeking",
                seek_output.seek_request.0, seek_output.account_id
            ),
            StabilityPoolOutputV0::DepositToProvide(provide_output) => write!(
                f,
                "Deposit {} into account {} for providing with min fee rate {} ppb",
                provide_output.provide_request.amount,
                provide_output.account_id,
                provide_output.provide_request.min_fee_rate.0
            ),
            StabilityPoolOutputV0::Transfer(transfer_output) => write!(
                f,
                "Transfer {} fiat amount from account {} to account {}",
                transfer_output
                    .signed_request
                    .transfer_request
                    .transfer_amount
                    .0,
                transfer_output.signed_request.transfer_request.from.id(),
                transfer_output.signed_request.transfer_request.to,
            ),
        }
    }
}

impl Display for StabilityPoolOutputOutcomeV0 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Output outcome is a unit struct",)
    }
}

impl Display for StabilityPoolConsensusItemV0 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Consensus item for cycle index {:?} with time {:?} and price {}",
            self.next_cycle_index, self.time, self.price.0
        )
    }
}

/// An `UnlockRequest` is stored on the server when staged deposits are not
/// enough to satisfy a user's unlock request. At the next cycle turnover, we
/// used the just-settled locked deposits to unlock any additional funds needed,
/// and then delete the `UnlockRequest` from the DB.
#[derive(Serialize, Deserialize, Encodable, Decodable, Debug, Clone, PartialEq, Eq)]
pub struct UnlockRequest {
    /// ID of the TX representing the user's request to unlock funds
    pub txid: TransactionId,

    /// The total fiat amount that was requested to be unlocked. This includes
    /// any amount that has already been drained from the staged deposits.
    pub total_fiat_requested: FiatAmount,

    /// The remaining amount needed to be unlocked from locked deposits at the
    /// next cycle turnover.
    pub unlock_amount: FiatOrAll,
}

/// After submitting the TX to unlock funds, clients will query the server for
/// the status of the unlock request. Since we have decided that there can only
/// be one at most 1 active unlock request at a time, there are two possible
/// statuses:
/// - Pending: the request hasn't been fully processed yet, meaning the cycle
///   turnover hasn't yet happened. In this case we respond to the client with
///   the start time of the next cycle so the client can sleep until the next
///   cycle and then retry.
/// - NoActiveRequest: the request is no longer present on the server.
///   Theoretically, this could mean one of three things:
///   1. An unlock request was never submitted in a TX (or the TX was rejected).
///   2. The unlock request was able to be immediately satisfied using staged
///      balance only.
///   3. The unlock request was registered to be processed at the next cycle
///      turnover, and that has already happened.
///
/// (1) is rather unlikely, as the client will start the withdrawal flow with an
/// unlock request TX, and should that TX fail, it will not attempt to
/// query the unlock request status. For both (2) and (3), the client only
/// needs to know the amount that can now be swept from idle balance. Even
/// though the client can query for the idle balance separately, we just
/// return it within the status to save the client an extra API call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnlockRequestStatus {
    Pending {
        request: UnlockRequest,
        next_cycle_start_time: SystemTime,
    },
    NoActiveRequest {
        idle_balance: Amount,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Encodable, Decodable)]
pub struct LiquidityStats {
    pub locked_seeks_sum_msat: u64,
    pub locked_provides_sum_msat: u64,
    pub staged_seeks_sum_msat: u64,
    pub staged_provides_sum_msat: u64,
}

/// Client calls /active_deposits endpoint to determine:
/// - Staged and locked seeks for a seeker account OR
/// - Staged and locked provides for a provider account
#[derive(Serialize, Deserialize, Encodable, Decodable, Debug, Clone, PartialEq, Eq)]
pub enum ActiveDeposits {
    Seeker {
        staged: Vec<Seek>,
        locked: Vec<Seek>,
    },
    Provider {
        staged: Vec<Provide>,
        locked: Vec<Provide>,
    },
}

/// Client calls /sync endpoint to sync client state from server.
///
/// This state includes current cycle info, balance and account history
#[derive(Serialize, Deserialize, Encodable, Decodable, Debug, Clone, PartialEq, Eq)]
pub struct SyncResponse {
    pub current_cycle: CycleInfo,
    pub staged_balance: Amount,
    pub locked_balance: Amount,
    pub idle_balance: Amount,
    pub unlock_request: Option<UnlockRequest>,
    /// Number of history items for this account.
    ///
    /// Client can use this if they have any new history item.
    pub account_history_count: u64,

    /// A map of txid => lifetime fee paid
    /// This only pertains to seekers, that's why it's Optional
    /// Only currently locked seeks are included
    pub locked_seeks_lifetime_fee: Option<BTreeMap<TransactionId, Amount>>,
}

impl SyncResponse {
    pub fn amount_from_unlock_request(&self) -> Option<(Amount, FiatAmount)> {
        match self.unlock_request.as_ref()?.unlock_amount {
            FiatOrAll::Fiat(fiat_amount) => Some((
                fiat_amount
                    .to_btc_amount(self.current_cycle.start_price)
                    .ok()?,
                fiat_amount,
            )),
            FiatOrAll::All => Some((
                self.locked_balance,
                FiatAmount::from_btc_amount(self.locked_balance, self.current_cycle.start_price)
                    .ok()?,
            )),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct AccountHistoryRequest {
    pub account_id: AccountId,
    pub range: Range<u64>,
}

/// Some cycle details are sent to client along with cycle number to avoid
/// multiple api calls.
#[derive(Serialize, Deserialize, Encodable, Decodable, Debug, Clone, Copy, PartialEq, Eq)]
pub struct CycleInfo {
    pub idx: u64,
    pub start_price: FiatAmount,
    pub start_time: SystemTime,
}

/// - History is stored per account
/// - Every state transition of each deposit is tracked.
/// - We don't keep history of idle balance.
/// - Amounts are sent as msats and we also send the cycle price.
#[derive(Serialize, Deserialize, Encodable, Decodable, Debug, Clone, PartialEq, Eq)]
pub struct AccountHistoryItem {
    /// Cycle in which the transaction happened
    pub cycle: CycleInfo,
    /// ID of transaction that gave birth to this account history item. For
    /// user-initiated operations, this will be the ID of the user-submitted FM
    /// TX. For automatic operations, like auto-renewal, this will be the ID of
    /// the TX that birthed the deposit.
    pub txid: TransactionId,
    /// Sequence of the particular deposit whose state is being changed
    pub deposit_sequence: u64,
    /// The amount that is being effected within this particular deposit. The
    /// exact "effect" on the amount is determined by the "kind".
    pub amount: Amount,
    /// Kind of transaction
    pub kind: AccountHistoryItemKind,
}

#[derive(Debug, Serialize, Deserialize, Encodable, Decodable, Clone, PartialEq, Eq)]
#[serde(tag = "kind")]
pub enum AccountHistoryItemKind {
    /// Fresh deposit into the stability pool (starts out as staged)
    DepositToStaged,

    /// A staged deposit is locked EXCEPT during auto-renewal. Note that at the
    /// end of each cycle, locked deposits are first moved to staged, and
    /// then they are considered again for locking together with other
    /// staged deposits. This is called an "auto-renewal". Auto-renewals DO
    /// NOT log in the account history.
    StagedToLocked,

    /// A locked deposit is kicked out to staged EXCEPT during auto-renewal. So
    /// a deposit was locked, and then couldn't be relocked due to lack of
    /// liquidity. Note that at the end of each cycle, locked deposits are
    /// first moved to staged, and then they are considered again for
    /// locking together with other staged deposits. This is called an
    /// "auto-renewal". Auto-renewals DO NOT log in the account history.
    LockedToStaged,

    /// A withdrawal request was received, and for the funds that could be
    /// drained from the staged deposits immediately, idle balance was credited.
    StagedToIdle,

    /// A withdrawal request was received, and couldn't be fulfilled using
    /// staged deposits at the time. So an unlock request was registered, and
    /// the next cycle turnover, part of the locked funds were removed from the
    /// contract-formation process and sent to idle balance for the user to
    /// claim.
    LockedToIdle,

    /// A transfer request was received and processed and as a result the
    /// recipient of the funds has a new staged deposit.
    StagedTransferIn { from: AccountId, meta: Vec<u8> },

    /// A transfer request was received and processed and as a result the
    /// recipient of the funds has a new locked deposit.
    LockedTransferIn { from: AccountId, meta: Vec<u8> },

    /// A transfer request was received and processed and as a result the sender
    /// of the funds gave up some staged deposits that were immediately given to
    /// the recipient.
    StagedTransferOut { to: AccountId, meta: Vec<u8> },

    /// A transfer request was received and processed and as a result the sender
    /// of the funds gave up some locked deposits that were immediately given to
    /// the recipient.
    LockedTransferOut { to: AccountId, meta: Vec<u8> },
}
