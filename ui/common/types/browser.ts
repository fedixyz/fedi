import { FediMod } from './fedimint'

export type SiteInfo = {
    icon: string
    title: string
    url: string
}

export type MiniAppSession = {
    miniAppId: FediMod['id']
    history: string[]
    historyIndex: number
}

export type MiniAppSessionMap = Partial<Record<FediMod['id'], MiniAppSession>>
