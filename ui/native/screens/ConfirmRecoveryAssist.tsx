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
    'ConfirmRecoveryAssist'
>

const ConfirmRecoveryAssist: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [memberSafetyConfirmed, setMemberSafetyConfirmed] = useState(false)
    const [surroundingsSafetyConfirmed, setSurroundingsSafetyConfirmed] =
        useState(false)

    return (
        <View style={styles(theme).container}>
            <Text h2 style={styles(theme).instructionsText}>
                {t('phrases.please-confirm')}
            </Text>
            <LineBreak />
            <View style={styles(theme).confirmationContainer}>
                <CheckBox
                    title={
                        <Text caption medium style={styles(theme).checkboxText}>
                            {t(
                                'feature.recovery.recovery-assist-confirm-check-1',
                            )}
                        </Text>
                    }
                    checked={memberSafetyConfirmed}
                    onPress={() => {
                        setMemberSafetyConfirmed(!memberSafetyConfirmed)
                    }}
                />
                <CheckBox
                    title={
                        <Text caption medium style={styles(theme).checkboxText}>
                            {t(
                                'feature.recovery.recovery-assist-confirm-check-2',
                            )}
                        </Text>
                    }
                    checked={surroundingsSafetyConfirmed}
                    onPress={() => {
                        setSurroundingsSafetyConfirmed(
                            !surroundingsSafetyConfirmed,
                        )
                    }}
                />
            </View>

            <Button
                title={t('words.continue')}
                onPress={() => {
                    navigation.replace('ScanSocialRecoveryCode')
                }}
                disabled={
                    !surroundingsSafetyConfirmed || !memberSafetyConfirmed
                }
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

export default ConfirmRecoveryAssist
