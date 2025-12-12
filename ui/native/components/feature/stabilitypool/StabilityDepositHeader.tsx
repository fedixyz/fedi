import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectShouldShowStablePaymentAddress } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook, RootStackParamList } from '../../../types/navigation'
import { Row } from '../../ui/Flex'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import { StabilityInfoIcon } from './StabilityInfoIcon'

type StabilityDepositRouteProp = RouteProp<
    RootStackParamList,
    'StabilityDeposit'
>
const StabilityDepositHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const route = useRoute<StabilityDepositRouteProp>()
    const { federationId } = route.params
    const shouldShowStablePaymentAddress = useAppSelector(s =>
        selectShouldShowStablePaymentAddress(s, federationId),
    )

    return (
        <>
            <Header
                backButton
                headerCenter={<Text bold>{t('words.deposit')}</Text>}
                headerRight={
                    <Row gap="md">
                        <StabilityInfoIcon />
                        {shouldShowStablePaymentAddress ? (
                            <PressableIcon
                                svgName="Qr"
                                onPress={() =>
                                    navigation.navigate('ReceiveStabilityQr', {
                                        federationId,
                                    })
                                }
                            />
                        ) : null}
                    </Row>
                }
            />
        </>
    )
}

export default StabilityDepositHeader
