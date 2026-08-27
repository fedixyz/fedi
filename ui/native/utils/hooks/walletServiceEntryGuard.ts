import { useNavigation } from '@react-navigation/native'
import { useEffect } from 'react'

import { selectWalletServiceFlowStatus } from '@fedi/common/redux'

import { useAppSelector } from '../../state/hooks'
import { reset } from '../../state/navigation'
import { NavigationHook } from '../../types/navigation'

/**
 * Sends the user to the screen that matches the live formation, from anywhere
 * in the pre-payment part of the creation flow.
 *
 * `useMonitorFiClient` holds a `fiClientSubscribe` stream for the life of the
 * app, so redux already knows about a formation the moment it exists. The gap
 * this closes is consumption, not supply: `CreateWalletService` and
 * `ConfirmWalletService` used to sit on top of a live formation and ignore it,
 * then have their quote RPC rejected `busy` — leaving "Another Wallet Service
 * operation is in progress" over a picker the user could no longer use.
 *
 * The effect is live rather than focus-only, which is what lets one mechanism
 * cover all three cases: entering with a formation already running, a formation
 * starting while the screen is focused, and the `fiClientPayAndCreate` error
 * reply arriving after the stream has already flipped to `inProgress` — the
 * case where the sats are gone and "please try again" would invite a second
 * payment.
 *
 * `unknown` never routes: the first status is still in flight, and guessing
 * would bounce the user off a screen they legitimately opened.
 */
export function useWalletServiceEntryGuard() {
    const navigation = useNavigation<NavigationHook>()
    const flowStatus = useAppSelector(selectWalletServiceFlowStatus)

    useEffect(() => {
        if (flowStatus === 'inProgress') {
            navigation.dispatch(reset('WalletServiceProgress'))
        } else if (flowStatus === 'formed') {
            navigation.dispatch(reset('WalletServiceDashboard'))
        }
    }, [flowStatus, navigation])

    /**
     * True while this screen is on its way out. Callers gate their quote RPC on
     * it: the bridge rejects a quote as `busy` whenever a formation is live, and
     * the resulting toast would land on a screen the user is already leaving.
     */
    return flowStatus === 'inProgress' || flowStatus === 'formed'
}
