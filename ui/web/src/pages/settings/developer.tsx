import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import {
    changeAuthenticatedGuardian,
    clearAllMiniAppSessions,
    resetNuxSteps,
    resetSurveyCompletions,
    selectPaymentFederation,
    setSurveyTimestamp,
} from '@fedi/common/redux'
import { LightningGateway } from '@fedi/common/types'
import {
    makeBase64CSVUri,
    makeCSVFilename,
    makeTransactionHistoryCSV,
} from '@fedi/common/utils/csv'
import { exportUiLogs } from '@fedi/common/utils/log'

import { Button } from '../../components/Button'
import { FederationWalletSelector } from '../../components/FederationWalletSelector'
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
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const authenticatedGuardian = useAppSelector(
        s => s.federation.authenticatedGuardian,
    )
    const [gateways, setGateways] = useState<LightningGateway[]>([])
    const [guardianPassword, setGuardianPassword] = useState('')
    const toast = useToast()

    const federationId = paymentFederation?.id
    const federationNodes = paymentFederation?.nodes

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })

    /* Logs */

    const handleDownloadLogs = useCallback(async () => {
        try {
            const logs = await exportUiLogs()
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
            if (!paymentFederation) throw new Error('No payment federation')
            const transactions = await fedimint.listTransactions(
                paymentFederation.id,
            )
            const refinedTransactions = transactions
                .filter(entry => 'Ok' in entry)
                .map(entry => entry.Ok)

            // To download a CSV, create a fake link and click it
            const hiddenElement = document.createElement('a')
            hiddenElement.href = makeBase64CSVUri(
                makeTransactionHistoryCSV(
                    refinedTransactions,
                    makeFormattedAmountsFromMSats,
                    t,
                ),
            )
            hiddenElement.download = makeCSVFilename(
                `transactions-${paymentFederation.name}`,
            )
            hiddenElement.click()
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [toast, paymentFederation, t, makeFormattedAmountsFromMSats])

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

    return (
        <Layout.Root>
            <Layout.Header>
                <Layout.Title>Developer Settings</Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    <FederationWalletSelector />
                    <Settings>
                        <Setting>
                            <Text weight="bold">Lightning gateway</Text>
                            <RadioGroup
                                options={gatewayOptions}
                                value={activeGatewayPubKey}
                                onChange={handleSelectGateway}
                            />
                        </Setting>
                        <Setting>
                            <Text weight="bold">Simulate guardian mode</Text>
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
                            <Text weight="bold">NUX</Text>
                            <Button
                                onClick={() => {
                                    dispatch(resetNuxSteps())
                                }}>
                                Reset new user experience
                            </Button>
                        </Setting>
                        <Setting>
                            <Text weight="bold">Survey Tool</Text>
                            <Button
                                onClick={() => {
                                    dispatch(setSurveyTimestamp(-1))
                                }}>
                                Reset survey tool timestamp
                            </Button>
                            <Button
                                onClick={() => {
                                    dispatch(resetSurveyCompletions())
                                }}>
                                Reset survey completions
                            </Button>
                        </Setting>
                        <Setting>
                            <Text weight="bold">Miniapp History</Text>
                            <Button
                                onClick={() => {
                                    dispatch(clearAllMiniAppSessions())
                                }}>
                                Clear all miniapp history
                            </Button>
                        </Setting>
                        <Setting>
                            <Text weight="bold">
                                {t('feature.developer.logs')}
                            </Text>
                            <Button onClick={handleDownloadLogs}>
                                {t('feature.developer.download-logs')}
                            </Button>
                        </Setting>
                        <Setting>
                            <Text weight="bold">{t('words.wallet')}</Text>
                            <Button onClick={handleDownloadTxHistory}>
                                {t('feature.developer.export-transactions-csv')}
                            </Button>
                        </Setting>
                        <Setting>
                            <Text weight="bold">Evil Spam Testing</Text>
                            <Button
                                onClick={async () => {
                                    if (!paymentFederation?.id) return
                                    await fedimint.evilSpamInvoices({
                                        federationId: paymentFederation.id,
                                    })
                                }}>
                                Evil Spam Invoices
                            </Button>
                            <Button
                                onClick={async () => {
                                    if (!paymentFederation?.id) return
                                    await fedimint.evilSpamAddress({
                                        federationId: paymentFederation.id,
                                    })
                                }}>
                                Evil Spam Address
                            </Button>
                        </Setting>
                    </Settings>
                </Content>
            </Layout.Content>
        </Layout.Root>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    textAlign: 'left',
})

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
