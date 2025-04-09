import { selectIsInternetUnreachable } from '../redux'
import { useCommonSelector } from './redux'

/**
 * Hook to check if the Internet Unreachable Badge is currently shown.
 * @returns {boolean} Whether the badge is visible.
 */
export function useIsInternetUnreachable() {
    return useCommonSelector(selectIsInternetUnreachable)
}
