import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import { Federation } from '@fedi/common/types'

import { Column, Row } from '../../ui/Flex'
import HoloProgressCircle from '../../ui/HoloProgressCircle'

type Props = {
    federationId: Federation['id']
}

const Balance: React.FC<Props> = ({ federationId }) => {
    const { t } = useTranslation()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance(
        t,
        federationId,
    )
    const { progress, recoveryInProgress } = useRecoveryProgress(federationId)

    if (recoveryInProgress) return <HoloProgressCircle progress={progress} />

    return (
        <Row align="center" gap="lg">
            <Column gap="xxs">
                <Text medium style={style.balanceText}>
                    {formattedBalanceFiat}
                </Text>
                <Text small style={style.balanceText}>
                    {formattedBalanceSats}
                </Text>
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
