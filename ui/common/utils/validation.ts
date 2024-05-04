/**
 * Returns whether or not string is a valid RFC-5322 identifier.
 */
export function isValidInternetIdentifier(str: string): boolean {
    // Simplified regex, at some point we might want to tighten this to match
    // https://datatracker.ietf.org/doc/html/rfc5322#section-3.4.1
    return !!str.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
}
