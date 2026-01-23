import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useCommunityInviteCode } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { MatrixEvent } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'

import { onboardingJoinRoute } from '../../constants/routes'
import { useCopy } from '../../hooks'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { FederationAvatar } from '../FederationAvatar'
import { Column, Row } from '../Flex'
import { Text } from '../Text'

interface Props {
    event: MatrixEvent<'xyz.fedi.communityInvite'>
    isMe?: boolean
}

export const ChatCommunityInviteEvent: React.FC<Props> = ({ event, isMe }) => {
    const { t } = useTranslation()
    const toast = useToast()
    const router = useRouter()

    const inviteCode = event.content.body
    const { copy } = useCopy()

    const { joined, isFetching, preview } = useCommunityInviteCode(inviteCode)

    const handleCopy = () => {
        copy(inviteCode).then(() => {
            toast.show({
                content: t('phrases.copied-to-clipboard'),
                status: 'success',
            })
        })
    }

    const handleJoin = () => {
        router.push(onboardingJoinRoute(inviteCode))
    }

    const truncatedCode = stringUtils.truncateMiddleOfString(inviteCode, 20)

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
        <Wrapper>
            <Column gap="sm">
                <InviteLabel>
                    <Text variant="small" weight="bold">
                        {t('feature.communities.community-invite')}:
                    </Text>
                    <TruncatedCode title={inviteCode} isMe={isMe}>
                        {truncatedCode}
                    </TruncatedCode>
                </InviteLabel>
                <Row align="center" gap="sm">
                    <FederationAvatar
                        federation={{
                            id: preview.id,
                            name: preview.name,
                            meta: preview.meta,
                        }}
                        size="sm"
                    />
                    <Text variant="caption" weight="medium">
                        {preview.name}
                    </Text>
                </Row>
                {joined && (
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
                        onClick={handleJoin}
                        disabled={joined}>
                        {joined ? t('words.joined') : t('words.join')}
                    </Button>
                    <Button variant="secondary" size="xs" onClick={handleCopy}>
                        {t('phrases.copy-invite-code')}
                    </Button>
                </ButtonRow>
            </Column>
        </Wrapper>
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

const ButtonRow = styled(Row, {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
})
