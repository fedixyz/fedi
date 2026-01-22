import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useFederationInviteCode } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { MatrixEvent } from '@fedi/common/types'

import { Button } from '../../components/Button'
import { onboardingJoinRoute } from '../../constants/routes'
import { useCopy } from '../../hooks'
import { styled, theme } from '../../styles'
import { FederationAvatar } from '../FederationAvatar'
import { Column, Row } from '../Flex'
import { Text } from '../Text'

interface Props {
    event: MatrixEvent<'xyz.fedi.federationInvite'>
    isMe?: boolean
}

export const ChatFederationInviteEvent: React.FC<Props> = ({ event, isMe }) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { copy } = useCopy()
    const router = useRouter()

    const inviteCode = event.content.body
    const { previewResult, isChecking, isError } = useFederationInviteCode(
        t,
        inviteCode,
    )

    const handleOnCopy = () => {
        copy(inviteCode)
        toast.show({
            content: t('phrases.copied-to-clipboard'),
            status: 'success',
        })
    }

    const handleJoin = () => {
        router.push(onboardingJoinRoute(encodeURIComponent(inviteCode)))
    }

    // Fallback to simple display while loading or on error
    if (isError || isChecking || !previewResult) {
        return (
            <Wrapper>
                <Title variant="caption" weight="bold">
                    {t('feature.chat.federation-invite')}
                </Title>
                <InviteCode variant="small" weight="normal">
                    {inviteCode}
                </InviteCode>
                <ButtonRow>
                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={handleOnCopy}>
                        {t('phrases.copy-invite-code')}
                    </Button>
                </ButtonRow>
            </Wrapper>
        )
    }

    const { preview, isMember } = previewResult

    return (
        <Wrapper>
            <Column gap="md">
                <InviteLabel>
                    <Text variant="small" weight="bold">
                        {t('feature.federations.federation-invite')}:
                    </Text>
                    <TruncatedCode title={inviteCode} isMe={isMe}>
                        {inviteCode.slice(0, 30)}...
                    </TruncatedCode>
                </InviteLabel>
                <FederationRow align="center" gap="sm">
                    <FederationAvatar
                        federation={{
                            id: preview.id,
                            name: preview.name,
                            meta: preview.meta,
                        }}
                        size="sm"
                    />
                    <Text variant="body" weight="medium">
                        {preview.name}
                    </Text>
                </FederationRow>
                {isMember && (
                    <MemberText variant="small" isMe={isMe}>
                        {t('phrases.you-are-a-member', {
                            federationName: preview.name,
                        })}
                    </MemberText>
                )}
                <ButtonRow wrap gap="sm">
                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={handleJoin}
                        disabled={isMember}>
                        {isMember ? t('words.joined') : t('words.join')}
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={handleOnCopy}>
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

const FederationRow = styled(Row, {})

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
    marginTop: theme.spacing.sm,
})
