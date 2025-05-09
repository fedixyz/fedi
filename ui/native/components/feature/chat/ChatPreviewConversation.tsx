import { useIsFocused } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Animated,
    Easing,
    FlatList,
    ListRenderItem,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    StyleSheet,
} from 'react-native'

import { getMatrixRoomPreview } from '@fedi/common/redux'
import { MatrixEvent, MatrixGroupPreview } from '@fedi/common/types'
import {
    MatrixEventContent,
    makeMatrixEventGroups,
} from '@fedi/common/utils/matrix'

import { useAppDispatch } from '../../../state/hooks'
import ChatEventCollection from './ChatEventCollection'
import { ChatUserActionsOverlay } from './ChatUserActionsOverlay'
import NoMessagesNotice from './NoMessagesNotice'

type Props = {
    id: string
    preview: MatrixGroupPreview
}

const ChatPreviewConversation: React.FC<Props> = ({ id, preview }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const isFocused = useIsFocused()

    const [isRefreshing, setIsRefreshing] = useState(false)

    const isBroadcast = preview.info?.broadcastOnly === true

    const [hasNewMessage, setHasNewMessages] = useState(false)
    const animatedNewMessageBottom = useRef(new Animated.Value(0)).current

    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const handleSelectMember = useCallback((userId: string) => {
        setSelectedUserId(userId)
    }, [])

    // Room is empty if we're the only member
    // const isAlone =
    //     useAppSelector(s => selectMatrixRoomMembersCount(s, id)) === 1

    const timeline = preview.timeline || []
    const events = timeline.filter((item): item is MatrixEvent => {
        return item !== null
    })
    const eventGroups = useMemo(
        () => makeMatrixEventGroups(events, 'desc'),
        [events],
    )

    const listRef = useRef<FlatList>(null)
    const lastScrolledMessageIdRef = useRef(events?.[0]?.id)
    const isScrolledToBottomRef = useRef(true)

    const handleRefresh = useCallback(async () => {
        if (isRefreshing) return
        setIsRefreshing(true)
        dispatch(getMatrixRoomPreview(id))
            .unwrap()
            .finally(() => setIsRefreshing(false))
    }, [id, dispatch, isRefreshing])

    useEffect(() => {
        if (isFocused) {
            handleRefresh()
            const timer = setInterval(handleRefresh, 15000)
            return () => clearInterval(timer)
        }
    }, [isFocused, handleRefresh])

    const style = styles(theme)

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
        if (!eventGroups.length) return
        // Bail out if we've already handled this message
        const lastMessage = eventGroups[0]?.[0]?.[0]
        const shouldScroll =
            lastMessage && lastMessage.id !== lastScrolledMessageIdRef.current
        if (!shouldScroll) return
        // Update ref so we don't scroll again
        lastScrolledMessageIdRef.current = lastMessage.id
        // If we're already at the bottom, scroll without asking
        if (isScrolledToBottomRef.current) {
            return
        }
        // Otherwise, mark that we have new messages
        else {
            setHasNewMessages(true)
        }
    }, [eventGroups, scrollToEnd])

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
                    key={item[0][0].id}
                    roomId={id}
                    collection={item}
                    showUsernames
                    onSelect={handleSelectMember}
                />
            )
        },
        [handleSelectMember, id],
    )

    return (
        <>
            <FlatList
                data={eventGroups}
                ref={listRef}
                renderItem={renderEventGroup}
                keyExtractor={item => `cc-fl-${item[0][0]?.id}`}
                style={[style.listContainer]}
                contentContainerStyle={style.contentContainer}
                removeClippedSubviews={false}
                ListEmptyComponent={
                    <NoMessagesNotice isBroadcast={isBroadcast} />
                }
                onScroll={handleScroll}
                // this prop is required to accomplish both:
                // 1) correct ordering of messages with the most recent message at the bottom
                // 2) prevent the ListEmptyComponent from rendering upside down
                inverted={events.length > 0}
                // adjust this for more/less aggressive loading
                onEndReachedThreshold={1}
                refreshing={isRefreshing}
                maintainVisibleContentPosition={{
                    minIndexForVisible: 1,
                    autoscrollToTopThreshold: 100,
                }}
                scrollsToTop={false}
            />
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
            paddingHorizontal: theme.spacing.lg,
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

export default ChatPreviewConversation
