import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { selectAuthenticatedGuardian } from '@fedi/common/redux'

import { Column, Row } from '../components/ui/Flex'
import GradientView from '../components/ui/GradientView'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StartRecoveryAssist'
>

const StartRecoveryAssist: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()

    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    const style = styles(theme)

    const steps = [
        t('feature.recovery.recovery-assist-step-1'),
        t('feature.recovery.recovery-assist-step-2'),
        t('feature.recovery.recovery-assist-step-3'),
        t('feature.recovery.recovery-assist-step-4'),
    ]

    const handleContinue = () => {
        if (!authenticatedGuardian) {
            return toast.error(t, 'errors.failed-to-authenticate-guardian')
        }
        navigation.navigate('ScanSocialRecoveryCode')
    }

    return (
        <SafeAreaContainer edges="bottom">
            <Column style={style.container}>
                <Column align="center" gap="lg" grow style={style.content}>
                    <GradientView variant="sky-banner" style={style.heroIcon}>
                        <SvgImage name="Keyring" size={SvgImageSize.lg} />
                    </GradientView>
                    <Text numberOfLines={2} center style={style.title}>
                        {t('feature.recovery.recovery-assist-title')}
                    </Text>
                    <Text numberOfLines={2} center style={style.subtitle}>
                        {t('feature.recovery.recovery-assist-subtitle')}
                    </Text>
                    <View style={style.boxOutline}>
                        <Text h4 bold>
                            {t('words.steps')}
                        </Text>
                        <Column gap="md" style={style.steps}>
                            {steps.map((step, index) => (
                                <Row align="center" gap="sm" key={step}>
                                    <GradientView
                                        variant="sky-banner"
                                        style={style.stepNumberWrapper}>
                                        <Text small bold>
                                            {index + 1}
                                        </Text>
                                    </GradientView>
                                    <Text caption style={{ flexShrink: 1 }}>
                                        {step}
                                    </Text>
                                </Row>
                            ))}
                        </Column>
                    </View>
                </Column>
                <Button title={t('words.continue')} onPress={handleContinue} />
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            padding: theme.spacing.xl,
        },
        content: {},
        heroIcon: {
            alignItems: 'center',
            borderRadius: 40,
            display: 'flex',
            justifyContent: 'center',
            height: 80,
            width: 80,
        },
        title: {
            fontSize: 24,
            fontWeight: '500',
        },
        subtitle: {
            color: theme.colors.darkGrey,
            fontSize: 15,
        },
        iconBackground: {
            alignItems: 'center',
            borderRadius: 1024,
            display: 'flex',
            flexDirection: 'row',
            height: 80,
            justifyContent: 'center',
            overflow: 'hidden',
            width: 80,
        },
        boxOutline: {
            borderColor: theme.colors.extraLightGrey,
            borderRadius: theme.borders.defaultRadius,
            borderWidth: 1,
            padding: theme.spacing.lg,
            width: '100%',
        },
        steps: {
            paddingBottom: theme.spacing.md,
            paddingTop: theme.spacing.md,
            width: '100%',
        },
        stepNumberWrapper: {
            alignItems: 'center',
            borderRadius: 15,
            display: 'flex',
            justifyContent: 'center',
            height: 30,
            width: 30,
        },
    })

export default StartRecoveryAssist
