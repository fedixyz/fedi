import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { DetailItem } from '@fedi/common/utils/wallet'

import { Row } from '../../ui/Flex'

export type FeeBreakdownItemProps = DetailItem & {
    noBorder?: boolean
}

export const FeeBreakdownItem: React.FC<FeeBreakdownItemProps> = props => {
    const { theme } = useTheme()

    const style = styles(theme)

    const containerStyle = [
        style.container,
        props.noBorder ? {} : style.containerBorder,
    ]

    return (
        <Row align="center" justify="between" style={containerStyle}>
            <Text caption bold style={style.labelText} numberOfLines={2}>
                {props.label}
            </Text>
            <Text caption style={style.valueText} numberOfLines={2}>
                {props.value}
            </Text>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            minHeight: 20,
        },
        containerBorder: {
            paddingBottom: theme.spacing.md,
            marginBottom: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
        },
        labelText: {
            maxWidth: '50%',
            marginRight: theme.spacing.sm,
            color: theme.colors.darkGrey,
        },
        valueText: {
            maxWidth: '50%',
            textAlign: 'right',
        },
    })
