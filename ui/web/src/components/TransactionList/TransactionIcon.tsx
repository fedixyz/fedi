import React from 'react'

import BitcoinCircleIcon from '@fedi/common/assets/svgs/bitcoin-circle.svg'
import { Transaction, TransactionDirection } from '@fedi/common/types'

import { theme } from '../../styles'
import { HistoryIcon, HistoryIconProps } from '../HistoryList/HistoryIcon'
import { Icon } from '../Icon'

interface Props {
    txn: Transaction
}

export const TransactionIcon: React.FC<Props> = ({ txn }) => {
    let badge: HistoryIconProps['badge']
    if (txn.direction === TransactionDirection.send) {
        badge = 'outgoing'
    } else if (
        txn.lnState?.type === 'waitingForPayment' ||
        (txn.bitcoin && txn.onchainState?.type !== 'claimed') ||
        (txn.lightning && !txn.lnState)
    ) {
        badge = 'pending'
    } else if (txn.lnState?.type === 'canceled') {
        badge = 'expired'
    } else {
        badge = 'incoming'
    }

    return (
        <HistoryIcon badge={badge} color={theme.colors.orange}>
            <Icon icon={BitcoinCircleIcon} size={38} />
        </HistoryIcon>
    )
}
