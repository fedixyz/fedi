import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ChevronLeft from '@fedi/common/assets/svgs/chevron-left.svg'
import { useToast } from '@fedi/common/hooks/toast'
import { createMatrixRoom } from '@fedi/common/redux'

import { useAppDispatch, useMediaQuery } from '../hooks'
import { config, styled } from '../styles'
import { Button } from './Button'
import { ChatAvatar } from './ChatAvatar'
import { Icon } from './Icon'
import { Input } from './Input'
import * as Layout from './Layout'
import { Switch } from './Switch'
import { Text } from './Text'

export const ChatCreateRoom: React.FC = () => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const dispatch = useAppDispatch()
    const toast = useToast()
    const [newGroupName, setNewGroupName] = useState(
        t('feature.chat.new-group'),
    )
    const [isSavingGroup, setIsSavingGroup] = useState(false)
    const [isBroadcastOnly, setIsBroadcastOnly] = useState(false)
    const isSm = useMediaQuery(config.media.sm)

    const handleCreateRoom = useCallback(async () => {
        setIsSavingGroup(true)
        try {
            const { roomId } = await dispatch(
                createMatrixRoom({
                    name: newGroupName,
                    broadcastOnly: isBroadcastOnly,
                }),
            ).unwrap()
            push(`/chat/room/${roomId}`)
        } catch (err) {
            toast.error(t, 'errors.chat-unavailable')
        }
        setIsSavingGroup(false)
    }, [dispatch, newGroupName, isBroadcastOnly, push, toast, t])

    return (
        <Container>
            {isSm ? (
                <Layout.Header back="/chat/new">
                    <Layout.Title subheader>
                        {t('feature.chat.create-a-group')}
                    </Layout.Title>
                </Layout.Header>
            ) : (
                <DesktopBackButton as={Link} href="/chat/new">
                    <Icon icon={ChevronLeft} size="sm" />
                </DesktopBackButton>
            )}
            <Inner>
                <ChatAvatar
                    size="lg"
                    room={{
                        id: 'fake-room-id',
                        name: newGroupName,
                        broadcastOnly: isBroadcastOnly,
                    }}
                />
                <Input
                    label={t('feature.chat.group-name')}
                    value={newGroupName}
                    onChange={ev => setNewGroupName(ev.currentTarget.value)}
                />
                <BroadcastSwitchContainer>
                    <Text>{t('feature.chat.broadcast-only')}</Text>
                    <Switch
                        checked={isBroadcastOnly}
                        onCheckedChange={setIsBroadcastOnly}
                    />
                </BroadcastSwitchContainer>
            </Inner>
            <Buttons>
                <Button
                    width="full"
                    loading={isSavingGroup}
                    onClick={handleCreateRoom}>
                    {t('feature.chat.create-group')}
                </Button>
            </Buttons>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    position: 'relative',
})

const Inner = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: 16,
    padding: 24,
})

const Buttons = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 8,
    padding: 24,
})

const BroadcastSwitchContainer = styled('div', {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
})

const DesktopBackButton = styled('button', {
    position: 'absolute',
    top: 24,
    left: 24,
})
