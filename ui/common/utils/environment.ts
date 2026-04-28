/**
 * Platform-agnostic  check if we're in a development server
 * or a production server.
 *
 * Supports Web & Native
 */
const isReactNativeDevMode = () => {
    return typeof __DEV__ !== 'undefined' && __DEV__ === true
}

// If localhost string is detected, we're running locally
export const isLocal = () => {
    if (typeof window === 'undefined') return false
    if (!window.location?.hostname) return false

    const { hostname } = window.location

    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1'
    )
}

export const isDev = () => {
    return (
        (!!process && process.env.NODE_ENV === 'development') ||
        isReactNativeDevMode()
    )
}

export const isNightly = () => {
    return (
        !!process &&
        (process.env.FEDI_ENV === 'nightly' ||
            process.env.NEXT_PUBLIC_FEDI_ENV === 'nightly')
    )
}

export const isNova = () => {
    return (
        !!process &&
        (process.env.FEDI_ENV === 'nova' ||
            process.env.NEXT_PUBLIC_FEDI_ENV === 'nova')
    )
}

export const isExperimental = () => isNightly() || isNova()

export const isDevOrExperimental = isDev() || isExperimental()

/** @deprecated Use isDevOrExperimental instead */
export const isDevOrNightly = isDevOrExperimental
