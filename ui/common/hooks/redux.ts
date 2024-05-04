import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux'

import { CommonDispatch, CommonState } from '../redux'

/**
 * Provides a `dispatch` function that allows you to dispatch common redux actions.
 */
export const useCommonDispatch: () => CommonDispatch = useDispatch

/**
 * Provides common state from redux, given a selector.
 */
export const useCommonSelector: TypedUseSelectorHook<CommonState> = useSelector
