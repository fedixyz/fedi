import { toSha256EncHex } from '../../../utils/EncryptionUtils'

describe('EncryptionUtils', () => {
    describe('toSha256EncHex', () => {
        it('should return expected hash for example username', async () => {
            const result = toSha256EncHex('nice cousin')
            expect(typeof result).toBe('string')
            expect(result).toBe(
                '0c853d335248e250d2730d832f6f2c2c5eaa1c4b58b7eeb4f2256a2dfd7efa24',
            )
        })

        it('should return expected hash for empty string', async () => {
            const result = toSha256EncHex('')
            expect(result).toBe(
                'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            )
        })

        it('should return different hashes for different inputs', async () => {
            const hash1 = toSha256EncHex('test1')
            const hash2 = toSha256EncHex('test2')
            expect(hash1).not.toBe(hash2)
        })

        it('should return consistent hash for same input', async () => {
            const message = 'consistent test'
            const hash1 = toSha256EncHex(message)
            const hash2 = toSha256EncHex(message)
            expect(hash1).toBe(hash2)
        })

        it('should handle special characters and unicode', async () => {
            const result = toSha256EncHex('🚀 Special chars: !@#$%^&*()')
            expect(typeof result).toBe('string')
            expect(result.length).toBe(64) // SHA256 hex is always 64 characters
        })
    })
})
