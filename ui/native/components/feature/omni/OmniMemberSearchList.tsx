import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Insets,
    SectionList,
    SectionListData,
    StyleSheet,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    fetchChatMember,
    selectActiveFederationId,
    selectAuthenticatedMember,
    selectChatClientStatus,
    selectChatConnectionOptions,
    selectChatMember,
} from '@fedi/common/redux'
import { isValidInternetIdentifier } from '@fedi/common/utils/validation'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { ChatMember } from '../../../types'
import { useHasBottomTabsNavigation } from '../../../utils/hooks'
import { OmniMemberSearchItem } from './OmniMemberSearchItem'

export type OmniMemberSearchListItemType =
    | { username: string; id: string; inputData?: string }
    | { loading: true }
type OmniMemberSearchListData = SectionListData<OmniMemberSearchListItemType>

interface Props {
    query: string
    searchedMembers: ChatMember[]
    isExactMatch: boolean
    canLnurlPay: boolean
    onInput(data: string): void
}

export const OmniMemberSearchList: React.FC<Props> = ({
    query,
    searchedMembers,
    isExactMatch,
    canLnurlPay,
    onInput,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const hasBottomTabs = useHasBottomTabsNavigation()
    const dispatch = useAppDispatch()
    const federationId = useAppSelector(selectActiveFederationId)
    const chatDomain = useAppSelector(selectChatConnectionOptions)?.domain
    const isChatOnline = useAppSelector(selectChatClientStatus) === 'online'
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const [isFetchingUnknownMember, setIsFetchingUnknownMember] =
        useState(false)
    const exactMatchMember = useAppSelector(s =>
        chatDomain && !isExactMatch
            ? selectChatMember(s, `${query}@${chatDomain}`)
            : null,
    )
    const [fetchedMember, setFetchedMember] = useState<ChatMember>()

    const hasExactMatchMember = !!exactMatchMember
    const noHistoryMember = exactMatchMember || fetchedMember

    // If their query is not an exact match, search for a potentially unknown
    // member. Search is debounced to reduce unnecessary searches while typing.
    useEffect(() => {
        // If we're unable to do a search due to anything missing, clear
        // previous result and stop showing loading indicator
        if (
            !query ||
            !chatDomain ||
            !federationId ||
            !isChatOnline ||
            isExactMatch ||
            hasExactMatchMember
        ) {
            setIsFetchingUnknownMember(false)
            setFetchedMember(undefined)
            return
        }

        // Mark loading and clear previous result immediately
        setIsFetchingUnknownMember(true)
        setFetchedMember(undefined)

        // Wrap search in async cancelable function to be called after delay
        let canceled = false
        const search = async () => {
            const memberId = `${query}@${chatDomain}`

            if (memberId === authenticatedMember?.id) return

            try {
                const member = await dispatch(
                    fetchChatMember({ federationId, memberId }),
                ).unwrap()
                if (canceled) return
                setFetchedMember(member)
            } catch {
                /* no-op */
            }
            if (canceled) return
            setIsFetchingUnknownMember(false)
        }

        // On re-run of useEffect, clear search debounce and cancel in case it's in flight
        const timeout = setTimeout(search, 500)
        return () => {
            clearTimeout(timeout)
            canceled = true
        }
    }, [
        query,
        chatDomain,
        federationId,
        isChatOnline,
        isExactMatch,
        hasExactMatchMember,
        dispatch,
        authenticatedMember?.id,
    ])

    const searchResultsSections = useMemo(() => {
        const sections: OmniMemberSearchListData[] = []
        // Show people they know that fit the search query
        if (searchedMembers.length) {
            sections.push({
                title: t('words.people'),
                data: searchedMembers,
            })
        }
        // If they provided a lightning address and support lnurl payments, suggest that
        if (canLnurlPay && isValidInternetIdentifier(query)) {
            sections.push({
                title: t('phrases.lightning-address'),
                data: [{ username: query, id: query, inputData: query }],
            })
        }
        // Show members that are exact matches that we have no history with, or a loader
        // if we're looking up if they exist
        if (noHistoryMember && noHistoryMember.id !== authenticatedMember?.id) {
            sections.push({
                title: t('feature.omni.search-no-history-header'),
                data: [noHistoryMember],
            })
        } else if (isFetchingUnknownMember) {
            sections.push({ title: '', data: [{ loading: true }] })
        }
        return sections
    }, [
        query,
        searchedMembers,
        noHistoryMember,
        isFetchingUnknownMember,
        authenticatedMember?.id,
        canLnurlPay,
        t,
    ])

    const style = styles(theme, hasBottomTabs ? {} : insets)
    return (
        <SectionList
            sections={searchResultsSections}
            keyboardShouldPersistTaps="always"
            renderSectionHeader={({ section }) =>
                'loading' in section ? null : (
                    <Text small medium style={style.searchHeading}>
                        {section.title}
                    </Text>
                )
            }
            renderItem={({ item }) => (
                <OmniMemberSearchItem item={item} onInput={onInput} />
            )}
            keyExtractor={item => ('id' in item ? `${item.id}` : 'loading')}
            style={style.searchMembersScrollOuter}
            contentContainerStyle={style.searchMembersScrollInner}
            ListEmptyComponent={
                query ? (
                    <View style={style.searchEmpty}>
                        <Text>
                            {t('feature.omni.search-no-results', {
                                query,
                            })}
                        </Text>
                    </View>
                ) : null
            }
        />
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        searchMembersScrollOuter: {
            flex: 1,
        },
        searchMembersScrollInner: {
            paddingTop: theme.spacing.md,
            paddingBottom: Math.max(theme.spacing.md, insets.bottom || 0),
        },
        searchHeading: {
            backgroundColor: theme.colors.secondary,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xs,
            color: theme.colors.grey,
        },
        searchEmpty: {
            alignItems: 'center',
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
        },
    })
