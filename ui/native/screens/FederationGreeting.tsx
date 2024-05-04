import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Insets, StyleSheet, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { selectMatrixAuth } from '@fedi/common/redux'

import { NotificationsPermissionGate } from '../components/feature/permissions/NotificationsPermissionGate'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FederationGreeting'
>

const FederationGreeting: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const style = styles(theme, insets)
    return (
        <NotificationsPermissionGate>
            <SafeAreaView edges={['left', 'right']} style={style.container}>
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
                    onPress={() => {
                        navigation.replace('TabsNavigator', {
                            initialRouteName: 'Chat',
                        })
                    }}
                    containerStyle={style.button}
                />
            </SafeAreaView>
        </NotificationsPermissionGate>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
            paddingBottom: Math.max(theme.spacing.xl, insets.bottom || 0),
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
        roundedCardContainer: {
            marginTop: 'auto',
            borderRadius: theme.borders.defaultRadius,
            width: '100%',
            marginHorizontal: 0,
            padding: theme.spacing.xl,
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
