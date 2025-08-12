export enum Platform {
    ANDROID = 'android',
    IOS = 'ios',
    PWA = 'pwa',
}

export interface AppiumConfig {
    'appium:platformName': string
    'appium:automationName': string
    'appium:udid'?: string
    // Android-specific caps
    'appium:appPackage'?: string
    'appium:app'?: string
    'appium:appActivity'?: string
    // iOS-specific caps
    'appium:autoAcceptAlerts'?: boolean
    'appium:platformVersion'?: string
    'appium:bundleId'?: string
    'appium:includeSafariInWebviews'?: boolean
}

export const currentPlatform: Platform = (() => {
    const platform = process.env.PLATFORM?.toLowerCase()
    switch (platform) {
        case 'ios':
            return Platform.IOS
        case 'pwa':
            return Platform.PWA
        default:
            return Platform.ANDROID
    }
})()

export interface LocatorStrategy {
    selector: string
    priority: number
    description?: string
}

export interface ScrollCoordinates {
    startX: number
    startY: number
    endX: number
    endY: number
}

type CreateUnion<
    Max extends number,
    Accumulator extends number[] = [],
> = Accumulator['length'] extends Max
    ? Accumulator[number]
    : CreateUnion<Max, [...Accumulator, Accumulator['length']]>
type IntRange<Min extends number, Max extends number> = Exclude<
    CreateUnion<Max>,
    CreateUnion<Min>
>
export type Percentage = IntRange<1, 101>

export interface ScrollOptions {
    maxScrolls?: number
    scrollDirection?: ScrollDirection
    scrollDuration?: number
    scrollPercentage?: Percentage
}

export type ScrollDirection = 'up' | 'down' | 'left' | 'right'

export interface RequiredEnvVars {
    common: string[]
    android: string[]
    ios: string[]
    pwa: string[]
}

export interface EnvVarValidation {
    name: string
    platforms?: Platform[] // Only validate for specific platforms
    validator?: (value: string) => boolean
    errorMessage?: string
}
