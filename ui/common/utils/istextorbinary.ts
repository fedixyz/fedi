/**
 * @file
 * Lightly modified and simplified version of https://github.com/bevry/istextorbinary
 * Copied into our codebase to reduce dependencies. Original module is licensed
 * under the MIT license, so we're all good.
 */
import type Buffer from 'buffer'

interface EncodingOpts {
    /** Defaults to 24 */
    chunkLength?: number

    /** If not provided, will check the start, beginning, and end */
    chunkBegin?: number
}

/**
 * Get the encoding of a buffer.
 * Checks the start, middle, and end of the buffer for characters that are unrecognized within UTF8 encoding.
 * History has shown that inspection at all three locations is necessary.
 * @returns Will be `null` if `buffer` was not provided. Otherwise will be either `'utf8'` or `'binary'`
 */
export function getBufferEncoding(
    buffer: Buffer | null,
    opts?: EncodingOpts,
): 'utf8' | 'binary' | null {
    // Check
    if (!buffer) return null

    // Prepare
    const textEncoding = 'utf8'
    const binaryEncoding = 'binary'
    const chunkLength = opts?.chunkLength ?? 24
    let chunkBegin = opts?.chunkBegin ?? 0

    // Discover
    if (opts?.chunkBegin == null) {
        // Start
        let encoding = getBufferEncoding(buffer, { chunkLength, chunkBegin })
        if (encoding === textEncoding) {
            // Middle
            chunkBegin = Math.max(
                0,
                Math.floor(buffer.length / 2) - chunkLength,
            )
            encoding = getBufferEncoding(buffer, {
                chunkLength,
                chunkBegin,
            })
            if (encoding === textEncoding) {
                // End
                chunkBegin = Math.max(0, buffer.length - chunkLength)
                encoding = getBufferEncoding(buffer, {
                    chunkLength,
                    chunkBegin,
                })
            }
        }

        // Return
        return encoding
    } else {
        // Extract
        chunkBegin = getChunkBegin(buffer, chunkBegin)
        if (chunkBegin === -1) {
            return binaryEncoding
        }

        const chunkEnd = getChunkEnd(
            buffer,
            Math.min(buffer.length, chunkBegin + chunkLength),
        )

        if (chunkEnd > buffer.length) {
            return binaryEncoding
        }

        const contentChunkUTF8 = buffer.toString(
            textEncoding,
            chunkBegin,
            chunkEnd,
        )

        // Detect encoding
        for (let i = 0; i < contentChunkUTF8.length; ++i) {
            const charCode = contentChunkUTF8.charCodeAt(i)
            if (charCode === 65533 || charCode <= 8) {
                // 8 and below are control characters (e.g. backspace, null, eof, etc.)
                // 65533 is the unknown character
                return binaryEncoding
            }
        }

        // Return
        return textEncoding
    }
}

// ====================================
// The functions below are created to handle multibyte utf8 characters.
// To understand how the encoding works, check this article: https://en.wikipedia.org/wiki/UTF-8#Encoding
// @todo add documentation for these

function getChunkBegin(buf: Buffer, chunkBegin: number) {
    // If it's the beginning, just return.
    if (chunkBegin === 0) {
        return 0
    }

    if (!isLaterByteOfUtf8(buf[chunkBegin])) {
        return chunkBegin
    }

    let begin = chunkBegin - 3

    if (begin >= 0) {
        if (isFirstByteOf4ByteChar(buf[begin])) {
            return begin
        }
    }

    begin = chunkBegin - 2

    if (begin >= 0) {
        if (
            isFirstByteOf4ByteChar(buf[begin]) ||
            isFirstByteOf3ByteChar(buf[begin])
        ) {
            return begin
        }
    }

    begin = chunkBegin - 1

    if (begin >= 0) {
        // Is it a 4-byte, 3-byte utf8 character?
        if (
            isFirstByteOf4ByteChar(buf[begin]) ||
            isFirstByteOf3ByteChar(buf[begin]) ||
            isFirstByteOf2ByteChar(buf[begin])
        ) {
            return begin
        }
    }

    return -1
}

function getChunkEnd(buf: Buffer, chunkEnd: number) {
    // If it's the end, just return.
    if (chunkEnd === buf.length) {
        return chunkEnd
    }

    let index = chunkEnd - 3

    if (index >= 0) {
        if (isFirstByteOf4ByteChar(buf[index])) {
            return chunkEnd + 1
        }
    }

    index = chunkEnd - 2

    if (index >= 0) {
        if (isFirstByteOf4ByteChar(buf[index])) {
            return chunkEnd + 2
        }

        if (isFirstByteOf3ByteChar(buf[index])) {
            return chunkEnd + 1
        }
    }

    index = chunkEnd - 1

    if (index >= 0) {
        if (isFirstByteOf4ByteChar(buf[index])) {
            return chunkEnd + 3
        }

        if (isFirstByteOf3ByteChar(buf[index])) {
            return chunkEnd + 2
        }

        if (isFirstByteOf2ByteChar(buf[index])) {
            return chunkEnd + 1
        }
    }

    return chunkEnd
}

function isFirstByteOf4ByteChar(byte: number) {
    // eslint-disable-next-line no-bitwise
    return byte >> 3 === 30 // 11110xxx?
}

function isFirstByteOf3ByteChar(byte: number) {
    // eslint-disable-next-line no-bitwise
    return byte >> 4 === 14 // 1110xxxx?
}

function isFirstByteOf2ByteChar(byte: number) {
    // eslint-disable-next-line no-bitwise
    return byte >> 5 === 6 // 110xxxxx?
}

function isLaterByteOfUtf8(byte: number) {
    // eslint-disable-next-line no-bitwise
    return byte >> 6 === 2 // 10xxxxxx?
}
