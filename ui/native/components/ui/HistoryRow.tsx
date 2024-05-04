import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'

import { MSats } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'

export interface HistoryRowProps {
    icon: React.ReactNode
    status: React.ReactNode
    notes: React.ReactNode
    amount: MSats | string
    currencyText?: string | undefined
    timestamp: number | undefined | null
    onSelect: () => void
}

export const HistoryRow: React.FC<HistoryRowProps> = ({
    icon,
    status,
    notes,
    amount,
    currencyText,
    timestamp,
    onSelect,
}) => {
    const { theme } = useTheme()

    const style = styles(theme)

    const amountNode: React.ReactNode = (
        <View style={style.amountContainer}>
            <Text caption medium>
                {amount}
            </Text>
            {currencyText && (
                <Text tiny medium style={style.amountSuffix}>
                    {currencyText}
                </Text>
            )}
        </View>
    )

    return (
        <TouchableOpacity
            onPress={() => onSelect()}
            style={[style.container]}
            hitSlop={4}>
            {icon}
            <View style={style.centerContainer}>
                <Text caption medium>
                    {status}
                </Text>
                {notes && (
                    <Text small numberOfLines={1} style={style.subText}>
                        {notes}
                    </Text>
                )}
            </View>

            <View style={style.rightContainer}>
                {amountNode}
                {timestamp && (
                    <Text small style={[style.rightAlignedText, style.subText]}>
                        {dateUtils.formatTxnTileTimestamp(timestamp)}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.xl,
            backgroundColor: theme.colors.secondary,
            marginBottom: theme.spacing.xl,
        },
        centerContainer: {
            flex: 1,
            width: '100%',
            flexDirection: 'column',
            gap: 4,
        },
        rightContainer: {
            flexShrink: 0,
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: 4,
        },
        rightAlignedText: {
            textAlign: 'right',
        },
        subText: {
            color: theme.colors.primaryLight,
        },
        pending: {
            opacity: 0.6,
        },
        amountContainer: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'flex-end',
            gap: 2,
        },
        amountSuffix: {
            paddingBottom: 1,
        },
    })
