import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useChatTimelineSearchQuery } from '@fedi/common/hooks/matrix'

import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import SearchBar from './SearchBar'

const ChatConversationSearchHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    const { query, setQuery, clearSearch } = useChatTimelineSearchQuery()

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery)
    }

    const handleClearSearch = () => {
        setQuery('')
        clearSearch()
    }

    return (
        <Header
            containerStyle={style.container}
            backButton
            leftContainerStyle={style.leftContainer}
            centerContainerStyle={style.centerContainer}
            headerCenter={
                <View>
                    <SearchBar
                        rightIcon={
                            query.length > 0 && (
                                <PressableIcon
                                    onPress={handleClearSearch}
                                    svgName="Close"
                                    svgProps={{ size: 20 }}
                                />
                            )
                        }
                        query={query}
                        setQuery={handleQueryChange}
                        clearSearch={handleClearSearch}
                        placeholder={t(
                            'feature.chat.search-messages-placeholder',
                        )}
                    />
                </View>
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {},
        leftContainer: {
            flex: 0,
        },
        centerContainer: {
            flexGrow: 1,
            marginLeft: theme.spacing.md,
            maxWidth: '85%',
        },
    })

export default ChatConversationSearchHeader
