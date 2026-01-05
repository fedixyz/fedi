import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import { readFile } from 'react-native-fs'
import Share from 'react-native-share'
import { v4 as uuidv4 } from 'uuid'

import { useCompressLogs } from '@fedi/common/hooks/compress-logs'
import { useToast } from '@fedi/common/hooks/toast'
import {
    ExportResult,
    useExportMultispendTransactions,
    useExportTransactions,
} from '@fedi/common/hooks/transactions'
import { selectFedimintVersion } from '@fedi/common/redux'
import {
    Federation,
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
import { useAppSelector } from '../../state/hooks'
import { getAllDeviceInfo } from '../device-info'
import { exportBridgeLogs } from '../log'
import { storage } from '../storage'

const exportLogger = makeLog('native/utils/hooks/export/useNativeExport')
const shareLogger = makeLog('native/utils/hooks/export/useShareLogs')

/**
 * for exporting federation and multispend transactions via native share
 */
export const useNativeExport = (federationId?: Federation['id']) => {
    const toast = useToast()
    const { t } = useTranslation()
    const [isExporting, setIsExporting] = useState(false)
    const exportTransactions = useExportTransactions(t, federationId || '')
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

export const useCompressNativeLogs = (federationId?: Federation['id']) => {
    const handleCollectDbContents = (path: string) => readFile(path, 'base64')

    const handleCollectExtraFiles = () => ({
        'bridge.log': exportBridgeLogs,
        'info.json': async () => {
            const infoJson = await getAllDeviceInfo()

            return JSON.stringify(infoJson, null, 2)
        },
    })

    return useCompressLogs({
        storage,
        handleCollectDbContents,
        handleCollectExtraFiles,
        federationId,
        fedimint,
    })
}

export const useShareNativeLogs = (federationId?: Federation['id']) => {
    const [status, setStatus] =
        useState<Extract<Status, 'idle' | 'generating-data'>>('idle')

    const { compressLogs } = useCompressNativeLogs(federationId)

    const shareLogs = useCallback(async () => {
        const filename = `fedi-logs-${Math.floor(Date.now() / 1000)}.tar.gz`

        setStatus('idle')

        try {
            setStatus('generating-data')

            const gzip = await compressLogs({ sendDb: false })

            await Share.open({
                title: 'Fedi logs',
                url: `data:application/tar+gzip;base64,${gzip.toString('base64')}`,
                filename: filename,
                type: 'application/tar+gzip',
            })
        } catch (e) {
            shareLogger.error('Error sharing logs', e)
        } finally {
            // Ignores errors thrown by `Share.open`
            // the most probable outcome is the user aborting
            setStatus('idle')
        }
    }, [compressLogs])

    return { shareLogs, status }
}

/**
 * Hook for collecting attachments for uploading logs with a bug report
 */
export const useSubmitLogs = (federationId?: Federation['id']) => {
    const [status, setStatus] = useState<Status>('idle')
    const fedimintVersion = useAppSelector(selectFedimintVersion)
    const { compressLogs } = useCompressNativeLogs(federationId)

    const collectAttachmentsAndSubmit = useCallback(
        async (sendDb: boolean, ticketNumber: string) => {
            const id = uuidv4()
            const ticket = ticketNumber.startsWith('#')
                ? ticketNumber
                : `#${ticketNumber}`

            setStatus('generating-data')

            try {
                const gzip = await compressLogs({ sendDb })

                setStatus('uploading-data')

                await uploadBugReportLogs(id, gzip)

                setStatus('submitting-report')

                await submitBugReport({
                    id,
                    ticketNumber: ticket,
                    platform: `${DeviceInfo.getApplicationName()} (${Platform.OS})`,
                    appVersion: DeviceInfo.getVersion(),
                    fedimintVersion,
                })

                return true // success
            } catch (err) {
                setStatus('idle')
                exportLogger.error('Failed to generate attachment files', err)
                return false // failed
            }
        },
        [compressLogs, fedimintVersion],
    )

    return { collectAttachmentsAndSubmit, status, setStatus }
}
