import '@testing-library/jest-dom'
import { fireEvent, screen } from '@testing-library/react'

import { setFederations, setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import {
    ParsedFediChatRoom,
    ParsedFederationInvite,
    ParserDataType,
} from '@fedi/common/types'
import { OmniConfirmation } from '@fedi/web/src/components/OmniInput/OmniConfirmation'
import {
    chatConfirmJoinPublicRoomRoute,
    walletRoute,
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

    it('should offer to open the wallet when scanning the invite of a joined federation', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        const federationInvite: ParsedFederationInvite = {
            type: ParserDataType.FedimintInvite,
            data: { invite: mockFederation1.inviteCode },
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
    })

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
