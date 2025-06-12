import {
    formatFileSize,
    scaleAttachment,
    prefixFileUri,
    stripFileUriPrefix,
    pathJoin,
} from '../../utils/media'

describe('media', () => {
    describe('formatFileSize', () => {
        it('should format exact file sizes in bytes', () => {
            expect(formatFileSize(0)).toBe('0 B')
            expect(formatFileSize(1)).toBe('1 B')
            expect(formatFileSize(1024)).toBe('1 KB')
            expect(formatFileSize(1024 * 1024)).toBe('1 MB')
        })

        it('should round file sizes to one decimal place', () => {
            expect(formatFileSize(1023)).toBe('1023 B')
            expect(formatFileSize(1200)).toBe('1.2 KB')
            expect(formatFileSize(1234567)).toBe('1.2 MB')
        })
    })

    describe('scaleAttachment', () => {
        it('should maintain the same dimensions for an image smaller than both max bounds', () => {
            const landscape = scaleAttachment(100, 100, 300, 300)
            expect(landscape.width).toBe(100)
            expect(landscape.height).toBe(100)
        })

        it('should scale square dimensions to fit a smaller square', () => {
            const square = scaleAttachment(1280, 1280, 300, 300)
            expect(square.width).toBe(300)
            expect(square.height).toBe(300)
        })

        it('should scale landscape dimensions to fit smaller landscape bounds', () => {
            const landscape = scaleAttachment(1280, 700, 400, 300)
            expect(landscape.width).toBe(400)
            expect(landscape.height).toBe(700 * (400 / 1280))
        })

        it('should scale landscape dimensions to fit smaller portrait bounds', () => {
            const landscape = scaleAttachment(1280, 700, 300, 400)
            expect(landscape.width).toBe(300)
            expect(landscape.height).toBe(700 * (300 / 1280))
        })

        it('should scale portrait dimensions to fit smaller landscape bounds', () => {
            const portrait = scaleAttachment(700, 1280, 400, 300)
            expect(portrait.width).toBe(700 * (300 / 1280))
            expect(portrait.height).toBe(300)
        })

        it('should scale portrait dimensions to fit smaller portrait bounds', () => {
            const portrait = scaleAttachment(700, 1280, 300, 400)
            expect(portrait.width).toBe(700 * (400 / 1280))
            expect(portrait.height).toBe(400)
        })
    })

    describe('prefixFileUri', () => {
        it('should prefix file paths with file://', () => {
            expect(prefixFileUri('/path/to/file.jpg')).toBe(
                'file:///path/to/file.jpg',
            )
            expect(prefixFileUri('/Users/tom/.config/nvim/init.lua')).toBe(
                'file:///Users/tom/.config/nvim/init.lua',
            )
        })

        it('should not prefix file paths with file:// if they are already prefixed', () => {
            expect(prefixFileUri('file:///path/to/file.jpg')).toBe(
                'file:///path/to/file.jpg',
            )

            expect(
                prefixFileUri('file:///Users/tom/.config/nvim/init.lua'),
            ).toBe('file:///Users/tom/.config/nvim/init.lua')
        })
    })

    describe('stripFileUriPrefix', () => {
        it('should strip file:// prefix from file paths', () => {
            expect(stripFileUriPrefix('file:///path/to/file.jpg')).toBe(
                '/path/to/file.jpg',
            )
            expect(
                stripFileUriPrefix('file:///Users/tom/.config/nvim/init.lua'),
            ).toBe('/Users/tom/.config/nvim/init.lua')
        })

        it('should not strip file:// prefix from file paths if they are not prefixed', () => {
            expect(stripFileUriPrefix('/path/to/file.jpg')).toBe(
                '/path/to/file.jpg',
            )

            expect(stripFileUriPrefix('/Users/tom/.config/nvim/init.lua')).toBe(
                '/Users/tom/.config/nvim/init.lua',
            )
        })
    })

    describe('pathJoin', () => {
        it('should join paths together with a forward slash', () => {
            expect(pathJoin('path', 'to', 'file.jpg')).toBe('path/to/file.jpg')
        })

        it('should remove duplicate forward slashes', () => {
            expect(pathJoin('path//', 'to', 'file.jpg')).toBe(
                'path/to/file.jpg',
            )
        })
    })
})
