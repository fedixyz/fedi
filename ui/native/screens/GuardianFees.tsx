import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

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

import { HistoryIcon } from '../components/feature/transaction-history/HistoryIcon'
import { HistoryList } from '../components/feature/transaction-history/HistoryList'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'GuardianFees'>

const GuardianFees: React.FC<Props> = ({ route, navigation }: Props) => {
    const { federationId } = route.params
    const { t } = useTranslation()
    const toast = useToast()
    const { theme } = useTheme()
    const style = styles(theme)
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
    } = useGuardianFeesDashboard(federationId, { useDummyData })

    const historyRows = useMemo(
        () => makeGuardianFeeHistoryRows(dayBuckets),
        [dayBuckets],
    )

    const isWithdrawDisabled =
        isBalanceLoading || currentBalance <= 0 || isWithdrawing

    const handleWithdrawAll = async () => {
        if (isWithdrawDisabled) return

        try {
            await withdrawAll()
            navigation.replace('GuardianFeesSuccess')
        } catch (err) {
            toast.error(t, err)
        }
    }

    const currentBalanceAmounts = makeFormattedAmountsFromMSats(
        currentBalance,
        'end',
        true,
    )

    return (
        <SafeAreaContainer edges="bottom">
            <Column grow>
                <Column gap="lg" style={style.content}>
                    <Column gap="sm" style={style.balancePanel}>
                        {canUseDummyData && (
                            <Row
                                justify="between"
                                align="center"
                                style={style.dummyDataToggle}>
                                <Text caption>Use dummy guardian fee data</Text>
                                <Switch
                                    value={useDummyData}
                                    onValueChange={setUseDummyData}
                                />
                            </Row>
                        )}
                        <Text caption color={theme.colors.darkGrey}>
                            {t('feature.guardian-fees.remittance-balance')}
                        </Text>
                        {isBalanceLoading ? (
                            <ActivityIndicator size="small" />
                        ) : (
                            <>
                                <Text h1>
                                    {currentBalanceAmounts.formattedFiat}
                                </Text>
                                <Text caption color={theme.colors.darkGrey}>
                                    {currentBalanceAmounts.formattedSats}
                                </Text>
                            </>
                        )}
                        <Button
                            title={t(
                                'feature.guardian-fees.transfer-all-to-main-balance',
                            )}
                            onPress={handleWithdrawAll}
                            loading={isWithdrawing}
                            disabled={isWithdrawDisabled}
                            containerStyle={style.balanceAction}
                        />
                    </Column>

                    {dayBuckets.length > 0 && (
                        <Text h4>{t('feature.guardian-fees.fee-history')}</Text>
                    )}
                </Column>
                {dayBuckets.length > 0 && (
                    <HistoryList<GuardianFeeHistoryRow>
                        rows={historyRows}
                        makeIcon={() => <GuardianFeeIcon />}
                        makeShowAskFedi={() => false}
                        makeFeeItems={() => []}
                        federationId={federationId}
                        makeRowProps={row => {
                            const rowDisplay = makeGuardianFeeHistoryRowDisplay(
                                row,
                                t,
                                makeFormattedAmountsFromMSats,
                            )

                            return {
                                status: rowDisplay.title,
                                amount: rowDisplay.amount,
                                timestamp: rowDisplay.timestamp,
                                notes: undefined,
                                type: rowDisplay.subtitle,
                                amountState: rowDisplay.amountState,
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
                )}
            </Column>
        </SafeAreaContainer>
    )
}

const GuardianFeeIcon = () => {
    const { theme } = useTheme()

    return (
        <HistoryIcon>
            <SvgImage
                name="BitcoinCircle"
                color={theme.colors.orange}
                size={theme.sizes.historyIcon}
            />
        </HistoryIcon>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        content: {
            padding: theme.spacing.xl,
        },
        balancePanel: {
            backgroundColor: theme.colors.offWhite100,
            borderRadius: theme.borders.defaultRadius,
            padding: theme.spacing.lg,
        },
        balanceAction: {
            marginTop: theme.spacing.sm,
        },
        dummyDataToggle: {
            paddingBottom: theme.spacing.xs,
        },
    })

export default GuardianFees
