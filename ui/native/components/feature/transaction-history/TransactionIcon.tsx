import { Theme, useTheme } from '@rneui/themed'
import React from 'react'

import { makeTxnStatusBadge } from '@fedi/common/utils/wallet'

import { TransactionListEntry, TransactionStatusBadge } from '../../../types'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'
import { HistoryIcon } from './HistoryIcon'

interface Props {
    txn: TransactionListEntry
    customBadge?: TransactionStatusBadge
}

export const getTxnIcon = (
    txn: TransactionListEntry,
    theme: Theme,
): React.ReactNode => {
    let icon: SvgImageName = 'BitcoinCircle'
    let color: string = theme.colors.orange

    if (txn.kind === 'onchainDeposit' || txn.kind === 'onchainWithdraw')
        icon = 'OnChainCircle'
    else if (
        txn.kind === 'spDeposit' ||
        txn.kind === 'spWithdraw' ||
        txn.kind === 'sPV2Deposit' ||
        txn.kind === 'sPV2Withdrawal'
    ) {
        icon = 'DollarCircle'
        color = theme.colors.moneyGreen
    } else if (txn.kind === 'oobSend' || txn.kind === 'oobReceive')
        icon = 'ChatPaymentCircle'
    else if (
        txn.kind === 'lnPay' ||
        txn.kind === 'lnReceive' ||
        txn.kind === 'lnRecurringdReceive'
    )
        icon = 'LightningCircle'
    else if (
        txn.kind === 'sPV2TransferIn' ||
        txn.kind === 'sPV2TransferOut' ||
        txn.kind === 'multispend'
    ) {
        icon = 'MultispendGroupCircle'
        color = theme.colors.moneyGreen
    } else {
        icon = 'BitcoinCircle'
        color = theme.colors.orange
    }

    return <SvgImage name={icon} color={color} size={theme.sizes.historyIcon} />
}

export const TransactionIcon: React.FC<Props> = ({ txn, customBadge }) => {
    const { theme } = useTheme()

    const badge = customBadge ?? makeTxnStatusBadge(txn)

    const icon = getTxnIcon(txn, theme)

    return <HistoryIcon badge={badge}>{icon}</HistoryIcon>
}
