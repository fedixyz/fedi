import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import {
    changeAuthenticatedGuardian,
    selectActiveFederation,
    setChatGroups,
    setChatMembersSeen,
    setChatMessages,
    setLastFetchedMessageId,
} from '@fedi/common/redux'
import { LightningGateway } from '@fedi/common/types'
import {
    makeTransactionHistoryCSV,
    makeBase64CSVUri,
    makeCSVFilename,
} from '@fedi/common/utils/csv'
import { exportLogs } from '@fedi/common/utils/log'

import { Button } from '../../components/Button'
import { ContentBlock } from '../../components/ContentBlock'
import { Input } from '../../components/Input'
import * as Layout from '../../components/Layout'
import { RadioGroup } from '../../components/RadioGroup'
import { Text } from '../../components/Text'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'

function DeveloperPage() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const activeFederation = useAppSelector(selectActiveFederation)
    const authenticatedGuardian = useAppSelector(
        s => s.federation.authenticatedGuardian,
    )
    const [gateways, setGateways] = useState<LightningGateway[]>([])
    const [guardianPassword, setGuardianPassword] = useState('')
    const toast = useToast()

    const federationId = activeFederation?.id
    const federationNodes = activeFederation?.hasWallet
        ? activeFederation.nodes
        : undefined

    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    /* Logs */

    const handleDownloadLogs = useCallback(async () => {
        try {
            const logs = await exportLogs()
            // To download a log file, create a fake link and click it
            const hiddenElement = document.createElement('a')
            hiddenElement.href = `data:text/plain;charset=itf-8,${encodeURIComponent(
                logs,
            )}`
            hiddenElement.download = 'fedi.log'
            hiddenElement.click()
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [toast, t])

    /* TX history */

    const handleDownloadTxHistory = useCallback(async () => {
        try {
            if (!activeFederation) throw new Error('No active federation')
            const transactions = await fedimint.listTransactions(
                activeFederation.id,
            )
            // To download a CSV, create a fake link and click it
            const hiddenElement = document.createElement('a')
            hiddenElement.href = makeBase64CSVUri(
                makeTransactionHistoryCSV(
                    transactions,
                    makeFormattedAmountsFromMSats,
                ),
            )
            hiddenElement.download = makeCSVFilename(
                `transactions-${activeFederation.name}`,
            )
            hiddenElement.click()
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [toast, activeFederation, t, makeFormattedAmountsFromMSats])

    /* Lightning gateways */

    useEffect(() => {
        if (!federationId) return
        fedimint.listGateways(federationId).then(setGateways)
    }, [federationId])

    const gatewayOptions = useMemo(
        () =>
            gateways.map(gateway => ({
                label: gateway.api,
                value: gateway.gatewayId,
            })),
        [gateways],
    )

    const activeGatewayPubKey = gateways.find(g => g.active)?.nodePubKey

    const handleSelectGateway = useCallback(
        (nodePubKey: string) => {
            if (!federationId) return
            fedimint.switchGateway(nodePubKey, federationId)
            setGateways(gs =>
                gs.map(g => ({ ...g, active: g.nodePubKey === nodePubKey })),
            )
        },
        [federationId],
    )

    /* Authenticated guardian */

    const guardians = useMemo(() => {
        if (!federationNodes) return []
        return Object.entries(federationNodes).map(entry => {
            const [i, node] = entry
            const idx = Number(i)
            return {
                ...node,
                peerId: idx,
                password: `${idx + 1}${idx + 1}${idx + 1}${idx + 1}`,
            }
        })
    }, [federationNodes])

    const guardianOptions = useMemo(
        () => [
            { label: 'None', value: '' },
            ...guardians.map(g => ({ label: g.name, value: g.url })),
        ],
        [guardians],
    )

    const handleSelectGuardian = useCallback(
        (guardianUrl: string) => {
            const guardian = guardians.find(g => g.url === guardianUrl) || null
            dispatch(changeAuthenticatedGuardian(guardian))
        },
        [dispatch, guardians],
    )

    const handleSaveGuardianPassword = useCallback(() => {
        if (!authenticatedGuardian) return
        dispatch(
            changeAuthenticatedGuardian({
                ...authenticatedGuardian,
                password: guardianPassword,
            }),
        )
    }, [dispatch, authenticatedGuardian, guardianPassword])

    useEffect(() => {
        setGuardianPassword(authenticatedGuardian?.password || '')
    }, [authenticatedGuardian])

    /* Chat storage */

    const deleteMessages = useCallback(async () => {
        if (!federationId) return
        await dispatch(setChatMessages({ federationId, messages: [] }))
        await dispatch(
            setLastFetchedMessageId({
                federationId,
                lastFetchedMessageId: null,
            }),
        )
    }, [dispatch, federationId])

    const deleteGroups = useCallback(async () => {
        if (!federationId) return
        await dispatch(setChatGroups({ federationId, groups: [] }))
    }, [dispatch, federationId])

    const deleteMembers = useCallback(async () => {
        if (!federationId) return
        await dispatch(setChatMembersSeen({ federationId, membersSeen: [] }))
    }, [dispatch, federationId])

    const deleteAllChatData = useCallback(async () => {
        await deleteGroups()
        await deleteMembers()
        await deleteMessages()
    }, [deleteGroups, deleteMembers, deleteMessages])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>Developer Settings</Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Settings>
                        <Setting>
                            <Text>Lightning gateway</Text>
                            <RadioGroup
                                options={gatewayOptions}
                                value={activeGatewayPubKey}
                                onChange={handleSelectGateway}
                            />
                        </Setting>
                        <Setting>
                            <Text>Simulate guardian mode</Text>
                            <RadioGroup
                                options={guardianOptions}
                                value={authenticatedGuardian?.url || ''}
                                onChange={handleSelectGuardian}
                            />
                            {authenticatedGuardian && (
                                <>
                                    <Input
                                        label="Password"
                                        value={guardianPassword}
                                        onChange={ev =>
                                            setGuardianPassword(
                                                ev.currentTarget.value,
                                            )
                                        }
                                    />
                                    <Button
                                        onClick={handleSaveGuardianPassword}>
                                        Save password
                                    </Button>
                                </>
                            )}
                        </Setting>
                        <Setting>
                            <Text>{t('feature.developer.logs')}</Text>
                            <Button onClick={handleDownloadLogs}>
                                {t('feature.developer.download-logs')}
                            </Button>
                        </Setting>
                        <Setting>
                            <Text>{t('words.wallet')}</Text>
                            <Button onClick={handleDownloadTxHistory}>
                                {t('feature.developer.export-transactions-csv')}
                            </Button>
                        </Setting>
                        <Setting>
                            <Text>Chat storage</Text>
                            <Button variant="outline" onClick={deleteMessages}>
                                Delete messages
                            </Button>
                            <Button variant="outline" onClick={deleteGroups}>
                                Delete groups
                            </Button>
                            <Button variant="outline" onClick={deleteMembers}>
                                Delete members
                            </Button>
                            <Button onClick={deleteAllChatData}>
                                Delete all chat data
                            </Button>
                        </Setting>
                    </Settings>
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const Settings = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
})

const Setting = styled('label', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
})

export default DeveloperPage
