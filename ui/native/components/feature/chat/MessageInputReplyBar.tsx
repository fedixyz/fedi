import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Insets, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useReplies } from '@fedi/common/hooks/matrix'
import { clearChatReplyingToMessage } from '@fedi/common/redux'
import { MatrixEvent, MatrixRoomMember } from '@fedi/common/types'

import { useAppDispatch } from '../../../state/hooks'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type MessageInputReplyBarProps = {
    repliedEvent: MatrixEvent
    roomMembers: MatrixRoomMember[]
}

const MessageInputReplyBar: React.FC<MessageInputReplyBarProps> = ({
    repliedEvent,
    roomMembers,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const dispatch = useAppDispatch()
    const replyOpacity = useRef(new Animated.Value(0)).current
    const { senderName, bodySnippet } = useReplies(repliedEvent, roomMembers)

    // animate reply bar appearance
    useEffect(() => {
        const anim = Animated.timing(replyOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
        })
        anim.start()
        return () => anim.stop()
    }, [replyOpacity])

    const style = styles(theme, insets)

    return (
        <Animated.View
            style={[style.replyBarContainer, { opacity: replyOpacity }]}>
            <View style={style.replyBar}>
                <View style={style.replyIndicator} />
                <View style={style.replyContent}>
                    <Text
                        style={style.replySender}
                        numberOfLines={1}
                        maxFontSizeMultiplier={
                            theme.multipliers?.headerMaxFontMultiplier ?? 1.3
                        }>
                        {t('feature.chat.replying-to', { name: senderName })}
                    </Text>
                    <Text
                        style={style.replyBody}
                        numberOfLines={1}
                        maxFontSizeMultiplier={
                            theme.multipliers?.bodyMaxFontMultiplier ??
                            theme.multipliers?.headerMaxFontMultiplier ??
                            1.3
                        }>
                        {bodySnippet}
                    </Text>
                </View>

                <Pressable
                    style={style.replyCloseButton}
                    hitSlop={12}
                    onPress={() => dispatch(clearChatReplyingToMessage())}>
                    <SvgImage
                        name="Close"
                        size={SvgImageSize.xs}
                        color={theme.colors.grey}
                    />
                </Pressable>
            </View>
        </Animated.View>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        replyBarContainer: {
            position: 'relative',
            // Stretch the bar content edge-to-edge:
            marginLeft: -(theme.spacing.md + (insets.left || 0)),
            marginRight: -(theme.spacing.md + (insets.right || 0)),
            // Fill the container's top padding area with the same background without changing the bar's internal height/padding.
            marginTop: -theme.spacing.sm,
            paddingTop: Math.max(theme.spacing.sm - 4, 0),
            backgroundColor: theme.colors.offWhite100,
            width: 'auto',
            alignSelf: 'stretch',
        },
        replyBar: {
            width: '100%',
            height: 59,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.lightGrey,
            paddingTop: 12,
            paddingRight: (insets.right || 0) + 16,
            paddingBottom: 12,
            paddingLeft: (insets.left || 0) + 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
        },
        replyIndicator: {
            width: 4,
            height: 35,
            backgroundColor: theme.colors.primary || '#007AFF',
            borderRadius: 2,
            flexShrink: 0,
            marginRight: 12,
        },
        replyContent: {
            flex: 1,
            justifyContent: 'center',
        },
        replySender: {
            fontFamily: 'Albert Sans',
            fontWeight: '700',
            fontSize: 14,
            lineHeight: 20,
            letterSpacing: 0,
            color: theme.colors.darkGrey,
            marginBottom: 2,
        },
        replyBody: {
            fontFamily: 'Albert Sans',
            fontSize: 13,
            color: theme.colors.grey || '#6C757D',
            lineHeight: 16,
        },
        replyCloseButton: {
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default MessageInputReplyBar
