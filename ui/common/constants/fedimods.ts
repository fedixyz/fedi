import type { FediMod } from '../types/fedimint'
import { isDev, isNightly } from '../utils/environment'

export const DEFAULT_FEDIMODS: FediMod[] = [
    {
        id: 'stakwork',
        title: 'Stakwork',
        url: 'https://jobs.stakwork.com/workers',
    },
    {
        id: 'stackernews',
        title: 'Stacker.News',
        url: 'https://stacker.news',
    },
    {
        id: 'bitrefill',
        title: 'Bitrefill',
        url: 'https://bitrefill.com',
    },
    {
        id: 'geyser',
        title: 'Geyser Fund',
        url: 'https://geyser.fund',
    },
    {
        id: 'bitcoinco',
        title: 'Bitcoin Co',
        url: 'https://thebitcoincompany.com/',
    },
    {
        id: 'btcmap',
        title: 'BTCMAP',
        url: 'https://btcmap.org/map',
    },
    {
        id: 'hrf',
        title: 'Donate to HRF',
        url: 'https://geyser.fund/project/supporthrf',
    },
]

export const CATALOG_URL_PROD = 'https://catalog.fedi.xyz'
export const CATALOG_URL_STAGING = 'https://fedi-catalog-staging.vercel.app'
export const CATALOG_URL =
    isNightly() || isDev() ? CATALOG_URL_STAGING : CATALOG_URL_PROD

export const COMMUNITY_TOOL_URL_PROD = 'https://community-generator.fedi.xyz'
export const COMMUNITY_TOOL_URL_STAGING =
    'https://community-tool-two.vercel.app'
export const COMMUNITY_TOOL_URL =
    isNightly() || isDev()
        ? COMMUNITY_TOOL_URL_STAGING
        : COMMUNITY_TOOL_URL_PROD
