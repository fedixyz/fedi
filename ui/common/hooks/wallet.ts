import { TFunction } from 'i18next'
import { useMemo } from 'react'

import {
    selectLoadedFederation,
    selectReceivesDisabled,
    selectStableBalancePending,
    selectPaymentType,
} from '@fedi/common/redux'

import { usePopupFederationInfo } from './federation'
import { useRecoveryProgress } from './recovery'
import { useCommonSelector } from './redux'

export function useWalletButtons(t: TFunction, federationId: string) {
    const federation = useCommonSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const receivesDisabled = useCommonSelector(s =>
        selectReceivesDisabled(s, federationId),
    )
    const stableBalancePending = useCommonSelector(s =>
        selectStableBalancePending(s, federationId),
    )
    const paymentType = useCommonSelector(selectPaymentType)

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})
    const { recoveryInProgress } = useRecoveryProgress(federationId)

    const stableBalanceBlocked =
        paymentType === 'stable-balance' && stableBalancePending < 0
    const hasEnded = popupInfo?.ended
    const federationBalance = federation?.balance

    const receiveDisabled = useMemo(() => {
        if (paymentType === 'stable-balance') {
            return hasEnded || recoveryInProgress || stableBalanceBlocked
        }

        return hasEnded || recoveryInProgress || receivesDisabled
    }, [
        paymentType,
        hasEnded,
        recoveryInProgress,
        receivesDisabled,
        stableBalanceBlocked,
    ])

    const sendDisabled = useMemo(() => {
        if (typeof federationBalance !== 'number') return true

        if (paymentType === 'stable-balance') {
            return hasEnded || recoveryInProgress || stableBalanceBlocked
        }

        return hasEnded || recoveryInProgress || federationBalance < 1000
    }, [
        paymentType,
        hasEnded,
        recoveryInProgress,
        stableBalanceBlocked,
        federationBalance,
    ])

    const disabledMessage = recoveryInProgress
        ? t('feature.recovery.recovery-in-progress-wallet')
        : stableBalanceBlocked
          ? t('feature.stabilitypool.pending-withdrawal-blocking')
          : receivesDisabled
            ? t('errors.receives-have-been-disabled')
            : null

    return {
        sendDisabled,
        receiveDisabled,
        disabledMessage,
    }
}
