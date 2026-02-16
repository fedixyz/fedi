import { RouteProp, useRoute } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useChatsListSearch } from '@fedi/common/hooks/matrix'

import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import SvgImage from '../../ui/SvgImage'
import SearchBar from './SearchBar'

type ChatListSearchRouteProp = RouteProp<RootStackParamList, 'ChatsListSearch'>

const ChatsListSearchHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)
    const route = useRoute<ChatListSearchRouteProp>()
    const { initialQuery } = route.params

    const { query, setQuery } = useChatsListSearch(initialQuery)

    const handleClearSearch = () => {
        setQuery('')
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
                        placeholder={t('feature.chat.search-chats-placeholder')}
                        query={query}
                        setQuery={setQuery}
                        clearSearch={handleClearSearch}
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

export default ChatsListSearchHeader
