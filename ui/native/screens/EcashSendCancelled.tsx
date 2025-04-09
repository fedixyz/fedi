import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Success from '../components/ui/Success'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'EcashSendCancelled'
>

const EcashSendCancelled: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <Success
            message={
                <Text h2 style={styles(theme).messageText}>
                    {t('phrases.canceled-ecash-send')}
                </Text>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        messageText: {
            marginTop: theme.spacing.md,
        },
    })

export default EcashSendCancelled
