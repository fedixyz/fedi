import { t } from 'i18next'
import Link from 'next/link'
import React from 'react'

import ChatAdminIcon from '@fedi/common/assets/svgs/chat-admin.svg'
import ChatModeratorIcon from '@fedi/common/assets/svgs/chat-moderator.svg'
import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import CheckIcon from '@fedi/common/assets/svgs/check.svg'
import UserIcon from '@fedi/common/assets/svgs/user.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    selectMatrixRoomMembers,
    selectMatrixRoomSelfPowerLevel,
    setMatrixRoomMemberPowerLevel,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import {
    DropdownSheet,
    DropdownSheetMenuItem,
    DropdownSheetMenuLabel,
} from '../DropdownSheet'
import { EmptyState } from '../EmptyState'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

interface Props {
    roomId: string
}

export const ChatRoomMembersList: React.FC<Props> = ({ roomId }) => {
    const dispatch = useAppDispatch()
    const myUserId = useAppSelector(selectMatrixAuth)?.userId
    const members = useAppSelector(s => selectMatrixRoomMembers(s, roomId))
    const myPowerLevel = useAppSelector(s =>
        selectMatrixRoomSelfPowerLevel(s, roomId),
    )
    const { error } = useToast()

    const handleChangePowerLevel = async (
        userId: string,
        powerLevel: MatrixPowerLevel,
    ) => {
        try {
            await dispatch(
                setMatrixRoomMemberPowerLevel({ roomId, userId, powerLevel }),
            ).unwrap()
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
    }

    const renderMemberContent = (member: (typeof members)[0]) => {
        const suffix = getUserSuffix(member.id)
        return (
            <>
                <ChatAvatar user={member} />
                <Text ellipsize css={{ flexShrink: 1 }}>
                    {member.displayName || member.id}
                </Text>
                <MemberSuffixText variant="caption">{suffix}</MemberSuffixText>
                <MemberRoleText variant="small">
                    {member.powerLevel >= MatrixPowerLevel.Admin
                        ? t('words.admin')
                        : member.powerLevel >= MatrixPowerLevel.Moderator
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
        if (!myUserId) return true
        // Cannot change your own role
        if (member.id === myUserId) return true
        // Cannot assign a role higher than your role
        if (myPowerLevel < powerLevel) return true
        // Cannot lower the role of a member with the same or greater role
        if (myPowerLevel <= member.powerLevel) return true
        return false
    }

    const roles = [
        {
            label: t('words.member'),
            powerLevel: MatrixPowerLevel.Member,
            icon: UserIcon,
        },
        {
            label: t('words.moderator'),
            powerLevel: MatrixPowerLevel.Moderator,
            icon: ChatModeratorIcon,
        },
        {
            label: t('words.admin'),
            powerLevel: MatrixPowerLevel.Admin,
            icon: ChatAdminIcon,
        },
    ]

    return (
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
                            <Icon icon={ChatIcon} />
                            <Text weight="bold">
                                {t('feature.chat.go-to-direct-chat')}
                            </Text>
                        </DropdownSheetMenuItem>
                        {myPowerLevel >= MatrixPowerLevel.Moderator && (
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
                                            role.powerLevel ===
                                            member.powerLevel
                                        }>
                                        <Icon
                                            icon={
                                                role.powerLevel ===
                                                member.powerLevel
                                                    ? CheckIcon
                                                    : role.icon
                                            }
                                        />
                                        <Text weight="bold">{role.label}</Text>
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
