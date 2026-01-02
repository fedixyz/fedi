import { TFunction } from 'i18next'
import { useCallback, useState } from 'react'

import { useToast } from '@fedi/common/hooks/toast'
import { selectCurrency } from '@fedi/common/redux'
import {
    changeAuthenticatedGuardian,
    leaveCommunity,
    leaveFederation,
    selectCanLeaveCommunity,
} from '@fedi/common/redux/federation'
import {
    selectStableBalance,
    selectStableBalancePending,
} from '@fedi/common/redux/wallet'
import { Community, Federation, LoadedFederation } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { makeLog } from '../utils/log'
import { useFedimint } from './fedimint'
import { useCommonDispatch, useCommonSelector } from './redux'

const log = makeLog('common/hooks/leave')

export const useLeaveFederation = ({
    t,
    federationId,
}: {
    t: TFunction
    federationId: Federation['id']
}) => {
    const toast = useToast()
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    const stableBalance = useCommonSelector(s =>
        selectStableBalance(s, federationId),
    )
    const pendingStableBalance = useCommonSelector(s =>
        selectStableBalancePending(s, federationId),
    )
    const currency = useCommonSelector(selectCurrency)

    const resetGuardiansState = useCallback(() => {
        dispatch(changeAuthenticatedGuardian(null))
    }, [dispatch])

    // FIXME: this needs some kind of loading state
    // TODO: this should be an thunkified action creator
    const handleLeaveFederation = useCallback(async () => {
        try {
            // FIXME: currently this specific order of operations fixes a
            // bug where the username would get stuck in storage and when
            // rejoining the federation, the user cannot create an new
            // username with the fresh seed and the stored username fails
            // to authenticate so chat ends up totally broken
            // However it's not safe because if leaveFederation fails, then
            // we are resetting state too early and could corrupt things
            // Need to investigate further why running leaveFederation first
            // causes this bug
            resetGuardiansState()

            await dispatch(
                leaveFederation({
                    fedimint,
                    federationId,
                }),
            ).unwrap()
        } catch (e) {
            toast.show({
                content: t('errors.failed-to-leave-federation'),
                status: 'error',
            })
        }
    }, [resetGuardiansState, dispatch, fedimint, federationId, toast, t])

    const validateCanLeaveFederation = useCallback(
        (federation: LoadedFederation) => {
            const alertTitle = `${t(
                'feature.federations.leave-federation',
            )} - ${federation.name}\n\n`

            // Don't allow leaving if stable balance exists
            if (stableBalance > 0) {
                toast.error(
                    t,
                    new Error(
                        `${alertTitle}${t(
                            'feature.federations.leave-federation-withdraw-stable-first',
                            { currency },
                        )}`,
                    ),
                )
            }
            // Don't allow leaving if stable pending balance exists
            else if (pendingStableBalance > 0) {
                toast.error(
                    t,
                    new Error(
                        `${alertTitle}${t(
                            'feature.federations.leave-federation-withdraw-pending-stable-first',
                            { currency },
                        )}`,
                    ),
                )
            }
            // Don't allow leaving sats balance is greater than 100
            else if (amountUtils.msatToSat(federation.balance) > 100) {
                toast.error(
                    t,
                    new Error(
                        `${alertTitle}${t(
                            'feature.federations.leave-federation-withdraw-first',
                        )}`,
                    ),
                )
            } else {
                return true
            }
            return false
        },
        [t, stableBalance, pendingStableBalance, toast, currency],
    )

    return { validateCanLeaveFederation, handleLeaveFederation }
}

export const useLeaveCommunity = (communityId: Community['id']) => {
    const [isLeaving, setIsLeaving] = useState(false)
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()
    const canLeaveCommunity = useCommonSelector(state =>
        selectCanLeaveCommunity(state, communityId),
    )

    const handleLeave = useCallback(async () => {
        setIsLeaving(true)
        try {
            await dispatch(
                leaveCommunity({
                    fedimint,
                    communityId,
                }),
            ).unwrap()
        } catch (e) {
            log.error(`Failed to leave community with ID ${communityId}`, e)
            // TODO: do not throw
            throw e
        } finally {
            setIsLeaving(false)
        }
    }, [dispatch, fedimint, communityId])

    return { canLeaveCommunity, handleLeave, isLeaving }
}
