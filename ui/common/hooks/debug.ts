import { useEffect, useState } from 'react'

/**
 * Intentionally triggers an error boundary. Used for testing `ErrorBoundary`.
 * Should never be left in commits or used in production.
 */
export function useTriggerErrorBoundary(shouldThrowArg?: boolean) {
    const [shouldThrow, setShouldThrow] = useState(false)

    // If no arg is passed, throw after initial render
    useEffect(() => {
        if (shouldThrowArg === undefined) {
            setShouldThrow(true)
        } else {
            setShouldThrow(shouldThrowArg)
        }
    }, [shouldThrowArg])

    if (shouldThrow && typeof window !== 'undefined') {
        throw new Error('Error triggered by useTriggerErrorBoundary')
    }
}
