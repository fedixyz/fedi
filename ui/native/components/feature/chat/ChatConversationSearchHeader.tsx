import { Input, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useChatTimelineSearchQuery } from '@fedi/common/hooks/matrix'

import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import SvgImage from '../../ui/SvgImage'

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
                    <Input
                        containerStyle={style.inputContainerOuter}
                        inputContainerStyle={style.inputContainerInner}
                        style={style.input}
                        leftIcon={<SvgImage name="Search" size={20} />}
                        rightIcon={
                            query.length > 0 && (
                                <PressableIcon
                                    onPress={handleClearSearch}
                                    svgName="Close"
                                    svgProps={{ size: 20 }}
                                />
                            )
                        }
                        value={query}
                        placeholder={t(
                            'feature.chat.search-messages-placeholder',
                            'Search messages...',
                        )}
                        onChangeText={handleQueryChange}
                        autoCapitalize="none"
                        autoFocus
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
        inputContainerOuter: {
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1.5,
            borderRadius: 8,
            paddingVertical: 0,
            marginVertical: 0,
            height: 36,
        },
        inputContainerInner: {
            height: '100%',
            width: '100%',
            borderBottomWidth: 0,
        },
        input: {
            height: '100%',
            width: '100%',
            marginTop: theme.spacing.xs,
            fontSize: 14,
        },
    })

export default ChatConversationSearchHeader
