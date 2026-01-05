import { useNavigation } from '@react-navigation/native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectAreAllFederationsRecovering,
    selectLoadedFederations,
    selectShouldShowStablePaymentAddress,
} from '@fedi/common/redux'
import { lnurlAuth } from '@fedi/common/utils/lnurl'
import {
    BLOCKED_PARSER_TYPES_BEFORE_FEDERATION,
    BLOCKED_PARSER_TYPES_DURING_RECOVERY,
} from '@fedi/common/utils/parser'

import { useAppSelector } from '../../../state/hooks'
import { resetToWallets } from '../../../state/navigation'
import {
    AnyParsedData,
    ParsedStabilityAddress,
    ParserDataType,
} from '../../../types'
import { NavigationArgs, NavigationHook } from '../../../types/navigation'
import CustomOverlay, { CustomOverlayContents } from '../../ui/CustomOverlay'
import RecoveryInProgress from '../recovery/RecoveryInProgress'
import OmniSendStability from './OmniSendStability'

interface Props<T extends AnyParsedData> {
    parsedData: T
    goBackText?: string
    onGoBack: () => void
    onSuccess: (parsedData: T) => void
}

export const OmniConfirmation = <T extends AnyParsedData>({
    parsedData,
    goBackText: propsGoBackText,
    onGoBack,
    onSuccess,
}: Props<T>) => {
    const { t } = useTranslation()
    const toast = useToast()
    const fedimint = useFedimint()
    const navigation = useNavigation()
    const [isLoading, setIsLoading] = useState(false)
    const walletFederations = useAppSelector(selectLoadedFederations)
    const areAllFederationsRecovering = useAppSelector(
        selectAreAllFederationsRecovering,
    )
    const shouldShowStablePaymentAddress = useAppSelector(state => {
        if (parsedData.type !== ParserDataType.StabilityAddress) return false
        return selectShouldShowStablePaymentAddress(
            state,
            parsedData.data.federation.type === 'joined'
                ? parsedData.data.federation.federationId
                : undefined,
        )
    })

    // OmniConfirmation can be rendered ourside of StackNavigator, so `replace`
    // is not always available, so fall back to navigate. Cast as NavigationHook
    // at assignment to avoid the no `replace` case being typed as `never`.
    const navigate =
        'replace' in navigation
            ? (navigation as NavigationHook).replace
            : (navigation as NavigationHook).navigate
    const handleNavigate = (...params: NavigationArgs) => {
        navigate(...params)
        onSuccess(parsedData)
    }

    const handleAuth = () => {
        if (parsedData.type !== ParserDataType.LnurlAuth) return
        setIsLoading(true)
        lnurlAuth(fedimint, parsedData.data)
            .match(
                () => onSuccess(parsedData),
                e => toast.error(t, e),
            )
            .finally(() => setIsLoading(false))
    }

    const handleContinueStabilityAddress = ({
        data,
    }: ParsedStabilityAddress) => {
        const federationData = data.federation
        // If you haven't joined the federation
        // AND if it does include an invite code, don't show any buttons
        if (
            federationData.type === 'notJoined' &&
            federationData.federationInvite
        )
            return null

        // Otherwise if you haven't joined and it DOESN'T include an invite code
        // Show the "Go Back" button
        if (federationData.type === 'notJoined') return undefined

        return () =>
            handleNavigate('StabilityTransfer', {
                recipient: {
                    accountId: data.accountId,
                    address: data.address,
                },
                federationId: federationData.federationId,
            })
    }

    const {
        contents,
        continueText = t('words.continue'),
        continueOnPress,
    } = ((): {
        contents: CustomOverlayContents
        continueText?: string
        // undefined = show back button only
        // null = show no buttons
        // otherwise, show back button and continue button with continueOnPress action
        continueOnPress?: (() => void) | null
    } => {
        // If they're not yet a member of a federation, they can only scan certain codes.
        if (
            BLOCKED_PARSER_TYPES_BEFORE_FEDERATION.includes(parsedData.type) &&
            walletFederations.length === 0
        ) {
            return {
                contents: {
                    icon: 'ScanSad',
                    title: t('feature.omni.unsupported-no-federation'),
                },
            }
        }
        // If recovery has not completed, payment-related codes cannot be scanned.
        if (
            areAllFederationsRecovering &&
            BLOCKED_PARSER_TYPES_DURING_RECOVERY.includes(parsedData.type)
        ) {
            return {
                contents: {
                    title: '',
                    body: (
                        <RecoveryInProgress
                            label={t(
                                'feature.recovery.recovery-in-progress-payments',
                            )}
                        />
                    ),
                },
            }
        }

        switch (parsedData.type) {
            case ParserDataType.OfflineError:
                return {
                    contents: {
                        icon: 'Warning',
                        title: parsedData.data.title,
                    },
                }
            case ParserDataType.Bolt11:
            case ParserDataType.LnurlPay:
                return {
                    contents: {
                        icon: 'Bolt',
                        title: t('feature.omni.confirm-lightning-pay'),
                    },
                    continueOnPress: () =>
                        handleNavigate('ConfirmSendLightning', { parsedData }),
                }
            case ParserDataType.LnurlWithdraw:
                return {
                    contents: {
                        icon: 'Bolt',
                        title: t('feature.omni.confirm-lightning-withdraw'),
                    },
                    continueOnPress: () =>
                        handleNavigate('RedeemLnurlWithdraw', { parsedData }),
                }
            case ParserDataType.FedimintInvite:
                return {
                    contents: {
                        icon: 'Federation',
                        title: t('feature.omni.confirm-federation-invite'),
                    },
                    continueOnPress: () =>
                        handleNavigate('JoinFederation', {
                            invite: parsedData.data.invite,
                        }),
                }
            case ParserDataType.CommunityInvite:
                return {
                    contents: {
                        icon: 'Federation',
                        title: t('feature.omni.confirm-community-invite'),
                    },
                    continueOnPress: () =>
                        handleNavigate('JoinFederation', {
                            invite: parsedData.data.invite,
                        }),
                }
            case ParserDataType.CashuEcash:
                return {
                    contents: {
                        icon: 'Bolt',
                        title: t('feature.omni.confirm-cashu-token'),
                    },
                    continueOnPress: () => {
                        handleNavigate('ConfirmReceiveCashu', {
                            parsedData,
                        })
                    },
                }
            case ParserDataType.FedimintEcash:
                return {
                    contents: {
                        title: t('feature.omni.confirm-ecash-token'),
                        icon: 'Cash',
                    },
                    continueOnPress: () => {
                        handleNavigate('ClaimEcash', {
                            token: parsedData.data.token,
                        })
                    },
                }
            case ParserDataType.StabilityAddress:
                // don't parse if feature flag is off
                if (!shouldShowStablePaymentAddress)
                    return {
                        contents: {
                            icon: 'ScanSad',
                            title: t('feature.omni.unsupported-unknown'),
                        },
                    }

                return {
                    contents: {
                        title: t('feature.omni.confirm-send-stability'),
                        icon:
                            parsedData.data.federation.type === 'joined'
                                ? 'Usd'
                                : undefined,
                        body: (
                            <OmniSendStability
                                parsed={parsedData.data}
                                onContinue={() =>
                                    // if the user is joining the fedration after scanning a sp payment address
                                    // they likely won't have any stable balance yet so send them to
                                    // the wallets screen instead of StabilityTransfer
                                    navigation.dispatch(resetToWallets())
                                }
                            />
                        ),
                    },
                    continueOnPress: handleContinueStabilityAddress(parsedData),
                }
            case ParserDataType.LnurlAuth:
                return {
                    contents: {
                        icon: 'Bolt',
                        title: t('feature.omni.confirm-lnurl-auth', {
                            domain: parsedData.data.domain,
                        }),
                    },
                    continueText: t('words.authorize'),
                    continueOnPress: handleAuth,
                }
            case ParserDataType.FediChatUser:
                return {
                    contents: {
                        icon: 'Chat',
                        title: t('feature.omni.confirm-fedi-chat', {
                            username: parsedData.data.displayName,
                        }),
                    },
                    continueOnPress: () => {
                        handleNavigate('ChatUserConversation', {
                            userId: parsedData.data.id,
                            displayName: parsedData.data.displayName,
                        })
                    },
                }
            case ParserDataType.FediChatRoom:
                // TODO: Implement join room by link for matrix (knocking)
                // TODO: Implement navigating to room if it exists
                return {
                    contents: {
                        icon: 'Chat',
                        title: t('feature.omni.confirm-fedi-chat-group-invite'),
                    },
                    continueOnPress: () => {
                        handleNavigate('ConfirmJoinPublicGroup', {
                            groupId: parsedData.data.id,
                        })
                    },
                }
            case ParserDataType.LegacyFediChatGroup:
            case ParserDataType.LegacyFediChatMember:
                return {
                    contents: {
                        icon: 'ScanSad',
                        title: t('feature.omni.unsupported-legacy-chat'),
                    },
                }
            case ParserDataType.Website:
                return {
                    contents: {
                        icon: 'Globe',
                        url: parsedData.data.url,
                        title: t('feature.omni.confirm-website-url'),
                    },
                    continueOnPress: () => {
                        Linking.openURL(parsedData.data.url)
                        onSuccess(parsedData)
                        onGoBack()
                    },
                }
            case ParserDataType.DeepLink:
                return {
                    contents: {
                        icon: 'Globe',
                        url: parsedData.data.url,
                        title: t('feature.omni.confirm-deeplink-url'),
                    },
                    continueOnPress: () => {
                        Linking.openURL(parsedData.data.url)
                        onSuccess(parsedData)
                        onGoBack()
                    },
                }
            case ParserDataType.Bolt12:
                return {
                    contents: {
                        icon: 'ScanSad',
                        title: t('feature.omni.unsupported-bolt12'),
                    },
                }
            case ParserDataType.Bip21:
            case ParserDataType.BitcoinAddress:
                return {
                    contents: {
                        icon: 'Bitcoin',
                        title: t('feature.omni.confirm-onchain-pay'),
                    },
                    continueOnPress: () => {
                        handleNavigate('SendOnChainAmount', {
                            parsedData,
                        })
                    },
                }
        }
        return {
            contents: {
                icon: 'ScanSad',
                title:
                    parsedData.data.message ||
                    t('feature.omni.unsupported-unknown'),
            },
        }
    })()

    const goBackText = propsGoBackText || t('phrases.go-back')
    const buttons = useMemo(() => {
        if (continueOnPress === null) return []

        const b = [
            {
                text: goBackText,
                onPress: () => onGoBack(),
                primary: !continueOnPress,
            },
        ]
        if (continueOnPress) {
            b.push({
                text: continueText,
                onPress: continueOnPress,
                primary: true,
            })
        }
        return b
    }, [goBackText, onGoBack, continueText, continueOnPress])

    return (
        <CustomOverlay
            show={!!contents}
            contents={{ ...contents, buttons }}
            loading={isLoading}
            onBackdropPress={onGoBack}
        />
    )
}
