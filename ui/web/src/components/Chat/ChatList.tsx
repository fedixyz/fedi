import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useChatsListSearch } from '@fedi/common/hooks/matrix'
import { MatrixRoom } from '@fedi/common/types'

import * as Layout from '../../components/Layout'
import { chatNewRoute, chatNewRoomRoute } from '../../constants/routes'
import { styled, theme } from '../../styles'
import { Dialog } from '../Dialog'
import { Column, Row } from '../Flex'
import { Icon, SvgIconName } from '../Icon'
import { Input } from '../Input'
import { Text } from '../Text'
import { ChatListItem } from './ChatListItem'

interface SearchHeaderProps {
    query: string
    onQueryChange: (query: string) => void
    onClearSearch: () => void
}

const SearchHeader: React.FC<SearchHeaderProps> = ({
    query,
    onQueryChange,
    onClearSearch,
}) => {
    const { t } = useTranslation()

    return (
        <SearchInputRow>
            <SearchInput
                value={query}
                onChange={ev => onQueryChange(ev.currentTarget.value)}
                placeholder={`${t('phrases.search-chats')}...`}
                leftAdornment={
                    <IconContainer style={{ paddingLeft: '12px' }}>
                        <Icon icon="Search" size={20} />
                    </IconContainer>
                }
                rightAdornment={
                    query.length > 0 && (
                        <IconContainer
                            style={{ paddingRight: '12px' }}
                            onClick={onClearSearch}>
                            <Icon icon="Close" size={24} />
                        </IconContainer>
                    )
                }
                autoFocus
            />
        </SearchInputRow>
    )
}

function ChatAddOption({
    href,
    text,
    icon,
}: {
    href: string
    icon: SvgIconName
    text: string
}) {
    return (
        <Link href={href}>
            <Row align="center" justify="between">
                <Row align="center" gap="md">
                    <OptionIcon>
                        <Icon
                            icon={icon}
                            size={24}
                            color={theme.colors.white.toString()}
                        />
                    </OptionIcon>
                    <Text weight="medium">{text}</Text>
                </Row>
                <Icon
                    icon="ChevronRight"
                    size={24}
                    color={theme.colors.grey.toString()}
                />
            </Row>
        </Link>
    )
}

interface SearchableRoomsListProps {
    isSearchMode: boolean
    query: string
    rooms: MatrixRoom[]
}

const SearchableRoomsList: React.FC<SearchableRoomsListProps> = ({
    isSearchMode,
    query,
    rooms,
}) => {
    const { t } = useTranslation()

    // render empty search state if there are no results
    if (isSearchMode && query && rooms.length === 0) {
        return (
            <EmptySearchState>
                <Icon icon="SearchNoResult" size={64} />
                <Text
                    variant="h2"
                    weight="bold"
                    css={{
                        color: theme.colors.grey,
                        textAlign: 'center',
                    }}>
                    {t('phrases.no-result')}
                </Text>
                <Text
                    css={{
                        color: theme.colors.grey,
                        textAlign: 'center',
                    }}>
                    {t('feature.chat.search-chats-list-no-results')}
                </Text>
            </EmptySearchState>
        )
    }

    return (
        <ChatsContainer>
            {isSearchMode && !query && (
                <GuidanceText variant="caption" weight="medium">
                    {t('feature.chat.search-chats-list-guidance')}
                </GuidanceText>
            )}
            {rooms.length === 0 ? (
                <EmptyMessage>{t('feature.chat.select-or-start')}</EmptyMessage>
            ) : (
                <Chats>
                    {rooms.map(room => (
                        <ErrorBoundary key={room.id} fallback={null}>
                            <ChatListItem room={room} />
                        </ErrorBoundary>
                    ))}
                </Chats>
            )}
        </ChatsContainer>
    )
}

interface ChatListProps {
    isSearchMode: boolean
}

export const ChatList: React.FC<ChatListProps> = ({ isSearchMode }) => {
    const { t } = useTranslation()
    const router = useRouter()

    const { query, setQuery, clearSearch, filteredChatsList } =
        useChatsListSearch()

    const goToSearch = () => {
        router.push('/chat/search')
    }

    // Clear search query when navigating away from search mode
    useEffect(() => {
        if (!isSearchMode && query) {
            clearSearch()
        }
    }, [isSearchMode, query, clearSearch])

    const [showOverlay, setShowOverlay] = useState(false)

    const optionsContent = useCallback(() => {
        return (
            <Column gap="lg">
                <ChatAddOption
                    href={chatNewRoomRoute}
                    text={t('feature.chat.create-a-group')}
                    icon="SocialPeople"
                />
                <ChatAddOption
                    href={chatNewRoute}
                    text={t('phrases.scan-or-paste')}
                    icon="Scan"
                />
            </Column>
        )
    }, [t])

    return (
        <>
            <Layout.Root>
                {isSearchMode ? (
                    <Layout.Header back={'/chat'}>
                        <SearchHeader
                            query={query}
                            onQueryChange={setQuery}
                            onClearSearch={clearSearch}
                        />
                    </Layout.Header>
                ) : (
                    <Layout.PageHeader
                        title={t('words.chat')}
                        onAddPress={() => setShowOverlay(true)}
                        onSearchPress={goToSearch}
                    />
                )}

                <Layout.Content fullWidth>
                    <SearchableRoomsList
                        isSearchMode={isSearchMode}
                        query={query}
                        rooms={filteredChatsList}
                    />
                </Layout.Content>
            </Layout.Root>

            <Dialog
                onOpenChange={setShowOverlay}
                open={showOverlay}
                type="tray"
                hideCloseButton>
                {optionsContent()}
            </Dialog>
        </>
    )
}

const ChatsContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
})

const Chats = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
})

const EmptyMessage = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    height: '100%',
    padding: 24,
    color: theme.colors.darkGrey,
})

const OptionIcon = styled('div', {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fediGradient: 'black',
})

const SearchInputRow = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    // left indent to make room for back button
    marginLeft: 35,
})

const IconContainer = styled('div', {
    display: 'flex',
    alignItems: 'center',
})

const SearchInput = styled(Input, {
    flex: 1,
    borderColor: theme.colors.black,
    padding: theme.spacing.sm,
})

const GuidanceText = styled(Text, {
    color: theme.colors.darkGrey,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
    margin: '8px 16px',
})

const EmptySearchState = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    height: '100%',
    padding: `0 12px`,
})
