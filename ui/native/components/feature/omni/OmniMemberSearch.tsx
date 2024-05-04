import { Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useChatMemberSearch } from '@fedi/common/hooks/chat'
import { useIsChatSupported } from '@fedi/common/hooks/federation'
import {
    selectChatMembersWithHistory,
    selectRecentChatMembers,
} from '@fedi/common/redux'
import { encodeDirectChatLink } from '@fedi/common/utils/xmpp'

import { useAppSelector } from '../../../state/hooks'
import { useHasBottomTabsNavigation } from '../../../utils/hooks'
import Avatar, { AvatarSize } from '../../ui/Avatar'
import SvgImage from '../../ui/SvgImage'
import { ChatConnectionBadge } from '../chat/ChatConnectionBadge'
import { OmniActions } from './OmniActions'
import { OmniInputAction } from './OmniInput'
import { OmniMemberSearchList } from './OmniMemberSearchList'

interface Props {
    onInput(data: string): void
    actions: OmniInputAction[]
    canLnurlPay?: boolean
    canLnurlWithdraw?: boolean
}

export const OmniMemberSearch: React.FC<Props> = ({
    actions,
    onInput,
    canLnurlPay,
    canLnurlWithdraw,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const hasTabs = useHasBottomTabsNavigation()
    const membersWithHistory = useAppSelector(selectChatMembersWithHistory)
    const canChat = useIsChatSupported()
    const [isFocused, setIsFocused] = useState(false)
    const { query, setQuery, searchedMembers, isExactMatch } =
        useChatMemberSearch(membersWithHistory)
    const { width, fontScale } = useWindowDimensions()

    const memberCount = Math.max(Math.floor(width / fontScale / 80), 2)
    const recentMembers = useAppSelector(s =>
        selectRecentChatMembers(s, memberCount),
    )

    const isShowingSearch = isFocused || query.length > 0
    const style = styles(theme, memberCount)

    let content: React.ReactNode
    if (isShowingSearch) {
        content = (
            <SafeAreaView
                edges={['left', 'right']}
                style={style.searchMembersContainer}>
                <OmniMemberSearchList
                    query={query}
                    searchedMembers={searchedMembers}
                    isExactMatch={isExactMatch}
                    canLnurlPay={!!canLnurlPay}
                    onInput={onInput}
                />
            </SafeAreaView>
        )
    } else {
        content = (
            <SafeAreaView
                edges={
                    hasTabs ? ['left', 'right'] : ['left', 'right', 'bottom']
                }
                style={style.defaultContainer}>
                {canChat && recentMembers.length > 0 && (
                    <View>
                        <Text small medium style={style.recentMembersLabel}>
                            {t('words.people')}
                        </Text>
                        <View style={style.recentMembers}>
                            {recentMembers.map(member => (
                                <Pressable
                                    key={member.id}
                                    style={style.recentMember}
                                    onPress={() =>
                                        onInput(encodeDirectChatLink(member.id))
                                    }>
                                    <Avatar
                                        id={member.id}
                                        name={member.username}
                                        size={AvatarSize.md}
                                    />
                                    <Text
                                        caption
                                        medium
                                        numberOfLines={1}
                                        style={style.recentMemberUsername}>
                                        {member.username}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                )}
                <OmniActions actions={actions} />
            </SafeAreaView>
        )
    }

    return (
        <KeyboardAvoidingView
            enabled={Platform.OS === 'ios'}
            behavior="padding"
            keyboardVerticalOffset={insets.top + 40}
            style={style.container}>
            <SafeAreaView edges={['left', 'right']} style={style.controls}>
                <Text>
                    {(canLnurlWithdraw
                        ? t('words.from')
                        : t('words.to')
                    ).toLowerCase()}
                    :
                </Text>
                <Input
                    containerStyle={style.inputContainerOuter}
                    inputContainerStyle={style.inputContainerInner}
                    style={style.input}
                    value={query}
                    placeholder={t(
                        canChat
                            ? canLnurlPay
                                ? 'feature.omni.search-placeholder-username-or-ln'
                                : 'feature.omni.search-placeholder-username'
                            : 'feature.omni.search-placeholder-ln-address',
                    )}
                    onChangeText={setQuery}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    autoCapitalize="none"
                />
                {isShowingSearch && (
                    <Pressable
                        onPress={() => {
                            // Hide the keyboard, then the next frame the input blur will
                            // trigger one last onChangeText with the final value, then the
                            // frame after that we'll clear the input forreal.
                            Keyboard.dismiss()
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    setQuery('')
                                })
                            })
                        }}>
                        <SvgImage name="Close" />
                    </Pressable>
                )}
            </SafeAreaView>
            <View style={style.content}>{content}</View>
            <ChatConnectionBadge hide={!query} offset={80} noSafeArea />
        </KeyboardAvoidingView>
    )
}

const styles = (theme: Theme, memberCount: number) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
        controls: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 56,
            marginTop: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            borderColor: theme.colors.extraLightGrey,
            borderTopWidth: 1,
            borderBottomWidth: 1,
        },
        inputContainerOuter: {
            flex: 1,
            height: 40,
        },
        inputContainerInner: {
            borderBottomWidth: 0,
        },
        input: {
            height: '100%',
            fontSize: fediTheme.fontSizes.body,
        },
        content: {
            flex: 1,
            width: '100%',
        },
        searchMembersContainer: {
            flex: 1,
        },
        defaultContainer: {
            padding: theme.spacing.lg,
            gap: theme.spacing.lg,
        },
        recentMembersLabel: {
            marginBottom: theme.spacing.lg,
            color: theme.colors.grey,
        },
        recentMembers: {
            width: '100%',
            flexDirection: 'row',
        },
        recentMember: {
            width: `${100 / memberCount}%`,
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        recentMemberUsername: {
            paddingHorizontal: theme.spacing.xs,
        },
        alignStart: {
            alignItems: 'flex-start',
        },
    })
