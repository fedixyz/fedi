import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import CheckBox from '../components/ui/CheckBox'
import { Column } from '../components/ui/Flex'
import LineBreak from '../components/ui/LineBreak'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmRecoveryAssist'
>

const ConfirmRecoveryAssist: React.FC<Props> = ({
    navigation,
    route,
}: Props) => {
    const { federationId } = route.params
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [memberSafetyConfirmed, setMemberSafetyConfirmed] = useState(false)
    const [surroundingsSafetyConfirmed, setSurroundingsSafetyConfirmed] =
        useState(false)

    const style = styles(theme)

    return (
        <Column grow align="center" justify="start" style={style.container}>
            <Text h2 style={style.instructionsText}>
                {t('phrases.please-confirm')}
            </Text>
            <LineBreak />
            <Column grow align="start" style={style.confirmationContainer}>
                <CheckBox
                    title={
                        <Text caption medium style={style.checkboxText}>
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
                        <Text caption medium style={style.checkboxText}>
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
            </Column>

            <Button
                title={t('words.continue')}
                onPress={() => {
                    navigation.replace('ScanSocialRecoveryCode', {
                        federationId,
                    })
                }}
                disabled={
                    !surroundingsSafetyConfirmed || !memberSafetyConfirmed
                }
                containerStyle={style.confirmButton}
            />
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
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
