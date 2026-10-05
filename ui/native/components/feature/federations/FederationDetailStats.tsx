import { Divider, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { FALLBACK_LIMIT_MSATS } from '@fedi/common/constants/limits'
import { useGuardianStatus } from '@fedi/common/hooks/federation'
import amountUtils from '@fedi/common/utils/AmountUtils'
import {
    getFederationMaxBalanceMsats,
    getFederationMaxInvoiceMsats,
} from '@fedi/common/utils/FederationUtils'
import { formatLargeNumber } from '@fedi/common/utils/format'

import { LoadedFederation } from '../../../types'
import { Column, Row } from '../../ui/Flex'

function FederationDetailStats({
    federation,
}: {
    federation: LoadedFederation
}) {
    const { guardians: guardianStatuses, isLoading: isLoadingGuardians } =
        useGuardianStatus(federation.id)

    const { t } = useTranslation()
    const { theme } = useTheme()

    const totalGuardians = guardianStatuses ? guardianStatuses.length : 0
    const onlineGuardians = guardianStatuses
        ? guardianStatuses.filter(g => 'online' in g).length
        : 0

    const maxBalanceMsats = getFederationMaxBalanceMsats(federation?.meta)
    const maxInvoiceMsats = getFederationMaxInvoiceMsats(federation?.meta)
    const formattedWalletBalance = `${formatLargeNumber(
        amountUtils.msatToSat(maxBalanceMsats ?? FALLBACK_LIMIT_MSATS),
        'K',
    )} ${t('words.sats').toUpperCase()}`
    const formattedSpendLimit = `${formatLargeNumber(
        amountUtils.msatToSat(maxInvoiceMsats ?? FALLBACK_LIMIT_MSATS),
        'K',
    )} ${t('words.sats').toUpperCase()}`

    const style = styles(theme)

    return (
        <Row style={style.container}>
            <Column align="center" grow gap="xs">
                <Text small medium>
                    {t('feature.federations.guardians-reachable')}
                </Text>
                {isLoadingGuardians ? (
                    <ActivityIndicator />
                ) : (
                    <Text caption medium>
                        {guardianStatuses
                            ? `${onlineGuardians}/${totalGuardians}`
                            : '--/--'}
                    </Text>
                )}
            </Column>
            <Divider orientation="vertical" />
            <Column align="center" grow gap="xs">
                <Text small medium>
                    {t('feature.federations.wallet-balance')}
                </Text>
                <Text caption medium>
                    {formattedWalletBalance}
                </Text>
            </Column>
            <Divider orientation="vertical" />
            <Column align="center" grow gap="xs">
                <Text small medium>
                    {t('feature.federations.spend-limit')}
                </Text>
                <Text caption medium>
                    {formattedSpendLimit}
                </Text>
            </Column>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.md,
            borderRadius: theme.borders.defaultRadius,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
        },
    })

export default FederationDetailStats
