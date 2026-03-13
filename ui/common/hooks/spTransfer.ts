import { useCallback, useMemo, useState } from 'react'

import { selectSpTransferState } from '../redux'
import { MatrixEvent, UsdCents } from '../types'
import { RpcSpTransferState, RpcSpTransferStatus } from '../types/bindings'
import { makeLog } from '../utils/log'
import { useFedimint } from './fedimint'
import { useObserveSpTransferState } from './matrix'
import { useCommonSelector } from './redux'

const log = makeLog('common/hooks/spTransfer')

export function useSpTransferEventContent(event: MatrixEvent<'spTransfer'>): {
    status: RpcSpTransferStatus['status']
    amount: UsdCents
    federationId: string
    inviteCode: string | null
    handleReject: () => void
    isRejecting: boolean
    state: RpcSpTransferState
} | null {
    const roomId = event.roomId
    const eventId = event.id ?? ''

    const [isRejecting, setIsRejecting] = useState(false)

    // Start observing the sp transfer state
    useObserveSpTransferState(roomId, eventId)

    // Get the transfer state from redux
    const transferState = useCommonSelector(s =>
        selectSpTransferState(s, roomId, eventId),
    )

    const fedimint = useFedimint()

    const handleReject = useCallback(async () => {
        try {
            setIsRejecting(true)
            log.debug('Rejecting sp transfer', { roomId, eventId })
            await fedimint.matrixDenySpTransferFederationInvite(roomId, eventId)
            log.debug('Rejected sp transfer', { roomId, eventId })
        } catch (error) {
            log.error('Failed to reject sp transfer', {
                roomId,
                eventId,
                error,
            })
        } finally {
            setIsRejecting(false)
        }
    }, [fedimint, roomId, eventId])

    return useMemo(() => {
        if (!transferState) {
            return null
        }

        return {
            state: transferState,
            status: transferState.status.status,
            amount: transferState.amount as UsdCents,
            federationId: transferState.federationId,
            inviteCode: transferState.inviteCode,
            isRejecting,
            handleReject,
        }
    }, [transferState, handleReject, isRejecting])
}
