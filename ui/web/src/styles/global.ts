import { globalCss, theme } from './stitches.config'

export const globalStyles = globalCss({
    // Albert Sans uses variable font so one file for all weights.
    // Split into two files, one with a minimal latin character set to reduce payload size.
    '@font-face': [
        {
            fontFamily: 'Albert Sans',
            fontStyle: 'normal',
            fontWeight: '400 700',
            fontDisplay: 'swap',
            src: `url('/assets/fonts/AlbertSans-Variable-latin-ext.woff2') format('woff2')`,
            unicodeRange:
                'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF',
        },
        {
            fontFamily: 'Albert Sans',
            fontStyle: `normal`,
            fontWeight: `400 700`,
            fontDisplay: `swap`,
            src: `url('/assets/fonts/AlbertSans-Variable-latin.woff2') format('woff2')`,
            unicodeRange: `U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`,
        },
    ],

    // Reset styles
    '*': {
        margin: 0,
        scrollbarWidth: 'thin',
        scrollbarColor: `${theme.colors.lightGrey} ${theme.colors.white}`,
    },
    '*, *:before, *:after': {
        boxSizing: 'border-box',
    },
    'html, body': {
        height: '100%',
        fontSize: theme.fontSizes.body,
        fontFamily: theme.fonts.body,
        color: theme.colors.primary,
        overscrollBehavior: 'none',
    },
    body: {
        lineHeight: 1.5,
        '-webkit-font-smoothing': 'antialiased',
        holoGradient: '100',
        backgroundAttachment: 'fixed',
    },
    'img, picture, video, canvas, svg': {
        display: 'block',
        maxWidth: '100%',
    },
    'input, button, textarea, select': {
        font: 'inherit',
    },
    '::placeholder': {
        color: theme.colors.grey,
    },
    'p, h1, h2, h3, h4, h5, h6': {
        overflowWrap: 'break-word',
    },
    button: {
        border: 'none',
        margin: 0,
        padding: 0,
        width: 'auto',
        background: 'none',
        color: 'inherit',
        font: 'inherit',
        lineHeight: 'normal',
        '-webkit-font-smoothing': 'inherit',
        '-moz-osx-font-smoothing': 'inherit',
        '-webkit-appearance': 'none',
        cursor: 'pointer',
    },
    a: {
        textDecoration: 'none',
        color: 'inherit',
    },
    '#__next': {
        height: '100%',
        isolation: 'isolate',
    },
})
