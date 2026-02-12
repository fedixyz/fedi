import { act } from '@testing-library/react'

import { useTotalBalance } from '../../../hooks/amount'
import { setupStore } from '../../../redux'
import { renderHookWithState } from '../../utils/render'

describe('common/hooks/amount', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
    })

    describe('useTotalBalance', () => {
        describe('When the changeDisplayCurrency function is called', () => {
            it('should cycle through the display values correctly', async () => {
                const { result } = renderHookWithState(
                    () => useTotalBalance(),
                    store,
                )

                expect(result.current.formattedBalance).toBe('0 SATS')

                act(() => {
                    result.current.changeDisplayCurrency()
                })
                expect(result.current.formattedBalance).toBe('0.00 USD')

                act(() => {
                    result.current.changeDisplayCurrency()
                })
                expect(result.current.formattedBalance).toBe('*******')

                act(() => {
                    result.current.changeDisplayCurrency()
                })
                expect(result.current.formattedBalance).toBe('0 SATS')
            })
        })
    })
})
