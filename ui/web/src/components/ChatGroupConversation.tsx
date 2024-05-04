import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import CogIcon from '@fedi/common/assets/svgs/cog.svg'
import Edit from '@fedi/common/assets/svgs/edit.svg'
import LeaveRoom from '@fedi/common/assets/svgs/leave-room.svg'
import Room from '@fedi/common/assets/svgs/room.svg'
import SpeakerPhone from '@fedi/common/assets/svgs/speakerphone.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    configureChatGroup,
    leaveChatGroup,
    selectActiveFederationId,
    selectChat,
    selectChatGroup,
    selectChatGroupAffiliation,
    selectChatGroupRole,
    selectChatMessages,
    sendGroupMessage,
} from '@fedi/common/redux'
import { ChatAffiliation, ChatRole, ChatType } from '@fedi/common/types'
import { encodeGroupInvitationLink } from '@fedi/common/utils/xmpp'

import { useAppDispatch, useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { ChatAvatar } from './ChatAvatar'
import ChatBroadcastAdminAdd from './ChatBroadcastAdminAdd'
import ChatBroadcastAdminSettings from './ChatBroadcastAdminSettings'
import { ChatConversation } from './ChatConversation'
import { ChatEmptyState } from './ChatEmptyState'
import { CopyInput } from './CopyInput'
import { Dialog } from './Dialog'
import { IconButton } from './IconButton'
import * as Layout from './Layout'
import { QRCode } from './QRCode'
import { Text } from './Text'

interface Props {
    groupId: string
}

export type ChatGroupDialogState =
    | 'settings'
    | 'share'
    | 'broadcast-admins'
    | 'add-broadcast-admin'
    | false

export const ChatGroupConversation: React.FC<Props> = ({ groupId }) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const toast = useToast()
    const federationId = useAppSelector(selectActiveFederationId)
    const group = useAppSelector(s => selectChatGroup(s, groupId))
    const messages = useAppSelector(s => selectChatMessages(s, groupId))
    const role = useAppSelector(s => selectChatGroupRole(s, groupId))
    const myAffiliation = useAppSelector(s =>
        selectChatGroupAffiliation(s, groupId),
    )
    const [dialogState, setDialogState] = useState<ChatGroupDialogState>(false)

    const chat = useAppSelector(s => selectChat(s, group?.id || ''))

    const handleSend = useCallback(
        async (content: string) => {
            if (!federationId) throw new Error('errors.unknown-error')
            // No need for try / catch, ChatConversation handles errors
            await dispatch(
                sendGroupMessage({
                    federationId,
                    groupId,
                    content,
                }),
            ).unwrap()
        },
        [dispatch, federationId, groupId],
    )

    const handleEditGroupName = useCallback(async () => {
        try {
            if (!federationId || !group) return
            const newName = prompt(t('feature.chat.change-group-name'))
            if (!newName) return
            await dispatch(
                configureChatGroup({
                    federationId,
                    groupId: group?.id,
                    groupName: newName,
                }),
            ).unwrap()
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [t, dispatch, toast, federationId, group])

    const handleLeaveGroup = useCallback(async () => {
        const shouldLeave = confirm(t('feature.chat.leave-group-confirmation'))
        if (!federationId || !group) return
        if (shouldLeave) {
            await dispatch(leaveChatGroup({ federationId, groupId: group?.id }))
            setDialogState(false)
        }
    }, [t, federationId, group, dispatch])

    if (!group) {
        return (
            <ChatEmptyState>{t('feature.chat.group-not-found')}</ChatEmptyState>
        )
    }

    const link = group ? encodeGroupInvitationLink(group.id) : ''
    return (
        <ChatConversation
            type={ChatType.group}
            id={group.id}
            name={group?.name || ''}
            messages={messages}
            onSendMessage={handleSend}
            headerActions={
                group && (
                    <>
                        <IconButton
                            size="md"
                            icon={CogIcon}
                            onClick={() => setDialogState('settings')}
                        />
                        <Dialog
                            open={dialogState === 'share'}
                            onOpenChange={(open: boolean) =>
                                setDialogState(open ? 'share' : false)
                            }
                            title={t('feature.chat.invite-to-group')}>
                            <Layout.Root>
                                <Layout.Content centered>
                                    <QRWrapper>
                                        <QRCode data={link} />
                                    </QRWrapper>
                                </Layout.Content>
                                <Layout.Actions>
                                    <CopyInput
                                        value={link}
                                        onCopyMessage={t(
                                            'feature.chat.copied-group-invite-code',
                                        )}
                                    />
                                </Layout.Actions>
                            </Layout.Root>
                        </Dialog>
                        <Dialog
                            open={dialogState === 'broadcast-admins'}
                            onOpenChange={(open: boolean) =>
                                setDialogState(
                                    open ? 'broadcast-admins' : false,
                                )
                            }
                            title={t('feature.chat.admin-settings')}>
                            <ChatBroadcastAdminSettings
                                setDialogState={setDialogState}
                                groupId={groupId}
                            />
                        </Dialog>

                        <Dialog
                            open={dialogState === 'add-broadcast-admin'}
                            onOpenChange={(open: boolean) =>
                                setDialogState(
                                    open ? 'add-broadcast-admin' : false,
                                )
                            }
                            title={t('feature.chat.add-admin')}>
                            <ChatBroadcastAdminAdd
                                setDialogState={setDialogState}
                                groupId={groupId}
                            />
                        </Dialog>

                        <Dialog
                            open={dialogState === 'settings'}
                            onOpenChange={(open: boolean) =>
                                setDialogState(open ? 'settings' : false)
                            }>
                            <Layout.Root>
                                <Layout.Content centered>
                                    <SettingsWrapper>
                                        <GroupHeader>
                                            <ChatAvatar chat={chat} size="lg" />
                                            <Text variant="h2">
                                                {group.name}
                                            </Text>
                                        </GroupHeader>
                                        <ItemsWrapper>
                                            {role === ChatRole.moderator && (
                                                <Button
                                                    variant="outline"
                                                    icon={Edit}
                                                    onClick={
                                                        handleEditGroupName
                                                    }>
                                                    {t(
                                                        'feature.chat.edit-group',
                                                    )}
                                                </Button>
                                            )}
                                            {myAffiliation ===
                                                ChatAffiliation.owner && (
                                                <Button
                                                    variant="outline"
                                                    icon={SpeakerPhone}
                                                    onClick={() =>
                                                        setDialogState(
                                                            'broadcast-admins',
                                                        )
                                                    }>
                                                    {t(
                                                        'feature.chat.broadcast-admin-settings',
                                                    )}
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                icon={Room}
                                                onClick={() =>
                                                    setDialogState('share')
                                                }>
                                                {t(
                                                    'feature.chat.invite-to-group',
                                                )}
                                            </Button>
                                            <Button
                                                onClick={handleLeaveGroup}
                                                variant="outline"
                                                icon={LeaveRoom}>
                                                {t('feature.chat.leave-group')}
                                            </Button>
                                        </ItemsWrapper>
                                    </SettingsWrapper>
                                </Layout.Content>
                            </Layout.Root>
                        </Dialog>
                    </>
                )
            }
        />
    )
}

const QRWrapper = styled('div', {
    width: '100%',
    margin: '12px auto 0',
})

const ItemsWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.md,
})

const SettingsWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.xl,
})

const GroupHeader = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.lg,
    alignItems: 'center',
})
