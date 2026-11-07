import type { i18n as I18n } from 'i18next'

import { initializeCommonStore, selectToast, setupStore } from '../../../redux'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { mockStorageApi } from '../../utils/render'

describe('stabilityPoolUnfilledDepositSwept', () => {
    it('should tell the user their stable balance went back to ecash', async () => {
        const store = setupStore()
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: [],
        })
        const listeners = new Map<string, (event: unknown) => void>()
        fedimint.addListener.mockImplementation(((
            name: string,
            listener: (event: unknown) => void,
        ) => {
            listeners.set(name, listener)
            return () => listeners.delete(name)
        }) as unknown as typeof fedimint.addListener)
        const i18n = { t: (key: string) => key } as unknown as I18n

        const cleanup = initializeCommonStore({
            store,
            fedimint,
            storage: mockStorageApi,
            i18n,
        })
        expect(selectToast(store.getState())).toBeNull()

        listeners.get('stabilityPoolUnfilledDepositSwept')?.({
            amount: 500_000,
        })
        await Promise.resolve()

        expect(selectToast(store.getState())?.content).toBe(
            'feature.stabilitypool.swept-explanation',
        )

        cleanup()
        expect(listeners.has('stabilityPoolUnfilledDepositSwept')).toBe(false)
    })
})
