import { useTheme, Theme } from '@rneui/themed'
import React from 'react'
import { TouchableOpacity, StyleSheet, Text } from 'react-native'

import Flex from '../../ui/Flex'

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
    const style = styles(theme)

    return (
        <Flex row fullWidth style={style.container}>
            {options.map(option => {
                const isSelected = selected === option.value
                return (
                    <TouchableOpacity
                        key={option.value}
                        testID={`${option.value}Tab`}
                        style={[
                            style.item,
                            isSelected
                                ? style.itemSelected
                                : style.itemUnselected,
                        ]}
                        onPress={() => onChange(option.value)}>
                        <Text style={style.itemText}>{option.label}</Text>
                    </TouchableOpacity>
                )
            })}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 20,
            height: 40,
            overflow: 'hidden',
            backgroundColor: theme.colors.extraLightGrey,
        },
        item: {
            flex: 1,
            borderWidth: 2,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
            borderColor: theme.colors.extraLightGrey,
        },
        itemSelected: {
            backgroundColor: theme.colors.white,
        },
        itemUnselected: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        itemText: {
            fontSize: 14,
            color: theme.colors.night,
        },
    })
