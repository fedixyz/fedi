import { useCallback, useEffect, useState } from 'react'

import type { MSats } from '../types'
import type { RpcGuardianRemittanceDayBucket } from '../types/bindings'
import { isDev } from '../utils/environment'
import { useFedimint } from './fedimint'

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

type GuardianFeesDashboardOptions = {
    useDummyData?: boolean
}

export function useGuardianFeesDashboard(
    federationId?: string,
    options: GuardianFeesDashboardOptions = {},
) {
    const fedimint = useFedimint()
    const useDummyData = isDev() && options.useDummyData
    const [currentBalance, setCurrentBalance] = useState<MSats>(0 as MSats)
    const [dayBuckets, setDayBuckets] = useState<
        Array<RpcGuardianRemittanceDayBucket>
    >([])
    const [isBalanceLoading, setIsBalanceLoading] = useState(true)
    const [isWithdrawing, setIsWithdrawing] = useState(false)

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
        setCurrentBalance(0 as MSats)
        setDayBuckets([])

        if (useDummyData) {
            setCurrentBalance(2_300_000 as MSats)
            setDayBuckets(dummyGuardianFeeDayBuckets)
            setIsBalanceLoading(false)
            return
        }

        if (!federationId) {
            setIsBalanceLoading(false)
            return
        }

        setIsBalanceLoading(true)

        const unsubscribeDashboard = fedimint.spv2GuardianRemittanceDashboard({
            federationId,
            callback: nextDashboard => {
                setDayBuckets(nextDashboard.dayBuckets)
            },
        })
        const unsubscribeBalance = fedimint.spv2GuardianRemittanceBalance({
            federationId,
            callback: nextBalance => {
                setCurrentBalance(nextBalance)
                setIsBalanceLoading(false)
            },
        })

        return () => {
            unsubscribeDashboard()
            unsubscribeBalance()
        }
    }, [fedimint, federationId, useDummyData])

    return {
        currentBalance,
        dayBuckets,
        isBalanceLoading,
        isWithdrawing,
        withdrawAll,
    }
}
