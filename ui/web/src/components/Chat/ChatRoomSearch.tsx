import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { SEARCH_PAGINATION_SIZE } from '@fedi/common/constants/matrix'
import { theme } from '@fedi/common/constants/theme'
import { useChatTimelineSearch } from '@fedi/common/hooks/matrix'
import { MatrixRoom, SendableMatrixEvent } from '@fedi/common/types'

import { styled } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Input } from '../Input'
import * as Layout from '../Layout'
import { Text } from '../Text'
import { ChatMessageTile } from './ChatMessageTile'

interface Props {
    room: MatrixRoom
}

export const ChatRoomSearch: React.FC<Props> = ({ room }) => {
    const { t } = useTranslation()

    const {
        query,
        setQuery,
        clearSearch,
        searchResults,
        canPaginateFurther,
        handlePaginate,
        isSearching,
        memberLookup,
    } = useChatTimelineSearch(room.id)

    const handleLoadMore = useCallback(() => {
        if (canPaginateFurther && !isSearching) {
            handlePaginate(SEARCH_PAGINATION_SIZE)
        }
    }, [canPaginateFurther, isSearching, handlePaginate])

    return (
        <ChatWrapper>
            <HeaderWrapper back>
                <InputRow>
                    <SearchInput
                        value={query}
                        onChange={ev => setQuery(ev.currentTarget.value)}
                        placeholder={`${t('phrases.search-messages')}...`}
                        leftAdornment={
                            <IconContainer style={{ paddingLeft: '12px' }}>
                                <Icon icon="Search" size={20} />
                            </IconContainer>
                        }
                        rightAdornment={
                            query.length > 0 && (
                                <IconContainer
                                    style={{ paddingRight: '12px' }}
                                    onClick={clearSearch}>
                                    <Icon icon="Close" size={24} />
                                </IconContainer>
                            )
                        }
                    />
                </InputRow>
            </HeaderWrapper>

            <ResultsContainer>
                {isSearching && searchResults.length === 0 ? (
                    <LoadingState>
                        <Text
                            css={{
                                color: theme.colors.grey,
                                textAlign: 'center',
                            }}>
                            {`${t('words.searching')}...`}
                        </Text>
                    </LoadingState>
                ) : query && searchResults.length === 0 ? (
                    <EmptyState>
                        <Icon
                            icon="SearchNoResult"
                            size={64}
                            color={theme.colors.primary}
                        />
                        <Text
                            weight="bold"
                            css={{
                                color: theme.colors.grey,
                                textAlign: 'center',
                            }}>
                            {t('phrases.no-result')}
                        </Text>
                    </EmptyState>
                ) : (
                    <>
                        <MessageList>
                            {searchResults.map(event => (
                                <ChatMessageTile
                                    key={event.id}
                                    event={event as SendableMatrixEvent}
                                    room={room}
                                    senderDisplayName={
                                        memberLookup[event.sender]
                                    }
                                    searchQuery={query}
                                />
                            ))}
                        </MessageList>
                        {query && canPaginateFurther && (
                            <LoadMoreContainer>
                                <Button
                                    variant="secondary"
                                    disabled={isSearching}
                                    onClick={handleLoadMore}
                                    css={{
                                        opacity: isSearching ? 0.6 : 1,
                                        width: '100%',
                                    }}>
                                    <Text css={{ color: theme.colors.primary }}>
                                        {isSearching
                                            ? t('words.loading')
                                            : t('phrases.load-more')}
                                    </Text>
                                </Button>
                            </LoadMoreContainer>
                        )}
                    </>
                )}
            </ResultsContainer>
        </ChatWrapper>
    )
}

const ChatWrapper = styled('div', {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
})

const HeaderWrapper = styled(Layout.Header, {})

const InputRow = styled('div', {
    flex: 1,
    flexDirection: 'row',
    display: 'flex',
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

const ResultsContainer = styled('div', {
    flex: 1,
    overflow: 'auto',
})

const MessageList = styled('div', {
    display: 'flex',
    flexDirection: 'column',
})

const EmptyState = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    height: '100%',
    padding: `0 ${theme.spacing.xl}px`,
})

const LoadingState = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '80%',
    padding: `0 ${theme.spacing.xl}px`,
})

const LoadMoreContainer = styled('div', {
    padding: theme.spacing.lg,
})
