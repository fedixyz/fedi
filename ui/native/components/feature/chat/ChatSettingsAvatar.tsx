import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { MatrixRoom } from '@fedi/common/types'

import { AvatarSize } from '../../ui/Avatar'
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
        <View style={style.container}>
            <ChatAvatar
                room={room}
                size={AvatarSize.lg}
                containerStyle={style.avatar}
                maxFontSizeMultiplier={1}
            />
            <Text h2 style={style.roomName} numberOfLines={1}>
                {room?.name || ''}
            </Text>
        </View>
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
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: theme.spacing.lg,
        },
    })
