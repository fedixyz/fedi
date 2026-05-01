import { cleanup, screen, userEvent } from '@testing-library/react-native'
import React from 'react'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setMatrixAuth,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import { mockRoomMembers } from '@fedi/common/tests/mock-data/matrix-event'
import { MatrixRoom } from '@fedi/common/types'
import i18n from '@fedi/native/localization/i18n'

import ChatUserActions from '../../../../../components/feature/chat/ChatUserActions'
import { resetToDirectChat } from '../../../../../state/navigation'
import { mockNavigation } from '../../../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('../../../../../components/ui/SvgImage', () => {
    const { Text: RNText } = jest.requireActual('react-native')
    return {
        __esModule: true,
        SvgImageSize: { md: 24 },
        default: ({ name }: { name: string }) => <RNText>{name}</RNText>,
    }
})

const GROUP_ROOM_ID = '!group:example.com'
const DIRECT_ROOM_ID = '!direct:example.com'
const DIRECT_USER_ID = '@alice:example.com'

function addExistingDirectRoom(store: ReturnType<typeof setupStore>) {
    const directRoom: MatrixRoom = {
        ...MOCK_MATRIX_ROOM,
        id: DIRECT_ROOM_ID,
        name: 'Alice',
        directUserId: DIRECT_USER_ID,
        isDirect: true,
        roomState: 'joined',
    }

    store.dispatch(addMatrixRoomInfo(directRoom))
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            {
                Append: {
                    values: [{ status: 'ready' as const, id: DIRECT_ROOM_ID }],
                },
            },
        ]),
    )
}

function renderSubject({
    withExistingDirectRoom = false,
}: {
    withExistingDirectRoom?: boolean
} = {}) {
    const store = setupStore()
    store.dispatch(
        setMatrixAuth({
            userId: '@me:example.com',
            deviceId: 'DEVICE',
        }),
    )

    if (withExistingDirectRoom) {
        addExistingDirectRoom(store)
    }

    const dismiss = jest.fn()
    const member = {
        ...mockRoomMembers[0],
        id: DIRECT_USER_ID,
        roomId: GROUP_ROOM_ID,
    }

    renderWithProviders(
        <ChatUserActions
            roomId={GROUP_ROOM_ID}
            member={member}
            dismiss={dismiss}
        />,
        { store },
    )

    return { dismiss }
}

describe('ChatUserActions', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should navigate to the new direct conversation flow when no direct room exists', async () => {
        const { dismiss } = renderSubject()

        await user.press(
            screen.getByText(i18n.t('feature.chat.go-to-direct-chat')),
        )

        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'ChatUserConversation',
            {
                userId: DIRECT_USER_ID,
                displayName: 'Alice',
            },
        )
        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
        expect(dismiss).toHaveBeenCalledTimes(1)
    })

    it('should reset directly to an existing direct room', async () => {
        const { dismiss } = renderSubject({ withExistingDirectRoom: true })

        await user.press(
            screen.getByText(i18n.t('feature.chat.go-to-direct-chat')),
        )

        expect(mockNavigation.navigate).not.toHaveBeenCalled()
        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            resetToDirectChat(DIRECT_ROOM_ID),
        )
        expect(dismiss).toHaveBeenCalledTimes(1)
    })
})
