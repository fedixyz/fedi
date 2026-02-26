import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { Image, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectIsMatrixChatEmpty, selectMatrixStatus } from '@fedi/common/redux'

import { Images } from '../assets/images'
import ChatsList from '../components/feature/chat/ChatsList'
import { Column } from '../components/ui/Flex'
import { useAppSelector } from '../state/hooks'
import { MatrixSyncStatus } from '../types'
import { RootStackParamList, TabsNavigatorParamList } from '../types/navigation'
import { useDismissIosNotifications } from '../utils/hooks/notifications'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'Chat'
>

const ChatScreen: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const syncStatus = useAppSelector(selectMatrixStatus)

    const isChatEmpty = useAppSelector(selectIsMatrixChatEmpty)

    useDismissIosNotifications()

    const style = styles(theme)

    if (syncStatus === MatrixSyncStatus.initialSync) {
        return (
            <Column grow center>
                <ActivityIndicator size={16} color={theme.colors.primary} />
            </Column>
        )
    }

    if (syncStatus === MatrixSyncStatus.stopped) {
        return (
            <Column grow center>
                <Text style={style.errorText} adjustsFontSizeToFit>
                    {t('errors.chat-connection-unhealthy')}
                </Text>
            </Column>
        )
    }

    return (
        <Column grow center>
            {isChatEmpty ? (
                <>
                    <Image
                        resizeMode="contain"
                        source={Images.IllustrationChat}
                        style={style.emptyImage}
                    />
                </>
            ) : (
                <ErrorBoundary
                    fallback={() => (
                        <Column grow center>
                            <Text style={style.errorText}>
                                {t('errors.chat-list-render-error')}
                            </Text>
                        </Column>
                    )}>
                    <ChatsList />
                </ErrorBoundary>
            )}
        </Column>
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
