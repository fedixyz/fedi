import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { selectCurrency } from '@fedi/common/redux'
import {
    changeAuthenticatedGuardian,
    leaveFederation,
} from '@fedi/common/redux/federation'
import {
    selectStableBalance,
    selectStableBalancePending,
} from '@fedi/common/redux/wallet'
import { LoadedFederationListItem } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../../bridge'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import { RootStackParamList } from '../../types/navigation'

export const useNativeLeaveFederation = (
    navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>,
) => {
    const toast = useToast()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const stableBalance = useAppSelector(selectStableBalance)
    const pendingStableBalance = useAppSelector(selectStableBalancePending)
    const currency = useAppSelector(selectCurrency)

    const resetGuardiansState = useCallback(() => {
        dispatch(changeAuthenticatedGuardian(null))
    }, [dispatch])

    // FIXME: this needs some kind of loading state
    // TODO: this should be an thunkified action creator
    const handleLeaveFederation = useCallback(
        async (federation: LoadedFederationListItem) => {
            try {
                // FIXME: currently this specific order of operations fixes a
                // bug where the username would get stuck in storage and when
                // rejoining the federation, the user cannot create an new
                // username with the fresh seed and the stored username fails
                // to authenticate so chat ends up totally broken
                // However it's not safe because if leaveFederation fails, then
                // we are resetting state too early and could corrupt things
                // Need to investigate further why running leaveFederation first
                // causes this bug
                resetGuardiansState()

                await dispatch(
                    leaveFederation({
                        fedimint,
                        federationId: federation.id,
                    }),
                ).unwrap()

                navigation.replace('Initializing')
            } catch (e) {
                toast.show({
                    content: t('errors.failed-to-leave-federation'),
                    status: 'error',
                })
            }
        },
        [dispatch, navigation, resetGuardiansState, toast, t],
    )

    // TODO: Implement leaving no-wallet communities
    const confirmLeaveFederation = useCallback(
        (federation: LoadedFederationListItem) => {
            const alertTitle = `${t(
                'feature.federations.leave-federation',
            )} - ${federation.name}`

            // Don't allow leaving if stable balance exists
            if (stableBalance > 0) {
                Alert.alert(
                    alertTitle,
                    t(
                        'feature.federations.leave-federation-withdraw-stable-first',
                        { currency },
                    ),
                    [
                        {
                            text: t('words.okay'),
                        },
                    ],
                )
            }

            // Don't allow leaving if stable pending balance exists
            else if (pendingStableBalance > 0) {
                Alert.alert(
                    alertTitle,
                    t(
                        'feature.federations.leave-federation-withdraw-pending-stable-first',
                        { currency },
                    ),
                    [
                        {
                            text: t('words.okay'),
                        },
                    ],
                )
            }

            // Don't allow leaving sats balance is greater than 100
            else if (
                federation.hasWallet &&
                amountUtils.msatToSat(federation.balance) > 100
            ) {
                Alert.alert(
                    alertTitle,
                    t('feature.federations.leave-federation-withdraw-first'),
                    [
                        {
                            text: t('words.okay'),
                        },
                    ],
                )
            } else {
                Alert.alert(
                    alertTitle,
                    t('feature.federations.leave-federation-confirmation'),
                    [
                        {
                            text: t('words.no'),
                        },
                        {
                            text: t('words.yes'),
                            onPress: () => handleLeaveFederation(federation),
                        },
                    ],
                )
            }
        },
        [
            stableBalance,
            pendingStableBalance,
            handleLeaveFederation,
            currency,
            t,
        ],
    )

    return { confirmLeaveFederation }
}
