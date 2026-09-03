import { act, waitFor } from '@testing-library/react'

import { useMonitorWalletServiceLiquidity } from '../../../hooks/fi'
import {
    selectWalletServiceLightningStage,
    selectWalletServiceLightningStatus,
    setFiLiquidityOperation,
    setFiStatus,
    setupStore,
} from '../../../redux'
import type {
    RpcFiFormationSnapshot,
    RpcFiLiquidityOperation,
} from '../../../types/bindings'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithBridge } from '../../utils/render'

const FORMATION_ID = 'formation-1'

const operation = (
    overrides: Partial<RpcFiLiquidityOperation> = {},
): RpcFiLiquidityOperation => ({
    operationId: 'operation-1',
    formationId: FORMATION_ID,
    providerPubkey: 'pubkey-1',
    endpointHint: '',
    detailsPayloadHash: 'hash',
    amounts: {
        gatewayMinSats: 100_000,
        gatewayMaxSats: 1_000_000,
        stabilityMinSats: 0,
        stabilityMaxSats: null,
    },
    phase: 'accepted',
    itemStatuses: [],
    rejectionCode: null,
    gatewayViewVerified: false,
    ...overrides,
})

const formation = {
    formationId: FORMATION_ID,
    phase: 'formed',
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: true,
    milestones: {
        ecashSent: true,
        guardiansConfirmed: true,
        walletServiceCreated: true,
    },
    inviteCode: 'fed11invite',
    lastError: null,
} as unknown as RpcFiFormationSnapshot

const emptyPage = { type: 'page', page: { operations: [], nextAfter: null } }

const mount = (overrides: Record<string, unknown> = {}) => {
    const store = setupStore()
    store.dispatch(setFiStatus({ type: 'formation', formation }))
    const fedimint = createMockFedimintBridge({
        fiClientLiquidityCurrent: () =>
            Promise.resolve({ type: 'current', operation: null }),
        fiClientLiquidityList: () => Promise.resolve(emptyPage),
        ...overrides,
    })
    const rendered = renderHookWithBridge(
        () => useMonitorWalletServiceLiquidity(),
        store,
        fedimint,
    )
    return { store, fedimint, ...rendered }
}

const status = (store: ReturnType<typeof setupStore>) =>
    selectWalletServiceLightningStatus(store.getState())

describe('common/hooks/fi useMonitorWalletServiceLiquidity', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should report unknown until the durable read answers', () => {
        const { store } = mount()

        // the difference between "nothing attached" and "we have not asked"
        expect(status(store)).toBe('unknown')
    })

    it('should report idle once the read finds nothing', async () => {
        const { store } = mount()

        await waitFor(() => expect(status(store)).toBe('idle'))
    })

    it('should adopt a live operation as attaching', async () => {
        const { store } = mount({
            fiClientLiquidityCurrent: () =>
                Promise.resolve({ type: 'current', operation: operation() }),
        })

        await waitFor(() => expect(status(store)).toBe('attaching'))
    })

    // `current` reports only live operations, so a verified attach disappears
    // from it — which is exactly when the durable list has to answer instead
    it('should find a verified attach in the durable list when current is empty', async () => {
        const { store } = mount({
            fiClientLiquidityList: () =>
                Promise.resolve({
                    type: 'page',
                    page: {
                        operations: [operation({ gatewayViewVerified: true })],
                        nextAfter: null,
                    },
                }),
        })

        await waitFor(() => expect(status(store)).toBe('attached'))
    })

    it('should page through the durable list until it finds the formation', async () => {
        const list = jest
            .fn()
            .mockResolvedValueOnce({
                type: 'page',
                page: { operations: [], nextAfter: 'cursor-1' },
            })
            .mockResolvedValueOnce({
                type: 'page',
                page: {
                    operations: [operation({ gatewayViewVerified: true })],
                    nextAfter: null,
                },
            })

        const { store } = mount({ fiClientLiquidityList: list })

        await waitFor(() => expect(status(store)).toBe('attached'))
        expect(list).toHaveBeenCalledTimes(2)
        // the cursor is passed back unchanged, as the contract requires
        expect(list).toHaveBeenNthCalledWith(2, 'cursor-1')
    })

    // another formation's verified attach is not this one's
    it('should ignore a verified operation belonging to another formation', async () => {
        const { store } = mount({
            fiClientLiquidityList: () =>
                Promise.resolve({
                    type: 'page',
                    page: {
                        operations: [
                            operation({
                                formationId: 'someone-elses-formation',
                                gatewayViewVerified: true,
                            }),
                        ],
                        nextAfter: null,
                    },
                }),
        })

        await waitFor(() => expect(status(store)).toBe('idle'))
    })

    it('should poll status while an operation is running', async () => {
        const statusRpc = jest.fn().mockResolvedValue({
            type: 'operation',
            operation: operation(),
        })

        const { store } = mount({
            fiClientLiquidityCurrent: () =>
                Promise.resolve({ type: 'current', operation: operation() }),
            fiClientLiquidityStatus: statusRpc,
        })

        await waitFor(() => expect(statusRpc).toHaveBeenCalled())
        expect(statusRpc).toHaveBeenCalledWith('operation-1')
        expect(status(store)).toBe('attaching')
    })

    // the stop condition is the operation being terminal, not a timer, so this
    // has to advance well past the interval — a real-time wait shorter than the
    // 5s tick would pass even with the stop condition deleted
    it('should stop polling once the gateway view verifies', async () => {
        jest.useFakeTimers()
        try {
            const statusRpc = jest.fn().mockResolvedValue({
                type: 'operation',
                operation: operation({ gatewayViewVerified: true }),
            })

            const { store } = mount({
                fiClientLiquidityCurrent: () =>
                    Promise.resolve({
                        type: 'current',
                        operation: operation(),
                    }),
                fiClientLiquidityStatus: statusRpc,
            })

            await act(async () => {})
            expect(status(store)).toBe('attached')
            const callsAtVerification = statusRpc.mock.calls.length

            // six intervals: a live timer would have fired every one of them
            await act(async () => {
                jest.advanceTimersByTime(30_000)
            })
            expect(statusRpc).toHaveBeenCalledTimes(callsAtVerification)
        } finally {
            jest.useRealTimers()
        }
    })

    // one failed read says nothing; a run of them means nobody will answer, and
    // the app must not poll every 5s forever while claiming an attach is running
    it('should report failed after a run of unreadable status polls', async () => {
        jest.useFakeTimers()
        try {
            const { store } = mount({
                fiClientLiquidityCurrent: () =>
                    Promise.resolve({
                        type: 'current',
                        operation: operation(),
                    }),
                fiClientLiquidityStatus: () =>
                    Promise.resolve({
                        type: 'error',
                        error: {
                            code: 'noActiveFormation',
                            message: 'gone',
                            detail: null,
                        },
                    }),
            })

            await act(async () => {})
            expect(status(store)).toBe('attaching')

            // still running well before the threshold
            await act(async () => {
                jest.advanceTimersByTime(20_000)
            })
            expect(status(store)).toBe('attaching')

            await act(async () => {
                jest.advanceTimersByTime(60_000)
            })
            expect(status(store)).toBe('failed')
        } finally {
            jest.useRealTimers()
        }
    })

    // a repeating cursor would spin the unbounded walk forever against the
    // bridge, so it stops rather than becoming an invisible RPC storm
    it('should stop the durable walk when the cursor repeats', async () => {
        const list = jest.fn().mockResolvedValue({
            type: 'page',
            page: { operations: [], nextAfter: 'stuck' },
        })

        const { store } = mount({ fiClientLiquidityList: list })

        await waitFor(() => expect(status(store)).toBe('idle'))
        expect(list).toHaveBeenCalledTimes(2)
    })

    // "found nothing" and "there is nothing" are different claims: a slow walk
    // resolving after a start must not erase the operation the start registered
    it('should not let a late empty read erase a running attach', async () => {
        let releaseList: (value: unknown) => void = () => undefined
        const listGate = new Promise(resolve => {
            releaseList = resolve
        })

        const { store } = mount({
            fiClientLiquidityList: () => listGate.then(() => emptyPage),
        })

        // the walk is still in flight; a start lands first
        store.dispatch(setFiLiquidityOperation(operation()))
        expect(status(store)).toBe('attaching')

        releaseList(undefined)
        await act(async () => {})

        expect(status(store)).toBe('attaching')
        expect(store.getState().fi.liquidity.operation).not.toBeNull()
    })

    // another formation's attach is not this one's, on either read path
    it('should ignore a current operation belonging to another formation', async () => {
        const { store } = mount({
            fiClientLiquidityCurrent: () =>
                Promise.resolve({
                    type: 'current',
                    operation: operation({
                        formationId: 'someone-elses-formation',
                    }),
                }),
        })

        await waitFor(() => expect(status(store)).toBe('idle'))
    })

    it('should treat a rejected operation as a failure', async () => {
        const { store } = mount({
            fiClientLiquidityCurrent: () =>
                Promise.resolve({
                    type: 'current',
                    operation: operation({ phase: 'rejected' }),
                }),
        })

        await waitFor(() => expect(status(store)).toBe('failed'))
    })

    it('should not read anything before a formation exists', async () => {
        const current = jest.fn()
        const store = setupStore()
        const fedimint = createMockFedimintBridge({
            fiClientLiquidityCurrent: current,
        })
        renderHookWithBridge(
            () => useMonitorWalletServiceLiquidity(),
            store,
            fedimint,
        )

        await new Promise(resolve => setTimeout(resolve, 20))
        expect(current).not.toHaveBeenCalled()
        expect(status(store)).toBe('unknown')
    })

    it('should report the verifying stage while the provider says it is done', async () => {
        const { store } = mount({
            fiClientLiquidityCurrent: () =>
                Promise.resolve({
                    type: 'current',
                    operation: operation({
                        itemStatuses: [
                            {
                                target: {
                                    type: 'gateway',
                                    itemId: 'item-1',
                                    gatewayId: 'gw-1',
                                    gatewayName: 'FLIP',
                                    amountSats: 100_000,
                                },
                                phase: 'completed',
                                fulfilledSats: 100_000,
                                completionEvidence: null,
                                failureCode: null,
                                updatedAt: 0,
                            },
                        ],
                    }),
                }),
        })

        // provider-authored completion is not readiness: the federation has
        // still to agree, and that wait is the one worth naming
        await waitFor(() =>
            expect(selectWalletServiceLightningStage(store.getState())).toBe(
                'verifying',
            ),
        )
        expect(status(store)).toBe('attaching')
    })
})
