import {
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import { setupStore } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import {
    RpcFederationPreview,
    RpcTimelineEventItemId,
} from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import ChatSpTransferEvent from '../../../components/feature/stabilitypool/chat-events/ChatSpTransferEvent'
import { renderWithProviders } from '../../utils/render'

const FEDERATION_ID = 'test-federation-id-123'
const FEDERATION_NAME = 'Test Federation'
const INVITE_CODE = 'fed1testinvite'

const mockPreview: RpcFederationPreview = {
    id: FEDERATION_ID,
    name: FEDERATION_NAME,
    meta: {},
    inviteCode: INVITE_CODE,
    returningMemberStatus: { type: 'newMember' },
}

const mockHandleJoin = jest.fn(() => Promise.resolve())
const mockRefreshTransferState = jest.fn(() => Promise.resolve())

jest.mock('@fedi/common/hooks/spTransfer', () => ({
    useSpTransferEventContent: jest.fn(() => ({
        status: 'pending',
        amount: 1000,
        federationId: FEDERATION_ID,
        inviteCode: INVITE_CODE,
        handleReject: jest.fn(),
        refreshTransferState: mockRefreshTransferState,
    })),
}))

jest.mock('@fedi/common/hooks/federation', () => ({
    useFederationInviteCode: jest.fn(() => ({
        previewResult: {
            preview: mockPreview,
            isMember: false,
        },
        isChecking: false,
        isJoining: false,
        handleJoin: mockHandleJoin,
    })),
}))

jest.mock(
    '../../../components/feature/chat/JoinFederationOverlay',
    () =>
        ({ show, onJoin }: { show: boolean; onJoin: () => void }) => {
            const { Text, Pressable } = jest.requireActual('react-native')

            return show ? (
                <Pressable onPress={onJoin}>
                    <Text>join-overlay</Text>
                </Pressable>
            ) : null
        },
)

jest.mock('../../../components/ui/SvgImage', () => {
    const { Text } = jest.requireActual('react-native')

    return {
        __esModule: true,
        default: ({ name }: { name: string }) => <Text>{name}</Text>,
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

const event: MatrixEvent<'spTransfer'> = {
    id: '$sp-transfer-event' as RpcTimelineEventItemId,
    roomId: '!room:test',
    timestamp: 1750083034389,
    localEcho: false,
    sender: '@alice:test',
    sendState: { kind: 'sent', event_id: 'event123' },
    inReply: null,
    mentions: null,
    content: {
        msgtype: 'spTransfer',
        shouldRender: true,
    },
}

describe('ChatSpTransferEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('refreshes the SP transfer state after joining a federation', async () => {
        renderWithProviders(<ChatSpTransferEvent event={event} />, {
            store: setupStore(),
        })

        fireEvent.press(screen.getByText(i18n.t('words.accept')))
        fireEvent.press(screen.getByText('join-overlay'))

        await waitFor(() => {
            expect(mockHandleJoin).toHaveBeenCalled()
            expect(mockRefreshTransferState).toHaveBeenCalled()
        })
    })
})
