import { makeLog } from '@fedi/common/utils/log'

import { storage } from './storage'

const log = makeLog('native/utils/merchantCatalog')

/**
 * A single item in a merchant's product catalog.
 *
 * `priceCents` is stored as canonical USD cents so it can be converted to sats
 * via the USD-based `convertCentsToSats`, and displayed in the user's selected
 * currency via `convertCentsToFormattedFiat`.
 */
export type MerchantProduct = {
    id: string
    name: string
    priceCents: number
}

const keyFor = (federationId?: string) =>
    `merchant:catalog:${federationId ?? 'default'}`

/**
 * A starter catalog seeded the first time a merchant opens the screen. It is
 * fully editable — the merchant can rename, reprice, delete, or add items, and
 * their changes are persisted per-federation.
 */
export const DEFAULT_CATALOG: MerchantProduct[] = [
    { id: 'espresso', name: 'Espresso', priceCents: 250 },
    { id: 'cappuccino', name: 'Cappuccino', priceCents: 375 },
    { id: 'croissant', name: 'Croissant', priceCents: 325 },
    { id: 'sandwich', name: 'Sandwich', priceCents: 850 },
    { id: 'salad', name: 'Garden Salad', priceCents: 900 },
    { id: 'cookie', name: 'Cookie', priceCents: 200 },
    { id: 'juice', name: 'Fresh Juice', priceCents: 450 },
    { id: 'tea', name: 'Tea', priceCents: 275 },
    { id: 'cake', name: 'Cake Slice', priceCents: 550 },
    { id: 'water', name: 'Water', priceCents: 150 },
]

const isValidProduct = (p: unknown): p is MerchantProduct =>
    typeof p === 'object' &&
    p !== null &&
    typeof (p as MerchantProduct).id === 'string' &&
    typeof (p as MerchantProduct).name === 'string' &&
    typeof (p as MerchantProduct).priceCents === 'number'

/**
 * Load the merchant's saved catalog. On first use (no saved data) the default
 * starter catalog is returned so the screen is immediately usable.
 */
export async function loadMerchantCatalog(
    federationId?: string,
): Promise<MerchantProduct[]> {
    try {
        const raw = await storage.getItem(keyFor(federationId))
        if (raw === null) return DEFAULT_CATALOG
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.every(isValidProduct)) {
            return parsed
        }
        return DEFAULT_CATALOG
    } catch (e) {
        log.warn('Failed to load merchant catalog, using default', e)
        return DEFAULT_CATALOG
    }
}

/** Persist the merchant's catalog for a federation. */
export async function saveMerchantCatalog(
    federationId: string | undefined,
    items: MerchantProduct[],
): Promise<void> {
    try {
        await storage.setItem(keyFor(federationId), JSON.stringify(items))
    } catch (e) {
        log.error('Failed to save merchant catalog', e)
        throw e
    }
}

/** Generate a reasonably-unique id for a newly created product. */
export function makeProductId(): string {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
