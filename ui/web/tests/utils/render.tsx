import { render, renderHook, type RenderOptions } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Provider } from 'react-redux'

import { FedimintProvider } from '@fedi/common/components/FedimintProvider'
import { setupStore, type RootState } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { FedimintBridge } from '@fedi/common/utils/fedimint'

import i18n from '../../src/localization/i18n'

// This type interface extends the default options for render from RTL, as well
// as allows the user to specify other things such as initialState, store.
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
    preloadedState?: Partial<RootState>
    store?: ReturnType<typeof setupStore>
    fedimint?: FedimintBridge
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
    function Wrapper({
        children,
    }: PropsWithChildren<unknown>): React.ReactElement {
        return (
            <I18nextProvider i18n={i18n}>
                <Provider store={store}>
                    <FedimintProvider fedimint={fedimint}>
                        {children}
                    </FedimintProvider>
                </Provider>
            </I18nextProvider>
        )
    }
    return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}

export function renderHookWithProviders<Result, Props>(
    hook: (initialProps: Props) => Result,
    {
        preloadedState,
        // Automatically create a store instance if no store was passed in
        store = setupStore(preloadedState),
        fedimint = createMockFedimintBridge(),
        ...renderOptions
    }: ExtendedRenderOptions = {},
) {
    function Wrapper({
        children,
    }: PropsWithChildren<unknown>): React.ReactElement {
        return (
            <I18nextProvider i18n={i18n}>
                <Provider store={store}>
                    <FedimintProvider fedimint={fedimint}>
                        {children}
                    </FedimintProvider>
                </Provider>
            </I18nextProvider>
        )
    }
    return {
        store,
        ...renderHook(hook, { wrapper: Wrapper, ...renderOptions }),
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
    function Wrapper({
        children,
    }: PropsWithChildren<unknown>): React.ReactElement {
        return (
            <I18nextProvider i18n={i18n}>
                <Provider store={store}>
                    <FedimintProvider fedimint={fedimint}>
                        {children}
                    </FedimintProvider>
                </Provider>
            </I18nextProvider>
        )
    }

    return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}
