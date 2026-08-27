import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBalance } from '@fedi/common/hooks/amount'
import { useWalletFederationSelection } from '@fedi/common/hooks/federation'

import { FederationLogo } from '../federations/FederationLogo'
import { WalletServiceFederationRow } from './WalletServiceFederationRow'
import { WalletServicePayerSheet } from './WalletServicePayerSheet'

/** The wallet the setup cost is charged to, on story 04. */
export const WalletServicePayerRow: React.FC<{
    allowedFederationIds: string[]
}> = ({ allowedFederationIds }) => {
    const { t } = useTranslation()
    const [isPickerOpen, setIsPickerOpen] = useState(false)

    const {
        federations,
        visibleFederations,
        selectedFederation,
        selectFederation,
    } = useWalletFederationSelection(allowedFederationIds)

    const { formattedBalance } = useBalance(t, selectedFederation?.id ?? '')

    if (federations.length === 0 || visibleFederations.length === 0) return null

    // one admitted wallet leaves nothing to pick between, so the row stops
    // advertising a choice it cannot offer
    const isLockedToSingle = visibleFederations.length === 1

    return (
        <>
            <WalletServiceFederationRow
                testID="wallet-service-payer-row"
                adornment={
                    <FederationLogo federation={selectedFederation} size={40} />
                }
                name={selectedFederation?.name ?? ''}
                detail={formattedBalance}
                onPress={
                    isLockedToSingle ? undefined : () => setIsPickerOpen(true)
                }
            />

            <WalletServicePayerSheet
                show={isPickerOpen}
                onDismiss={() => setIsPickerOpen(false)}
                allowedFederationIds={allowedFederationIds}
                onSelect={federation => {
                    selectFederation(federation.id)
                    setIsPickerOpen(false)
                }}
            />
        </>
    )
}
