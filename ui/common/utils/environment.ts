/**
 * Platform-agnostic  check if we're in a development server
 * or a production server.
 *
 * Supports Web & Native
 */
export const isDev = () => {
    try {
        return (
            (typeof __DEV__ === 'boolean' && __DEV__) ||
            (!!process && process.env.NODE_ENV === 'development')
        )
    } catch (_) {
        return false
    }
}
