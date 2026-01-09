import { act, waitFor as waitForWeb } from '@testing-library/react'
import { waitFor as waitForNative } from '@testing-library/react-native'
import { v4 as uuidv4 } from 'uuid'

import {
    initializeCommonStore,
    refreshOnboardingStatus,
    selectFederations,
    selectOnboardingCompleted,
    setupStore,
    joinFederation as joinFederationAction,
    selectLastUsedFederation,
    selectMatrixAuth,
} from '@fedi/common/redux'
import { RemoteBridge } from '@fedi/common/utils/remote-bridge'

import { useCreateMatrixRoom } from '../../hooks/matrix'
import { MatrixRoom } from '../../types'
import { renderHookWithState, mockInitializeCommonStore } from './render'
import { createMockT } from './setup'

export interface RemoteBridgeTestContext {
    bridge: RemoteBridge
    store: ReturnType<typeof setupStore>
}

/**
 * State builder functions for integration tests.
 * Each function ensures a specific state is reached and can be composed together.
 */
export class IntegrationTestBuilder {
    constructor(
        private context: RemoteBridgeTestContext,
        private waitFor: typeof waitForWeb | typeof waitForNative = waitForWeb,
    ) {}

    /**
     * Returns the context for accessing fedimint, store, and renderHook to build integration tests
     */
    getContext(): RemoteBridgeTestContext {
        return this.context
    }

    /**
     * Ensures onboarding is completed
     */
    async withOnboardingCompleted(): Promise<IntegrationTestBuilder> {
        const { bridge, store } = this.context
        const currentState = store.getState()

        if (selectOnboardingCompleted(currentState)) {
            return this
        }

        await act(async () => {
            await bridge.fedimint.completeOnboardingNewSeed()
            await store.dispatch(refreshOnboardingStatus(bridge.fedimint))
        })

        await this.waitFor(() => {
            const state = store.getState()
            expect(selectOnboardingCompleted(state)).toBe(true)
            const matrixAuth = selectMatrixAuth(state)
            expect(matrixAuth?.userId).toBeTruthy()
        })

        return this
    }

    /**
     * Ensures a federation is joined (requires onboarding to be completed first)
     */
    async withChatReady(): Promise<IntegrationTestBuilder> {
        const { store } = this.context

        // Ensure onboarding is completed first
        await this.withOnboardingCompleted()

        // Wait for matrix auth to be available and check userId starts with npub
        await this.waitFor(() => {
            const matrixAuth = selectMatrixAuth(store.getState())
            expect(matrixAuth?.userId).toBeTruthy()
            expect(matrixAuth?.userId.startsWith('@npub1')).toBe(true)
            expect(matrixAuth?.displayName).toBeTruthy()
            expect(matrixAuth?.userId).not.toContain(matrixAuth?.displayName)
        })

        return this
    }

    /**
     * Ensures a chat group created by this user is in the room list
     */
    async withChatGroupCreated(
        groupName = 'test group',
        isPublic = false,
        broadcastOnly = false,
    ): Promise<MatrixRoom['id']> {
        const { store, bridge } = this.context

        await this.withChatReady()

        const { result: createRoomResult } = renderHookWithState(
            () => useCreateMatrixRoom(createMockT()),
            store,
            bridge.fedimint,
        )

        await act(() => {
            createRoomResult.current.setGroupName(groupName)
            if (isPublic) createRoomResult.current.setIsPublic(isPublic)
            if (broadcastOnly)
                createRoomResult.current.setBroadcastOnly(broadcastOnly)
        })

        await act(() => {
            createRoomResult.current.handleCreateGroup()
        })

        await this.waitFor(() => {
            expect(createRoomResult.current.isCreatingGroup).toBe(false)
            expect(createRoomResult.current.createdRoomId).toBeDefined()
        })

        return createRoomResult.current.createdRoomId as MatrixRoom['id']
    }

    /**
     * Ensures a federation is joined (requires onboarding to be completed first)
     */
    async withFederationJoined(): Promise<IntegrationTestBuilder> {
        const { bridge, store } = this.context

        // Ensure onboarding is completed first
        await this.withOnboardingCompleted()

        const currentState = store.getState()
        const federations = selectFederations(currentState)

        // Skip if federation already joined
        if (federations.length > 0) {
            return this
        }

        // Get invite code and join federation
        const inviteCode = await bridge.getInviteCode()
        await act(async () => {
            await store.dispatch(
                joinFederationAction({
                    fedimint: bridge.fedimint,
                    code: inviteCode,
                }),
            )
        })

        await this.waitFor(() => {
            const state = store.getState()
            const updatedFederations = selectFederations(state)
            expect(updatedFederations).toHaveLength(1)
        })

        return this
    }

    /**
     * Ensures the user has received ecash (requires federation to be joined)
     */
    async withEcashReceived(
        amountMsats: number = 100000,
    ): Promise<IntegrationTestBuilder> {
        const { bridge, store } = this.context

        // Ensure federation is joined first
        await this.withFederationJoined()

        // Generate and receive ecash
        const ecash = await bridge.generateEcash(amountMsats)

        await act(async () => {
            const state = store.getState()
            const federations = selectFederations(state)
            const federationId = federations[0].id
            await bridge.fedimint.receiveEcash(ecash, federationId)
        })

        await this.waitFor(() => {
            const state = store.getState()
            const federation = selectLastUsedFederation(state)
            expect(federation).toBeDefined()
            expect(federation?.balance).toBeGreaterThan(amountMsats - 1)
        })

        return this
    }
}

/**
 * Creates a test setup with RemoteBridge, Redux store, and hook rendering utilities.
 * Automatically handles initialization in beforeEach and cleanup in afterEach.
 *
 * @example
 * ```typescript
 * describe('my tests', () => {
 *   const context = setupRemoteBridgeTests()
 *
 *   it('should test something', async () => {
 *     const { remoteBridge, store, renderHookWithBridge } = context
 *     // Use the test utilities
 *   })
 * })
 * ```
 */
export function setupRemoteBridgeTests(): RemoteBridgeTestContext {
    const context = {} as RemoteBridgeTestContext
    let cleanupStore: ReturnType<typeof initializeCommonStore>

    beforeEach(async () => {
        jest.clearAllMocks()

        // Create and initialize RemoteBridge
        const remoteBridge = new RemoteBridge()
        const deviceId = `test:device:${uuidv4()}`
        await remoteBridge.initializeBridge(deviceId)
        await remoteBridge.subscribeToBridgeEvents()

        // Setup Redux store
        const store = setupStore()
        cleanupStore = mockInitializeCommonStore(store, remoteBridge.fedimint)

        // Mutate the context object
        context.bridge = remoteBridge
        context.store = store
    })

    afterEach(async () => {
        if (cleanupStore) {
            cleanupStore()
        }
        if (context.bridge) {
            context.bridge.shutdown()
        }
    })

    return context
}

/**
 * Helper function to create a state builder for the given context
 */
export function createIntegrationTestBuilder(
    waitForOverride?: typeof waitForWeb | typeof waitForNative,
): IntegrationTestBuilder {
    const context = setupRemoteBridgeTests()
    return new IntegrationTestBuilder(context, waitForOverride)
}
