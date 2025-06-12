import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectMatrixAuth } from '@fedi/common/redux'

import { NotificationsPermissionGate } from '../components/feature/permissions/NotificationsPermissionGate'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useNotificationContext } from '../state/contexts/NotificationContext'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FederationGreeting'
>

const FederationGreeting: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const { triggerPushNotificationSetup } = useNotificationContext()

    const style = styles(theme)

    const handleContinue = () => {
        triggerPushNotificationSetup() // Trigger FCM token push manually
        navigation.replace('TabsNavigator', {
            initialRouteName: 'Chat',
        })
    }

    return (
        <NotificationsPermissionGate>
            <SafeAreaContainer style={style.container} edges="notop">
                <View style={style.contentContainer}>
                    <View style={style.avatarContainer}>
                        <Avatar
                            id={matrixAuth?.userId || ''}
                            name={matrixAuth?.displayName || '?'}
                            size={AvatarSize.lg}
                            url={matrixAuth?.avatarUrl || undefined}
                        />
                    </View>
                    <Text h2 medium style={style.welcomeTitle}>
                        {`${t('feature.onboarding.nice-to-meet-you', {
                            username: matrixAuth?.displayName,
                        })}!`}
                    </Text>
                    <Text style={style.welcomeText}>
                        {t('feature.onboarding.greeting-instructions')}
                    </Text>
                </View>
                <Button
                    fullWidth
                    title={t('feature.onboarding.continue-to-fedi')}
                    onPress={handleContinue}
                    containerStyle={style.button}
                />
            </SafeAreaContainer>
        </NotificationsPermissionGate>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        button: {
            marginTop: 'auto',
        },
        contentContainer: {
            marginTop: 'auto',
            alignItems: 'center',
        },
        avatarContainer: {
            marginTop: theme.spacing.xl,
            marginBottom: theme.spacing.md,
        },
        welcomeTitle: {
            marginVertical: theme.spacing.md,
            textAlign: 'center',
        },
        welcomeText: {
            textAlign: 'center',
        },
    })

export default FederationGreeting
