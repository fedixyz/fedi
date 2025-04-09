import { Theme, useTheme } from '@rneui/themed'
import React from 'react'

import { makeTxnStatusBadge } from '@fedi/common/utils/wallet'

import { TransactionListEntry } from '../../../types'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'
import { HistoryIcon } from './HistoryIcon'

interface Props {
    txn: TransactionListEntry
}

const getTxnIcon = (
    txn: TransactionListEntry,
    theme: Theme,
): React.ReactNode => {
    let icon: SvgImageName = 'BitcoinCircle'
    let color: string = theme.colors.orange

    if (txn.kind === 'onchainDeposit' || txn.kind === 'onchainWithdraw')
        icon = 'OnChainCircle'
    else if (txn.kind === 'spDeposit' || txn.kind === 'spWithdraw') {
        icon = 'DollarCircle'
        color = theme.colors.moneyGreen
    } else if (txn.kind === 'oobSend' || txn.kind === 'oobReceive')
        icon = 'ChatPaymentCircle'
    else if (txn.kind === 'lnPay' || txn.kind === 'lnReceive')
        icon = 'LightningCircle'

    return <SvgImage name={icon} color={color} size={theme.sizes.historyIcon} />
}

export const TransactionIcon: React.FC<Props> = ({ txn }) => {
    const { theme } = useTheme()

    const badge = makeTxnStatusBadge(txn)

    const icon = getTxnIcon(txn, theme)

    return <HistoryIcon badge={badge}>{icon}</HistoryIcon>
}
