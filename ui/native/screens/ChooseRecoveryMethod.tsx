import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import HoloCard from '../components/ui/HoloCard'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChooseRecoveryMethod'
>

const ChooseRecoveryMethod: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const onChooseSocialRecovery = () => {
        navigation.navigate('LocateSocialRecovery')
    }

    const style = styles(theme)

    return (
        <ScrollView contentContainerStyle={style.container}>
            <Text style={style.instructionsText}>
                {t('feature.recovery.choose-method-instructions')}
            </Text>
            <HoloCard
                iconImage={<SvgImage name="SocialPeople" />}
                title={t('feature.recovery.social-recovery')}
                body={
                    <>
                        <Text style={style.recoveryMethodInstructions}>
                            {t('feature.recovery.social-recovery-method')}
                        </Text>
                        <Button
                            title={t('feature.recovery.start-social-recovery')}
                            containerStyle={style.recoveryMethodButton}
                            onPress={onChooseSocialRecovery}
                        />
                    </>
                }
            />
            <LineBreak />
            <HoloCard
                iconImage={<SvgImage name="Note" />}
                title={t('feature.recovery.personal-recovery')}
                body={
                    <>
                        <Text style={style.recoveryMethodInstructions}>
                            {t('feature.recovery.personal-recovery-method')}
                        </Text>
                        <Button
                            title={t(
                                'feature.recovery.start-personal-recovery',
                            )}
                            containerStyle={style.recoveryMethodButton}
                            onPress={() => {
                                navigation.navigate('PersonalRecovery')
                            }}
                        />
                    </>
                }
            />
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
        },
        instructionsText: {
            textAlign: 'center',
            marginBottom: theme.spacing.xl,
            paddingHorizontal: theme.spacing.md,
        },
        recoveryMethodButton: {
            width: '100%',
            marginTop: theme.spacing.md,
        },
        recoveryMethodInstructions: {
            textAlign: 'center',
            paddingVertical: theme.spacing.xs,
        },
    })

export default ChooseRecoveryMethod
