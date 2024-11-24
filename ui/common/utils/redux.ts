import isEqual from 'lodash/isEqual'

/**
 * Given a list and a new entity to add to that list, append the entity
 * to the list if it's new, or update the existing entity if it's already
 * in the list. If the entity is identical to the one already in the list,
 * return the exact same list reference that was passed in.
 */
export function upsertListItem<T extends { id: string }>(
    list: T[] | null | undefined,
    item: T,
    /**
     * If the item has nested fields, pass in the keys of the nested fields to
     * merge so we don't overwrite the entire object.
     * needed for federation.meta for example
     * You should NOT pass in fields that are not objects like federation.init_state
     * for example would be useless
     */
    nestedFields?: (keyof T)[],
    /**
     * A sorting function to call when a new item is added or existing item is
     * modified. Must be in ascending order so that the newest item is at the
     * end of the array, otherwise when combined with `limit`, new items will
     * be removed immediately.
     */
    sort?: (entities: T[]) => T[],
) {
    list = list || []
    let addToEnd = true
    let wasEqual = false
    let newList = list.map(oldItem => {
        if (oldItem.id !== item.id) return oldItem
        addToEnd = false
        const updatedEntity: T = { ...oldItem, ...item }
        if (nestedFields) {
            nestedFields.map(field => {
                updatedEntity[field] = {
                    ...oldItem[field],
                    ...item[field],
                }
            })
        }
        wasEqual = isEqual(oldItem, updatedEntity)
        return updatedEntity
    })

    // If we went to update the old item but found that it was equal to the new
    // item, return the list we were passed to keep the reference the same
    if (!addToEnd && wasEqual) {
        return list
    }

    // If we didn't find the old one, add the new one to the end of the list
    if (addToEnd) {
        newList.push(item)
    }

    // If we're given a sort method, sort the list
    if (sort) {
        newList = sort(newList as T[])
    }

    return newList
}

/**
 * Given a record and a new item to add to that record, insert the item into
 * the record, or update the existing item. If the existing item is identical,
 * return the exact same record reference that was passed in.
 */
export function upsertRecordEntity<T extends { id: string }>(
    record: Record<string, T | undefined> | null | undefined,
    entity: T,
) {
    record = record || {}
    if (record[entity.id] && isEqual(record[entity.id], entity)) {
        return record
    }
    return {
        ...record,
        [entity.id]: {
            ...(record[entity.id] || {}),
            ...entity,
        },
    }
}

/**
 * Same logic as upsertRecordEntity but allows us to pass in the entityId
 */
export function upsertRecordEntityId<T>(
    record: Record<string, T> | null | undefined,
    entity: T,
    entityId: string,
) {
    record = record || {}
    if (record[entityId] && isEqual(record[entityId], entity)) {
        return record
    }
    return {
        ...record,
        [entityId]: {
            ...(record[entityId] || {}),
            ...entity,
        },
    }
}

/**
 * Same logic as upsertRecordEntityId but allows us to pass
 * in the entityId
 */
export function upsertRecordList<T>(
    record: Record<string, T[] | undefined> | null | undefined,
    entity: T[],
    entityId: string,
) {
    record = record || {}
    if (record[entityId] && isEqual(record[entityId], entity)) {
        return record
    }
    return {
        ...record,
        [entityId]: [...(record[entityId] || []), ...entity],
    }
}
