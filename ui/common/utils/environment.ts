/**
 * Platform-agnostic  check if we're in a development server
 * or a production server.
 *
 * Supports Web & Native
 */
const isReactNativeDevMode = () => {
    return eval('__DEV__') || false
}

export const isDev = () => {
    try {
        return (
            (!!process && process.env.NODE_ENV === 'development') ||
            isReactNativeDevMode()
        )
    } catch (_) {
        return false
    }
}
