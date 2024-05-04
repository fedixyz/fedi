import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import {
    createChatGroup,
    fetchChatMembers,
    joinChatGroup,
    selectActiveFederationId,
    selectChatXmppClient,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'
import { encodeGroupInvitationLink } from '@fedi/common/utils/xmpp'

import { useAppDispatch, useAppSelector, useIsTouchScreen } from '../hooks'
import { styled } from '../styles'
import { Button } from './Button'
import { ChatAvatar } from './ChatAvatar'
import { CopyInput } from './CopyInput'
import { Input } from './Input'
import { QRScanner } from './QRScanner'
import { Switch } from './Switch'
import { Text } from './Text'

export const ChatJoinOrCreateGroup: React.FC = () => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const dispatch = useAppDispatch()
    const toast = useToast()
    const federationId = useAppSelector(selectActiveFederationId)
    const xmppClient = useAppSelector(selectChatXmppClient)
    const [joinGroupLink, setJoinGroupLink] = useState('')
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)
    const [isScanning, setIsScanning] = useState(false)
    const [newGroupId, setNewGroupId] = useState<string>('')
    const [newGroupName, setNewGroupName] = useState(
        t('feature.chat.new-group'),
    )
    const [isSavingGroup, setIsSavingGroup] = useState(false)
    const [isBroadcastOnly, setIsBroadcastOnly] = useState(false)
    const isTouchScreen = useIsTouchScreen()

    useEffect(() => {
        if (!federationId) return
        dispatch(fetchChatMembers({ federationId }))
    }, [dispatch, federationId])

    // Generate a new group when we go to create one
    useEffect(() => {
        if (!isCreatingGroup || !xmppClient || newGroupId) return
        xmppClient.generateUniqueGroupId().then(id => {
            setNewGroupId(id)
        })
    }, [dispatch, isCreatingGroup, xmppClient, newGroupId])

    const handleJoinGroup = useCallback(async () => {
        if (!federationId) return
        try {
            const res = await dispatch(
                joinChatGroup({ federationId, link: joinGroupLink }),
            ).unwrap()
            push(`/chat/group/${res.id}`)
        } catch (err) {
            toast.error(t, err, 'errors.chat-unavailable')
        }
    }, [dispatch, toast, federationId, joinGroupLink, push, t])

    const handleSaveNewGroup = useCallback(async () => {
        setIsSavingGroup(true)
        try {
            if (!federationId) throw new Error('errors.chat-unavailable')
            const newGroup = await dispatch(
                createChatGroup({
                    federationId,
                    id: newGroupId,
                    name: newGroupName,
                    broadcastOnly: isBroadcastOnly,
                }),
            ).unwrap()
            push(`/chat/group/${newGroup.id}`)
        } catch (err) {
            toast.error(t, err, 'errors.chat-unavailable')
        }
        setIsSavingGroup(false)
    }, [
        federationId,
        newGroupId,
        newGroupName,
        dispatch,
        push,
        toast,
        isBroadcastOnly,
        t,
    ])

    // Automatically attempt to join group after changing value
    useEffect(() => {
        if (!joinGroupLink) return
        const timeout = setTimeout(() => {
            handleJoinGroup()
        }, 500)
        return () => clearTimeout(timeout)
    }, [joinGroupLink, handleJoinGroup])

    // The chat doesn't actually exist yet, so we need to create a fake one
    const chat = useMemo(() => {
        return {
            id: newGroupId,
            name: newGroupName,
            type: ChatType.group,
            broadcastOnly: isBroadcastOnly,
        }
    }, [newGroupId, newGroupName, isBroadcastOnly])

    let content: React.ReactNode
    if (isCreatingGroup) {
        content = (
            <Inner>
                <ChatAvatar
                    size="lg"
                    chat={chat}
                    css={{ opacity: chat.id ? 1 : 0 }}
                />
                <Input
                    label={t('feature.chat.group-name')}
                    value={newGroupName}
                    onChange={ev => setNewGroupName(ev.currentTarget.value)}
                />
                <CopyInput
                    label={t('feature.chat.group-invite')}
                    value={
                        newGroupId ? encodeGroupInvitationLink(newGroupId) : ''
                    }
                    onCopyMessage={t('feature.chat.copied-group-invite-code')}
                />
                <BroadcastSwitchContainer>
                    <Text>{t('feature.chat.broadcast-only')}</Text>
                    <Switch
                        checked={isBroadcastOnly}
                        onCheckedChange={setIsBroadcastOnly}
                    />
                </BroadcastSwitchContainer>
                <Buttons>
                    <Button
                        width="full"
                        disabled={!newGroupId}
                        loading={isSavingGroup}
                        onClick={handleSaveNewGroup}>
                        {t('feature.chat.view-group')}
                    </Button>
                </Buttons>
            </Inner>
        )
    } else {
        content = (
            <Inner>
                {isScanning ? (
                    <ScanWrap>
                        <QRScanner onScan={res => setJoinGroupLink(res.data)} />
                    </ScanWrap>
                ) : (
                    <Input
                        label={t('feature.chat.paste-group-invite')}
                        placeholder="fedi:group..."
                        value={joinGroupLink}
                        onChange={ev =>
                            setJoinGroupLink(ev.currentTarget.value)
                        }
                        autoFocus={!isTouchScreen}
                    />
                )}
                <Buttons>
                    {isScanning ? (
                        <Button
                            width="full"
                            onClick={() => setIsScanning(false)}>
                            {t('feature.chat.paste-group-invite')}
                        </Button>
                    ) : (
                        <Button
                            width="full"
                            onClick={() => setIsScanning(true)}>
                            {t('feature.chat.scan-group-invite')}
                        </Button>
                    )}
                    <Button
                        width="full"
                        onClick={() => setIsCreatingGroup(true)}>
                        {t('feature.chat.create-a-group')}
                    </Button>
                </Buttons>
            </Inner>
        )
    }

    return <Container>{content}</Container>
}

const Container = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 24,
})

const Inner = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    gap: 16,
})

const ScanWrap = styled('div', {
    maxWidth: 280,
    width: '100%',
})

const Buttons = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 8,
})

const BroadcastSwitchContainer = styled('div', {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
})
