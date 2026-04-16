import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { selectMatrixRoom, setMatrixRoomName } from '@fedi/common/redux'

import { chatRoomRoute } from '../../constants/routes'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { Button } from '../Button'
import { CircularLoader } from '../CircularLoader'
import { Column } from '../Flex'
import { Input } from '../Input'
import * as Layout from '../Layout'
import { ChatAvatar } from './ChatAvatar'

type Props = {
    roomId?: string
}

export const ChatEditRoom: React.FC<Props> = ({ roomId }) => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()

    const room = useAppSelector(s => selectMatrixRoom(s, roomId || ''))

    const [groupName, setGroupName] = useState<string>(room?.name || '')
    const [isEditing, setIsEditing] = useState<boolean>(false)

    const handleEditRoomName = async () => {
        if (!room || !groupName) return
        setIsEditing(true)
        try {
            await dispatch(
                setMatrixRoomName({
                    fedimint,
                    roomId: room.id,
                    name: groupName,
                }),
            ).unwrap()
            push(chatRoomRoute(room.id))
        } catch (err) {
            toast.error(t, 'errors.unknown-error')
        } finally {
            setIsEditing(false)
        }
    }

    if (!room) {
        return (
            <Column center grow>
                <CircularLoader />
            </Column>
        )
    }

    return (
        <Column grow>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t('feature.chat.change-group-name')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Column gap="md" align="center">
                    <ChatAvatar size="lg" room={room} />
                    <Input
                        label={t('feature.chat.group-name')}
                        value={groupName}
                        onChange={ev => setGroupName(ev.currentTarget.value)}
                        maxLength={30}
                    />
                </Column>
            </Layout.Content>
            <Layout.Actions>
                <Button
                    width="full"
                    loading={isEditing}
                    onClick={handleEditRoomName}
                    disabled={!groupName || isEditing}>
                    {t('phrases.save-changes')}
                </Button>
            </Layout.Actions>
        </Column>
    )
}
