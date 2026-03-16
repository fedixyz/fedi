import { act, waitFor } from '@testing-library/react'

import { useNuxStep } from '../../../hooks/nux'
import { setupStore } from '../../../redux'
import { completeNuxStep } from '../../../redux/nux'
import { renderHookWithState } from '../../utils/render'

describe('common/hooks/nux', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()
    })

    describe('useNuxStep', () => {
        it('should return false for an incomplete step', () => {
            const { result } = renderHookWithState(
                () => useNuxStep('hasViewedMemberQr'),
                store,
            )

            const [isComplete] = result.current
            expect(isComplete).toBe(false)
        })

        it('should return true for a previously completed step', async () => {
            const { result } = renderHookWithState(
                () => useNuxStep('hasOpenedNewChat'),
                store,
            )

            const [, completeStep] = result.current
            act(() => {
                completeStep()
            })

            await waitFor(() => {
                const [isComplete] = result.current
                expect(isComplete).toBe(true)
            })
        })

        it('should mark a step as completed when completeStep is called', async () => {
            const { result } = renderHookWithState(
                () => useNuxStep('hasPerformedPersonalBackup'),
                store,
            )

            const [isComplete, completeStep] = result.current
            expect(isComplete).toBe(false)

            act(() => {
                completeStep()
            })

            await waitFor(() => {
                const [isCompleteChanged] = result.current
                expect(isCompleteChanged).toBe(true)
            })
        })

        it('should not dispatch again if the step is already completed', async () => {
            const { result } = renderHookWithState(
                () => useNuxStep('hasSeenMultispendIntro'),
                store,
            )

            // Complete the step via the hook callback
            act(() => {
                const [, completeStep] = result.current
                completeStep()
            })

            await waitFor(() => {
                const [isComplete] = result.current
                expect(isComplete).toBe(true)
            })

            // Now spy on dispatch and call completeStep again
            const dispatchSpy = jest.spyOn(store, 'dispatch')

            act(() => {
                const [, completeStep] = result.current
                completeStep()
            })

            const nuxDispatches = dispatchSpy.mock.calls.filter(([action]) =>
                completeNuxStep.match(action),
            )
            expect(nuxDispatches).toHaveLength(0)
        })

        it('should work independently for different steps', async () => {
            const { result: result1 } = renderHookWithState(
                () => useNuxStep('hasViewedMemberQr'),
                store,
            )
            const { result: result2 } = renderHookWithState(
                () => useNuxStep('hasOpenedNewChat'),
                store,
            )

            act(() => {
                const [, completeStep] = result1.current
                completeStep()
            })

            await waitFor(() => {
                const [isComplete1] = result1.current
                const [isComplete2] = result2.current
                expect(isComplete1).toBe(true)
                expect(isComplete2).toBe(false)
            })
        })
    })
})
