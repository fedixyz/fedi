import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'

import type { AppDispatch, AppState } from '../state/store'

/**
 * Provides a `dispatch` function that allows you to dispatch redux actions.
 */
export const useAppDispatch: () => AppDispatch = useDispatch

/**
 * Provides application state from redux, given a selector.
 */
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector
