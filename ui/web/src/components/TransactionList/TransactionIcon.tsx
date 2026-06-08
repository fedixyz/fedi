import React from 'react'

import type { TransactionStatusBadge } from '@fedi/common/types'

import type { CSSProp } from '../../styles'
import { HistoryIcon } from '../HistoryList/HistoryIcon'
import { Icon, SvgIconName } from '../Icon'

interface Props {
    badge?: TransactionStatusBadge
    badgeColor?: CSSProp['color']
    color: CSSProp['color']
    icon: SvgIconName
}

export const TransactionIcon: React.FC<Props> = ({
    badge,
    badgeColor,
    color,
    icon,
}) => {
    return (
        <HistoryIcon badge={badge} badgeColor={badgeColor} color={color}>
            <Icon icon={icon} size={38} />
        </HistoryIcon>
    )
}
