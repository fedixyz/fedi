import { RouteProp, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
    selectPaymentFederation,
    selectStabilityPoolVersion,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'

type StabilitySendRouteProp = RouteProp<RootStackParamList, 'StabilitySend'>

const StabilitySendHeader: React.FC = () => {
    const { t } = useTranslation()
    const route = useRoute<StabilitySendRouteProp>()
    const paymentFederation = useAppSelector(selectPaymentFederation)

    const federationId = paymentFederation?.id ?? route.params.federationId
    const stabilityPoolVersion = useAppSelector(s =>
        selectStabilityPoolVersion(s, federationId),
    )

    const title =
        stabilityPoolVersion === 1
            ? t('feature.stabilitypool.send-to-my-btc-wallet')
            : t('phrases.send-usd')

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {title}
                </Text>
            }
        />
    )
}

export default StabilitySendHeader
