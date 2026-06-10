import { MatrixEvent } from '@fedi/common/types'
import {
    isFileEvent,
    isImageEvent,
    isVideoEvent,
} from '@fedi/common/utils/matrix'

export function canReplyToEvent(event: MatrixEvent) {
    return (
        ['m.text', 'm.notice', 'm.emote'].includes(event.content.msgtype) ||
        isImageEvent(event) ||
        isVideoEvent(event) ||
        isFileEvent(event)
    )
}

export function hasMessageActions(event: MatrixEvent) {
    return canReplyToEvent(event)
}
