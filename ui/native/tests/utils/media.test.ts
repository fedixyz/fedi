import { Platform } from 'react-native'
import { DocumentPickerResponse } from 'react-native-document-picker'
import { TemporaryDirectoryPath } from 'react-native-fs'
import * as RNFS from 'react-native-fs'
import { Asset } from 'react-native-image-picker'

import {
    copyAssetToTempUri,
    copyDocumentToTempUri,
    doesAssetExceedSize,
    doesDocumentExceedSize,
    makeRandomTempFilePath,
    prefixFileUri,
    stripFileUriPrefix,
} from '../../utils/media'

const testDocument: DocumentPickerResponse = {
    uri: 'file:///Users/test/Documents/file.txt',
    name: 'file.txt',
    fileCopyUri: 'file:///Users/test/Documents/file.txt',
    type: 'text/plain',
    size: 1024,
}

const testContentDocument: DocumentPickerResponse = {
    uri: 'content://com.android.providers.downloads.documents/document/file.txt',
    name: 'file.txt',
    fileCopyUri: 'file:///Users/test/Documents/file.txt',
    type: 'text/plain',
    size: 1024,
}

const testImage: Asset = {
    fileName: 'test.png',
    type: 'image/png',
    uri: 'file:///Users/images/test.png',
    fileSize: 1024,
    width: 1024,
    height: 1024,
}

const testGif: Asset = {
    fileName: 'test.gif',
    type: 'image/gif',
    uri: 'file:///Users/images/test.gif',
    fileSize: 2048,
    width: 1024,
    height: 1024,
}

const testVideo: Asset = {
    fileName: 'test.mp4',
    type: 'video/mp4',
    uri: 'file:///Users/videos/test.mp4',
    fileSize: 4096,
    width: 1024,
    height: 1024,
}

jest.mock('react-native-document-picker', () => ({
    DocumentPicker: {
        pick: async () => testDocument,
    },
}))

jest.mock('react-native-image-picker', () => ({
    launchImageLibrary: async () => ({
        assets: [testImage, testVideo],
    }),
}))

jest.mock('react-native-fs', () => ({
    TemporaryDirectoryPath: '/tmp',
    readFile: jest.fn(async () => {
        return 'file:///tmp/test.jpg'
    }),
    writeFile: jest.fn(async () => {
        /* no-op */
    }),
    downloadFile: jest.fn(() => {
        return {
            promise: new Promise(resolve => {
                resolve({ jobId: '123', statusCode: 200, bytesWritten: 1024 })
            }),
        }
    }),
    copyFile: jest.fn(async () => {
        /* no-op */
    }),
    mkdir: jest.fn(async () => {
        /* no-op */
    }),
}))

jest.mock('react-native', () => ({
    Platform: {
        OS: 'ios',
    },
}))

describe('media', () => {
    beforeAll(() => {
        jest.clearAllMocks()
    })

    describe('prefixFileUri', () => {
        it('should prefix a file path with file://', () => {
            const filePath = '/path/to/file.jpg'

            expect(prefixFileUri(filePath)).toBe('file://' + filePath)
        })

        it('should not add another file:// prefix to a URI already prefixed with file://', () => {
            const fileUri = 'file:///path/to/file.jpg'

            expect(prefixFileUri(fileUri)).toBe(fileUri)
        })
    })

    describe('stripFileUriPrefix', () => {
        it('should strip file:// prefix from a file URI', () => {
            const fileUri = 'file:///path/to/file.jpg'

            expect(stripFileUriPrefix(fileUri)).toBe('/path/to/file.jpg')
        })

        it('should return the original file path if not prefixed with file://', () => {
            const filePath = '/path/to/file.jpg'

            expect(stripFileUriPrefix(filePath)).toBe(filePath)
        })
    })

    describe('makeRandomTempFilePath', () => {
        it('should return a valid random temporary file URI', () => {
            const fileName = 'test.jpg'
            const { uri } = makeRandomTempFilePath(fileName)

            expect(uri.startsWith('file:///')).toBeTruthy()
            expect(uri.endsWith(fileName)).toBeTruthy()
        })

        it('should return a valid random temporary file path ending with the file name', () => {
            const fileName = 'test.jpg'
            const { path } = makeRandomTempFilePath(fileName)

            expect(path.startsWith('file:///')).toBeFalsy()
            expect(path.startsWith(TemporaryDirectoryPath)).toBeTruthy()
            expect(path.endsWith(fileName)).toBeTruthy()
        })

        it('should return the path to the random temporary directory without the file name', () => {
            const fileName = 'test.jpg'
            const { dirPath } = makeRandomTempFilePath(fileName)

            expect(dirPath.startsWith(TemporaryDirectoryPath)).toBeTruthy()
            expect(dirPath.endsWith(fileName)).toBeFalsy()
        })
    })

    describe('copyDocumentToTempUri', () => {
        it('should return the original document URI if it is not an android content URI', async () => {
            const result = await copyDocumentToTempUri(testDocument)

            expect(result.isOk()).toBeTruthy()
            expect(result.isErr()).toBeFalsy()
            expect(result._unsafeUnwrap()).toBe(testDocument.uri)
        })

        it('should write a copy of the document to a random temporary URI if it is an android content URI', async () => {
            const result = await copyDocumentToTempUri(testContentDocument)

            expect(result.isOk()).toBeTruthy()
            expect(result.isErr()).toBeFalsy()

            const uri = result._unsafeUnwrap()

            expect(uri.startsWith('file:///')).toBeTruthy()
            expect(uri).toContain(TemporaryDirectoryPath)
            expect(
                uri.endsWith(testContentDocument.name as string),
            ).toBeTruthy()
        })

        it('should short-circuit with a GenericError (android content URI) if readFile errors', async () => {
            ;(RNFS.readFile as jest.Mock).mockImplementation(async () => {
                throw new Error('File not found')
            })

            const result = await copyDocumentToTempUri(testContentDocument)

            expect(result.isErr()).toBeTruthy()
            expect(result._unsafeUnwrapErr()._tag).toBe('GenericError')
        })

        it('should short-circuit with a GenericError (android content URI) if writeFile errors', async () => {
            ;(RNFS.writeFile as jest.Mock).mockImplementation(async () => {
                throw new Error('File not found')
            })

            const result = await copyDocumentToTempUri(testContentDocument)

            expect(result.isErr()).toBeTruthy()
            expect(result._unsafeUnwrapErr()._tag).toBe('GenericError')
        })
    })

    describe('copyAssetToTempUri', () => {
        it('should copy an asset to a random temporary URI', async () => {
            const result = await copyAssetToTempUri(testImage)

            expect(result.isOk()).toBeTruthy()
            expect(RNFS.copyFile).toHaveBeenCalled()

            const uri = result._unsafeUnwrap()

            expect(uri.startsWith('file:///')).toBeTruthy()
            expect(uri).toContain(TemporaryDirectoryPath)
            expect(uri.endsWith(testImage.fileName as string)).toBeTruthy()
        })

        it('should download a video on iOS to a random temporary URI using downloadFile', async () => {
            const result = await copyAssetToTempUri(testVideo)

            expect(result.isOk()).toBeTruthy()
            expect(RNFS.downloadFile).toHaveBeenCalled()

            const uri = result._unsafeUnwrap()

            expect(uri.startsWith('file:///')).toBeTruthy()
            expect(uri).toContain(TemporaryDirectoryPath)
            expect(uri.endsWith(testVideo.fileName as string)).toBeTruthy()
        })

        it('should copy an animated gif to a random temporary URI on Android', async () => {
            Platform.OS = 'android'

            const result = await copyAssetToTempUri(testGif)

            expect(result.isOk()).toBeTruthy()
            expect(RNFS.copyFile).toHaveBeenCalled()

            const uri = result._unsafeUnwrap()

            expect(uri.startsWith('file:///')).toBeTruthy()
            expect(uri).toContain(TemporaryDirectoryPath)
            expect(uri.endsWith(testGif.fileName as string)).toBeTruthy()
        })

        it('should short-circuit with a MissingDataError if the asset URI is missing', async () => {
            const result = await copyAssetToTempUri({
                ...testImage,
                uri: undefined,
            })

            expect(result.isErr()).toBeTruthy()
            expect(result._unsafeUnwrapErr()._tag).toBe('MissingDataError')
        })

        it('should short-circuit with a MissingDataError if the asset fileName is missing', async () => {
            const result = await copyAssetToTempUri({
                ...testImage,
                fileName: undefined,
            })

            expect(result.isErr()).toBeTruthy()
            expect(result._unsafeUnwrapErr()._tag).toBe('MissingDataError')
        })

        it('should short-circuit with a GenericError if RNFS.mkdir errors', async () => {
            ;(RNFS.mkdir as jest.Mock).mockImplementation(async () => {
                throw new Error('File not found')
            })

            const result = await copyAssetToTempUri(testImage)

            expect(result.isErr()).toBeTruthy()
            expect(result._unsafeUnwrapErr()._tag).toBe('GenericError')
        })
    })

    describe('doesAssetExceedSize', () => {
        it('should return true if an asset exceeds the size in bytes', () => {
            const doesExceedSize = doesAssetExceedSize(testImage, 1000)

            expect(doesExceedSize).toBeTruthy()
        })

        it('should return false if an asset does not exceed the size in bytes', () => {
            const doesExceedSize = doesAssetExceedSize(testImage, 2048)

            expect(doesExceedSize).toBeFalsy()
        })
    })

    describe('doesDocumentExceedSize', () => {
        it('should return true if a document exceeds the size in bytes', () => {
            const doesExceedSize = doesDocumentExceedSize(
                testContentDocument,
                1000,
            )

            expect(doesExceedSize).toBeTruthy()
        })

        it('should return false if a document does not exceed the size in bytes', () => {
            const doesExceedSize = doesDocumentExceedSize(
                testContentDocument,
                2048,
            )

            expect(doesExceedSize).toBeFalsy()
        })
    })
})
