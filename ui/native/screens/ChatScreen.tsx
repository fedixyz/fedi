import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { Button, FAB, Image, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useUpdateLastMessageSeen } from '@fedi/common/hooks/chat'
import { useIsChatSupported } from '@fedi/common/hooks/federation'
import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    fetchChatMembers,
    selectActiveFederationId,
    selectIsChatEmpty,
    selectNeedsChatRegistration,
    selectWebsocketIsHealthy,
} from '@fedi/common/redux'

import { Images } from '../assets/images'
import ChatsList from '../components/feature/chat/ChatsList'
import { NuxTooltip } from '../components/ui/NuxTooltip'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import {
    NavigationHook,
    RootStackParamList,
    TabsNavigatorParamList,
} from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Chat'
>

const ChatScreen: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const isFocused = useIsFocused()
    const websocketIsHealthy = useAppSelector(selectWebsocketIsHealthy)
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const isChatSupported = useIsChatSupported()
    const needsChatRegistration = useAppSelector(selectNeedsChatRegistration)
    const isChatEmpty = useAppSelector(selectIsChatEmpty)
    const [hasOpenedNewChat, completeOpenedNewChat] =
        useNuxStep('hasOpenedNewChat')

    // Navigate back to home screen if this federation doesn't support chat
    useEffect(() => {
        if (!isChatSupported) {
            navigation.dispatch(reset('TabsNavigator'))
        }
    }, [isChatSupported, navigation])

    useEffect(() => {
        if (websocketIsHealthy && activeFederationId) {
            // Here we fetch the roster and store the results in local storage
            dispatch(fetchChatMembers({ federationId: activeFederationId }))
        }
    }, [activeFederationId, dispatch, websocketIsHealthy])

    // Use this hook only if the screen is in focus
    useUpdateLastMessageSeen(isFocused !== true)

    const style = styles(theme)
    return (
        <View style={style.container}>
            {needsChatRegistration ? (
                <>
                    <View style={style.registration}>
                        <Image
                            resizeMode="contain"
                            source={Images.IllustrationChat}
                            style={style.emptyImage}
                        />
                        <Text h1 style={style.registrationText}>
                            {t('feature.chat.need-registration-title')}
                        </Text>
                        <Text style={style.registrationText}>
                            {t('feature.chat.need-registration-description')}
                        </Text>
                        <Button
                            fullWidth
                            title={t('feature.chat.register-a-username')}
                            onPress={() => navigation.push('CreateUsername')}
                        />
                    </View>
                </>
            ) : isChatEmpty ? (
                <>
                    <Image
                        resizeMode="contain"
                        source={Images.IllustrationChat}
                        style={style.emptyImage}
                    />
                    <NuxTooltip
                        shouldShow={isChatEmpty && !hasOpenedNewChat}
                        delay={1200}
                        text="New chat"
                        orientation="above"
                        side="right"
                        horizontalOffset={44}
                        verticalOffset={78}
                    />
                </>
            ) : (
                <ErrorBoundary
                    fallback={() => (
                        <View style={style.errorContainer}>
                            <Text style={style.error}>
                                {t('errors.chat-list-render-error')}
                            </Text>
                        </View>
                    )}>
                    <ChatsList />
                </ErrorBoundary>
            )}

            {!needsChatRegistration && (
                <FAB
                    icon={
                        <SvgImage name="Plus" color={theme.colors.secondary} />
                    }
                    color={theme.colors.blue}
                    style={style.actionButton}
                    size="large"
                    placement="right"
                    onPress={() => {
                        navigation.navigate('NewMessage')
                        completeOpenedNewChat()
                    }}
                />
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyImage: {
            width: 200,
            height: 200,
            marginBottom: theme.spacing.xxl,
        },
        actionContainer: {},
        actionButton: {
            elevation: 4,
            shadowRadius: 4,
            shadowColor: theme.colors.primary,
        },
        errorContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        error: {
            color: theme.colors.red,
        },
        registration: {
            flex: 1,
            width: '100%',
            maxWidth: 320,
            justifyContent: 'center',
            alignItems: 'center',
        },
        registrationText: {
            textAlign: 'center',
            marginBottom: theme.spacing.lg,
        },
    })

export default ChatScreen
