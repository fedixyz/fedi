import {
    DEEP_LINKS as COMMON_DEEP_LINKS,
    DeepLinkConfig as CommonDeepLinkConfig,
    DeepLinkKey,
    DeepLinkParam as CommonDeepLinkParam,
} from '@fedi/common/utils/linking'
import {
    isValidMatrixRoomId,
    isValidMatrixUserId,
} from '@fedi/common/utils/matrix'
import { isValidSupportTicketNumber } from '@fedi/common/utils/validation'

export interface DeepLinkParam extends CommonDeepLinkParam {
    required: boolean
    stripFediPrefix?: boolean
    hint?: string
    validate?: (value: string) => string | null
    normalize?: (value: string) => string
}

export type DeepLinkCategory = 'onboarding' | 'navigation'

export interface DeepLinkConfig extends Omit<CommonDeepLinkConfig, 'params'> {
    category: DeepLinkCategory
    params: DeepLinkParam[]
}

const normalizeUrl = (v: string): string =>
    /^https?:\/\//.test(v) ? v : `https://${v}`

const validateFederationInvite = (v: string): string | null =>
    v.toLowerCase().startsWith('fed1')
        ? null
        : 'Federation invite code must start with fed1'

const validateCommunityInvite = (v: string): string | null =>
    v.toLowerCase().startsWith('fedi:community') ||
    v.toLowerCase().startsWith('community')
        ? null
        : 'Community invite code must start with fedi:community or community'

const validateUrl = (v: string): string | null => {
    try {
        new URL(normalizeUrl(v))
        return null
    } catch {
        return 'Must be a valid URL or domain'
    }
}

type ParamUI = Omit<DeepLinkParam, 'name' | 'label'>

interface BuilderEnrichment {
    category: DeepLinkCategory
    paramUI?: Record<string, ParamUI>
}

const inviteFederation: ParamUI = {
    required: true,
    hint: 'fed1...',
    validate: validateFederationInvite,
}

const inviteCommunity: ParamUI = {
    required: true,
    stripFediPrefix: true,
    hint: 'fedi:community... or community...',
    validate: validateCommunityInvite,
}

const urlBrowser: ParamUI = {
    required: true,
    hint: 'e.g. https://btcmap.org/map',
    normalize: normalizeUrl,
    validate: validateUrl,
}

// Keyed by DeepLinkKey so adding a deep link in common without enriching it here fails to compile.
const enrichments: Record<DeepLinkKey, BuilderEnrichment> = {
    'join-federation': {
        category: 'onboarding',
        paramUI: { invite: inviteFederation },
    },
    'join-community': {
        category: 'onboarding',
        paramUI: { invite: inviteCommunity },
    },
    ecash: {
        category: 'onboarding',
        paramUI: { id: { required: true } },
    },
    'join-federation-then-ecash': {
        category: 'onboarding',
        paramUI: {
            invite: inviteFederation,
            ecash: { required: true },
        },
    },
    'join-community-then-ecash': {
        category: 'onboarding',
        paramUI: {
            invite: inviteCommunity,
            ecash: { required: true },
        },
    },
    'join-federation-then-browse': {
        category: 'onboarding',
        paramUI: { invite: inviteFederation, url: urlBrowser },
    },
    'join-community-then-browse': {
        category: 'onboarding',
        paramUI: { invite: inviteCommunity, url: urlBrowser },
    },
    'join-community-then-federation': {
        category: 'onboarding',
        paramUI: { community: inviteCommunity, federation: inviteFederation },
    },
    browser: {
        category: 'navigation',
        paramUI: { url: urlBrowser },
    },
    home: { category: 'navigation' },
    chat: { category: 'navigation' },
    wallet: { category: 'navigation' },
    mods: { category: 'navigation' },
    room: {
        category: 'navigation',
        paramUI: {
            roomId: {
                required: true,
                hint: 'Format: !roomId:server',
                validate: (v: string) =>
                    isValidMatrixRoomId(v)
                        ? null
                        : 'Room ID must be in the format !roomId:server',
            },
        },
    },
    user: {
        category: 'navigation',
        paramUI: {
            userId: {
                required: true,
                hint: 'Format: @username:server',
                validate: (v: string) =>
                    isValidMatrixUserId(v)
                        ? null
                        : 'User ID must be in the format @username:server',
            },
        },
    },
    'share-logs': {
        category: 'navigation',
        paramUI: {
            ticketNumber: {
                required: false,
                hint: '#12345 or 12345',
                validate: (v: string) =>
                    isValidSupportTicketNumber(v)
                        ? null
                        : 'Ticket number must be a number, optionally prefixed with #',
            },
        },
    },
}

export const DEEP_LINKS: DeepLinkConfig[] = COMMON_DEEP_LINKS.map(common => {
    const enrichment = enrichments[common.key]
    return {
        ...common,
        category: enrichment.category,
        params: common.params.map(p => ({
            required: false,
            ...p,
            ...enrichment.paramUI?.[p.name],
        })),
    }
})
