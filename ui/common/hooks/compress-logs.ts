import { useCallback } from 'react'

import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import {
    generateReusedEcashProofs,
    selectNostrNpub,
    selectActiveFederation,
} from '@fedi/common/redux'
import {
    exportLegacyUiLogs,
    exportUiLogs,
    makeLog,
} from '@fedi/common/utils/log'

import { StorageApi } from '../types'
import { FedimintBridge } from '../utils/fedimint'
import { makeTarGz, File } from '../utils/targz'
import { useCommonDispatch, useCommonSelector } from './redux'

const log = makeLog('common/hooks/compress-logs')

export const useCompressLogs = ({
    fedimint,
    storage,
    handleCollectDbContents,
    handleCollectExtraFiles,
}: {
    fedimint: FedimintBridge
    storage: StorageApi
    handleCollectDbContents: (path: string) => Promise<string>
    handleCollectExtraFiles: () => Record<string, () => Promise<string>>
}) => {
    const dispatch = useCommonDispatch()
    const activeFederation = useCommonSelector(selectActiveFederation)
    const npub = useCommonSelector(selectNostrNpub)

    const { fetchTransactions } = useTransactionHistory(fedimint)

    const compressLogs = useCallback(
        ({ sendDb }: { sendDb: boolean }) => {
            const attachmentPromiseMap: Record<string, Promise<string>> = {}

            if (activeFederation?.hasWallet) {
                if (sendDb) {
                    attachmentPromiseMap['db.dump'] = (async () => {
                        const dbPath = await fedimint.dumpDb({
                            federationId: activeFederation.id,
                        })
                        return await handleCollectDbContents(dbPath)
                    })()

                    if (!activeFederation.recovering)
                        attachmentPromiseMap['proofs.json'] = dispatch(
                            generateReusedEcashProofs({ fedimint }),
                        )
                            .unwrap()
                            .then(proofs => JSON.stringify(proofs, null, 2))
                }

                if (!activeFederation.recovering)
                    attachmentPromiseMap['transactions.json'] =
                        fetchTransactions({
                            limit: 10,
                        }).then(transactions =>
                            JSON.stringify(transactions.slice(0, 10), null, 2),
                        )
            }

            if (npub)
                attachmentPromiseMap['nostr-npub.txt'] = Promise.resolve(
                    npub.npub,
                )

            attachmentPromiseMap['legacy-ui-logs.txt'] =
                exportLegacyUiLogs(storage)
            attachmentPromiseMap['ui-logs.txt'] = exportUiLogs()

            for (const [fileName, filePromise] of Object.entries(
                handleCollectExtraFiles(),
            )) {
                attachmentPromiseMap[fileName] = filePromise()
            }

            const tryCollectAttachments = async () => {
                const attachmentFiles: Array<File> = []

                for (const [fileName, filePromise] of Object.entries(
                    attachmentPromiseMap,
                )) {
                    await filePromise
                        .then(content =>
                            attachmentFiles.push({
                                name: fileName,
                                content,
                            }),
                        )
                        .catch(err =>
                            log.error(
                                `Failed to collect file ${fileName} for export`,
                                err,
                            ),
                        )
                }

                return attachmentFiles
            }

            return tryCollectAttachments().then(makeTarGz)
        },
        [
            activeFederation,
            dispatch,
            fedimint,
            fetchTransactions,
            storage,
            npub,
            handleCollectExtraFiles,
            handleCollectDbContents,
        ],
    )

    return { compressLogs }
}
