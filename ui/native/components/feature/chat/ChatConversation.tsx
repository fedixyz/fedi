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
    View,
} from 'react-native'

import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    matchAndHidePreviewMedia,
    paginateMatrixRoomTimeline,
    selectPreviewMedia,
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixRoomEvents,
    selectMatrixRoomEventsHaveLoaded,
    selectMatrixRoomMembersCount,
} from '@fedi/common/redux'
import { ChatType, MatrixEvent, MatrixEventStatus } from '@fedi/common/types'
import {
    MatrixEventContent,
    isImageEvent,
    isVideoEvent,
    makeMatrixEventGroups,
} from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import ChatEventCollection from './ChatEventCollection'
import { ChatUserActionsOverlay } from './ChatUserActionsOverlay'
import NoMembersNotice from './NoMembersNotice'
import NoMessagesNotice from './NoMessagesNotice'

type MessagesListProps = {
    type: ChatType
    id: string
    multiUserChat?: boolean
    isPublic?: boolean
}

const ChatConversation: React.FC<MessagesListProps> = ({
    type,
    id,
    isPublic = true,
}: MessagesListProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [hasPaginated, setHasPaginated] = useState(false)
    const [isPaginating, setIsPaginating] = useState(false)
    const [isAtEnd, setIsAtEnd] = useState(false)
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const myId = useMemo(() => matrixAuth?.userId, [matrixAuth])
    const isBroadcast = !!useAppSelector(s => selectMatrixRoom(s, id))
        ?.broadcastOnly
    const [hasNewMessage, setHasNewMessages] = useState(false)
    const animatedNewMessageBottom = useRef(new Animated.Value(0)).current
    const previewMedia = useAppSelector(selectPreviewMedia)
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const dispatch = useAppDispatch()

    // Room is empty if we're the only member
    const isAlone =
        useAppSelector(s => selectMatrixRoomMembersCount(s, id)) === 1

    useObserveMatrixRoom(id)

    const events = useAppSelector(s => selectMatrixRoomEvents(s, id))
    const hasLoadedEvents = useAppSelector(s =>
        selectMatrixRoomEventsHaveLoaded(s, id),
    )
    const listRef = useRef<FlatList>(null)
    const lastScrolledMessageIdRef = useRef(events?.[0]?.id)
    const isScrolledToBottomRef = useRef(true)

    // Intercept `events` to add preview media events
    const chatEvents = useMemo(() => {
        const visiblePreviewMedia = previewMedia.filter(m => m.visible)

        if (visiblePreviewMedia.length === 0 || !myId) {
            return events
        }

        const evts = [...events]
        const timestamp = Date.now()

        visiblePreviewMedia.reverse().forEach(({ media }, index) => {
            evts.push({
                id: `cached-media-${media.fileName}-${index}`,
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
                status: MatrixEventStatus.sent,
                roomId: id,
                timestamp,
                senderId: myId,
                eventId: `cached-media-${media.fileName}-${index}`,
                error: null,
            })
        })

        return evts
    }, [previewMedia, events, id, myId])

    const eventGroups = useMemo(
        () => makeMatrixEventGroups(chatEvents, 'desc'),
        [chatEvents],
    )

    // Any time we get a change in the number of events, we reset hasPaginated
    // so that the user will attempt pagination again.
    useEffect(() => {
        setHasPaginated(false)
    }, [events.length])

    const style = useMemo(() => styles(theme), [theme])

    // Animate new message button in and out
    useEffect(() => {
        Animated.timing(animatedNewMessageBottom, {
            toValue: hasNewMessage ? 90 : -50,
            duration: 100,
            useNativeDriver: false,
            easing: Easing.linear,
        }).start()
    }, [animatedNewMessageBottom, hasNewMessage])

    const scrollToEnd = useCallback(() => {
        // Use scrollToOffset instead of scrollToEnd because the list is inverted
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
        setHasNewMessages(false)
    }, [])

    // When new messages come in, either scroll to the bottom (if we sent)
    // or pop up a notice that we have new messages.
    useEffect(() => {
        if (!myId || !eventGroups.length) return
        // Bail out if we've already handled this message
        const lastMessage = eventGroups[0]?.[0]?.[0]
        const shouldScroll =
            lastMessage && lastMessage.id !== lastScrolledMessageIdRef.current
        if (!shouldScroll) return
        // Update ref so we don't scroll again
        lastScrolledMessageIdRef.current = lastMessage.id
        // If we sent it, or we're already at the bottom, scroll without asking
        if (lastMessage.senderId === myId || isScrolledToBottomRef.current) {
            return
        }
        // Otherwise, mark that we have new messages
        else {
            setHasNewMessages(true)
        }
    }, [eventGroups, myId, scrollToEnd])

    const handlePaginate = useCallback(async () => {
        if (isPaginating || hasPaginated || isAtEnd) return
        setIsPaginating(true)
        setHasPaginated(true)
        await dispatch(paginateMatrixRoomTimeline({ roomId: id, limit: 30 }))
            .unwrap()
            .then(({ end }) => setIsAtEnd(end))
            .finally(() => setIsPaginating(false))
    }, [hasPaginated, id, isAtEnd, isPaginating, dispatch])

    // Mark hasNewMessages as false when we scroll to the bottom, and keep a ref up to date
    const handleScroll = useCallback(
        (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
            const isAtBottom = ev.nativeEvent.contentOffset.y <= 10
            isScrolledToBottomRef.current = isAtBottom
            if (isAtBottom) {
                setHasNewMessages(false)
            }
        },
        [],
    )

    const renderEventGroup: ListRenderItem<
        MatrixEvent<MatrixEventContent>[][]
    > = useCallback(
        ({ item }) => {
            return (
                <ChatEventCollection
                    key={item[0].at(-1)?.eventId}
                    roomId={id}
                    collection={item}
                    showUsernames={type === ChatType.group}
                    onSelect={setSelectedUserId}
                    isPublic={isPublic}
                />
            )
        },
        [id, type, isPublic],
    )

    // Hide the preview cached media events when the ACTUAL chat image/video events come
    useEffect(() => {
        dispatch(
            matchAndHidePreviewMedia(
                events.filter(e => isImageEvent(e) || isVideoEvent(e)),
            ),
        )
    }, [events, dispatch])

    return (
        <>
            {hasLoadedEvents ? (
                <FlatList
                    data={eventGroups}
                    ref={listRef}
                    renderItem={renderEventGroup}
                    keyExtractor={item => item[0].at(-1)?.eventId as string}
                    style={[
                        style.listContainer,
                        {
                            paddingHorizontal:
                                type === 'group'
                                    ? theme.spacing.lg
                                    : theme.spacing.xl,
                        },
                    ]}
                    contentContainerStyle={style.contentContainer}
                    removeClippedSubviews={false}
                    ListEmptyComponent={
                        isAlone ? (
                            <NoMembersNotice roomId={id} />
                        ) : (
                            <NoMessagesNotice isBroadcast={isBroadcast} />
                        )
                    }
                    onScroll={handleScroll}
                    inverted={events.length > 0}
                    // adjust this for more/less aggressive loading
                    onEndReachedThreshold={0.1}
                    onEndReached={handlePaginate}
                    refreshing={isPaginating}
                    maintainVisibleContentPosition={{
                        minIndexForVisible: 1,
                        autoscrollToTopThreshold: 100,
                    }}
                    scrollsToTop={false}
                />
            ) : (
                <View style={style.center}>
                    <ActivityIndicator size="large" />
                </View>
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
        center: {
            flex: 1,
            justifyContent: 'center',
        },
    })

export default ChatConversation
