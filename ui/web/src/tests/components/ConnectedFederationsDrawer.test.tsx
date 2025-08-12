import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'

import { ConnectedFederationsDrawer } from '../../components/ConnectedFederationsDrawer'
import { AppState } from '../../state/store'
import { renderWithProviders } from '../../utils/test-utils/render'

const mockDispatch = jest.fn()
jest.mock('../../hooks/store.ts', () => ({
    ...jest.requireActual('../../hooks/store'),
    useAppDispatch: () => mockDispatch,
}))

describe('/components/ConnectedFederationsDrawer', () => {
    let store
    let state: AppState
    const user = userEvent.setup()

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display the title and federations', () => {
            renderWithProviders(
                <ConnectedFederationsDrawer onClose={() => {}} />,
                {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockFederation1, mockFederation2],
                            activeFederationId: '1',
                        },
                    },
                },
            )

            const title = screen.getByText('Federations & Communities')
            const federations = screen.getAllByLabelText('federation')

            expect(title).toBeInTheDocument()
            expect(federations).toHaveLength(2)
        })
    })

    describe("when a federation is selected that isn't already active", () => {
        it('should call dispatch with the new active federation id', async () => {
            renderWithProviders(
                <ConnectedFederationsDrawer onClose={() => {}} />,
                {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockFederation1, mockFederation2],
                            activeFederationId: '1',
                        },
                    },
                },
            )

            const federations = screen.getAllByLabelText('federation')
            const firstFederation = federations[1] // select second federation as it's not active

            await user.click(firstFederation)

            expect(mockDispatch).toHaveBeenCalledWith({
                type: 'federation/setActiveFederationId',
                payload: '2',
            })
        })
    })

    describe('when a federation is selected that is already active', () => {
        it('should not call dispatch', async () => {
            renderWithProviders(
                <ConnectedFederationsDrawer onClose={() => {}} />,
                {
                    preloadedState: {
                        federation: {
                            ...state.federation,
                            federations: [mockFederation1, mockFederation2],
                            activeFederationId: '1',
                        },
                    },
                },
            )

            const federations = screen.getAllByLabelText('federation')
            const firstFederation = federations[0]

            await user.click(firstFederation)

            expect(mockDispatch).not.toHaveBeenCalledWith()
        })
    })
})
