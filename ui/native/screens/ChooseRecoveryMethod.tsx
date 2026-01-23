import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, ScrollView, StyleSheet } from 'react-native'

import { Images } from '../assets/images'
import { Column } from '../components/ui/Flex'
import GradientView from '../components/ui/GradientView'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChooseRecoveryMethod'
>

const ChooseRecoveryMethod: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <ScrollView contentContainerStyle={style.container}>
            <Text style={style.instructionsText}>
                {t('feature.recovery.choose-method-instructions')}
            </Text>
            <Column align="center" gap="md" style={style.box}>
                <GradientView variant="sky-banner" style={style.iconWrapper}>
                    <Image
                        source={Images.ProfileSecurityIcon}
                        style={{ height: 40, width: 40 }}
                    />
                </GradientView>
                <Text h2 medium>
                    {t('feature.recovery.personal-recovery')}
                </Text>
                <Text center style={{ color: theme.colors.darkGrey }}>
                    {t('feature.recovery.personal-recovery-method')}
                </Text>
                <Button
                    fullWidth
                    title={t('feature.recovery.start-personal-recovery')}
                    onPress={() => navigation.navigate('PersonalRecovery')}
                />
            </Column>
            <Column align="center" gap="md" style={style.box}>
                <GradientView variant="sky-banner" style={style.iconWrapper}>
                    <Image
                        source={Images.SocialRecoveryIcon}
                        style={{ height: 40, width: 40 }}
                    />
                </GradientView>
                <Text h2 medium>
                    {t('feature.recovery.social-recovery')}
                </Text>
                <Text center style={{ color: theme.colors.darkGrey }}>
                    {t('feature.recovery.social-recovery-method')}
                </Text>
                <Button
                    fullWidth
                    day
                    title={t('feature.recovery.start-social-recovery')}
                    onPress={() => navigation.navigate('LocateSocialRecovery')}
                />
            </Column>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
            gap: theme.spacing.md,
        },
        instructionsText: {
            color: theme.colors.darkGrey,
            marginBottom: theme.spacing.xl,
            textAlign: 'center',
        },
        box: {
            borderRadius: theme.borders.defaultRadius,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
            padding: theme.spacing.lg,
            width: '100%',
        },
        iconWrapper: {
            alignItems: 'center',
            borderRadius: 40,
            display: 'flex',
            justifyContent: 'center',
            height: 80,
            width: 80,
        },
    })

export default ChooseRecoveryMethod
