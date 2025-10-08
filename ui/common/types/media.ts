import { MatrixEvent } from './matrix'

export type MxcUri = `mxc://${string}`
export type FileUri = `file://${string}`
export type HttpUri = `http://${string}` | `https://${string}`
export type SupportedFileSource =
    | MatrixEvent<'m.file'>
    | MatrixEvent<'m.video'>
    | MatrixEvent<'m.image'>
    | FileUri
    | MxcUri
    | HttpUri
