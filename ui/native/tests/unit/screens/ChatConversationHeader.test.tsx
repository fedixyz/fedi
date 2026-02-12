import { useRoute } from '@react-navigation/native'
import { act, cleanup, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import { addMatrixUser, setupStore } from '@fedi/common/redux'
import i18n from '@fedi/native/localization/i18n'

import ChatConversationHeader from '../../../components/feature/chat/ChatConversationHeader'
import { renderWithProviders } from '../../utils/render'

// Mock the Header UI component which requires theme.components.Header
// that isn't available in the test theme. We only care about text content.
jest.mock('../../../components/ui/Header', () => {
    const { View: RNView } = jest.requireActual('react-native')
    return {
        __esModule: true,
        default: ({ headerCenter }: { headerCenter?: React.ReactElement }) => (
            <RNView>{headerCenter}</RNView>
        ),
    }
})

// Mock ChatConnectionBadge which depends on matrix sync status
jest.mock('../../../components/feature/chat/ChatConnectionBadge', () => {
    return {
        __esModule: true,
        ChatConnectionBadge: () => null,
    }
})

describe('ChatConversationHeader', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('shows userId when user is not yet cached in Redux', () => {
        jest.mocked(useRoute).mockReturnValue({
            key: 'ChatUserConversation',
            name: 'ChatUserConversation' as any,
            params: { userId: '@alice:example.com' },
        })

        renderWithProviders(<ChatConversationHeader />, { store })

        expect(screen.getByText('@alice:example.com')).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.chat.no-messages-header')),
        ).not.toBeOnTheScreen()
    })

    it('shows displayName after user profile is cached in Redux', async () => {
        jest.mocked(useRoute).mockReturnValue({
            key: 'ChatUserConversation',
            name: 'ChatUserConversation' as any,
            params: { userId: '@alice:example.com' },
        })

        renderWithProviders(<ChatConversationHeader />, { store })

        // Initially shows the userId
        expect(screen.getByText('@alice:example.com')).toBeOnTheScreen()

        // Simulate profile being fetched and cached
        act(() => {
            store.dispatch(
                addMatrixUser({
                    id: '@alice:example.com',
                    displayName: 'Alice',
                }),
            )
        })

        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeOnTheScreen()
        })

        // userId should no longer be visible
        expect(screen.queryByText('@alice:example.com')).not.toBeOnTheScreen()
    })
})
