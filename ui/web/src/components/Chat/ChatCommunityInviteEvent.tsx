import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCommunityInviteCode } from '@fedi/common/hooks/federation'
import { useCommonSelector } from '@fedi/common/hooks/redux'
import { useToast } from '@fedi/common/hooks/toast'
import { selectCommunityIds } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { useCopy } from '../../hooks'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { FederationAvatar } from '../FederationAvatar'
import { Column, Row } from '../Flex'
import { JoinCommunityDialog } from '../JoinCommunityDialog'
import { Text } from '../Text'

interface Props {
    event: MatrixEvent<'xyz.fedi.communityInvite'>
    isMe?: boolean
}

export const ChatCommunityInviteEvent: React.FC<Props> = ({ event, isMe }) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { copy } = useCopy()

    const [isShowing, setIsShowing] = useState(false)

    const inviteCode = event.content.body
    const { preview, isFetching, isJoining, handleJoin } =
        useCommunityInviteCode(inviteCode)

    // Memoized selector that only returns boolean for this specific community
    // This prevents re-renders when other communities change
    const selectIsMember = useCallback(
        (state: Parameters<typeof selectCommunityIds>[0]) =>
            preview ? selectCommunityIds(state).includes(preview.id) : false,
        [preview],
    )
    const isMemberFromRedux = useCommonSelector(selectIsMember)

    const handleCopy = () => {
        copy(inviteCode).then(() => {
            toast.show({
                content: t('phrases.copied-to-clipboard'),
                status: 'success',
            })
        })
    }

    const handleOpenDialog = () => {
        setIsShowing(true)
    }

    const handleJoinCommunity = async () => {
        await handleJoin()
        setIsShowing(false)
    }

    // Fallback UI while loading or if there's no preview
    if (isFetching || !preview) {
        return (
            <Wrapper>
                <Title variant="caption" weight="bold">
                    {t('feature.communities.community-invite')}
                </Title>
                <InviteCode variant="small" weight="normal">
                    {inviteCode}
                </InviteCode>
                <ButtonRow>
                    <Button variant="secondary" size="xs" onClick={handleCopy}>
                        {t('phrases.copy-invite-code')}
                    </Button>
                </ButtonRow>
            </Wrapper>
        )
    }

    // Rich preview UI
    return (
        <>
            <Wrapper>
                <Column gap="sm">
                    <InviteLabel>
                        <Text variant="small" weight="bold">
                            {t('feature.communities.community-invite')}:
                        </Text>
                        <TruncatedCode title={inviteCode} isMe={isMe}>
                            {inviteCode}
                        </TruncatedCode>
                    </InviteLabel>
                    <NameRow align="center" gap="sm">
                        <FederationAvatar
                            federation={{
                                id: preview.id,
                                name: preview.name,
                                meta: preview.meta,
                            }}
                            size="sm"
                        />
                        <NameText variant="caption" weight="medium">
                            {preview.name}
                        </NameText>
                    </NameRow>
                    {isMemberFromRedux && (
                        <MemberText variant="small" isMe={isMe}>
                            {t('phrases.you-are-a-member', {
                                federationName: preview.name,
                            })}
                        </MemberText>
                    )}
                    <ButtonRow>
                        <Button
                            variant="secondary"
                            size="xs"
                            onClick={handleOpenDialog}
                            disabled={isMemberFromRedux}>
                            {isMemberFromRedux
                                ? t('words.joined')
                                : t('words.join')}
                        </Button>
                        <Button
                            variant="secondary"
                            size="xs"
                            onClick={handleCopy}>
                            {t('phrases.copy-invite-code')}
                        </Button>
                    </ButtonRow>
                </Column>
            </Wrapper>
            <JoinCommunityDialog
                open={isShowing}
                onOpenChange={setIsShowing}
                preview={preview}
                isJoining={isJoining}
                onJoin={handleJoinCommunity}
            />
        </>
    )
}

const Wrapper = styled('div', {})

const Title = styled(Text, {})

const InviteCode = styled(Text, {
    marginTop: theme.spacing.xs,
})

const InviteLabel = styled(Column, {
    gap: theme.spacing.xs,
})

const TruncatedCode = styled('span', {
    fontSize: theme.fontSizes.small,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: 0,
    minWidth: '100%',
    variants: {
        isMe: {
            true: {
                color: theme.colors.white,
            },
            false: {
                color: theme.colors.darkGrey,
            },
        },
    },
    defaultVariants: {
        isMe: false,
    },
})

const MemberText = styled(Text, {
    variants: {
        isMe: {
            true: {
                color: theme.colors.white,
            },
            false: {
                color: theme.colors.darkGrey,
            },
        },
    },
    defaultVariants: {
        isMe: false,
    },
})

const NameRow = styled(Row, {
    overflow: 'hidden',
    width: 0,
    minWidth: '100%',
})

const NameText = styled(Text, {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
})

const ButtonRow = styled('div', {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
})
