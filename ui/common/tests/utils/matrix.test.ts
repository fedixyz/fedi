import {
    decodeFediMatrixUserUri,
    encodeFediMatrixUserUri,
    isValidMatrixUserId,
} from '../../utils/matrix'

describe('encodeFediMatrixUserUri', () => {
    it('encodes a user URI', () => {
        expect(encodeFediMatrixUserUri('@user:example.com')).toBe(
            'fedi:user:@user:example.com',
        )
    })
})

describe('decodeFediMatrixUserUri', () => {
    it('decodes a user URI', () => {
        expect(decodeFediMatrixUserUri('fedi:user:@user:example.com')).toBe(
            '@user:example.com',
        )
    })

    it('decodes a user URI with ://', () => {
        expect(decodeFediMatrixUserUri('fedi://user:@user:example.com')).toBe(
            '@user:example.com',
        )
    })

    it('throws an error if the URI is valid but the user id is not valid', () => {
        expect(() => decodeFediMatrixUserUri('fedi:user:invalid')).toThrow(
            'feature.chat.invalid-member',
        )
    })

    it('throws an error if the URI is not valid', () => {
        expect(() => decodeFediMatrixUserUri('invalid')).toThrow(
            'feature.chat.invalid-member',
        )
    })
})

describe('isValidMatrixUserId', () => {
    it('returns true if the user id is valid', () => {
        expect(isValidMatrixUserId('@user:example.com')).toBe(true)
    })

    it('returns false if the user id is not valid', () => {
        expect(isValidMatrixUserId('invalid')).toBe(false)
    })
})
