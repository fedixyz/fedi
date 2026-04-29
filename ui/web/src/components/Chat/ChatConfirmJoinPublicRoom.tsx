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

type Props = {
    roomId: string
}

const log = makeLog('ConfirmJoinPublicGroup')

export const ChatConfirmJoinPublicRoom = ({ roomId }: Props) => {
    const { t } = useTranslation()
    const { replace } = useRouter()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()

    const { joinPublicGroup } = useMatrixChatInvites(t)

    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const groupPreview = useAppSelector(s => selectGroupPreview(s, roomId))

    const [isJoiningGroup, setIsJoiningGroup] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (room) replace(chatRoomRoute(roomId))
    }, [room, roomId, replace])

    useEffect(() => {
        if (room || groupPreview) return

        let isCancelled = false
        const previewRequest = dispatch(
            getMatrixRoomPreview({ fedimint, roomId }),
        )

        setIsLoading(true)
        previewRequest
            .unwrap()
            .catch(() => {
                if (isCancelled) return

                log.info('Failed to fetch room preview')
                replace(chatRoute)
            })
            .finally(() => {
                if (isCancelled) return
                setIsLoading(false)
            })

        return () => {
            isCancelled = true
            previewRequest.abort()
        }
    }, [room, roomId, groupPreview, dispatch, fedimint, replace])

    const handleJoinGroup = async (id: string) => {
        setIsJoiningGroup(true)

        try {
            await joinPublicGroup(id)
            replace(chatRoomRoute(id))
        } catch {
            // joinPublicGroup will throw if the room is already joined
        } finally {
            setIsJoiningGroup(false)
        }
    }

    if (isLoading || !groupPreview || room) {
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
                        <ChatAvatar size="md" room={groupPreview.info} />
                        <Text variant="h2" weight="medium" center>
                            {t('feature.onboarding.welcome-to-federation', {
                                federation: groupPreview.info.name,
                            })}
                        </Text>
                        <Text center>
                            {t('feature.chat.public-group-notice')}
                        </Text>
                    </Column>
                    <Column fullWidth>
                        <Button
                            width="full"
                            onClick={() => handleJoinGroup(roomId)}
                            loading={isJoiningGroup}
                            disabled={isJoiningGroup}>
                            {t('words.continue')}
                        </Button>
                    </Column>
                </Column>
            </Layout.Content>
        </Layout.Root>
    )
}
