import { Platform } from 'react-native'

import {
    NUMPAD_MAX_ROW_HEIGHT,
    NUMPAD_MIN_ROW_HEIGHT,
    getFittedNumpadRowHeight,
    getOverlayBottomPadding,
} from '../../../utils/layout'

const setPlatform = (os: 'ios' | 'android', version?: number) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    if (version !== undefined) {
        Object.defineProperty(Platform, 'Version', {
            value: version,
            configurable: true,
        })
    }
}

describe('getOverlayBottomPadding', () => {
    afterEach(() => {
        setPlatform('ios')
    })

    it('should clear the home indicator on iOS', () => {
        setPlatform('ios')

        expect(getOverlayBottomPadding(24, 34)).toBe(34)
    })

    it('should leave iOS devices without an indicator untouched', () => {
        setPlatform('ios')

        expect(getOverlayBottomPadding(24, 0)).toBe(24)
    })

    it('should never shrink the base padding on iOS', () => {
        setPlatform('ios')

        expect(getOverlayBottomPadding(48, 34)).toBe(48)
    })

    it('should cushion modern Android devices that report no inset', () => {
        setPlatform('android', 30)

        expect(getOverlayBottomPadding(24, 0)).toBe(36)
    })

    it('should clear the inset on modern Android without a cushion', () => {
        setPlatform('android', 30)

        expect(getOverlayBottomPadding(24, 48)).toBe(48)
    })

    it('should halve the base padding on older Android', () => {
        setPlatform('android', 29)

        expect(getOverlayBottomPadding(24, 0)).toBe(12)
    })
})

describe('getFittedNumpadRowHeight', () => {
    it('should cap a roomy box at the full-screen row height', () => {
        expect(getFittedNumpadRowHeight(600, 108)).toBe(NUMPAD_MAX_ROW_HEIGHT)
    })

    it('should divide up whatever is left below the amount', () => {
        expect(getFittedNumpadRowHeight(340, 108)).toBe(58)
    })

    it('should take the preferred minimum when four of them still fit', () => {
        expect(getFittedNumpadRowHeight(284, 108)).toBe(NUMPAD_MIN_ROW_HEIGHT)
    })

    it('should keep four rows inside a box too short for the minimum', () => {
        const box = 260
        const amount = 108
        const row = getFittedNumpadRowHeight(box, amount)

        expect(row).toBeLessThan(NUMPAD_MIN_ROW_HEIGHT)
        expect(amount + row * 4).toBeLessThanOrEqual(box)
    })

    it('should never return a negative row height', () => {
        expect(getFittedNumpadRowHeight(80, 108)).toBe(0)
    })
})
