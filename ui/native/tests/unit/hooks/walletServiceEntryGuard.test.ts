import { act } from '@testing-library/react-native'

import { setFiStatus, setupStore } from '@fedi/common/redux'
import { RpcFiFormationSnapshot } from '@fedi/common/types/bindings'

import { reset } from '../../../state/navigation'
import { useWalletServiceEntryGuard } from '../../../utils/hooks/walletServiceEntryGuard'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderHookWithProviders } from '../../utils/render'

const makeFormation = (
    phase: RpcFiFormationSnapshot['phase'],
    { paymentOutputsStarted = true } = {},
): RpcFiFormationSnapshot => ({
    formationId: 'formation-1',
    phase,
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted,
    milestones: {
        ecashSent: false,
        guardiansConfirmed: false,
        walletServiceCreated: false,
    },
    inviteCode: null,
    lastError: null,
})

describe('utils/hooks/walletServiceEntryGuard', () => {
    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should stay put while the first status is still in flight', () => {
        const { result } = renderHookWithProviders(() =>
            useWalletServiceEntryGuard(),
        )

        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
        expect(result.current).toBe(false)
    })

    it('should stay put when no formation exists', () => {
        const store = setupStore()
        store.dispatch(setFiStatus({ type: 'idle' }))

        const { result } = renderHookWithProviders(
            () => useWalletServiceEntryGuard(),
            { store },
        )

        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
        expect(result.current).toBe(false)
    })

    it('should send a live formation to the progress screen', () => {
        const store = setupStore()
        store.dispatch(
            setFiStatus({
                type: 'formation',
                formation: makeFormation('acquiringSeats'),
            }),
        )

        const { result } = renderHookWithProviders(
            () => useWalletServiceEntryGuard(),
            { store },
        )

        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            reset('WalletServiceProgress'),
        )
        expect(result.current).toBe(true)
    })

    // the record is written before the payment is attempted, and a failed
    // payment wipes it back to idle, so routing on it would strand the user
    it('should stay put while a formation is not yet committed', () => {
        const store = setupStore()
        store.dispatch(
            setFiStatus({
                type: 'formation',
                formation: makeFormation('acquiringSeats', {
                    paymentOutputsStarted: false,
                }),
            }),
        )

        const { result } = renderHookWithProviders(
            () => useWalletServiceEntryGuard(),
            { store },
        )

        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
        expect(result.current).toBe(true)
    })

    it('should send a finished formation to the dashboard', () => {
        const store = setupStore()
        store.dispatch(
            setFiStatus({
                type: 'formation',
                formation: makeFormation('formed'),
            }),
        )

        const { result } = renderHookWithProviders(
            () => useWalletServiceEntryGuard(),
            { store },
        )

        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            reset('WalletServiceDashboard'),
        )
        expect(result.current).toBe(true)
    })

    // the payAndCreate error reply can land after the stream has already
    // flipped to inProgress
    it('should route away when a formation starts under a screen already open', () => {
        const store = setupStore()

        const { result } = renderHookWithProviders(
            () => useWalletServiceEntryGuard(),
            { store },
        )
        expect(result.current).toBe(false)

        act(() => {
            store.dispatch(
                setFiStatus({
                    type: 'formation',
                    formation: makeFormation('acquiringSeats'),
                }),
            )
        })

        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            reset('WalletServiceProgress'),
        )
        expect(result.current).toBe(true)
    })
})
