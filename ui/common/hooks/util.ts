import {
    DependencyList,
    EffectCallback,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'

export function useUpdatingRef<T>(value: T) {
    const ref = useRef(value)
    ref.current = value
    return ref
}

export const useDebouncedEffect = (
    effect: EffectCallback,
    deps: DependencyList,
    delay: number,
) => {
    useEffect(() => {
        const handler = setTimeout(() => effect(), delay)

        return () => clearTimeout(handler)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...(deps || []), delay])
}

export const useDebounce = <T>(value: T, delay = 1000): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)
    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined)

    useEffect(() => {
        timerRef.current = setTimeout(() => setDebouncedValue(value), delay)

        return () => {
            clearTimeout(timerRef.current)
        }
    }, [value, delay])

    return debouncedValue
}

export const useDebouncePress = (onPress: () => void, delay = 200) => {
    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined)
    return () => {
        if (!timerRef.current) {
            onPress()
            timerRef.current = setTimeout(() => {
                timerRef.current = undefined
            }, delay)
        }
    }
}

/**
 * Wraps an async callback to prevent concurrent executions using a synchronous ref guard.
 *
 * This hook solves a common React race condition: when a user rapidly triggers an async
 * action (e.g., button taps), React state updates are asynchronous, so multiple calls
 * can all see `loading=false` before React re-renders. This leads to duplicate operations.
 *
 * The hook uses `useRef` to provide a synchronous guard that updates immediately,
 * preventing subsequent calls from executing until the first completes.
 *
 * @example
 * ```typescript
 * const [handleSubmit, isSubmitting] = useAsyncCallback(async (data: FormData) => {
 *     await submitToServer(data)
 *     navigation.navigate('Success')
 * }, [navigation])
 *
 * return <Button onPress={() => handleSubmit(formData)} disabled={isSubmitting} />
 * ```
 *
 * @param callback - The async function to wrap with concurrency protection
 * @param deps - Dependency array for the callback (like useCallback)
 * @returns A tuple of [wrappedCallback, isLoading]
 *
 * @see MessageInput for usage example preventing duplicate message sends
 */
export function useAsyncCallback<
    T extends (...args: never[]) => Promise<unknown>,
>(callback: T, deps: DependencyList = []): [T, boolean] {
    const isExecutingRef = useRef(false)
    const [isLoading, setIsLoading] = useState(false)

    const wrappedCallback = useCallback(
        (async (...args: Parameters<T>) => {
            // Check synchronous ref FIRST - prevents race condition
            if (isExecutingRef.current) return

            // Set BOTH ref and state immediately
            isExecutingRef.current = true
            setIsLoading(true)

            try {
                return await callback(...args)
            } finally {
                // Always reset, even if callback throws
                isExecutingRef.current = false
                setIsLoading(false)
            }
        }) as T,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        deps,
    )

    return [wrappedCallback, isLoading]
}
