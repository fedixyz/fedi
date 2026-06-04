import { cleanup, screen } from '@testing-library/react-native'

import {
    setNostrUnsignedEvent,
    setSiteInfo,
    setupStore,
} from '@fedi/common/redux'
import { NostrSignOverlay } from '@fedi/native/components/feature/fedimods/NostrSignOverlay'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

describe('components/feature/fedimods/NostrSignOverlay', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render Fedi wording for Nostr authentication events', () => {
        const store = setupStore()

        store.dispatch(
            setSiteInfo({
                title: 'Example Mod',
                url: 'https://example.com',
                icon: '',
            }),
        )
        store.dispatch(
            setNostrUnsignedEvent({
                created_at: 1,
                kind: 22242,
                content: '',
                tags: [],
            }),
        )

        renderWithProviders(
            <NostrSignOverlay onReject={jest.fn()} onAccept={jest.fn()} />,
            { store },
        )

        expect(screen.getByText(/Fedi/)).toBeOnTheScreen()
        expect(screen.queryByText(/Nostr/)).toBeNull()
    })
})
