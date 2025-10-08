import { RouteProp, useRoute } from '@react-navigation/native'
import { Input, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useChatsListSearch } from '@fedi/common/hooks/matrix'

import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import SvgImage from '../../ui/SvgImage'

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
                            'feature.chat.search-chats-placeholder',
                            'Search chats...',
                        )}
                        onChangeText={setQuery}
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
        container: {
            paddingTop: 0,
        },
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

export default ChatsListSearchHeader
