import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { MatrixRoom } from '@fedi/common/types'

import { AvatarSize } from '../../ui/Avatar'
import Flex from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'
import ChatAvatar from './ChatAvatar'

interface Props {
    room?: MatrixRoom
}

export const ChatSettingsAvatar: React.FC<Props> = ({ room }) => {
    const { theme } = useTheme()

    const style = styles(theme)

    if (!room) return <HoloLoader />

    return (
        <Flex center style={style.container}>
            <ChatAvatar
                room={room}
                size={AvatarSize.lg}
                containerStyle={style.avatar}
                maxFontSizeMultiplier={1}
            />
            <Text h2 style={style.roomName} numberOfLines={1}>
                {room?.name || ''}
            </Text>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        roomName: {
            marginBottom: theme.spacing.lg,
        },
        avatar: {
            marginBottom: theme.spacing.md,
        },
        container: {
            marginBottom: theme.spacing.lg,
        },
    })
