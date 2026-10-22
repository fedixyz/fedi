import { act, screen } from '@testing-library/react-native'
import React from 'react'

import { setupStore, upsertFederation } from '@fedi/common/redux'
import {
    createMockCommunityPreview,
    mockFederation1,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { RpcCommunity } from '@fedi/common/types/bindings'

import JoinFederation from '../../../screens/JoinFederation'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/hooks/federation', () => ({
    ...jest.requireActual('@fedi/common/hooks/federation'),
    useLatestPublicFederations: jest.fn(() => ({ publicFederations: [] })),
}))

const invite = 'fedi:community10test'
const preview = createMockCommunityPreview() as unknown as RpcCommunity

describe('JoinFederation', () => {
    it('should load the preview once while the store changes during the load', async () => {
        let resolvePreview!: (value: RpcCommunity) => void
        const pendingPreview = new Promise<RpcCommunity>(resolve => {
            resolvePreview = resolve
        })
        const communityPreview = jest.fn(() => pendingPreview)
        const store = setupStore()

        renderWithProviders(
            <JoinFederation
                navigation={mockNavigation as any}
                route={{ params: { invite } } as any}
            />,
            { store, fedimint: createMockFedimintBridge({ communityPreview }) },
        )

        // a cold start fills the store mid-load
        act(() => {
            store.dispatch(upsertFederation(mockFederation1))
        })
        await act(async () => resolvePreview(preview))

        expect(await screen.findByText(preview.name)).toBeOnTheScreen()
        expect(communityPreview).toHaveBeenCalledTimes(1)
        expect(communityPreview).toHaveBeenCalledWith({ inviteCode: invite })
    })
})
