declare module '*.svg' {
    import { FunctionComponent, SVGAttributes } from 'react'
    const value: FunctionComponent<SVGAttributes<SVGElement>>
    export = value
}
