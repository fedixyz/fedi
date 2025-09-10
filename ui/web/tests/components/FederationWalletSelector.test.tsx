import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'

import { FederationWalletSelector } from '../../src/components/FederationWalletSelector'
import { AppState } from '../../src/state/store'
import { renderWithProviders } from '../../src/utils/test-utils/render'

jest.mock('@fedi/common/hooks/amount', () => ({
    ...jest.requireActual('@fedi/common/hooks/amount'),
    useAmountFormatter: () => ({
        makeFormattedAmountsFromMSats: () => ({
            formattedPrimaryAmount: '2.00 USD',
            formattedSecondaryAmount: '2,000 SATS',
        }),
    }),
}))

describe('/components/PaymentFederationSelector', () => {
    let store
    let state: AppState

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    describe('when the component is rendered with an active federation', () => {
        it('should render name and balance of federation', async () => {
            renderWithProviders(<FederationWalletSelector />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        activeFederationId: '1',
                    },
                },
            })

            const name = screen.getByText('test-federation')
            const amount = screen.getByText('2.00 USD (2,000 SATS)')

            expect(name).toBeInTheDocument()
            expect(amount).toBeInTheDocument()
        })
    })

    describe('when the component is rendered with two federations', () => {
        it('should render both in dropdown list when it is opened', async () => {
            renderWithProviders(<FederationWalletSelector />, {
                preloadedState: {
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1, mockFederation2],
                        activeFederationId: '1',
                    },
                },
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
