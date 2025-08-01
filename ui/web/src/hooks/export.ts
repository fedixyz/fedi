import { useCallback, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import {
    generateReusedEcashProofs,
    selectFedimintVersion,
    selectNostrNpub,
    selectPwaVersion,
} from '@fedi/common/redux'
import { selectActiveFederation } from '@fedi/common/redux/federation'
import {
    submitBugReport,
    uploadBugReportLogs,
} from '@fedi/common/utils/bug-report'
import { exportUiLogs, makeLog } from '@fedi/common/utils/log'
import { makeTarGz } from '@fedi/common/utils/targz'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint, readBridgeFile, getBridgeLogs } from '../lib/bridge'

export type Status = 'idle' | 'loading' | 'success' | 'error'

export const useShareLogs = () => {
    const dispatch = useAppDispatch()
    const activeFederation = useAppSelector(selectActiveFederation)
    const npub = useAppSelector(selectNostrNpub)

    const [status, setStatus] = useState<Status>('idle')

    const fedimintVersion = useAppSelector(selectFedimintVersion)
    const pwaVersion = useAppSelector(selectPwaVersion)

    const { fetchTransactions } = useTransactionHistory(fedimint)

    const log = makeLog('ShareLogs')

    const collectAttachmentsAndSubmit = useCallback(
        async (sendDb: boolean, ticketNumber: string) => {
            const attachmentFiles = []
            const id = uuidv4()

            setStatus('loading')
            try {
                const jsLogs = await exportUiLogs()

                attachmentFiles.push({
                    name: 'app.log',
                    content: jsLogs,
                })

                // Ensure this is a federation with a wallet
                if (activeFederation?.hasWallet) {
                    const transactions = await fetchTransactions({ limit: 10 })

                    // Attach the ten latest transactions to attachmentFiles
                    attachmentFiles.push({
                        name: 'transactions.json',
                        content: JSON.stringify(
                            transactions.slice(0, 10),
                            null,
                            2,
                        ),
                    })
                }

                if (npub) {
                    attachmentFiles.push({
                        name: 'nostr-npub.txt',
                        content: npub.npub,
                    })
                }

                if (sendDb) {
                    if (!activeFederation) {
                        log.warn(
                            'Cannot include DB dump, no active federation is selected',
                        )
                    } else {
                        const dumpedDbPath = await fedimint.dumpDb({
                            federationId: activeFederation.id,
                        })
                        const content = await readBridgeFile(dumpedDbPath)

                        attachmentFiles.push({
                            name: 'db.dump',
                            content: Buffer.from(content).toString('base64'),
                        })
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

                // Bridge logs
                const bridgeLogFiles = await getBridgeLogs()
                const bridgeLogs = await Promise.allSettled(
                    bridgeLogFiles.map(x => x.text()),
                ).then(result =>
                    result
                        .filter(x => x.status === 'fulfilled')
                        .map(x => x.value)
                        .join(),
                )

                attachmentFiles.push({
                    name: 'bridge.log',
                    content: bridgeLogs,
                })

                // Add device info
                if (navigator?.userAgent) {
                    attachmentFiles.push({
                        name: 'info.txt',
                        content: navigator.userAgent,
                    })
                }

                const gzip = await makeTarGz(attachmentFiles)

                await uploadBugReportLogs(id, gzip)

                const ticket = ticketNumber.startsWith('#')
                    ? ticketNumber
                    : `#${ticketNumber}`

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
        [
            activeFederation,
            dispatch,
            fedimintVersion,
            fetchTransactions,
            log,
            npub,
            pwaVersion,
        ],
    )

    return { collectAttachmentsAndSubmit, status, setStatus }
}
