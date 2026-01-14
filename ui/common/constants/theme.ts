/**
 * @file
 * Library-agnostic theming information for a consistent Fedi look & feel
 */

const HEX_COLORS = {
    moneyGreen: '#26A07B',
    green: '#00A829',
    green100: '#B4F1C7',
    orange: '#DF7B00',
    orange100: '#F8DFB3',
    orange200: '#FFF9DE',
    lightOrange: '#ECA429',
    darkGrey: '#6D7071',
    grey: '#858789',
    grey400: '#9C9EA0',
    grey100: '#F3F3F3',
    grey50: '#F8F8F8',
    lightGrey: '#D3D4DB',
    extraLightGrey: '#E9E9EA',
    keyboardGrey: '#E8EAED',
    dividerGrey: '#EAEAEB',
    red: '#E00A00',
    red100: '#FFC6B8',
    white: '#FFFFFF',
    yellow: '#FBE32D',
    offWhite: '#E6F7FF',
    offWhite100: '#ECF7F7',
    black: '#000000',
    night: '#0B1013',
    blue: '#0277F2',
    fuschia: '#EF5DA8',
    // TODO: Move these into maps instead of properties, e.g. blue[100] instead of blue100
    blue100: '#BAE0FE',
    blue200: '#B6EAFF',
    blueDropShadow: '#7099B0',
    mint: '#26A07B',
}

export const theme = {
    colors: {
        link: HEX_COLORS.blue,
        primary: HEX_COLORS.night,
        primary05: alphaHex(HEX_COLORS.night, 5),
        primaryLight: HEX_COLORS.darkGrey,
        primaryVeryLight: HEX_COLORS.lightGrey,
        ghost: alphaHex(HEX_COLORS.lightGrey, 60),
        success: HEX_COLORS.green,
        secondary: HEX_COLORS.white,
        overlay: alphaHex(HEX_COLORS.black, 25),
        ...HEX_COLORS,
    },
    fontSizes: {
        display: 80,
        h1: 32,
        h2: 24,
        body: 16,
        caption: 14,
        small: 12,
        tiny: 10,
    },
    fontWeights: {
        normal: '400',
        medium: '500',
        bold: '600',
        bolder: '700',
    },
    spacing: {
        xxs: 2,
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
        xxl: 48,
    },
    sizes: {
        xxs: 12,
        xs: 16,
        sm: 24,
        md: 32,
        lg: 48,
        xl: 96,
        extraSmallAvatar: 26,
        smallAvatar: 32,
        mediumAvatar: 48,
        largeAvatar: 88,
        desktopAppWidth: 480,
    },
    holoGradient: {
        '900': makeHoloGradientRgbas(1.0),
        '600': makeHoloGradientRgbas(0.6),
        '400': makeHoloGradientRgbas(0.3),
        '100': makeHoloGradientRgbas(0.13),

        // holo gradients using the minimal gradient rgba sequence
        m500: makeMinimalGradientRgbas(0.5),
    },
    holoGradientLocations: {
        // Used to mimic the radial gradient in figma
        // with a LinearGradient
        radial: [
            0.026, 0.1947, 0.3376, 0.4708, 0.5915, 0.7363, 0.8402, 1,
        ] as number[],
    },
    nightHoloAmbientGradient: [
        'rgba(224, 32, 32, 0.075)',
        'rgba(247, 181, 0, 0.075)',
        'rgba(109, 212, 0, 0.075)',
        'rgba(0, 145, 255, 0.075)',
        'rgba(250, 100, 0, 0.075)',
        'rgba(255, 255, 255, 0.03)',
        'rgba(98, 54, 255, 0.08)',
        'rgba(182, 32, 224, 0.08)',
    ],
    nightLinearGradient: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0)'],
    // Figma has the gradient using gray on top of white, but we can simplify components
    // by using a flat gradient instead of an overlay on top of white.
    dayLinearGradient: ['rgba(255, 255, 255, 1)', 'rgba(228, 228, 228, 1)'],
} as const

function makeHoloGradientRgbas(alphaMultiplier: number) {
    return [
        [224, 32, 32, 0.3],
        [247, 181, 0, 0.3],
        [109, 212, 0, 0.3],
        [0, 145, 255, 0.3],
        [250, 100, 0, 0.3],
        [255, 255, 255, 0.1],
        [98, 54, 255, 0.3],
        [182, 32, 224, 0.3],
    ].map(([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a * alphaMultiplier})`)
}

// Drops some colors to make the gradient look cleaner
// Color sequence originates from figma designs
function makeMinimalGradientRgbas(alphaMultiplier: number) {
    return [
        [247, 181, 0, 0.3],
        [109, 212, 0, 0.3],
        [0, 145, 255, 0.3],
        [98, 54, 255, 0.3],
        [182, 32, 224, 0.3],
    ].map(([r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a * alphaMultiplier})`)
}

function alphaHex(hex: string, alpha: number) {
    return `${hex}${Math.floor(255 * (alpha / 100))
        .toString(16)
        .padStart(2, '0')}`
}
