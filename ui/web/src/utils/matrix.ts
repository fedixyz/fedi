import { MatrixEvent, MatrixEventKind } from '@fedi/common/types'

import { SvgIconName } from '../components/Icon'

export const matrixEventToIconMap: Partial<
    Record<MatrixEventKind, SvgIconName>
> = {
    'm.poll': 'Poll',
}

export const getMatrixPreviewIcon = (
    event: MatrixEvent | null | undefined,
): SvgIconName | undefined => {
    if (!event) return undefined

    return matrixEventToIconMap[event.content.msgtype]
}
