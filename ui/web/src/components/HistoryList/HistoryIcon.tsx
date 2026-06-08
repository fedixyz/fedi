import React from 'react'

import type { TransactionStatusBadge } from '@fedi/common/types'

import { styled, theme, type CSSProp } from '../../styles'
import { Icon, type SvgIconName } from '../Icon'

export interface HistoryIconProps {
    children: React.ReactNode
    badge?: TransactionStatusBadge
    badgeColor?: CSSProp['color']
    color?: CSSProp['color']
}

export const HistoryIcon: React.FC<HistoryIconProps> = ({
    children,
    badge,
    badgeColor: badgeColorOverride,
    color,
}) => {
    let badgeIcon: SvgIconName | undefined
    let badgeColor: CSSProp['color'] | undefined
    if (badge === 'incoming') {
        badgeIcon = 'ArrowDownBadge'
        badgeColor = theme.colors.green
    } else if (badge === 'outgoing') {
        badgeIcon = 'ArrowUpBadge'
        badgeColor = theme.colors.black
    } else if (badge === 'pending') {
        badgeIcon = 'PendingBadge'
        badgeColor = theme.colors.fuschia
    } else if (badge === 'expired') {
        badgeIcon = 'ExpiredBadgeIcon'
        badgeColor = theme.colors.red
    } else if (badge === 'failed') {
        badgeIcon = 'FailedBadge'
        badgeColor = theme.colors.red
    }

    return (
        <Container css={{ color }}>
            {children}
            {badgeIcon && (
                <IconWrap css={{ color: badgeColorOverride ?? badgeColor }}>
                    <Icon icon={badgeIcon} size={20} />
                </IconWrap>
            )}
        </Container>
    )
}

const Container = styled('div', {
    position: 'relative',
    flexShrink: 0,

    '& > svg': {
        display: 'block',
    },
})

const IconWrap = styled('div', {
    position: 'absolute',
    top: -6,
    left: -6,
})
