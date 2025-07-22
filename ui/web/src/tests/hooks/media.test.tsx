import '@testing-library/jest-dom'
import { renderHook, waitFor } from '@testing-library/react'

import { mockMatrixEventImage } from '@fedi/common/tests/mock-data/matrix-event'

import { useLoadMedia } from '../../hooks/media'

const downloadFileSpy = jest.fn()
const readFileSpy = jest.fn()

jest.mock('@fedi/common/utils/log', () => ({
    makeLog: () => ({
        error: jest.fn(),
    }),
}))

jest.mock('../../lib/bridge', () => ({
    fedimint: {
        matrixDownloadFile: () => downloadFileSpy(),
    },
    readBridgeFile: () => readFileSpy(),
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
                expect(downloadFileSpy).toHaveBeenCalled()
                expect(readFileSpy).toHaveBeenCalled()
                expect(window.URL.createObjectURL).toHaveBeenCalledWith(
                    new Blob(),
                )
                expect(result.current.src).toBe('/test-url')
            })
        })
    })
})
