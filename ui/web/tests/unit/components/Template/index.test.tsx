import '@testing-library/jest-dom'

import { Template } from '../../../../src/components/Template'
import { renderWithProviders } from '../../../utils/render'

const ratesSpy = jest.fn()
jest.mock('@fedi/common/hooks/currency.ts', () => ({
    ...jest.requireActual('@fedi/common/hooks/currency'),
    useSyncCurrencyRatesAndCache: () => ratesSpy,
}))

describe('Template', () => {
    beforeEach(() => {
        ratesSpy.mockClear()
    })

    it('syncs currency rates when the app shell loads', () => {
        renderWithProviders(
            <Template>
                <div />
            </Template>,
        )

        expect(ratesSpy).toHaveBeenCalled()
    })
})
