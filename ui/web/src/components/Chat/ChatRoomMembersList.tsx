import { t } from 'i18next'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import { usePendingJoinRequests } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveMatrixRoomMembers,
    selectMatrixAuth,
    selectMatrixRoomSelfPowerLevel,
    setMatrixRoomMemberPowerLevel,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'
import {
    getUserSuffix,
    isPowerLevelGreaterOrEqual,
} from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import {
    DropdownSheet,
    DropdownSheetMenuItem,
    DropdownSheetMenuLabel,
} from '../DropdownSheet'
import { EmptyState } from '../EmptyState'
import { Column } from '../Flex'
import { Icon, SvgIconName } from '../Icon'
import { Switcher } from '../Switcher'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'
import { ChatKnockRequestActionsDialog } from './ChatKnockRequestActionsDialog'
import { ChatPendingRequestTile } from './ChatPendingRequestTile'

type MembersTab = 'members' | 'pending'

interface Props {
    roomId: string
    initialTab?: MembersTab
}

export const ChatRoomMembersList: React.FC<Props> = ({
    roomId,
    initialTab,
}) => {
    const dispatch = useAppDispatch()
    const myUserId = useAppSelector(selectMatrixAuth)?.userId
    const members = useAppSelector(s =>
        selectActiveMatrixRoomMembers(s, roomId),
    )
    const myPowerLevel = useAppSelector(s =>
        selectMatrixRoomSelfPowerLevel(s, roomId),
    )
    const { error } = useToast()

    const {
        canRespond,
        pendingMembers,
        pendingCount,
        processingUserId,
        markSeen,
        accept,
        decline,
    } = usePendingJoinRequests(roomId, t)

    const [activeTab, setActiveTab] = useState<MembersTab>(
        initialTab ?? 'members',
    )
    const [selectedPendingUserId, setSelectedPendingUserId] = useState<
        string | null
    >(null)

    const tab: MembersTab = canRespond ? activeTab : 'members'

    useEffect(() => {
        if (tab === 'pending') markSeen()
    }, [tab, markSeen])

    const selectedPendingMember =
        pendingMembers.find(m => m.id === selectedPendingUserId) ?? null

    const handleChangePowerLevel = async (
        userId: string,
        powerLevel: MatrixPowerLevel,
    ) => {
        try {
            await dispatch(
                setMatrixRoomMemberPowerLevel({
                    fedimint,
                    roomId,
                    userId,
                    powerLevel,
                }),
            ).unwrap()
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
    }

    const renderMemberContent = (member: MatrixRoomMember) => {
        const suffix = getUserSuffix(member.id)
        return (
            <>
                <ChatAvatar user={member} />
                <Text ellipsize css={{ flexShrink: 1 }}>
                    {member.displayName || member.id}
                </Text>
                <MemberSuffixText variant="caption">{suffix}</MemberSuffixText>
                <MemberRoleText variant="small">
                    {isPowerLevelGreaterOrEqual(
                        member.powerLevel,
                        MatrixPowerLevel.Admin,
                    )
                        ? t('words.admin')
                        : isPowerLevelGreaterOrEqual(
                                member.powerLevel,
                                MatrixPowerLevel.Moderator,
                            )
                          ? t('words.moderator')
                          : t('words.member')}
                </MemberRoleText>
            </>
        )
    }

    const getRoleDisabled = (
        member: MatrixRoomMember,
        powerLevel: MatrixPowerLevel,
    ) => {
        if (!myUserId || !myPowerLevel) return true
        // Cannot change your own role
        if (member.id === myUserId) return true

        // Cannot assign a role higher than your role
        if (!isPowerLevelGreaterOrEqual(myPowerLevel, powerLevel)) return true
        // Cannot lower the role of a member with the same or greater role
        if (isPowerLevelGreaterOrEqual(member.powerLevel, myPowerLevel))
            return true
        return false
    }

    const roles: { label: string; powerLevel: number; icon: SvgIconName }[] = [
        {
            label: t('words.member'),
            powerLevel: MatrixPowerLevel.Member,
            icon: 'User',
        },
        {
            label: t('words.moderator'),
            powerLevel: MatrixPowerLevel.Moderator,
            icon: 'ChatModerator',
        },
        {
            label: t('words.admin'),
            powerLevel: MatrixPowerLevel.Admin,
            icon: 'ChatAdmin',
        },
    ]

    const membersList = (
        <Container>
            {members.map(member => {
                const menu = (
                    <>
                        <DropdownSheetMenuLabel>
                            {t('words.actions')}
                        </DropdownSheetMenuLabel>
                        <DropdownSheetMenuItem
                            as={Link}
                            href={`/chat/user/${member.id}`}>
                            <Icon icon="Chat" />
                            <Text weight="bold">
                                {t('feature.chat.go-to-direct-chat')}
                            </Text>
                        </DropdownSheetMenuItem>
                        {myPowerLevel &&
                            isPowerLevelGreaterOrEqual(
                                myPowerLevel,
                                MatrixPowerLevel.Moderator,
                            ) && (
                                <>
                                    <DropdownSheetMenuLabel>
                                        {t('feature.chat.change-role')}
                                    </DropdownSheetMenuLabel>
                                    {roles.map(role => (
                                        <DropdownSheetMenuItem
                                            key={role.powerLevel}
                                            onSelect={() =>
                                                handleChangePowerLevel(
                                                    member.id,
                                                    role.powerLevel,
                                                )
                                            }
                                            disabled={getRoleDisabled(
                                                member,
                                                role.powerLevel,
                                            )}
                                            active={
                                                member.powerLevel.type ===
                                                    'int' &&
                                                role.powerLevel ===
                                                    member.powerLevel.value
                                            }>
                                            <Icon
                                                icon={
                                                    member.powerLevel.type ===
                                                        'int' &&
                                                    role.powerLevel ===
                                                        member.powerLevel.value
                                                        ? 'Check'
                                                        : role.icon
                                                }
                                            />
                                            <Text weight="bold">
                                                {role.label}
                                            </Text>
                                        </DropdownSheetMenuItem>
                                    ))}
                                </>
                            )}
                    </>
                )
                return (
                    <DropdownSheet
                        key={member.id}
                        menu={menu}
                        align="end"
                        disabled={member.id === myUserId}>
                        <Member key={member.id} button={member.id !== myUserId}>
                            {renderMemberContent(member)}
                        </Member>
                    </DropdownSheet>
                )
            })}
            {!members.length && (
                <EmptyState>
                    {t('feature.chat.no-one-is-in-this-group')}
                </EmptyState>
            )}
        </Container>
    )

    const pendingList = (
        <Container>
            {pendingMembers.length === 0 ? (
                <EmptyState>{t('feature.chat.no-knock-requests')}</EmptyState>
            ) : (
                pendingMembers.map(member => (
                    <ChatPendingRequestTile
                        key={member.id}
                        member={member}
                        onClick={setSelectedPendingUserId}
                    />
                ))
            )}
        </Container>
    )

    if (!canRespond) return membersList

    return (
        <Column gap="md" grow basis={false}>
            <Switcher<MembersTab>
                selected={tab}
                onChange={setActiveTab}
                options={[
                    { label: t('words.members'), value: 'members' },
                    {
                        label: pendingCount
                            ? `${t('words.pending')} (${pendingCount})`
                            : t('words.pending'),
                        value: 'pending',
                    },
                ]}
            />
            {tab === 'pending' ? pendingList : membersList}
            <ChatKnockRequestActionsDialog
                member={selectedPendingMember}
                isProcessing={processingUserId === selectedPendingUserId}
                onAccept={async userId => {
                    await accept(userId)
                    setSelectedPendingUserId(null)
                }}
                onDecline={async userId => {
                    await decline(userId)
                    setSelectedPendingUserId(null)
                }}
                onClose={() => setSelectedPendingUserId(null)}
            />
        </Column>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 280,
    overflowY: 'auto',
    margin: '0 -8px -12px',

    '@sm': {
        flex: 1,
        maxHeight: 'none',
        height: 'auto',
    },
})

const Member = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 12,

    variants: {
        button: {
            true: {
                '&:hover, &:focus, &[data-state="open"]': {
                    background: theme.colors.primary05,
                    cursor: 'pointer',
                },
            },
        },
    },
})

const MemberRoleText = styled(Text, {
    color: theme.colors.grey,
    marginLeft: 'auto',
})

const MemberSuffixText = styled(Text, {
    color: theme.colors.grey,
})
