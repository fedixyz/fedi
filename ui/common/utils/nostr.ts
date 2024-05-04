import { TFunction } from 'i18next'

interface NostrEvent {
    kind: number
    content: string
    tags: Array<Array<string>>
}

// See https://github.com/nostr-protocol/nips?tab=readme-ov-file#event-kinds
// Non-exhaustive list, fill out as needed.
const kindToI18nKey = {
    0: 'feature.nostr.kind-metadata',
    1: 'feature.nostr.kind-note',
    4: 'feature.nostr.kind-encrypted-dm',
    6: 'feature.nostr.kind-repost',
    7: 'feature.nostr.kind-reaction',
    9734: 'feature.nostr.kind-zap-request',
    9735: 'feature.nostr.kind-zap',
    9802: 'feature.nostr.kind-highlight',
    22242: 'feature.nostr.kind-authentication',
    24133: 'feature.nostr.kind-connect',
    30078: 'feature.nostr.kind-application-data',
} as const

export function getNostrEventDisplay<T extends TFunction>(
    event: NostrEvent,
    t: T,
) {
    const kind = t(
        kindToI18nKey[event.kind as keyof typeof kindToI18nKey] ||
            'feature.nostr.kind-default',
    )
    // TODO: For various event kinds, search through the tags specific to that
    // kind that could provide a better description.
    const content = event.content

    return {
        kind,
        content,
    }
}
