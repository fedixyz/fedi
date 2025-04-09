import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMatrixUserSearch } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    inviteUserToMatrixRoom,
    selectMatrixRoomMemberMap,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { CircularLoader } from '../CircularLoader'
import { EmptyState } from '../EmptyState'
import { Input } from '../Input'
import { ShadowScroller } from '../ShadowScroller'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

interface Props {
    roomId: MatrixRoom['id']
}

export const ChatRoomInviteUser: React.FC<Props> = ({ roomId }) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { error } = useToast()
    const { query, setQuery, searchedUsers, isSearching, searchError } =
        useMatrixUserSearch()
    const [invitingUsers, setInvitingUsers] = useState<string[]>([])
    const memberMap = useAppSelector(s => selectMatrixRoomMemberMap(s, roomId))

    const inviteUser = async (userId: string) => {
        setInvitingUsers(users => [...users, userId])
        try {
            await dispatch(inviteUserToMatrixRoom({ roomId, userId })).unwrap()
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
        setInvitingUsers(users => users.filter(id => id !== userId))
    }

    let searchContent: React.ReactNode
    if (!query) {
        searchContent = (
            <EmptyContainer>
                <Text>{t('feature.chat.enter-a-username')}</Text>
            </EmptyContainer>
        )
    } else if (isSearching) {
        searchContent = (
            <LoaderContainer>
                <CircularLoader />
            </LoaderContainer>
        )
    } else if (searchError) {
        searchContent = (
            <Text>
                {formatErrorMessage(t, searchError, 'errors.chat-unavailable')}
            </Text>
        )
    } else if (searchedUsers.length) {
        searchContent = searchedUsers.map(user => {
            const member = memberMap[user.id]
            const disabled =
                member?.membership === 'join' || member?.membership === 'invite'
            const inviteText =
                member?.membership === 'invite'
                    ? t('words.invited')
                    : member?.membership === 'join'
                      ? t('words.joined')
                      : t('words.invite')
            const suffix = user?.id ? getUserSuffix(user.id) : ''
            return (
                <SearchButton
                    key={user.id}
                    disabled={disabled}
                    onClick={() => !disabled && inviteUser(user.id)}>
                    <ChatAvatar user={user} size="md" />
                    <Text
                        variant="caption"
                        weight="bold"
                        css={{ flexShrink: 1 }}>
                        {user.displayName}
                    </Text>
                    <MemberSuffixText variant="caption">
                        {suffix}
                    </MemberSuffixText>
                    <RightIcons>
                        {invitingUsers.includes(user.id) ? (
                            <CircularLoader size={24} />
                        ) : (
                            <InviteText disabled={disabled}>
                                {inviteText}
                            </InviteText>
                        )}
                    </RightIcons>
                </SearchButton>
            )
        })
    } else {
        searchContent = (
            <EmptyContainer>
                <Text>{t('feature.omni.search-no-results', { query })}</Text>
            </EmptyContainer>
        )
    }

    return (
        <Container>
            <SearchHeader>
                <Input
                    placeholder={t('feature.chat.enter-a-username')}
                    value={query}
                    onChange={ev => setQuery(ev.currentTarget.value)}
                />
            </SearchHeader>
            <ShadowScroller>
                <SearchResults>{searchContent}</SearchResults>
            </ShadowScroller>
        </Container>
    )
}

const minHeight = 200

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
})

const SearchHeader = styled('div', {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 0 12px',
})

const SearchResults = styled('div', {
    height: '100%',
    overflow: 'auto',
    minHeight,
})

const SearchButton = styled('button', {
    display: 'flex',
    width: '100%',
    minHeight: 48,
    gap: 12,
    padding: '8px 16px',
    alignItems: 'center',
    textAlign: 'left',
    borderRadius: 8,

    variants: {
        disabled: {
            true: {
                background: 'none',
            },
            false: {
                '&:hover, &:focus': {
                    background: theme.colors.extraLightGrey,
                    outline: 'none',
                },
            },
        },
    },
})

const InviteText = styled('div', {
    color: theme.colors.blue,
    fontSize: theme.fontSizes.small,

    variants: {
        disabled: {
            true: {
                color: theme.colors.grey,
            },
        },
    },
})

const LoaderContainer = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
})

const EmptyContainer = styled(EmptyState, {
    minHeight,
})

const MemberSuffixText = styled(Text, {
    color: theme.colors.grey,
})

const RightIcons = styled('div', {
    marginLeft: 'auto',
})
