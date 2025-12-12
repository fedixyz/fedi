import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import {
    setFederations,
    setLastUsedFederationId,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { InjectionMessageType } from '@fedi/injections/src/types'
import * as browserHooks from '@fedi/web/src/hooks/browser'

import { FediBrowser } from '../../../../src/components/FediBrowser'
import { renderWithProviders } from '../../../utils/render'

const onCloseSpy = jest.fn()

const mockDispatch = jest.fn()
jest.mock('../../../../src/hooks/store.ts', () => ({
    ...jest.requireActual('../../../../src/hooks/store'),
    useAppDispatch: () => mockDispatch,
}))

jest.mock('@fedi/web/src/hooks/browser')

describe('/components/FediBrowser', () => {
    let store: ReturnType<typeof setupStore>

    beforeAll(() => {
        store = setupStore()
    })

    beforeEach(() => {
        jest.restoreAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display the iframe and navbar', () => {
            jest.spyOn(browserHooks, 'useIFrameListener').mockReturnValue({
                sendSuccess: jest.fn(),
                sendError: jest.fn(),
                overlayId: InjectionMessageType.webln_sendPayment,
                resetOverlay: jest.fn(),
            })

            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId('1'))
            renderWithProviders(
                <FediBrowser url="https://test.com" onClose={() => {}} />,
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
            jest.spyOn(browserHooks, 'useIFrameListener').mockReturnValue({
                sendSuccess: jest.fn(),
                sendError: jest.fn(),
                overlayId: InjectionMessageType.webln_sendPayment,
                resetOverlay: jest.fn(),
            })

            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setLastUsedFederationId('1'))
            renderWithProviders(
                <FediBrowser url="https://test.com" onClose={onCloseSpy} />,
                {
                    store,
                },
            )

            const closeButton = screen.getByLabelText('close button')
            closeButton.click()

            expect(onCloseSpy).toHaveBeenCalled()
        })
    })

    describe('when the overlayId is webln_sendPayment', () => {
        it('should show the SendPayment overlay', () => {
            jest.spyOn(browserHooks, 'useIFrameListener').mockReturnValue({
                sendSuccess: jest.fn(),
                sendError: jest.fn(),
                overlayId: InjectionMessageType.webln_sendPayment,
                resetOverlay: jest.fn(),
            })

            renderWithProviders(
                <FediBrowser url="https://test.com" onClose={() => {}} />,
                {
                    store,
                },
            )

            const dialog = screen.getByLabelText('send payment dialog')
            expect(dialog).toBeInTheDocument()
        })
    })

    describe('when the overlayId is fedi_selectPublicChats', () => {
        it('should show the SelectPublicChats overlay', () => {
            jest.spyOn(browserHooks, 'useIFrameListener').mockReturnValue({
                sendSuccess: jest.fn(),
                sendError: jest.fn(),
                overlayId: InjectionMessageType.fedi_selectPublicChats,
                resetOverlay: jest.fn(),
            })

            renderWithProviders(
                <FediBrowser url="https://test.com" onClose={() => {}} />,
                {
                    store,
                },
            )

            const dialog = screen.getByLabelText(
                'select public chats dialog empty',
            )
            expect(dialog).toBeInTheDocument()
        })
    })
})
