import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { LoadedFederation } from '@fedi/common/types'

import { Dialog } from '../Dialog'
import { Column } from '../Flex'
import { Text } from '../Text'
import FederationPopupCountdown from './FederationPopupCountdown'

function FederationCountdownDialog({
    open,
    onOpenChange,
    federation,
}: {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
    federation: LoadedFederation
}) {
    const { t } = useTranslation()

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    if (!popupInfo) return

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('feature.federations.federation-expiration')}
            mobileDismiss="overlay">
            <Column gap="md">
                <FederationPopupCountdown federation={federation} />
                {popupInfo.countdownMessage && (
                    <Text>{popupInfo.countdownMessage}</Text>
                )}
            </Column>
        </Dialog>
    )
}

export default FederationCountdownDialog
