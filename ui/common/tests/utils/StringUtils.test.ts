import stringUtils from '@fedi/common/utils/StringUtils'

describe('StringUtils', () => {
    describe('truncateMiddleOfString', () => {
        it('returns string with correct number of characters before ellipsis', () => {
            const truncateTwo = stringUtils
                .truncateMiddleOfString('aaaaa', 2)
                .indexOf(' ... ')
            const truncateSix = stringUtils
                .truncateMiddleOfString('aaaaabbbbbcccccddddd', 6)
                .indexOf(' ... ')

            expect(truncateTwo).toEqual(2)
            expect(truncateSix).toEqual(6)
        })
        it('returns string without truncation when not needed', () => {
            expect(stringUtils.truncateMiddleOfString('aaaabbbb', 8)).toEqual(
                'aaaabbbb',
            )
            expect(stringUtils.truncateMiddleOfString('aaaabbbb', 4)).toEqual(
                'aaaabbbb',
            )
        })
        it('strips out all whitepspaces', () => {
            expect(stringUtils.keepOnlyLowercaseLetters(' a b c d e ')).toEqual(
                'abcde',
            )
        })
        it('strips out capital letters and whitespaces', () => {
            expect(stringUtils.keepOnlyLowercaseLetters('a B c D e')).toEqual(
                'ace',
            )
        })
        it('strips out special characters and whitespaces', () => {
            expect(stringUtils.keepOnlyLowercaseLetters('a ! @ # e')).toEqual(
                'ae',
            )
        })
    })
    describe('getInitialsFromName', () => {
        it('returns 1 uppercase letter from 1 word title-case name', () => {
            const initials = stringUtils.getInitialsFromName('Satoshi')

            expect(initials).toEqual('S')
        })
        it('returns 1 uppercase letter from 1 word lower-case name', () => {
            const initials = stringUtils.getInitialsFromName('satoshi')

            expect(initials).toEqual('S')
        })
        it('returns 2 uppercase letters from 2-word title-case name', () => {
            const initials = stringUtils.getInitialsFromName('Satoshi Nakamoto')

            expect(initials).toEqual('SN')
        })
        it('returns 2 uppercase letters from 2-word lower-case name', () => {
            const initials = stringUtils.getInitialsFromName('satoshi nakamoto')

            expect(initials).toEqual('SN')
        })
        it('returns 2 uppercase letters from first 2 words from 3+-word title-case name', () => {
            const initials =
                stringUtils.getInitialsFromName('We Are All Satoshi')

            expect(initials).toEqual('WA')
        })
        it('returns 2 uppercase letters from first 2 words from 3+-word lower-case name', () => {
            const initials =
                stringUtils.getInitialsFromName('we are all satoshi')

            expect(initials).toEqual('WA')
        })
    })
})
