import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    ImageBackground,
    StyleSheet,
    useWindowDimensions,
    Linking,
    Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useToast } from '@fedi/common/hooks/toast'
import { refreshOnboardingStatus, selectRedirectTo } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { Images } from '../assets/images'
import { fedimint } from '../bridge'
import Flex from '../components/ui/Flex'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { usePinContext } from '../state/contexts/PinContext'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import { useLaunchZendesk } from '../utils/hooks/support'
import { getRouteItemFromUrl } from '../utils/linking'

const log = makeLog('Splash')

export type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>

const Splash: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { fontScale } = useWindowDimensions()
    const pin = usePinContext()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const [loading, setLoading] = useState<boolean>(false)
    const redirectTo = useAppSelector(selectRedirectTo)

    const [hasNavigatedToHelpCentre, setHasNavigatedToHelpCentre] =
        useState<boolean>(false)
    const { launchZendesk } = useLaunchZendesk()

    const handleContinue = async () => {
        try {
            setLoading(true)
            await fedimint.completeOnboardingNewSeed()
            const status = await dispatch(
                refreshOnboardingStatus(fedimint),
            ).unwrap()
            log.debug('onboarding status after new seed', status)

            if (redirectTo) {
                const result = getRouteItemFromUrl(redirectTo)
                if (!result) {
                    throw new Error('Invalid redirectTo URL')
                }

                const { name, params } = result

                navigation.reset({
                    index: 0,
                    routes: [
                        {
                            name,
                            params,
                        },
                    ],
                })
            } else {
                navigation.reset({
                    index: 0,
                    routes: [
                        {
                            name: 'PublicFederations',
                            params: { from: 'Splash' },
                        },
                    ],
                })
            }
        } catch (err) {
            log.error('handleContinue', err)
            toast.error(t, err, 'errors.unknown-error')
        } finally {
            setLoading(false)
        }
    }

    const handleReturningUser = async () => {
        navigation.navigate('ChooseRecoveryMethod')
    }

    // PINs are stored in the keychain and persist between app installs
    // so if we are on the Splash screen and a PIN is set, we need to clear it
    useEffect(() => {
        if (pin.status === 'set') {
            log.info('Persisted PIN found from past install, clearing it.')
            pin.unset()
        }
    }, [pin])

    const style = styles(theme, fontScale)
    return (
        <ImageBackground
            source={Images.WelcomeBackground}
            style={style.container}>
            <SafeAreaView style={style.content}>
                <Flex
                    grow
                    shrink
                    center
                    gap="sm"
                    fullWidth
                    style={style.welcomeContainer}>
                    <Flex center style={style.iconContainer}>
                        <SvgImage size={SvgImageSize.lg} name="FediLogoIcon" />
                    </Flex>
                    <Text style={style.title}>
                        {t('feature.onboarding.fedi')}
                    </Text>
                    <Text style={style.welcomeText}>
                        {t('feature.onboarding.tagline')}
                    </Text>
                </Flex>

                <Flex
                    grow={false}
                    shrink
                    align="center"
                    justify="evenly"
                    gap="md"
                    fullWidth>
                    <Text style={style.agreementText} small>
                        <Trans
                            i18nKey="feature.onboarding.agree-terms-privacy"
                            components={{
                                termsLink: (
                                    <Text
                                        small
                                        style={style.agreementLink}
                                        onPress={() =>
                                            navigation.navigate('Eula')
                                        }
                                    />
                                ),
                                privacyLink: (
                                    <Text
                                        small
                                        style={style.agreementLink}
                                        onPress={() =>
                                            Linking.openURL(
                                                'https://www.fedi.xyz/privacy-policy',
                                            )
                                        }
                                    />
                                ),
                            }}
                        />
                    </Text>
                    <Button
                        fullWidth
                        title={t('phrases.get-started')}
                        onPress={handleContinue}
                        loading={loading}
                    />
                    <Button
                        fullWidth
                        onPress={handleReturningUser}
                        day
                        title={t('phrases.recover-my-account')}
                    />
                    <Flex align="center" justify="evenly" gap="xs" row>
                        <Text style={style.helpText}>
                            {t('feature.onboarding.need-help')}
                        </Text>
                        <Pressable
                            style={{
                                flexDirection: 'row',
                                alignContent: 'center',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onPress={() => {
                                if (hasNavigatedToHelpCentre) {
                                    launchZendesk()
                                } else {
                                    setHasNavigatedToHelpCentre(true)
                                    navigation.navigate({
                                        name: 'HelpCentre',
                                        params: { fromOnboarding: true },
                                    })
                                }
                            }}>
                            <SvgImage
                                color={theme.colors.night}
                                size={SvgImageSize.xs}
                                name="SmileMessage"
                            />
                            <Text style={style.askFediText}>
                                {t('feature.support.title')}
                            </Text>
                        </Pressable>
                    </Flex>
                </Flex>
            </SafeAreaView>
        </ImageBackground>
    )
}

const styles = (theme: Theme, fontScale: number) =>
    StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'flex-end',
        },
        content: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: theme.spacing.xl,
        },
        welcomeContainer: {
            flexBasis: 'auto',
            maxWidth: 320 * Math.max(fontScale, 1),
            paddingHorizontal: theme.spacing.xl,
        },
        iconContainer: {
            marginBottom: theme.spacing.lg,
            width: 32,
            height: 32,
        },
        title: {
            textAlign: 'center',
            fontWeight: '700',
            fontSize: 30,
        },
        welcomeText: {
            textAlign: 'center',
        },
        agreementLink: {
            color: theme.colors.link,
        },
        agreementText: {
            textAlign: 'center',
            width: '70%',
            color: theme.colors.darkGrey,
            fontSize: 12,
            fontWeight: '400',
        },
        helpText: {
            fontSize: 14,
            color: theme.colors.darkGrey,
            lineHeight: 16,
            fontWeight: '400',
            marginRight: 2,
        },
        askFediText: {
            fontSize: 14,
            fontWeight: '500',
            color: theme.colors.night,
            lineHeight: 20,
            marginLeft: 4,
        },
    })

export default Splash
