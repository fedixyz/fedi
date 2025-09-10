import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import { setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { MSats } from '@fedi/common/types'

import { FediModBrowser } from '../../src/components/FediModBrowser'
import { AppState } from '../../src/state/store'
import { renderWithProviders } from '../../src/utils/test-utils/render'

const onCloseSpy = jest.fn()

const mockDispatch = jest.fn()
jest.mock('../../src/hooks/store.ts', () => ({
    ...jest.requireActual('../../src/hooks/store'),
    useAppDispatch: () => mockDispatch,
}))

jest.mock('../../src/hooks/browser', () => ({
    ...jest.requireActual('../../src/hooks/browser'),
    useIFrameListener: () => ({
        sendSuccess: jest.fn(),
        sendError: jest.fn(),
    }),
}))

describe('/components/FediModBrowser', () => {
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
        it('should display the iframe and navbar', () => {
            renderWithProviders(
                <FediModBrowser url="https://test.com" onClose={() => {}} />,
                {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockFederation1],
                            activeFederationId: '1',
                        },
                    },
                },
            )

            const iframe = screen.getByLabelText('browser iframe')
            const navbar = screen.getByLabelText('browser navbar')
            const domain = screen.getByText('test.com')

            expect(iframe).toBeInTheDocument()
            expect(navbar).toBeInTheDocument()
            expect(domain).toBeInTheDocument()
        })
    })

    describe('when the user clicks the close button', () => {
        it('should call the onClose function', () => {
            renderWithProviders(
                <FediModBrowser url="https://test.com" onClose={onCloseSpy} />,
                {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockFederation1],
                            activeFederationId: '1',
                        },
                    },
                },
            )

            const closeButton = screen.getByLabelText('close button')
            closeButton.click()

            expect(onCloseSpy).toHaveBeenCalled()
        })
    })

    describe('when there is an invoice', () => {
        it('the overlay should be visible', () => {
            renderWithProviders(
                <FediModBrowser url="https://test.com" onClose={() => {}} />,
                {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockFederation1],
                            activeFederationId: '1',
                        },
                        browser: {
                            ...state.browser,
                            invoiceToPay: {
                                paymentHash: 'payment-hash',
                                amount: 100000 as MSats,
                                invoice: 'test',
                                fee: null,
                                description: 'description',
                            },
                        },
                    },
                },
            )

            const dialog = screen.getByLabelText('payment request dialog')
            expect(dialog).toBeInTheDocument()
        })
    })
})
