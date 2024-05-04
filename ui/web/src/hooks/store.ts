import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux'

import type { AppState, AppDispatch } from '../state/store'

/**
 * Provides a `dispatch` function that allows you to dispatch redux actions.
 */
export const useAppDispatch: () => AppDispatch = useDispatch

/**
 * Provides application state from redux, given a selector.
 */
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector
