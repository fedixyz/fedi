import React from 'react'

import { TransactionListEntry } from '@fedi/common/types'
import { makeTxnStatusBadge } from '@fedi/common/utils/transaction'

import { theme } from '../../styles'
import { HistoryIcon } from '../HistoryList/HistoryIcon'
import { Icon } from '../Icon'

interface Props {
    txn: TransactionListEntry
}

export const TransactionIcon: React.FC<Props> = ({ txn }) => {
    const badge = makeTxnStatusBadge(txn)

    return (
        <HistoryIcon badge={badge} color={theme.colors.orange}>
            <Icon icon="BitcoinCircle" size={38} />
        </HistoryIcon>
    )
}
