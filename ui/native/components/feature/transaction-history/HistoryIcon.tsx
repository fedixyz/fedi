import { useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { TransactionStatusBadge } from '@fedi/common/types'

import SvgImage, { SvgImageName } from '../../ui/SvgImage'

export interface HistoryIconProps {
    children: React.ReactNode
    badge?: TransactionStatusBadge
}

export const HistoryIcon: React.FC<HistoryIconProps> = ({
    children,
    badge,
}) => {
    const { theme } = useTheme()

    let badgeSvgName: SvgImageName | undefined
    let badgeColor: string | undefined
    if (badge === 'incoming') {
        badgeSvgName = 'ArrowDownBadge'
        badgeColor = theme.colors.green
    } else if (badge === 'outgoing') {
        badgeSvgName = 'ArrowUpBadge'
        badgeColor = theme.colors.green
    } else if (badge === 'pending') {
        badgeSvgName = 'PendingBadge'
        badgeColor = theme.colors.lightOrange
    } else if (badge === 'expired' || badge === 'failed') {
        badgeSvgName = 'FailedBadge'
        badgeColor = theme.colors.red
    }

    const style = styles()

    return (
        <View style={style.container}>
            {children}
            {badgeSvgName && (
                <SvgImage
                    name={badgeSvgName}
                    color={badgeColor}
                    size={20}
                    containerStyle={style.badge}
                />
            )}
        </View>
    )
}

const styles = () =>
    StyleSheet.create({
        container: {
            flexShrink: 0,
        },
        badge: {
            position: 'absolute',
            left: -6,
            top: -6,
        },
    })
