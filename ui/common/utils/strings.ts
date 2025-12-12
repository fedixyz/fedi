export const stripAndDeduplicateWhitespace = (input: string) => {
    return input.trim().replace(/\s{2,}/g, whitespace => whitespace.slice(0, 2))
}
