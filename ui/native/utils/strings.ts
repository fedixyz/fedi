export const stripAndDeduplicateWhitespace = (input: string) => {
    return input.trim().replace(/\s{2,}/g, ' ')
}
