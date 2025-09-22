import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useIsStabilityPoolEnabledByFederation } from '@fedi/common/hooks/federation'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectFederationBalance,
    selectMaxStableBalanceSats,
    selectShouldShowStablePaymentAddress,
    selectStableBalance,
    selectStableBalancePending,
    selectStableBalanceSats,
    setPayFromFederationId,
} from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import WalletButtons from '../../feature/wallet/WalletButtons'
import { BubbleCard } from '../../ui/BubbleView'
import StabilityWalletBalance from './StabilityWalletBalance'
import StabilityWalletTitle from './StabilityWalletTitle'

type Props = {
    federation: LoadedFederation
    expanded: boolean
    setExpandedWalletId: (id: string | null) => void
}

const StabilityWallet: React.FC<Props> = ({
    federation,
    expanded,
    setExpandedWalletId,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const dispatch = useAppDispatch()
    const toast = useToast()

    useMonitorStabilityPool(federation.id)

    const shouldShowStablePaymentAddress = useAppSelector(s =>
        selectShouldShowStablePaymentAddress(s, federation.id),
    )
    const stabilityPoolDisabledByFederation =
        !useIsStabilityPoolEnabledByFederation(federation.id)
    const stableBalance = useAppSelector(s =>
        selectStableBalance(s, federation.id),
    )
    const stableBalanceSats = useAppSelector(s =>
        selectStableBalanceSats(s, federation.id),
    )
    const stableBalancePending = useAppSelector(s =>
        selectStableBalancePending(s, federation.id),
    )
    const maxStableBalanceSats = useAppSelector(s =>
        selectMaxStableBalanceSats(s, federation.id),
    )
    const balance = useAppSelector(s =>
        selectFederationBalance(s, federation.id),
    )

    const style = styles(theme)

    const handleDeposit = () => {
        if (stabilityPoolDisabledByFederation) {
            toast.show({
                content: t(
                    'feature.stabilitypool.deposits-disabled-by-federation',
                ),
                status: 'error',
            })
        } else if (
            maxStableBalanceSats &&
            stableBalanceSats > maxStableBalanceSats
        ) {
            toast.show({
                content: t('feature.stabilitypool.max-stable-balance-amount'),
                status: 'error',
            })
        } else if (stableBalancePending < 0) {
            toast.show({
                content: t('feature.stabilitypool.pending-withdrawal-blocking'),
                status: 'error',
            })
        } else {
            dispatch(setPayFromFederationId(federation.id))
            navigation.navigate('StabilityDeposit', {
                federationId: federation.id,
            })
        }
    }

    const handleWithdraw = () => {
        if (stableBalancePending < 0) {
            toast.show({
                content: t('feature.stabilitypool.pending-withdrawal-blocking'),
                status: 'error',
            })
        } else if (shouldShowStablePaymentAddress) {
            // use new transfer flow is feature flag is on
            dispatch(setPayFromFederationId(federation.id))
            navigation.navigate('StabilityTransfer', {
                federationId: federation.id,
            })
        } else {
            dispatch(setPayFromFederationId(federation.id))
            navigation.navigate('StabilityWithdraw', {
                federationId: federation.id,
            })
        }
    }

    const handlePress = () => {
        if (!expanded) {
            setExpandedWalletId(federation.id)
        }
    }

    return (
        <Pressable onPress={handlePress}>
            <BubbleCard
                gradientColors={[...fediTheme.dayLinearGradient]}
                containerStyle={style.card}>
                <View style={style.header}>
                    {/* Icon, title, and chevron grouped together */}
                    <StabilityWalletTitle federationId={federation.id} />
                    {/* Balance on the right */}
                    <StabilityWalletBalance federationId={federation.id} />
                </View>

                <WalletButtons
                    expanded={expanded}
                    federation={federation}
                    incoming={{
                        onPress: handleDeposit,
                        // if stable payment address is available, we don't need to disable based on ecash balance since the user can receive stable balance directly from others via transfers
                        disabled: shouldShowStablePaymentAddress
                            ? false
                            : balance === 0,
                    }}
                    outgoing={{
                        onPress: handleWithdraw,
                        disabled:
                            stableBalance === 0 && stableBalancePending === 0,
                    }}
                    history={{
                        onPress: () =>
                            navigation.navigate('StabilityHistory', {
                                federationId: federation.id,
                            }),
                    }}
                />
            </BubbleCard>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.colors.lightGrey,
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        /** Allow the title group to shrink so the balance never gets clipped */
        leftGroup: {
            minWidth: 0,
        },
        buttons: {
            // marginTop: theme.spacing.lg,
        },
        chevron: {
            left: -58, // align with title text; matches placeholder offset
        },
    })

export default StabilityWallet
