import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ChevronRight from '@fedi/common/assets/svgs/chevron-right.svg'
import { useChatMemberSearch } from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import {
    addAdminToChatGroup,
    fetchChatGroupMembersList,
    fetchChatMember,
    selectActiveFederationId,
} from '@fedi/common/redux'
import { ChatMember } from '@fedi/common/types'
import { XmppMemberRole } from '@fedi/common/utils/XmlUtils'

import { useAppDispatch, useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Avatar } from './Avatar'
import { ChatGroupDialogState } from './ChatGroupConversation'
import { CircularLoader } from './CircularLoader'
import { Icon } from './Icon'
import { Input } from './Input'
import { Text } from './Text'

export default function ChatBroadcastAdminAdd({
    groupId,
    setDialogState,
}: {
    groupId: string
    setDialogState: (state: ChatGroupDialogState) => void
}) {
    const { t } = useTranslation()

    const toast = useToast()
    const dispatch = useAppDispatch()
    const federationId = useAppSelector(selectActiveFederationId)

    const [visitors, setVisitors] = useState<ChatMember[]>([])
    const [searchLoading, setSearchLoading] = useState(false)

    const { query, setQuery, searchedMembers } = useChatMemberSearch(visitors)

    const confirmAddAdmin = async (member: ChatMember) => {
        if (
            federationId &&
            confirm(
                t('feature.chat.confirm-add-admin-to-group', {
                    username: member.username,
                }),
            )
        ) {
            try {
                await dispatch(
                    addAdminToChatGroup({
                        federationId,
                        groupId,
                        memberId: member.id,
                    }),
                ).unwrap()
                setDialogState('broadcast-admins')
            } catch (e) {
                toast.error(t, e, t('errors.unknown-error'))
            }
        }
    }

    const selectMember = async (member: ChatMember) => {
        if (federationId) {
            try {
                await dispatch(
                    fetchChatMember({ federationId, memberId: member.id }),
                ).unwrap()
                confirmAddAdmin(member)
            } catch {
                toast.show(t('errors.chat-member-not-found'))
            }
        }
    }

    const refreshVisitorList = useCallback(async () => {
        setSearchLoading(true)
        if (federationId) {
            const groupVisitors = await dispatch(
                fetchChatGroupMembersList({
                    federationId,
                    groupId,
                    role: XmppMemberRole.visitor,
                }),
            ).unwrap()
            setVisitors(groupVisitors)
        }
        setSearchLoading(false)
    }, [federationId, dispatch, groupId])

    useEffect(() => {
        refreshVisitorList()
    }, [refreshVisitorList])

    return (
        <Container>
            <Input
                label={t('feature.onboarding.enter-username')}
                placeholder={t('words.username')}
                value={query}
                onChange={e => setQuery(e.target.value)}
            />
            <MemberContainer>
                {searchLoading ? (
                    <CircularLoader />
                ) : searchedMembers.length > 0 ? (
                    searchedMembers.map((member, i) => (
                        <MemberItem
                            key={i}
                            onClick={() => selectMember(member)}>
                            <MemberInfoWrapper>
                                <Avatar id={member.id} name={member.username} />
                                <Text weight="bold">{member.username}</Text>
                            </MemberInfoWrapper>
                            <Icon icon={ChevronRight} size="md" />
                        </MemberItem>
                    ))
                ) : (
                    <EmptyIndicatorText>
                        {query
                            ? t('feature.omni.search-no-results', {
                                  query,
                              })
                            : t('feature.chat.no-users-found')}
                    </EmptyIndicatorText>
                )}
            </MemberContainer>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.md,
})

const MemberContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.space.sm,
    maxHeight: 220,
    overflowY: 'auto',
})

const MemberItem = styled('button', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.sm,
    borderRadius: 1024,
    cursor: 'pointer',
    width: '100%',

    '&:hover': {
        backgroundColor: theme.colors.offWhite,
    },
})

const MemberInfoWrapper = styled('div', {
    display: 'flex',
    gap: theme.space.md,
    alignItems: 'center',
})

const EmptyIndicatorText = styled(Text, {
    color: theme.colors.grey,
})
