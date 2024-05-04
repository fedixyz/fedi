import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Success from '../components/ui/Success'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'BugReportSuccess'
>

const BugReportSuccess: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)
    return (
        <Success
            message={
                <>
                    <Text medium style={style.title}>
                        {t('feature.bug.success-title')}
                    </Text>
                    <Text medium style={style.subtitle}>
                        {t('feature.bug.success-subtitle')}
                    </Text>
                </>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        title: {
            marginTop: theme.spacing.sm,
            marginBottom: theme.spacing.sm,
            textAlign: 'center',
        },
        subtitle: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
    })

export default BugReportSuccess
