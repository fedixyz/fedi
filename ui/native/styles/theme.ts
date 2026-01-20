import { DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native'
import { ButtonProps, createTheme, lightColors } from '@rneui/themed'
import { Dimensions, ViewStyle } from 'react-native'

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
    if (props.day || props.bubble) {
        defaultBackground = false
    }
    return defaultBackground
}

export const themeDefaults = {
    colors,
    multipliers: {
        headerMaxFontMultiplier: 1.4,
        iconMaxSizeMultiplier: 2,
        defaultMaxFontMultiplier: 1.8,
    },
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
        minMessageInputHeight: 30,
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
        bubbleButtonSize: 32,
        circleButtonSize: 40,
        miniAppTitleLineHeight: 20,
    },
    spacing: {
        ...fediTheme.spacing,
    },
    borders: {
        defaultRadius: 16,
        qrCodeRadius: 20,
        settingsRadius: 21,
        tileRadius: 12,
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
        subtleShadow: {
            shadowColor: fediTheme.colors.night,
            shadowOffset: {
                width: 0,
                height: 4,
            },
            shadowOpacity: 0.1,
            shadowRadius: 24,
        },
        bubble: {},
    },
} as const

const theme = createTheme({
    ...NavigationDefaultTheme,
    components: {
        Overlay: () => ({
            statusBarTranslucent: true,
        }),
        Card: props => ({
            ...(props.bubble
                ? {
                      containerStyle: {},
                  }
                : {}),
        }),
        Button: props => ({
            size: 'lg',
            containerStyle: {
                ...(props.fullWidth ? { width: '100%' } : {}),
                borderRadius: 60,
                ...(props.outline
                    ? {
                          borderColor: theme.colors?.lightGrey,
                          borderWidth: 1.5,
                      }
                    : {}),
            },
            titleStyle: {
                paddingLeft: 10,
                paddingRight: 10,
                fontFamily: 'AlbertSans-Regular',
                ...(props.day || props.outline || props.text
                    ? { color: theme.colors?.primary }
                    : {}),
            },
            titleProps: {
                maxFontSizeMultiplier:
                    themeDefaults.multipliers.defaultMaxFontMultiplier,
                adjustsFontSizeToFit: true,
            },
            disabledStyle: {
                opacity: 0.4,
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
                borderRadius: 60,
                ...(props.loading || props.outline || props.text
                    ? {
                          backgroundColor: 'transparent',
                          color: theme.colors?.primary,
                      }
                    : {}),

                ...(props.night || shouldShowDefaultButtonBackground(props)
                    ? {
                          experimental_backgroundImage: `linear-gradient(180deg, ${fediTheme.nightLinearGradient.join(', ')})`,
                      }
                    : {}),

                ...(props.bubble
                    ? {
                          experimental_backgroundImage: `linear-gradient(to bottom, ${fediTheme.dayLinearGradient.join(', ')})`,
                      }
                    : {}),
                ...(props.day
                    ? {
                          experimental_backgroundImage: `linear-gradient(to bottom, ${fediTheme.dayLinearGradient.join(', ')})`,
                      }
                    : {}),
            },
        }),
        Text: props => ({
            // Don't allow titles to get insane font size multipliers
            maxFontSizeMultiplier:
                props.h1 || props.h2
                    ? themeDefaults.multipliers.headerMaxFontMultiplier
                    : themeDefaults.multipliers.defaultMaxFontMultiplier,
            style: {
                ...themeDefaults.styles?.text,
                // Use fontFamily & fontWeight for bolding effects
                ...(props.bolder
                    ? {
                          fontFamily: 'AlbertSans-ExtraBold',
                          fontWeight: fediTheme.fontWeights.bolder,
                      }
                    : {}),
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
                ...(props.center ? { textAlign: 'center' } : {}),
            },
            h1Style: {
                fontSize: 32,
                fontWeight: fediTheme.fontWeights.normal,
                fontFamily: 'AlbertSans-Regular',
                ...(props.bolder
                    ? {
                          fontFamily: 'AlbertSans-ExtraBold',
                          fontWeight: fediTheme.fontWeights.bolder,
                      }
                    : {}),
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
                ...(props.bolder
                    ? {
                          fontFamily: 'AlbertSans-ExtraBold',
                          fontWeight: fediTheme.fontWeights.bolder,
                      }
                    : {}),
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
                paddingHorizontal: fediTheme.spacing.lg,
                borderBottomColor: colors.secondary,
                // This helps maximize the clickable area for any header buttons
                paddingVertical: 0,
                // Avoids jitter on load
                // ref: https://reactnavigation.org/docs/stack-navigator/#specify-a-height-in-headerstyle-to-avoid-glitches
                height: fediTheme.sizes.xl + fediTheme.spacing.lg,
            },
            leftContainerStyle: {
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center',
            },
            centerContainerStyle: {
                flex: 0,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                // the min content height should always be
                // consistent so the header buttons don't move when
                // the content changes
                minHeight: 36,
            },
            rightContainerStyle: {
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'center',
            },
        },
    },
    ...themeDefaults,
})

export default theme
