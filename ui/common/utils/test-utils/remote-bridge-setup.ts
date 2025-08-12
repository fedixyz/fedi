import { act, RenderHookResult, waitFor } from '@testing-library/react'
import { v4 as uuidv4 } from 'uuid'

import {
    initializeCommonStore,
    refreshOnboardingStatus,
    selectFederations,
    selectOnboardingCompleted,
    setupStore,
    joinFederation as joinFederationAction,
    selectActiveFederation,
    selectMatrixAuth,
} from '@fedi/common/redux'
import { RemoteBridge } from '@fedi/common/utils/remote-bridge'

import {
    mockInitializeCommonStore,
    renderHookWithState,
} from '../../tests/test-utils/render'

export interface RemoteBridgeTestContext {
    remoteBridge: RemoteBridge
    store: ReturnType<typeof setupStore>
    renderHookWithBridge: <T>(hookCall: () => T) => RenderHookResult<T, unknown>
}

/**
 * State builder functions for integration tests.
 * Each function ensures a specific state is reached and can be composed together.
 */
export class IntegrationTestBuilder {
    constructor(private context: RemoteBridgeTestContext) {}

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
        const { remoteBridge, store } = this.context
        const currentState = store.getState()

        if (selectOnboardingCompleted(currentState)) {
            return this
        }

        await act(async () => {
            await remoteBridge.fedimint.completeOnboardingNewSeed()
            await store.dispatch(refreshOnboardingStatus(remoteBridge.fedimint))
        })

        await waitFor(() => {
            const state = store.getState()
            expect(selectOnboardingCompleted(state)).toBe(true)
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
        await waitFor(
            () => {
                const matrixAuth = selectMatrixAuth(store.getState())
                expect(matrixAuth?.userId).toBeTruthy()
                expect(matrixAuth?.userId.startsWith('@npub1')).toBe(true)
            },
            { timeout: 10000 },
        )

        return this
    }

    /**
     * Ensures a federation is joined (requires onboarding to be completed first)
     */
    async withFederationJoined(): Promise<IntegrationTestBuilder> {
        const { remoteBridge, store } = this.context

        // Ensure onboarding is completed first
        await this.withOnboardingCompleted()

        const currentState = store.getState()
        const federations = selectFederations(currentState)

        // Skip if federation already joined
        if (federations.length > 0 && federations[0].hasWallet) {
            return this
        }

        // Get invite code and join federation
        const inviteCode = await remoteBridge.getInviteCode()
        await act(async () => {
            await store.dispatch(
                joinFederationAction({
                    fedimint: remoteBridge.fedimint,
                    code: inviteCode,
                }),
            )
        })

        await waitFor(
            () => {
                const state = store.getState()
                const updatedFederations = selectFederations(state)
                expect(updatedFederations).toHaveLength(1)
                expect(updatedFederations[0].hasWallet).toBe(true)
            },
            { timeout: 15000 },
        )

        return this
    }

    /**
     * Ensures the user has received ecash (requires federation to be joined)
     */
    async withEcashReceived(
        amountMsats: number = 100000,
    ): Promise<IntegrationTestBuilder> {
        const { remoteBridge, store } = this.context

        // Ensure federation is joined first
        await this.withFederationJoined()

        // Generate and receive ecash
        const ecash = await remoteBridge.generateEcash(amountMsats)

        await act(async () => {
            const state = store.getState()
            const federations = selectFederations(state)
            const federationId = federations[0].id
            await remoteBridge.fedimint.receiveEcash(ecash, federationId)
        })

        await waitFor(
            () => {
                const state = store.getState()
                const federation = selectActiveFederation(state)
                expect(federation).toBeDefined()
                expect(federation?.balance).toBeGreaterThan(amountMsats - 1)
            },
            { timeout: 20000 },
        )

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
        context.remoteBridge = remoteBridge
        context.store = store
        context.renderHookWithBridge = <T>(hook: () => T) => {
            return renderHookWithState(hook, store, remoteBridge.fedimint)
        }
    }, 10000)

    afterEach(async () => {
        if (cleanupStore) {
            cleanupStore()
        }
        if (context.remoteBridge) {
            context.remoteBridge.shutdown()
        }
    })

    return context
}

/**
 * Helper function to create a state builder for the given context
 */
export function createIntegrationTestBuilder(): IntegrationTestBuilder {
    const context = setupRemoteBridgeTests()
    return new IntegrationTestBuilder(context)
}
