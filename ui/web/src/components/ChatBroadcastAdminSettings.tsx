import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import Delete from '@fedi/common/assets/svgs/delete.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    fetchChatGroupMembersList,
    removeAdminFromChatGroup,
    selectActiveFederationId,
} from '@fedi/common/redux'
import { ChatMember } from '@fedi/common/types'
import { XmppMemberRole } from '@fedi/common/utils/XmlUtils'

import { useAppDispatch, useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { ChatGroupDialogState } from './ChatGroupConversation'
import { CircularLoader } from './CircularLoader'
import { IconButton } from './IconButton'
import { Text } from './Text'

export default function ChatBroadcastAdminSettings({
    setDialogState,
    groupId,
}: {
    setDialogState: (state: ChatGroupDialogState) => void
    groupId: string
}) {
    const { t } = useTranslation()

    const toast = useToast()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)

    const [admins, setAdmins] = useState<ChatMember[] | null>(null)

    const refreshAdminList = useCallback(async () => {
        if (activeFederationId) {
            setAdmins(
                await dispatch(
                    fetchChatGroupMembersList({
                        federationId: activeFederationId,
                        groupId,
                        role: XmppMemberRole.participant,
                    }),
                ).unwrap(),
            )
        }
    }, [activeFederationId, dispatch, groupId])

    const confirmRemoveAdmin = async (member: ChatMember) => {
        try {
            if (activeFederationId) {
                await dispatch(
                    removeAdminFromChatGroup({
                        federationId: activeFederationId,
                        groupId,
                        memberId: member.id,
                    }),
                ).unwrap()
                refreshAdminList()
            }
        } catch (error) {
            toast.error(t, error, t('errors.unknown-error'))
        }
    }

    useEffect(() => {
        refreshAdminList()
    }, [refreshAdminList])

    return (
        <Container>
            <Text>{t('feature.chat.broadcast-admin-instructions')}</Text>

            {admins === null ? (
                <EmptyContainer>
                    <CircularLoader />
                </EmptyContainer>
            ) : admins.length > 0 ? (
                <AdminsContainer>
                    {admins.map((admin, i) => (
                        <AdminUser key={i}>
                            <Avatar id={admin.id} name={admin.username} />
                            <AdminUsername>{admin.username}</AdminUsername>
                            <IconButton
                                size="md"
                                icon={Delete}
                                onClick={() => confirmRemoveAdmin(admin)}
                            />
                        </AdminUser>
                    ))}
                </AdminsContainer>
            ) : (
                <EmptyContainer>
                    <BubblesIcon>{'🫧'}</BubblesIcon>
                    <Text>{t('feature.chat.no-admins')}</Text>
                </EmptyContainer>
            )}

            <Button onClick={() => setDialogState('add-broadcast-admin')}>
                {t('feature.chat.add-admin')}
            </Button>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.lg,
    flexGrow: 1,
    height: '100%',
})

const AdminsContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.lg,
    maxHeight: 220,
    overflowY: 'scroll',
    flexGrow: 1,

    '@sm': {
        maxHeight: 'unset',
    },
})

const AdminUser = styled('div', {
    display: 'flex',
    gap: theme.space.sm,
    alignItems: 'center',
})

const AdminUsername = styled(Text, {
    flex: 1,
})

const EmptyContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.lg,
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.lg,
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 12,
    color: theme.colors.grey,
    alignItems: 'center',
})

const BubblesIcon = styled('span', {
    width: 48,
    height: 48,
    fontSize: 48,
    lineHeight: '64.8px',
    textAlign: 'center',
})
