import { VectorDiff } from '../types/bindings'

/**
 * Apply diff from bridge VectorDiff to a stream list.
 * TODO: Return identical reference if no changes are made, like upsertListItem.
 */
export function applyStreamUpdate<T>(prev: T[], update: VectorDiff<T>): T[] {
    if ('Clear' in update) {
        return []
    } else if ('PopFront' in update) {
        return prev.slice(1)
    } else if ('PopBack' in update) {
        return prev.slice(0, prev.length - 1)
    } else if ('Append' in update) {
        return [...prev, ...update.Append.values]
    } else if ('PushFront' in update) {
        return [update.PushFront.value, ...prev]
    } else if ('PushBack' in update) {
        return [...prev, update.PushBack.value]
    } else if ('Insert' in update) {
        return [
            ...prev.slice(0, update.Insert.index),
            update.Insert.value,
            ...prev.slice(update.Insert.index),
        ]
    } else if ('Set' in update) {
        return [
            ...prev.slice(0, update.Set.index),
            update.Set.value,
            ...prev.slice(update.Set.index + 1),
        ]
    } else if ('Remove' in update) {
        return [
            ...prev.slice(0, update.Remove.index),
            ...prev.slice(update.Remove.index + 1),
        ]
    } else if ('Truncate' in update) {
        return prev.slice(0, update.Truncate.length)
    } else if ('Reset' in update) {
        return update.Reset.values
    } else {
        throw new Error(`Unknown update type: ${JSON.stringify(update)}`)
    }
}

/**
 * Apply sequential diffs from bridge VectorDiff to a stream list.
 */
export function applyStreamUpdates<T>(original: T[], updates: VectorDiff<T>[]) {
    return updates.reduce((prev, update) => {
        return applyStreamUpdate(prev, update)
    }, original)
}

/**
 * Given an observable update, apply a mapping function to it. Handles the
 * various kinds of updates with their different shapes.
 */
export function mapStreamUpdate<T, R>(
    update: VectorDiff<T>,
    map: (value: T) => R,
): VectorDiff<R> {
    if ('Clear' in update || 'PopFront' in update || 'PopBack' in update) {
        return update
    } else if ('Append' in update) {
        return { Append: { values: update.Append.values.map(map) } }
    } else if ('PushFront' in update) {
        return { PushFront: { value: map(update.PushFront.value) } }
    } else if ('PushBack' in update) {
        return { PushBack: { value: map(update.PushBack.value) } }
    } else if ('Insert' in update) {
        return {
            Insert: {
                index: update.Insert.index,
                value: map(update.Insert.value),
            },
        }
    } else if ('Set' in update) {
        return {
            Set: { index: update.Set.index, value: map(update.Set.value) },
        }
    } else if ('Remove' in update) {
        return update
    } else if ('Truncate' in update) {
        return update
    } else if ('Reset' in update) {
        return { Reset: { values: update.Reset.values.map(map) } }
    } else {
        throw new Error(`Unknown update type: ${JSON.stringify(update)}`)
    }
}

/**
 * Given a set of observable updates, apply a mapping function to them. Handles
 * the various kinds of updates with their different shapes.
 */
export function mapStreamUpdates<T, R>(
    updates: VectorDiff<T>[],
    map: (value: T) => R,
) {
    return updates.map(update => mapStreamUpdate(update, map))
}

/**
 * Given a set of observable updates, get a set of IDs that belong to items
 * that have been added to the list.
 */
export function getNewStreamIds<T>(
    updates: VectorDiff<T>[],
    getId: (value: T) => string | false | null | undefined,
) {
    const ids = new Set<string>()
    for (const update of updates) {
        if ('Clear' in update || 'PopFront' in update || 'PopBack' in update) {
            // nothing
        } else if ('Insert' in update) {
            const id = getId(update.Insert.value)
            if (id) ids.add(id)
        } else if ('PushFront' in update) {
            const id = getId(update.PushFront.value)
            if (id) ids.add(id)
        } else if ('PushBack' in update) {
            const id = getId(update.PushBack.value)
            if (id) ids.add(id)
        } else if ('Set' in update) {
            const id = getId(update.Set.value)
            if (id) ids.add(id)
        } else if ('Append' in update) {
            update.Append.values.forEach(value => {
                const id = getId(value)
                if (id) ids.add(id)
            })
        } else if ('Reset' in update) {
            update.Reset.values.forEach(value => {
                const id = getId(value)
                if (id) ids.add(id)
            })
        }
    }
    return ids
}
