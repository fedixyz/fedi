import {
    selectLastUsedSendMethod,
    setLastUsedSendMethod,
    setupStore,
} from '../../../redux'
import { loadFromStorage } from '../../../redux/storage'
import { StorageApi } from '../../../types'
import {
    getStoredState,
    hasStorageStateChanged,
    STATE_STORAGE_KEY,
    transformStateToStorage,
} from '../../../utils/storage'

const makeStorage = (stored: object): StorageApi => {
    const items: Record<string, string> = {
        [STATE_STORAGE_KEY]: JSON.stringify(stored),
    }
    return {
        getItem: jest.fn(async (key: string) => items[key] ?? null),
        setItem: jest.fn(async (key: string, item: string) => {
            items[key] = item
        }),
        removeItem: jest.fn(async (key: string) => {
            delete items[key]
        }),
    }
}

const i18n = { changeLanguage: jest.fn() } as any

const loadIntoNewStore = async (storage: StorageApi) => {
    const store = setupStore()
    await store.dispatch(loadFromStorage({ storage, i18n })).unwrap()
    return store
}

describe('last used send method storage', () => {
    it('survives a save and a load into a fresh store', async () => {
        const store = setupStore()
        const before = store.getState()
        store.dispatch(setLastUsedSendMethod('onchain'))

        expect(hasStorageStateChanged(before, store.getState())).toBe(true)

        const saved = transformStateToStorage(store.getState())
        const reloaded = await loadIntoNewStore(makeStorage(saved))

        expect(selectLastUsedSendMethod(reloaded.getState())).toBe('onchain')
    })

    it('migrates stored state from before the preference to no preference', async () => {
        const stored = await getStoredState(makeStorage({ version: 50 }))

        expect(stored?.version).toBe(51)
        expect(stored?.lastUsedSendMethod).toBeNull()
    })

    it('treats an unknown stored method as no preference', async () => {
        const saved = {
            ...transformStateToStorage(setupStore().getState()),
            lastUsedSendMethod: 'stable-balance',
        }

        const reloaded = await loadIntoNewStore(makeStorage(saved))

        expect(selectLastUsedSendMethod(reloaded.getState())).toBeNull()
    })
})
