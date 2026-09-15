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
import { isForbiddenToKnockError } from '@fedi/common/utils/matrix'

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
    // Set when a knock is rejected as invite-only (403 / M_FORBIDDEN). The room
    // was previewable as unknown, so we only learn it can't be knocked once the
    // server answers; this drops the request-to-join and shows invite-only copy.
    const [isInviteOnly, setIsInviteOnly] = useState(false)
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
    const allowKnocking = previewGroup?.info?.allowKnocking ?? false
    // Some homeservers won't return preview metadata even for knockable rooms
    // (older servers, federation gaps). A null preview (fetch failed) or the
    // unpreviewable placeholder marker is that "unknown" state: still let the
    // user attempt to knock; the server's response is what reveals an
    // invite-only room, which flips isInviteOnly below.
    const previewUnavailable =
        previewGroup === null ||
        (previewGroup?.info?.previewUnavailable ?? false)
    const canJoin =
        !isInviteOnly && (isPublic || allowKnocking || previewUnavailable)

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
        } catch (err) {
            // knockGroup surfaces its own toast and rethrows. Catching here
            // avoids an unhandled promise rejection, and a 403 tells us the
            // room is invite-only, so swap to the invite-only state instead of
            // leaving a request-to-join that can never succeed.
            if (isForbiddenToKnockError(err)) {
                setIsInviteOnly(true)
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
        <SafeAreaContainer edges="notop" testID="ConfirmJoinPublicGroupScreen">
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
                        : !canJoin
                          ? t('feature.chat.invite-only-group-notice')
                          : previewUnavailable
                            ? t('feature.chat.unpreviewable-group-notice')
                            : t('feature.chat.private-group-notice')}
                </Text>
            </Column>
            {canJoin && (
                <Button
                    testID="ConfirmJoinButton"
                    onPress={handleJoinGroup}
                    loading={isJoiningGroup}>
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
