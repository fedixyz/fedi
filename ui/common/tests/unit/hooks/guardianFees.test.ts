import { act, waitFor } from '@testing-library/react'

import { useGuardianFeeBalance } from '../../../hooks/guardianFees'
import { setupStore } from '../../../redux'
import type { MSats } from '../../../types'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithBridge } from '../../utils/render'

const FEDERATION_ID = 'federation-1'

type StreamArgs = {
    federationId: string
    callback: (balance: MSats) => void
    onError?: (error: unknown) => void
}

/**
 * Stands in for the guardian remittance balance stream, and records what the
 * hook did with it. `emit` and `fail` drive it after the subscribe, so a test
 * can assert the state the hook sits in before anything arrives.
 */
const makeBalanceStream = () => {
    const unsubscribe = jest.fn()
    let args: StreamArgs | null = null

    const subscribe = jest.fn((nextArgs: StreamArgs) => {
        args = nextArgs
        return unsubscribe
    })

    return {
        subscribe,
        unsubscribe,
        emit: (balance: number) => args?.callback(balance as MSats),
        fail: (error: unknown) => args?.onError?.(error),
        federationId: () => args?.federationId,
    }
}

// federationId is required rather than defaulted: passing `undefined` to a
// defaulted parameter selects the default, which is the exact case one of
// these tests is about
const renderBalance = (
    stream: ReturnType<typeof makeBalanceStream>,
    federationId: string | undefined,
) =>
    renderHookWithBridge(
        () => useGuardianFeeBalance(federationId),
        setupStore(),
        createMockFedimintBridge({
            spv2GuardianRemittanceBalance: stream.subscribe,
        }),
    )

describe('common/hooks/useGuardianFeeBalance', () => {
    it('should subscribe to the balance stream for the given federation', async () => {
        const stream = makeBalanceStream()
        renderBalance(stream, FEDERATION_ID)

        await waitFor(() => expect(stream.subscribe).toHaveBeenCalledTimes(1))
        expect(stream.federationId()).toBe(FEDERATION_ID)
    })

    it('should report the balance the stream emits', async () => {
        const stream = makeBalanceStream()
        const { result } = renderBalance(stream, FEDERATION_ID)

        await waitFor(() => expect(stream.subscribe).toHaveBeenCalled())
        await act(async () => {
            stream.emit(4_200_000)
        })

        await waitFor(() => expect(result.current.balance).toBe(4_200_000))
        expect(result.current.isLoading).toBe(false)
        expect(result.current.error).toBeNull()
    })

    // A service that has earned nothing emits exactly zero. Collapsing that
    // into "nothing has arrived yet" would leave the caller loading forever.
    it('should treat an emitted zero as a balance rather than as unset', async () => {
        const stream = makeBalanceStream()
        const { result } = renderBalance(stream, FEDERATION_ID)

        await waitFor(() => expect(stream.subscribe).toHaveBeenCalled())
        await act(async () => {
            stream.emit(0)
        })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.balance).toBe(0)
    })

    it('should stay loading until the stream emits', async () => {
        const stream = makeBalanceStream()
        const { result } = renderBalance(stream, FEDERATION_ID)

        await waitFor(() => expect(stream.subscribe).toHaveBeenCalled())

        expect(result.current.isLoading).toBe(true)
        expect(result.current.balance).toBe(0)
    })

    // Nothing reopens a stream the bridge refused, so a caller left loading
    // here is left loading for the life of the screen.
    it('should stop loading and report the error when the stream is refused', async () => {
        const stream = makeBalanceStream()
        const { result } = renderBalance(stream, FEDERATION_ID)
        const error = new Error('stream refused')

        await waitFor(() => expect(stream.subscribe).toHaveBeenCalled())
        await act(async () => {
            stream.fail(error)
        })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.error).toBe(error)
        expect(result.current.balance).toBe(0)
    })

    it('should not subscribe without a federation id', async () => {
        const stream = makeBalanceStream()
        const { result } = renderBalance(stream, undefined)

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(stream.subscribe).not.toHaveBeenCalled()
        expect(result.current.balance).toBe(0)
    })

    it('should close the stream when it unmounts', async () => {
        const stream = makeBalanceStream()
        const { unmount } = renderBalance(stream, FEDERATION_ID)

        await waitFor(() => expect(stream.subscribe).toHaveBeenCalled())
        unmount()

        expect(stream.unsubscribe).toHaveBeenCalledTimes(1)
    })
})
