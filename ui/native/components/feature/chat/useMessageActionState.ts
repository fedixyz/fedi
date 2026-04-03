import { TFunction } from 'i18next'

import { useDeleteMessage, usePinMessage } from '@fedi/common/hooks/matrix'
import { selectMatrixAuth } from '@fedi/common/redux'
import {
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

    const canReply =
        !!message &&
        (['m.text', 'm.notice', 'm.emote'].includes(message.content.msgtype) ||
            isImageEvent(message) ||
            isVideoEvent(message) ||
            isFileEvent(message))

    const canCopy = message?.content.msgtype === 'm.text'
    const canEdit = !!message && isMe && isTextEvent(message)
    const canDownload =
        !!message &&
        (isImageEvent(message) || isVideoEvent(message) || isFileEvent(message))

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
        hasAnyAction,
        ...deleteMessage,
        ...pinMessage,
    }
}
