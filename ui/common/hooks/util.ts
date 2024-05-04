import { DependencyList, EffectCallback, useEffect, useRef } from 'react'

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
