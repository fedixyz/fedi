import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Dimensions, FlatList, ListRenderItem, StyleSheet } from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectOrderedChatList } from '@fedi/common/redux'
import { ChatType, ChatWithLatestMessage } from '@fedi/common/types'

import LegacyChatTile from '../components/feature/chat/LegacyChatTile'
import { useAppSelector } from '../state/hooks'
import { NavigationHook, RootStackParamList } from '../types/navigation'

const WINDOW_WIDTH = Dimensions.get('window').width

export type Props = NativeStackScreenProps<RootStackParamList, 'LegacyChat'>

const LegacyChat: React.FC<Props> = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const chats = useAppSelector(selectOrderedChatList)

    const renderChat: ListRenderItem<ChatWithLatestMessage> = ({ item }) => {
        return (
            <ErrorBoundary fallback={null}>
                <LegacyChatTile
                    chat={item}
                    selectChat={(chat: ChatWithLatestMessage) => {
                        if (chat.type === ChatType.direct) {
                            navigation.navigate('DirectChat', {
                                memberId: chat.id,
                            })
                        } else {
                            navigation.navigate('GroupChat', {
                                groupId: chat.id,
                            })
                        }
                    }}
                />
            </ErrorBoundary>
        )
    }

    return (
        <FlatList
            style={styles(theme).container}
            contentContainerStyle={styles(theme).content}
            data={chats}
            renderItem={renderChat}
            keyExtractor={item => `${item.id}`}
            // optimization that allows skipping the measurement of dynamic content
            // for fixed-size list items
            getItemLayout={(data, index) => ({
                length: WINDOW_WIDTH,
                offset: 48 * index,
                index,
            })}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            paddingRight: theme.spacing.md,
        },
        content: {
            paddingBottom: theme.spacing.sm,
        },
    })

export default LegacyChat
