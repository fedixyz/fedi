import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { Button, FAB, Image, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    selectIsChatEmpty,
    selectIsMatrixChatEmpty,
    selectMatrixStatus,
    selectNeedsMatrixRegistration,
    selectShouldShowUpgradeChat,
} from '@fedi/common/redux'

import { Images } from '../assets/images'
import ChatsList from '../components/feature/chat/ChatsList'
import UpgradeChat from '../components/feature/chat/UpgradeChat'
import SvgImage from '../components/ui/SvgImage'
import { Tooltip } from '../components/ui/Tooltip'
import { useAppSelector } from '../state/hooks'
import { MatrixSyncStatus } from '../types'
import {
    NavigationHook,
    RootStackParamList,
    TabsNavigatorParamList,
} from '../types/navigation'
import { useDismissIosNotifications } from '../utils/hooks/notifications'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Chat'
>

const ChatScreen: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const syncStatus = useAppSelector(selectMatrixStatus)
    const needsChatRegistration = useAppSelector(selectNeedsMatrixRegistration)
    const shouldShowUpgradeChat = useAppSelector(selectShouldShowUpgradeChat)
    const isLegacyChatEmpty = useAppSelector(selectIsChatEmpty)
    const hasLegacyChatData = !isLegacyChatEmpty

    const isChatEmpty = useAppSelector(selectIsMatrixChatEmpty)
    const [hasOpenedNewChat, completeOpenedNewChat] =
        useNuxStep('hasOpenedNewChat')

    useDismissIosNotifications()

    // TODO: reimplement seen message hook for matrix
    // Use this hook only if the screen is in focus
    // const isFocused = useIsFocused()
    // useUpdateLastMessageSeen(isFocused !== true)

    const style = styles(theme)

    if (syncStatus === MatrixSyncStatus.initialSync) {
        return (
            <View style={style.centerContainer}>
                <ActivityIndicator size={16} color={theme.colors.primary} />
            </View>
        )
    } else if (syncStatus === MatrixSyncStatus.stopped) {
        return (
            <View style={style.centerContainer}>
                <Text style={style.errorText} adjustsFontSizeToFit>
                    {t('errors.chat-connection-unhealthy')}
                </Text>
            </View>
        )
    }

    return (
        <View style={style.container}>
            {shouldShowUpgradeChat ? (
                <ScrollView
                    style={{
                        width: '100%',
                        paddingHorizontal: theme.spacing.lg,
                    }}>
                    <UpgradeChat />
                </ScrollView>
            ) : needsChatRegistration ? (
                <>
                    <View style={style.registration}>
                        <Image
                            resizeMode="contain"
                            source={Images.IllustrationChat}
                            style={style.emptyImage}
                        />
                        <Text
                            h1
                            style={style.registrationText}
                            numberOfLines={1}
                            adjustsFontSizeToFit>
                            {t('feature.chat.need-registration-title')}
                        </Text>
                        <Text
                            style={style.registrationText}
                            adjustsFontSizeToFit>
                            {t('feature.chat.need-registration-description')}
                        </Text>
                        <Button
                            fullWidth
                            title={
                                <Text style={{ color: theme.colors.secondary }}>
                                    {t('words.continue')}
                                </Text>
                            }
                            onPress={() => navigation.push('EnterDisplayName')}
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
                    <Tooltip
                        shouldShow={isChatEmpty && !hasOpenedNewChat}
                        delay={1200}
                        text="New chat"
                        orientation="above"
                        side="right"
                        horizontalOffset={44}
                        verticalOffset={78}
                    />

                    {hasLegacyChatData && (
                        <Button
                            fullWidth
                            type="clear"
                            title={
                                <Text caption medium adjustsFontSizeToFit>
                                    {t('feature.chat.view-archived-chats')}
                                </Text>
                            }
                            onPress={() => navigation.push('LegacyChat')}
                        />
                    )}
                </>
            ) : (
                <ErrorBoundary
                    fallback={() => (
                        <View style={style.centerContainer}>
                            <Text style={style.errorText}>
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
                        <SvgImage
                            name="Plus"
                            color={theme.colors.secondary}
                            maxFontSizeMultiplier={1}
                        />
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
        centerContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        errorText: {
            textAlign: 'center',
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
