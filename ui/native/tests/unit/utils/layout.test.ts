import { Platform } from 'react-native'

import { getOverlayBottomPadding } from '../../../utils/layout'

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
