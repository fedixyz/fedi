import { render } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Provider } from 'react-redux'

import i18n from '../../localization/i18n'
import { setupStore } from '../../state/store'
import type { RootState } from '../../state/store'

// This type interface extends the default options for render from RTL, as well
// as allows the user to specify other things such as initialState, store.
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
    preloadedState?: Partial<RootState>
    store?: ReturnType<typeof setupStore>
}

export function renderWithProviders(
    ui: React.ReactElement,
    {
        preloadedState,
        // Automatically create a store instance if no store was passed in
        store = setupStore(preloadedState),
        ...renderOptions
    }: ExtendedRenderOptions = {},
) {
    function Wrapper({ children }: PropsWithChildren<unknown>): JSX.Element {
        return (
            <I18nextProvider i18n={i18n}>
                <Provider store={store}>{children}</Provider>
            </I18nextProvider>
        )
    }
    return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}
