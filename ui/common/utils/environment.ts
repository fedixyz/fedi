/**
 * Platform-agnostic  check if we're in a development server
 * or a production server.
 *
 * Supports Web & Native
 */
const isReactNativeDevMode = () => {
    return typeof __DEV__ !== 'undefined' && __DEV__ === true
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

export const isDevOrNightly = isDev() || isNightly()
