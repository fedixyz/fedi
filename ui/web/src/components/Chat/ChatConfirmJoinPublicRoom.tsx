import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useMatrixChatInvites } from '@fedi/common/hooks/matrix'
import {
    getMatrixRoomPreview,
    selectGroupPreview,
    selectMatrixRoom,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { chatRoute, chatRoomRoute } from '../../constants/routes'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { Button } from '../Button'
import { ChatAvatar } from '../Chat/ChatAvatar'
import { Column } from '../Flex'
import { HoloLoader } from '../HoloLoader'
import * as Layout from '../Layout'
import { Text } from '../Text'
import { KnockPendingView } from './KnockPendingView'

type Props = {
    roomId: string
}

const log = makeLog('ConfirmJoinPublicGroup')

export const ChatConfirmJoinPublicRoom = ({ roomId }: Props) => {
    const { t } = useTranslation()
    const { replace } = useRouter()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()

    const { joinPublicGroup, knockGroup } = useMatrixChatInvites(t)

    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const groupPreview = useAppSelector(s => selectGroupPreview(s, roomId))

    const [isJoiningGroup, setIsJoiningGroup] = useState(false)
    // True once the preview fetch settles, success or failure. We still render
    // the request-to-join screen on failure rather than stranding the user.
    const [previewSettled, setPreviewSettled] = useState(false)
    // Knock was issued but sync hasn't reflected it yet. Local flag swaps in
    // KnockPendingView so a fast second tap can't fire a duplicate knock.
    const [hasKnockedLocally, setHasKnockedLocally] = useState(false)

    const isAlreadyKnocked = room?.roomState === 'knocked' || hasKnockedLocally
    const isPublic = groupPreview?.info?.isPublic ?? false
    // Some homeservers won't return preview metadata even for knockable rooms,
    // so default to true and let the knock response reveal invite-only rooms.
    const allowKnocking = groupPreview?.info?.allowKnocking ?? true
    const canJoin = isPublic || allowKnocking
    const roomName = groupPreview?.info?.name || room?.name || null

    // Existing members/invitees go straight to the conversation. Knocked rooms
    // stay to show the pending view, and left/banned rooms stay so a declined
    // user can request to join again (matching native's RoomLink).
    const isMemberOrInvitee =
        room?.roomState === 'joined' || room?.roomState === 'invited'
    useEffect(() => {
        if (isMemberOrInvitee) replace(chatRoomRoute(roomId))
    }, [isMemberOrInvitee, roomId, replace])

    useEffect(() => {
        // Left/banned rooms still need the preview so a public room offers
        // rejoin rather than defaulting to the private knock branch.
        if (isMemberOrInvitee || room?.roomState === 'knocked' || groupPreview)
            return

        let isCancelled = false
        const previewRequest = dispatch(
            getMatrixRoomPreview({ fedimint, roomId }),
        )

        previewRequest
            .unwrap()
            .catch(() => {
                // Some homeservers don't expose a summary for knockable rooms.
                // Fall through to the request-to-join screen instead of bailing.
                log.info('Room preview unavailable; offering request to join')
            })
            .finally(() => {
                if (isCancelled) return
                setPreviewSettled(true)
            })

        return () => {
            isCancelled = true
            previewRequest.abort()
        }
    }, [
        isMemberOrInvitee,
        room?.roomState,
        roomId,
        groupPreview,
        dispatch,
        fedimint,
    ])

    const handleJoinGroup = async () => {
        if (!canJoin || hasKnockedLocally) return
        setIsJoiningGroup(true)

        try {
            if (isPublic) {
                await joinPublicGroup(roomId)
                replace(chatRoomRoute(roomId))
            } else {
                await knockGroup(roomId)
                setHasKnockedLocally(true)
            }
        } catch {
            // joinPublicGroup throws if the room is already joined; knockGroup
            // surfaces its own error toast.
        } finally {
            setIsJoiningGroup(false)
        }
    }

    if (isAlreadyKnocked) {
        return (
            <KnockPendingView
                roomName={roomName}
                onGoBack={() => replace(chatRoute)}
            />
        )
    }

    const isPreviewPending = !room && !groupPreview && !previewSettled
    if (isMemberOrInvitee || isPreviewPending) {
        return (
            <Column center grow>
                <HoloLoader size="md" />
            </Column>
        )
    }

    return (
        <Layout.Root>
            <Layout.Header back />
            <Layout.Content>
                <Column grow center>
                    <Column center grow fullWidth gap="sm">
                        {groupPreview && (
                            <ChatAvatar size="md" room={groupPreview.info} />
                        )}
                        <Text variant="h2" weight="medium" center>
                            {isPublic && groupPreview
                                ? t(
                                      'feature.onboarding.welcome-to-federation',
                                      { federation: groupPreview.info.name },
                                  )
                                : roomName || t('feature.chat.join-a-group')}
                        </Text>
                        <Text center>
                            {isPublic
                                ? t('feature.chat.public-group-notice')
                                : canJoin
                                  ? t('feature.chat.private-group-notice')
                                  : t('feature.chat.invite-only-group-notice')}
                        </Text>
                    </Column>
                    {canJoin && (
                        <Column fullWidth>
                            <Button
                                width="full"
                                onClick={handleJoinGroup}
                                loading={isJoiningGroup}
                                disabled={isJoiningGroup}>
                                {isPublic
                                    ? t('words.continue')
                                    : t('feature.chat.request-to-join')}
                            </Button>
                        </Column>
                    )}
                </Column>
            </Layout.Content>
        </Layout.Root>
    )
}
