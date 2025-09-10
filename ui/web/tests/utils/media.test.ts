import { getMediaDimensions } from '../../src/utils/media'

const mockImageInstance: Partial<HTMLImageElement> = {
    width: 200,
    height: 100,
    onload: null,
    onerror: null,
    set src(_value: string) {
        setTimeout(() => {
            mockImageInstance.onload?.call(
                mockImageInstance as any,
                new Event('load'),
            )
        }, 0)
    },
}

const mockVideoElement: Partial<HTMLVideoElement> = {
    videoWidth: 600,
    videoHeight: 400,
    onloadedmetadata: null,
    onerror: null,
    set src(_value: string) {
        setTimeout(() => {
            mockVideoElement.onloadedmetadata?.call(
                mockVideoElement as any,
                new Event('loadedmetadata'),
            )
        }, 0)
    },
}

describe('/utils/media', () => {
    describe('getMediaDimensions', () => {
        describe('when an image is passed', () => {
            const MockImageConstructor = jest.fn(
                () => mockImageInstance,
            ) as unknown as typeof Image

            let OriginalImage: typeof Image

            beforeEach(() => {
                OriginalImage = global.Image
                global.Image = MockImageConstructor
            })

            afterEach(() => {
                global.Image = OriginalImage
                jest.restoreAllMocks()
            })

            it('should return the image dimensions', async () => {
                const mockFile = new File(['dummy'], 'test.png', {
                    type: 'image/png',
                })

                const result = await getMediaDimensions(mockFile)

                expect(result).toEqual({ width: 200, height: 100 })
            })
        })

        describe('when a video is passed', () => {
            beforeEach(() => {
                jest.spyOn(document, 'createElement').mockImplementation(() => {
                    return mockVideoElement as unknown as HTMLVideoElement
                })
            })

            afterEach(() => {
                jest.restoreAllMocks()
            })

            it('should return the video dimensions', async () => {
                const mockFile = new File(['dummy'], 'test.mp4', {
                    type: 'video/mp4',
                })

                const result = await getMediaDimensions(mockFile)

                expect(result).toEqual({ width: 600, height: 400 })
            })
        })
    })
})
