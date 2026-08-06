import {
    ecashToQrFrameData,
    qrFrameDataToString,
} from '../../../utils/qrFrames'

describe('ecashToQrFrameData', () => {
    it('round-trips v1 ecash (base64) through the scanner decode', () => {
        const binary = Buffer.from(
            Array.from({ length: 96 }, (_, i) => i % 256),
        )
        const v1Ecash = binary.toString('base64')

        const framed = ecashToQrFrameData(v1Ecash)

        expect(framed.equals(binary)).toBe(true)
        expect(qrFrameDataToString(framed)).toBe(v1Ecash)
    })

    it('round-trips v2 ecash (fedimint-prefixed base32) through the scanner decode', () => {
        // length deliberately not a multiple of 4: a base64 decode/encode
        // round trip would truncate and pad it
        const v2Ecash = 'fedimint' + 'a1b2c3d4e5f6g7h8i9j0klmnopqrstuv0'
        expect(v2Ecash.length % 4).not.toBe(0)

        expect(qrFrameDataToString(ecashToQrFrameData(v2Ecash))).toBe(v2Ecash)
    })

    it('would corrupt v2 ecash if framed as base64', () => {
        const v2Ecash = 'fedimint' + 'a1b2c3d4e5f6g7h8i9j0klmnopqrstuv0'

        expect(qrFrameDataToString(Buffer.from(v2Ecash, 'base64'))).not.toBe(
            v2Ecash,
        )
    })
})
