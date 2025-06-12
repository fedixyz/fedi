import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import Share from 'react-native-share'
import { v4 as uuidv4 } from 'uuid'

import { useToast } from '@fedi/common/hooks/toast'
import {
    ExportResult,
    useExportMultispendTransactions,
    useExportTransactions,
    useTransactionHistory,
} from '@fedi/common/hooks/transactions'
import {
    generateReusedEcashProofs,
    selectFedimintVersion,
    selectNostrNpub,
} from '@fedi/common/redux'
import { selectActiveFederation } from '@fedi/common/redux/federation'
import {
    LoadedFederation,
    MatrixRoom,
    MatrixRoomMember,
    MultispendActiveInvitation,
    MultispendFinalized,
} from '@fedi/common/types'
import {
    submitBugReport,
    uploadBugReportLogs,
} from '@fedi/common/utils/bug-report'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../bridge'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import { dumpDB } from '../device-info'
import { generateLogsExportGzip } from '../log'

const exportLogger = makeLog('native/utils/hooks/export/useNativeExport')
const shareLogger = makeLog('native/utils/hooks/export/useShareLogs')

/**
 * for exporting federation and multispend transactions via native share
 */
export const useNativeExport = () => {
    const toast = useToast()
    const { t } = useTranslation()
    const [isExporting, setIsExporting] = useState(false)
    const exportTransactions = useExportTransactions(fedimint, t)
    const exportMultispendTransactions = useExportMultispendTransactions(t)

    const exportData = useCallback(
        async (exportFunction: () => Promise<ExportResult>) => {
            setIsExporting(true)

            try {
                const result = await exportFunction()

                if (result.success) {
                    try {
                        await Share.open({
                            filename:
                                Platform.OS === 'android'
                                    ? result.fileName.slice(0, -4)
                                    : result.fileName,
                            type: 'text/csv',
                            url: result.uri,
                        })
                    } catch (error) {
                        // User cancelled share dialog - not an error
                        exportLogger.info('Share cancelled by user')
                    }
                } else {
                    exportLogger.error('Share failed', result.message)
                    toast.show({
                        content: t('errors.failed-to-fetch-transactions'),
                        status: 'error',
                    })
                }
            } catch (error) {
                exportLogger.error('Export failed', error)
                toast.show({
                    content: t('errors.failed-to-fetch-transactions'),
                    status: 'error',
                })
            } finally {
                setIsExporting(false)
            }
        },
        [t, toast],
    )

    const exportTransactionsAsCsv = async (federation: LoadedFederation) => {
        await exportData(() => exportTransactions(federation))
    }

    const exportMultispendTransactionsAsCsv = async (
        room: MatrixRoom,
        multispendStatus?:
            | MultispendActiveInvitation
            | MultispendFinalized
            | undefined,
        roomMembers?: MatrixRoomMember[],
    ) => {
        await exportData(() =>
            exportMultispendTransactions(room, multispendStatus, roomMembers),
        )
    }

    return {
        exportTransactionsAsCsv,
        exportMultispendTransactionsAsCsv,
        isExporting,
    }
}

export type Status =
    | 'idle'
    | 'generating-data'
    | 'uploading-data'
    | 'submitting-report'

/**
 * Hook for collecting attachments for uploading logs with a bug report
 */
export const useShareLogs = () => {
    const dispatch = useAppDispatch()
    const toast = useToast()
    const { t } = useTranslation()
    const activeFederation = useAppSelector(selectActiveFederation)
    const npub = useAppSelector(selectNostrNpub)
    const [status, setStatus] = useState<Status>('idle')

    const fedimintVersion = useAppSelector(selectFedimintVersion)

    const { fetchTransactions } = useTransactionHistory(fedimint)

    const collectAttachmentsAndSubmit = useCallback(
        async (sendDb: boolean, ticketNumber: string) => {
            const attachmentFiles = []
            const id = uuidv4()
            setStatus('generating-data')
            try {
                if (sendDb) {
                    const db = await dumpDB(fedimint, activeFederation?.id)
                    if (db) {
                        attachmentFiles.push(db)
                    }
                    // Share ecash proofs when DB is shared
                    // if reused ecash is detected
                    const proofs = await dispatch(
                        generateReusedEcashProofs({
                            fedimint,
                        }),
                    ).unwrap()
                    if (proofs.length > 0) {
                        attachmentFiles.push({
                            name: 'proofs.json',
                            content: JSON.stringify(proofs, null, 2),
                        })
                    }
                }
                const transactions = await fetchTransactions({ limit: 10 })

                // Attach the ten latest transactions to attachmentFiles
                attachmentFiles.push({
                    name: 'transactions.json',
                    content: JSON.stringify(transactions.slice(0, 10), null, 2),
                })

                if (npub) {
                    attachmentFiles.push({
                        name: 'nostr-npub.txt',
                        content: npub.npub,
                    })
                }

                const gzip = await generateLogsExportGzip(attachmentFiles)
                // Upload the logs export gzip to storage
                setStatus('uploading-data')
                await uploadBugReportLogs(id, gzip)
                // Submit bug report
                setStatus('submitting-report')

                const ticket = ticketNumber.startsWith('#')
                    ? ticketNumber
                    : `#${ticketNumber}`

                await submitBugReport({
                    id,
                    ticketNumber: ticket,
                    platform: `${DeviceInfo.getApplicationName()} (${Platform.OS})`,
                    appVersion: DeviceInfo.getVersion(),
                    fedimintVersion,
                })

                return true // success
            } catch (err) {
                shareLogger.error('Failed to generate attachment files', err)
                toast.error(t, err)
                setStatus('idle')
                return false // failed
            }
        },
        [
            dispatch,
            activeFederation,
            fetchTransactions,
            t,
            toast,
            npub,
            fedimintVersion,
        ],
    )

    return { collectAttachmentsAndSubmit, status, setStatus }
}
