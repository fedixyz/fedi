import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import BitcoinCircleIcon from '@fedi/common/assets/svgs/bitcoin-circle.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useGuardianFeesDashboard } from '@fedi/common/hooks/guardianFees'
import { useToast } from '@fedi/common/hooks/toast'
import { isDev } from '@fedi/common/utils/environment'
import {
    GuardianFeeHistoryRow,
    makeGuardianFeeDetailProps,
    makeGuardianFeeHistoryRows,
    makeGuardianFeeHistoryRowDisplay,
} from '@fedi/common/utils/guardianFees'

import { Button } from '../../components/Button'
import { ContentBlock } from '../../components/ContentBlock'
import { HistoryList } from '../../components/HistoryList'
import { HistoryIcon } from '../../components/HistoryList/HistoryIcon'
import { Icon } from '../../components/Icon'
import * as Layout from '../../components/Layout'
import { Switch } from '../../components/Switch'
import { Text } from '../../components/Text'
import { guardianFeesSuccessRoute } from '../../constants/routes'
import { styled, theme } from '../../styles'

const GuardianFeesPage: React.FC = () => {
    const { t } = useTranslation()
    const router = useRouter()
    const toast = useToast()
    const federationId =
        typeof router.query.id === 'string' ? router.query.id : ''
    const canUseDummyData = isDev()
    const [useDummyData, setUseDummyData] = useState(false)

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })
    const {
        currentBalance,
        dayBuckets,
        isBalanceLoading,
        isWithdrawing,
        withdrawAll,
    } = useGuardianFeesDashboard(
        router.isReady && federationId ? federationId : undefined,
        { useDummyData },
    )

    const historyRows = useMemo(
        () => makeGuardianFeeHistoryRows(dayBuckets),
        [dayBuckets],
    )

    if (!router.isReady) return null

    const isWithdrawDisabled =
        isBalanceLoading || currentBalance <= 0 || isWithdrawing

    const handleWithdrawAll = async () => {
        if (isWithdrawDisabled) return

        try {
            await withdrawAll()
            await router.replace(guardianFeesSuccessRoute)
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }

    const currentBalanceAmounts = makeFormattedAmountsFromMSats(
        currentBalance,
        'end',
        true,
    )

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>
                        {t('feature.settings.guardian-fees')}
                    </Layout.Title>
                </Layout.Header>

                <Layout.Content fullWidth>
                    <Content>
                        <BalancePanel>
                            {canUseDummyData && (
                                <DummyDataToggle>
                                    <Text variant="caption">
                                        Use dummy guardian fee data
                                    </Text>
                                    <Switch
                                        checked={useDummyData}
                                        onCheckedChange={setUseDummyData}
                                    />
                                </DummyDataToggle>
                            )}
                            <Text variant="caption">
                                {t('feature.guardian-fees.remittance-balance')}
                            </Text>
                            {isBalanceLoading ? (
                                <Text variant="h1">{t('words.loading')}</Text>
                            ) : (
                                <>
                                    <Text variant="h1">
                                        {currentBalanceAmounts.formattedFiat}
                                    </Text>
                                    <Text variant="caption">
                                        {currentBalanceAmounts.formattedSats}
                                    </Text>
                                </>
                            )}
                            <Actions>
                                <Button
                                    width="full"
                                    onClick={handleWithdrawAll}
                                    loading={isWithdrawing}
                                    disabled={isWithdrawDisabled}>
                                    {t(
                                        'feature.guardian-fees.transfer-all-to-main-balance',
                                    )}
                                </Button>
                            </Actions>
                        </BalancePanel>

                        {dayBuckets.length > 0 && (
                            <History>
                                <Text variant="h2">
                                    {t('feature.guardian-fees.fee-history')}
                                </Text>
                                <HistoryList<GuardianFeeHistoryRow>
                                    rows={historyRows}
                                    makeIcon={() => <GuardianFeeIcon />}
                                    makeRowProps={row => {
                                        const rowDisplay =
                                            makeGuardianFeeHistoryRowDisplay(
                                                row,
                                                t,
                                                makeFormattedAmountsFromMSats,
                                            )

                                        return {
                                            status: rowDisplay.title,
                                            notes: rowDisplay.subtitle,
                                            amount: rowDisplay.amount,
                                            timestamp: rowDisplay.timestamp,
                                        }
                                    }}
                                    makeDetailProps={row =>
                                        makeGuardianFeeDetailProps(
                                            row,
                                            t,
                                            makeFormattedAmountsFromMSats,
                                        )
                                    }
                                />
                            </History>
                        )}
                    </Content>
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const GuardianFeeIcon = () => (
    <HistoryIcon color={theme.colors.orange}>
        <Icon icon={BitcoinCircleIcon} size={38} />
    </HistoryIcon>
)

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: '100%',
})

const BalancePanel = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    background: theme.colors.offWhite,
    borderRadius: 8,
})

const Actions = styled('div', {
    display: 'grid',
    gap: 8,
    gridTemplateColumns: '1fr',
    marginTop: 4,
})

const DummyDataToggle = styled('div', {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
})

const History = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
})

export default GuardianFeesPage
