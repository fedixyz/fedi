import '@testing-library/jest-dom'
import { renderHook, waitFor } from '@testing-library/react'

import { mockMatrixEventImage } from '@fedi/common/tests/mock-data/matrix-event'

import { useLoadMedia } from '../../src/hooks/media'

const matrixDownloadFileSpy = jest.fn()
const readBrdigeFileSpy = jest.fn()

jest.mock('../../src/lib/bridge', () => ({
    fedimint: {
        matrixDownloadFile: () => matrixDownloadFileSpy(),
    },
    readBridgeFile: () => readBrdigeFileSpy(),
}))

describe('/hooks/media', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the hook is called', () => {
        it('should call functions and return a src', async () => {
            const { result } = renderHook(() =>
                useLoadMedia(mockMatrixEventImage),
            )

            await waitFor(() => {
                expect(matrixDownloadFileSpy).toHaveBeenCalled()
                expect(readBrdigeFileSpy).toHaveBeenCalled()

                expect(window.URL.createObjectURL).toHaveBeenCalledWith(
                    new Blob(),
                )
                expect(result.current.src).toBe('/test-url')
            })
        })
    })
})
