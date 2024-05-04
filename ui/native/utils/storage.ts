import AsyncStorage from '@react-native-async-storage/async-storage'
import { MMKV } from 'react-native-mmkv'

import { makeLog } from '@fedi/common/utils/log'

import { StorageApi } from '../types'

const log = makeLog('native/utils/storage')

const mmkv = new MMKV()
let hasMigratedFromAsyncStorage = mmkv.getBoolean('hasMigratedFromAsyncStorage')

/**
 * Async-compatible wrapper around MMKV, to maintain backwards compatibility
 * with AsyncStorage and be used interchangably with PWA's localStorage.
 */
export const storage: StorageApi = {
    async getItem(key: string) {
        if (!hasMigratedFromAsyncStorage) {
            await migrateFromAsyncStorage()
        }
        // AsyncStorage and localStorage both return null if the key doesn't exist.
        return mmkv.getString(key) || null
    },
    async setItem(key: string, value: string) {
        return mmkv.set(key, value)
    },
    async removeItem(key: string) {
        return mmkv.delete(key)
    },
}

/**
 * Migrate from AsyncStorage to MMKV. For now, keep the data around in
 * AsyncStorage to be removed later. Once we're sure AsyncStorage is no longer
 * needed at all, we can remove the module entirely.
 */
async function migrateFromAsyncStorage() {
    log.info('Migrating from AsyncStorage -> MMKV...')
    const start = global.performance.now()

    const keys = await AsyncStorage.getAllKeys()
    for (const key of keys) {
        try {
            const value = await AsyncStorage.getItem(key)
            if (value != null) {
                mmkv.set(key, value)
            }
        } catch (error) {
            log.error(
                `Failed to migrate key "${key}" from AsyncStorage to MMKV!`,
                error,
            )
        }
    }

    mmkv.set('hasMigratedFromAsyncStorage', true)
    hasMigratedFromAsyncStorage = true

    const end = global.performance.now()
    log.info(`Migrated from AsyncStorage -> MMKV in ${end - start}ms!`)
}
