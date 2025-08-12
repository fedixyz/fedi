import { renderHook } from '@testing-library/react'
import i18n from 'i18next'
import { useEffect, createElement } from 'react'
import { initReactI18next } from 'react-i18next'
import { Provider } from 'react-redux'

import { resources } from '@fedi/common/localization'
import { initializeCommonStore, setupStore } from '@fedi/common/redux'
import { StorageApi } from '@fedi/common/types'

import { FedimintBridge } from '../../utils/fedimint'
import { createMockFedimintBridge } from './fedimint'

export const mockStorageApi: StorageApi = {
    getItem: jest.fn(() => Promise.resolve('')),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
}

export const mockI18n = i18n.use(initReactI18next).init({
    fallbackLng: 'en',
    resources,
})

export const mockInitializeCommonStore = (
    store: ReturnType<typeof setupStore> = setupStore(),
    fedimint: FedimintBridge = createMockFedimintBridge(),
): ReturnType<typeof initializeCommonStore> => {
    return initializeCommonStore({
        store,
        fedimint,
        storage: mockStorageApi,
        i18n,
    })
}

export const mockReduxProvider = (
    store: ReturnType<typeof setupStore> = setupStore(),
    fedimint: FedimintBridge = createMockFedimintBridge(),
) => {
    return ({ children }: { children: React.ReactNode }) => {
        useEffect(() => {
            const unsubscribe = mockInitializeCommonStore(store, fedimint)

            return unsubscribe
        }, [])

        return createElement(Provider, { store, children })
    }
}

export function renderHookWithState<T>(
    hook: () => T,
    store: ReturnType<typeof setupStore> = setupStore(),
    fedimint: FedimintBridge = createMockFedimintBridge(),
) {
    return renderHook(hook, {
        wrapper: mockReduxProvider(store, fedimint),
    })
}
