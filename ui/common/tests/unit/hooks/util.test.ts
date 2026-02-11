import { act, renderHook } from '@testing-library/react'

import { useAsyncCallback } from '../../../hooks/util'

describe('useAsyncCallback', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('prevents concurrent executions', async () => {
        const mockFn = jest.fn().mockResolvedValue('result')
        const { result } = renderHook(() => useAsyncCallback(mockFn, []))

        const [callback] = result.current

        // Fire multiple calls rapidly in the same tick
        act(() => {
            callback()
            callback()
            callback()
            callback()
        })

        // Wait for async operations to complete
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100))
        })

        // Should only execute once despite 4 rapid calls
        expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('returns loading state that transitions correctly', async () => {
        let resolvePromise: () => void
        const mockFn = jest.fn(
            () =>
                new Promise<void>(resolve => {
                    resolvePromise = resolve
                }),
        )
        const { result } = renderHook(() => useAsyncCallback(mockFn, []))

        const [callback] = result.current

        // Initial state: not loading
        expect(result.current[1]).toBe(false)

        // Start async operation
        act(() => {
            callback()
        })

        // During execution: loading
        expect(result.current[1]).toBe(true)

        // Complete the promise
        await act(async () => {
            if (resolvePromise) resolvePromise()
            await new Promise(resolve => setTimeout(resolve, 10))
        })

        // After completion: not loading
        expect(result.current[1]).toBe(false)
    })

    it('handles errors gracefully and resets loading state', async () => {
        const mockFn = jest.fn().mockRejectedValue(new Error('Test error'))
        const { result } = renderHook(() => useAsyncCallback(mockFn, []))

        const [callback] = result.current

        // Call the callback and catch the error
        await act(async () => {
            try {
                await callback()
            } catch {
                // Expected to throw, suppress the error
            }
        })

        // Loading state should be reset even after error
        expect(result.current[1]).toBe(false)
    })

    it('preserves callback parameters', async () => {
        const mockFn = jest.fn().mockResolvedValue(undefined)
        const { result } = renderHook(() =>
            useAsyncCallback(async (a: string, b: number) => mockFn(a, b), []),
        )

        const [callback] = result.current

        act(() => {
            callback('test', 42)
        })

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100))
        })

        expect(mockFn).toHaveBeenCalledWith('test', 42)
    })

    it('preserves callback return value', async () => {
        const mockFn = jest.fn().mockResolvedValue('return-value')
        const { result } = renderHook(() => useAsyncCallback(mockFn, []))

        const [callback] = result.current

        let returnValue: string | undefined
        await act(async () => {
            returnValue = await callback()
        })

        expect(returnValue).toBe('return-value')
    })

    it('updates callback when dependencies change', async () => {
        const mockFn1 = jest.fn().mockResolvedValue('first')
        const mockFn2 = jest.fn().mockResolvedValue('second')

        const { result, rerender } = renderHook(
            ({ fn }) => useAsyncCallback(fn, [fn]),
            {
                initialProps: { fn: mockFn1 },
            },
        )

        // Call with first function
        await act(async () => {
            await result.current[0]()
        })

        expect(mockFn1).toHaveBeenCalledTimes(1)
        expect(mockFn2).toHaveBeenCalledTimes(0)

        // Update to second function
        rerender({ fn: mockFn2 })

        // Call with second function
        await act(async () => {
            await result.current[0]()
        })

        expect(mockFn1).toHaveBeenCalledTimes(1)
        expect(mockFn2).toHaveBeenCalledTimes(1)
    })

    it('allows new execution after previous completes', async () => {
        const mockFn = jest.fn().mockResolvedValue(undefined)
        const { result } = renderHook(() => useAsyncCallback(mockFn, []))

        const [callback] = result.current

        // First execution
        await act(async () => {
            await callback()
        })

        expect(mockFn).toHaveBeenCalledTimes(1)

        // Second execution (after first completes)
        await act(async () => {
            await callback()
        })

        expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('blocks executions while first is in progress', async () => {
        // Use a slower mock to ensure we can test concurrent calls
        const mockFn = jest.fn(
            () => new Promise(resolve => setTimeout(resolve, 50)),
        )
        const { result } = renderHook(() => useAsyncCallback(mockFn, []))

        const [callback] = result.current

        // Start first execution
        const firstCall = callback()

        // Try to execute again immediately while first is in progress
        callback()
        callback()

        // Should still only have one execution started
        expect(mockFn).toHaveBeenCalledTimes(1)

        // Wait for first to complete
        await act(async () => {
            await firstCall
        })

        // Now new executions should be allowed
        await act(async () => {
            await callback()
        })

        expect(mockFn).toHaveBeenCalledTimes(2)
    })
})
