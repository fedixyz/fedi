import { DocumentPickerResponse } from '@react-native-documents/picker'
import { TemporaryDirectoryPath } from 'react-native-fs'
import { Asset } from 'react-native-image-picker'

import {
    doesAssetExceedSize,
    doesDocumentExceedSize,
    makeRandomTempFilePath,
} from '../../utils/media'

const testDocument: DocumentPickerResponse = {
    uri: 'file:///Users/test/Documents/file.txt',
    name: 'file.txt',
    type: 'text/plain',
    size: 1024,
    error: null,
    nativeType: 'text/plain',
    isVirtual: null,
    convertibleToMimeTypes: [],
    hasRequestedType: true,
}

const testContentDocument: DocumentPickerResponse = {
    uri: 'content://com.android.providers.downloads.documents/document/file.txt',
    name: 'file.txt',
    type: 'text/plain',
    size: 1024,
    error: null,
    nativeType: 'text/plain',
    isVirtual: null,
    convertibleToMimeTypes: [],
    hasRequestedType: true,
}

const testLocalContentDocumentUri = 'file:///Users/documents/document/file.txt'

const testImage: Asset = {
    fileName: 'test.png',
    type: 'image/png',
    uri: 'file:///Users/images/test.png',
    fileSize: 1024,
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

jest.mock('@react-native-documents/picker', () => ({
    pick: async () => [testDocument],
    keepLocalCopy: jest.fn(async () => {
        return [
            {
                status: 'success',
                sourceUri: testDocument.uri,
                localUri: testLocalContentDocumentUri,
            },
        ]
    }),
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
