import { waitFor } from '@testing-library/react-native'
import crypto from 'crypto'
import { TemporaryDirectoryPath } from 'react-native-fs'
import { RESULTS } from 'react-native-permissions'

import { setupStore } from '@fedi/common/redux'
import {
    mockMatrixEventFile,
    mockMatrixEventImage,
    mockMatrixEventVideo,
} from '@fedi/common/tests/mock-data/matrix-event'
import { pathJoin } from '@fedi/common/utils/media'

import { useDownloadResource } from '../../utils/hooks/media'
import { renderHookWithProviders } from '../utils/render'

const testMxcUrl = 'mxc://m1.8fa.in/id'
const testHttpUrl = 'https://example.com/test.png'
const matrixDownloadPath = '/path/to/matrix/file'

const mockMatrixDownloadFile = jest
    .fn()
    .mockImplementation(async () => matrixDownloadPath)
const mockSaveAsset = jest.fn()
const mockRequestDownloadPermission = jest.fn(() =>
    Promise.resolve(RESULTS.GRANTED),
)
const mockUseDownloadPermission = jest.fn(() => ({
    downloadPermission: RESULTS.GRANTED,
    requestDownloadPermission: mockRequestDownloadPermission,
}))
const mockRNFetchBlobFetch = jest.fn()
const mockShareOpen = jest.fn()

jest.mock('@fedi/native/bridge', () => ({
    ...jest.requireActual('@fedi/native/bridge'),
    fedimint: {
        matrixDownloadFile: (...args: any[]) => mockMatrixDownloadFile(...args),
    },
}))

jest.mock('@react-native-documents/picker', () => ({
    pick: jest.fn(),
    keepLocalCopy: jest.fn(),
}))

jest.mock('@react-native-camera-roll/camera-roll', () => ({
    CameraRoll: {
        saveAsset: (...args: any[]) => mockSaveAsset(...args),
    },
}))

jest.mock('@fedi/native/utils/hooks', () => ({
    useDownloadPermission: () => mockUseDownloadPermission(),
}))

jest.mock('rn-fetch-blob', () => ({
    config: () => ({
        fetch: (...args: any[]) => mockRNFetchBlobFetch(...args),
    }),
}))

jest.mock('react-native-share', () => ({
    open: (...args: any[]) => mockShareOpen(...args),
}))

describe('useDownloadResource', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should initialize with correct default values', () => {
        const { result } = renderHookWithProviders(
            () => useDownloadResource(null),
            { store },
        )

        expect('isLoading' in result.current).toBeTruthy()
        expect('isError' in result.current).toBeTruthy()
        expect('setIsError' in result.current).toBeTruthy()
        expect('uri' in result.current).toBeTruthy()
        expect('isDownloading' in result.current).toBeTruthy()
        expect('handleDownload' in result.current).toBeTruthy()
    })

    describe('copying resources to the temporary directory', () => {
        it('should copy a matrix image event to the temporary directory with fedimint.matrixDownloadFile', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(mockMatrixEventImage),
                { store },
            )

            const identifier = `${mockMatrixEventImage.eventId}-${mockMatrixEventImage.timestamp}`
            const identifierHash = crypto
                .createHash('md5')
                .update(identifier)
                .digest('hex')
            const imageMime = mockMatrixEventImage.content.info.mimetype
                .split('/')
                .pop()

            await waitFor(() => {
                expect(mockMatrixDownloadFile).toHaveBeenCalledWith(
                    pathJoin(
                        TemporaryDirectoryPath,
                        `${identifierHash}.${imageMime}`,
                    ),
                    mockMatrixEventImage.content,
                )
                expect(result.current.uri).toBeTruthy()
            })
        })

        it('should copy a matrix video event to the temporary directory with fedimint.matrixDownloadFile', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(mockMatrixEventVideo),
                { store },
            )

            const identifier = `${mockMatrixEventVideo.eventId}-${mockMatrixEventVideo.timestamp}`
            const identifierHash = crypto
                .createHash('md5')
                .update(identifier)
                .digest('hex')
            const imageMime = mockMatrixEventVideo.content.info.mimetype
                .split('/')
                .pop()

            await waitFor(() => {
                expect(mockMatrixDownloadFile).toHaveBeenCalledWith(
                    pathJoin(
                        TemporaryDirectoryPath,
                        `${identifierHash}.${imageMime}`,
                    ),
                    mockMatrixEventVideo.content,
                )
                expect(result.current.uri).toBeTruthy()
            })
        })

        it('should copy a matrix file event to the temporary directory with fedimint.matrixDownloadFile', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(mockMatrixEventFile),
                { store },
            )

            const identifier = `${mockMatrixEventFile.eventId}-${mockMatrixEventFile.timestamp}`
            const identifierHash = crypto
                .createHash('md5')
                .update(identifier)
                .digest('hex')
            const imageMime = mockMatrixEventFile.content.info.mimetype
                .split('/')
                .pop()

            await waitFor(() => {
                expect(mockMatrixDownloadFile).toHaveBeenCalledWith(
                    pathJoin(
                        TemporaryDirectoryPath,
                        `${identifierHash}.${imageMime}`,
                    ),
                    mockMatrixEventFile.content,
                )
                expect(result.current.uri).toBeTruthy()
            })
        })

        it('should copy an http URL to the temporary directory with `RNFetchBlob.fetch`', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(testHttpUrl),
                {
                    store,
                },
            )

            await waitFor(() => {
                expect(mockRNFetchBlobFetch).toHaveBeenCalledWith(
                    'GET',
                    testHttpUrl,
                )
                expect(result.current.uri).toBeTruthy()
            })
        })

        it('should convert an mxc:// URL to an http URL before copying it to the temporary directory with `RNFetchBlob.fetch`', async () => {
            renderHookWithProviders(() => useDownloadResource(testMxcUrl), {
                store,
            })

            await waitFor(() => {
                expect(mockRNFetchBlobFetch).toHaveBeenCalledWith(
                    'GET',
                    `https://m1.8fa.in/_matrix/media/r0/download/m1.8fa.in/id`,
                )
            })
        })

        it('should not automatically download the resource to the temporary directory if the `loadResourceInitially` option is false', async () => {
            renderHookWithProviders(
                () =>
                    useDownloadResource(mockMatrixEventImage, {
                        loadResourceInitially: false,
                    }),
                { store },
            )

            await waitFor(() => {
                expect(mockMatrixDownloadFile).not.toHaveBeenCalled()
            })
        })
    })

    describe('downloading resources', () => {
        it('should download a matrix image event to the camera roll', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(mockMatrixEventImage),
                { store },
            )

            await waitFor(() => {
                expect(mockMatrixDownloadFile).toHaveBeenCalled()
                expect(result.current.uri).toBeTruthy()
            })

            const { handleDownload } = result.current

            await handleDownload()

            await waitFor(() => {
                expect(mockSaveAsset).toHaveBeenCalledWith(result.current.uri, {
                    type: 'auto',
                })
            })
        })

        it('should download a matrix video event to the camera roll', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(mockMatrixEventVideo),
                { store },
            )

            await waitFor(() => {
                expect(mockMatrixDownloadFile).toHaveBeenCalled()
                expect(result.current.uri).toBeTruthy()
            })

            const { handleDownload } = result.current

            await handleDownload()

            await waitFor(() => {
                expect(mockSaveAsset).toHaveBeenCalledWith(result.current.uri, {
                    type: 'auto',
                })
            })
        })

        it('should open a matrix file event in Share.open', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(mockMatrixEventFile),
                { store },
            )

            await waitFor(() => {
                expect(mockMatrixDownloadFile).toHaveBeenCalled()
                expect(result.current.uri).toBeTruthy()
            })

            const { handleDownload } = result.current

            await handleDownload()

            await waitFor(() => {
                expect(mockShareOpen).toHaveBeenCalled()
            })
        })

        it('should download an http URL to the camera roll', async () => {
            const { result } = renderHookWithProviders(
                () => useDownloadResource(testHttpUrl),
                { store },
            )

            await waitFor(() => {
                expect(mockRNFetchBlobFetch).toHaveBeenCalledWith(
                    'GET',
                    testHttpUrl,
                )
                expect(result.current.uri).toBeTruthy()
            })

            const { handleDownload } = result.current

            await handleDownload()

            await waitFor(() => {
                expect(mockSaveAsset).toHaveBeenCalledWith(result.current.uri, {
                    type: 'auto',
                })
            })
        })

        it('should convert an mxc:// URL to an http URL before downloading it to the camera roll', async () => {
            const convertedMxcUrl = `https://m1.8fa.in/_matrix/media/r0/download/m1.8fa.in/id`

            const { result } = renderHookWithProviders(
                () => useDownloadResource(testMxcUrl),
                { store },
            )

            await waitFor(() => {
                expect(mockRNFetchBlobFetch).toHaveBeenCalledWith(
                    'GET',
                    convertedMxcUrl,
                )
                expect(result.current.uri).toBeTruthy()
            })

            const { handleDownload } = result.current

            await handleDownload()

            await waitFor(() => {
                expect(mockSaveAsset).toHaveBeenCalledWith(result.current.uri, {
                    type: 'auto',
                })
            })
        })
    })
})
