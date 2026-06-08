import { Text, useTheme } from '@rneui/themed'
import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Image } from 'react-native'
import { RejectionError } from 'webln'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useClaimEcash, useParseEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    selectReceiveEcashRequest,
    setReceiveEcashRequest,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import {
    getFederationIconUrl,
    getFederationTosUrl,
    getFederationWelcomeMessage,
} from '@fedi/common/utils/FederationUtils'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'

interface Props {
    onAccept: (res: { msats: MSats }) => void
    onReject: (err: Error) => void
}

/**
 * <ReceiveEcashClaim> is mounted only while a token is pending and keyed by it.
 * The remount is load-bearing: useParseEcash/useClaimEcash don't reset their
 * state, so a permanently-mounted version would leak the previous request's
 * `claimed` into the next and resolve it without actually claiming.
 */
export const ReceiveEcashOverlay: React.FC<Props> = ({
    onAccept,
    onReject,
}) => {
    const ecash = useAppSelector(selectReceiveEcashRequest)

    if (!ecash) return null

    return (
        <ReceiveEcashClaim
            key={ecash}
            ecash={ecash}
            onAccept={onAccept}
            onReject={onReject}
        />
    )
}

const ReceiveEcashClaim: React.FC<Props & { ecash: string }> = ({
    ecash,
    onAccept,
    onReject,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const toast = useToast()

    const {
        parseEcash,
        loading: parsing,
        parsed,
        ecashToken,
        federation,
        isError: parseError,
        newMembersDisabled,
    } = useParseEcash()

    const {
        claimEcash,
        loading: claiming,
        claimed,
        error: claimError,
    } = useClaimEcash()

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId: federation?.id,
    })

    const onAcceptRef = useUpdatingRef(onAccept)
    const onRejectRef = useUpdatingRef(onReject)

    // Settle the miniapp's promise exactly once (don't let a late error fire
    // after a success has resolved, or vice versa).
    const resolvedRef = useRef(false)

    useEffect(() => {
        parseEcash(ecash)
    }, [ecash, parseEcash])

    const finish = (cb: () => void) => {
        if (resolvedRef.current) return
        resolvedRef.current = true
        cb()
        dispatch(setReceiveEcashRequest(null))
    }

    // Auto-claim when already joined; otherwise leave it to the user to
    // approve below. Reject tokens we can't claim (unparseable, or from an
    // unjoined federation with no embedded invite to join through).
    useEffect(() => {
        if (parsing) return
        if (!parsed) {
            if (parseError) {
                finish(() =>
                    onRejectRef.current(
                        new Error(t('feature.ecash.could-not-parse-token')),
                    ),
                )
            }
            return
        }

        if (
            parsed.federation_type === 'notJoined' &&
            !parsed.federation_invite
        ) {
            finish(() =>
                onRejectRef.current(
                    new Error(t('feature.ecash.unknown-federation-no-invite')),
                ),
            )
            return
        }

        if (parsed.federation_type === 'joined' && !claiming && !claimed) {
            claimEcash(parsed, ecashToken)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parsing, parsed, parseError, ecashToken])

    useEffect(() => {
        if (!claimed || !parsed) return
        const { formattedPrimaryAmount } = makeFormattedAmountsFromMSats(
            parsed.amount,
        )
        finish(() => {
            toast.show({
                content: t('feature.ecash.received-amount', {
                    amount: formattedPrimaryAmount,
                }),
                status: 'success',
            })
            onAcceptRef.current({ msats: parsed.amount })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claimed, parsed])

    // Surface the real bridge message on failure.
    useEffect(() => {
        if (!claimError) return
        finish(() =>
            onRejectRef.current(
                new Error(
                    claimError.message || t('feature.ecash.claim-ecash-error'),
                ),
            ),
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claimError])

    const handleReject = () => {
        finish(() =>
            onRejectRef.current(
                new RejectionError(t('feature.ecash.claim-cancelled')),
            ),
        )
    }

    if (parsing || claiming || !parsed) {
        return (
            <CustomOverlay
                show
                contents={{
                    body: (
                        <Column
                            align="center"
                            gap="md"
                            style={{ paddingVertical: theme.spacing.xl }}>
                            <ActivityIndicator />
                            <Text>
                                {claiming
                                    ? t('feature.ecash.claiming-ecash')
                                    : t('feature.ecash.reading-ecash')}
                            </Text>
                        </Column>
                    ),
                }}
            />
        )
    }

    // Joined federation — the auto-claim above is in flight; nothing to show.
    if (parsed.federation_type === 'joined') return null

    if (newMembersDisabled) {
        return (
            <CustomOverlay
                show
                onBackdropPress={handleReject}
                contents={{
                    title: federation?.name ?? t('words.federation'),
                    body: (
                        <Column
                            align="center"
                            gap="md"
                            style={{ paddingTop: theme.spacing.md }}>
                            <Text caption center>
                                {t(
                                    'feature.ecash.receive-new-members-disabled',
                                )}
                            </Text>
                        </Column>
                    ),
                    buttons: [
                        {
                            text: t('words.cancel'),
                            onPress: handleReject,
                        },
                    ],
                }}
            />
        )
    }

    const iconUrl = federation?.meta
        ? getFederationIconUrl(federation.meta)
        : null
    const welcomeMessage = federation?.meta
        ? getFederationWelcomeMessage(federation.meta)
        : null
    const tosUrl = federation?.meta
        ? getFederationTosUrl(federation.meta)
        : null

    return (
        <CustomOverlay
            show
            onBackdropPress={handleReject}
            contents={{
                title: federation?.name ?? t('feature.ecash.join-federation'),
                body: (
                    <Column
                        align="center"
                        gap="md"
                        style={{ paddingTop: theme.spacing.md }}>
                        {iconUrl ? (
                            <Image
                                source={{ uri: iconUrl }}
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 32,
                                }}
                            />
                        ) : null}
                        <Text caption center>
                            {t('feature.ecash.not-joined-description')}
                        </Text>
                        {welcomeMessage ? (
                            <Text caption center>
                                {welcomeMessage}
                            </Text>
                        ) : null}
                        {tosUrl ? (
                            <Text small center>
                                {t('feature.ecash.join-terms', {
                                    tos_url: tosUrl,
                                })}
                            </Text>
                        ) : null}
                    </Column>
                ),
                buttons: [
                    {
                        text: t('words.cancel'),
                        onPress: handleReject,
                    },
                    {
                        primary: true,
                        text: t('feature.ecash.join-and-claim'),
                        onPress: () => claimEcash(parsed, ecashToken),
                    },
                ],
            }}
        />
    )
}

export default ReceiveEcashOverlay
