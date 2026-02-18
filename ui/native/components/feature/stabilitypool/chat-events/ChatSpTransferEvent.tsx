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
        isRejected,
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

    const [isShowingJoinOverlay, setIsShowingJoinOverlay] = useState(false)

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
        if (isRejected) return 'x'
        switch (status) {
            case 'complete':
                return 'check'
            case 'failed':
                return 'x'
            case 'pending':
                return 'clock'
            default:
                return undefined
        }
    }

    const getStatusText = (): string => {
        if (isRejected) return t('words.rejected')
        switch (status) {
            case 'complete':
                return t('words.paid')
            case 'failed':
                return t('words.rejected')
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
        status === 'pending' &&
        !isRejected
    ) {
        const foreignButtons = [
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
                    onJoin={() =>
                        handleJoin().then(() => setIsShowingJoinOverlay(false))
                    }
                    show={isShowingJoinOverlay}
                    onDismiss={() => setIsShowingJoinOverlay(false)}
                />
            </>
        )
    }

    // Foreign federation rejected
    if (status === 'failed' || isRejected) {
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
