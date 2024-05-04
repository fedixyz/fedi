import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

export const MessageItemError: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <View style={style.container}>
            <Text style={style.errorMessage}>
                {t('errors.chat-message-render-error')}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) => ({
    container: {
        marginTop: theme.spacing.xxs,
        padding: 10,
        borderRadius: 16,
        maxWidth: theme.sizes.maxMessageWidth,
        backgroundColor: theme.colors.red,
    },
    errorMessage: {
        color: theme.colors.secondary,
    },
})
