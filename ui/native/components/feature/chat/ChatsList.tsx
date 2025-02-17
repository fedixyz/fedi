import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import {
    Dimensions,
    FlatList,
    ListRenderItem,
    StyleSheet,
    Vibration,
} from 'react-native'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    previewAllDefaultChats,
    refetchMatrixRoomList,
    selectMatrixChatsList,
    selectMatrixStatus,
} from '@fedi/common/redux'
import { ChatType, MatrixRoom, MatrixSyncStatus } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import HoloLoader from '../../ui/HoloLoader'
import { ChatRoomActionsOverlay } from './ChatRoomActionsOverlay'
import ChatTile from './ChatTile'

const WINDOW_WIDTH = Dimensions.get('window').width

const ChatsList: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const dispatch = useAppDispatch()

    const rooms = useAppSelector(selectMatrixChatsList)
    const syncStatus = useAppSelector(selectMatrixStatus)
    const [isRefetching, setIsRefetching] = useState(false)
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

    const handleRefresh = useCallback(() => {
        setIsRefetching(true)
        Promise.all([
            dispatch(refetchMatrixRoomList()),
            dispatch(previewAllDefaultChats()),
        ])
            .catch(() => null) // no-op
            .finally(() => setIsRefetching(false))
    }, [dispatch])

    const handleLongPressChat = useCallback((chat: MatrixRoom) => {
        Vibration.vibrate(10)
        setSelectedRoomId(chat.id)
    }, [])

    const handleOpenChat = useCallback(
        (chat: MatrixRoom) => {
            navigation.navigate('ChatRoomConversation', {
                roomId: chat.id,
                chatType: chat.directUserId ? ChatType.direct : ChatType.group,
            })
        },
        [navigation],
    )

    const renderChat: ListRenderItem<MatrixRoom> = useCallback(
        ({ item }) => {
            return (
                <ErrorBoundary fallback={null}>
                    <ChatTile
                        room={item}
                        onSelect={handleOpenChat}
                        onLongPress={handleLongPressChat}
                    />
                </ErrorBoundary>
            )
        },
        [handleLongPressChat, handleOpenChat],
    )

    if (syncStatus === MatrixSyncStatus.initialSync) {
        return <HoloLoader size={30} />
    }

    return (
        <>
            <FlatList
                style={styles(theme).container}
                contentContainerStyle={styles(theme).content}
                data={rooms}
                renderItem={renderChat}
                onRefresh={handleRefresh}
                refreshing={isRefetching}
                keyExtractor={item => `${item.id}`}
                progressViewOffset={-10}
                // optimization that allows skipping the measurement of dynamic content
                // for fixed-size list items
                getItemLayout={(data, index) => ({
                    length: WINDOW_WIDTH,
                    offset: 48 * index,
                    index,
                })}
            />
            <ChatRoomActionsOverlay
                show={selectedRoomId !== null}
                onDismiss={() => setSelectedRoomId(null)}
                selectedRoomId={selectedRoomId}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
        content: {
            paddingBottom: theme.spacing.sm,
            paddingHorizontal: theme.spacing.sm,
        },
    })

export default ChatsList
