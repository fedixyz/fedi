import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { selectFederations } from '@fedi/common/redux'

import CircleLogo from '../components/ui/CircleLogo'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>

const Splash: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { fontScale } = useWindowDimensions()
    const hasFederations = useAppSelector(selectFederations).length > 0

    const handleNewUser = async () => {
        navigation.navigate('JoinFederation', { invite: undefined })
    }
    const handleReturningUser = async () => {
        navigation.navigate('ChooseRecoveryMethod')
    }

    const style = styles(theme, fontScale)
    return (
        <SafeAreaView style={style.container}>
            <View style={style.welcomeContainer}>
                <View style={style.iconContainer}>
                    <CircleLogo />
                </View>
                <Text h2 medium style={style.welcomeText}>
                    {t('feature.onboarding.welcome-to-fedi')}
                </Text>
                <Text style={style.welcomeText}>
                    {t('feature.onboarding.guidance-1')}
                </Text>
            </View>

            <View style={style.buttonsContainer}>
                {!hasFederations && (
                    <Button
                        fullWidth
                        type="outline"
                        buttonStyle={style.returnButton}
                        title={t('feature.onboarding.join-returning-member')}
                        onPress={handleReturningUser}
                    />
                )}
                <Button
                    fullWidth
                    testID="JoinFederationButton"
                    title={t('feature.federations.join-federation')}
                    onPress={handleNewUser}
                />
                <Text style={style.agreementText} small>
                    <Trans
                        i18nKey="feature.onboarding.by-clicking-you-agree-user-agreement"
                        components={{
                            anchor: (
                                <Text
                                    small
                                    style={style.agreementLink}
                                    onPress={() => navigation.navigate('Eula')}
                                />
                            ),
                        }}
                    />
                </Text>
            </View>
        </SafeAreaView>
    )
}

const styles = (theme: Theme, fontScale: number) =>
    StyleSheet.create({
        container: {
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
        backgroundImage: {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
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
        returnButton: {
            backgroundColor: theme.colors.offWhite100,
            borderWidth: 0,
        },
        iconContainer: {
            marginBottom: theme.spacing.lg,
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
