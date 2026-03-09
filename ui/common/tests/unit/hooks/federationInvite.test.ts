import { waitFor } from '@testing-library/react'
import { t } from 'i18next'

import {
    useFederationInviteCode,
    useCommunityInviteCode,
} from '../../../hooks/federation'
import { setCommunities, setFederations, setupStore } from '../../../redux'
import { mockCommunity, mockFederation1 } from '../../mock-data/federation'
import { renderHookWithState } from '../../utils/render'

jest.mock('../../../redux/federation', () => {
    const actual = jest.requireActual('../../../redux/federation')
    const { createMockFederationPreview: createPreview } = jest.requireActual(
        '../../mock-data/federation',
    )
    const { mockFederation1: fed1 } = jest.requireActual(
        '../../mock-data/federation',
    )
    const preview = createPreview({
        id: fed1.id,
        name: fed1.name,
    })
    const previewPayload = { preview, isMember: false }
    return {
        ...actual,
        checkFederationPreview: jest.fn(() => () => {
            const promise = Promise.resolve({
                type: 'federation/checkFederationPreview/fulfilled',
                payload: previewPayload,
            })
            return Object.assign(promise, {
                unwrap: () => Promise.resolve(previewPayload),
            })
        }),
    }
})

jest.mock('../../../utils/FederationUtils', () => {
    const actual = jest.requireActual('../../../utils/FederationUtils')
    const { mockCommunity: community } = jest.requireActual(
        '../../mock-data/federation',
    )
    return {
        ...actual,
        getCommunityPreview: jest.fn(() =>
            Promise.resolve({
                ...community,
                returningMemberStatus: { type: 'unknown' },
                version: 1,
            }),
        ),
    }
})

describe('common/hooks/federation invite hooks', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()
    })

    describe('useFederationInviteCode', () => {
        it('should return isMember: false when federation is not joined', async () => {
            const { result } = renderHookWithState(
                () => useFederationInviteCode(t, 'test-invite-code'),
                store,
            )

            await waitFor(() => {
                expect(result.current.isChecking).toBe(false)
            })

            expect(result.current.isMember).toBe(false)
        })

        it('should return isMember: true when federation is in Redux state', async () => {
            store.dispatch(setFederations([mockFederation1]))

            const { result } = renderHookWithState(
                () => useFederationInviteCode(t, 'test-invite-code'),
                store,
            )

            await waitFor(() => {
                expect(result.current.isChecking).toBe(false)
            })

            expect(result.current.isMember).toBe(true)
        })

        it('should update isMember when federation is added to Redux after mount', async () => {
            const { result } = renderHookWithState(
                () => useFederationInviteCode(t, 'test-invite-code'),
                store,
            )

            await waitFor(() => {
                expect(result.current.isChecking).toBe(false)
            })

            expect(result.current.isMember).toBe(false)

            store.dispatch(setFederations([mockFederation1]))

            await waitFor(() => {
                expect(result.current.isMember).toBe(true)
            })
        })
    })

    describe('useCommunityInviteCode', () => {
        it('should return joined: false when community is not joined', async () => {
            const { result } = renderHookWithState(
                () => useCommunityInviteCode('test-invite-code'),
                store,
            )

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
            })

            expect(result.current.joined).toBe(false)
        })

        it('should return joined: true when community is in Redux state', async () => {
            store.dispatch(setCommunities([mockCommunity]))

            const { result } = renderHookWithState(
                () => useCommunityInviteCode('test-invite-code'),
                store,
            )

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
                expect(result.current.preview).toBeTruthy()
            })

            expect(result.current.joined).toBe(true)
        })

        it('should update joined when community is added to Redux after mount', async () => {
            const { result } = renderHookWithState(
                () => useCommunityInviteCode('test-invite-code'),
                store,
            )

            await waitFor(() => {
                expect(result.current.isFetching).toBe(false)
            })

            expect(result.current.joined).toBe(false)

            store.dispatch(setCommunities([mockCommunity]))

            await waitFor(() => {
                expect(result.current.joined).toBe(true)
            })
        })
    })
})
