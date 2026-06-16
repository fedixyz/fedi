import '@testing-library/jest-dom'
import { fireEvent, screen } from '@testing-library/react'

import { ParsedFediChatRoom, ParserDataType } from '@fedi/common/types'
import { OmniConfirmation } from '@fedi/web/src/components/OmniInput/OmniConfirmation'
import { chatConfirmJoinPublicRoomRoute } from '@fedi/web/src/constants/routes'
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
})
