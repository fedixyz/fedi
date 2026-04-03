import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    fetchCurrencyPrices,
    setCommunities,
    setFederations,
    setupStore,
} from '@fedi/common/redux'
import {
    mockCommunity,
    mockCommunity2,
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'

import { mockUseRouter } from '../../../../jest.setup'
import { Navigation } from '../../../../src/components/Template/Navigation'
import { renderWithProviders } from '../../../utils/render'

jest.mock('../../../../src/components/SelectWalletOverlay', () => ({
    __esModule: true,
    default: ({ open }: { open: boolean }) =>
        open ? <div>SelectWalletOverlayOpen</div> : null,
}))

jest.mock('../../../../src/components/CommunitiesOverlay', () => ({
    __esModule: true,
    default: ({ open }: { open: boolean }) =>
        open ? <div>CommunitiesOverlayOpen</div> : null,
}))

describe('Navigation', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeEach(() => {
        store = setupStore()
        mockUseRouter.push.mockClear()
        mockUseRouter.replace.mockClear()
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        store.dispatch(setCommunities([mockCommunity, mockCommunity2]))
        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: {
                btcUsdRate: 100000,
            },
        })
    })

    it('opens the select wallet overlay when the active wallet tab is pressed again', async () => {
        mockUseRouter.pathname = '/wallet'
        mockUseRouter.asPath = '/wallet'
        renderWithProviders(<Navigation />, { store })

        await user.click(screen.getByRole('link', { name: /wallet/i }))

        expect(
            await screen.findByText('SelectWalletOverlayOpen'),
        ).toBeInTheDocument()
        expect(mockUseRouter.push).not.toHaveBeenCalled()
    })

    it('opens the communities overlay when the active home tab is pressed again', async () => {
        mockUseRouter.pathname = '/home'
        mockUseRouter.asPath = '/home'

        renderWithProviders(<Navigation />, { store })

        await user.click(screen.getByRole('link', { name: /community/i }))

        expect(
            await screen.findByText('CommunitiesOverlayOpen'),
        ).toBeInTheDocument()
        expect(mockUseRouter.push).not.toHaveBeenCalled()
    })
})
