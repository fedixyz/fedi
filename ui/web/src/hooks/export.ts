import { useCallback, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { useCompressLogs } from '@fedi/common/hooks/compress-logs'
import { selectFedimintVersion, selectPwaVersion } from '@fedi/common/redux'
import {
    submitBugReport,
    uploadBugReportLogs,
} from '@fedi/common/utils/bug-report'
import { makeLog } from '@fedi/common/utils/log'

import { useAppSelector } from '../hooks'
import { readBridgeFile, getBridgeLogs, fedimint } from '../lib/bridge'
import { asyncLocalStorage } from '../utils/localstorage'

const log = makeLog('web/src/hooks/export')

export type Status = 'idle' | 'loading' | 'success' | 'error'

export const useShareLogs = () => {
    const [status, setStatus] = useState<Status>('idle')

    const fedimintVersion = useAppSelector(selectFedimintVersion)
    const pwaVersion = useAppSelector(selectPwaVersion)

    const handleCollectDbContents = async (path: string) => {
        const content = await readBridgeFile(path)

        return Buffer.from(content).toString('base64')
    }

    const handleCollectExtraFiles = () => ({
        'bridge.log': () => getBridgeLogs().then(file => file.text()),
        'info.txt': () => Promise.resolve(navigator.userAgent),
    })

    const { compressLogs } = useCompressLogs({
        storage: asyncLocalStorage,
        handleCollectDbContents,
        handleCollectExtraFiles,
        fedimint,
    })

    const collectAttachmentsAndSubmit = useCallback(
        async (sendDb: boolean, ticketNumber: string) => {
            const id = uuidv4()
            const ticket = ticketNumber.startsWith('#')
                ? ticketNumber
                : `#${ticketNumber}`

            setStatus('loading')
            try {
                const gzip = await compressLogs({ sendDb })

                await uploadBugReportLogs(id, gzip)

                await submitBugReport({
                    id,
                    ticketNumber: ticket,
                    platform: 'pwa',
                    appVersion: pwaVersion,
                    fedimintVersion,
                })

                setStatus('success')
            } catch (err) {
                log.error('Failed to generate attachment files', err)
                setStatus('error')
            }
        },
        [fedimintVersion, pwaVersion, compressLogs],
    )

    return { collectAttachmentsAndSubmit, status, setStatus }
}
