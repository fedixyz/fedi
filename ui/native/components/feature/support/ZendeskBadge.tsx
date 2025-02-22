import { useTheme, Theme, Text } from '@rneui/themed'
import React from 'react'
import { View, StyleSheet } from 'react-native'

import { selectZendeskUnreadMessageCount } from '@fedi/common/redux/support'

import { useAppSelector } from '../../../state/hooks'

const ZendeskBadge: React.FC<{ title: string }> = ({ title }) => {
    const { theme } = useTheme()
    const unreadCount = useAppSelector(selectZendeskUnreadMessageCount)
    const style = styles(theme)

    // Show badge ONLY if title is "Ask Fedi" and count is > 0
    if (title.toLowerCase() !== 'ask fedi' || unreadCount === 0) {
        return null
    }

    return (
        <View style={style.badge}>
            <Text style={style.badgeText}>{unreadCount}</Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        badge: {
            position: 'absolute',
            zIndex: 1000,
            top: -3,
            right: 32,
            backgroundColor: theme.colors.red,
            borderRadius: 10,
            width: 20,
            height: 20,
            justifyContent: 'center',
            alignItems: 'center',
        },
        badgeText: {
            color: theme.colors.white,
            fontSize: 12,
            fontWeight: 'bold',
        },
    })

export default ZendeskBadge
