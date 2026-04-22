import { SvgImageName } from '../components/ui/SvgImage'
import { MatrixEvent, MatrixEventKind } from '../types'

export const matrixEventToIconMap: Partial<
    Record<MatrixEventKind, SvgImageName>
> = {
    'm.poll': 'Poll',
}

export const getMatrixPreviewIcon = (
    event: MatrixEvent | null | undefined,
): SvgImageName | undefined => {
    if (!event) return undefined

    return matrixEventToIconMap[event.content.msgtype]
}
