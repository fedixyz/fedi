import { useCallback, useEffect, useState } from 'react'

import type { MSats } from '../types'
import type { RpcGuardianRemittanceDayBucket } from '../types/bindings'
import { isDev } from '../utils/environment'
import type { BridgeError } from '../utils/errors'
import { useFedimint } from './fedimint'

const dummyGuardianFeeBalance = 2_300_000 as MSats

const dummyGuardianFeeDayBuckets: RpcGuardianRemittanceDayBucket[] = [
    {
        dayKey: '2026-04-22',
        totalAmountRemitted: 1_590_000 as MSats,
        remittanceCount: 8,
        moduleTotals: [
            { module: 'ln', totalAmount: 760_000 as MSats },
            { module: 'mint', totalAmount: 330_000 as MSats },
            { module: 'wallet', totalAmount: 250_000 as MSats },
            { module: 'stability_pool', totalAmount: 250_000 as MSats },
        ],
    },
    {
        dayKey: '2026-04-21',
        totalAmountRemitted: 620_000 as MSats,
        remittanceCount: 4,
        moduleTotals: [
            { module: 'ln', totalAmount: 400_000 as MSats },
            { module: 'mint', totalAmount: 220_000 as MSats },
        ],
    },
    {
        dayKey: '2026-04-20',
        totalAmountRemitted: 90_000 as MSats,
        remittanceCount: 1,
        moduleTotals: [
            { module: 'custom_guardian_module', totalAmount: 90_000 as MSats },
        ],
    },
]

/**
 * The claimable balance of this federation's guardian remittance account — the
 * fees its members have paid the operator, and nothing else. Passing no
 * federation id leaves the balance at zero and reports "not loading", which is
 * how callers wait for an id they are still resolving.
 */
export function useGuardianFeeBalance(federationId?: string) {
    const fedimint = useFedimint()
    const [balance, setBalance] = useState<MSats>(0 as MSats)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<BridgeError | null>(null)

    useEffect(() => {
        setBalance(0 as MSats)
        setError(null)

        if (!federationId) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)

        return fedimint.spv2GuardianRemittanceBalance({
            federationId,
            callback: nextBalance => {
                setBalance(nextBalance)
                setIsLoading(false)
            },
            // nothing re-opens a stream the bridge refused, so without this the
            // caller is left loading for the life of the screen
            onError: nextError => {
                setError(nextError)
                setIsLoading(false)
            },
        })
    }, [fedimint, federationId])

    return { balance, isLoading, error }
}

type GuardianFeesDashboardOptions = {
    useDummyData?: boolean
}

export function useGuardianFeesDashboard(
    federationId?: string,
    options: GuardianFeesDashboardOptions = {},
) {
    const fedimint = useFedimint()
    const useDummyData = isDev() && options.useDummyData
    const [dayBuckets, setDayBuckets] = useState<
        Array<RpcGuardianRemittanceDayBucket>
    >([])
    const [isWithdrawing, setIsWithdrawing] = useState(false)

    // no id while the dummy data is on, so the hook holds no stream open
    // against a federation whose real balance would then be ignored
    const { balance: liveBalance, isLoading: isLiveBalanceLoading } =
        useGuardianFeeBalance(useDummyData ? undefined : federationId)

    const withdrawAll = useCallback(async () => {
        if (!federationId) {
            throw new Error('Missing federation id')
        }

        if (isWithdrawing) {
            return
        }

        setIsWithdrawing(true)
        try {
            if (!useDummyData) {
                await fedimint.spv2WithdrawGuardianRemittanceAll(federationId)
            }
        } finally {
            setIsWithdrawing(false)
        }
    }, [fedimint, federationId, isWithdrawing, useDummyData])

    useEffect(() => {
        setDayBuckets([])

        if (useDummyData) {
            setDayBuckets(dummyGuardianFeeDayBuckets)
            return
        }

        if (!federationId) return

        return fedimint.spv2GuardianRemittanceDashboard({
            federationId,
            callback: nextDashboard => {
                setDayBuckets(nextDashboard.dayBuckets)
            },
        })
    }, [fedimint, federationId, useDummyData])

    return {
        currentBalance: useDummyData ? dummyGuardianFeeBalance : liveBalance,
        dayBuckets,
        isBalanceLoading: useDummyData ? false : isLiveBalanceLoading,
        isWithdrawing,
        withdrawAll,
    }
}
