import { act, waitFor } from '@testing-library/react'
import i18next from 'i18next'

import { useCreateMatrixRoom } from '../../../hooks/matrix'
import { selectMatrixRoom } from '../../../redux'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('useCreateMatrixRoom', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('should create a matrix room', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context

        const { result } = renderHookWithBridge(
            () => useCreateMatrixRoom(i18next.t),
            store,
            fedimint,
        )

        await act(() => result.current.handleCreateGroup())

        await waitFor(() => {
            expect(result.current.createdRoomId).toBeTruthy()
            const room = selectMatrixRoom(
                store.getState(),
                result.current.createdRoomId as string,
            )
            expect(room?.id).toEqual(result.current.createdRoomId)
        })
    }, 30000)

    it('should create a public matrix room', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context

        const { result } = renderHookWithBridge(
            () => useCreateMatrixRoom(i18next.t),
            store,
            fedimint,
        )

        act(() => result.current.setIsPublic(true))
        await act(() => result.current.handleCreateGroup())

        await waitFor(() => {
            expect(result.current.createdRoomId).toBeTruthy()
            const room = selectMatrixRoom(
                store.getState(),
                result.current.createdRoomId as string,
            )
            expect(room?.isPublic).toBe(true)
        })
    }, 30000)

    it('should create a broadcastOnly matrix room', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context

        const { result } = renderHookWithBridge(
            () => useCreateMatrixRoom(i18next.t),
            store,
            fedimint,
        )

        act(() => result.current.setBroadcastOnly(true))
        await act(() => result.current.handleCreateGroup())

        await waitFor(() => {
            expect(result.current.createdRoomId).toBeTruthy()
            const room = selectMatrixRoom(
                store.getState(),
                result.current.createdRoomId as string,
            )
            expect(room?.broadcastOnly).toBe(true)
        })
    }, 30000)

    it('should error if no name is provided', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context

        const { result } = renderHookWithBridge(
            () => useCreateMatrixRoom(i18next.t),
            store,
            fedimint,
        )

        act(() => result.current.setGroupName(''))
        await act(() => result.current.handleCreateGroup())

        expect(result.current.errorMessage).toEqual(
            i18next.t('errors.group-name-required'),
        )
    }, 30000)

    it('should error if the group name is >=30 characters', async () => {
        await builder.withChatReady()

        const {
            store,
            bridge: { fedimint },
        } = context

        const { result } = renderHookWithBridge(
            () => useCreateMatrixRoom(i18next.t),
            store,
            fedimint,
        )

        act(() => result.current.setGroupName('a'.repeat(30)))

        expect(result.current.errorMessage).toEqual(
            i18next.t('errors.group-name-too-long'),
        )
    }, 30000)
})
