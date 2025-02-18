import { Theme, useTheme } from '@rneui/themed'
import { StyleSheet, View } from 'react-native'

export default function PinDot({
    status,
    isLast = false,
}: {
    status: 'empty' | 'active' | 'correct' | 'incorrect'
    isLast?: boolean
}) {
    const { theme } = useTheme()
    const themedStyles = createStyles(theme) // Generate styles dynamically

    return (
        <View
            style={[
                themedStyles.dot,
                themedStyles[status],
                isLast ? themedStyles.lastDot : null,
            ]}
        />
    )
}

// Create a function to dynamically generate styles based on the theme
const createStyles = (theme: Theme) =>
    StyleSheet.create({
        dot: {
            borderRadius: 16,
            width: 16,
            height: 16,
            borderWidth: 2,
            marginRight: 16,
        },
        empty: {
            borderColor: theme.colors.grey,
        },
        active: {
            borderColor: theme.colors.primary,
            backgroundColor: theme.colors.primary,
        },
        correct: {
            borderColor: theme.colors.green,
            backgroundColor: theme.colors.green,
        },
        incorrect: {
            borderColor: theme.colors.red,
            backgroundColor: theme.colors.red,
        },
        lastDot: {
            marginRight: 0,
        },
    })
