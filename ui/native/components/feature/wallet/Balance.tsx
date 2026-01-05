import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { Federation } from '@fedi/common/types'

import { Row, Column } from '../../ui/Flex'

type Props = {
    federationId: Federation['id']
}

const Balance: React.FC<Props> = ({ federationId }) => {
    const { theme } = useTheme()
    const { formattedBalanceSats, formattedBalanceFiat } =
        useBalance(federationId)

    const style = styles(theme)

    return (
        <Row align="center" gap="lg">
            <Column gap="xxs">
                <Text medium style={[style.balanceText]}>
                    {`${formattedBalanceFiat}`}
                </Text>
                <Text small style={style.balanceText}>
                    {`${formattedBalanceSats}`}
                </Text>
            </Column>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        balanceText: {
            textAlign: 'right',
            color: theme.colors.primary,
        },
        svgStyle: {
            opacity: 0.7,
        },
    })

export default Balance
