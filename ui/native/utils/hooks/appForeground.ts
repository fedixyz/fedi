import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

/**
 * Separate from `useAppIsInForeground`, which also calls
 * `fedimint.onAppForeground()` — using that here would refresh communities and
 * feature flags twice per resume.
 */
export function useIsAppForeground(): boolean {
    const [isForeground, setIsForeground] = useState(
        AppState.currentState === 'active',
    )

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextState =>
            setIsForeground(nextState === 'active'),
        )
        return () => subscription.remove()
    }, [])

    return isForeground
}
