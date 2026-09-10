import {
    removeFederations,
    selectFederations,
    selectRecentlyUsedFederationIds,
    setFederations,
    setLastUsedFederationId,
    setPayFromFederationId,
    setupStore,
} from '../../../redux'
import { mockFederation1, mockFederation2 } from '../../mock-data/federation'

const mockFederation3 = { ...mockFederation1, id: '3' }

describe('common/redux/federation › removeFederations', () => {
    it('should prune a removed federation from recentlyUsedFederationIds and move payFromFederationId off it', () => {
        const store = setupStore()
        store.dispatch(
            setFederations([mockFederation1, mockFederation2, mockFederation3]),
        )
        store.dispatch(setLastUsedFederationId(mockFederation1.id))
        store.dispatch(setLastUsedFederationId(mockFederation2.id))
        store.dispatch(setPayFromFederationId(mockFederation2.id))

        store.dispatch(removeFederations([mockFederation2.id]))

        expect(selectRecentlyUsedFederationIds(store.getState())).not.toContain(
            mockFederation2.id,
        )
        expect(store.getState().federation.payFromFederationId).not.toBe(
            mockFederation2.id,
        )
    })

    it('should set payFromFederationId to null when the last federation is removed', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))

        store.dispatch(removeFederations([mockFederation1.id]))

        expect(store.getState().federation.payFromFederationId).toBeNull()
    })

    it('should be a no-op for an id that is not joined', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))

        store.dispatch(removeFederations(['unknown-id']))

        expect(selectFederations(store.getState()).map(f => f.id)).toEqual([
            mockFederation1.id,
            mockFederation2.id,
        ])
        expect(store.getState().federation.payFromFederationId).toBe(
            mockFederation1.id,
        )
    })

    it('should leave federations not named in the payload untouched', () => {
        const store = setupStore()
        store.dispatch(
            setFederations([mockFederation1, mockFederation2, mockFederation3]),
        )

        store.dispatch(removeFederations([mockFederation2.id]))

        expect(selectFederations(store.getState()).map(f => f.id)).toEqual([
            mockFederation1.id,
            mockFederation3.id,
        ])
    })
})
