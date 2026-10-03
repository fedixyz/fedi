import { act, fireEvent, screen } from '@testing-library/react'

import { Sats } from '@fedi/common/types'

import { AmountInput } from '../../../src/components/AmountInput'
import { renderWithProviders } from '../../utils/render'

const animate = jest.fn(() => ({ onfinish: null }) as Animation)

describe('AmountInput', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        Element.prototype.animate = animate
    })

    it('should not offer an unaffordable minimum as a correction', () => {
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
        expect(suggestion.tagName).toBe('SPAN')
        expect(
            screen.queryByRole('button', { name: '10,000 sats' }),
        ).not.toBeInTheDocument()
        fireEvent.click(suggestion)
        expect(onChangeAmount).not.toHaveBeenCalled()
    })

    it('should keep an affordable minimum correction actionable', () => {
        const onChangeAmount = jest.fn()
        renderWithProviders(
            <AmountInput
                amount={583 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={50_000 as Sats}
                onChangeAmount={onChangeAmount}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: '10,000 sats' }))
        const fadeOut = animate.mock.results[0].value as Animation
        act(() => fadeOut.onfinish?.call(fadeOut, {} as AnimationPlaybackEvent))
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
        expect(screen.queryByText('10,000 sats')).not.toBeInTheDocument()

        rerender(
            <AmountInput
                amount={0 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={0 as Sats}
                submitAttempts={1}
            />,
        )
        expect(screen.getByText('10,000 sats')).toBeInTheDocument()
    })

    it('should keep an affordable maximum correction actionable', () => {
        const onChangeAmount = jest.fn()
        renderWithProviders(
            <AmountInput
                amount={50_001 as Sats}
                minimumAmount={10_000 as Sats}
                maximumAmount={50_000 as Sats}
                onChangeAmount={onChangeAmount}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: '50,000 sats' }))
        const fadeOut = animate.mock.results[0].value as Animation
        act(() => fadeOut.onfinish?.call(fadeOut, {} as AnimationPlaybackEvent))
        expect(onChangeAmount).toHaveBeenCalledWith(50_000)
    })
})
