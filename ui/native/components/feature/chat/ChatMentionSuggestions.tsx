import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native'
import { NativeViewGestureHandler } from 'react-native-gesture-handler'

import { ROOM_MENTION } from '@fedi/common/constants/matrix'
import {
    MatrixRoomMember,
    MemberItem,
    MentionItem,
    MentionSelect,
} from '@fedi/common/types'
import { getUserSuffix, matrixIdToUsername } from '@fedi/common/utils/matrix'

import { isAndroidAPI35Plus } from '../../../utils/layout'
import { AvatarSize } from '../../ui/Avatar'
import ChatAvatar from '../chat/ChatAvatar'

type Props = {
    suggestions: MatrixRoomMember[]
    visible: boolean
    onSelect: (member: MentionSelect) => void
    maxHeight?: number
    topSpacer?: number
}

const DEFAULT_MAX_HEIGHT = 280
const ROW_HEIGHT = 64
const SEPARATOR_H = StyleSheet.hairlineWidth

const ChatMentionSuggestions: React.FC<Props> = ({
    suggestions,
    visible,
    onSelect,
    maxHeight,
    topSpacer = 0, //this is for the added 'room' at the top of the list
}) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const isAPI35Plus = isAndroidAPI35Plus()

    const list = useMemo<MentionItem[]>(
        () => [
            { id: '@room', displayName: ROOM_MENTION, kind: 'room' } as const,
            ...suggestions.map((m): MemberItem => ({ ...m, kind: 'member' })),
        ],
        [suggestions],
    )

    if (!visible || list.length === 0) return null

    const contentHeight =
        list.length * ROW_HEIGHT + Math.max(0, list.length - 1) * SEPARATOR_H
    const maxH = Math.max(0, maxHeight ?? DEFAULT_MAX_HEIGHT)

    // fixed viewport so short lists can bottom-dock and long lists can scroll.
    const viewportHeight = maxH
    const needsScroll = contentHeight > maxH

    const renderItem = ({
        item,
        index,
    }: {
        item: MentionItem
        index: number
    }) => {
        const isRoom = item.kind === 'room'
        const roomAvatarUser = {
            id: '@room',
            displayName: `@${ROOM_MENTION}`,
        } as MatrixRoomMember

        return (
            <Pressable
                style={({ pressed }) => [
                    style.row,
                    pressed && style.rowPressed,
                    index === list.length - 1 && style.rowLast,
                ]}
                android_ripple={{ color: theme.colors.primary05 }}
                onPress={() =>
                    onSelect(
                        isRoom
                            ? { id: '@room', displayName: ROOM_MENTION }
                            : item,
                    )
                }>
                {isRoom ? (
                    <View style={{ position: 'relative' }}>
                        <ChatAvatar
                            user={roomAvatarUser}
                            size={AvatarSize.md}
                        />
                        <View
                            style={{
                                ...StyleSheet.absoluteFillObject,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: theme.colors.blue,
                                borderRadius: 999,
                            }}>
                            <Text
                                style={style.roomAt}
                                maxFontSizeMultiplier={
                                    theme.multipliers.headerMaxFontMultiplier
                                }>
                                @
                            </Text>
                        </View>
                    </View>
                ) : (
                    <ChatAvatar user={item} size={AvatarSize.md} />
                )}

                <View style={style.textCol}>
                    <Text medium numberOfLines={1} style={style.name}>
                        {isRoom
                            ? `@${ROOM_MENTION}`
                            : item.displayName || matrixIdToUsername(item.id)}
                    </Text>
                    {!isRoom && (
                        <Text caption numberOfLines={1} style={style.sub}>
                            {getUserSuffix(item.id)}
                        </Text>
                    )}
                </View>
            </Pressable>
        )
    }

    // SDK35-only: slightly larger top inset so the first row isn't clipped by the container border
    const sdk35TopInset = isAPI35Plus ? 8 : 0

    const List = (
        <FlatList<MentionItem>
            data={list}
            keyExtractor={(item, i) =>
                item.kind === 'room' ? `room-${i}` : item.id
            }
            style={style.mentionsListStyle}
            scrollEnabled={needsScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={needsScroll}
            keyboardShouldPersistTaps={
                Platform.OS === 'android'
                    ? isAPI35Plus
                        ? 'always'
                        : 'handled'
                    : 'handled'
            }
            removeClippedSubviews={false}
            initialNumToRender={8}
            windowSize={7}
            scrollEventThrottle={16}
            contentInsetAdjustmentBehavior="never"
            bounces={false}
            // header spacer ONLY when scrolling, so the first row never tucks under the toolbar
            ListHeaderComponent={
                needsScroll && topSpacer ? (
                    <View style={{ height: topSpacer }} />
                ) : null
            }
            contentContainerStyle={{
                paddingHorizontal: 0,
                paddingBottom: 1,
                paddingTop: sdk35TopInset, //sdk35 only, stop top item being clipped
                flexGrow: 1,
                // bottom-dock short lists so items sit right above the input
                justifyContent: needsScroll ? 'flex-start' : 'flex-end',
            }}
            ItemSeparatorComponent={() => <View style={style.separator} />}
            renderItem={renderItem}
        />
    )

    return (
        <View
            // fixed viewport height (critical for scrolling).
            style={[style.container, { height: viewportHeight }]}
            pointerEvents="auto"
            collapsable={false}>
            {Platform.OS === 'android' ? (
                <NativeViewGestureHandler
                    enabled={needsScroll}
                    shouldCancelWhenOutside={false}
                    disallowInterruption>
                    {List}
                </NativeViewGestureHandler>
            ) : (
                List
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignSelf: 'stretch',
            width: '100%',
            backgroundColor: theme.colors.white,
            overflow: 'hidden',
            shadowColor: theme.colors.night,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 24,
            elevation: 8,
            zIndex: 3,
            borderTopWidth: 1,
            borderTopColor: theme.colors.extraLightGrey,
        },
        mentionsListStyle: {
            width: '100%',
        },
        row: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: 'transparent',
        },
        rowPressed: {
            backgroundColor: theme.colors.primary05,
        },
        rowLast: { borderBottomWidth: 0 },
        separator: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.colors.extraLightGrey,
            alignSelf: 'stretch',
        },
        textCol: { flex: 1, marginLeft: theme.spacing.md },
        name: { color: theme.colors.night },
        sub: { color: theme.colors.grey, opacity: 0.8 },
        roomAt: {
            color: theme.colors.white,
            fontWeight: '700',
            fontSize: 16,
            lineHeight: 18,
        },
    })

export default React.memo(ChatMentionSuggestions)
