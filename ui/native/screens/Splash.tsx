import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
    ImageBackground,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { makeLog } from '@fedi/common/utils/log'

import { Images } from '../assets/images'
import CustomOverlay from '../components/ui/CustomOverlay'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { usePinContext } from '../state/contexts/PinContext'
import { RootStackParamList } from '../types/navigation'

const log = makeLog('Splash')

export type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>

const Splash: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { fontScale } = useWindowDimensions()
    const [showOverlay, setShowOverlay] = useState(false)
    const pin = usePinContext()

    const handleContinue = async () => {
        setShowOverlay(true)
    }
    const handleNewUser = async () => {
        navigation.navigate('EnterDisplayName')
        setShowOverlay(false)
    }
    const handleReturningUser = async () => {
        navigation.navigate('ChooseRecoveryMethod')
        setShowOverlay(false)
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
                <View style={style.welcomeContainer}>
                    <View style={style.iconContainer}>
                        <SvgImage size={SvgImageSize.lg} name="FediLogoIcon" />
                    </View>
                    <Text h2 medium style={style.welcomeText}>
                        {t('feature.onboarding.welcome-to-fedi')}
                    </Text>
                    <Text style={style.welcomeText}>
                        {t('feature.onboarding.guidance-1')}
                    </Text>
                </View>

                <View style={style.buttonsContainer}>
                    <Button
                        fullWidth
                        testID="JoinFederationButton"
                        title={t('words.continue')}
                        onPress={handleContinue}
                    />
                    <Text style={style.agreementText} small>
                        <Trans
                            i18nKey="feature.onboarding.by-clicking-you-agree-user-agreement"
                            components={{
                                anchor: (
                                    <Text
                                        small
                                        style={style.agreementLink}
                                        onPress={() =>
                                            navigation.navigate('Eula')
                                        }
                                    />
                                ),
                            }}
                        />
                    </Text>
                </View>
                <CustomOverlay
                    show={showOverlay}
                    onBackdropPress={() => setShowOverlay(false)}
                    contents={{
                        body: (
                            <View style={style.overlayContainer}>
                                <Text h1>{'👋'}</Text>
                                <Text h2>
                                    {t('feature.onboarding.are-you-new')}
                                </Text>
                                <View style={style.overlayButtonsContainer}>
                                    <Button
                                        fullWidth
                                        onPress={handleNewUser}
                                        title={t(
                                            'feature.onboarding.yes-create-account',
                                        )}
                                    />
                                    <Button
                                        fullWidth
                                        onPress={handleReturningUser}
                                        day
                                        title={t(
                                            'feature.onboarding.im-returning',
                                        )}
                                    />
                                </View>
                            </View>
                        ),
                    }}
                />
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
        buttonsContainer: {
            flexGrow: 0,
            flexShrink: 1,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-evenly',
            gap: theme.spacing.xl,
        },
        welcomeContainer: {
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 'auto',
            width: '100%',
            maxWidth: 320 * Math.max(fontScale, 1),
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.xl,
        },
        overlayContainer: {
            width: '100%',
            alignItems: 'center',
            gap: 16,
        },
        overlayButtonsContainer: {
            marginTop: theme.spacing.lg,
            width: '100%',
            gap: 16,
        },
        iconContainer: {
            marginBottom: theme.spacing.lg,
            width: 32,
            height: 32,
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
        },
    })

export default Splash
