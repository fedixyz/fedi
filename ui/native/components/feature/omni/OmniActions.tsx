import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import Flex from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'
import { OmniInputAction } from './OmniInput'

interface Props {
    actions: OmniInputAction[]
}

export const OmniActions: React.FC<Props> = ({ actions }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const [loadingActions, setLoadingActions] = useState<number[]>([])

    // Handles async OR non-async onPress callbacks
    const handlePress = useCallback(
        (onPress: () => void | Promise<void>, idx: number) => {
            setLoadingActions(curr => [idx, ...curr])
            Promise.resolve(onPress()).finally(() =>
                setLoadingActions(curr => curr.filter(i => i !== idx)),
            )
        },
        [setLoadingActions],
    )

    return (
        <Flex fullWidth>
            {actions.map(({ label, icon, onPress }, idx) => (
                <Pressable
                    key={idx}
                    onPress={() => handlePress(onPress, idx)}
                    containerStyle={style.action}>
                    {typeof label === 'string' && icon && (
                        <SvgImage name={icon} />
                    )}
                    {typeof label === 'string' ? (
                        <Text bold numberOfLines={2}>
                            {label}
                        </Text>
                    ) : (
                        label
                    )}
                    {loadingActions.includes(idx) && (
                        <View key={idx} style={styles(theme).loaderContainer}>
                            <HoloLoader key={idx} size={24} />
                        </View>
                    )}
                </Pressable>
            ))}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        action: {
            gap: theme.spacing.lg,
        },
        loaderContainer: {
            marginLeft: 'auto',
        },
    })
