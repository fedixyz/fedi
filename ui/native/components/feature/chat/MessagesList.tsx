import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
    View,
} from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    selectAuthenticatedMember,
    selectChatMemberMap,
} from '@fedi/common/redux'
import { ChatMessage } from '@fedi/common/types'
import dateUtils from '@fedi/common/utils/DateUtils'
import { jidToId } from '@fedi/common/utils/chat'

import { useAppSelector } from '../../../state/hooks'
import Avatar from '../../ui/Avatar'
import MessageItem from './MessageItem'
import { MessageItemError } from './MessageItemError'

type MessagesListProps = {
    messages: ChatMessage[][][]
    multiUserChat?: boolean
}

/** @deprecated XMPP legacy code */
const MessagesList: React.FC<MessagesListProps> = ({
    messages,
    multiUserChat = false,
}: MessagesListProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation()
    const listRef = useRef<FlatList>(null)
    const lastScrolledMessageIdRef = useRef(messages[0]?.[0]?.[0].id)
    const isScrolledToBottomRef = useRef(true)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const memberMap = useAppSelector(selectChatMemberMap)
    const [hasNewMessage, setHasNewMessages] = useState(false)
    const animatedNewMessageBottom = useRef(new Animated.Value(0)).current

    const style = styles(theme)
    const myId = authenticatedMember?.id || ''

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
        // Bail out if we've already handled this message
        const lastMessage = messages[0]?.[0]?.[0]
        const shouldScroll =
            lastMessage && lastMessage.id !== lastScrolledMessageIdRef.current
        if (!shouldScroll) return

        // Update ref so we don't scroll again
        lastScrolledMessageIdRef.current = lastMessage.id

        // If we sent it, or we're already at the bottom, scroll without asking
        if (lastMessage.sentBy === myId || isScrolledToBottomRef.current) {
            scrollToEnd()
        }
        // Otherwise, mark that we have new messages
        else {
            setHasNewMessages(true)
        }
    }, [messages, myId, scrollToEnd])

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

    const renderTimeGroup: ListRenderItem<ChatMessage[][]> = ({ item }) => {
        // Grab the earliest timestamp (last message in the last message group)
        const sentAt =
            item[item.length - 1][item[item.length - 1].length - 1]?.sentAt
        return (
            <View style={style.timeGroupContainer}>
                {sentAt && (
                    <View style={style.timestampContainer}>
                        <Text tiny style={style.timestampText}>
                            {dateUtils.formatMessageItemTimestamp(sentAt)}
                        </Text>
                    </View>
                )}
                <View style={style.sendersContainer}>
                    {item.map(msgs => {
                        if (!msgs.length) return null
                        const sentBy = msgs[0].sentBy
                        const sentByName =
                            memberMap[sentBy]?.username ||
                            t('feature.chat.unknown-member')
                        const sentByMe = sentBy && sentBy === myId
                        return (
                            <View style={style.senderGroup} key={msgs[0].id}>
                                {!sentByMe && multiUserChat && (
                                    <View style={style.senderNameContainer}>
                                        <Text tiny>{sentByName}</Text>
                                    </View>
                                )}
                                <View style={style.senderGroupContent}>
                                    {!sentByMe && multiUserChat && (
                                        <Pressable
                                            style={style.senderAvatar}
                                            onPress={() => {
                                                if (sentBy) {
                                                    navigation.navigate(
                                                        'DirectChat',
                                                        {
                                                            memberId: sentBy,
                                                        },
                                                    )
                                                }
                                            }}>
                                            <Avatar
                                                id={
                                                    sentBy
                                                        ? jidToId(sentBy)
                                                        : ''
                                                }
                                                name={sentByName}
                                            />
                                        </Pressable>
                                    )}
                                    <View style={style.senderMessages}>
                                        {msgs.map((msg, index) => (
                                            <ErrorBoundary
                                                key={msg.id || index}
                                                fallback={() => (
                                                    <MessageItemError />
                                                )}>
                                                <MessageItem
                                                    message={msg}
                                                    last={
                                                        index ===
                                                        msgs.length - 1
                                                    }
                                                />
                                            </ErrorBoundary>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        )
                    })}
                </View>
            </View>
        )
    }

    return (
        <>
            <FlatList
                data={messages}
                ref={listRef}
                renderItem={renderTimeGroup}
                keyExtractor={item => `${item[0][0]?.id}`}
                style={style.listContainer}
                contentContainerStyle={style.contentContainer}
                removeClippedSubviews={false}
                ListEmptyComponent={null}
                onScroll={handleScroll}
                inverted={messages.length > 0}
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
        },
        timeGroupContainer: {
            marginBottom: theme.spacing.md,
            color: theme.colors.darkGrey,
        },
        timestampContainer: {
            alignItems: 'center',
            width: '100%',
            marginBottom: theme.spacing.md,
        },
        sendersContainer: {
            flexDirection: 'column-reverse',
        },
        timestampText: {
            color: theme.colors.darkGrey,
        },
        senderGroup: {
            marginBottom: theme.spacing.md,
        },
        senderAvatar: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginRight: theme.spacing.sm,
        },
        senderGroupContent: {
            flexDirection: 'row',
            alignItems: 'flex-end',
        },
        senderNameContainer: {
            paddingLeft: 42,
        },
        senderMessages: {
            flexDirection: 'column-reverse',
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
    })

export default MessagesList
