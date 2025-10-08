import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import {
    setFederations,
    setInvoiceToPay,
    setLastUsedFederationId,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { MSats } from '@fedi/common/types'

import { FediModBrowser } from '../../../src/components/FediModBrowser'
import { renderWithProviders } from '../../utils/render'

const onCloseSpy = jest.fn()

const mockDispatch = jest.fn()
jest.mock('../../../src/hooks/store.ts', () => ({
    ...jest.requireActual('../../../src/hooks/store'),
    useAppDispatch: () => mockDispatch,
}))

jest.mock('../../../src/hooks/browser', () => ({
    ...jest.requireActual('../../../src/hooks/browser'),
    useIFrameListener: () => ({
        sendSuccess: jest.fn(),
        sendError: jest.fn(),
    }),
}))

describe('/components/FediModBrowser', () => {
    let store: ReturnType<typeof setupStore>

    beforeAll(() => {
        store = setupStore()
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display the iframe and navbar', () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId('1'))
            renderWithProviders(
                <FediModBrowser url="https://test.com" onClose={() => {}} />,
                {
                    store,
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
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId('1'))
            renderWithProviders(
                <FediModBrowser url="https://test.com" onClose={onCloseSpy} />,
                {
                    store,
                },
            )

            const closeButton = screen.getByLabelText('close button')
            closeButton.click()

            expect(onCloseSpy).toHaveBeenCalled()
        })
    })

    describe('when there is an invoice', () => {
        it('the overlay should be visible', () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId('1'))
            store.dispatch(
                setInvoiceToPay({
                    paymentHash: 'payment-hash',
                    amount: 100000 as MSats,
                    invoice: 'test',
                    fee: null,
                    description: 'description',
                }),
            )
            renderWithProviders(
                <FediModBrowser url="https://test.com" onClose={() => {}} />,
                {
                    store,
                },
            )

            const dialog = screen.getByLabelText('payment request dialog')
            expect(dialog).toBeInTheDocument()
        })
    })
})
