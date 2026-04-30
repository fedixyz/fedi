import { useTheme, Theme, Text } from '@rneui/themed'
import React from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'

import { Row } from './Flex'
import HelpTooltip from './HelpTooltip'

export interface Option<T extends string> {
    label: string
    value: T
    disabled?: boolean
    disabledMessage?: React.ReactElement | string
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
        <Row fullWidth style={style.container}>
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
                        disabled={option.disabled}
                        onPress={() => onChange(option.value)}>
                        <Text
                            style={[
                                style.itemText,
                                option.disabled && style.itemTextDisabled,
                            ]}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.5}
                            ellipsizeMode="tail">
                            {option.label}
                        </Text>
                        {option.disabledMessage && option.disabled && (
                            <HelpTooltip
                                svgProps={{
                                    color: theme.colors.grey,
                                    size: 20,
                                }}>
                                {typeof option.disabledMessage === 'string' ? (
                                    <Text caption>
                                        {option.disabledMessage}
                                    </Text>
                                ) : (
                                    option.disabledMessage
                                )}
                            </HelpTooltip>
                        )}
                    </TouchableOpacity>
                )
            })}
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 20,
            minHeight: 40,
            overflow: 'hidden',
            backgroundColor: theme.colors.extraLightGrey,
        },
        item: {
            display: 'flex',
            flexDirection: 'row',
            flex: 1,
            borderWidth: 2,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
            borderColor: theme.colors.extraLightGrey,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
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
            textAlign: 'center',
        },
        itemTextDisabled: {
            color: theme.colors.grey,
            fontWeight: 'normal',
        },
    })
