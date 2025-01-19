import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import Share from 'react-native-share'
import { v4 as uuidv4 } from 'uuid'

import { useToast } from '@fedi/common/hooks/toast'
import {
    useExportTransactions,
    useTransactionHistory,
} from '@fedi/common/hooks/transactions'
import { generateReusedEcashProofs } from '@fedi/common/redux'
import { selectActiveFederation } from '@fedi/common/redux/federation'
import { LoadedFederation } from '@fedi/common/types'
import {
    submitBugReport,
    uploadBugReportLogs,
} from '@fedi/common/utils/bug-report'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../bridge'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import { dumpDB } from '../device-info'
import { generateLogsExportGzip } from '../log'

export const useNativeExport = () => {
    const exportTransactions = useExportTransactions(fedimint)
    const [exportingFederationId, setExportingFederationId] =
        useState<string>('')
    const toast = useToast()
    const { t } = useTranslation()

    const log = makeLog('Settings/export')

    const exportTransactionsAsCsv = useCallback(
        async (federation: LoadedFederation) => {
            setExportingFederationId(federation.id)

            const res = await exportTransactions(federation)

            if (res.success) {
                try {
                    await Share.open({
                        filename:
                            Platform.OS === 'android'
                                ? res.fileName.slice(0, -4)
                                : res.fileName,
                        type: 'text/csv',
                        url: res.uri,
                    })
                } catch {
                    /* no-op */
                }
            } else {
                log.error('error', res.message)
                toast.show({
                    content: t('errors.failed-to-fetch-transactions'),
                    status: 'error',
                })
            }

            setExportingFederationId('')
        },
        [exportTransactions, t, toast, log],
    )

    return { exportTransactionsAsCsv, exportingFederationId }
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
    const [status, setStatus] = useState<Status>('idle')

    const { fetchTransactions } = useTransactionHistory(fedimint)

    const log = makeLog('ShareLogs')

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
                })

                return true // success
            } catch (err) {
                log.error('Failed to generate attachment files', err)
                toast.error(t, err)
                setStatus('idle')
                return false // failed
            }
        },
        [dispatch, activeFederation, fetchTransactions, t, toast, log],
    )

    return { collectAttachmentsAndSubmit, status, setStatus }
}
