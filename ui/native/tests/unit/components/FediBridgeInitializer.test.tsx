import { cleanup, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import { FediBridgeInitializer } from '../../../components/FediBridgeInitializer'
import { renderWithProviders } from '../../utils/render'

/**
 * The component reaches for the real bridge module rather than the one in
 * context, so the module itself is what the test has to stand in for.
 * `initializeBridge` resolving is the boundary this test is about: nothing
 * that talks to the bridge may run before it.
 */
const mockInitializeBridge = jest.fn(async () => {})

const mockFedimint = createMockFedimintBridge({
    // enough for `refreshOnboardingStatus` to take its shortest path
    bridgeStatus: async () => ({ type: 'onboarding', stage: { type: 'init' } }),
    listFederationsPendingRejoinFromScratch: jest.fn(async () => []),
})

jest.mock('../../../bridge', () => ({
    get fedimint() {
        return mockFedimint
    },
    getAppFlavor: () => 'bravo',
    initializeBridge: () => mockInitializeBridge(),
}))

jest.mock('react-native-splash-screen', () => ({ hide: jest.fn() }))

jest.mock('../../../utils/device-info', () => ({
    generateDeviceId: async () => 'test-device-id',
}))

jest.mock('../../../utils/hooks/notifications', () => ({
    useAppIsInForeground: () => true,
}))

const renderInitializer = () => {
    const state = setupStore().getState()
    return renderWithProviders(
        <FediBridgeInitializer>
            <Text>children</Text>
        </FediBridgeInitializer>,
        {
            fedimint: mockFedimint,
            preloadedState: {
                storage: {
                    ...state.storage,
                    hasLoaded: true,
                    readyToSave: true,
                },
                environment: {
                    ...state.environment,
                    eventListenersReady: true,
                },
            },
        },
    )
}

describe('components/FediBridgeInitializer', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('sweeps the federations pending a from-scratch rejoin once the bridge is up', async () => {
        renderInitializer()

        // the sweep's own rpc, which only answers once `initializeBridge` has
        // resolved — dispatching it at store init could only ever reject
        await waitFor(() =>
            expect(
                mockFedimint.listFederationsPendingRejoinFromScratch,
            ).toHaveBeenCalledTimes(1),
        )
        expect(mockInitializeBridge).toHaveBeenCalledTimes(1)
        expect(await screen.findByText('children')).toBeOnTheScreen()
    })
})
