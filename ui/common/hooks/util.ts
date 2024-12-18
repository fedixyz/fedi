import {
    DependencyList,
    EffectCallback,
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
    const timerRef = useRef<NodeJS.Timeout>()

    useEffect(() => {
        timerRef.current = setTimeout(() => setDebouncedValue(value), delay)

        return () => {
            clearTimeout(timerRef.current)
        }
    }, [value, delay])

    return debouncedValue
}

export const useDebouncePress = (onPress: () => void, delay = 200) => {
    const timerRef = useRef<NodeJS.Timeout>()
    return () => {
        if (!timerRef.current) {
            onPress()
            timerRef.current = setTimeout(() => {
                timerRef.current = undefined
            }, delay)
        }
    }
}
