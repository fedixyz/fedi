import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useChatsListSearch } from '@fedi/common/hooks/matrix'
import { ChatType, MatrixRoom } from '@fedi/common/types'

import ChatRoomTile from '../components/feature/chat/ChatRoomTile'
import Flex from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatsListSearch'
>

const ChatsListSearch: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { initialQuery } = route.params

    const { query, filteredChatsList } = useChatsListSearch(initialQuery)

    const handleOpenChat = useCallback(
        (chat: MatrixRoom) => {
            navigation.navigate('ChatRoomConversation', {
                roomId: chat.id,
                chatType: chat.directUserId ? ChatType.direct : ChatType.group,
            })
        },
        [navigation],
    )

    const renderChat: ListRenderItem<MatrixRoom> = useCallback(
        ({ item }) => {
            return (
                <ErrorBoundary fallback={null}>
                    <ChatRoomTile room={item} onSelect={handleOpenChat} />
                </ErrorBoundary>
            )
        },
        [handleOpenChat],
    )

    const style = styles(theme)

    return (
        <SafeAreaView style={style.container} edges={['bottom']}>
            {/* only show guidance if the user hasn't typed anything */}
            {!query && (
                <Text medium caption style={style.guidance}>
                    {t('feature.chat.search-chats-list-guidance')}
                </Text>
            )}
            <Flex style={style.resultsContainer}>
                {filteredChatsList.length === 0 ? (
                    <Flex
                        align="center"
                        justify="center"
                        gap={theme.spacing.sm}
                        style={style.emptyState}>
                        <SvgImage
                            name="SearchNoResult"
                            size={64}
                            color={theme.colors.primary}
                        />
                        <Text h2 bold style={style.emptyText}>
                            {t('phrases.no-result')}
                        </Text>
                        <Text medium style={style.emptySubtext}>
                            {t('feature.chat.search-chats-list-no-results')}
                        </Text>
                    </Flex>
                ) : (
                    <FlatList
                        data={filteredChatsList}
                        renderItem={renderChat}
                        keyExtractor={item => `${item.id}`}
                        contentContainerStyle={style.listContent}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </Flex>
        </SafeAreaView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {},
        guidance: {
            color: theme.colors.darkGrey,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
        },
        resultsContainer: {},
        listContent: {
            paddingHorizontal: theme.spacing.sm,
            paddingTop: theme.spacing.sm,
        },
        emptyState: {
            height: '100%',
            paddingHorizontal: theme.spacing.xl,
        },
        emptyText: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
        emptySubtext: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
    })

export default ChatsListSearch
