import { Buffer } from 'buffer'

import { getBufferEncoding } from './istextorbinary'

/**
 * Bytes for qrloop's `dataToFrames`: v2 ecash ("fedimint"-prefixed base32) as
 * verbatim utf8 text, v1 ecash (base64) decoded to binary. A base64 decode of
 * a v2 string silently corrupts it, since its chars are all valid base64.
 */
export function ecashToQrFrameData(ecash: string): Buffer {
    return ecash.startsWith('fedimint')
        ? Buffer.from(ecash, 'utf8')
        : Buffer.from(ecash, 'base64')
}

/**
 * String for the omni parser from qrloop's reassembled frame bytes. Inverse of
 * `ecashToQrFrameData`: binary frames re-encode as base64, text is verbatim.
 */
export function qrFrameDataToString(data: Buffer): string {
    return data.toString(
        getBufferEncoding(data) === 'binary' ? 'base64' : 'utf8',
    )
}
