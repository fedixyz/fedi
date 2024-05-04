import Link from 'next/link'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import RoomIcon from '@fedi/common/assets/svgs/room.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import { useChatMemberSearch } from '@fedi/common/hooks/chat'
import {
    fetchChatMembers,
    selectActiveFederationId,
    selectAllChatMembers,
    selectChatConnectionOptions,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { ShadowScroller } from './ShadowScroller'
import { Text } from './Text'

interface Props {
    onClickNewGroup(): void
}

export const ChatMemberSearch: React.FC<Props> = ({ onClickNewGroup }) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const federationId = useAppSelector(selectActiveFederationId)
    const members = useAppSelector(selectAllChatMembers)
    const connectionOptions = useAppSelector(selectChatConnectionOptions)
    const { query, setQuery, searchedMembers, isExactMatch } =
        useChatMemberSearch(members)

    useEffect(() => {
        if (!federationId) return
        dispatch(fetchChatMembers({ federationId }))
    }, [dispatch, federationId])

    return (
        <Container>
            <SearchHeader>
                <SearchPrefix>{t('words.to')}:</SearchPrefix>
                <SearchInput
                    placeholder={t('feature.chat.enter-a-username')}
                    value={query}
                    onChange={ev => setQuery(ev.currentTarget.value)}
                />
            </SearchHeader>
            <ShadowScroller>
                <SearchResults>
                    <SearchButton onClick={onClickNewGroup}>
                        <Icon icon={RoomIcon} />
                        <Text weight="medium">
                            {t('feature.chat.create-or-join-a-new-group')}
                        </Text>
                    </SearchButton>
                    <div>
                        <SearchHeading>{t('words.members')}</SearchHeading>
                        {searchedMembers.map(member => (
                            <SearchButton
                                as={Link}
                                key={member.id}
                                href={`/chat/member/${member.id}`}>
                                <Avatar
                                    id={member.id}
                                    size="md"
                                    name={member.username}
                                />
                                <Text variant="caption" weight="bold">
                                    {member.username}
                                </Text>
                            </SearchButton>
                        ))}
                        {query && !isExactMatch && connectionOptions && (
                            <SearchButton
                                as={Link}
                                href={`/chat/member/${query}@${connectionOptions.domain}`}>
                                <Icon icon={SocialPeopleIcon} />
                                <Text weight="medium">
                                    {t('feature.chat.send-a-message-to', {
                                        name: query,
                                    })}
                                </Text>
                            </SearchButton>
                        )}
                    </div>
                </SearchResults>
            </ShadowScroller>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
})

const SearchHeader = styled('div', {
    display: 'flex',
    alignItems: 'center',
    padding: 24,
    borderBottom: `1px solid ${theme.colors.extraLightGrey}`,

    '@sm': {
        padding: '16px 24px',
    },
})

const SearchPrefix = styled('div', {
    color: theme.colors.darkGrey,
    fontSize: theme.fontSizes.caption,
})

const SearchInput = styled('input', {
    flex: 1,
    background: 'none',
    border: 'none',
    padding: 8,

    '&:hover, &:focus': {
        outline: 'none',
    },
})

const SearchResults = styled('div', {
    height: '100%',
    padding: '8px 0',
    overflow: 'auto',
})

const SearchHeading = styled('div', {
    padding: '16px 28px',
    fontSize: theme.fontSizes.small,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.darkGrey,
})

const SearchButton = styled('button', {
    display: 'flex',
    width: '100%',
    minHeight: 48,
    gap: 12,
    padding: '8px 24px',
    alignItems: 'center',

    '&:hover, &:focus': {
        background: theme.colors.extraLightGrey,
        outline: 'none',
    },
})
