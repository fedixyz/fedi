import { RouteProp, useRoute } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Animated,
    Easing,
    FlatList,
    ListRenderItem,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    StyleSheet,
} from 'react-native'

import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    matchAndHidePreviewMedia,
    selectCanReply,
    selectIsDefaultGroup,
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixRoomEvents,
    selectMatrixRoomEventsHaveLoaded,
    selectMatrixRoomIsBlocked,
    selectMatrixRoomMembers,
    selectMatrixRoomMembersCount,
    selectMatrixRoomMembersHaveLoaded,
    selectMatrixRoomRawEvents,
    selectPreviewMedia,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'
import { isImageEvent, isVideoEvent } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { RootStackParamList } from '../../../types/navigation'
import {
    ChatConversationRow,
    makeChatConversationRows,
} from '../../../utils/chatConversationRows'
import { Column } from '../../ui/Flex'
import ChatConversationEventRow from './ChatConversationEventRow'
import { ChatUserActionsOverlay } from './ChatUserActionsOverlay'
import NoMembersNotice from './NoMembersNotice'
import NoMessagesNotice from './NoMessagesNotice'
import {
    ConversationListRefOverride,
    ConversationMessageVisibilityContext,
    ScrollToMessageRequest,
    useConversationMessageFocus,
} from './useConversationMessageFocus'

type MessagesListProps = {
    type: ChatType
    id: string
    multiUserChat?: boolean
    isPublic?: boolean
    newMessageBottomOffset: number
    replyBarOffset?: number
    connectionRequestPending?: boolean
    listRefOverride?: ConversationListRefOverride
    scrollToMessageRequest?: ScrollToMessageRequest | null
    onScrollToMessageComplete?: (eventId: string) => void
}

type ChatRoomConversationRouteProp = RouteProp<
    RootStackParamList,
    'ChatRoomConversation'
>

const ChatConversation: React.FC<MessagesListProps> = ({
    type,
    id,
    isPublic = true,
    newMessageBottomOffset = 90,
    replyBarOffset = 0,
    connectionRequestPending = false,
    listRefOverride,
    scrollToMessageRequest = null,
    onScrollToMessageComplete,
}: MessagesListProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const route = useRoute<ChatRoomConversationRouteProp>()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const room = useAppSelector(s => selectMatrixRoom(s, id))
    const previewMedia = useAppSelector(selectPreviewMedia)
    const hasLoadedEvents = useAppSelector(s =>
        selectMatrixRoomEventsHaveLoaded(s, id),
    )
    const hasLoadedMembers = useAppSelector(s =>
        selectMatrixRoomMembersHaveLoaded(s, id),
    )
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, id))
    const canSwipe = useAppSelector(s => selectCanReply(s, id))
    const isDefault = useAppSelector(s => selectIsDefaultGroup(s, id))
    const isAlone =
        useAppSelector(s => selectMatrixRoomMembersCount(s, id)) === 1
    const isBlocked = useAppSelector(s => selectMatrixRoomIsBlocked(s, id))
    const events = useAppSelector(s => selectMatrixRoomEvents(s, id))
    const rawEvents = useAppSelector(s => selectMatrixRoomRawEvents(s, id))
    const dispatch = useAppDispatch()
    const { isPaginating, paginationStatus, handlePaginate } =
        useObserveMatrixRoom(id)
    const [hasNewMessage, setHasNewMessages] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const animatedNewMessageBottom = useRef(new Animated.Value(0)).current
    const isScrolledToBottomRef = useRef(true)
    const lastScrolledMessageIdRef = useRef<string | undefined>(undefined)

    const myId = matrixAuth?.userId
    const isBroadcast = !!room?.broadcastOnly
    const shouldRenderConversationList =
        (hasLoadedEvents && hasLoadedMembers) || connectionRequestPending

    const chatEvents = useMemo(() => {
        const visiblePreviewMedia = previewMedia.filter(m => m.visible)

        if (visiblePreviewMedia.length === 0 || !myId) {
            return events
        }

        const previewEvents = [...events]
        const timestamp = Date.now()

        visiblePreviewMedia.reverse().forEach(({ media }, index) => {
            const eventId = `cached-media-${media.fileName}-${index}`
            previewEvents.push({
                id: eventId as RpcTimelineEventItemId,
                content: {
                    msgtype: 'xyz.fedi.preview-media' as const,
                    body: media.fileName,
                    info: {
                        mimetype: media.mimeType,
                        w: media.width,
                        h: media.height,
                        uri: media.uri,
                    },
                },
                roomId: id,
                timestamp,
                sender: myId,
                localEcho: false,
                sendState: { kind: 'sent', event_id: eventId },
                inReply: null,
                mentions: null,
            })
        })

        return previewEvents
    }, [events, id, myId, previewMedia])

    const chatRows = useMemo(
        () => makeChatConversationRows(chatEvents, type),
        [chatEvents, type],
    )
    const roomMembersById = useMemo(
        () => new Map(roomMembers.map(member => [member.id, member])),
        [roomMembers],
    )
    const {
        listRef,
        highlightedMessageId,
        messageVisibilityStore,
        handleViewableItemsChanged,
        handleScrollToIndexFailed,
        focusMessage,
    } = useConversationMessageFocus({
        roomId: id,
        chatRows,
        events,
        rawEvents,
        shouldRenderConversationList,
        routeScrollToMessageId: route.params.scrollToMessageId,
        scrollToMessageRequest,
        onScrollToMessageComplete,
        listRefOverride,
        paginationStatus,
        isPaginating,
        handlePaginate,
    })

    const style = useMemo(() => styles(theme), [theme])
    const contentContainerStyle =
        replyBarOffset > 0
            ? [
                  style.contentContainer,
                  {
                      paddingTop:
                          style.contentContainer.paddingTop + replyBarOffset,
                  },
              ]
            : style.contentContainer

    useEffect(() => {
        Animated.timing(animatedNewMessageBottom, {
            toValue: hasNewMessage ? newMessageBottomOffset : -100,
            duration: 100,
            useNativeDriver: false,
            easing: Easing.linear,
        }).start()
    }, [animatedNewMessageBottom, hasNewMessage, newMessageBottomOffset])

    const scrollToEnd = useCallback(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
        setHasNewMessages(false)
    }, [listRef])

    useEffect(() => {
        if (!myId || chatRows.length === 0) return

        const lastMessage = chatRows[0]?.event
        const shouldTrackMessage =
            lastMessage && lastMessage.id !== lastScrolledMessageIdRef.current
        if (!shouldTrackMessage) return

        lastScrolledMessageIdRef.current = lastMessage.id

        if (lastMessage.sender === myId || isScrolledToBottomRef.current) {
            return
        }

        setHasNewMessages(true)
    }, [chatRows, myId])

    const handleScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const isAtBottom = event.nativeEvent.contentOffset.y <= 10
            isScrolledToBottomRef.current = isAtBottom
            if (isAtBottom) {
                setHasNewMessages(false)
            }
        },
        [],
    )

    const handleReplyTap = useCallback(
        (eventId: string) => {
            focusMessage(eventId)
        },
        [focusMessage],
    )

    const renderEventRow: ListRenderItem<ChatConversationRow> = useCallback(
        ({ item }) => (
            <ChatConversationEventRow
                roomId={id}
                row={item}
                roomMember={roomMembersById.get(item.event.sender)}
                myId={myId}
                canSwipe={canSwipe}
                onSelect={setSelectedUserId}
                isPublic={isPublic}
                onReplyTap={handleReplyTap}
                highlightedMessageId={highlightedMessageId}
            />
        ),
        [
            canSwipe,
            handleReplyTap,
            highlightedMessageId,
            id,
            isPublic,
            myId,
            roomMembersById,
        ],
    )

    useEffect(() => {
        dispatch(
            matchAndHidePreviewMedia(
                events.filter(
                    event => isImageEvent(event) || isVideoEvent(event),
                ),
            ),
        )
    }, [dispatch, events])

    return (
        <>
            {shouldRenderConversationList ? (
                <ConversationMessageVisibilityContext.Provider
                    value={messageVisibilityStore}>
                    <FlatList
                        data={chatRows}
                        ref={
                            listRefOverride
                                ? undefined
                                : (listRef as React.RefObject<FlatList<ChatConversationRow> | null>)
                        }
                        renderItem={renderEventRow}
                        keyExtractor={item => item.event.id as string}
                        style={[
                            style.listContainer,
                            {
                                paddingHorizontal:
                                    type === 'group'
                                        ? theme.spacing.lg
                                        : theme.spacing.xl,
                            },
                        ]}
                        contentContainerStyle={contentContainerStyle}
                        ListEmptyComponent={
                            isAlone ? (
                                <NoMembersNotice roomId={id} />
                            ) : (
                                <NoMessagesNotice
                                    isBroadcast={isBroadcast}
                                    isDefault={isDefault}
                                />
                            )
                        }
                        ListHeaderComponent={
                            isBlocked ? (
                                <Column
                                    align="center"
                                    fullWidth
                                    style={style.blockedContainer}>
                                    <Text tiny style={style.blockedText}>
                                        {t(
                                            'feature.chat.user-is-blocked-guidance',
                                        )}
                                    </Text>
                                </Column>
                            ) : undefined
                        }
                        onScroll={handleScroll}
                        onScrollToIndexFailed={handleScrollToIndexFailed}
                        inverted={chatRows.length > 0}
                        onEndReachedThreshold={0.1}
                        onEndReached={() => handlePaginate()}
                        refreshing={isPaginating}
                        maintainVisibleContentPosition={{
                            minIndexForVisible: 1,
                            autoscrollToTopThreshold: 100,
                        }}
                        scrollsToTop={false}
                        removeClippedSubviews={false}
                        maxToRenderPerBatch={10}
                        windowSize={10}
                        initialNumToRender={10}
                        onViewableItemsChanged={handleViewableItemsChanged}
                        viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
                    />
                </ConversationMessageVisibilityContext.Provider>
            ) : (
                <Column justify="center" grow>
                    <ActivityIndicator
                        size="large"
                        color={theme.colors.primary}
                    />
                </Column>
            )}

            <ChatUserActionsOverlay
                onDismiss={() => setSelectedUserId(null)}
                selectedUserId={selectedUserId}
                roomId={id}
            />
            <Animated.View
                style={[
                    style.newMessageButtonContainer,
                    { bottom: animatedNewMessageBottom },
                ]}>
                <Pressable style={style.newMessageButton} onPress={scrollToEnd}>
                    <Text small bold style={style.newMessageButtonText}>
                        {t('feature.chat.new-messages')}
                    </Text>
                </Pressable>
            </Animated.View>
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        listContainer: {
            width: '100%',
            paddingHorizontal: theme.spacing.xl,
        },
        contentContainer: {
            paddingTop: theme.spacing.md,
            flexGrow: 1,
        },
        newMessageButtonContainer: {
            position: 'absolute',
            left: 0,
            right: 0,
            alignItems: 'center',
        },
        newMessageButton: {
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            backgroundColor: theme.colors.primary,
            borderRadius: 30,
        },
        newMessageButtonText: {
            color: theme.colors.secondary,
        },
        blockedContainer: {
            marginBottom: theme.spacing.md,
        },
        blockedText: {
            color: theme.colors.red,
            textAlign: 'center',
        },
    })

export default ChatConversation
