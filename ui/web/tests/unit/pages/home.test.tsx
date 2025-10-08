import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import {
    setCommunities,
    setFederations,
    setLastUsedFederationId,
    setupStore,
} from '@fedi/common/redux'
import {
    mockFederation1,
    mockCommunity,
} from '@fedi/common/tests/mock-data/federation'
import { MatrixRoom } from '@fedi/common/types'

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

// TOOD: unskip and refactor this to the federations.tsx / FederationsPage
describe.skip('/pages/home', () => {
    let store: ReturnType<typeof setupStore>
    let state: AppState

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    describe('when the page loads for the first time', () => {
        it('should render the install banner component', async () => {
            store.dispatch(setCommunities([mockCommunity]))
            store.dispatch(setLastUsedFederationId('1'))

            renderWithProviders(<HomePage />, {
                store,
            })

            const component = screen.getByLabelText('Install Banner')
            expect(component).toBeInTheDocument()
        })

        it('should call useSyncCurrencyRatesAndCache', () => {
            renderWithProviders(<HomePage />, {
                store,
            })

            expect(ratesSpy).toHaveBeenCalled()
        })
    })

    // TOOD: unskip and refactor this to the federations.tsx / FederationsPage
    describe.skip("when the user hasn't already backed up their seed and they have a balance above minimum level", () => {
        it('should render the backup wallet modal', () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId('1'))
            renderWithProviders(<HomePage />, {
                store,
            })

            const modal = screen.getByRole('dialog')
            expect(modal).toBeInTheDocument()
        })
    })

    // TOOD: unskip and refactor this to the federations.tsx / FederationsPage
    describe.skip('when the page loads subsequently', () => {
        describe('when the user is not part of a federation or a community', () => {
            it('should render the Bitcoin Wallet and page titles', () => {
                renderWithProviders(<HomePage />)

                const wallet = screen.getByTestId('bitcoin-wallet')
                const title1 = screen.getByText('Federation News')
                const title2 = screen.getByText('Federation Mods')

                expect(wallet).toBeInTheDocument()
                expect(title1).toBeInTheDocument()
                expect(title2).toBeInTheDocument()
            })
        })

        describe('when the user is part of a federation', () => {
            describe('when the active federation is recovering', () => {
                it('should render the RecoveryInProgress component and not the Bitcoin Wallet', () => {
                    const recoveringFederation = {
                        ...mockFederation1,
                        recovering: true,
                    }

                    renderWithProviders(<HomePage />, {
                        preloadedState: {
                            federation: {
                                ...state.federation,
                                federations: [recoveringFederation],
                                recentlyUsedFederationIds: ['1'],
                                defaultCommunityChats: {
                                    '1': [mockCommunityChat],
                                },
                            },
                        },
                    })

                    const wallet = screen.queryByTestId('bitcoin-wallet')
                    const recoveryInProgress = screen.getByLabelText(
                        'recovery-in-progress',
                    )

                    expect(wallet).not.toBeInTheDocument()
                    expect(recoveryInProgress).toBeInTheDocument()
                })
            })

            describe('when the active federation is not recovering', () => {
                it('should render the Bitcoin Wallet and page titles', () => {
                    renderWithProviders(<HomePage />, {
                        preloadedState: {
                            federation: {
                                ...state.federation,
                                federations: [mockFederation1],
                                recentlyUsedFederationIds: ['1'],
                                defaultCommunityChats: {
                                    '1': [mockCommunityChat],
                                },
                            },
                        },
                    })

                    const wallet = screen.getByTestId('bitcoin-wallet')
                    const title1 = screen.getByText('Federation News')
                    const title2 = screen.getByText('Federation Mods')

                    expect(wallet).toBeInTheDocument()
                    expect(title1).toBeInTheDocument()
                    expect(title2).toBeInTheDocument()
                })
            })
        })

        describe('when the user is part of a community', () => {
            it('should not render the Bitcoin Wallet and render correct title', () => {
                store.dispatch(setCommunities([mockCommunity]))
                store.dispatch(setLastUsedFederationId('1'))
                renderWithProviders(<HomePage />, {
                    store,
                })

                const wallet = screen.queryByTestId('bitcoin-wallet')
                const title1 = screen.getByText('Community Mods') // this is a community so expect a different title

                expect(wallet).not.toBeInTheDocument()
                expect(title1).toBeInTheDocument()
            })
        })
    })
})
