import React from 'react'
import { useTranslation } from 'react-i18next'

import { type WalletServiceLightningStage } from '@fedi/common/redux'

import { Column } from '../../ui/Flex'
import { LightningAttachProgress } from './LightningAttachProgress'
import { LightningProviderBanner } from './LightningProviderBanner'

/**
 * Replaces {@link LightningProviderPicker} rather than sitting beside it.
 *
 * Which state a host is in is never stored — it is read from the attach, which
 * is durable in the bridge and outlives every screen, so a flag set on a press
 * would be wrong after a relaunch and on the other host.
 */
export const LightningAttaching: React.FC<{
    stage: WalletServiceLightningStage
    testID?: string
}> = ({ stage, testID }) => {
    const { t } = useTranslation()

    return (
        <Column gap="lg" fullWidth testID={testID}>
            <LightningProviderBanner
                banner={{
                    tone: 'warn',
                    message: t(
                        'feature.wallet-service.lightning-takes-a-while',
                    ),
                }}
                testID="lightning-banner"
            />
            <LightningAttachProgress stage={stage} />
        </Column>
    )
}
