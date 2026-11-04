import Clipboard from '@react-native-clipboard/clipboard'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'

import { WEB_APP_URL } from '@fedi/common/constants/api'
import { communityInvites } from '@fedi/common/tests/fixtures/community-invites'
import { renderStyledQrSvg } from '@fedi/common/utils/qrcode'

import CommunityInvite from '../../../screens/CommunityInvite'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockShare = jest.fn().mockResolvedValue({ action: 'sharedAction' })
Object.defineProperty(jest.requireMock('react-native'), 'Share', {
    configurable: true,
    value: { share: mockShare },
})

describe.each(communityInvites)('CommunityInvite $prefix', ({ invite }) => {
    const shareLink = `${WEB_APP_URL}/link#screen=join&id=${invite.slice(5)}`

    beforeEach(() => jest.clearAllMocks())
    afterEach(cleanup)

    it('should encode a join link and copy the original raw invite', async () => {
        renderWithProviders(
            <CommunityInvite
                navigation={mockNavigation as any}
                route={{ ...mockRoute, params: { inviteLink: invite } } as any}
            />,
        )
        await act(async () => {})
        expect(renderStyledQrSvg).toHaveBeenCalledWith(
            shareLink,
            expect.anything(),
        )
        for (const button of screen.getAllByText('Copy')) {
            fireEvent.press(button)
            expect(Clipboard.setString).toHaveBeenLastCalledWith(invite)
        }
    })

    it('should share the same join link encoded in the QR', async () => {
        renderWithProviders(
            <CommunityInvite
                navigation={mockNavigation as any}
                route={{ ...mockRoute, params: { inviteLink: invite } } as any}
            />,
        )
        await act(async () => {})
        fireEvent.press(screen.getByText('Share'))
        expect(mockShare).toHaveBeenCalledWith({ message: shareLink })
    })
})
