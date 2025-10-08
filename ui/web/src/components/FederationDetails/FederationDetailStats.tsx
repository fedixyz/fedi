import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FALLBACK_LIMIT_MSATS } from '@fedi/common/constants/limits'
import { LoadedFederation } from '@fedi/common/types'
import { GuardianStatus } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'
import {
    getFederationMaxBalanceMsats,
    getFederationMaxInvoiceMsats,
} from '@fedi/common/utils/FederationUtils'
import { formatLargeNumber } from '@fedi/common/utils/format'

import { fedimint } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { CircularLoader } from '../CircularLoader'
import { Column, Row } from '../Flex'
import { Text } from '../Text'

function FederationDetailStats({
    federation,
}: {
    federation: LoadedFederation
}) {
    const [guardianStatuses, setGuardianStatuses] =
        useState<Array<GuardianStatus> | null>(null)
    const [isLoadingGuardians, setIsLoadingGuardians] = useState(true)

    const { t } = useTranslation()

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

    useEffect(() => {
        fedimint
            .getGuardianStatus(federation.id)
            .then(setGuardianStatuses)
            .finally(() => setIsLoadingGuardians(false))
    }, [federation.id])

    return (
        <Container>
            <Column align="center" grow gap="xs">
                <Text variant="small" weight="medium">
                    {t('words.guardians')}
                </Text>
                {isLoadingGuardians ? (
                    <CircularLoader size="md" />
                ) : (
                    <Text variant="caption" weight="medium">
                        {guardianStatuses
                            ? `${onlineGuardians}/${totalGuardians}`
                            : '--/--'}
                    </Text>
                )}
            </Column>
            <Column align="center" grow gap="xs">
                <Text variant="small" weight="medium">
                    {t('feature.federations.wallet-balance')}
                </Text>
                <Text variant="caption" weight="medium">
                    {formattedWalletBalance}
                </Text>
            </Column>
            <Column align="center" grow gap="xs">
                <Text variant="small" weight="medium">
                    {t('feature.federations.spend-limit')}
                </Text>
                <Text variant="caption" weight="medium">
                    {formattedSpendLimit}
                </Text>
            </Column>
        </Container>
    )
}

const Container = styled(Row, {
    border: `solid 1px ${theme.colors.extraLightGrey}`,
    borderRadius: 16,
    padding: theme.spacing.md,

    '& > :not(:last-child)': {
        borderRight: `1px solid ${theme.colors.extraLightGrey}`,
    },
})

export default FederationDetailStats
