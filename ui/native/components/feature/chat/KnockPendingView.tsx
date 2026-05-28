import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Column } from '../../ui/Flex'
import HoloCircle from '../../ui/HoloCircle'
import { SafeAreaContainer } from '../../ui/SafeArea'

type Props = {
    roomName?: string | null
    onGoBack?: () => void
    edges?: 'bottom' | 'notop'
}

const KnockPendingView: React.FC<Props> = ({
    roomName,
    onGoBack,
    edges = 'bottom',
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <SafeAreaContainer edges={edges}>
            <Column center grow gap="md">
                <HoloCircle
                    content={<Text style={style.iconText}>⏳</Text>}
                    size={64}
                />
                <Text h2 h2Style={style.title}>
                    {t('feature.chat.request-to-join-pending')}
                </Text>
                {roomName && (
                    <Text bold style={style.text}>
                        {roomName}
                    </Text>
                )}
                <Text style={style.description}>
                    {t('feature.chat.request-to-join-pending-description')}
                </Text>
            </Column>
            {onGoBack && (
                <Button onPress={onGoBack}>{t('phrases.go-back')}</Button>
            )}
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        iconText: {
            fontSize: 24,
        },
        title: {
            textAlign: 'center',
        },
        text: {
            textAlign: 'center',
        },
        description: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.lg,
            color: theme.colors.darkGrey,
        },
    })

export default KnockPendingView
