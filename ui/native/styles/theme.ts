import { DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native'
import { ButtonProps, createTheme, lightColors } from '@rneui/themed'
import { Dimensions, ViewStyle } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'

import { theme as fediTheme } from '@fedi/common/constants/theme'

const dimensions = Dimensions.get('window')

const colors = {
    ...lightColors,
    ...fediTheme.colors,
}

// The default background Button color is a nightHoloGradient so this
// checks if any Button props were provided that should override the background
const shouldShowDefaultButtonBackground = (props: ButtonProps) => {
    let defaultBackground = true
    if (
        props.type ||
        props.color ||
        // buttonStyle could be an array... find the backgroundColor
        (Array.isArray(props.buttonStyle)
            ? (props.buttonStyle as ViewStyle[]).find(s => s.backgroundColor)
            : (props.buttonStyle as ViewStyle)?.backgroundColor)
    ) {
        defaultBackground = false
    }
    if (props.day) {
        defaultBackground = false
    }
    return defaultBackground
}

const themeDefaults = {
    percentages: {
        shortcutTileWidth: '33%',
    },
    sizes: {
        ...fediTheme.sizes,
        adminProfileCircle: 90,
        walletCardHeight: 204,
        detailItemHeight: 52,
        defaultHoloGradient: 32,
        holoGuidanceCircle: 180,
        holoCircleSize: 328,
        logoRingSize: 100,
        progressBarHeight: 6,
        progressCircleThickness: 5,
        progressCircle: dimensions.height * 0.25,
        progressInnerCircle: dimensions.height * 0.25 - 10,
        maxMessageWidth: dimensions.width * 0.75,
        minMessageInputHeight: 48,
        maxMessageInputHeight: 120,
        recordButtonOuter: 68,
        recordButtonInner: 56,
        socialBackupCameraWidth: dimensions.width * 0.9,
        socialBackupCameraHeight: dimensions.height * 0.4,
        splashImageSize: 360,
        splashLogoHeight: 32,
        splashLogoWidth: 120,
        stabilityPoolCircleThickness: 2,
        unreadIndicatorSize: 10,
        historyIcon: 38,
        addFederationButtonHeight: 56,
    },
    spacing: {
        ...fediTheme.spacing,
    },
    borders: {
        defaultRadius: 16,
        qrCodeRadius: 20,
        fediModTileRadius: 12,
        progressBarRadius: 4,
    },
    styles: {
        h100w100: {
            height: '100%',
            width: '100%',
        },
        text: {
            color: colors.primary,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: fediTheme.fontWeights.normal,
            fontFamily: 'AlbertSans-Regular',
        },
        avatarText: {
            color: colors.white,
            fontSize: 15,
            fontWeight: fediTheme.fontWeights.bold,
            letterSpacing: -1,
            // TODO: import this font
            // fontFamily: 'Martian Mono',
        },
    },
} as const

const theme = createTheme({
    ...NavigationDefaultTheme,
    components: {
        Button: props => ({
            size: 'lg',
            containerStyle: {
                ...(props.fullWidth ? { width: '100%' } : {}),
            },
            titleStyle: {
                paddingLeft: 10,
                paddingRight: 10,
                fontFamily: 'AlbertSans-Regular',
                ...(props.day ? { color: theme.colors?.primary } : {}),
            },
            disabledStyle: {
                opacity: 0.7,
            },
            /*
                For button loading states, since we cannot determine the width
                of the button unless it is set to fullWidth, we make the
                background transparent + ActivityIndicator primary color to avoid
                the effect of a button changing sizes when switching load states
            */
            loadingProps: {
                color: theme.colors?.primary,
            },
            buttonStyle: {
                borderRadius: 50,
                ...(props.loading
                    ? {
                          backgroundColor: 'transparent',
                          color: theme.colors?.primary,
                      }
                    : {}),
            },
            ...(shouldShowDefaultButtonBackground(props)
                ? {
                      ViewComponent: LinearGradient,
                      linearGradientProps: {
                          colors: fediTheme.nightHoloAmbientGradient,
                          start: { x: 0, y: 0.75 },
                          end: { x: 1, y: 0.95 },
                      },
                  }
                : {}),
            ...(props.day
                ? {
                      ViewComponent: LinearGradient,
                      linearGradientProps: {
                          colors: fediTheme.dayLinearGradient,
                          start: { x: 0, y: 0 },
                          end: { x: 0, y: 1 },
                      },
                  }
                : {}),
        }),
        Text: props => ({
            // Don't allow titles to get insane font size multipliers
            maxFontSizeMultiplier: props.h1 ? 1.4 : props.h2 ? 1.8 : undefined,
            style: {
                ...themeDefaults.styles?.text,
                // Use fontFamily for bolding effects because the fontWeight
                // value only has 2 distinct variants in AlbertSans-Regular
                // whereas the design calls for a 3rd distinct variant (medium)
                ...(props.bold
                    ? {
                          fontFamily: 'AlbertSans-Bold',
                          fontWeight: fediTheme.fontWeights.bold,
                      }
                    : {}),
                ...(props.medium
                    ? {
                          fontFamily: 'AlbertSans-Medium',
                          fontWeight: fediTheme.fontWeights.medium,
                      }
                    : {}),
                // These props match the design spec and fontSize should rarely
                // be anything different than these specific values
                ...(props.caption
                    ? { fontSize: fediTheme.fontSizes.caption }
                    : {}),
                ...(props.small ? { fontSize: fediTheme.fontSizes.small } : {}),
                ...(props.tiny ? { fontSize: fediTheme.fontSizes.tiny } : {}),
                ...(props.color ? { color: props.color } : {}),
            },
            h1Style: {
                fontSize: 32,
                fontWeight: fediTheme.fontWeights.normal,
                fontFamily: 'AlbertSans-Regular',
                ...(props.bold
                    ? {
                          fontFamily: 'AlbertSans-Bold',
                          fontWeight: fediTheme.fontWeights.bold,
                      }
                    : {}),
                ...(props.medium
                    ? {
                          fontFamily: 'AlbertSans-Medium',
                          fontWeight: fediTheme.fontWeights.medium,
                      }
                    : {}),
            },
            h2Style: {
                fontSize: 24,
                fontWeight: fediTheme.fontWeights.normal,
                fontFamily: 'AlbertSans-Regular',
                ...(props.bold
                    ? {
                          fontFamily: 'AlbertSans-Bold',
                          fontWeight: fediTheme.fontWeights.bold,
                      }
                    : {}),
                ...(props.medium
                    ? {
                          fontFamily: 'AlbertSans-Medium',
                          fontWeight: fediTheme.fontWeights.medium,
                      }
                    : {}),
            },
        }),
        Input: {
            containerStyle: {
                height: 60,
            },
            inputStyle: {
                fontFamily: 'AlbertSans-Regular',
            },
        },
        Switch: {
            trackColor: {
                false: colors.lightGrey,
                true: colors.primary,
            },
        },
        Header: {
            containerStyle: {
                paddingHorizontal: 16,
                borderBottomColor: colors.secondary,
                // This helps maximize the clickable area for any header buttons
                paddingVertical: 0,
            },
            leftContainerStyle: {
                flex: 1,
            },
            centerContainerStyle: {
                flex: 4,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
            },
            rightContainerStyle: {
                flex: 1,
            },
        },
    },
    colors: {
        ...colors,
    },
    ...themeDefaults,
})

export default theme
