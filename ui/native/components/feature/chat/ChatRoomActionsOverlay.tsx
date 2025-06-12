import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { selectMatrixRoom } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { AvatarSize } from '../../ui/Avatar'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'
import ChatAvatar from './ChatAvatar'
import ChatRoomActions from './ChatRoomActions'

interface Props {
    selectedRoomId: string | null
    show: boolean
    onDismiss: () => void
}

export const ChatRoomActionsOverlay: React.FC<Props> = ({
    selectedRoomId,
    show,
    onDismiss,
}) => {
    const room = useAppSelector(s => selectMatrixRoom(s, selectedRoomId ?? ''))
    const { theme } = useTheme()

    const style = styles(theme)

    if (!selectedRoomId || !room) return <></>

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={() => onDismiss()}
            contents={{
                title: room ? (
                    <Flex row center gap="xs">
                        <ChatAvatar
                            containerStyle={[style.avatar]}
                            room={room}
                            size={AvatarSize.sm}
                        />
                        <Text
                            bold
                            style={style.title}
                            numberOfLines={1}
                            adjustsFontSizeToFit>
                            {room?.name ?? ''}
                        </Text>
                    </Flex>
                ) : (
                    ''
                ),
                body: !room ? (
                    <HoloLoader size={48} />
                ) : (
                    <ChatRoomActions room={room} dismiss={() => onDismiss()} />
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        title: {
            textAlign: 'center',
            flexShrink: 1,
        },
        avatar: {
            marginRight: theme.spacing.xs,
        },
    })
