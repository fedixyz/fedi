import { Theme, useTheme } from '@rneui/themed'
import React, { useState, useMemo } from 'react'
import {
    StyleSheet,
    View,
    Pressable,
    Text,
    Animated,
    Platform,
} from 'react-native'

import { ReplyMessageData, matrixIdToUsername } from '@fedi/common/utils/matrix'

type Props = {
    repliedData: ReplyMessageData
    onReplyTap?: (eventId: string) => void
    roomMembers: Array<{ id: string; displayName?: string }>
    isFromCurrentUser?: boolean
}

const ChatRepliedMessage: React.FC<Props> = ({
    repliedData,
    onReplyTap,
    roomMembers,
    isFromCurrentUser = false,
}) => {
    const { theme } = useTheme()
    const [pressAnimation] = useState(new Animated.Value(1))

    // Simple display name resolution using existing utility
    const senderName = useMemo(() => {
        return (
            roomMembers?.find(member => member.id === repliedData?.senderId)
                ?.displayName || matrixIdToUsername(repliedData?.senderId)
        )
    }, [repliedData?.senderId, roomMembers])

    // dynamically adjust truncation length based on message size for better readability
    // longer messages get more characters before truncation to preserve context
    const truncatedBody = useMemo(() => {
        const body = repliedData.body || 'Message'
        const maxLength =
            body.length > 150 ? 200 : body.length > 100 ? 150 : 100
        return body.length > maxLength
            ? `${body.substring(0, maxLength)}...`
            : body
    }, [repliedData.body])

    const handlePressIn = () => {
        Animated.spring(pressAnimation, {
            toValue: 0.95,
            useNativeDriver: true,
            tension: 300,
            friction: 20,
        }).start()
    }

    const handlePressOut = () => {
        Animated.spring(pressAnimation, {
            toValue: 1,
            useNativeDriver: true,
            tension: 300,
            friction: 20,
        }).start()
    }

    const handlePress = () => {
        if (onReplyTap && repliedData.eventId) {
            onReplyTap(repliedData.eventId)
        }
    }

    return (
        <Animated.View
            style={[
                styles(theme).replyContainer,
                isFromCurrentUser
                    ? styles(theme).replyContainerBlue
                    : styles(theme).replyContainerWhite,
                {
                    width: '100%',
                    minWidth: 100,
                    alignSelf: 'stretch',
                    transform: [{ scale: pressAnimation }],
                },
            ]}>
            <Pressable
                style={styles(theme).replyPressable}
                onPress={handlePress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                android_ripple={styles(theme).rippleEffect}>
                <View
                    style={[
                        styles(theme).replyIndicator,
                        isFromCurrentUser
                            ? styles(theme).replyIndicatorBlue
                            : styles(theme).replyIndicatorWhite,
                    ]}
                />

                <View style={styles(theme).replyContent}>
                    <View style={styles(theme).senderRow}>
                        <View
                            style={[
                                styles(theme).senderAvatar,
                                isFromCurrentUser
                                    ? styles(theme).senderAvatarBlue
                                    : styles(theme).senderAvatarWhite,
                            ]}>
                            <Text
                                style={[
                                    styles(theme).senderAvatarText,
                                    isFromCurrentUser
                                        ? styles(theme).senderAvatarTextBlue
                                        : styles(theme).senderAvatarTextWhite,
                                ]}>
                                {senderName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <Text
                            style={[
                                styles(theme).replySender,
                                isFromCurrentUser
                                    ? styles(theme).replySenderBlue
                                    : styles(theme).replySenderWhite,
                            ]}
                            numberOfLines={1}>
                            {senderName}
                        </Text>
                        <View style={styles(theme).replyIcon}>
                            <Text
                                style={[
                                    styles(theme).replyIconText,
                                    isFromCurrentUser
                                        ? styles(theme).replyIconTextBlue
                                        : styles(theme).replyIconTextWhite,
                                ]}>
                                ↗
                            </Text>
                        </View>
                    </View>

                    <Text
                        style={[
                            styles(theme).replyBody,
                            isFromCurrentUser
                                ? styles(theme).replyBodyBlue
                                : styles(theme).replyBodyWhite,
                        ]}
                        numberOfLines={1}>
                        {truncatedBody}
                    </Text>
                </View>
            </Pressable>
        </Animated.View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        replyContainer: {
            borderRadius: 8,
            borderLeftWidth: 3,
            borderRightWidth: 1,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            minHeight: 60,
            maxHeight: 120,
            // only apply shadow on iOS
            ...Platform.select({
                ios: {
                    shadowColor: theme.colors.black,
                    shadowOffset: {
                        width: 0,
                        height: 1,
                    },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                },
            }),
        },
        replyContainerBlue: {
            backgroundColor: 'transparent',
            borderLeftColor: theme.colors.offWhite,
            borderRightColor: theme.colors.extraLightGrey,
            borderTopColor: theme.colors.extraLightGrey,
            borderBottomColor: theme.colors.extraLightGrey,
        },
        replyContainerWhite: {
            backgroundColor: 'transparent',
            borderLeftColor: theme.colors.lightGrey,
            borderRightColor: theme.colors.ghost,
            borderTopColor: theme.colors.ghost,
            borderBottomColor: theme.colors.ghost,
        },
        replyPressable: {
            flexDirection: 'row',
            padding: 8,
            gap: 8,
            alignItems: 'flex-start',
            borderRadius: 8,
            minHeight: 50,
            flex: 1,
        },
        replyIndicator: {
            width: 4,
            borderRadius: 2,
            alignSelf: 'stretch',
            minHeight: 34,
            flexShrink: 0,
        },
        replyIndicatorBlue: {
            backgroundColor: theme.colors.offWhite,
        },
        replyIndicatorWhite: {
            backgroundColor: theme.colors.lightGrey,
        },
        replyContent: {
            flex: 1,
            minWidth: 0,
            justifyContent: 'center',
            paddingVertical: 2,
        },
        senderRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: 16,
            marginBottom: 2,
        },
        senderAvatar: {
            width: 16,
            height: 16,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        },
        senderAvatarBlue: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        senderAvatarWhite: {
            backgroundColor: theme.colors.ghost,
        },
        senderAvatarText: {
            fontSize: 9,
            fontWeight: '700',
        },
        senderAvatarTextBlue: {
            color: theme.colors.text,
        },
        senderAvatarTextWhite: {
            color: theme.colors.text,
        },
        replySender: {
            fontSize: 12,
            fontWeight: '600',
            flex: 1,
            minWidth: 0,
        },
        replySenderBlue: {
            color: theme.colors.offWhite,
        },
        replySenderWhite: {
            color: theme.colors.text,
        },
        replyIcon: {
            width: 14,
            height: 14,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.7,
            flexShrink: 0,
        },
        replyIconText: {
            fontSize: 11,
            fontWeight: '600',
        },
        replyIconTextBlue: {
            color: theme.colors.offWhite,
        },
        replyIconTextWhite: {
            color: theme.colors.darkGrey,
        },
        replyBody: {
            fontSize: 12,
            lineHeight: 16,
            fontStyle: 'italic',
            opacity: 0.9,
            flexWrap: 'nowrap',
        },
        replyBodyBlue: {
            color: theme.colors.offWhite,
        },
        replyBodyWhite: {
            color: theme.colors.grey,
        },
        rippleEffect: {
            color: theme.colors.overlay,
        },
    })

export default ChatRepliedMessage
