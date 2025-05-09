import { useTheme, Theme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native'

export interface Option<T extends string> {
    label: string
    value: T
}

interface Props<T extends string> {
    options: Option<T>[]
    selected: T
    onChange: (value: T) => void
}

export function Switcher<T extends string>({
    options,
    onChange,
    selected,
}: Props<T>) {
    const { theme } = useTheme()
    const styles = useMemo(() => createStyles(theme), [theme])

    return (
        <View style={styles.container}>
            {options.map(option => {
                const isSelected = selected === option.value
                return (
                    <TouchableOpacity
                        key={option.value}
                        style={
                            isSelected
                                ? styles.itemSelected
                                : styles.itemUnselected
                        }
                        onPress={() => onChange(option.value)}>
                        <Text style={styles.itemText}>{option.label}</Text>
                    </TouchableOpacity>
                )
            })}
        </View>
    )
}

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 20,
            flexDirection: 'row',
            height: 40,
            overflow: 'hidden',
            width: '100%',
            backgroundColor: theme.colors.extraLightGrey,
        },
        itemSelected: {
            flex: 1,
            borderWidth: 2,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.extraLightGrey,
        },
        itemUnselected: {
            flex: 1,
            borderWidth: 2,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.colors.extraLightGrey,
            borderColor: theme.colors.extraLightGrey,
        },
        itemText: {
            fontSize: 14,
            color: theme.colors.night,
        },
    })
