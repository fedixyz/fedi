import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Insets,
    SectionList,
    SectionListData,
    StyleSheet,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { MatrixUser } from '@fedi/common/types/matrix'
import { isValidInternetIdentifier } from '@fedi/common/utils/validation'

import { useHasBottomTabsNavigation } from '../../../utils/hooks'
import { OmniMemberSearchItem } from './OmniMemberSearchItem'

export type OmniMemberSearchListItemType =
    | { displayName?: string; id: string; inputData?: string }
    | { loading: true }
type OmniMemberSearchListData = SectionListData<OmniMemberSearchListItemType>

interface Props {
    query: string
    searchedUsers: MatrixUser[]
    canLnurlPay: boolean
    onInput(data: string): void
}

export const OmniMemberSearchList: React.FC<Props> = ({
    query,
    searchedUsers,
    canLnurlPay,
    onInput,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const hasBottomTabs = useHasBottomTabsNavigation()

    const searchResultsSections = useMemo(() => {
        const sections: OmniMemberSearchListData[] = []
        // Show people they know that fit the search query
        if (searchedUsers.length) {
            sections.push({
                title: t('words.people'),
                data: searchedUsers,
            })
        }
        // If they provided a lightning address and support lnurl payments, suggest that
        if (canLnurlPay && isValidInternetIdentifier(query)) {
            sections.push({
                title: t('phrases.lightning-address'),
                data: [{ displayName: query, id: query, inputData: query }],
            })
        }
        return sections
    }, [query, searchedUsers, canLnurlPay, t])

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
