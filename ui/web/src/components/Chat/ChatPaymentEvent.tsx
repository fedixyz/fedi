import React from 'react'
import { useTranslation } from 'react-i18next'

import CheckIcon from '@fedi/common/assets/svgs/check.svg'
import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { useMatrixPaymentEvent } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { MatrixPaymentEvent } from '@fedi/common/types'

import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'
import { Button } from '../Button'
import { CircularLoader } from '../CircularLoader'
import { Icon } from '../Icon'

interface Props {
    event: MatrixPaymentEvent
}

export const ChatPaymentEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const toast = useToast()

    const { messageText, statusIcon, statusText, buttons } =
        useMatrixPaymentEvent({
            event,
            fedimint,
            t,
            onError: _ => toast.error(t, 'errors.chat-payment-failed'),
            onCopyBolt11: (bolt11: string) => {
                try {
                    navigator.clipboard.writeText(bolt11)
                    toast.show({
                        content: t('feature.receive.copied-payment-code'),
                        status: 'success',
                    })
                } catch (error) {
                    toast.error(t, error, 'errors.unknown-error')
                }
            },
        })

    let extra: React.ReactNode = null
    if (statusText || statusIcon || buttons.length > 0) {
        const icon =
            statusIcon === 'x' ? (
                <Icon size="xs" icon={CloseIcon} />
            ) : statusIcon === 'check' ? (
                <Icon size="xs" icon={CheckIcon} />
            ) : statusIcon === 'error' ? (
                <Icon size="xs" icon={ErrorIcon} />
            ) : statusIcon === 'loading' ? (
                <CircularLoader size="xs" />
            ) : null
        extra = (
            <>
                {statusText && (
                    <PaymentResult>
                        {icon}
                        <div>{statusText}</div>
                    </PaymentResult>
                )}
                {buttons.length > 0 && (
                    <PaymentButtons>
                        {buttons.map(button => (
                            <Button
                                key={button.label}
                                variant="secondary"
                                size="sm"
                                onClick={button.handler}
                                loading={button.loading}
                                disabled={button.disabled}>
                                {button.label}
                            </Button>
                        ))}
                    </PaymentButtons>
                )}
            </>
        )
    }

    if (extra) {
        return (
            <>
                <div>{messageText}</div>
                {extra}
            </>
        )
    } else {
        return <>{messageText}</>
    }
}

const PaymentResult = styled('div', {
    display: 'flex',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
})

const PaymentButtons = styled('div', {
    display: 'flex',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,

    '> button': {
        filter: 'drop-shadow(0px 2px 1px rgba(0, 0, 0, 0.15))',
    },
})
