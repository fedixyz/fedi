import {
    completeNuxStep,
    resetNuxStep,
    resetNuxSteps,
    setupStore,
} from '../../../redux'

describe('nuxSlice', () => {
    it('should start with the wallet service tour unseen', () => {
        const store = setupStore()

        expect(store.getState().nux.steps.hasSeenWalletServiceTour).toBe(false)
    })

    it('should mark the wallet service tour seen', () => {
        const store = setupStore()

        store.dispatch(completeNuxStep('hasSeenWalletServiceTour'))

        expect(store.getState().nux.steps.hasSeenWalletServiceTour).toBe(true)
    })

    describe('resetNuxStep', () => {
        it('should clear only the step it names', () => {
            const store = setupStore()
            store.dispatch(completeNuxStep('hasSeenWalletServiceTour'))
            store.dispatch(completeNuxStep('hasViewedMemberQr'))

            store.dispatch(resetNuxStep('hasSeenWalletServiceTour'))

            expect(store.getState().nux.steps.hasSeenWalletServiceTour).toBe(
                false,
            )
            expect(store.getState().nux.steps.hasViewedMemberQr).toBe(true)
        })

        it('should leave an already-unseen step unseen', () => {
            const store = setupStore()

            store.dispatch(resetNuxStep('hasSeenWalletServiceTour'))

            expect(store.getState().nux.steps.hasSeenWalletServiceTour).toBe(
                false,
            )
        })
    })

    it('should clear every step on a full reset', () => {
        const store = setupStore()
        store.dispatch(completeNuxStep('hasSeenWalletServiceTour'))
        store.dispatch(completeNuxStep('hasViewedMemberQr'))

        store.dispatch(resetNuxSteps())

        expect(store.getState().nux.steps.hasSeenWalletServiceTour).toBe(false)
        expect(store.getState().nux.steps.hasViewedMemberQr).toBe(false)
    })
})
