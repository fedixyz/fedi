import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { SEARCH_PAGINATION_SIZE } from '@fedi/common/constants/matrix'
import { useChatTimelineSearch } from '@fedi/common/hooks/matrix'
import { selectMatrixRoom } from '@fedi/common/redux'
import { SendableMatrixEvent } from '@fedi/common/types'

import ChatMessageTile from '../components/feature/chat/ChatMessageTile'
import Flex from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatConversationSearch'
>

const ChatConversationSearch: React.FC<Props> = ({
    navigation,
    route,
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { roomId } = route.params

    const {
        query,
        searchResults,
        canPaginateFurther,
        handlePaginate,
        isSearching,
        memberLookup,
    } = useChatTimelineSearch(roomId)
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))

    const handleSelectMessage = useCallback(
        (event: SendableMatrixEvent) => {
            // Navigate back to the conversation and scroll to the selected message
            navigation.navigate('ChatRoomConversation', {
                roomId,
                scrollToMessageId: event.id,
            })
        },
        [navigation, roomId],
    )

    const handleLoadMore = useCallback(() => {
        if (canPaginateFurther && !isSearching) {
            handlePaginate(SEARCH_PAGINATION_SIZE)
        }
    }, [canPaginateFurther, isSearching, handlePaginate])

    const style = styles(theme)

    const renderMessage: ListRenderItem<SendableMatrixEvent> = useCallback(
        ({ item }) => {
            return (
                <ErrorBoundary fallback={null}>
                    {room && (
                        <ChatMessageTile
                            event={item}
                            room={room}
                            senderDisplayName={memberLookup[item.sender]}
                            searchQuery={query}
                            onSelect={handleSelectMessage}
                        />
                    )}
                </ErrorBoundary>
            )
        },
        [memberLookup, query, handleSelectMessage, room],
    )

    const renderFooter = useCallback(() => {
        // don't show load more button if there is no query
        if (!query) return null
        // don't show load more button if we can't search further
        if (!canPaginateFurther) return null

        return (
            <View style={style.loadMoreContainer}>
                <Button
                    day
                    fullWidth
                    containerStyle={
                        (style.loadMoreButton,
                        isSearching && style.loadMoreButtonDisabled)
                    }
                    disabled={isSearching}
                    onPress={handleLoadMore}>
                    <Text style={style.loadMoreText}>
                        {isSearching
                            ? t('words.loading')
                            : t('phrases.load-more')}
                    </Text>
                </Button>
            </View>
        )
    }, [canPaginateFurther, isSearching, handleLoadMore, t, style, query])

    const renderEmptyState = useCallback(() => {
        if (!query) return null
        if (isSearching) return null
        return (
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
            </Flex>
        )
    }, [t, theme, style, query, isSearching])

    return (
        <SafeAreaView style={style.container} edges={['bottom']}>
            <Flex style={style.resultsContainer}>
                <FlatList
                    data={searchResults as SendableMatrixEvent[]}
                    renderItem={renderMessage}
                    keyExtractor={item => `${item.id}`}
                    contentContainerStyle={style.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmptyState}
                    ListFooterComponent={renderFooter}
                />
                {isSearching && searchResults.length === 0 && (
                    <Flex
                        align="center"
                        justify="center"
                        style={style.loadingState}>
                        <Text medium style={style.loadingText}>
                            {`${t('words.searching')}...`}
                        </Text>
                    </Flex>
                )}
            </Flex>
        </SafeAreaView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        guidance: {
            color: theme.colors.darkGrey,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
        },
        resultsContainer: {
            flex: 1,
        },
        listContent: {
            paddingHorizontal: theme.spacing.xs,
            paddingTop: theme.spacing.sm,
        },
        emptyState: {
            height: '100%',
            margin: 'auto',
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
        loadingState: {
            height: '80%',
            paddingHorizontal: theme.spacing.xl,
        },
        loadingText: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
        loadMoreContainer: {
            padding: theme.spacing.lg,
        },
        loadMoreButton: {},
        loadMoreButtonDisabled: {
            opacity: 0.6,
        },
        loadMoreText: {
            color: theme.colors.primary,
        },
    })

export default ChatConversationSearch
