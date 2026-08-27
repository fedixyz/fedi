import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Row } from './Flex'
import { Pressable } from './Pressable'

export interface SegmentedControlOption<T extends string | number> {
    label: string
    value: T
    testID?: string
}

/**
 * Pill segmented control.
 *
 * Matches the prototype's `.seg`: a 40px `dividerGrey` track with 2px inset,
 * equal-width segments, and a white pill with a soft shadow on the active one.
 */
export function SegmentedControl<T extends string | number>({
    options,
    selectedValue,
    onChange,
}: {
    options: SegmentedControlOption<T>[]
    selectedValue: T
    onChange: (value: T) => void
}) {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Row align="center" style={style.track}>
            {options.map(option => {
                const isActive = option.value === selectedValue
                return (
                    <Pressable
                        key={String(option.value)}
                        testID={option.testID}
                        onPress={() => onChange(option.value)}
                        containerStyle={[
                            style.segment,
                            isActive && style.segmentActive,
                        ]}>
                        <Text
                            style={[
                                style.label,
                                isActive && style.labelActive,
                            ]}>
                            {option.label}
                        </Text>
                    </Pressable>
                )
            })}
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        track: {
            backgroundColor: theme.colors.dividerGrey,
            borderRadius: 999,
            height: 40,
            padding: 2,
        },
        segment: {
            alignItems: 'center',
            borderRadius: 999,
            flex: 1,
            height: 36,
            justifyContent: 'center',
            paddingHorizontal: 12,
        },
        segmentActive: {
            backgroundColor: theme.colors.white,
            elevation: 3,
            shadowColor: theme.colors.night,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            // the design's 12px CSS blur — iOS shadowRadius is ~half the
            // equivalent CSS blur
            shadowRadius: 6,
        },
        label: {
            color: theme.colors.darkGrey,
            fontSize: 12,
            fontWeight: '400',
            // no lineHeight override: Poppins descenders clip at the
            // design's nominal 16px
        },
        labelActive: {
            color: theme.colors.primary,
            fontWeight: '500',
        },
    })
