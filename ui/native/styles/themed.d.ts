import '@rneui/themed'
import { DimensionValue, TextStyle, ViewStyle } from 'react-native'

// This declaration is required to combine the Theme type
// from @react-naviation/native with the @rneui/themed Theme type
declare module '@rneui/themed' {
    export interface Theme {
        dark: boolean
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        components: any
        colors: {
            // Add new color labels here
            link: string
            primary: string
            primary05: string
            primaryLight: string
            primaryVeryLight: string
            secondary: string
            success: string
            // Add new colors here
            green: string
            orange: string
            darkGrey: string
            grey: string
            lightGrey: string
            extraLightGrey: string
            ghost: string
            keyboardGrey: string
            red: string
            white: string
            yellow: string
            offWhite: string
            offWhite100: string
            black: string
            blue: string
            blue100: string
            blueDropShadow: string
            night: string
            fuschia: string
            overlay: string
            // @react-navigation requires these properties
            background: string
            card: string
            text: string
            border: string
            notification: string
            mint: string
        }
        multipliers: {
            [key: string]: number
        }
        percentages: {
            [key: string]: DimensionValue
        }
        sizes: {
            [key: string]: number
        }
        styles: {
            [key: string]: ViewStyle | TextStyle
        }
        borders: {
            defaultRadius: number
            qrCodeRadius: number
            fediModTileRadius: number
            progressBarRadius: number
            settingsRadius: number
        }
    }

    // theme.spacing properties must be defined here to override
    // the default from RNE that only defines xs through xl
    export interface ThemeSpacing {
        xxs: number
        xs: number
        sm: number
        md: number
        lg: number
        xl: number
        xxl: number
    }

    // This is an extension for the available props that can
    // be passed to a <Text> component
    export interface TextProps {
        bold?: boolean
        medium?: boolean
        caption?: boolean
        small?: boolean
        tiny?: boolean
        color?: string
    }
    export interface ButtonProps {
        fullWidth?: boolean
        day?: boolean
        night?: boolean
        bubble?: boolean
    }
    export interface CardProps {
        bubble?: boolean
    }

    // Other RNE components can be extended similarly by defining them here
    export interface ComponentTheme {
        Button: Partial<TextProps>
        Text: Partial<TextProps>
    }
}
