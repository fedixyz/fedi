import { act, waitFor } from '@testing-library/react'

import { useMonitorFiClient } from '../../../hooks/fi'
import {
    selectWalletServiceFlowStatus,
    setFeatureFlags,
    setOnboardingCompleted,
    setupStore,
} from '../../../redux'
import type { FeatureCatalog, RpcFiClientStatus } from '../../../types/bindings'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithBridge } from '../../utils/render'

type SubscribeArgs = {
    callback: (status: RpcFiClientStatus) => void
    onError?: (error: unknown) => void
}

const idleStatus: RpcFiClientStatus = {
    type: 'ready',
    status: { type: 'idle' },
}

const formationStatus: RpcFiClientStatus = {
    type: 'ready',
    status: {
        type: 'formation',
        formation: {
            formationId: 'formation-1',
            phase: 'acquiringSeats',
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
                guardiansConfirmed: false,
                walletServiceCreated: false,
            },
            inviteCode: null,
            lastError: null,
        },
    },
} as unknown as RpcFiClientStatus

const mount = ({
    isForeground = true,
    statuses = [idleStatus],
}: { isForeground?: boolean; statuses?: RpcFiClientStatus[] } = {}) => {
    const store = setupStore()
    store.dispatch(setOnboardingCompleted(true))
    store.dispatch(
        setFeatureFlags({
            wallet_service_creation: true,
        } as unknown as FeatureCatalog),
    )

    const subscribeArgs: SubscribeArgs[] = []
    let statusIndex = 0
    const fedimint = createMockFedimintBridge({
        // one status per call, so a retry's re-read is distinguishable
        fiClientStatus: () =>
            Promise.resolve(
                statuses[Math.min(statusIndex++, statuses.length - 1)],
            ),
        fiClientSubscribe: (args: SubscribeArgs) => {
            subscribeArgs.push(args)
            return () => {}
        },
    })

    // `renderHookWithBridge` takes no props, so the flag lives here
    let currentForeground = isForeground
    const rendered = renderHookWithBridge(
        () => useMonitorFiClient({ isForeground: currentForeground }),
        store,
        fedimint,
    )
    const setForeground = async (next: boolean) => {
        currentForeground = next
        await act(async () => {
            rendered.rerender()
        })
    }
    return { store, fedimint, subscribeArgs, setForeground, ...rendered }
}

const flowStatus = (store: ReturnType<typeof setupStore>) =>
    selectWalletServiceFlowStatus(store.getState())

describe('common/hooks/fi useMonitorFiClient', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    // a JS context restarting over a surviving bridge is rejected with
    // `Duplicated stream id`
    it('should open the stream again after a failed subscribe', async () => {
        const { subscribeArgs } = mount()

        await waitFor(() => expect(subscribeArgs).toHaveLength(1))

        act(() => {
            subscribeArgs[0].onError?.(new Error('Duplicated stream id: 3'))
        })
        await act(async () => {
            jest.advanceTimersByTime(1_000)
        })

        expect(subscribeArgs).toHaveLength(2)
    })

    it('should back off rather than retry the same failure on a tight loop', async () => {
        const { subscribeArgs } = mount()

        await waitFor(() => expect(subscribeArgs).toHaveLength(1))

        act(() => {
            subscribeArgs[0].onError?.(new Error('first'))
        })
        await act(async () => {
            jest.advanceTimersByTime(1_000)
        })
        act(() => {
            subscribeArgs[1].onError?.(new Error('second'))
        })

        // second wait is longer than the first
        await act(async () => {
            jest.advanceTimersByTime(1_000)
        })
        expect(subscribeArgs).toHaveLength(2)

        await act(async () => {
            jest.advanceTimersByTime(1_000)
        })
        expect(subscribeArgs).toHaveLength(3)
    })

    it('should re-read the status as part of retrying', async () => {
        const { fedimint, subscribeArgs } = mount()

        await waitFor(() =>
            expect(fedimint.fiClientStatus).toHaveBeenCalledTimes(1),
        )

        act(() => {
            subscribeArgs[0].onError?.(new Error('Duplicated stream id: 3'))
        })
        await act(async () => {
            jest.advanceTimersByTime(1_000)
        })

        expect(fedimint.fiClientStatus).toHaveBeenCalledTimes(2)
    })

    it('should stop retrying once the monitor is unmounted', async () => {
        const { subscribeArgs, unmount } = mount()

        await waitFor(() => expect(subscribeArgs).toHaveLength(1))

        act(() => {
            subscribeArgs[0].onError?.(new Error('Duplicated stream id: 3'))
        })
        unmount()
        await act(async () => {
            jest.advanceTimersByTime(30_000)
        })

        expect(subscribeArgs).toHaveLength(1)
    })

    // a stream that goes quiet reports no error, so there is nothing to
    // retry on
    describe('returning to the foreground', () => {
        it('should re-read the status', async () => {
            const { fedimint, setForeground } = mount({
                isForeground: true,
                statuses: [idleStatus, formationStatus],
            })

            await waitFor(() =>
                expect(fedimint.fiClientStatus).toHaveBeenCalledTimes(1),
            )

            await setForeground(false)
            await setForeground(true)

            expect(fedimint.fiClientStatus).toHaveBeenCalledTimes(2)
        })

        it('should adopt a formation the app slept through', async () => {
            const { store, fedimint, setForeground } = mount({
                isForeground: true,
                statuses: [idleStatus, formationStatus],
            })

            await waitFor(() =>
                expect(fedimint.fiClientStatus).toHaveBeenCalledTimes(1),
            )
            expect(flowStatus(store)).toBe('none')

            await setForeground(false)
            await setForeground(true)

            await waitFor(() => expect(flowStatus(store)).toBe('inProgress'))
        })

        it('should not re-read while the app stays in front', async () => {
            const { fedimint, setForeground } = mount({ isForeground: true })

            await waitFor(() =>
                expect(fedimint.fiClientStatus).toHaveBeenCalledTimes(1),
            )

            await setForeground(true)

            // the subscribe already read it
            expect(fedimint.fiClientStatus).toHaveBeenCalledTimes(1)
        })
    })
})
