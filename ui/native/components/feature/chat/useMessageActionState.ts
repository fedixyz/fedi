import { TFunction } from 'i18next'

import { useDeleteMessage, usePinMessage } from '@fedi/common/hooks/matrix'
import { selectMatrixAuth } from '@fedi/common/redux'
import {
    canReplyToMatrixEvent,
    isFileEvent,
    isImageEvent,
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

    const canReply = !!message && canReplyToMatrixEvent(message)

    const canCopy = message?.content.msgtype === 'm.text'
    const canEdit = !!message && isMe && isTextEvent(message)
    const canDownload =
        !!message &&
        (isImageEvent(message) || isVideoEvent(message) || isFileEvent(message))
    const canReact = canReply && !!message?.canReact

    const hasAnyAction =
        canReply ||
        canCopy ||
        canEdit ||
        canDownload ||
        deleteMessage.canDelete ||
        pinMessage.canPin

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
    }
}
