import React from 'react'

import ArrowDownBadgeIcon from '@fedi/common/assets/svgs/arrow-down-badge.svg'
import ArrowUpBadgeIcon from '@fedi/common/assets/svgs/arrow-up-badge.svg'
import ExpiredBadgeIcon from '@fedi/common/assets/svgs/expired-badge.svg'
import PendingBadgeIcon from '@fedi/common/assets/svgs/pending-badge.svg'

import { theme, CSSProp, styled } from '../../styles'
import { Icon } from '../Icon'

export interface HistoryIconProps {
    children: React.ReactNode
    badge?: 'incoming' | 'outgoing' | 'pending' | 'expired'
    color?: CSSProp['color']
}

export const HistoryIcon: React.FC<HistoryIconProps> = ({
    children,
    badge,
    color,
}) => {
    let badgeIcon: typeof ArrowDownBadgeIcon | undefined
    let badgeColor: CSSProp['color'] | undefined
    if (badge === 'incoming') {
        badgeIcon = ArrowDownBadgeIcon
        badgeColor = theme.colors.green
    } else if (badge === 'outgoing') {
        badgeIcon = ArrowUpBadgeIcon
        badgeColor = theme.colors.black
    } else if (badge === 'pending') {
        badgeIcon = PendingBadgeIcon
        badgeColor = theme.colors.fuschia
    } else if (badge === 'expired') {
        badgeIcon = ExpiredBadgeIcon
        badgeColor = theme.colors.red
    }

    return (
        <Container css={{ color }}>
            {children}
            {badgeIcon && (
                <IconWrap css={{ color: badgeColor }}>
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
