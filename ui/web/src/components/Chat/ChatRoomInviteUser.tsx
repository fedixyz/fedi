import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WEB_APP_URL } from '@fedi/common/constants/api'
import {
    useMatrixUserSearch,
    useRoomKnockingAdminToggle,
} from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    inviteUserToMatrixRoom,
    selectMatrixRoom,
    selectMatrixRoomMemberMap,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { CircularLoader } from '../CircularLoader'
import { EmptyState } from '../EmptyState'
import { Row } from '../Flex'
import { Input } from '../Input'
import { QRCode } from '../QRCode'
import { ShadowScroller } from '../ShadowScroller'
import { Switch } from '../Switch'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

interface Props {
    roomId: MatrixRoom['id']
}

export const ChatRoomInviteUser: React.FC<Props> = ({ roomId }) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { error, show } = useToast()
    const { query, setQuery, searchedUsers, isSearching, searchError } =
        useMatrixUserSearch()
    const [invitingUsers, setInvitingUsers] = useState<string[]>([])
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const memberMap = useAppSelector(s => selectMatrixRoomMemberMap(s, roomId))
    const {
        shouldShowAllowKnockingToggle,
        allowKnocking,
        isToggling: isTogglingAllowKnocking,
        handleAllowKnockingToggle,
    } = useRoomKnockingAdminToggle(roomId, t)

    const inviteCode = room?.inviteCode
    const universalLink = `${WEB_APP_URL}/link#screen=room&id=${encodeURIComponent(roomId)}`

    // Hide the QR when knocking is off so we don't advertise an invite link
    // that lands on the invite-only screen.
    const showInviteCode =
        !!inviteCode && !query && (!!room?.isPublic || !!room?.allowKnocking)

    const inviteUser = async (userId: string) => {
        setInvitingUsers(users => [...users, userId])
        try {
            await dispatch(
                inviteUserToMatrixRoom({ fedimint, roomId, userId }),
            ).unwrap()
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
        setInvitingUsers(users => users.filter(id => id !== userId))
    }

    const handleCopyInviteCode = async () => {
        if (!inviteCode) return
        try {
            await navigator.clipboard.writeText(inviteCode)
            show({
                content: t('feature.chat.copied-group-invite-code'),
                status: 'success',
            })
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
    }

    const handleShareInviteLink = async () => {
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share({ text: universalLink })
                return
            }
            await navigator.clipboard.writeText(universalLink)
            show({
                content: t('phrases.copied-to-clipboard'),
                status: 'success',
            })
        } catch (err) {
            // no-op when the user dismisses the share sheet
        }
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
            {shouldShowAllowKnockingToggle && (
                <ToggleRow>
                    <Text variant="caption" weight="bold">
                        {t('feature.chat.allow-join-requests')}
                    </Text>
                    <Switch
                        checked={allowKnocking}
                        disabled={isTogglingAllowKnocking}
                        onCheckedChange={handleAllowKnockingToggle}
                    />
                </ToggleRow>
            )}
            {showInviteCode ? (
                <InviteCodeSection>
                    <QRCode data={inviteCode} />
                    <Row gap="md" fullWidth>
                        <Button
                            width="full"
                            variant="secondary"
                            icon="Copy"
                            onClick={handleCopyInviteCode}>
                            {t('words.copy')}
                        </Button>
                        <Button
                            width="full"
                            variant="secondary"
                            icon="Share"
                            onClick={handleShareInviteLink}>
                            {t('words.share')}
                        </Button>
                    </Row>
                </InviteCodeSection>
            ) : (
                <ShadowScroller>
                    <SearchResults>{searchContent}</SearchResults>
                </ShadowScroller>
            )}
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

const ToggleRow = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 4px 16px',
})

const InviteCodeSection = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    minHeight,
    padding: '8px 0',
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
