import { Text, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useFederationInviteCode } from '@fedi/common/hooks/federation'
import { useSpTransferEventContent } from '@fedi/common/hooks/spTransfer'
import { selectFederation, selectMatrixAuth } from '@fedi/common/redux'
import { MatrixEvent, UsdCents } from '@fedi/common/types'

import { useAppSelector } from '../../../../state/hooks'
import { PaymentEventButtons } from '../../chat/ChatPaymentEvent'
import JoinFederationOverlay from '../../chat/JoinFederationOverlay'
import SpTransferEventTemplate from './SpTransferEventTemplate'

type Props = {
    event: MatrixEvent<'spTransfer'>
    isWide?: boolean
}

const ChatSpTransferEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const {
        status,
        amount,
        federationId,
        inviteCode,
        handleReject,
        refreshTransferState,
    } = useSpTransferEventContent(event) ?? {}

    const federation = useAppSelector(s =>
        selectFederation(s, federationId ?? ''),
    )
    const { convertCentsToFormattedFiat } = useBtcFiatPrice(
        undefined,
        federationId ?? '',
    )
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const isMe = event.sender === matrixAuth?.userId
    const isForeignFederation = !federation && !isMe

    // Fetch federation preview when we have an invite code for a foreign federation
    const {
        previewResult,
        isChecking: isFetchingPreview,
        handleJoin,
        isJoining,
    } = useFederationInviteCode(t, inviteCode ?? '')

    const isReturningMember =
        previewResult?.preview?.returningMemberStatus?.type ===
        'returningMember'

    const [isShowingJoinOverlay, setIsShowingJoinOverlay] = useState(false)

    const handleJoinAndRefresh = async () => {
        await handleJoin()

        // This is kinda racy. We need to wait for the joinFederation
        // to complete and for the sp transfer to be updated before
        // resubscribing to the sp transfer state.
        await new Promise(resolve => setTimeout(resolve, 4000))

        await refreshTransferState?.()
        setIsShowingJoinOverlay(false)
    }

    const formattedFiat = amount
        ? convertCentsToFormattedFiat(amount as UsdCents, 'end')
        : '...'

    if (!event.content.shouldRender) {
        return null
    }

    if (status === undefined) {
        return (
            <SpTransferEventTemplate
                message={t('feature.chat.sp-transfer-preview')}
            />
        )
    }

    const getStatusIcon = (): 'check' | 'x' | 'clock' | undefined => {
        switch (status) {
            case 'complete':
                return 'check'
            case 'failed':
            case 'expired':
            case 'federationInviteDenied':
                return 'x'
            case 'federationLeft':
            case 'pending':
                return 'clock'
            default:
                return undefined
        }
    }

    const getStatusText = (): string => {
        switch (status) {
            case 'complete':
                return t('words.paid')
            case 'failed':
                return t('words.failed')
            case 'federationInviteDenied':
                return t('words.rejected')
            case 'expired':
                return t('words.expired')
            case 'federationLeft':
            case 'pending':
                return `${t('words.pending')}`
            default:
                return ''
        }
    }

    const getFederationName = (): string => {
        if (federation) return federation.name
        if (previewResult) return previewResult.preview.name
        return `${t('words.loading')}...`
    }

    const getMessage = () => {
        const i18nKey = isMe
            ? 'feature.stabilitypool.transfer-event-sent'
            : 'feature.stabilitypool.transfer-event-received'

        return (
            <Text color={theme.colors.secondary}>
                <Trans
                    t={t}
                    i18nKey={i18nKey}
                    values={{
                        amount: formattedFiat,
                        federation: getFederationName(),
                    }}
                    components={{
                        bold: <Text bold color={theme.colors.secondary} />,
                    }}
                />
            </Text>
        )
    }

    // Foreign federation: show accept/reject buttons
    if (
        isForeignFederation &&
        inviteCode &&
        (status === 'pending' || status === 'federationLeft')
    ) {
        const foreignButtons = isReturningMember
            ? [
                  {
                      label: t('phrases.rejoin-federation'),
                      handler: () => setIsShowingJoinOverlay(true),
                      disabled: isFetchingPreview,
                  },
              ]
            : [
                  {
                      label: t('words.accept'),
                      handler: () => setIsShowingJoinOverlay(true),
                      disabled: isFetchingPreview,
                  },
                  {
                      label: t('words.reject'),
                      handler: handleReject ?? (() => {}),
                      disabled: isFetchingPreview,
                  },
              ]

        return (
            <>
                <SpTransferEventTemplate
                    message={getMessage()}
                    extra={<PaymentEventButtons buttons={foreignButtons} />}
                />
                <JoinFederationOverlay
                    preview={previewResult?.preview}
                    isJoining={isJoining}
                    onJoin={handleJoinAndRefresh}
                    show={isShowingJoinOverlay}
                    onDismiss={() => setIsShowingJoinOverlay(false)}
                />
            </>
        )
    }

    // Foreign federation rejected
    if (status === 'failed' || status === 'federationInviteDenied') {
        return (
            <SpTransferEventTemplate
                message={getMessage()}
                statusIcon="x"
                statusText={t('words.rejected')}
            />
        )
    }

    // Member of federation: show existing UI
    const statusText = getStatusText()

    return (
        <SpTransferEventTemplate
            message={getMessage()}
            statusIcon={statusText ? getStatusIcon() : undefined}
            statusText={statusText || undefined}
        />
    )
}

export default ChatSpTransferEvent
