import { Text, Theme, useTheme } from '@rneui/themed'
import React, { memo, useMemo } from 'react'
import { StyleSheet, TouchableOpacity } from 'react-native'

import { MSats, TransactionAmountState } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'

import { Row, Column } from '../../ui/Flex'

export interface HistoryRowProps {
    type: string
    icon: React.ReactNode
    status: React.ReactNode
    notes: string | undefined
    amount: MSats | string
    currencyText?: string | undefined
    timestamp: number | undefined | null
    amountState: TransactionAmountState
    onSelect: () => void
}

export const HistoryRow: React.FC<HistoryRowProps> = memo(
    ({
        type,
        icon,
        status,
        notes,
        amount,
        currencyText,
        timestamp,
        amountState,
        onSelect,
    }) => {
        const { theme } = useTheme()

        const style = styles(theme)

        const amountColor = useMemo(() => {
            switch (amountState) {
                case 'pending':
                case 'failed':
                    return theme.colors.darkGrey
                case 'settled':
                    return theme.colors.night
            }
        }, [amountState, theme])

        const amountNode: React.ReactNode = (
            <Row align="end" justify="end" gap="xxs">
                <Text
                    medium
                    caption
                    color={amountColor}
                    style={amountState === 'failed' ? style.strikeThrough : {}}>
                    {amount}
                </Text>
                {currencyText && (
                    <Text
                        tiny
                        medium
                        style={style.amountSuffix}
                        color={amountColor}>
                        {currencyText}
                    </Text>
                )}
            </Row>
        )

        return (
            <TouchableOpacity
                onPress={() => onSelect()}
                style={[style.container]}
                hitSlop={4}
                testID="transaction-item">
                {icon}
                <Column grow gap="xs" fullWidth basis={false}>
                    <Text caption medium>
                        {status}
                    </Text>
                    <Text small numberOfLines={1} style={style.subText}>
                        {type} {notes ? `(${notes.replace(/\n/g, ' ')})` : ''}
                    </Text>
                </Column>

                <Column shrink={false} justify="end" gap="xs">
                    {amountNode}
                    {timestamp && (
                        <Text
                            small
                            style={[style.rightAlignedText, style.subText]}
                            maxFontSizeMultiplier={1.4}>
                            {dateUtils.formatTxnTileTimestamp(timestamp)}
                        </Text>
                    )}
                </Column>
            </TouchableOpacity>
        )
    },
    (prevProps, nextProps) => {
        return (
            prevProps.status === nextProps.status &&
            prevProps.notes === nextProps.notes &&
            prevProps.amount === nextProps.amount &&
            prevProps.currencyText === nextProps.currencyText &&
            prevProps.timestamp === nextProps.timestamp
        )
    },
)

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
        rightAlignedText: {
            textAlign: 'right',
        },
        subText: {
            color: theme.colors.primaryLight,
        },
        pending: {
            opacity: 0.6,
        },
        amountSuffix: {
            paddingBottom: 1,
        },
        strikeThrough: {
            textDecorationLine: 'line-through',
            textDecorationColor: theme.colors.grey,
            textDecorationStyle: 'solid',
        },
    })
