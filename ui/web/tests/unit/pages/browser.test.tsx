import { waitFor } from '@testing-library/react'

import { selectCurrentUrl } from '@fedi/common/redux/browser'

import { mockUseRouter } from '../../../jest.setup'
import BrowserPage from '../../../src/pages/browser'
import { renderWithProviders } from '../../utils/render'

describe('/pages/browser', () => {
    beforeEach(() => {
        mockUseRouter.pathname = '/browser'
        mockUseRouter.query = {}
        window.location.hash = ''
    })

    it('should set currentUrl from the hash url param', async () => {
        window.location.hash = '#url=https%3A%2F%2Fexample.com'

        const { store } = renderWithProviders(<BrowserPage />)

        await waitFor(() => {
            expect(selectCurrentUrl(store.getState())).toBe(
                'https://example.com',
            )
        })
    })

    it('should set currentUrl from the query url param', async () => {
        mockUseRouter.query = { url: 'https://example.com' }

        const { store } = renderWithProviders(<BrowserPage />)

        await waitFor(() => {
            expect(selectCurrentUrl(store.getState())).toBe(
                'https://example.com',
            )
        })
    })

    it('should support the legacy query id param', async () => {
        mockUseRouter.query = { id: 'https://example.com' }

        const { store } = renderWithProviders(<BrowserPage />)

        await waitFor(() => {
            expect(selectCurrentUrl(store.getState())).toBe(
                'https://example.com',
            )
        })
    })
})
