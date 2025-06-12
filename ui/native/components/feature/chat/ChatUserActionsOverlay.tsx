import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect } from 'react'
import { StyleSheet } from 'react-native'

import {
    addMatrixUser,
    selectMatrixRoomMember,
    selectMatrixUser,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { MatrixPowerLevel } from '../../../types'
import { AvatarSize } from '../../ui/Avatar'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import HoloLoader from '../../ui/HoloLoader'
import SvgImage from '../../ui/SvgImage'
import ChatAvatar from './ChatAvatar'
import ChatUserActions from './ChatUserActions'

interface Props {
    roomId: string
    selectedUserId: string | null
    onDismiss: () => void
}

export const ChatUserActionsOverlay: React.FC<Props> = ({
    roomId,
    selectedUserId,
    onDismiss,
}) => {
    const dispatch = useAppDispatch()
    const hasStoredUser = !!useAppSelector(s =>
        selectMatrixUser(s, selectedUserId ?? ''),
    )
    const member = useAppSelector(s =>
        selectMatrixRoomMember(s, roomId, selectedUserId ?? ''),
    )

    // this is so we can lookup the user in a direct chat
    useEffect(() => {
        if (hasStoredUser) return
        if (!member) return
        dispatch(
            addMatrixUser({
                id: member.id,
                displayName: member.displayName,
                avatarUrl: member.avatarUrl,
            }),
        )
    }, [dispatch, member, hasStoredUser])

    const { theme } = useTheme()

    if (!member) return <></>

    const isAdmin =
        !!member?.powerLevel && member.powerLevel >= MatrixPowerLevel.Admin
    const style = styles(theme)

    return (
        <CustomOverlay
            show={!!member}
            onBackdropPress={() => onDismiss()}
            contents={{
                title: (
                    <Flex row gap="xs" align="center">
                        <ChatAvatar
                            containerStyle={style.avatar}
                            user={member}
                            size={AvatarSize.sm}
                        />
                        <Text bold style={style.title}>
                            {member?.displayName ?? ''}
                        </Text>
                        {isAdmin && <SvgImage size={15} name={'AdminBadge'} />}
                    </Flex>
                ),
                body: !member ? (
                    <HoloLoader size={48} />
                ) : (
                    <ChatUserActions
                        member={member}
                        roomId={roomId}
                        dismiss={() => onDismiss()}
                    />
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        title: {
            textAlign: 'center',
        },
        avatar: {
            marginRight: theme.spacing.xs,
        },
    })
