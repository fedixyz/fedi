import {
    PayloadAction,
    createAsyncThunk,
    createSelector,
    createSlice,
} from '@reduxjs/toolkit'
import { TFunction } from 'i18next'

import {
    CommonState,
    refreshHistoricalCurrencyRates,
    selectActiveFederation,
    selectActiveFederationId,
    selectBtcExchangeRate,
    selectBtcUsdExchangeRate,
    selectFederationBalance,
    selectFederationStabilityPoolConfig,
    selectReusedEcashFederations,
    selectStabilityPoolFeeSchedule,
} from '.'
import { Federation, MSats, ReceiveEcashResult, Usd, UsdCents } from '../types'
import {
    FrontendMetadata,
    JSONObject,
    RpcAmount,
    RpcEcashInfo,
    SPv2WithdrawalEvent,
    StabilityPoolDepositEvent,
    StabilityPoolWithdrawalEvent,
} from '../types/bindings'
import { StabilityPoolState } from '../types/wallet'
import amountUtils from '../utils/AmountUtils'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import {
    calculateStabilityPoolWithdrawal,
    handleStabilityPoolWithdrawal,
    calculateStabilityPoolDeposit,
    handleStabilityPoolDeposit,
    coerceLegacyAccountInfo,
    handleSpv2Deposit,
    handleSpv2Withdrawal,
    calculateStabilityPoolWithdrawalV2,
} from '../utils/wallet'

const log = makeLog('common/redux/wallet')

type FederationPayloadAction<T = object> = PayloadAction<
    { federationId: string } & T
>

type FederationWalletState = {
    stabilityPoolState: StabilityPoolState | null
    /** Amount of liquidity available in the stability pool in MSats */
    stabilityPoolAvailableLiquidity: MSats | null
    /** Unit - BTC per USD */
    averageFeeRate: number | null
}

const initialFederationWalletState = {
    stabilityPoolState: null,
    stabilityPoolAvailableLiquidity: null,
    averageFeeRate: null,
} satisfies FederationWalletState

// All wallet state is keyed by federation id to keep federation wallets separate, so it starts as an empty object.
const initialState = {} as Record<
    Federation['id'],
    FederationWalletState | undefined
>

export type WalletState = typeof initialState

/*** Slice definition ***/

const getFederationWalletState = (state: WalletState, federationId: string) =>
    state[federationId] || {
        ...initialFederationWalletState,
    }

export const walletSlice = createSlice({
    name: 'wallet',
    initialState,
    reducers: {
        setStabilityPoolState(
            state,
            action: FederationPayloadAction<{
                stabilityPoolState: StabilityPoolState
            }>,
        ) {
            const { federationId, stabilityPoolState } = action.payload
            state[federationId] = {
                ...getFederationWalletState(state, federationId),
                stabilityPoolState,
            }
        },
        setStabilityPoolAvailableLiquidity(
            state,
            action: FederationPayloadAction<{
                stabilityPoolAvailableLiquidity: MSats
            }>,
        ) {
            const { federationId, stabilityPoolAvailableLiquidity } =
                action.payload
            state[federationId] = {
                ...getFederationWalletState(state, federationId),
                stabilityPoolAvailableLiquidity,
            }
        },
        resetFederationWalletState(state, action: FederationPayloadAction) {
            state[action.payload.federationId] = {
                ...initialFederationWalletState,
            }
        },
        resetWalletState() {
            return { ...initialState }
        },
    },
    extraReducers: builder => {
        builder.addCase(fetchStabilityPoolState.fulfilled, (state, action) => {
            const { federationId } = action.meta.arg
            const federation = getFederationWalletState(state, federationId)
            state[federationId] = {
                ...federation,
                ...action.payload,
            }
        })
        builder.addCase(
            fetchStabilityPoolAvailableLiquidity.fulfilled,
            (state, action) => {
                const { federationId } = action.meta.arg
                const federation = getFederationWalletState(state, federationId)
                state[federationId] = {
                    ...federation,
                    stabilityPoolAvailableLiquidity: action.payload,
                }
            },
        )

        builder.addCase(
            fetchStabilityPoolAverageFeeRate.fulfilled,
            (state, action) => {
                const { federationId } = action.meta.arg
                const federation = getFederationWalletState(state, federationId)
                state[federationId] = {
                    ...federation,
                    averageFeeRate: action.payload,
                }
            },
        )
    },
})

/*** Basic actions ***/

export const {
    setStabilityPoolState,
    setStabilityPoolAvailableLiquidity,
    resetFederationWalletState,
    resetWalletState,
} = walletSlice.actions

/*** Async thunk actions ***/

export const generateAddress = createAsyncThunk<
    string,
    {
        fedimint: FedimintBridge
        federationId: string
        frontendMetadata: FrontendMetadata
    },
    { state: CommonState }
>(
    'wallet/generateAddress',
    async ({ fedimint, federationId, frontendMetadata }) => {
        return fedimint.generateAddress(federationId, frontendMetadata)
    },
)

export const generateEcash = createAsyncThunk<
    { ecash: string; cancelAt: number; operationId: string },
    {
        fedimint: FedimintBridge
        federationId: string
        amount: MSats
        includeInvite: boolean
        frontendMetadata: FrontendMetadata
    },
    { state: CommonState }
>(
    'wallet/generateEcash',
    async ({
        fedimint,
        federationId,
        amount,
        includeInvite,
        frontendMetadata,
    }) => {
        return fedimint.generateEcash(
            amount,
            federationId,
            includeInvite,
            frontendMetadata,
        )
    },
)

export const generateInvoice = createAsyncThunk<
    string,
    {
        fedimint: FedimintBridge
        federationId: string
        amount: MSats
        description: string
        frontendMetadata: FrontendMetadata
    },
    { state: CommonState }
>(
    'wallet/generateInvoice',
    async ({
        fedimint,
        federationId,
        amount,
        description,
        frontendMetadata,
    }) => {
        return fedimint.generateInvoice(
            amount,
            description,
            federationId,
            null,
            frontendMetadata,
        )
    },
)

export const payInvoice = createAsyncThunk<
    { preimage: string },
    {
        fedimint: FedimintBridge
        federationId: string
        invoice: string
        notes?: string
    },
    { state: CommonState }
>('wallet/payInvoice', async ({ fedimint, federationId, invoice, notes }) => {
    return fedimint.payInvoice(invoice, federationId, notes)
})

/**
 * Tries to redeem ecash. Returns a Promise that resolves
 * once the ecash is redeemed/fails or the operation times out.
 */
export const receiveEcash = createAsyncThunk<
    ReceiveEcashResult,
    { fedimint: FedimintBridge; federationId: string; ecash: string },
    { state: CommonState }
>('wallet/receiveEcash', async ({ fedimint, federationId, ecash }) => {
    const [amount, operationId] = await fedimint.receiveEcash(
        ecash,
        federationId,
    )

    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            unsubscribe()
            // Assuming timeout indicates user cannot connect to federation
            // TODO: Validate this assumption
            resolve({ amount, status: 'pending' })
        }, 5000) // 5s timeout

        const unsubscribe = fedimint.addListener('transaction', event => {
            if (event.transaction.id !== operationId) return
            const txn = event.transaction

            if (txn.kind === 'oobReceive') {
                if (txn.state?.type === 'done') {
                    clearTimeout(timeout)
                    unsubscribe()
                    resolve({ amount, status: 'success' })
                } else if (txn.state?.type === 'failed') {
                    clearTimeout(timeout)
                    unsubscribe()
                    resolve({
                        amount,
                        status: 'failed',
                        error: txn.state?.error,
                    })
                }
            }
        })
    })
})

export const validateEcash = createAsyncThunk<
    RpcEcashInfo,
    { fedimint: FedimintBridge; ecash: string },
    { state: CommonState }
>('wallet/validateEcash', async ({ fedimint, ecash }) => {
    return fedimint.validateEcash(ecash)
})

export const cancelEcash = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; ecash: string },
    { state: CommonState }
>('wallet/cancelEcash', async ({ fedimint, ecash }) => {
    const decoded = await fedimint.validateEcash(ecash)

    // Should never happen since the user is the one who minted the ecash notes
    if (decoded.federation_type !== 'joined') {
        throw new Error('errors.unknown-ecash-issuer')
    }

    await fedimint.cancelEcash(ecash, decoded.federation_id)
})

export const generateReusedEcashProofs = createAsyncThunk<
    JSONObject[],
    { fedimint: FedimintBridge },
    { state: CommonState }
>('wallet/generateReusedEcashProofs', async ({ fedimint }, { getState }) => {
    const state = getState()
    const reusedEcashFederations = selectReusedEcashFederations(state)

    const proofs = await Promise.allSettled(
        reusedEcashFederations.map(f =>
            fedimint.generateReusedEcashProofs(f.id),
        ),
    )

    const errors = proofs.filter(p => p.status === 'rejected')
    if (errors.length > 0) {
        log.error(
            'Failed to generate reused ecash proofs',
            JSON.stringify(errors),
        )
    }

    const settledProofs = proofs.filter(
        (p): p is PromiseFulfilledResult<JSONObject> =>
            p.status === 'fulfilled',
    )

    return settledProofs.map(p => p.value)
})

export const fetchStabilityPoolState = createAsyncThunk<
    StabilityPoolState,
    { fedimint: FedimintBridge; federationId: string },
    { state: CommonState }
>(
    'wallet/fetchStabilityPoolState',
    async ({ fedimint, federationId }, { dispatch, getState }) => {
        const version = selectStabilityPoolVersion(getState())
        if (version === 2) {
            const accountInfo = await fedimint.spv2AccountInfo(federationId)
            log.info('stabilityPoolState (v2)', accountInfo)
            dispatch(
                setStabilityPoolState({
                    federationId,
                    stabilityPoolState: accountInfo,
                }),
            )
            return accountInfo
        } else {
            const legacyAccountInfo =
                await fedimint.stabilityPoolAccountInfo(federationId)

            // SPv2 combines the cycle start price and accountInfo call
            const priceCents =
                await fedimint.stabilityPoolCycleStartPrice(federationId)
            const price = Number(priceCents)

            const stabilityPoolState = coerceLegacyAccountInfo(
                legacyAccountInfo,
                price,
            )

            log.info('stabilityPoolState (v1)', stabilityPoolState)
            dispatch(
                setStabilityPoolState({
                    federationId,
                    stabilityPoolState,
                }),
            )
            return stabilityPoolState
        }
    },
)

export const fetchStabilityPoolAvailableLiquidity = createAsyncThunk<
    MSats,
    { fedimint: FedimintBridge; federationId: string },
    { state: CommonState }
>(
    'wallet/fetchStabilityPoolAvailableLiquidity',
    async ({ fedimint, federationId }, { getState }) => {
        const version = selectStabilityPoolVersion(getState())
        if (version === 2) {
            const liquidity =
                await fedimint.spv2AvailableLiquidity(federationId)
            log.info('spv2AvailableLiquidity', liquidity)
            return liquidity
        } else {
            const liquidity =
                await fedimint.stabilityPoolAvailableLiquidity(federationId)
            log.info('stabilityPoolAvailableLiquidity (v1)', liquidity)
            return liquidity
        }
    },
)

export const fetchStabilityPoolAverageFeeRate = createAsyncThunk<
    number,
    { fedimint: FedimintBridge; federationId: string; numCycles: number },
    { state: CommonState }
>(
    'wallet/fetchStabilityPoolAverageFeeRate',
    async ({ fedimint, federationId, numCycles }, { getState }) => {
        const version = selectStabilityPoolVersion(getState())
        if (version === 2) {
            const feeRate = await fedimint.spv2AverageFeeRate(
                federationId,
                numCycles,
            )
            log.info('spv2AverageFeeRate', { feeRate })
            return Number(feeRate)
        } else {
            const feeRate = await fedimint.stabilityPoolAverageFeeRate(
                federationId,
                numCycles,
            )
            log.info('stabilityPoolAverageFeeRate (v1)', { feeRate })
            return Number(feeRate)
        }
    },
)

export const refreshActiveStabilityPool = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>(
    'wallet/refreshActiveStabilityPool',
    async ({ fedimint }, { dispatch, getState }) => {
        const state = getState()
        const federationId = state.federation.activeFederationId
        if (!federationId) throw new Error('errors.unknown-error')
        // Make sure we have the latest exchange rates every time we refresh stabilitypool
        // so deposits/withdrawal amount conversions are as accurate as possible

        await dispatch(refreshHistoricalCurrencyRates({ fedimint }))
            .unwrap()
            .catch(_error => {
                log.warn(
                    'Failed to refresh currency rates during stability pool refresh',
                )
            })

        dispatch(
            fetchStabilityPoolAverageFeeRate({
                fedimint,
                federationId,
                numCycles: 10,
            }),
        )

        dispatch(
            fetchStabilityPoolAvailableLiquidity({
                fedimint,
                federationId,
            }),
        )

        await dispatch(
            fetchStabilityPoolState({
                fedimint,
                federationId,
            }),
        ).unwrap()
    },
)

export const increaseStableBalance = createAsyncThunk<
    Promise<StabilityPoolDepositEvent>,
    {
        fedimint: FedimintBridge
        amount: RpcAmount
    },
    { state: CommonState }
>(
    'wallet/increaseStableBalance',
    async ({ fedimint, amount }, { getState }) => {
        const state = getState()
        const activeFederationId = selectActiveFederation(state)?.id
        if (!activeFederationId) throw new Error('No active federation')
        const ecashBalance = selectFederationBalance(state)
        const feeSchedule = selectStabilityPoolFeeSchedule(state)
        const feeRate = feeSchedule?.sendPpm ?? 0

        // Subtract the estimated fedi fee from the available ecash balance
        // to deposit for the max deposit case
        const maxDepositAmount = Math.floor(
            (1_000_000 * ecashBalance) / (1_000_000 + feeRate),
        ) as MSats

        const stabilityConfig = selectFederationStabilityPoolConfig(state)
        if (!stabilityConfig)
            throw new Error('No stabilitypool in this federation')

        const maxAllowedFeeRate =
            stabilityConfig?.max_allowed_provide_fee_rate_ppb || 0
        const version = stabilityConfig.version

        const amountToDeposit = calculateStabilityPoolDeposit(
            amount,
            maxDepositAmount,
            maxAllowedFeeRate,
        )

        if (version === 2) {
            return handleSpv2Deposit(
                amountToDeposit,
                fedimint,
                activeFederationId,
            )
        } else {
            return handleStabilityPoolDeposit(
                amountToDeposit,
                fedimint,
                activeFederationId,
            )
        }
    },
)

export const decreaseStableBalanceV1 = createAsyncThunk<
    Promise<StabilityPoolWithdrawalEvent>,
    {
        fedimint: FedimintBridge
        amount: RpcAmount
    },
    { state: CommonState }
>(
    'wallet/decreaseStableBalanceV1',
    async ({ fedimint, amount }, { getState }) => {
        const state = getState()
        const activeFederationId = selectActiveFederation(state)?.id
        if (!activeFederationId) throw new Error('No active federation')
        const btcUsdExchangeRate = selectBtcUsdExchangeRate(state)
        const totalLockedCents = selectTotalLockedCents(state)
        const stableBalanceCents = selectStableBalanceCents(state)
        const totalStagedMsats = selectTotalStagedMsats(state)

        const { lockedBps, unlockedAmount } = calculateStabilityPoolWithdrawal(
            amount,
            btcUsdExchangeRate,
            totalLockedCents,
            totalStagedMsats,
            stableBalanceCents,
        )
        return handleStabilityPoolWithdrawal(
            lockedBps,
            unlockedAmount,
            fedimint,
            activeFederationId,
        )
    },
)

export const decreaseStableBalanceV2 = createAsyncThunk<
    Promise<SPv2WithdrawalEvent>,
    {
        fedimint: FedimintBridge
        amount: UsdCents
    },
    { state: CommonState }
>(
    'wallet/decreaseStableBalanceV2',
    async ({ fedimint, amount }, { getState }) => {
        const state = getState()
        const activeFederationId = selectActiveFederation(state)?.id
        if (!activeFederationId) throw new Error('No active federation')

        const totalLockedCents = selectTotalLockedCents(state)
        const totalStagedCents = selectTotalStagedCents(state)

        const totalBalanceCents = (totalLockedCents +
            totalStagedCents) as UsdCents

        const { amountCents, withdrawAll } = calculateStabilityPoolWithdrawalV2(
            amount,
            totalBalanceCents,
        )

        return handleSpv2Withdrawal(
            amountCents,
            fedimint,
            activeFederationId,
            withdrawAll,
        )
    },
)

/*** Selectors ***/

const selectFederationWalletState = (
    s: CommonState,
    federationId?: Federation['id'],
) => {
    if (!federationId) {
        federationId = selectActiveFederationId(s)
    }
    return getFederationWalletState(s.wallet, federationId || '')
}

export const selectStabilityPoolState = createSelector(
    (s: CommonState) => s,
    (_: CommonState, federationId?: Federation['id']) => federationId,
    (s, federationId) => {
        return selectFederationWalletState(s, federationId).stabilityPoolState
    },
)
/**
 * Calculates the total amount locked in deposits in msats
 * */
export const selectTotalLockedMsats = createSelector(
    selectStabilityPoolState,
    stabilityPoolState => {
        if (!stabilityPoolState) return 0 as MSats
        return stabilityPoolState.lockedBalance
    },
)

/**
 * Calculates the total amount locked in deposits in cents
 * */
export const selectTotalLockedCents = createSelector(
    selectStabilityPoolState,
    (stabilityPoolState): UsdCents => {
        if (!stabilityPoolState) return 0 as UsdCents
        const { lockedBalance, currCycleStartPrice } = stabilityPoolState

        return (amountUtils.msatToBtc(lockedBalance) *
            currCycleStartPrice) as UsdCents
    },
)

/**
 * Calculates the total amount locked in deposits, converted to the selectedCurrency
 * */
export const selectTotalLockedFiat = createSelector(
    selectTotalLockedCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (s: CommonState) => selectBtcExchangeRate(s),
    (totalLockedCents, btcUsdExchangeRate, btcExchangeRate) => {
        return amountUtils.convertCentsToOtherFiat(
            totalLockedCents,
            btcUsdExchangeRate,
            btcExchangeRate,
        )
    },
)

/**
 * Calculates the total amount of pending deposits in msats
 * */
export const selectTotalStagedMsats = (s: CommonState) => {
    const stabilityPoolState = selectStabilityPoolState(s)
    return stabilityPoolState?.stagedBalance || (0 as MSats)
}

/**
 * Converts total amount of pending deposits in msats to the current USD value in cents
 * */
export const selectTotalStagedCents = createSelector(
    selectStabilityPoolState,
    (stabilityPoolState): UsdCents => {
        if (!stabilityPoolState) return 0 as UsdCents
        const { stagedBalance, currCycleStartPrice } = stabilityPoolState

        return (amountUtils.msatToBtc(stagedBalance) *
            currCycleStartPrice) as UsdCents
    },
)

/**
 * Returns the amount of pending withdrawals in cents
 * */
export const selectUnlockRequest = createSelector(
    (s: CommonState) => s,
    (_: CommonState, federationId?: Federation['id']) => federationId,
    (s, federationId) => {
        const stabilityPoolState = selectStabilityPoolState(s, federationId)
        if (!stabilityPoolState) return null
        return stabilityPoolState.pendingUnlockRequest
    },
)

/**
 * Converts the USD value of pending deposits to selectedCurrency
 * */
export const selectTotalStagedFiat = createSelector(
    selectTotalStagedCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (s: CommonState) => selectBtcExchangeRate(s),
    (totalStagedCents, btcUsdExchangeRate, btcExchangeRate) => {
        return amountUtils.convertCentsToOtherFiat(
            totalStagedCents,
            btcUsdExchangeRate,
            btcExchangeRate,
        )
    },
)

/**
 * Calculates the total stable balance in cents
 * */
export const selectStableBalanceCents = createSelector(
    selectStabilityPoolState,
    stabilityPoolState => {
        if (!stabilityPoolState) return 0 as UsdCents

        const { lockedBalance, currCycleStartPrice } = stabilityPoolState

        const balanceMsats = lockedBalance
        const balanceCents = Number(
            amountUtils
                .msatToFiat(balanceMsats, currCycleStartPrice)
                .toFixed(0),
        ) as UsdCents
        return balanceCents
    },
)

/**
 * Converts the total stable balance in cents to the selectedCurrency
 * */
export const selectStableBalance = createSelector(
    selectStableBalanceCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (s: CommonState) => selectBtcExchangeRate(s),
    (stableBalanceCents, btcUsdExchangeRate, btcExchangeRate) => {
        return amountUtils.convertCentsToOtherFiat(
            stableBalanceCents,
            btcUsdExchangeRate,
            btcExchangeRate,
        )
    },
)

export const selectStableBalanceSats = createSelector(
    selectStableBalanceCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (stableBalanceCents, btcUsdExchangeRate) => {
        const stableBalanceDollars = stableBalanceCents / 100
        return amountUtils.fiatToSat(stableBalanceDollars, btcUsdExchangeRate)
    },
)

/**
 * Calculates the pending stable balance using:
 * 1. the "unlockRequest" value in cents to calculate pending withdrawals
 * 2. total staged seeks in cents (estimated USD value) to calculate pending deposits
 *
 * should be POSITIVE if net depositing, and NEGATIVE if net withdrawing
 * */
export const selectStableBalancePendingCents = createSelector(
    selectStabilityPoolState,
    selectUnlockRequest,
    selectTotalStagedCents,
    (stabilityPoolState, unlockRequest, stagedBalance) => {
        if (!stabilityPoolState) return 0 as UsdCents

        const pendingDepositAmount = stagedBalance
        const pendingWithdrawAmount = (unlockRequest ?? 0) as UsdCents

        if (pendingWithdrawAmount > 0) {
            // Negative to signify a withdrawal
            return -pendingWithdrawAmount as UsdCents
        } else if (pendingDepositAmount > 0) {
            // Positive to signify a deposit
            return pendingDepositAmount
        } else return 0 as UsdCents
    },
)

/**
 * Converts the pending stable balance in cents to the selectedCurrency
 * */
export const selectStableBalancePending = createSelector(
    selectStableBalancePendingCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (s: CommonState) => selectBtcExchangeRate(s),
    (stableBalancePendingCents, btcUsdExchangeRate, btcExchangeRate) => {
        return amountUtils.convertCentsToOtherFiat(
            stableBalancePendingCents,
            btcUsdExchangeRate,
            btcExchangeRate,
        )
    },
)

export const selectWithdrawableStableBalanceCents = createSelector(
    selectStableBalanceCents,
    selectTotalStagedCents,
    (stableBalance, pendingDeposits): UsdCents => {
        return (stableBalance + pendingDeposits) as UsdCents
    },
)

export const selectMinimumWithdrawAmountCents = createSelector(
    (s: CommonState) => selectStabilityPoolVersion(s),
    (s: CommonState) => selectFederationStabilityPoolConfig(s),
    selectStableBalanceCents,
    selectStableBalancePendingCents,
    (version, config, stableBalance, stableBalancePending): UsdCents => {
        // For SPv2, we consider 2 cents to be dust
        if (version === 2) return 2 as UsdCents

        const minimumBasisPoints = config?.min_allowed_cancellation_bps || 0

        // No minimum withdraw amount if we can cancel pending deposits otherwise calculate minimum allowed cancellation from completed deposits
        if (stableBalancePending > 0) {
            return 0 as UsdCents
        } else {
            // convert bps to decimal
            const minimumFraction = Number(
                (minimumBasisPoints / 10000).toFixed(4),
            )
            // calculate balance without cancelledFraction
            const minimumUsdAmount = Number(
                (stableBalance * minimumFraction).toFixed(2),
            )
            return minimumUsdAmount as UsdCents
        }
    },
)

export const selectWithdrawableStableBalanceMsats = createSelector(
    selectWithdrawableStableBalanceCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (withdrawableCents, btcUsdExchangeRate): MSats => {
        const usdAmount = withdrawableCents / 100
        return amountUtils.fiatToMsat(usdAmount as Usd, btcUsdExchangeRate)
    },
)

export const selectMinimumWithdrawAmountMsats = createSelector(
    selectMinimumWithdrawAmountCents,
    (s: CommonState) => selectBtcUsdExchangeRate(s),
    (minimumWithdrawAmountCents, btcUsdExchangeRate): MSats => {
        const usdAmount = minimumWithdrawAmountCents / 100
        return amountUtils.fiatToMsat(usdAmount as Usd, btcUsdExchangeRate)
    },
)

export const selectMinimumDepositAmount = createSelector(
    (s: CommonState) => selectFederationStabilityPoolConfig(s),
    config => {
        const minimumMsats = config?.min_allowed_seek || 0
        return amountUtils.msatToSat(minimumMsats as MSats)
    },
)

/**
 * Get the deposit time from stabilitypool cycle duration in human-readable format
 * */
export const selectFormattedDepositTime = createSelector(
    (s: CommonState) => selectFederationStabilityPoolConfig(s),
    (_: CommonState, t: TFunction) => t,
    (config, t) => {
        if (!config) return 0
        const { secs: seconds } = config.cycle_duration

        if (seconds >= 3600) {
            // Duration exceeds one hour
            return t('feature.stabilitypool.more-than-an-hour')
        } else if (seconds < 60) {
            // Duration is less than a minute
            return seconds > 1
                ? `~${t('feature.stabilitypool.seconds', { seconds })}`
                : `~${t('feature.stabilitypool.one-second')}`
        } else {
            // Convert seconds to nearest half-minute
            const minutes = Math.round((seconds / 60) * 2) / 2
            return minutes > 1
                ? `~${t('feature.stabilitypool.minutes', { minutes })}`
                : `~${t('feature.stabilitypool.one-minute')}`
        }
    },
)

/**
 * Price of BTC in cents per BTC
 * */

export const selectStabilityPoolCycleStartPrice = createSelector(
    (s: CommonState) => s,
    (_: CommonState, federationId?: Federation['id']) => federationId,
    (s, federationId) => {
        const stabilityPoolState = selectStabilityPoolState(s, federationId)
        return stabilityPoolState?.currCycleStartPrice ?? null
    },
)

export const selectStabilityPoolAverageFeeRate = (
    s: CommonState,
    federationId?: Federation['id'],
) => {
    if (!federationId) {
        federationId = selectActiveFederationId(s)
    }
    return federationId
        ? selectFederationWalletState(s, federationId).averageFeeRate
        : null
}

export const selectStabilityPoolAvailableLiquidity = (
    s: CommonState,
    federationId?: Federation['id'],
) => {
    return selectFederationWalletState(s, federationId)
        .stabilityPoolAvailableLiquidity
}

export const selectStabilityPoolVersion = (s: CommonState) =>
    selectFederationStabilityPoolConfig(s)?.version
