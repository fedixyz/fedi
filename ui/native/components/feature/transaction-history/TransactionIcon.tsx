import { Theme, useTheme } from '@rneui/themed'
import React from 'react'

import {
    makeTxnIconDisplay,
    makeTxnStatusBadge,
    type TxnIconColor,
} from '@fedi/common/utils/transaction'

import { TransactionListEntry, TransactionStatusBadge } from '../../../types'
import SvgImage from '../../ui/SvgImage'
import { HistoryIcon } from './HistoryIcon'

interface Props {
    txn: TransactionListEntry
    customBadge?: TransactionStatusBadge
}

const getTxnIconColor = (color: TxnIconColor, theme: Theme): string => {
    return color === 'stable' ? theme.colors.moneyGreen : theme.colors.orange
}

export const getTxnIcon = (
    txn: TransactionListEntry,
    theme: Theme,
): React.ReactNode => {
    const iconDisplay = makeTxnIconDisplay(txn)

    return (
        <SvgImage
            name={iconDisplay.icon}
            color={getTxnIconColor(iconDisplay.color, theme)}
            size={theme.sizes.historyIcon}
        />
    )
}

export const TransactionIcon: React.FC<Props> = ({ txn, customBadge }) => {
    const { theme } = useTheme()

    const badge = customBadge ?? makeTxnStatusBadge(txn)

    const icon = getTxnIcon(txn, theme)

    return <HistoryIcon badge={badge}>{icon}</HistoryIcon>
}
