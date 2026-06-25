import {
    dismissForSession,
    reachedThresholds,
    resetNuxSteps,
    setCountdownForTesting,
    setCountdownStartedAt,
    setupStore,
} from '../../../redux'
import { loadFromStorage } from '../../../redux/storage'

describe('personalBackupReminderSlice', () => {
    it('should set the countdown start timestamp', () => {
        const store = setupStore()

        store.dispatch(setCountdownStartedAt(1_700_000_000_000))

        expect(store.getState().personalBackupReminder.countdownStartedAt).toBe(
            1_700_000_000_000,
        )
    })

    it('should mark dismissed for the session', () => {
        const store = setupStore()

        store.dispatch(dismissForSession())

        expect(
            store.getState().personalBackupReminder.dismissedThisSession,
        ).toBe(true)
    })

    it('should latch the reached-thresholds flag', () => {
        const store = setupStore()

        store.dispatch(reachedThresholds())

        expect(
            store.getState().personalBackupReminder.hasReachedThresholds,
        ).toBe(true)
    })

    describe('setCountdownForTesting (dev-only)', () => {
        it('should set the countdown and clear all suppressor/force flags', () => {
            const store = setupStore()
            store.dispatch(dismissForSession())
            store.dispatch(reachedThresholds())

            store.dispatch(setCountdownForTesting(1_700_000_000_000))

            expect(store.getState().personalBackupReminder).toEqual({
                countdownStartedAt: 1_700_000_000_000,
                dismissedThisSession: false,
                hasReachedThresholds: false,
            })
        })

        it('should null the countdown when passed null', () => {
            const store = setupStore()

            store.dispatch(setCountdownForTesting(null))

            expect(
                store.getState().personalBackupReminder.countdownStartedAt,
            ).toBeNull()
        })
    })

    it('should reset alongside resetNuxSteps so the reminder re-arms', () => {
        const store = setupStore()
        store.dispatch(setCountdownStartedAt(1_700_000_000_000))
        store.dispatch(dismissForSession())
        store.dispatch(reachedThresholds())

        store.dispatch(resetNuxSteps())

        expect(store.getState().personalBackupReminder).toEqual({
            countdownStartedAt: null,
            dismissedThisSession: false,
            hasReachedThresholds: false,
        })
    })

    describe('hydration from loadFromStorage', () => {
        it('should hydrate persisted fields from the nested storage shape', () => {
            const store = setupStore()

            store.dispatch(
                loadFromStorage.fulfilled(
                    {
                        nuxSteps: {},
                        personalBackupReminder: {
                            countdownStartedAt: 42,
                            hasReachedThresholds: true,
                        },
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any,
                    'requestId',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {} as any,
                ),
            )

            expect(store.getState().personalBackupReminder).toEqual({
                countdownStartedAt: 42,
                dismissedThisSession: false,
                hasReachedThresholds: true,
            })
        })

        it('should leave defaults when there is no persisted state', () => {
            const store = setupStore()
            const defaults = store.getState().personalBackupReminder

            store.dispatch(
                loadFromStorage.fulfilled(
                    null,
                    'requestId',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {} as any,
                ),
            )

            expect(store.getState().personalBackupReminder).toEqual(defaults)
        })
    })
})
