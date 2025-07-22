import { ImageSourcePropType } from 'react-native'

import { FediModImages } from '../assets/images'

export * from '@fedi/common/types'

export default class Base {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(data?: any) {
        Object.keys(data).forEach(field => {
            this[field as keyof typeof this] = data[field]
        })
    }
}

export enum BitcoinOrLightning {
    bitcoin = 'bitcoin',
    lightning = 'lightning',
    lnurl = 'lnurl',
}

export type QueryParams = {
    [key: string]: string
}
export class BtcLnUri extends Base {
    type: BitcoinOrLightning | null
    body: string
    paramsString: string | null
    get queryParams(): QueryParams | null {
        if (this.paramsString == null) return null

        const result: QueryParams = {}
        this.paramsString.split('&').forEach(p => {
            const [key, value] = p.split('=')
            result[key] = value
        })
        return result
    }
    get fullString(): string | null {
        const prefix = this.type ? `${this.type}:` : ''
        const params = this.paramsString ? `?${this.paramsString}` : ''
        return `${prefix}${this.body}${params}`
    }
}

export enum ShortcutType {
    fediMod = 'fediMod',
    screen = 'screen',
}
export type ShortcutIcon = {
    svg?: string
    url?: string
    image?: ImageSourcePropType
}
// TODO: Refactor classes to use functional-friendly types
export class Shortcut extends Base {
    title: string
    description?: string
    icon: ShortcutIcon
    type: ShortcutType
    color?: string
}
// TODO: Refactor classes to use functional-friendly types
export class FediMod extends Shortcut {
    id: string
    type = ShortcutType.fediMod
    url: string
    imageUrl?: string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(data: any) {
        super(data) // Ensure parent properties are initialized correctly
        this.id = data.id || '' // Assign id explicitly from data
        this.url = data.url || '' // Ensure URL is preserved
        this.imageUrl = data.imageUrl || '' // Preserve optional imageUrl
        this.icon = {
            image: FediModImages[this.id] || FediModImages.default, // Use id for image mapping
        }
    }
}
