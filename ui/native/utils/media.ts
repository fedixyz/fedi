import {
    DocumentPickerOptions,
    DocumentPickerResponse,
    keepLocalCopy,
    pick,
} from '@react-native-documents/picker'
import { TFunction } from 'i18next'
import { ok, okAsync, ResultAsync } from 'neverthrow'
import { TemporaryDirectoryPath } from 'react-native-fs'
import {
    Asset,
    ImageLibraryOptions,
    launchImageLibrary,
} from 'react-native-image-picker'

import { MAX_FILE_SIZE, MAX_IMAGE_SIZE } from '@fedi/common/constants/matrix'
import { InputAttachment, InputMedia } from '@fedi/common/types'
import {
    GenericError,
    MissingDataError,
    UserError,
} from '@fedi/common/types/errors'
import { TaggedError } from '@fedi/common/utils/errors'
import { makeLog } from '@fedi/common/utils/log'
import {
    formatFileSize,
    pathJoin,
    prefixFileUri,
} from '@fedi/common/utils/media'
import { ensureNonNullish } from '@fedi/common/utils/neverthrow'

const log = makeLog('utils/media')

export function makeRandomTempFilePath(fileName: string) {
    const dirName = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const dirPath = pathJoin(TemporaryDirectoryPath, dirName)
    const path = pathJoin(dirPath, fileName)
    const uri = prefixFileUri(path)

    return { dirPath, uri, path }
}

/**
 * Converts a DocumentPickerResponse to a file URI.
 * Handles Android content URIs which may not have the filename in the URI.
 */
export function deriveCopyableFileUri({
    name,
    ...document
}: DocumentPickerResponse): ResultAsync<
    string,
    MissingDataError | GenericError
> {
    if (!name)
        return new TaggedError('MissingDataError')
            .withMessage(`expected document.name, got ${name}`)
            .intoErrAsync()

    if (document.uri.startsWith('content://')) {
        return ResultAsync.fromPromise(
            keepLocalCopy({
                files: [
                    {
                        uri: document.uri,
                        fileName: name,
                    },
                ],
                destination: 'cachesDirectory',
            }),
            e => new TaggedError('GenericError', e),
        )
            .andThen(([result]) => {
                if (result.status === 'success') return ok(result.localUri)

                return new TaggedError('GenericError')
                    .withMessage(result.copyError)
                    .intoErr()
            })
            .orTee(e => log.error(`Error copying document ${document.uri}`, e))
    }

    return okAsync(document.uri)
}

/**
 * Attempt to select assets with the ImagePicker.
 * If any assets exceed the maximum image size, short-circuit with a UserError.
 */
export function tryPickAssets(
    imageOptions: ImageLibraryOptions,
    t: TFunction,
): ResultAsync<Array<Asset>, MissingDataError | GenericError | UserError> {
    return ResultAsync.fromPromise(
        launchImageLibrary(imageOptions),
        e => new TaggedError('GenericError', e),
    )
        .andThen(library => {
            if (library.didCancel)
                return new TaggedError('UserError')
                    .withMessage('Image library cancelled')
                    .intoErr()

            return ok(library.assets)
        })
        .andThen(ensureNonNullish)
        .andThrough(assets => {
            const anyImageExceedsSize = assets
                .filter(asset => asset.type?.includes('image'))
                .some(asset => doesAssetExceedSize(asset, MAX_IMAGE_SIZE))
            const anyVideoExceedsSize = assets
                .filter(asset => asset.type?.includes('video'))
                .some(asset => doesAssetExceedSize(asset, MAX_FILE_SIZE))

            if (anyImageExceedsSize) {
                return new TaggedError('UserError')
                    .withMessage(
                        t('errors.images-may-not-exceed-size', {
                            size: formatFileSize(MAX_IMAGE_SIZE),
                        }),
                    )
                    .intoErr()
            }

            if (anyVideoExceedsSize) {
                return new TaggedError('UserError')
                    .withMessage(
                        t('errors.videos-may-not-exceed-size', {
                            size: formatFileSize(MAX_FILE_SIZE),
                        }),
                    )
                    .intoErr()
            }

            return ok()
        })
}

/**
 * Attempt to select documents with the DocumentPicker.
 * If any documents exceed the maximum file size, short-circuit with a UserError.
 */
export function tryPickDocuments(
    options: DocumentPickerOptions,
    t: TFunction,
): ResultAsync<Array<DocumentPickerResponse>, GenericError | UserError> {
    return ResultAsync.fromPromise(
        pick(options),
        e => new TaggedError('GenericError', e),
    ).andThrough(documents => {
        if (documents.some(doc => doesDocumentExceedSize(doc, MAX_FILE_SIZE))) {
            return new TaggedError('UserError')
                .withMessage(
                    t('errors.files-may-not-exceed-size', {
                        size: formatFileSize(MAX_FILE_SIZE),
                    }),
                )
                .intoErr()
        }

        return ok()
    })
}

export const doesAssetExceedSize = (
    { fileSize }: Asset,
    maxSizeBytes: number,
) => fileSize && fileSize > maxSizeBytes

export const doesDocumentExceedSize = (
    document: DocumentPickerResponse,
    maxSizeBytes: number,
) => document.size && document.size > maxSizeBytes

export const mapMixedMediaToMatrixInput = ({
    assets,
    documents,
}: {
    assets: Array<Asset>
    documents: Array<DocumentPickerResponse>
}) => {
    const allAttachments: Array<InputMedia | InputAttachment> = []

    for (const att of documents) {
        if (!att.name || !att.type) continue

        allAttachments.push({
            fileName: att.name,
            mimeType: att.type,
            uri: att.uri,
        })
    }

    for (const att of assets) {
        if (!att.fileName || !att.type || !att.uri || !att.width || !att.height)
            continue

        allAttachments.push({
            fileName: att.fileName,
            mimeType: att.type,
            uri: att.uri,
            width: att.width,
            height: att.height,
        })
    }

    return allAttachments
}
