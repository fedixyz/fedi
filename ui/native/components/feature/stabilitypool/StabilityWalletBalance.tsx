import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import { selectStableBalancePending } from '@fedi/common/redux/wallet'
import { Federation } from '@fedi/common/types'

import { useAppSelector, useStabilityPool } from '../../../state/hooks'
import { Column, Row } from '../../ui/Flex'
import HoloProgressCircle from '../../ui/HoloProgressCircle'

type Props = {
    federationId: Federation['id']
}

const Balance: React.FC<Props> = ({ federationId }) => {
    const { t } = useTranslation()
    const stableBalancePending = useAppSelector(s =>
        selectStableBalancePending(s, federationId),
    )
    const { formattedStableBalance, formattedStableBalancePending } =
        useStabilityPool(federationId)
    const formattedPending =
        stableBalancePending > 0
            ? '+' + formattedStableBalancePending
            : formattedStableBalancePending
    const { progress, recoveryInProgress } = useRecoveryProgress(federationId)

    if (recoveryInProgress) return <HoloProgressCircle progress={progress} />

    return (
        <Row align="center" gap="lg">
            <Column gap="xxs">
                <Text
                    medium
                    style={style.balanceText}
                    adjustsFontSizeToFit
                    numberOfLines={1}>
                    {formattedStableBalance}
                </Text>
                {stableBalancePending !== 0 && (
                    <Text
                        small
                        style={style.balanceText}
                        adjustsFontSizeToFit
                        numberOfLines={1}>
                        {t('feature.stabilitypool.amount-pending', {
                            amount: formattedPending,
                        })}
                    </Text>
                )}
            </Column>
        </Row>
    )
}

const style = StyleSheet.create({
    balanceText: {
        textAlign: 'right',
    },
})

export default Balance
