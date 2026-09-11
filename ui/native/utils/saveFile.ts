import {
    errorCodes,
    isErrorWithCode,
    saveDocuments,
} from '@react-native-documents/picker'
import RNFS from 'react-native-fs'

import type { SaveFileRequest, SaveFileResult } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { pathJoin } from '@fedi/common/utils/media'

import i18n from '../localization/i18n'

export const MAX_MINI_APP_SAVE_FILE_BYTES = 10 * 1024 * 1024

let saveInProgress = false
const log = makeLog('native/utils/saveFile')

function getSafeErrorCode(error: unknown): string {
    const code = isErrorWithCode(error) ? error.code : undefined
    return typeof code === 'string' &&
        [
            ...Object.values(errorCodes),
            'OTHER_PRESENTING_ERROR',
            'ENOSPC',
            'EACCES',
            'ENOENT',
            'EIO',
        ].includes(code)
        ? code
        : 'UNKNOWN'
}

// Stop at the limit without allocating a UTF-8 copy of the contents.
function exceedsUtf8ByteLimit(value: string, limit: number): boolean {
    let bytes = 0

    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index)

        if (codeUnit <= 0x7f) {
            bytes += 1
        } else if (codeUnit <= 0x7ff) {
            bytes += 2
        } else if (
            codeUnit >= 0xd800 &&
            codeUnit <= 0xdbff &&
            index + 1 < value.length
        ) {
            const nextCodeUnit = value.charCodeAt(index + 1)
            if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
                bytes += 4
                index += 1
            } else {
                bytes += 3
            }
        } else {
            bytes += 3
        }

        if (bytes > limit) {
            return true
        }
    }

    return false
}

export async function saveFile(
    request: SaveFileRequest,
): Promise<SaveFileResult> {
    if (!request || typeof request !== 'object') {
        throw new Error(i18n.t('errors.save-file-invalid-request'))
    }
    const { filename, mimeType, contents } = request
    if (
        typeof filename !== 'string' ||
        filename.length === 0 ||
        filename === '.' ||
        filename === '..' ||
        /[\\/\0]/.test(filename)
    ) {
        throw new Error(i18n.t('errors.save-file-invalid-filename'))
    }
    if (typeof mimeType !== 'string' || mimeType.length === 0) {
        throw new Error(i18n.t('errors.save-file-invalid-mime-type'))
    }
    if (typeof contents !== 'string') {
        throw new Error(i18n.t('errors.save-file-invalid-contents'))
    }
    // Android's document picker treats zero-byte copies as failures.
    if (contents.length === 0) {
        throw new Error(i18n.t('errors.save-file-empty'))
    }
    if (exceedsUtf8ByteLimit(contents, MAX_MINI_APP_SAVE_FILE_BYTES)) {
        throw new Error(i18n.t('errors.save-file-too-large'))
    }
    if (saveInProgress) {
        throw new Error(i18n.t('errors.save-file-in-progress'))
    }

    const temporaryDirectory = pathJoin(
        RNFS.TemporaryDirectoryPath,
        `mini-app-save-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    const temporaryPath = pathJoin(temporaryDirectory, filename)
    let sourceUri: string
    try {
        sourceUri = `file://${temporaryPath
            .split('/')
            .map(segment => encodeURIComponent(segment))
            .join('/')}`
    } catch {
        throw new Error(i18n.t('errors.save-file-invalid-filename'))
    }

    saveInProgress = true
    let stage: 'prepare' | 'picker' | 'metadata' = 'prepare'

    try {
        await RNFS.mkdir(temporaryDirectory)
        await RNFS.writeFile(temporaryPath, contents, 'utf8')
        stage = 'picker'
        const [result] = await saveDocuments({
            sourceUris: [sourceUri],
            mimeType,
            fileName: filename,
            copy: true,
        })
        stage = 'metadata'

        if (result.error) {
            throw new Error(i18n.t('errors.save-file-unconfirmed'))
        }

        return 'saved'
    } catch (error) {
        const code = getSafeErrorCode(error)
        if (code === errorCodes.OPERATION_CANCELED) {
            return 'cancelled'
        }
        log.warn('File save failed', { stage, code })
        if (stage === 'prepare') {
            throw new Error(i18n.t('errors.save-file-prepare-failed'))
        }
        if (
            stage === 'picker' &&
            [
                errorCodes.IN_PROGRESS,
                errorCodes.UNABLE_TO_OPEN_FILE_TYPE,
                errorCodes.NULL_PRESENTER,
                'OTHER_PRESENTING_ERROR',
            ].includes(code)
        ) {
            throw new Error(i18n.t('errors.save-file-picker-unavailable'))
        }
        throw new Error(
            i18n.t(
                stage === 'metadata'
                    ? 'errors.save-file-unconfirmed'
                    : 'errors.save-file-failed',
            ),
        )
    } finally {
        try {
            await RNFS.unlink(temporaryDirectory)
        } catch (error) {
            // The save result is authoritative; temporary-file cleanup is best effort.
            log.warn('Temporary save file cleanup failed', {
                code: getSafeErrorCode(error),
            })
        }
        saveInProgress = false
    }
}
