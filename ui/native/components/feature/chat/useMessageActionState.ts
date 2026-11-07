import { TFunction } from 'i18next'

import { useDeleteMessage, usePinMessage } from '@fedi/common/hooks/matrix'
import {
    selectMatrixAuth,
    selectMessageReactionsEnabled,
} from '@fedi/common/redux'
import {
    canReactToMatrixEvent,
    canReplyToMatrixEvent,
    isBolt11PaymentEvent,
    isFileEvent,
    isImageEvent,
    isPaymentEvent,
    isTextEvent,
    isVideoEvent,
} from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { MatrixEvent } from '../../../types'

export function useMessageActionState({
    t,
    message,
    onSuccess,
}: {
    t: TFunction
    message?: MatrixEvent | null
    onSuccess?: () => void
}) {
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const isMe = message?.sender === matrixAuth?.userId
    const messageReactionsEnabled = useAppSelector(
        selectMessageReactionsEnabled,
    )

    const deleteMessage = useDeleteMessage({
        t,
        roomId: message?.roomId ?? '',
        senderId: message?.sender ?? '',
        eventId: message?.id,
        onSuccess,
    })

    const pinMessage = usePinMessage({
        t,
        roomId: message?.roomId ?? '',
        eventId: message?.id as string | null,
        onSuccess,
    })

    // A payment entry, including a bolt11 invoice rendered as one, takes
    // reactions only. Replying to, copying, editing, deleting or pinning a
    // payment is not offered.
    const isPaymentEntry =
        !!message && (isPaymentEvent(message) || isBolt11PaymentEvent(message))

    const canReply =
        !!message && !isPaymentEntry && canReplyToMatrixEvent(message)

    const canCopy = !isPaymentEntry && message?.content.msgtype === 'm.text'
    const canEdit = !!message && !isPaymentEntry && isMe && isTextEvent(message)
    const canDownload =
        !!message &&
        (isImageEvent(message) || isVideoEvent(message) || isFileEvent(message))
    const canReact =
        messageReactionsEnabled && !!message && canReactToMatrixEvent(message)
    const canDelete = !isPaymentEntry && deleteMessage.canDelete
    const canPin = !isPaymentEntry && pinMessage.canPin

    const hasAnyAction =
        canReply ||
        canCopy ||
        canEdit ||
        canDownload ||
        canReact ||
        canDelete ||
        canPin

    return {
        isMe,
        canReply,
        canCopy,
        canEdit,
        canDownload,
        canReact,
        hasAnyAction,
        ...deleteMessage,
        ...pinMessage,
        canDelete,
        canPin,
    }
}
