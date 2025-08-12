import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'

import { setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { MSats } from '@fedi/common/types'

import { SendPayment } from '../../../components/Overlays/SendPayment'
import { AppState } from '../../../state/store'
import { renderWithProviders } from '../../../utils/test-utils/render'

const onAcceptSpy = jest.fn()
const onRejectSpy = jest.fn()

jest.mock('../../../lib/bridge', () => ({
    ...jest.requireActual('../../../lib/bridge'),
    fedimint: {
        payInvoice: () => ({ preimage: 'preimage' }),
    },
}))

const getPreloadedState = (state: AppState) => ({
    federation: {
        ...state.federation,
        federations: [mockFederation1],
        payFromFederationId: '1',
        gatewaysByFederation: {
            '1': [
                {
                    nodePubKey: 'nodePubKey',
                    gatewayId: 'gatewayId',
                    api: 'https://gateway.com',
                    active: true,
                },
            ],
        },
    },
    browser: {
        ...state.browser,
        siteInfo: {
            icon: 'icon',
            title: 'domain.com',
            url: 'https://domain.com',
        },
        invoiceToPay: {
            paymentHash: 'payment-hash',
            amount: 100000 as MSats,
            invoice: 'test',
            fee: null,
            description: 'description',
        },
    },
})

describe('/components/Overlays/SendPayment', () => {
    let store
    let state: AppState

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display the title, sats amount and buttons', () => {
            renderWithProviders(
                <SendPayment onAccept={() => {}} onReject={() => {}} />,
                {
                    preloadedState: getPreloadedState(state),
                },
            )

            const title = screen.getByText('Payment request from domain.com')
            const satsAmount = screen.getByText('100 SATS')
            const acceptButton = screen.getByRole('button', { name: 'Accept' })
            const rejectButton = screen.getByRole('button', { name: 'Reject' })

            expect(title).toBeInTheDocument()
            expect(satsAmount).toBeInTheDocument()
            expect(acceptButton).toBeInTheDocument()
            expect(rejectButton).toBeInTheDocument()
        })
    })

    describe('when the user clicks the accept button', () => {
        it('should call the onAccept function', async () => {
            renderWithProviders(
                <SendPayment onAccept={onAcceptSpy} onReject={() => {}} />,
                {
                    preloadedState: getPreloadedState(state),
                },
            )

            const acceptButton = screen.getByRole('button', {
                name: 'Accept',
            })

            await waitFor(() => {
                acceptButton.click()
                expect(onAcceptSpy).toHaveBeenCalled()
            })
        })
    })

    describe('when the user clicks the reject button', () => {
        it('should call the onReject function', () => {
            renderWithProviders(
                <SendPayment onAccept={() => {}} onReject={onRejectSpy} />,
                {
                    preloadedState: getPreloadedState(state),
                },
            )

            const rejectButton = screen.getByRole('button', { name: 'Reject' })
            rejectButton.click()

            expect(onRejectSpy).toHaveBeenCalled()
        })
    })
})
