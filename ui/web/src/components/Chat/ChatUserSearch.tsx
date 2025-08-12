import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import KeyboardIcon from '@fedi/common/assets/svgs/keyboard.svg'
import ScanIcon from '@fedi/common/assets/svgs/scan.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import { useMatrixUserSearch } from '@fedi/common/hooks/matrix'
import { selectRecentMatrixRoomMembers } from '@fedi/common/redux'
import { ParserDataType } from '@fedi/common/types'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { matrixIdToUsername } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { CircularLoader } from '../CircularLoader'
import { EmptyState } from '../EmptyState'
import { Icon, IconProps } from '../Icon'
import * as Layout from '../Layout'
import { OmniInput } from '../OmniInput'
import { ShadowScroller } from '../ShadowScroller'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

interface Props {
    action?: {
        icon: IconProps['icon']
        label: string
        onClick(): void
    }
}

export const ChatUserSearch: React.FC<Props> = ({ action }) => {
    const { t } = useTranslation()
    const recentRoomMembers = useAppSelector(selectRecentMatrixRoomMembers)
    const { query, setQuery, searchedUsers, isSearching, searchError } =
        useMatrixUserSearch()
    const { push } = useRouter()

    const [showScanner, setShowScanner] = useState(true)
    const [inputFocused, setInputFocused] = useState(false)

    const handleOnClose = () => {
        setQuery('')
        setInputFocused(false)
    }

    let searchContent: React.ReactNode
    if (!query) {
        searchContent = undefined
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
        searchContent = searchedUsers.map(user => (
            <SearchButton
                as={Link}
                key={user.id}
                href={`/chat/user/${user.id}`}>
                <ChatAvatar user={user} size="md" css={{ flexShrink: 0 }} />
                <Text variant="caption" weight="bold" ellipsize>
                    {user.displayName}
                </Text>
            </SearchButton>
        ))
    } else {
        searchContent = (
            <EmptyContainer>
                <EmptyState>
                    <Text>
                        {t('feature.omni.search-no-results', { query })}
                    </Text>
                </EmptyState>
            </EmptyContainer>
        )
    }

    return (
        <Container>
            <Header back="/chat">
                <Title subheader>{t('feature.chat.new-message')}</Title>
            </Header>
            {!showScanner && (
                <>
                    <SearchHeader>
                        {inputFocused && (
                            <CloseButton onClick={handleOnClose}>
                                <Icon icon={CloseIcon} />
                            </CloseButton>
                        )}
                        <SearchPrefix>{t('words.to')}:</SearchPrefix>
                        <SearchInput
                            placeholder={t('feature.chat.enter-a-username')}
                            value={query}
                            onChange={ev => setQuery(ev.currentTarget.value)}
                            autoComplete="off"
                            onFocus={() => setInputFocused(true)}
                        />
                    </SearchHeader>
                    <ShadowScroller>
                        <SearchResults>
                            {!query && (
                                <>
                                    {!inputFocused &&
                                        recentRoomMembers.length > 0 && (
                                            <>
                                                <SearchHeading>
                                                    {t('words.people')}
                                                </SearchHeading>
                                                <RecentUsers>
                                                    {recentRoomMembers.map(
                                                        user => (
                                                            <RecentUser
                                                                href={`/chat/room/${user.roomId}`}
                                                                key={user.id}>
                                                                <ChatAvatar
                                                                    user={user}
                                                                />
                                                                <Text
                                                                    variant="small"
                                                                    ellipsize
                                                                    weight="medium"
                                                                    css={{
                                                                        width: '100%',
                                                                        minWidth: 0,
                                                                    }}>
                                                                    {user.displayName ||
                                                                        matrixIdToUsername(
                                                                            user.id,
                                                                        )}
                                                                </Text>
                                                            </RecentUser>
                                                        ),
                                                    )}
                                                </RecentUsers>
                                            </>
                                        )}
                                    {action && (
                                        <SearchButton onClick={action.onClick}>
                                            <Icon icon={action.icon} />
                                            <Text weight="medium">
                                                {action.label}
                                            </Text>
                                        </SearchButton>
                                    )}
                                </>
                            )}
                            {searchContent && (
                                <>
                                    <SearchHeading>
                                        {t('words.people')}
                                    </SearchHeading>
                                    <div>{searchContent}</div>
                                </>
                            )}
                        </SearchResults>
                    </ShadowScroller>
                </>
            )}

            {!inputFocused && (
                <OmniWrapper>
                    <OmniInput
                        expectedInputTypes={[ParserDataType.FediChatUser]}
                        onExpectedInput={({ data }) =>
                            push(`/chat/user/${data.id}`)
                        }
                        onUnexpectedSuccess={() => null}
                        hideScanner={!showScanner}
                        customActions={[
                            showScanner
                                ? {
                                      label: t(
                                          'feature.omni.action-enter-username',
                                      ),
                                      icon: KeyboardIcon,
                                      onClick: () => setShowScanner(false),
                                  }
                                : {
                                      label: t('feature.omni.action-scan'),
                                      icon: ScanIcon,
                                      onClick: () => setShowScanner(true),
                                  },
                            'paste',
                            {
                                label: t('feature.chat.create-a-group'),
                                icon: SocialPeopleIcon,
                                onClick: () => push('/chat/new/room'),
                            },
                        ]}
                    />
                </OmniWrapper>
            )}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'scroll',
})

const Header = styled(Layout.Header, {})

const Title = styled(Layout.Title, {
    fontSize: 16,
    paddingLeft: 12,

    '@sm': {
        fontSize: 'inherit',
        paddingLeft: 0,
    },
})

const SearchHeader = styled('div', {
    display: 'flex',
    alignItems: 'center',
    padding: 10,
    position: 'relative',
    borderBottom: `1px solid ${theme.colors.extraLightGrey}`,
    borderTop: `1px solid ${theme.colors.extraLightGrey}`,

    '@sm': {
        padding: '8px 24px',
    },
})

const CloseButton = styled('div', {
    position: 'absolute',
    top: 18,
    right: 20,
})

const RecentUsers = styled('div', {
    display: 'flex',
    alignItems: 'center',
    height: 72,
    width: '100%',
    gap: 16,
    padding: '0 24px',
    marginBottom: 16,
    flexWrap: 'wrap',
    overflow: 'hidden',
})

const RecentUser = styled(Link, {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    width: 90,
    minWidth: 90,
    overflow: 'hidden',
    gap: 8,
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

const LoaderContainer = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
})

const EmptyContainer = styled('div', {
    padding: '0px 24px',
})

const OmniWrapper = styled('div', {
    padding: 20,
})
