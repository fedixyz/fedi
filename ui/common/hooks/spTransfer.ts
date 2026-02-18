import { useCallback, useMemo, useState } from 'react'

import { selectSpTransferState } from '../redux'
import { MatrixEvent, UsdCents } from '../types'
import { RpcSpTransferState, RpcSpTransferStatus } from '../types/bindings'
import { useObserveSpTransferState } from './matrix'
import { useCommonSelector } from './redux'

export function useSpTransferEventContent(event: MatrixEvent<'spTransfer'>): {
    status: RpcSpTransferStatus['status']
    amount: UsdCents
    federationId: string
    inviteCode: string | null
    handleReject: () => void
    isRejected: boolean
    state: RpcSpTransferState
} | null {
    const roomId = event.roomId
    const eventId = event.id ?? ''

    const [isRejected, setIsRejected] = useState(false)

    // Start observing the sp transfer state
    useObserveSpTransferState(roomId, eventId)

    // Get the transfer state from redux
    const transferState = useCommonSelector(s =>
        selectSpTransferState(s, roomId, eventId),
    )

    const handleReject = useCallback(() => {
        // dispatch(rejectSpTransfer(roomId, eventId))
        // TODO: make this real once bridge adds reject payment rpc
        setIsRejected(true)
    }, [])

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
            handleReject,
            isRejected,
        }
    }, [transferState, handleReject, isRejected])
}
