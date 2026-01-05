import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Column } from '../components/ui/Flex'
import Success from '../components/ui/Success'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SelectRecoveryFileSuccess'
>

const SelectRecoveryFileSuccess: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Success
            message={
                <Column align="center" style={style.textContainer}>
                    <Text h2 h2Style={style.successMessage}>
                        {t('feature.recovery.successfully-opened-fedi-file')}
                    </Text>
                </Column>
            }
            buttonText={t('words.okay')}
            nextScreen={'CompleteSocialRecovery'}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        textContainer: {
            marginVertical: theme.spacing.md,
            width: '80%',
        },
        successMessage: {
            textAlign: 'center',
            marginBottom: theme.spacing.md,
        },
    })

export default SelectRecoveryFileSuccess
