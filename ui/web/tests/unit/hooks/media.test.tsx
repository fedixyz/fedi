import '@testing-library/jest-dom'
import { renderHook, waitFor } from '@testing-library/react'

import { mockMatrixEventImage } from '@fedi/common/tests/mock-data/matrix-event'

import { useLoadMedia } from '../../../src/hooks/media'

const matrixDownloadFileSpy = jest.fn()
const readBridgeFileSpy = jest.fn()

jest.mock('../../../src/lib/bridge', () => ({
    fedimint: {
        matrixDownloadFile: () => matrixDownloadFileSpy(),
    },
    readBridgeFile: () => readBridgeFileSpy(),
}))

describe('/hooks/media', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('useLoadMedia', () => {
        it('should handle string result from readBridgeFile', async () => {
            readBridgeFileSpy.mockReturnValue('mock-media-string')

            const mockEvent = {
                ...mockMatrixEventImage,
                id: 'test-event-id-string',
            } as typeof mockMatrixEventImage

            const { result } = renderHook(() => useLoadMedia(mockEvent))

            await waitFor(() => {
                expect(matrixDownloadFileSpy).toHaveBeenCalled()
                expect(readBridgeFileSpy).toHaveBeenCalled()

                expect(window.URL.createObjectURL).toHaveBeenCalledWith(
                    expect.any(Blob),
                )
                expect(result.current.src).toBe('/test-url')
            })
        })

        it('should handle Uint8Array result from readBridgeFile', async () => {
            const mockUint8Array = new Uint8Array([1, 2, 3, 4])
            readBridgeFileSpy.mockReturnValue(mockUint8Array)

            const mockEvent = {
                ...mockMatrixEventImage,
                id: 'test-event-id-uint8array',
            } as typeof mockMatrixEventImage

            const { result } = renderHook(() => useLoadMedia(mockEvent))

            await waitFor(() => {
                expect(matrixDownloadFileSpy).toHaveBeenCalled()
                expect(readBridgeFileSpy).toHaveBeenCalled()

                expect(window.URL.createObjectURL).toHaveBeenCalledWith(
                    expect.any(Blob),
                )
                expect(result.current.src).toBe('/test-url')
            })
        })
    })
})
