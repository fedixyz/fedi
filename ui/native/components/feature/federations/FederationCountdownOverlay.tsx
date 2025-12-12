import { Text } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'

import { LoadedFederation } from '../../../types'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'
import FederationPopupCountdown from './FederationPopupCountdown'

function FederationCountdownOverlay({
    show,
    onBackdropPress,
    federation,
}: {
    show: boolean
    onBackdropPress: () => void
    federation: LoadedFederation
}) {
    const { t } = useTranslation()

    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})

    if (!popupInfo) return

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onBackdropPress}
            contents={{
                title: t('feature.federations.federation-expiration'),
                body: (
                    <Column gap="md">
                        <FederationPopupCountdown federation={federation} />
                        {popupInfo.countdownMessage && (
                            <Text>{popupInfo.countdownMessage}</Text>
                        )}
                    </Column>
                ),
            }}
        />
    )
}

export default FederationCountdownOverlay
