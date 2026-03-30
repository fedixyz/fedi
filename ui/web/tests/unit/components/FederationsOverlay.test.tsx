import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    selectPaymentFederation,
    setFederations,
    setPayFromFederationId,
    setupStore,
} from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'

import FederationsOverlay from '../../../src/components/FederationsOverlay'
import i18n from '../../../src/localization/i18n'
import { renderWithProviders } from '../../utils/render'

const ratesSpy = jest.fn()
jest.mock('@fedi/common/hooks/currency.ts', () => ({
    ...jest.requireActual('@fedi/common/hooks/currency'),
    useSyncCurrencyRatesAndCache: () => ratesSpy,
}))

describe('FederationsOverlay', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeAll(() => {
        store = setupStore()
    })

    it('should be hidden if `open` is false', async () => {
        renderWithProviders(
            <FederationsOverlay open={false} onOpenChange={() => {}} />,
            { store },
        )

        const title = screen.queryByLabelText(
            i18n.t('phrases.select-federation'),
        )

        expect(title).not.toBeInTheDocument()
    })

    it('should be visible if `open` is true', async () => {
        renderWithProviders(
            <FederationsOverlay open={true} onOpenChange={() => {}} />,
            { store },
        )

        const title = screen.queryByLabelText(
            i18n.t('phrases.select-federation'),
        )

        expect(title).toBeInTheDocument()
    })

    it('should switch the payment federation and close the overlay with `onOpenChange(false)` when an item is clicked', async () => {
        const onOpenChange = jest.fn()
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        store.dispatch(setPayFromFederationId(null))

        renderWithProviders(
            <FederationsOverlay open={true} onOpenChange={onOpenChange} />,
            { store },
        )

        const federation1 = screen.getByTestId(
            `FederationListItem-${mockFederation1.id}`,
        )
        expect(federation1).toBeInTheDocument()

        const federation2 = screen.getByTestId(
            `FederationListItem-${mockFederation2.id}`,
        )
        expect(federation2).toBeInTheDocument()

        await user.click(federation1)

        expect(selectPaymentFederation(store.getState())).toEqual(
            mockFederation1,
        )
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })
})
