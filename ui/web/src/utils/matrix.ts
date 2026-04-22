import PollIcon from '@fedi/common/assets/svgs/poll.svg'
import { MatrixEvent, MatrixEventKind } from '@fedi/common/types'

export const matrixEventToIconMap: Partial<
    Record<
        MatrixEventKind,
        React.FunctionComponent<React.SVGAttributes<SVGElement>>
    >
> = {
    'm.poll': PollIcon,
}

export const getMatrixPreviewIcon = (
    event: MatrixEvent | null | undefined,
): React.FunctionComponent<React.SVGAttributes<SVGElement>> | undefined => {
    if (!event) return undefined

    return matrixEventToIconMap[event.content.msgtype]
}
