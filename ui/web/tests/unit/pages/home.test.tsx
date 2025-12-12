import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import { setupStore } from '@fedi/common/redux'
import { mockCommunity } from '@fedi/common/tests/mock-data/federation'
import { MatrixRoom } from '@fedi/common/types'

import i18n from '../../../src/localization/i18n'
import HomePage from '../../../src/pages/home'
import { AppState } from '../../../src/state/store'
import { renderWithProviders } from '../../utils/render'

jest.mock('../../../src/hooks/util.ts', () => ({
    ...jest.requireActual('../../../src/hooks/util'),
    useShowInstallPromptBanner: () => ({
        showInstallBanner: true,
        handleOnDismiss: jest.fn(),
    }),
}))

const ratesSpy = jest.fn()
jest.mock('@fedi/common/hooks/currency.ts', () => ({
    ...jest.requireActual('@fedi/common/hooks/currency'),
    useSyncCurrencyRatesAndCache: () => ratesSpy,
}))

const mockCommunityChat = {
    id: 'chat-id',
    name: 'name',
    notificationCount: 1,
    inviteCode: 'invite-code',
    roomState: 'joined',
    avatarUrl: null,
    directUserId: null,
    isMarkedUnread: false,
    joinedMemberCount: 0,
    preview: null,
    isPreview: false,
    isPublic: false,
} satisfies MatrixRoom

describe('/pages/home', () => {
    let store: ReturnType<typeof setupStore>
    let state: AppState

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    describe('when the page loads', () => {
        beforeEach(() => {
            renderWithProviders(<HomePage />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        communities: [mockCommunity],
                        lastSelectedCommunityId: '1',
                        defaultCommunityChats: {
                            '1': [mockCommunityChat],
                        },
                    },
                },
            })
        })

        it('should render the install banner component', async () => {
            const component = screen.getByLabelText('Install Banner')
            expect(component).toBeInTheDocument()
        })

        it('should call useSyncCurrencyRatesAndCache', () => {
            expect(ratesSpy).toHaveBeenCalled()
        })

        it('should call display the pinned message', () => {
            const pinnedMessage = screen.getByText('pinned message')
            expect(pinnedMessage).toBeInTheDocument()
        })

        it('should show community news title', () => {
            const title = screen.getByText(
                i18n.t('feature.home.community-news-title'),
            )
            expect(title).toBeInTheDocument()
        })

        it('should show community mini apps title', () => {
            const title = screen.getByText(
                i18n.t('feature.home.community-mods-title'),
            )
            expect(title).toBeInTheDocument()
        })
    })
})
