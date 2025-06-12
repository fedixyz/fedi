class StringUtils {
    getInitialsFromName = (name: string): string => {
        const names = name.split(' ')
        let initials = ''
        if (names.length === 1) {
            initials = name.substring(0, 1)
        }
        if (names.length >= 2) {
            initials = `${names[0].substring(0, 1)}${names[1].substring(0, 1)}`
        }
        return initials.toUpperCase()
    }
    truncateString = (longString: string, numberOfCharacters: number) => {
        if (longString.length <= numberOfCharacters) {
            return longString
        }

        return `${longString.substring(0, numberOfCharacters)}...`
    }
    truncateMiddleOfString = (
        longString: string,
        numberOfCharacters: number,
    ): string => {
        // Nothing to truncate if string is not long enough
        if (longString.length <= numberOfCharacters * 2) {
            return longString
        }

        return `${longString.substring(
            0,
            numberOfCharacters,
        )} ... ${longString.slice(numberOfCharacters * -1)}`
    }
    keepOnlyLowercaseLetters = (value: string): string => {
        // Remove all characters except for lowercase letters
        const seedWordValue = value.replace(/[^a-z]/g, '')

        return seedWordValue
    }
    stripNewLines = (str: string): string => {
        return str.replace(/(\r\n|\n|\r)/gm, ' ')
    }
}

const stringUtils = new StringUtils()
export default stringUtils
