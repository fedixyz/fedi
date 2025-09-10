import { MatrixEventContentType } from '../utils/matrix'
import { MatrixEvent } from './matrix'

export type MxcUri = `mxc://${string}`
export type FileUri = `file://${string}`
export type HttpUri = `http://${string}` | `https://${string}`
export type SupportedFileSource =
    | MatrixEvent<MatrixEventContentType<'m.file'>>
    | MatrixEvent<MatrixEventContentType<'m.video'>>
    | MatrixEvent<MatrixEventContentType<'m.image'>>
    | FileUri
    | MxcUri
    | HttpUri
