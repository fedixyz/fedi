import { AppState, AppStateStatus } from 'react-native'

import { removeFederations, setFederations } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'

import { fedimint } from '../../../bridge'
import { initializeNativeStore, store } from '../../../state/store'

jest.mock('../../../bridge', () => {
    const { createMockFedimintBridge } = jest.requireActual(
        '@fedi/common/tests/utils/fedimint',
    )
    return {
        fedimint: createMockFedimintBridge({
            getGuardianStatus: () => new Promise(() => {}),
        }),
        subscribeToBridgeEvents: jest.fn(async () => []),
        unsubscribeFromBridgeEvents: jest.fn(),
    }
})

describe('native guardian monitoring lifecycle', () => {
    it('preserves a warning through inactive, but clears it on background', async () => {
        jest.useFakeTimers()
        let currentState: AppStateStatus = 'active'
        const listeners: Array<(state: AppStateStatus) => void> = []
        jest.spyOn(AppState, 'currentState', 'get').mockImplementation(
            () => currentState,
        )
        jest.spyOn(AppState, 'addEventListener').mockImplementation(
            (_, listener) => {
                listeners.push(listener)
                return { remove: jest.fn() }
            },
        )
        store.dispatch(
            setFederations([
                { ...mockFederation1, status: 'offline' as const },
            ]),
        )
        const cleanup = initializeNativeStore()
        const changeState = (state: AppStateStatus) => {
            currentState = state
            listeners.forEach(listener => listener(state))
        }
        try {
            await jest.advanceTimersByTimeAsync(0)
            changeState('inactive')
            changeState('active')
            expect(store.getState().federation.federations[0]).toMatchObject({
                status: 'offline',
            })
            expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(1)

            changeState('inactive')
            changeState('background')
            expect(store.getState().federation.federations[0]).toMatchObject({
                status: 'unknown',
            })
            await jest.advanceTimersByTimeAsync(180_000)
            expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(1)
            changeState('active')
            expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(2)
        } finally {
            cleanup()
            store.dispatch(removeFederations([mockFederation1.id]))
            jest.restoreAllMocks()
            jest.useRealTimers()
        }
    })
})
