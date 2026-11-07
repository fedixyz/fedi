import { fireEvent, screen } from '@testing-library/react'

import { WEB_APP_URL } from '@fedi/common/constants/api'
import { setCommunities, setupStore } from '@fedi/common/redux'
import { communityInvites } from '@fedi/common/tests/fixtures/community-invites'
import { mockCommunity } from '@fedi/common/tests/mock-data/federation'
import { renderStyledQrSvg } from '@fedi/common/utils/qrcode'

import { CommunityInviteDialog } from '../../../src/components/CommunityInviteDialog'
import { renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/utils/qrcode', () => ({
    renderStyledQrSvg: jest.fn(() => '<svg />'),
}))

describe.each(communityInvites)(
    'CommunityInviteDialog $prefix',
    ({ invite }) => {
        const shareLink = `${WEB_APP_URL}/link#screen=join&id=${invite.slice(5)}`

        it('should encode and share the join link while copying the raw invite', () => {
            const copy = jest.fn().mockResolvedValue(undefined)
            const share = jest.fn().mockResolvedValue(undefined)
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText: copy },
            })
            Object.defineProperty(navigator, 'share', {
                configurable: true,
                value: share,
            })
            const store = setupStore()
            store.dispatch(
                setCommunities([
                    {
                        ...mockCommunity,
                        communityInvite: {
                            ...mockCommunity.communityInvite,
                            invite_code_str: invite,
                        },
                    },
                ]),
            )
            renderWithProviders(
                <CommunityInviteDialog
                    open
                    communityId={mockCommunity.id}
                    onClose={jest.fn()}
                />,
                { store },
            )
            expect(renderStyledQrSvg).toHaveBeenCalledWith(
                shareLink,
                expect.anything(),
            )
            fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
            expect(copy).toHaveBeenCalledWith(invite)
            fireEvent.click(screen.getByRole('button', { name: 'Share' }))
            expect(share).toHaveBeenCalledWith({ text: shareLink })
        })
    },
)
