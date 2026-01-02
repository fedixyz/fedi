export const stripAndDeduplicateWhitespace = (input: string) => {
    return input.trim().replace(/\s{2,}/g, whitespace => whitespace.slice(0, 2))
}

/**
 * the idea here is some websites may do something like:
 *     facebook.com => Facebook - Log In or Sign Up
 *
 * so we check and truncate upto the hyphen if found
 * then also truncates to a max of 24 characters
 *
 * so this would result in:
 *     "Facebook"
 * rather than
 *     "Facebook - Log In or Si"
 * which is what naive truncation of 24 characters would do
 */
export const sanitizeTitle = (input: string) => {
    let result = input
    const hyphenIndex = input.indexOf(' - ')
    if (hyphenIndex !== -1) {
        result = input.substring(0, hyphenIndex).trim()
    }
    result = stripAndDeduplicateWhitespace(result)
    return result.slice(0, 24)
}
