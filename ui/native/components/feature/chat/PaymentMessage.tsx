import React from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { selectAuthenticatedMember } from '@fedi/common/redux'
import { ChatMessage } from '@fedi/common/types'
import { makePaymentText } from '@fedi/common/utils/chat'

import { useAppSelector } from '../../../state/hooks'
import IncomingPullPayment from './IncomingPullPayment'
import IncomingPushPayment from './IncomingPushPayment'
import OutgoingPullPayment from './OutgoingPullPayment'
import OutgoingPushPayment from './OutgoingPushPayment'

type PaymentMessageProps = {
    message: ChatMessage
}

const PaymentMessage: React.FC<PaymentMessageProps> = ({
    message,
}: PaymentMessageProps) => {
    const { t } = useTranslation()
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const { sentTo, payment } = message
    const messageSentTo = sentTo || ''
    const paymentRecipient = payment?.recipient || ''
    const me = authenticatedMember?.id || ''

    const paymentText = makePaymentText(
        t,
        message,
        authenticatedMember,
        makeFormattedAmountsFromMSats,
    )

    if (messageSentTo === me && paymentRecipient === me && message.payment) {
        return (
            <IncomingPushPayment
                message={message}
                incomingPayment={message.payment}
                text={paymentText}
            />
        )
    }

    if (messageSentTo === me && paymentRecipient !== me && message.payment) {
        return (
            <IncomingPullPayment
                message={message}
                outgoingPayment={message.payment}
                text={paymentText}
            />
        )
    }

    if (messageSentTo !== me && paymentRecipient !== me) {
        return <OutgoingPushPayment message={message} text={paymentText} />
    }

    if (messageSentTo !== me && paymentRecipient === me && message.payment) {
        return (
            <OutgoingPullPayment
                message={message}
                incomingPayment={message.payment}
                text={paymentText}
            />
        )
    }

    return null
}

export default PaymentMessage
