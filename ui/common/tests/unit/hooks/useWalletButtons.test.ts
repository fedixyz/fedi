import { useWalletButtons } from '../../../hooks/wallet'
import {
    fetchCurrencyPrices,
    setFederations,
    setPaymentType,
    setStabilityPoolState,
    setupStore,
} from '../../../redux'
import { MSats, UsdCents } from '../../../types'
import {
    mockFederation1,
    mockFederationWithSPV2,
} from '../../mock-data/federation'
import { renderHookWithState } from '../../utils/render'
import { createMockT } from '../../utils/setup'

const t = createMockT()

describe('useWalletButtons', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
    })

    it("should disable receive + indicate that receives are disabled when the user's bitcoin balance exceeds the federation limit", async () => {
        const federationWithMaxBalance = {
            ...mockFederation1,
            meta: {
                ...mockFederation1.meta,
                max_balance_msats: '1000000',
            },
            balance: 2000000 as MSats,
        }

        store.dispatch(setFederations([federationWithMaxBalance]))

        const { result } = renderHookWithState(
            () => useWalletButtons(t, federationWithMaxBalance.id),
            store,
        )

        expect(result.current.receiveDisabled).toBe(true)
        expect(result.current.sendDisabled).toBe(false)
        expect(result.current.disabledMessage).toBe(
            'errors.receives-have-been-disabled',
        )
    })

    it('should disable both buttons when the federation has ended', async () => {
        const endedFederation = {
            ...mockFederation1,
            meta: {
                ...mockFederation1.meta,
                popup_end_timestamp: '1',
            },
        }

        store.dispatch(setFederations([endedFederation]))

        const { result } = renderHookWithState(
            () => useWalletButtons(t, endedFederation.id),
            store,
        )

        expect(result.current.receiveDisabled).toBe(true)
        expect(result.current.sendDisabled).toBe(true)
    })

    it('should disable both buttons and indicate that recovery is in progress when the federation is recovering', async () => {
        const recoveringFederation = {
            ...mockFederation1,
            recovering: true,
        }

        store.dispatch(setFederations([recoveringFederation]))

        const { result } = renderHookWithState(
            () => useWalletButtons(t, recoveringFederation.id),
            store,
        )

        expect(result.current.receiveDisabled).toBe(true)
        expect(result.current.sendDisabled).toBe(true)
        expect(result.current.disabledMessage).toBe(
            'feature.recovery.recovery-in-progress-wallet',
        )
    })

    it('should disable both buttons and indicate that SP is blocked when the federation has a pending withdrawal', async () => {
        store.dispatch({
            type: fetchCurrencyPrices.fulfilled.type,
            payload: {
                btcUsdRate: 100000,
                fiatUsdRates: {},
            },
        })
        store.dispatch(setFederations([mockFederationWithSPV2]))
        store.dispatch(
            setStabilityPoolState({
                federationId: mockFederationWithSPV2.id,
                stabilityPoolState: {
                    locked: { btc: 0 as MSats, fiat: 0 as UsdCents },
                    staged: { btc: 0 as MSats, fiat: 0 as UsdCents },
                    idleBalance: 0 as MSats,
                    pendingUnlock: {
                        btc: 1000000 as MSats,
                        fiat: 5000 as UsdCents,
                    },
                    currCycleStartPrice: 50000,
                },
            }),
        )
        store.dispatch(setPaymentType('stable-balance'))

        const { result } = renderHookWithState(
            () => useWalletButtons(t, mockFederationWithSPV2.id),
            store,
        )

        expect(result.current.receiveDisabled).toBe(true)
        expect(result.current.sendDisabled).toBe(true)
        expect(result.current.disabledMessage).toBe(
            'feature.stabilitypool.pending-withdrawal-blocking',
        )
    })

    it('should disable send when balance is less than 1000 msats', async () => {
        const lowBalanceFederation = {
            ...mockFederation1,
            balance: 500 as MSats,
        }

        store.dispatch(setFederations([lowBalanceFederation]))

        const { result } = renderHookWithState(
            () => useWalletButtons(t, lowBalanceFederation.id),
            store,
        )

        expect(result.current.sendDisabled).toBe(true)
        expect(result.current.receiveDisabled).toBe(false)
    })
})
