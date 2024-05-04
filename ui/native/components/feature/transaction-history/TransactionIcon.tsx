import { useTheme } from '@rneui/themed'
import React from 'react'

import { Transaction, TransactionDirection } from '../../../types'
import { HistoryIcon, HistoryIconProps } from '../../ui/HistoryIcon'
import SvgImage from '../../ui/SvgImage'

interface Props {
    txn: Transaction
}

export const TransactionIcon: React.FC<Props> = ({ txn }) => {
    const { theme } = useTheme()

    let badge: HistoryIconProps['badge']
    if (txn.direction === TransactionDirection.send) {
        badge = 'outgoing'
    } else if (
        txn.lnState?.type === 'waitingForPayment' ||
        (txn.bitcoin && txn.onchainState?.type !== 'claimed') ||
        (txn.lightning && !txn.lnState) ||
        txn.stabilityPoolState?.type === 'pendingWithdrawal'
    ) {
        badge = 'pending'
    } else if (txn.lnState?.type === 'canceled') {
        badge = 'expired'
    } else {
        badge = 'incoming'
    }

    return (
        <HistoryIcon badge={badge}>
            <SvgImage
                name="BitcoinCircle"
                color={theme.colors.orange}
                size={theme.sizes.historyIcon}
            />
        </HistoryIcon>
    )
}
