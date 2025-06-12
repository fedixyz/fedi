import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { Button, FAB, Image, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    selectIsMatrixChatEmpty,
    selectMatrixStatus,
    selectNeedsMatrixRegistration,
} from '@fedi/common/redux'

import { Images } from '../assets/images'
import ChatsList from '../components/feature/chat/ChatsList'
import FirstTimeCommunityEntryOverlay, {
    FirstTimeCommunityEntryItem,
} from '../components/feature/federations/FirstTimeCommunityEntryOverlay'
import Flex from '../components/ui/Flex'
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

    const isChatEmpty = useAppSelector(selectIsMatrixChatEmpty)
    const [hasOpenedNewChat, completeOpenedNewChat] =
        useNuxStep('hasOpenedNewChat')

    const [hasSeenChat, completeSeenChat] = useNuxStep('chatModal')

    useDismissIosNotifications()

    const chatFirstTimeOverlayItems: FirstTimeCommunityEntryItem[] = [
        { icon: 'SpeakerPhone', text: t('feature.chat.first-entry-option-1') },
        { icon: 'Wallet', text: t('feature.chat.first-entry-option-2') },
    ]
    const style = styles(theme)

    if (syncStatus === MatrixSyncStatus.initialSync) {
        return (
            <Flex grow center>
                <ActivityIndicator size={16} color={theme.colors.primary} />
            </Flex>
        )
    }

    if (syncStatus === MatrixSyncStatus.stopped) {
        return (
            <Flex grow center>
                <Text style={style.errorText} adjustsFontSizeToFit>
                    {t('errors.chat-connection-unhealthy')}
                </Text>
            </Flex>
        )
    }

    return (
        <Flex grow center>
            {needsChatRegistration ? (
                <Flex grow center fullWidth style={style.registration}>
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
                    <Text style={style.registrationText} adjustsFontSizeToFit>
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
                </Flex>
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
                        text={t('feature.chat.new-chat')}
                        orientation="above"
                        side="right"
                        horizontalOffset={44}
                        verticalOffset={78}
                    />
                </>
            ) : (
                <ErrorBoundary
                    fallback={() => (
                        <Flex grow center>
                            <Text style={style.errorText}>
                                {t('errors.chat-list-render-error')}
                            </Text>
                        </Flex>
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

            <FirstTimeCommunityEntryOverlay
                overlayItems={chatFirstTimeOverlayItems}
                title={t('feature.chat.first-entry')}
                show={!hasSeenChat}
                onDismiss={completeSeenChat}
            />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        emptyImage: {
            width: 200,
            height: 200,
            marginBottom: theme.spacing.xxl,
        },
        actionButton: {
            elevation: 4,
            shadowRadius: 4,
            shadowColor: theme.colors.primary,
        },
        errorText: { textAlign: 'center' },
        registration: {
            maxWidth: 320,
        },
        registrationText: {
            textAlign: 'center',
            marginBottom: theme.spacing.lg,
        },
    })

export default ChatScreen
