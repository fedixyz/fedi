import { cleanup, screen } from '@testing-library/react-native'
import React from 'react'

import { setupStore } from '@fedi/common/redux'
import { createMockFederationInviteEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { RpcFederationPreview } from '@fedi/common/types/bindings'
import { MSats } from '@fedi/common/types/units'
import i18n from '@fedi/native/localization/i18n'

import ChatFederationInviteEvent from '../../../components/feature/chat/ChatFederationInviteEvent'
import { renderWithProviders } from '../../utils/render'

const FEDERATION_ID = 'test-federation-id-123'
const FEDERATION_NAME = 'Test Federation'
const INVITE_CODE =
    'fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75'

const mockPreview: RpcFederationPreview = {
    id: FEDERATION_ID,
    name: FEDERATION_NAME,
    meta: {},
    inviteCode: INVITE_CODE,
    returningMemberStatus: { type: 'newMember' },
}

const mockHandleJoin = jest.fn(() => Promise.resolve())
let mockIsMember = false

jest.mock('@fedi/common/hooks/federation', () => ({
    useFederationInviteCode: jest.fn(() => ({
        previewResult: {
            preview: mockPreview,
            isMember: false,
        },
        isChecking: false,
        isError: false,
        isJoining: false,
        isMember: mockIsMember,
        handleJoin: mockHandleJoin,
    })),
}))

jest.mock('../../../components/ui/SvgImage', () => {
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

/** Creates a Redux store with the test federation in the joined list. */
function storeWithJoinedFederation() {
    const store = setupStore({
        federation: {
            federations: [
                {
                    init_state: 'ready' as const,
                    status: 'online' as const,
                    id: FEDERATION_ID,
                    name: FEDERATION_NAME,
                    balance: 0 as MSats,
                    network: 'bitcoin',
                    inviteCode: INVITE_CODE,
                    meta: {},
                    recovering: false,
                    nodes: {},
                    clientConfig: null,
                    fediFeeSchedule: {
                        remittanceThresholdMsat: 0,
                        modules: {},
                    },
                    hadReusedEcash: false,
                },
            ],
            communities: [],
            publicCommunities: [],
            publicFederations: [],
            payFromFederationId: null,
            recentlyUsedFederationIds: [],
            lastSelectedCommunityId: null,
            authenticatedGuardian: null,
            customFediMods: {},
            defaultCommunityChats: {},
            gatewaysByFederation: {},
            seenFederationRatings: [],
            previouslyAutojoinedCommunities: {},
            autojoinNoticesToDisplay: [],
            guardianitoBot: null,
            selectedFederationId: null,
        },
    })
    return store
}

describe('ChatFederationInviteEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should show "Joined" when isMember is true', () => {
        mockIsMember = true

        const event = createMockFederationInviteEvent({
            content: {
                body: INVITE_CODE,
            },
        })

        const store = storeWithJoinedFederation()

        renderWithProviders(<ChatFederationInviteEvent event={event} />, {
            store,
        })

        const joinedText = screen.queryAllByText(i18n.t('words.joined'))
        const joinText = screen.queryAllByText(i18n.t('words.join'))

        expect(joinedText.length).toBeGreaterThan(0)
        expect(joinText.length).toBe(0)
    })

    it('should show "you are a member" text when isMember is true', () => {
        mockIsMember = true

        const event = createMockFederationInviteEvent({
            content: {
                body: INVITE_CODE,
            },
        })

        const store = storeWithJoinedFederation()

        renderWithProviders(<ChatFederationInviteEvent event={event} />, {
            store,
        })

        const memberText = i18n.t('phrases.you-are-a-member', {
            federationName: FEDERATION_NAME,
        })
        expect(screen.queryByText(memberText)).toBeOnTheScreen()
    })

    it('should show "Join" when isMember is false', () => {
        mockIsMember = false

        const event = createMockFederationInviteEvent({
            content: {
                body: INVITE_CODE,
            },
        })

        renderWithProviders(<ChatFederationInviteEvent event={event} />)

        const joinText = screen.queryAllByText(i18n.t('words.join'))
        const joinedText = screen.queryAllByText(i18n.t('words.joined'))

        expect(joinText.length).toBeGreaterThan(0)
        expect(joinedText.length).toBe(0)
    })
})
