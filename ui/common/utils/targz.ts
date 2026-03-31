import pako from 'pako'

export interface File {
    name: string
    content: string | Uint8Array
}

export function makeTarGz(files: File[]): Uint8Array {
    const encoder = new TextEncoder()
    const blocks: Uint8Array[] = []

    for (const f of files) {
        const data =
            typeof f.content === 'string'
                ? encoder.encode(f.content)
                : f.content
        blocks.push(createTarEntry(f.name, data))
    }

    blocks.push(new Uint8Array(1024)) // tar terminator

    return pako.gzip(concatUint8Arrays(blocks))
}

function createTarEntry(name: string, data: Uint8Array): Uint8Array {
    const header = new Uint8Array(512)

    writeString(header, 0, name, 100)
    writeString(header, 100, '0000644\0', 8)
    writeString(header, 108, '0000000\0', 8)
    writeString(header, 116, '0000000\0', 8)
    writeString(header, 124, padOctal(data.byteLength, 11) + '\0', 12)
    writeString(
        header,
        136,
        padOctal(Math.floor(Date.now() / 1000), 11) + '\0',
        12,
    )
    writeString(header, 148, '        ', 8) // checksum placeholder
    header[156] = 48 // '0' = regular file
    writeString(header, 257, 'ustar\0', 6)
    writeString(header, 263, '00', 2)

    let checksum = 0
    for (let i = 0; i < 512; i++) checksum += header[i]
    writeString(header, 148, padOctal(checksum, 6) + '\0 ', 8)

    const paddedLen = Math.ceil(data.byteLength / 512) * 512
    const body = new Uint8Array(paddedLen)
    body.set(data)

    return concatUint8Arrays([header, body])
}

function writeString(
    buf: Uint8Array,
    offset: number,
    str: string,
    len: number,
) {
    const bytes = new TextEncoder().encode(str)
    buf.set(bytes.subarray(0, len), offset)
}

function padOctal(num: number, digits: number): string {
    return num.toString(8).padStart(digits, '0')
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((sum, a) => sum + a.byteLength, 0)
    const result = new Uint8Array(total)
    let offset = 0
    for (const a of arrays) {
        result.set(a, offset)
        offset += a.byteLength
    }
    return result
}
