import { TFunction } from 'i18next'

import { MSats, UsdCents } from '../types'
import {
    StabilityPoolWithdrawalEvent,
    StabilityPoolDepositEvent,
    RpcAmount,
    RpcStabilityPoolAccountInfo,
    RpcLockedSeek,
    SPv2WithdrawalEvent,
} from '../types/bindings'
import { StabilityPoolState } from '../types/wallet'
import amountUtils from './AmountUtils'
import { FedimintBridge } from './fedimint'
import { makeLog } from './log'

const log = makeLog('common/utils/stabilitypool')

// Calculate the actual amount to withdraw given a requested amount
export const calculateStabilityPoolWithdrawal = (
    amount: MSats,
    btcUsdExchangeRate: number,
    totalLockedCents: UsdCents,
    totalStagedMsats: MSats,
    stableBalanceCents: UsdCents,
) => {
    // if we have enough pending balance to cover the withdrawal
    // no need to calculate basis points on stable balance
    if (amount <= totalStagedMsats) {
        log.info(
            `withdrawing ${amount} msats from ${totalStagedMsats} staged msats`,
        )
        // if there is a sub-1sat difference in staged seeks remaining, should be safe to just use the full pending balance to sweep the msats in with the withdrawal
        const unlockedAmount =
            totalStagedMsats - amount < 1000 ? totalStagedMsats : amount
        return { lockedBps: 0, unlockedAmount }
    } else {
        // if there is more to withdraw, unlock the full pending balance
        // and calculate what portion of the stable balance
        // is needed to fulfill the withdrawal amount
        const unlockedAmount = totalStagedMsats
        const remainingWithdrawal = Number((amount - unlockedAmount).toFixed(2))
        log.info(
            `need to withdraw ${remainingWithdrawal} msats from locked balance`,
        )
        const remainingWithdrawalUsd = amountUtils.msatToFiat(
            remainingWithdrawal as MSats,
            btcUsdExchangeRate,
        )
        const remainingWithdrawalCents = remainingWithdrawalUsd * 100
        log.info('remainingWithdrawalCents', remainingWithdrawalCents)

        // ensure this is max 10_000, which represents 100% of the locked balance
        const lockedBps = Math.min(
            Number(
                (
                    (remainingWithdrawalCents * 10_000) /
                    totalLockedCents
                ).toFixed(0),
            ),
            10_000,
        )

        // TODO: remove this? do we need any sweep conditions here at all?
        // If there is <=1 cent leftover after this withdrawal
        // just withdraw the full 10k basis points on the locked balance
        // const centsAfterWithdrawal: UsdCents = (stableBalanceCents -
        //     remainingWithdrawalCents) as UsdCents
        // console.debug('centsAfterWithdrawal', centsAfterWithdrawal)
        // lockedBps =
        //     centsAfterWithdrawal <= 1
        //         ? 10000
        //         : Number(
        //               (
        //                   Number(
        //                       (remainingWithdrawalCents * 10000).toFixed(0),
        //                   ) / totalLockedCents
        //               ).toFixed(0),
        //           )

        log.info('decreaseStableBalance', {
            lockedBps,
            unlockedAmount,
            totalStagedMsats,
            stableBalanceCents,
        })
        return { lockedBps, unlockedAmount }
    }
}

export const calculateStabilityPoolWithdrawalV2 = (
    amountCents: UsdCents,
    totalBalanceCents: UsdCents,
) => {
    // If there is <= 3 (a few) cents leftover after this withdrawal
    // just withdraw the full 10k basis points on the locked balance
    const centsAfterWithdrawal = (totalBalanceCents - amountCents) as UsdCents
    if (centsAfterWithdrawal <= 3) {
        return { withdrawAll: true, amountCents: 0 as UsdCents }
    } else {
        return { withdrawAll: false, amountCents }
    }
}

export const handleStabilityPoolWithdrawal = async (
    lockedBps: number,
    unlockedAmount: MSats,
    fedimint: FedimintBridge,
    federationId: string,
) => {
    const operationId = await fedimint.stabilityPoolWithdraw(
        lockedBps,
        unlockedAmount,
        federationId,
    )
    return new Promise<StabilityPoolWithdrawalEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'stabilityPoolWithdrawal',
            (event: StabilityPoolWithdrawalEvent) => {
                if (
                    event.federationId !== federationId ||
                    event.operationId !== operationId
                ) {
                    return
                }
                log.info(
                    'StabilityPoolWithdrawalEvent.state',
                    event.operationId,
                    event.state,
                )
                // Withdrawals may return the success state quickly if 100% of it was covered from stagedSeeks
                // Otherwise, cancellationAccepted is the appropriate state to resolve
                if (
                    event.state === 'success' ||
                    event.state === 'cancellationAccepted'
                ) {
                    unsubscribeOperation()
                    resolve(event)
                } else if (
                    typeof event.state === 'object' &&
                    ('txRejected' in event.state ||
                        'cancellationSubmissionFailure' in event.state)
                ) {
                    unsubscribeOperation()
                    reject('Transaction rejected')
                }
            },
        )
    })
}

export const handleSpv2Withdrawal = async (
    amount: UsdCents,
    fedimint: FedimintBridge,
    federationId: string,
    withdrawAll = false,
) => {
    log.info('Withdrawal', {
        withdrawAll,
        amount,
    })
    const operationId = withdrawAll
        ? await fedimint.spv2WithdrawAll(federationId)
        : await fedimint.spv2Withdraw(federationId, amount)

    log.info('Withdrawal', { operationId })
    return new Promise<SPv2WithdrawalEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'spv2Withdrawal',
            (event: SPv2WithdrawalEvent) => {
                if (
                    event.federationId !== federationId ||
                    event.operationId !== operationId
                ) {
                    return
                }
                log.info(
                    'SPv2WithdrawalEvent.state',
                    event.operationId,
                    event.state,
                )
                // Withdrawals may return the success state quickly if 100% of it was covered from stagedSeeks
                // Otherwise, cancellationAccepted is the appropriate state to resolve
                if (
                    event.state === 'unlockTxAccepted' ||
                    (typeof event.state === 'object' &&
                        'unlockTxAccepted' in event.state)
                ) {
                    unsubscribeOperation()
                    resolve(event)
                } else if (
                    typeof event.state === 'object' &&
                    ('unlockTxRejected' in event.state ||
                        'unlockProcessingError' in event.state ||
                        'withdrawalTxRejected' in event.state)
                ) {
                    unsubscribeOperation()
                    reject('Transaction rejected')
                }
            },
        )
    })
}

export const calculateStabilityPoolDeposit = (
    amount: RpcAmount,
    ecashBalance: MSats,
    maxAllowedFeeRate: number,
): MSats => {
    // Add some fee padding to resist downside price leakage while deposits confirm
    // arbitrarily we just add the estimated fees for the first 10 cycles
    const maxFeeRateFraction = Number(
        (maxAllowedFeeRate / 1_000_000_000).toFixed(9),
    )
    const maxFirstCycleFee = Number((amount * maxFeeRateFraction).toFixed(0))

    // Min leakage padding of 1 sat or first 10 cycle fees
    const leakagePadding = Math.max(
        1000,
        Number((10 * maxFirstCycleFee).toFixed(0)),
    )

    const amountPlusPadding = Number((amount + leakagePadding).toFixed(0))

    // Make sure total with fee padding doesn't exceed ecash balance
    const amountToDeposit = Math.min(ecashBalance, amountPlusPadding) as MSats

    // When depositing, the fedi fee is added to the deposit amount

    log.info('calculateStabilityPoolDeposit', {
        amount,
        ecashBalance,
        maxAllowedFeeRate,
        leakagePadding,
        amountToDeposit,
    })

    return amountToDeposit
}

export const handleStabilityPoolDeposit = async (
    amount: MSats,
    fedimint: FedimintBridge,
    federationId: string,
): Promise<StabilityPoolDepositEvent> => {
    const operationId = await fedimint.stabilityPoolDepositToSeek(
        amount,
        federationId,
    )

    return new Promise<StabilityPoolDepositEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'stabilityPoolDeposit',
            (event: StabilityPoolDepositEvent) => {
                if (
                    event.federationId === federationId &&
                    event.operationId === operationId
                ) {
                    log.info(
                        'StabilityPoolDepositEvent.state',
                        event.operationId,
                        event.state,
                    )
                    if (event.state === 'txAccepted') {
                        unsubscribeOperation()
                        resolve(event)
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        unsubscribeOperation()
                        reject('Transaction rejected')
                    }
                }
            },
        )
    })
}

export const handleSpv2Deposit = async (
    amount: MSats,
    fedimint: FedimintBridge,
    federationId: string,
): Promise<StabilityPoolDepositEvent> => {
    const operationId = await fedimint.spv2DepositToSeek(amount, federationId)

    return new Promise<StabilityPoolDepositEvent>((resolve, reject) => {
        const unsubscribeOperation = fedimint.addListener(
            'spv2Deposit',
            (event: StabilityPoolDepositEvent) => {
                if (
                    event.federationId === federationId &&
                    event.operationId === operationId
                ) {
                    log.info(
                        'spv2DepositEvent.state',
                        event.operationId,
                        event.state,
                    )
                    if (event.state === 'txAccepted') {
                        unsubscribeOperation()
                        resolve(event)
                    } else if (
                        typeof event.state === 'object' &&
                        'txRejected' in event.state
                    ) {
                        unsubscribeOperation()
                        reject('Transaction rejected')
                    }
                }
            },
        )
    })
}

/** reorganize SPv1 AccountInfo to match the shape of SPv2 */
export const coerceLegacyAccountInfo = (
    accountInfo: RpcStabilityPoolAccountInfo,
    // price in cents
    price: number,
): StabilityPoolState => {
    // SPv2 aggregates stagedSeeks into a combined stagedBalance
    const stagedBalance = accountInfo.stagedSeeks.reduce(
        (result, ss) => Number((result + ss).toFixed(0)),
        0,
    ) as MSats

    // SPv2 aggregates lockedSeeks into a combined lockedBalance
    const lockedBalance = accountInfo.lockedSeeks.reduce(
        (result: number, ls: RpcLockedSeek) => {
            const { currCycleBeginningLockedAmount } = ls
            return result + currCycleBeginningLockedAmount
        },
        0,
    ) as MSats

    const lockedBalanceCents = (lockedBalance * price) / 10 ** 11
    const pendingUnlockRequestCents = Math.floor(
        (lockedBalanceCents * (accountInfo.stagedCancellation ?? 0)) / 10000,
    )

    return {
        currCycleStartPrice: price,
        stagedBalance,
        lockedBalance,
        idleBalance: accountInfo.idleBalance,
        // Cents
        pendingUnlockRequest: pendingUnlockRequestCents,
    }
}

export const makePendingBalanceText = (
    t: TFunction,
    pendingBalance: number,
    formattedAmount: string,
): string => {
    if (pendingBalance > 0) {
        return t('feature.stabilitypool.deposit-pending', {
            amount: formattedAmount,
        })
    } else {
        return t('feature.stabilitypool.withdrawal-pending', {
            amount: formattedAmount,
        })
    }
}
