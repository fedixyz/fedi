import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    fetchCurrencyPrices,
    setFederations,
    setLastUsedFederationId,
    setupStore,
} from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'

import { FederationWalletSelector } from '../../../src/components/FederationWalletSelector'
import { renderWithProviders } from '../../utils/render'

describe('/components/FederationWalletSelector', () => {
    let store: ReturnType<typeof setupStore>

    beforeAll(() => {
        store = setupStore()
    })

    describe('when the component is rendered with an active federation', () => {
        it('should render name and balance of federation', async () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId('1'))
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                },
            })
            renderWithProviders(<FederationWalletSelector />, {
                store,
            })

            const name = screen.getByText('test-federation')
            const amount = screen.getByText('2.00 USD (2,000 SATS)')

            expect(name).toBeInTheDocument()
            expect(amount).toBeInTheDocument()
        })
    })

    describe('when the component is rendered with two federations', () => {
        it('should render both in dropdown list when it is opened', async () => {
            store.dispatch(setFederations([mockFederation1, mockFederation2]))
            store.dispatch(setLastUsedFederationId('1'))
            renderWithProviders(<FederationWalletSelector />, {
                store,
            })

            const component = screen.getByLabelText('federation-selector')
            userEvent.click(component)

            await waitFor(() => {
                const items = screen.getAllByLabelText('federation-item')
                expect(items).toHaveLength(2)
            })
        })
    })
})
