import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import { MSats, FederationListItem } from '@fedi/common/types'

import HomePage from '../../pages/home'
import { AppState, setupStore } from '../../state/store'
import { renderWithProviders } from '../../utils/test-utils/render'

const mockFederation: FederationListItem = {
    status: 'online',
    init_state: 'ready',
    hasWallet: true,
    balance: 0 as MSats,
    id: '1',
    network: 'bitcoin',
    name: 'test',
    inviteCode: 'test',
    meta: {},
    recovering: false,
    nodes: {},
    clientConfig: null,
    fediFeeSchedule: {
        modules: {},
        remittanceThresholdMsat: 10000,
    },
    hadReusedEcash: false,
}

const mockCommunity: FederationListItem = {
    id: '1',
    status: 'online',
    network: undefined,
    hasWallet: false,
    init_state: 'ready',
    inviteCode: 'test',
    name: 'name',
    meta: {},
}

describe('/pages/home', () => {
    let store
    let state: AppState

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    describe('when the page loads for the first time', () => {
        it('should render the display name modal', async () => {
            renderWithProviders(<HomePage />, {
                preloadedState: {
                    nux: {
                        steps: {
                            ...state.nux.steps,
                            displayNameModal: false,
                        },
                    },
                    matrix: {
                        ...state.matrix,
                        auth: {
                            userId: 'user-id',
                            deviceId: 'device-id',
                            displayName: 'test user',
                        },
                    },
                },
            })

            const modal = screen.getByRole('alertdialog')
            expect(modal).toBeInTheDocument()
        })
    })

    describe('when the page loads subsequently', () => {
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
            it('should render the Bitcoin Wallet and page titles', () => {
                renderWithProviders(<HomePage />, {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockFederation],
                            activeFederationId: '1',
                            defaultCommunityChats: {
                                '1': [
                                    {
                                        id: 'chat-id',
                                        name: 'name',
                                        notificationCount: 1,
                                        inviteCode: 'invite-code',
                                        roomState: 'Joined',
                                    },
                                ],
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

        describe('when the user is part of a community', () => {
            it('should not render the Bitcoin Wallet and render correct title', () => {
                renderWithProviders(<HomePage />, {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockCommunity],
                            activeFederationId: '1',
                        },
                    },
                })

                const wallet = screen.queryByTestId('bitcoin-wallet')
                const title1 = screen.getByText('Community Mods') // this is a community so expect a different title

                expect(wallet).not.toBeInTheDocument()
                expect(title1).toBeInTheDocument()
            })
        })
    })
})
