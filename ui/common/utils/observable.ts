import { ObservableVecUpdate, SerdeVectorDiff } from '../types/bindings'

/**
 * Apply diff from bridge SerdeVectorDiff to an observable list.
 * TODO: Return identical reference if no changes are made, like upsertListItem.
 */
export function applyObservableUpdate<T>(
    prev: T[],
    update: SerdeVectorDiff<T>,
): T[] {
    switch (update.kind) {
        case 'append':
            return [...prev, ...update.values]
        case 'clear':
            return []
        case 'insert':
            return [
                ...prev.slice(0, update.index),
                update.value,
                ...prev.slice(update.index),
            ]
        case 'remove':
            return [
                ...prev.slice(0, update.index),
                ...prev.slice(update.index + 1),
            ]
        case 'popBack':
            return prev.slice(0, prev.length - 1)
        case 'popFront':
            return prev.slice(1)
        case 'pushBack':
            return [...prev, update.value]
        case 'pushFront':
            return [update.value, ...prev]
        case 'reset':
            return update.values
        case 'set':
            return [
                ...prev.slice(0, update.index),
                update.value,
                ...prev.slice(update.index + 1),
            ]
        case 'truncate':
            return prev.slice(0, update.length)
        default:
            throw new Error(`Unknown update kind: ${JSON.stringify(update)}`)
    }
}

/**
 * Apply a set of diffs from bridge SerdeVectorDiff to an observable list.
 * TODO: Return identical reference if no changes are made, like upsertListItem.
 */
export function applyObservableUpdates<T>(
    original: T[],
    updates: ObservableVecUpdate<T>['update'],
) {
    return updates.reduce((prev, update) => {
        return applyObservableUpdate(prev, update)
    }, original)
}

/**
 * Given an observable update, apply a mapping function to it. Handles the
 * various kinds of updates with their different shapes.
 */
export function mapObservableUpdate<T, R>(
    update: SerdeVectorDiff<T>,
    map: (value: T) => R,
): SerdeVectorDiff<R> {
    switch (update.kind) {
        // No mapping required
        case 'clear':
        case 'remove':
        case 'popBack':
        case 'popFront':
        case 'truncate':
            return update
        // Map a single value
        case 'insert':
        case 'pushFront':
        case 'pushBack':
        case 'set':
            return { ...update, value: map(update.value) }
        // Map an array of values
        case 'append':
        case 'reset':
            return { ...update, values: update.values.map(map) }
        default:
            throw new Error(`Unknown update kind: ${JSON.stringify(update)}`)
    }
}

/**
 * Given a set of observable updates, apply a mapping function to them. Handles
 * the various kinds of updates with their different shapes.
 */
export function mapObservableUpdates<T, R>(
    updates: ObservableVecUpdate<T>['update'],
    map: (value: T) => R,
) {
    return updates.map(update => mapObservableUpdate(update, map))
}

export function makeInitialResetUpdate<T>(values: T[]): SerdeVectorDiff<T>[] {
    return [{ kind: 'reset', values }]
}

/**
 * Given a set of observable updates, get a set of IDs that belong to items
 * that have been added to the list.
 */
export function getNewObservableIds<T>(
    updates: ObservableVecUpdate<T>['update'],
    getId: (value: T) => string | false | null | undefined,
) {
    const ids = new Set<string>()
    for (const update of updates) {
        switch (update.kind) {
            // Get id from a single value
            case 'insert':
            case 'pushFront':
            case 'pushBack':
            case 'set': {
                const id = getId(update.value)
                if (id) ids.add(id)
                break
            }
            // Get ids from an array of values
            case 'append':
            case 'reset':
                update.values.forEach(value => {
                    const id = getId(value)
                    if (id) ids.add(id)
                })
                break
        }
    }
    return ids
}
