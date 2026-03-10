import { cleanup, screen, userEvent } from '@testing-library/react-native'

import {
    setFederations,
    setPayFromFederationId,
    setupStore,
} from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import SelectFederationOverlay from '../../../../../components/feature/send/SelectFederationOverlay'

describe('SelectFederationOverlay', () => {
    let store: ReturnType<typeof setupStore>
    let user: ReturnType<typeof userEvent.setup>

    beforeEach(() => {
        store = setupStore()
        user = userEvent.setup()
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should not be visible when `opened` is false', async () => {
        renderWithProviders(
            <SelectFederationOverlay
                opened={false}
                onDismiss={() => {}}
                onSelect={() => {}}
                selectedFederation={undefined}
            />,
        )

        const federationSelectTitle =
            await screen.queryByText('Select Federation')

        expect(federationSelectTitle).not.toBeOnTheScreen()
    })

    it('should be visible when `opened` is true', async () => {
        renderWithProviders(
            <SelectFederationOverlay
                opened={true}
                onDismiss={() => {}}
                onSelect={() => {}}
                selectedFederation={undefined}
            />,
        )

        const federationSelectTitle =
            await screen.getByText('Select Federation')

        expect(federationSelectTitle).toBeOnTheScreen()
    })

    it('should call `onDismiss` when the backdrop is pressed', async () => {
        const mockOnDismiss = jest.fn()

        renderWithProviders(
            <SelectFederationOverlay
                opened
                onDismiss={mockOnDismiss}
                onSelect={() => {}}
                selectedFederation={undefined}
            />,
        )

        const backdrop = await screen.getByTestId('RNE__Overlay__backdrop')

        expect(backdrop).toBeOnTheScreen()

        await user.press(backdrop)

        expect(mockOnDismiss).toHaveBeenCalled()
    })

    it('should call `onSelect` when a federation is pressed', async () => {
        const mockOnSelect = jest.fn()

        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        store.dispatch(setPayFromFederationId(null))

        renderWithProviders(
            <SelectFederationOverlay
                opened
                onDismiss={() => {}}
                onSelect={mockOnSelect}
                selectedFederation={undefined}
            />,
            {
                store,
            },
        )

        const federation1Item = await screen.getByTestId(
            `SelectFederationListItem-${mockFederation1.id}`,
        )
        const federation2Item = await screen.getByTestId(
            `SelectFederationListItem-${mockFederation2.id}`,
        )

        await user.press(federation1Item)

        expect(mockOnSelect).toHaveBeenCalledWith(mockFederation1)

        await user.press(federation2Item)

        expect(mockOnSelect).toHaveBeenCalledWith(mockFederation2)
    })
})
