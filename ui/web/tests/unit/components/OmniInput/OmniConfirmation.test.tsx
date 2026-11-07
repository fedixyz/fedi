import '@testing-library/jest-dom'
import { fireEvent, screen } from '@testing-library/react'

import { setCommunities, setFederations, setupStore } from '@fedi/common/redux'
import { communityInvites } from '@fedi/common/tests/fixtures/community-invites'
import {
    mockCommunity,
    mockFederation1,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    ParsedFediChatRoom,
    ParsedFederationInvite,
    ParserDataType,
} from '@fedi/common/types'
import { parseFediUniversalLink } from '@fedi/common/utils/parser'
import { OmniConfirmation } from '@fedi/web/src/components/OmniInput/OmniConfirmation'
import {
    chatConfirmJoinPublicRoomRoute,
    walletRoute,
    homeRoute,
} from '@fedi/web/src/constants/routes'
import i18n from '@fedi/web/src/localization/i18n'

import { mockUseRouter } from '../../../../jest.setup'
import { renderWithProviders } from '../../../utils/render'

const TEST_ROOM_ID = '!room-invite:test.server'

const roomInvite: ParsedFediChatRoom = {
    type: ParserDataType.FediChatRoom,
    data: { id: TEST_ROOM_ID },
}

describe('/components/OmniInput/OmniConfirmation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe.each(communityInvites)('$prefix QR confirmation', ({ invite }) => {
        it.each([false, true])(
            'preserves the Space action when joined=%s',
            async joined => {
                const store = setupStore()
                if (joined)
                    store.dispatch(
                        setCommunities([
                            {
                                ...mockCommunity,
                                communityInvite: {
                                    type: 'legacy',
                                    community_meta_url:
                                        'https://example.com/space.json',
                                    invite_code_str: invite,
                                },
                            },
                        ]),
                    )
                const parsedData = await parseFediUniversalLink(
                    `https://app.fedi.xyz/link#screen=join&id=${invite.slice(5)}`,
                    createMockFedimintBridge(),
                )
                if (!parsedData) throw new Error('Space link was not parsed')
                renderWithProviders(
                    <OmniConfirmation
                        parsedData={parsedData}
                        onGoBack={jest.fn()}
                        onSuccess={jest.fn()}
                    />,
                    { store },
                )
                expect(
                    screen.getByText(
                        i18n.t(
                            joined
                                ? 'feature.communities.existing-membership'
                                : 'feature.omni.confirm-community-invite',
                        ),
                    ),
                ).toBeInTheDocument()
                fireEvent.click(
                    screen.getByText(
                        i18n.t(
                            joined ? 'phrases.take-me-there' : 'words.continue',
                        ),
                    ),
                )
                expect(mockUseRouter.push).toHaveBeenCalledWith(
                    joined ? homeRoute : `/onboarding/join?id=${invite}`,
                )
                if (joined)
                    expect(
                        store.getState().federation.lastSelectedCommunityId,
                    ).toBe(mockCommunity.id)
            },
        )
    })

    it('should route a scanned room invite to the join-room screen', () => {
        renderWithProviders(
            <OmniConfirmation
                parsedData={roomInvite}
                onGoBack={jest.fn()}
                onSuccess={jest.fn()}
            />,
        )

        expect(
            screen.getByText(
                i18n.t('feature.omni.confirm-fedi-chat-group-invite'),
            ),
        ).toBeInTheDocument()

        fireEvent.click(screen.getByText(i18n.t('words.continue')))

        expect(mockUseRouter.push).toHaveBeenCalledWith(
            chatConfirmJoinPublicRoomRoute(TEST_ROOM_ID),
        )
    })

    it.each([false, true])(
        'should open a joined wallet with an older invite: %s',
        olderInvite => {
            const store = setupStore()
            store.dispatch(setFederations([mockFederation1]))
            const federationInvite: ParsedFederationInvite = {
                type: ParserDataType.FedimintInvite,
                data: {
                    invite: olderInvite
                        ? 'fed11older'
                        : mockFederation1.inviteCode,
                    federationId: olderInvite ? mockFederation1.id : undefined,
                },
            }

            renderWithProviders(
                <OmniConfirmation
                    parsedData={federationInvite}
                    onGoBack={jest.fn()}
                    onSuccess={jest.fn()}
                />,
                { store },
            )

            expect(
                screen.getByText(
                    i18n.t('feature.omni.existing-federation-membership'),
                ),
            ).toBeInTheDocument()

            fireEvent.click(screen.getByText(i18n.t('phrases.take-me-there')))

            expect(mockUseRouter.push).toHaveBeenCalledWith(walletRoute)
        },
    )

    it('should offer to join when scanning the invite of a federation that is not joined', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        const federationInvite: ParsedFederationInvite = {
            type: ParserDataType.FedimintInvite,
            data: { invite: 'invite-for-a-different-federation' },
        }

        renderWithProviders(
            <OmniConfirmation
                parsedData={federationInvite}
                onGoBack={jest.fn()}
                onSuccess={jest.fn()}
            />,
            { store },
        )

        expect(
            screen.getByText(i18n.t('feature.omni.confirm-federation-invite')),
        ).toBeInTheDocument()

        fireEvent.click(screen.getByText(i18n.t('words.continue')))

        expect(mockUseRouter.push).toHaveBeenCalledWith(
            expect.stringContaining('/onboarding/join'),
        )
    })
})
