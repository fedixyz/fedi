import { act, waitFor } from '@testing-library/react'

import {
    useGuardianFeeBalance,
    useOutstandingGuardianFees,
} from '../../../hooks/guardianFees'
import { setupStore } from '../../../redux'
import type { MSats } from '../../../types'
import type { RpcTransactionDirection } from '../../../types/bindings'
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

type OutstandingEntry = [string, RpcTransactionDirection, MSats]

const renderOutstanding = (read: jest.Mock, federationId: string | undefined) =>
    renderHookWithBridge(
        () => useOutstandingGuardianFees(federationId),
        setupStore(),
        createMockFedimintBridge({
            getAccruedOutstandingFediFeesPerTXTypeByStream: read,
        }),
    )

describe('common/hooks/useOutstandingGuardianFees', () => {
    it('should read the guardian stream for the given federation', async () => {
        const read = jest.fn().mockResolvedValue([])
        renderOutstanding(read, FEDERATION_ID)

        await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
        expect(read).toHaveBeenCalledWith({
            federationId: FEDERATION_ID,
            stream: 'guardian',
        })
    })

    it('should total every module and direction the bridge reports', async () => {
        const entries: Array<OutstandingEntry> = [
            ['ln', 'send', 15_000 as MSats],
            ['wallet', 'send', 9_000 as MSats],
            ['mint', 'receive', 1_000 as MSats],
        ]
        const { result } = renderOutstanding(
            jest.fn().mockResolvedValue(entries),
            FEDERATION_ID,
        )

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.amount).toBe(25_000)
        expect(result.current.error).toBeNull()
    })

    it('should report nothing outstanding when the ledger is empty', async () => {
        const { result } = renderOutstanding(
            jest.fn().mockResolvedValue([]),
            FEDERATION_ID,
        )

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.amount).toBe(0)
    })

    it('should stay loading until the read resolves', async () => {
        const read = jest.fn().mockReturnValue(new Promise(() => {}))
        const { result } = renderOutstanding(read, FEDERATION_ID)

        await waitFor(() => expect(read).toHaveBeenCalled())

        expect(result.current.isLoading).toBe(true)
        expect(result.current.amount).toBe(0)
    })

    it('should stop loading and report the error when the read is refused', async () => {
        const error = new Error('read refused')
        const { result } = renderOutstanding(
            jest.fn().mockRejectedValue(error),
            FEDERATION_ID,
        )

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.error).toBe(error)
        expect(result.current.amount).toBe(0)
    })

    it('should not read without a federation id', async () => {
        const read = jest.fn().mockResolvedValue([])
        const { result } = renderOutstanding(read, undefined)

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(read).not.toHaveBeenCalled()
        expect(result.current.amount).toBe(0)
    })
})
