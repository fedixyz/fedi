import { CSS, createStitches } from '@stitches/react'

import { theme as fediTheme } from '@fedi/common/constants/theme'

export const {
    styled,
    css,
    globalCss,
    keyframes,
    getCssText,
    theme,
    createTheme,
    config,
} = createStitches({
    theme: {
        colors: {
            ...fediTheme.colors,

            // Alpha'd versions of colors. Unfortunately no dynamic way to do this.
            primary05: alphaHex(fediTheme.colors.primary, 5),
            primary10: alphaHex(fediTheme.colors.primary, 10),
            primary15: alphaHex(fediTheme.colors.primary, 15),
            primary20: alphaHex(fediTheme.colors.primary, 20),
            primary80: alphaHex(fediTheme.colors.primary, 80),
            primary90: alphaHex(fediTheme.colors.primary, 90),

            white10: alphaHex(fediTheme.colors.white, 10),
            white20: alphaHex(fediTheme.colors.white, 20),
            white30: alphaHex(fediTheme.colors.white, 30),
            white40: alphaHex(fediTheme.colors.white, 40),
        },
        fonts: {
            body: `'Albert Sans', sans-serif`,
            mono: `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace`,
        },
        sizes: intMapToPx(fediTheme.sizes),
        space: intMapToPx(fediTheme.spacing),
        fontSizes: intMapToPx(fediTheme.fontSizes),
        fontWeights: fediTheme.fontWeights,
    },
    media: {
        xs: '(max-width: 359px)',
        sm: '(max-width: 600px)',
        md: '(max-width: 980px)',
        lg: '(max-width: 1280px)',
        xl: '(max-width: 1440px)',
        standalone: '(display-mode: standalone)',
    },
    utils: {
        holoGradient: (value: keyof (typeof fediTheme)['holoGradient']) => ({
            backgroundImage: `radial-gradient(89.9% 222.34% at 7.36% 24.19%, ${fediTheme.holoGradient[
                value
            ].join(', ')})`,
        }),
        nightGradient: () => ({
            backgroundImage: [
                // Transparent white linear gradient
                'linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.00) 56.25%)',
                // Transparent radial holo gradient
                `radial-gradient(233.16% 114.07% at 7.36% 24.19%, ${fediTheme.nightHoloAmbientGradient.join(
                    ', ',
                )})`,
                // Solid dark background
                `linear-gradient(${fediTheme.colors.night}, ${fediTheme.colors.night})`,
            ].join(', '),
        }),
    },
})
export type CSSProp = CSS<typeof config>

function intMapToPx<T extends string>(
    map: Record<T, number>,
): Record<T, string> {
    return Object.entries(map).reduce(
        (prev, [key, value]) => {
            prev[key as T] = `${value}px`
            return prev
        },
        {} as Record<T, string>,
    )
}

function alphaHex(hex: string, alpha: number) {
    return `${hex}${Math.floor(255 * (alpha / 100))
        .toString(16)
        .padStart(2, '0')}`
}
