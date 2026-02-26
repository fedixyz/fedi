import { useRoute } from '@react-navigation/native'
import { cleanup, screen } from '@testing-library/react-native'
import React from 'react'

import {
    handleMatrixRoomTimelineStreamUpdates,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import { mockRoomMembers } from '@fedi/common/tests/mock-data/matrix-event'
import { ChatType } from '@fedi/common/types'
import i18n from '@fedi/native/localization/i18n'

import ChatConversation from '../../../../../components/feature/chat/ChatConversation'
import { renderWithProviders } from '../../../../utils/render'

// Mock useObserveMatrixRoom which starts room observation
jest.mock('@fedi/common/hooks/matrix', () => ({
    useObserveMatrixRoom: jest.fn(() => ({
        isPaginating: false,
        handlePaginate: jest.fn(),
    })),
}))

// Mock SvgImage used in NoMessagesNotice and Avatar
jest.mock('../../../../../components/ui/SvgImage', () => {
    const { Text: RNText } = jest.requireActual('react-native')
    return {
        __esModule: true,
        default: ({ name }: { name: string }) => <RNText>{name}</RNText>,
        SvgImageSize: {
            xxs: 'xxs',
            xs: 'xs',
            sm: 'sm',
            md: 'md',
            lg: 'lg',
            xl: 'xl',
        },
    }
})

const ROOM_ID = '!test-room:example.com'

function storeWithEventsLoaded() {
    const store = setupStore()
    // Set roomTimelines[ROOM_ID] to an empty array (timeline loaded, no events)
    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId: ROOM_ID,
            updates: [{ Clear: {} }],
        }),
    )
    return store
}

function renderChat(store: ReturnType<typeof setupStore>) {
    return renderWithProviders(
        <ChatConversation
            type={ChatType.group}
            id={ROOM_ID}
            newMessageBottomOffset={90}
        />,
        { store },
    )
}

describe('ChatConversation - loading states during group creation', () => {
    beforeEach(() => {
        jest.mocked(useRoute).mockReturnValue({
            key: 'ChatRoomConversation',
            name: 'ChatRoomConversation' as any,
            params: { roomId: ROOM_ID },
        })
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('shows loading indicator when events have not loaded', () => {
        // Timeline not yet loaded — roomTimelines[roomId] is undefined
        const store = setupStore()

        renderChat(store)

        // Neither empty state should render — loading spinner is shown instead
        expect(
            screen.queryByText(i18n.t('feature.chat.no-one-is-in-this-group')),
        ).not.toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.chat.no-messages'), {
                exact: false,
            }),
        ).not.toBeOnTheScreen()
    })

    it('shows loading state when events loaded but members not yet loaded', () => {
        // Timeline is loaded (empty), but members haven't been fetched yet.
        // Should continue showing loading indicator, not any empty state.
        const store = storeWithEventsLoaded()

        renderChat(store)

        // Neither empty state should render — loading spinner is shown instead
        expect(
            screen.queryByText(i18n.t('feature.chat.no-messages'), {
                exact: false,
            }),
        ).not.toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.chat.no-one-is-in-this-group'), {
                exact: false,
            }),
        ).not.toBeOnTheScreen()
    })

    it('shows NoMembersNotice when events loaded and member count is 1 (alone)', () => {
        // After members load and user is alone, should show invite notice
        const store = storeWithEventsLoaded()
        store.dispatch(
            setMatrixRoomMembers({
                roomId: ROOM_ID,
                members: [{ ...mockRoomMembers[0], roomId: ROOM_ID }],
            }),
        )

        renderChat(store)

        expect(
            screen.getByText(i18n.t('feature.chat.no-one-is-in-this-group'), {
                exact: false,
            }),
        ).toBeOnTheScreen()
    })
})
