import { act, waitFor } from '@testing-library/react'
import i18next from 'i18next'

import { useAcceptForeignEcash } from '../../../../hooks/chat'
import { useObserveMatrixRoom } from '../../../../hooks/matrix'
import {
    checkForReceivablePayments,
    inviteUserToMatrixRoom,
    selectFederationBalance,
    selectLastUsedFederationId,
    selectLoadedFederations,
    selectMatrixAuth,
    selectMatrixChatsList,
    selectMatrixRoomEvents,
    sendMatrixPaymentPush,
    setupStore,
} from '../../../../redux'
import { MatrixPaymentEvent, Sats } from '../../../../types'
import { FedimintBridge } from '../../../../utils/fedimint'
import { isPaymentEvent } from '../../../../utils/matrix'
import { createIntegrationTestBuilder } from '../../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../../utils/render'

describe('useCreateMatrixRoom', () => {
    const builderAlice = createIntegrationTestBuilder()
    const bobTheBuilder = createIntegrationTestBuilder()

    let storeAlice: ReturnType<typeof setupStore>
    let storeBob: ReturnType<typeof setupStore>
    let fedimintAlice: FedimintBridge
    let fedimintBob: FedimintBridge

    beforeEach(() => {
        storeAlice = builderAlice.getContext().store
        storeBob = bobTheBuilder.getContext().store
        fedimintAlice = builderAlice.getContext().bridge.fedimint
        fedimintBob = bobTheBuilder.getContext().bridge.fedimint
    })

    it('should decode the ecash, load the federation preview, join the federation, and claim the ecash', async () => {
        await builderAlice.withEcashReceived(100_000)
        await bobTheBuilder.withChatReady()

        const roomId = await builderAlice.withChatGroupCreated()
        const federationId = selectLastUsedFederationId(storeAlice.getState())
        const bobAuth = selectMatrixAuth(storeBob.getState())

        act(() => {
            storeAlice.dispatch(
                inviteUserToMatrixRoom({
                    fedimint: fedimintAlice,
                    roomId,
                    userId: bobAuth?.userId as string,
                }),
            )
        })

        await waitFor(() => {
            const chatsList2 = selectMatrixChatsList(storeBob.getState())
            expect(chatsList2).toHaveLength(1)
        })

        act(() => {
            storeAlice.dispatch(
                sendMatrixPaymentPush({
                    fedimint: fedimintAlice,
                    federationId,
                    roomId,
                    recipientId: bobAuth?.userId as string,
                    amount: 10 as Sats,
                }),
            )
        })

        renderHookWithBridge(
            () => useObserveMatrixRoom(roomId),
            storeBob,
            fedimintBob,
        )

        let paymentEvent: MatrixPaymentEvent

        await waitFor(() => {
            const events = selectMatrixRoomEvents(storeBob.getState(), roomId)
            const payment = events.find(e => isPaymentEvent(e))
            expect(payment).toBeTruthy()
            paymentEvent = payment as MatrixPaymentEvent
        })

        const { result } = renderHookWithBridge(
            () => useAcceptForeignEcash(i18next.t, paymentEvent),
            storeBob,
            fedimintBob,
        )

        // initial federation preview load state
        expect(result.current.federationPreview).toBeFalsy()
        expect(result.current.isFetchingPreview).toBeFalsy()

        // when the federation preview is loaded
        await waitFor(() => {
            expect(result.current.isFetchingPreview).toBeFalsy()
            expect(result.current.federationPreview).toBeTruthy()
        })

        // Join the federation
        await act(() => result.current.handleJoin())

        // wait for the federation to be joined
        await waitFor(() => {
            const federations = selectLoadedFederations(storeBob.getState())

            expect(federations).toHaveLength(1)
        })

        storeBob.dispatch(
            checkForReceivablePayments({
                fedimint: fedimintBob,
                roomId,
                receivedPayments: new Set(),
            }),
        )

        // wait for the balance to be updated
        await waitFor(() => {
            const balance = selectFederationBalance(
                storeBob.getState(),
                federationId,
            )

            expect(balance).toBeGreaterThanOrEqual(10_000)
        })
    })
})
