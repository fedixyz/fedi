import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useMatrixChatInvites } from '@fedi/common/hooks/matrix'
import {
    getMatrixRoomPreview,
    selectGroupPreviews,
    selectMatrixRoom,
} from '@fedi/common/redux'
import { MatrixGroupPreview } from '@fedi/common/types'

import KnockPendingView from '../components/feature/chat/KnockPendingView'
import { Column } from '../components/ui/Flex'
import HoloCircle from '../components/ui/HoloCircle'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToGroupChat } from '../state/navigation'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmJoinPrivateGroup'
>

const ConfirmJoinPrivateGroup: React.FC<Props> = ({ route, navigation }) => {
    const { roomId } = route.params

    const { t } = useTranslation()
    const { joinPublicGroup, knockGroup } = useMatrixChatInvites(t)

    const dispatch = useAppDispatch()
    const fedimint = useFedimint()

    const [isJoiningGroup, setIsJoiningGroup] = useState(false)
    // Knock was issued but sync hasn't reflected it yet. Local flag keeps
    // the button disabled and swaps in KnockPendingView so a fast second
    // tap can't fire a duplicate matrixRoomKnock.
    const [hasKnockedLocally, setHasKnockedLocally] = useState(false)
    const [previewGroup, setPreviewGroup] = useState<
        MatrixGroupPreview | null | undefined
    >(undefined)

    const groupPreviews = useAppSelector(selectGroupPreviews)
    const existingRoom = useAppSelector(s => selectMatrixRoom(s, roomId))

    const isAlreadyJoined = existingRoom?.roomState === 'joined'
    useEffect(() => {
        if (isAlreadyJoined) {
            navigation.dispatch(resetToGroupChat(roomId))
        }
    }, [isAlreadyJoined, roomId, navigation])

    const isAlreadyKnocked =
        existingRoom?.roomState === 'knocked' || hasKnockedLocally
    // Knocking on a public room still works, but trying to join a private
    // room publicly hits 403, so default to false (knock) when unknown.
    const isPublic = previewGroup?.info?.isPublic ?? false
    // Some homeservers won't return preview metadata even for knockable
    // rooms (older servers, federation gaps). Default to true so the user
    // can attempt to knock; the server's response on knock is what tells
    // us whether the room is actually invite-only.
    const allowKnocking = previewGroup?.info?.allowKnocking ?? true
    const canJoin = isPublic || allowKnocking

    const handleJoinGroup = useCallback(async () => {
        if (!canJoin || hasKnockedLocally) return
        setIsJoiningGroup(true)
        try {
            if (isPublic) {
                await joinPublicGroup(roomId)
                navigation.dispatch(resetToGroupChat(roomId))
            } else {
                await knockGroup(roomId)
                setHasKnockedLocally(true)
            }
        } finally {
            setIsJoiningGroup(false)
        }
    }, [
        canJoin,
        hasKnockedLocally,
        roomId,
        isPublic,
        joinPublicGroup,
        knockGroup,
        navigation,
    ])

    useEffect(() => {
        const defaultGroup = groupPreviews[roomId]

        if (defaultGroup) {
            setPreviewGroup(defaultGroup)
            return
        }
        dispatch(getMatrixRoomPreview({ fedimint, roomId: roomId }))
            .unwrap()
            .then(preview => {
                setPreviewGroup(preview)
            })
            .catch(() => {
                setPreviewGroup(null)
            })
    }, [groupPreviews, roomId, dispatch, fedimint])

    const roomName = previewGroup?.info?.name || existingRoom?.name || null

    if (isAlreadyKnocked) {
        return (
            <KnockPendingView
                roomName={roomName}
                edges="notop"
                onGoBack={() => navigation.goBack()}
            />
        )
    }

    return previewGroup === undefined ? null : (
        <SafeAreaContainer edges="notop">
            <Column center grow gap="md">
                <HoloCircle
                    content={<Text style={style.iconText}>👋</Text>}
                    size={64}
                />
                <Text h2 h2Style={style.buttonText}>
                    {roomName || t('feature.chat.join-a-group')}
                </Text>
                <Text medium style={style.messageNotice}>
                    {isPublic
                        ? t('feature.chat.public-group-notice')
                        : canJoin
                          ? t('feature.chat.private-group-notice')
                          : t('feature.chat.invite-only-group-notice')}
                </Text>
            </Column>
            {canJoin && (
                <Button onPress={handleJoinGroup} loading={isJoiningGroup}>
                    {isPublic
                        ? t('words.continue')
                        : t('feature.chat.request-to-join')}
                </Button>
            )}
        </SafeAreaContainer>
    )
}

const style = StyleSheet.create({
    buttonText: {
        textAlign: 'center',
    },
    iconText: {
        fontSize: 24,
    },
    messageNotice: {
        textAlign: 'center',
    },
})

export default ConfirmJoinPrivateGroup
