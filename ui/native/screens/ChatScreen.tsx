import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixStatus } from '@fedi/common/redux'

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

    useDismissIosNotifications()

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
                <Text center adjustsFontSizeToFit>
                    {t('errors.chat-connection-unhealthy')}
                </Text>
            </Column>
        )
    }

    return (
        <Column grow center>
            <ErrorBoundary
                fallback={() => (
                    <Column grow center>
                        <Text center>{t('errors.chat-list-render-error')}</Text>
                    </Column>
                )}>
                <ChatsList />
            </ErrorBoundary>
        </Column>
    )
}

export default ChatScreen
