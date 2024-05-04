import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import SvgImage from '../../ui/SvgImage'
import { OmniInputAction } from './OmniInput'

interface Props {
    actions: OmniInputAction[]
}

export const OmniActions: React.FC<Props> = ({ actions }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <View style={style.container}>
            {actions.map(({ label, icon, onPress }, idx) => (
                <Pressable key={idx} onPress={onPress} style={style.action}>
                    <SvgImage name={icon} />
                    <Text bold numberOfLines={2}>
                        {label}
                    </Text>
                </Pressable>
            ))}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            flexDirection: 'column',
        },
        action: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: theme.spacing.md,
            gap: theme.spacing.lg,
        },
    })
