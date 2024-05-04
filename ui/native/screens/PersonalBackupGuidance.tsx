import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import CheckBox from '../components/ui/CheckBox'
import LineBreak from '../components/ui/LineBreak'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PersonalBackupGuidance'
>

const PersonalBackupGuidance: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [checkbox1, setCheckbox1] = useState(false)
    const [checkbox2, setCheckbox2] = useState(false)

    return (
        <View style={styles(theme).container}>
            <Text h2 style={styles(theme).instructionsText}>
                {t('phrases.how-it-works')}
            </Text>
            <LineBreak />
            <View style={styles(theme).confirmationContainer}>
                <CheckBox
                    title={
                        <Text caption medium style={styles(theme).checkboxText}>
                            {t(
                                'feature.backup.personal-backup-guidance-check-1',
                            )}
                        </Text>
                    }
                    checked={checkbox1}
                    onPress={() => {
                        setCheckbox1(!checkbox1)
                    }}
                />
                <CheckBox
                    title={
                        <Text caption medium style={styles(theme).checkboxText}>
                            {t(
                                'feature.backup.personal-backup-guidance-check-2',
                            )}
                        </Text>
                    }
                    checked={checkbox2}
                    onPress={() => {
                        setCheckbox2(!checkbox2)
                    }}
                />
            </View>

            <Button
                title={t('phrases.i-understand')}
                onPress={() => {
                    navigation.replace('RecoveryWords')
                }}
                disabled={!checkbox1 || !checkbox2}
                containerStyle={styles(theme).confirmButton}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingVertical: theme.spacing.xl,
        },
        checkboxText: {
            paddingHorizontal: theme.spacing.md,
            textAlign: 'left',
        },
        confirmButton: {
            marginTop: theme.spacing.xl,
            width: '90%',
        },
        confirmationContainer: {
            flex: 1,
            alignItems: 'flex-start',
            paddingHorizontal: theme.spacing.md,
            marginHorizontal: 0,
        },
        instructionsText: {
            alignSelf: 'flex-start',
            textAlign: 'left',
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default PersonalBackupGuidance
