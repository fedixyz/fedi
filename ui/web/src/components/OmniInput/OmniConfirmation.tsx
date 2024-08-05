import { useRouter } from 'next/router'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import BoltIcon from '@fedi/common/assets/svgs/bolt.svg'
import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import FederationIcon from '@fedi/common/assets/svgs/federation.svg'
import GlobeIcon from '@fedi/common/assets/svgs/globe.svg'
import ScanSadIcon from '@fedi/common/assets/svgs/scan-sad.svg'
import { useMatrixChatInvites } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederationId } from '@fedi/common/redux'
import { AnyParsedData, ParserDataType } from '@fedi/common/types'
import { lnurlAuth } from '@fedi/common/utils/lnurl'
import { ALLOWED_PARSER_TYPES_BEFORE_FEDERATION } from '@fedi/common/utils/parser'

import { useRouteStateContext } from '../../context/RouteStateContext'
import { useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { keyframes, styled } from '../../styles'
import { theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Text } from '../Text'

interface Props {
    parsedData: AnyParsedData
    onGoBack: () => void
    onSuccess: (parsedData: AnyParsedData) => void
}

export const OmniConfirmation: React.FC<Props> = ({
    parsedData,
    onGoBack,
    onSuccess,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { pushWithState } = useRouteStateContext()
    const [isLoading, setIsLoading] = useState(false)
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const { joinPublicGroup } = useMatrixChatInvites(t)
    const router = useRouter()

    const handleAuth = async () => {
        if (!activeFederationId || parsedData.type !== ParserDataType.LnurlAuth)
            return
        setIsLoading(true)
        try {
            await lnurlAuth(fedimint, activeFederationId, parsedData.data)
            onSuccess(parsedData)
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
        setIsLoading(false)
    }

    const handleRedeemToken = async () => {
        if (
            !activeFederationId ||
            parsedData.type !== ParserDataType.FedimintEcash
        )
            return
        setIsLoading(true)
        try {
            await fedimint.receiveEcash(
                parsedData.data.token,
                activeFederationId,
            )
            onSuccess(parsedData)
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
        setIsLoading(false)
    }

    const handleJoinRoom = async () => {
        if (parsedData.type !== ParserDataType.FediChatRoom) return
        setIsLoading(true)
        if (parsedData.data?.id) {
            const roomId = parsedData.data.id
            joinPublicGroup(roomId)
                .then(() => {
                    router.push('/chat/room/' + roomId)
                })
                .catch(() => {
                    onGoBack()
                })
                .finally(() => {
                    setIsLoading(false)
                })
        }
    }

    const {
        icon,
        url,
        text,
        continueText = t('words.continue'),
        continueOnClick,
        continueHref,
    } = ((): {
        icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>
        url?: string
        text: React.ReactNode
        continueText?: React.ReactNode
        continueOnClick?: () => void
        continueHref?: string
    } => {
        // If they're not yet a member of a federation, they can only scan certain codes.
        if (
            !activeFederationId &&
            !ALLOWED_PARSER_TYPES_BEFORE_FEDERATION.includes(parsedData.type)
        ) {
            return {
                icon: ScanSadIcon,
                text: t('feature.omni.unsupported-no-federation'),
            }
        }

        switch (parsedData.type) {
            case ParserDataType.Bolt11:
            case ParserDataType.LnurlPay:
                return {
                    icon: BoltIcon,
                    text: t('feature.omni.confirm-lightning-pay'),
                    continueOnClick: () => pushWithState('/send', parsedData),
                }
            case ParserDataType.LnurlWithdraw:
                return {
                    icon: BoltIcon,
                    text: t('feature.omni.confirm-lightning-withdraw'),
                    continueOnClick: () =>
                        pushWithState('/request', parsedData),
                }
            case ParserDataType.FedimintInvite:
                return {
                    icon: FederationIcon,
                    text: t('feature.omni.confirm-federation-invite'),
                    continueOnClick: () =>
                        pushWithState('/onboarding/join', parsedData),
                }
            case ParserDataType.FedimintEcash:
                return {
                    icon: BoltIcon,
                    text: t('feature.omni.confirm-ecash-token'),
                    continueOnClick: handleRedeemToken,
                }
            case ParserDataType.LnurlAuth:
                return {
                    icon: BoltIcon,
                    text: t('feature.omni.confirm-lnurl-auth', {
                        domain: parsedData.data.domain,
                    }),
                    continueText: t('words.authorize'),
                    continueOnClick: handleAuth,
                }
            case ParserDataType.FediChatUser:
                return {
                    icon: ChatIcon,
                    text: t('feature.omni.confirm-fedi-chat', {
                        username: parsedData.data.displayName,
                    }),
                    continueHref: `/chat/user/${parsedData.data.id}`,
                }
            case ParserDataType.FediChatRoom:
                return {
                    icon: ChatIcon,
                    text: t('feature.omni.unsupported-chat-invite'),
                    continueOnClick: handleJoinRoom,
                }
            case ParserDataType.LegacyFediChatGroup:
            case ParserDataType.LegacyFediChatMember:
                return {
                    icon: ScanSadIcon,
                    text: t('feature.omni.unsupported-legacy-chat'),
                }
            case ParserDataType.Website:
                return {
                    icon: GlobeIcon,
                    text: t('feature.omni.confirm-website-url'),
                    url: parsedData.data.url,
                    continueHref: parsedData.data.url,
                    continueOnClick: () => onSuccess(parsedData),
                }
            case ParserDataType.Bolt12:
                return {
                    icon: ScanSadIcon,
                    text: t('feature.omni.unsupported-bolt12'),
                }
            case ParserDataType.Bip21:
            case ParserDataType.BitcoinAddress:
                return {
                    icon: ScanSadIcon,
                    text: t('feature.omni.unsupported-on-chain'),
                }
            case ParserDataType.Unknown:
                return {
                    icon: ScanSadIcon,
                    text:
                        parsedData.data.message ||
                        t('feature.omni.unsupported-unknown'),
                }
        }
        return {
            icon: ScanSadIcon,
            text: t('feature.omni.unsupported-unknown'),
        }
    })()

    const hasContinue = Boolean(continueOnClick || continueHref)

    return (
        <Container>
            <Backdrop />
            <Confirmation>
                <Icon icon={icon} size="md" />
                {url && (
                    <WebsiteLink
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer">
                        {url}
                    </WebsiteLink>
                )}
                <Text css={{ padding: '0 24px' }} weight="medium">
                    {text}
                </Text>
                <ConfirmationActions>
                    <Button
                        variant={hasContinue ? 'outline' : 'primary'}
                        disabled={isLoading}
                        onClick={() => onGoBack()}>
                        {t('phrases.go-back')}
                    </Button>
                    {hasContinue && (
                        <Button
                            variant="primary"
                            href={continueHref}
                            loading={isLoading}
                            onClick={continueOnClick}>
                            {continueText}
                        </Button>
                    )}
                </ConfirmationActions>
            </Confirmation>
        </Container>
    )
}

const Container = styled('div', {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',

    '@sm': {
        position: 'fixed',
        justifyContent: 'flex-end',
    },
})

const backdropFadeIn = keyframes({
    from: {
        opacity: 0,
    },
    to: {
        opacity: 1,
    },
})

const Backdrop = styled('div', {
    position: 'absolute',
    inset: 0,
    background: theme.colors.secondary,
    zIndex: 1,

    '@sm': {
        background: theme.colors.primary80,
        animation: `${backdropFadeIn} 300ms ease`,
    },
})

const confirmationSlideUp = keyframes({
    from: {
        transform: 'translateY(100%)',
    },
    to: {
        transform: 'translateY(0%)',
    },
})

const Confirmation = styled('div', {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    padding: 24,
    gap: 24,
    zIndex: 2,

    '@sm': {
        background: theme.colors.secondary,
        borderTopRightRadius: 16,
        borderTopLeftRadius: 16,
        animation: `${confirmationSlideUp} 200ms ease 200ms both`,
    },

    '@standalone': {
        '@sm': {
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        },
    },
})

const ConfirmationActions = styled('div', {
    width: '100%',
    display: 'flex',
    gap: 16,

    '& > *': {
        flex: 1,
    },
})

const WebsiteLink = styled('a', {
    fontSize: theme.fontSizes.body,
    fontWeight: theme.fontWeights.medium,
    wordBreak: 'break-word',
    textDecoration: 'underline',
    // Limit to 3 lines
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 5,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
})
