import { ThemeProvider } from '@rneui/themed'
import {
    render,
    renderHook,
    type RenderOptions,
} from '@testing-library/react-native'
import React, { PropsWithChildren } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider } from 'react-redux'

import { FedimintProvider } from '@fedi/common/components/FedimintProvider'
import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { FedimintBridge } from '@fedi/common/utils/fedimint'
import { AppState } from '@fedi/native/state/store'

import { I18nProvider, mockTheme } from '../setup/jest.setup.mocks'

// This type interface extends the default options for render from RTL, as well
// as allows the user to specify other things such as initialState, store.
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
    preloadedState?: Partial<AppState>
    store?: ReturnType<typeof setupStore>
    fedimint?: FedimintBridge
}

const makeWrapperWithStore = (
    store: ReturnType<typeof setupStore>,
    fedimint: FedimintBridge = createMockFedimintBridge(),
) => {
    return ({ children }: PropsWithChildren<unknown>) => {
        return (
            <SafeAreaProvider>
                <I18nProvider>
                    <ThemeProvider theme={mockTheme}>
                        <Provider store={store}>
                            <FedimintProvider fedimint={fedimint}>
                                {children}
                            </FedimintProvider>
                        </Provider>
                    </ThemeProvider>
                </I18nProvider>
            </SafeAreaProvider>
        )
    }
}

export function renderWithProviders(
    ui: React.ReactElement,
    {
        preloadedState,
        // Automatically create a store instance if no store was passed in
        store = setupStore(preloadedState),
        fedimint = createMockFedimintBridge(),
        ...renderOptions
    }: ExtendedRenderOptions = {},
) {
    return {
        ...render(ui, {
            wrapper: makeWrapperWithStore(store, fedimint),
            ...renderOptions,
        }),
        store,
    }
}

export function renderHookWithProviders<T>(
    hook: () => T,
    {
        preloadedState,
        // Automatically create a store instance if no store was passed in
        store = setupStore(preloadedState),
        fedimint = createMockFedimintBridge(),
        ...renderOptions
    }: ExtendedRenderOptions = {},
) {
    return {
        store,
        ...renderHook(hook, {
            wrapper: makeWrapperWithStore(store, fedimint),
            ...renderOptions,
        }),
    }
}

export function renderWithBridge(
    ui: React.ReactElement,
    {
        store,
        fedimint,
        ...renderOptions
    }: {
        store: ReturnType<typeof setupStore>
        fedimint: FedimintBridge
    },
) {
    return {
        ...render(ui, {
            wrapper: makeWrapperWithStore(store, fedimint),
            ...renderOptions,
        }),
        store,
    }
}
