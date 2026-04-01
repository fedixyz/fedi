import { RouteProp, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectStabilityPoolVersion } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'

type StabilityReceiveRouteProp = RouteProp<
    RootStackParamList,
    'StabilityReceive'
>

const StabilityReceiveHeader: React.FC = () => {
    const { t } = useTranslation()
    const route = useRoute<StabilityReceiveRouteProp>()
    const stabilityPoolVersion = useAppSelector(s =>
        selectStabilityPoolVersion(s, route.params.federationId),
    )

    const title =
        stabilityPoolVersion === 1
            ? t('feature.stabilitypool.receive-from-my-btc-wallet')
            : t('phrases.receive-usd')

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

export default StabilityReceiveHeader
