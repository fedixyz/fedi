import { errorCodes, saveDocuments } from '@react-native-documents/picker'
import RNFS from 'react-native-fs'

import type { SaveFileRequest } from '@fedi/common/types'

import i18n from '../../../localization/i18n'
import { MAX_MINI_APP_SAVE_FILE_BYTES, saveFile } from '../../../utils/saveFile'

const mockRNFS = RNFS as jest.Mocked<typeof RNFS>
const mockSaveDocuments = jest.mocked(saveDocuments)
const mockWarn = jest.fn()

jest.mock('@fedi/common/utils/log', () => ({
    makeLog: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}))

const request = {
    filename: 'badge-issuer-authority.json',
    mimeType: 'application/json',
    contents: '{"issuer":"example"}',
}

describe('saveFile', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(Date, 'now').mockReturnValue(123)
        jest.spyOn(Math, 'random').mockReturnValue(0.5)
        mockRNFS.mkdir.mockResolvedValue(undefined)
        mockRNFS.writeFile.mockResolvedValue(undefined)
        mockRNFS.unlink.mockResolvedValue(undefined)
        mockSaveDocuments.mockResolvedValue([
            {
                uri: 'content://saved/file',
                name: request.filename,
                error: null,
            },
        ])
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should report success only after the picker writes the file', async () => {
        mockSaveDocuments.mockResolvedValue([
            {
                uri: 'content://saved/file',
                name: request.filename,
                error: null,
            },
        ])

        await expect(saveFile(request)).resolves.toBe('saved')

        const temporaryDirectory = '/tmp/mini-app-save-123-i'
        const temporaryPath = `${temporaryDirectory}/${request.filename}`
        expect(mockRNFS.writeFile).toHaveBeenCalledWith(
            temporaryPath,
            request.contents,
            'utf8',
        )
        expect(mockSaveDocuments).toHaveBeenCalledWith({
            sourceUris: [`file://${temporaryPath}`],
            mimeType: request.mimeType,
            fileName: request.filename,
            copy: true,
        })
        expect(mockRNFS.unlink).toHaveBeenCalledWith(temporaryDirectory)
    })

    it('should accept contents at the UTF-8 byte limit', async () => {
        const boundaryContents = 'é'.repeat(MAX_MINI_APP_SAVE_FILE_BYTES / 2)
        mockSaveDocuments.mockResolvedValue([
            {
                uri: 'content://saved/file',
                name: request.filename,
                error: null,
            },
        ])

        await expect(
            saveFile({ ...request, contents: boundaryContents }),
        ).resolves.toBe('saved')
        expect(mockRNFS.writeFile).toHaveBeenCalledWith(
            expect.any(String),
            boundaryContents,
            'utf8',
        )
    })

    it('should reject contents over the UTF-8 byte limit before writing', async () => {
        const oversizedContents =
            'é'.repeat(MAX_MINI_APP_SAVE_FILE_BYTES / 2) + 'a'

        await expect(
            saveFile({ ...request, contents: oversizedContents }),
        ).rejects.toThrow(i18n.t('errors.save-file-too-large'))
        expect(mockRNFS.mkdir).not.toHaveBeenCalled()
        expect(mockRNFS.writeFile).not.toHaveBeenCalled()
        expect(mockSaveDocuments).not.toHaveBeenCalled()
    })

    it('should reject empty files before opening the picker', async () => {
        await expect(saveFile({ ...request, contents: '' })).rejects.toThrow(
            i18n.t('errors.save-file-empty'),
        )
        expect(mockRNFS.mkdir).not.toHaveBeenCalled()
        expect(mockRNFS.writeFile).not.toHaveBeenCalled()
        expect(mockSaveDocuments).not.toHaveBeenCalled()
        await expect(saveFile(request)).resolves.toBe('saved')
    })

    it('should reject concurrent save requests', async () => {
        let resolveWrite: () => void = () => undefined
        const pendingWrite = new Promise<void>(resolve => {
            resolveWrite = resolve
        })
        mockRNFS.writeFile.mockReturnValue(pendingWrite)
        mockSaveDocuments.mockResolvedValue([
            {
                uri: 'content://saved/file',
                name: request.filename,
                error: null,
            },
        ])

        const firstSave = saveFile(request)
        await expect(saveFile(request)).rejects.toThrow(
            'A file save is already in progress',
        )

        resolveWrite()
        await expect(firstSave).resolves.toBe('saved')
        expect(mockRNFS.mkdir).toHaveBeenCalledTimes(1)
    })

    it('should report cancellation without claiming the file was saved', async () => {
        mockSaveDocuments.mockRejectedValue({
            code: errorCodes.OPERATION_CANCELED,
        })

        await expect(saveFile(request)).resolves.toBe('cancelled')
        expect(mockRNFS.unlink).toHaveBeenCalled()
    })

    it('should reject picker write failures', async () => {
        mockSaveDocuments.mockResolvedValue([
            {
                uri: 'content://saved/file',
                name: request.filename,
                error: 'copy failed',
            },
        ])

        await expect(saveFile(request)).rejects.toThrow(
            i18n.t('errors.save-file-unconfirmed'),
        )
    })

    it('should reject filenames that can escape the temporary directory', async () => {
        await expect(
            saveFile({ ...request, filename: '../authority.json' }),
        ).rejects.toThrow('Invalid filename')
        expect(mockRNFS.mkdir).not.toHaveBeenCalled()
    })

    it.each(['\ud800.json', '\udc00.json'])(
        'should allow another save after rejecting malformed filename %p',
        async filename => {
            await expect(saveFile({ ...request, filename })).rejects.toThrow(
                i18n.t('errors.save-file-invalid-filename'),
            )
            expect(mockRNFS.mkdir).not.toHaveBeenCalled()
            await expect(saveFile(request)).resolves.toBe('saved')
        },
    )

    it('should keep the source file and save lock until the picker finishes', async () => {
        let resolvePicker!: (
            value: Awaited<ReturnType<typeof saveDocuments>>,
        ) => void
        let pickerOpened!: () => void
        const opened = new Promise<void>(resolve => {
            pickerOpened = resolve
        })
        mockSaveDocuments.mockImplementationOnce(() => {
            pickerOpened()
            return new Promise(resolve => {
                resolvePicker = resolve
            })
        })
        const settled = jest.fn()
        const saving = saveFile(request).then(settled)

        await opened
        expect(settled).not.toHaveBeenCalled()
        expect(mockRNFS.unlink).not.toHaveBeenCalled()
        await expect(saveFile(request)).rejects.toThrow(
            'A file save is already in progress',
        )

        resolvePicker([
            {
                uri: 'content://saved/file',
                name: request.filename,
                error: null,
            },
        ])
        await saving
        expect(settled).toHaveBeenCalledWith('saved')
        expect(mockRNFS.unlink).toHaveBeenCalled()
        await expect(saveFile(request)).resolves.toBe('saved')
    })

    it.each(['mkdir', 'writeFile'] as const)(
        'should release the save lock after %s fails',
        async operation => {
            mockRNFS[operation].mockRejectedValueOnce({
                code: 'ENOSPC',
                message: `No space for ${request.filename}`,
            })

            await expect(saveFile(request)).rejects.toThrow(
                i18n.t('errors.save-file-prepare-failed'),
            )
            expect(mockWarn).toHaveBeenCalledWith('File save failed', {
                stage: 'prepare',
                code: 'ENOSPC',
            })
            expect(mockSaveDocuments).not.toHaveBeenCalled()
            expect(mockRNFS.unlink).toHaveBeenCalled()
            await expect(saveFile(request)).resolves.toBe('saved')
        },
    )

    it('should preserve the result and release the lock when cleanup fails', async () => {
        mockRNFS.unlink.mockRejectedValueOnce({
            code: 'EACCES',
            message: `Cannot remove ${request.filename}`,
        })

        await expect(saveFile(request)).resolves.toBe('saved')
        expect(mockWarn).toHaveBeenCalledWith(
            'Temporary save file cleanup failed',
            { code: 'EACCES' },
        )
        await expect(saveFile(request)).resolves.toBe('saved')
    })

    it.each([null, undefined, 'not a request'])(
        'should reject malformed request %p before touching storage',
        async malformed => {
            await expect(
                saveFile(malformed as unknown as SaveFileRequest),
            ).rejects.toThrow(i18n.t('errors.save-file-invalid-request'))
            expect(mockRNFS.mkdir).not.toHaveBeenCalled()
        },
    )

    it('should ask callers to check the destination after a metadata error', async () => {
        mockSaveDocuments.mockResolvedValueOnce([
            {
                uri: 'content://saved/file',
                name: null,
                error: 'Could not read file metadata',
            },
        ])

        await expect(saveFile(request)).rejects.toThrow(
            i18n.t('errors.save-file-unconfirmed'),
        )
        await expect(saveFile(request)).resolves.toBe('saved')
    })

    it('should replace native picker errors with a translatable message', async () => {
        mockSaveDocuments.mockRejectedValueOnce(
            new Error('Native provider error'),
        )

        await expect(saveFile(request)).rejects.toThrow(
            i18n.t('errors.save-file-failed'),
        )
        await expect(saveFile(request)).resolves.toBe('saved')
    })

    it.each([
        errorCodes.IN_PROGRESS,
        errorCodes.UNABLE_TO_OPEN_FILE_TYPE,
        errorCodes.NULL_PRESENTER,
        'OTHER_PRESENTING_ERROR',
    ])(
        'should report picker startup failure %s without a destination',
        async code => {
            mockSaveDocuments.mockRejectedValueOnce({ code })

            await expect(saveFile(request)).rejects.toThrow(
                i18n.t('errors.save-file-picker-unavailable'),
            )
            expect(mockWarn).toHaveBeenCalledWith('File save failed', {
                stage: 'picker',
                code,
            })
            await expect(saveFile(request)).resolves.toBe('saved')
        },
    )

    it('should exclude provider-controlled error details from logs', async () => {
        mockSaveDocuments.mockRejectedValueOnce({
            code: request.contents,
            message: request.filename,
        })

        await expect(saveFile(request)).rejects.toThrow(
            i18n.t('errors.save-file-failed'),
        )
        expect(mockWarn.mock.calls).toEqual([
            ['File save failed', { stage: 'picker', code: 'UNKNOWN' }],
        ])
    })

    it('should normalize a temporary directory with a trailing slash', async () => {
        jest.replaceProperty(RNFS, 'TemporaryDirectoryPath', '/tmp/')

        await expect(saveFile(request)).resolves.toBe('saved')
        expect(mockRNFS.writeFile).toHaveBeenCalledWith(
            `/tmp/mini-app-save-123-i/${request.filename}`,
            request.contents,
            'utf8',
        )
    })
})
