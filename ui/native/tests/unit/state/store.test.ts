import { AppState, AppStateStatus } from 'react-native'

import { removeFederations, setFederations } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'

import type * as BridgeModule from '../../../bridge'
import { fedimint } from '../../../bridge'
import type * as StoreModule from '../../../state/store'
import { initializeNativeStore, store } from '../../../state/store'

jest.mock('../../../bridge', () => {
    const { createMockFedimintBridge } = jest.requireActual(
        '@fedi/common/tests/utils/fedimint',
    )
    return {
        fedimint: createMockFedimintBridge({
            getGuardianStatus: () => new Promise(() => {}),
        }),
        subscribeToBridgeEvents: jest.fn(async () => undefined),
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

describe('native bridge event forwarding', () => {
    // Android can destroy the activity, unmounting <App />, while the JS
    // runtime and the bridge's open streams survive; the next activity
    // remounts <App /> in the same runtime. Events sent in between must
    // still reach `fedimint`, and the remount must not forward them twice.
    it('subscribes once per JS runtime, across unmount and remount', async () => {
        // A fresh store module: the subscription is module state that the
        // guardian test above has already initialized.
        let bridge!: typeof BridgeModule
        let isolated!: typeof StoreModule
        jest.isolateModules(() => {
            /* eslint-disable @typescript-eslint/no-require-imports */
            bridge = require('../../../bridge')
            isolated = require('../../../state/store')
            /* eslint-enable @typescript-eslint/no-require-imports */
        })
        const subscribe = jest.mocked(bridge.subscribeToBridgeEvents)
        const callsBefore = subscribe.mock.calls.length

        const cleanupFirstMount = isolated.initializeNativeStore()
        cleanupFirstMount()
        const cleanupRemount = isolated.initializeNativeStore()
        try {
            await Promise.resolve()
            expect(subscribe.mock.calls.length - callsBefore).toBe(1)
            expect(
                isolated.store.getState().environment.eventListenersReady,
            ).toBe(true)
        } finally {
            cleanupRemount()
        }
    })
})
