import pako from 'pako'

import { makeTarGz, File } from '../../../utils/targz'

const decoder = new TextDecoder()

const extractTar = (buffer: Uint8Array): Record<string, Uint8Array> => {
    const BLOCK_SIZE = 512
    const files: Record<string, Uint8Array> = {}
    let offset = 0

    while (offset < buffer.length - BLOCK_SIZE) {
        const header = buffer.slice(offset, offset + BLOCK_SIZE)

        if (header.every(b => b === 0)) break

        const name = new TextDecoder()
            .decode(header.slice(0, 100))
            .replace(/\0/g, '')
        const size = parseInt(
            new TextDecoder()
                .decode(header.slice(124, 136))
                .replace(/\0/g, '')
                .trim(),
            8,
        )

        offset += BLOCK_SIZE
        files[name] = buffer.slice(offset, offset + size)

        offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
    }

    return files
}

describe('makeTarGz', () => {
    it('produces a valid gzip buffer', () => {
        const files: File[] = [{ name: 'test.txt', content: 'hello world' }]
        const result = makeTarGz(files)

        expect(result[0]).toBe(0x1f)
        expect(result[1]).toBe(0x8b)
    })

    it('correctly archives a single file', () => {
        const files: File[] = [{ name: 'test.txt', content: 'hello world' }]
        const result = makeTarGz(files)

        const decompressed = pako.ungzip(result)
        const extracted = extractTar(decompressed)

        expect(decoder.decode(extracted['test.txt'])).toBe('hello world')
    })

    it('correctly archives multiple files', () => {
        const files: File[] = [
            { name: 'a.txt', content: 'file a content' },
            { name: 'b.txt', content: 'file b content' },
            { name: 'c.txt', content: 'file c content' },
        ]
        const result = makeTarGz(files)

        const decompressed = pako.ungzip(result)
        const extracted = extractTar(decompressed)

        expect(decoder.decode(extracted['a.txt'])).toBe('file a content')
        expect(decoder.decode(extracted['b.txt'])).toBe('file b content')
        expect(decoder.decode(extracted['c.txt'])).toBe('file c content')
    })

    it('handles empty content', () => {
        const files: File[] = [{ name: 'empty.txt', content: '' }]
        const result = makeTarGz(files)

        const decompressed = pako.ungzip(result)
        const extracted = extractTar(decompressed)

        expect(decoder.decode(extracted['empty.txt'])).toBe('')
    })

    it('handles large file content', () => {
        const largeContent = 'x'.repeat(1024 * 1024) // 1MB
        const files: File[] = [{ name: 'large.txt', content: largeContent }]
        const result = makeTarGz(files)

        const decompressed = pako.ungzip(result)
        const extracted = extractTar(decompressed)

        expect(decoder.decode(extracted['large.txt'])).toBe(largeContent)
    })

    it('handles unicode content', () => {
        const files: File[] = [
            { name: 'unicode.txt', content: '日本語テスト 🎉' },
        ]
        const result = makeTarGz(files)

        const decompressed = pako.ungzip(result)
        const extracted = extractTar(decompressed)

        expect(decoder.decode(extracted['unicode.txt'])).toBe('日本語テスト 🎉')
    })

    it('handles empty file list', () => {
        const result = makeTarGz([])

        expect(result[0]).toBe(0x1f)
        expect(result[1]).toBe(0x8b)

        const decompressed = pako.ungzip(result)
        const extracted = extractTar(decompressed)

        expect(Object.keys(extracted)).toHaveLength(0)
    })

    it('handles binary/Uint8Array content', () => {
        const binaryContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]) // PNG magic bytes
        const files: File[] = [{ name: 'image.png', content: binaryContent }]
        const result = makeTarGz(files)

        const decompressed = pako.ungzip(result)
        const extracted = extractTar(decompressed)

        expect(extracted['image.png']).toEqual(binaryContent)
    })
})
