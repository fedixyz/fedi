import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import Flex from './Flex'

export interface ImageBadgeProps {
    children: React.ReactNode
    badge: React.ReactNode
}

export const ImageBadge: React.FC<ImageBadgeProps> = ({ children, badge }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Flex shrink={false}>
            {children}
            {badge && <View style={style.badge}>{badge}</View>}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        badge: {
            position: 'absolute',
            right: -theme.sizes.xxs,
            top: -theme.sizes.xxs,
            borderRadius: 100,
            borderWidth: 2,
            borderColor: theme.colors.offWhite,
            color: theme.colors.offWhite,
        },
    })
