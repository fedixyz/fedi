import { Theme } from '@rneui/themed'
import { Platform } from 'react-native'

import { getIconSizeMultiplier } from '../components/ui/SvgImage'
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
    // iOS: the base padding is smaller than the home indicator inset, so an
    // overlay's last button used to sit on the indicator. Devices without one
    // report a zero inset and are unaffected.
    if (Platform.OS !== 'android') return Math.max(basePadding, insetBottom)
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

/** The keypad is three across and four down. */
const NUMPAD_ROWS = 4
/** Preferred smallest row, taken only when four of them fit the box. */
export const NUMPAD_MIN_ROW_HEIGHT = 44
/** The full-screen row height, which is also the most a fitted keypad takes. */
export const NUMPAD_MAX_ROW_HEIGHT = 68

/**
 * Row height for a keypad that divides the box it was handed with whatever
 * sits above it.
 *
 * Never returns more than a quarter of what is left over: rows that do not fit
 * are still drawn, outside the box and under whatever the box's parent pins
 * below it.
 */
export const getFittedNumpadRowHeight = (
    boxHeight: number,
    contentHeight: number,
): number => {
    const perRow = Math.floor((boxHeight - contentHeight) / NUMPAD_ROWS)
    if (perRow >= NUMPAD_MIN_ROW_HEIGHT)
        return Math.min(NUMPAD_MAX_ROW_HEIGHT, perRow)
    return Math.max(0, perRow)
}

export const isAndroidAPI35Plus = () => {
    return Platform.OS === 'android' && Platform.Version >= 35
}

/**
 * Calculate the icon size for MiniApp tiles based on theme and font scale.
 */
export const getMiniAppTileIconSize = (
    theme: Theme,
    fontScale: number,
): number => {
    const cappedFontScale = Math.min(fontScale, 2)
    return theme.sizes.lg * getIconSizeMultiplier(cappedFontScale)
}

/**
 * Calculate the minimum required height for a MiniApp tile item.
 * This accounts for icon size, allowable lines of text, and all padding/spacing.
 */
export const getMiniAppTileMinHeight = (
    theme: Theme,
    fontScale: number,
): number => {
    const iconSize = getMiniAppTileIconSize(theme, fontScale)
    const iconWithSpacing = iconSize + theme.spacing.xs // icon + marginBottom
    const textHeight = 2 * theme.sizes.miniAppTitleLineHeight // 2 lines with body line height
    const verticalPadding = theme.spacing.xs * 2 // top + bottom padding
    const titlePadding = theme.spacing.xs // title paddingBottom
    return iconWithSpacing + textHeight + verticalPadding + titlePadding
}
