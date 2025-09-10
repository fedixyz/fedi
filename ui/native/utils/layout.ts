import { Platform } from 'react-native'

import { AndroidScreenSize } from '../constants'

// Determine Android screen size category based on height
export const getAndroidScreenSize = (
    screenHeight: number,
): AndroidScreenSize => {
    if (screenHeight < AndroidScreenSize.SMALL) return AndroidScreenSize.SMALL
    if (screenHeight < AndroidScreenSize.MEDIUM) return AndroidScreenSize.MEDIUM
    return AndroidScreenSize.LARGE
}

export const getOverlayBottomPadding = (
    basePadding: number = 0,
    insetBottom: number = 0,
): number => {
    if (Platform.OS !== 'android') return basePadding
    if (Platform.Version >= 30) {
        const minPadding = Math.max(basePadding, insetBottom)
        const needsCushion = insetBottom === 0
        // modest cushion for visual separation on devices with no inset
        const cushion = needsCushion ? 12 : 0
        return minPadding + cushion
    }

    // Older Android (< API 30): reduce padding (no cushion, smaller base)
    const reducedBase = Math.floor(basePadding * 0.5)
    return Math.max(reducedBase, insetBottom)
}

export const isAndroidAPI35Plus = () => {
    return Platform.OS === 'android' && Platform.Version >= 35
}
