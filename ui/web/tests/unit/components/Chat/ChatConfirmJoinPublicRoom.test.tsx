import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import { useMatrixChatInvites } from '@fedi/common/hooks/matrix'
import { setupStore } from '@fedi/common/redux'
import { createMockGroupPreview } from '@fedi/common/tests/mock-data/matrix'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { ChatConfirmJoinPublicRoom } from '@fedi/web/src/components/Chat/ChatConfirmJoinPublicRoom'
import { chatRoute, chatRoomRoute } from '@fedi/web/src/constants/routes'
import i18n from '@fedi/web/src/localization/i18n'

import { mockUseRouter } from '../../../../jest.setup'
import { renderWithProviders } from '../../../utils/render'

jest.mock('@fedi/common/hooks/matrix')

const TEST_ROOM_ID = '!default-room:test.server'
const mockJoinPublicGroup = jest.fn()

const defaultGroupPreview = createMockGroupPreview({
    id: TEST_ROOM_ID,
    name: 'Default Community Chat',
})

function createStoreWithGroupPreview() {
    const store = setupStore()

    store.dispatch({
        type: 'matrix/previewFederationDefaultChats/fulfilled',
        payload: [defaultGroupPreview],
    })

    return store
}

function createFedimintWithRoomPreview(getRoomPreview: jest.Mock) {
    const fedimint = createMockFedimintBridge()

    fedimint.getMatrixClient = jest.fn().mockReturnValue({
        getRoomPreview,
    })

    return fedimint
}

function createDeferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve
        reject = promiseReject
    })

    return { promise, resolve, reject }
}

function waitForAsyncWorkToSettle() {
    return new Promise(resolve => setTimeout(resolve, 0))
}

describe('/components/Chat/ChatConfirmJoinPublicRoom', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUseRouter.replace.mockClear()
        ;(useMatrixChatInvites as jest.Mock).mockReturnValue({
            joinPublicGroup: mockJoinPublicGroup,
        })
        mockJoinPublicGroup.mockResolvedValue(undefined)
    })

    it('should render the public group confirmation when a group preview exists', () => {
        renderWithProviders(
            <ChatConfirmJoinPublicRoom roomId={TEST_ROOM_ID} />,
            {
                store: createStoreWithGroupPreview(),
            },
        )

        expect(
            screen.getByText(
                i18n.t('feature.onboarding.welcome-to-federation', {
                    federation: defaultGroupPreview.info.name,
                }),
            ),
        ).toBeInTheDocument()
        expect(screen.getByText(i18n.t('words.continue'))).toBeInTheDocument()
    })

    it('should join the public group and navigate to the room', async () => {
        renderWithProviders(
            <ChatConfirmJoinPublicRoom roomId={TEST_ROOM_ID} />,
            {
                store: createStoreWithGroupPreview(),
            },
        )

        fireEvent.click(screen.getByText(i18n.t('words.continue')))

        await waitFor(() => {
            expect(mockJoinPublicGroup).toHaveBeenCalledWith(TEST_ROOM_ID)
        })
        expect(mockUseRouter.replace).toHaveBeenCalledWith(
            chatRoomRoute(TEST_ROOM_ID),
        )
    })

    it('should navigate back to chat when the room preview fails to load', async () => {
        const getRoomPreview = jest
            .fn()
            .mockRejectedValue(new Error('Preview unavailable'))

        renderWithProviders(
            <ChatConfirmJoinPublicRoom roomId={TEST_ROOM_ID} />,
            {
                fedimint: createFedimintWithRoomPreview(getRoomPreview),
            },
        )

        await waitFor(() => {
            expect(mockUseRouter.replace).toHaveBeenCalledWith(chatRoute)
        })
    })

    it('should not navigate when an old room preview request fails after cleanup', async () => {
        const previewRequest = createDeferred<typeof defaultGroupPreview>()
        const getRoomPreview = jest.fn().mockReturnValue(previewRequest.promise)

        const { unmount } = renderWithProviders(
            <ChatConfirmJoinPublicRoom roomId={TEST_ROOM_ID} />,
            {
                fedimint: createFedimintWithRoomPreview(getRoomPreview),
            },
        )

        await waitFor(() => {
            expect(getRoomPreview).toHaveBeenCalledWith(TEST_ROOM_ID)
        })

        unmount()
        previewRequest.reject(new Error('Preview unavailable'))
        await waitForAsyncWorkToSettle()

        expect(mockUseRouter.replace).not.toHaveBeenCalled()
    })
})
