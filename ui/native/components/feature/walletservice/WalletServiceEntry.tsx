import { useNavigation } from '@react-navigation/native'
import { Button } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { selectWalletServiceFlowStatus } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import type { NavigationHook } from '../../../types/navigation'
import { WalletServiceFooter } from '../../ui/WalletServiceFooter'
import { WalletServiceIntro } from './WalletServiceIntro'

/**
 * The Create tab as it behaves with the wallet service flag on.
 *
 * This owns the whole entry decision: where to send the user once they commit.
 * The hub screen above it only picks between this and the legacy create path.
 *
 * Membership of a trusted setup payment federation is deliberately *not*
 * checked here. It used to be, and a user in no such federation was shown a
 * gate that could not go forward. Per the 23 July product decision there is no
 * hindrance until the payment screen, which shows the price either way and
 * explains what is still needed.
 */
export const WalletServiceEntry: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const walletServiceFlowStatus = useAppSelector(
        selectWalletServiceFlowStatus,
    )
    // the first fi status is still in flight, so we cannot tell an existing
    // formation from none and must not route on it yet
    const isFlowStatusLoading = walletServiceFlowStatus === 'unknown'

    const handleCreate = useCallback(() => {
        if (isFlowStatusLoading) return
        if (walletServiceFlowStatus === 'formed') {
            navigation.navigate('WalletServiceDashboard')
            return
        }
        if (walletServiceFlowStatus === 'inProgress') {
            navigation.navigate('WalletServiceProgress')
            return
        }
        navigation.navigate('CreateWalletService')
    }, [isFlowStatusLoading, walletServiceFlowStatus, navigation])

    return (
        <>
            <WalletServiceIntro />
            {/* pinned below the scroll area, as the design's `.cta-bar` is */}
            <WalletServiceFooter>
                <Button
                    fullWidth
                    // a user may only ever have one Wallet Service, so once one
                    // is formed this CTA manages it rather than offering to
                    // create a second. `handleCreate` already routes to the
                    // dashboard in that state; only the label was still
                    // promising creation.
                    title={t(
                        walletServiceFlowStatus === 'formed'
                            ? 'feature.wallet-service.manage-wallet-service'
                            : 'words.create',
                    )}
                    onPress={handleCreate}
                    // disabled, never `loading`: Button swaps the title out
                    // for a spinner while loading, and the CTA has to stay
                    // readable through the startup window
                    disabled={isFlowStatusLoading}
                />
            </WalletServiceFooter>
        </>
    )
}
