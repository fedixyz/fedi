import { Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    useWindowDimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useMatrixUserSearch } from '@fedi/common/hooks/matrix'
import { selectRecentMatrixRoomMembers } from '@fedi/common/redux'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { useHasBottomTabsNavigation } from '../../../utils/hooks'
import Avatar, { AvatarSize } from '../../ui/Avatar'
import Flex from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'
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

    const [isFocused, setIsFocused] = useState(false)
    const { width, fontScale } = useWindowDimensions()
    const memberCount = Math.max(Math.floor(width / fontScale / 80), 2)

    const { query, setQuery, searchedUsers, isSearching, searchError } =
        useMatrixUserSearch()
    const recentRoomMembers = useAppSelector(selectRecentMatrixRoomMembers)

    const isShowingSearch = isFocused || query.length > 0
    const style = styles(theme, memberCount)

    let content: React.ReactNode
    if (isSearching) {
        content = (
            <Flex align="center" style={style.loadingContainer}>
                <HoloLoader size={24} />
            </Flex>
        )
    } else if (searchError) {
        content = (
            <Text style={style.errorText}>
                {formatErrorMessage(t, searchError, 'errors.chat-unavailable')}
            </Text>
        )
    } else if (isShowingSearch) {
        content = (
            <SafeAreaView
                edges={['left', 'right']}
                style={style.searchMembersContainer}>
                <OmniMemberSearchList
                    query={query}
                    searchedUsers={searchedUsers}
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
                {recentRoomMembers.length > 0 && (
                    <Flex>
                        <Text small medium style={style.recentMembersLabel}>
                            {t('words.people')}
                        </Text>
                        <Flex row fullWidth>
                            {recentRoomMembers.map(user => (
                                <Pressable
                                    key={user.id}
                                    style={style.recentMember}
                                    onPress={() =>
                                        onInput(
                                            encodeFediMatrixUserUri(user.id),
                                        )
                                    }>
                                    <Avatar
                                        id={user.id}
                                        name={user.displayName}
                                        size={AvatarSize.md}
                                    />
                                    <Text
                                        caption
                                        medium
                                        numberOfLines={1}
                                        style={style.recentMemberDisplayName}>
                                        {user.displayName}
                                    </Text>
                                </Pressable>
                            ))}
                        </Flex>
                    </Flex>
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
                        canLnurlPay
                            ? 'feature.omni.search-placeholder-username-or-ln'
                            : 'feature.omni.search-placeholder-username',
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
            <Flex grow fullWidth>
                {content}
            </Flex>
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
        loadingContainer: {
            marginTop: theme.spacing.lg,
        },
        errorText: {
            padding: theme.spacing.lg,
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
        recentMember: {
            width: `${100 / memberCount}%`,
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        recentMemberDisplayName: {
            paddingHorizontal: theme.spacing.xs,
        },
    })
