import { MatrixEvent } from '@fedi/common/types'
import {
    canReactToMatrixEvent,
    canReplyToMatrixEvent,
} from '@fedi/common/utils/matrix'

export function hasReplyAction(event: MatrixEvent, canReplyInRoom: boolean) {
    return canReplyInRoom && canReplyToMatrixEvent(event)
}

export function hasReactionActions(
    event: MatrixEvent,
    reactionsEnabled: boolean,
) {
    return reactionsEnabled && canReactToMatrixEvent(event)
}
