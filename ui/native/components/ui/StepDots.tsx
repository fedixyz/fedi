import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { Row } from './Flex'

/**
 * Wizard position indicator.
 *
 * Filled means reached: the current step and every step before it are solid,
 * steps ahead stay grey. Every dot is the same size, so position reads from how
 * many are filled rather than from one dot being shaped differently.
 */
export const StepDots: React.FC<{
    /** Total steps in the flow. */
    count: number
    /** Zero-based index of the current step. */
    activeIndex: number
}> = ({ count, activeIndex }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Row align="center" justify="center" gap="xs">
            {Array.from({ length: count }, (_, index) => (
                <View
                    key={index}
                    style={[style.dot, index <= activeIndex && style.reached]}
                />
            ))}
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        dot: {
            backgroundColor: theme.colors.lightGrey,
            borderRadius: 3,
            height: 6,
            width: 6,
        },
        reached: {
            backgroundColor: theme.colors.primary,
        },
    })
