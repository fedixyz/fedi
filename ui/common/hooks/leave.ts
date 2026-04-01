import { TFunction } from 'i18next'
import { useCallback, useState } from 'react'

import { useToast } from '@fedi/common/hooks/toast'
import {
    changeAuthenticatedGuardian,
    leaveCommunity,
    leaveFederation,
    selectCanLeaveCommunity,
} from '@fedi/common/redux/federation'
import { Community, Federation } from '@fedi/common/types'

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

    return { handleLeaveFederation }
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
