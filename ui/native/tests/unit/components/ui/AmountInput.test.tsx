import { cleanup, screen, userEvent } from '@testing-library/react-native'
import { useState } from 'react'

import { setAmountInputType, setupStore } from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'

import AmountInput from '../../../../components/ui/AmountInput'
import { renderWithProviders } from '../../../utils/render'

describe('AmountInput', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(cleanup)

    it('should not offer an unaffordable minimum as a correction', async () => {
        const onChangeAmount = jest.fn()
        renderWithProviders(
            <AmountInput
                amount={583 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={0 as Sats}
                onChangeAmount={onChangeAmount}
            />,
        )

        const suggestion = screen.getByText('10,000 sats')
        expect(suggestion).not.toHaveStyle({ textDecorationLine: 'underline' })
        await userEvent.setup().press(suggestion)
        expect(onChangeAmount).not.toHaveBeenCalled()
    })

    it('should keep minimum feedback while typing amounts the wallet cannot afford', async () => {
        const store = setupStore()
        store.dispatch(setAmountInputType('sats'))
        const ControlledInput = () => {
            const [amount, setAmount] = useState(583 as Sats)
            return (
                <AmountInput
                    amount={amount}
                    onChangeAmount={setAmount}
                    minimumAmount={10_000 as Sats}
                    maximumAmount={0 as Sats}
                />
            )
        }
        renderWithProviders(<ControlledInput />, { store })
        const user = userEvent.setup()

        await user.press(screen.getByTestId('NumpadButton-6'))
        expect(screen.getByTestId('AmountInputValue')).toHaveTextContent(
            '5,836',
        )
        expect(screen.getByTestId('amount-input-error')).toHaveTextContent(
            'The minimum you can send is 10,000 sats',
        )

        for (let index = 0; index < 4; index++) {
            await user.press(screen.getByTestId('NumpadButton-backspace'))
        }
        for (const digit of [1, 0, 0, 0, 0]) {
            await user.press(screen.getByTestId(`NumpadButton-${digit}`))
        }
        expect(screen.getByTestId('AmountInputValue')).toHaveTextContent(
            '10,000',
        )
        expect(screen.getByTestId('amount-input-error')).toHaveTextContent(
            'The minimum you can send is 10,000 sats',
        )

        await user.press(screen.getByTestId('NumpadButton-0'))
        expect(screen.getByTestId('AmountInputValue')).toHaveTextContent(
            '100,000',
        )
        expect(screen.getByTestId('amount-input-error')).toHaveTextContent(
            'The minimum you can send is 10,000 sats',
        )
    })

    it('should keep an affordable minimum correction actionable', async () => {
        const onChangeAmount = jest.fn()
        renderWithProviders(
            <AmountInput
                amount={583 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={50_000 as Sats}
                onChangeAmount={onChangeAmount}
            />,
        )

        const suggestion = screen.getByText('10,000 sats')
        expect(suggestion).toHaveStyle({ textDecorationLine: 'underline' })
        await userEvent.setup().press(suggestion)
        expect(onChangeAmount).toHaveBeenCalledWith(10_000)
    })

    it('should show the unaffordable minimum after submitting an empty amount', () => {
        const { rerender } = renderWithProviders(
            <AmountInput
                amount={0 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={0 as Sats}
            />,
        )
        expect(screen.queryByTestId('amount-input-error')).toBeNull()

        rerender(
            <AmountInput
                amount={0 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={0 as Sats}
                submitAttempts={1}
            />,
        )

        expect(screen.getByTestId('amount-input-error')).toHaveTextContent(
            'The minimum you can send is 10,000 sats',
        )
    })

    it('should keep an affordable maximum correction actionable', async () => {
        const onChangeAmount = jest.fn()
        renderWithProviders(
            <AmountInput
                amount={50_001 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={50_000 as Sats}
                onChangeAmount={onChangeAmount}
            />,
        )

        const suggestion = screen.getByText('50,000 sats')
        expect(suggestion).toHaveStyle({ textDecorationLine: 'underline' })
        await userEvent.setup().press(suggestion)
        expect(onChangeAmount).toHaveBeenCalledWith(50_000)
    })
})
