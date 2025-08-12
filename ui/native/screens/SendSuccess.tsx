import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { selectShouldRateFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import RateFederationOverlay from '../components/feature/federations/RateFederationOverlay'
import Success from '../components/ui/Success'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'SendSuccess'>

const SendSuccess: React.FC<Props> = ({ route }: Props) => {
    const { amount, unit } = route.params

    const [showRateFederation, setShowRateFederation] = useState(false)
    const navigation = useNavigation()
    const { t } = useTranslation()
    const shouldRateFederation = useAppSelector(s =>
        selectShouldRateFederation(s),
    )

    return (
        <>
            <Success
                message={
                    <>
                        <Text h2>{t('feature.send.you-sent')}</Text>
                        <Text h2>
                            {`${amountUtils.formatNumber(
                                amountUtils.msatToSat(amount),
                            )} ${unit.toUpperCase()}`}
                        </Text>
                    </>
                }
                button={
                    <Button
                        title={t('words.done')}
                        onPress={() => {
                            if (shouldRateFederation) {
                                setShowRateFederation(true)
                            } else {
                                navigation.navigate('TabsNavigator')
                            }
                        }}
                    />
                }
            />
            {shouldRateFederation && (
                <RateFederationOverlay
                    show={showRateFederation}
                    onDismiss={() => {
                        setShowRateFederation(false)
                        navigation.navigate('TabsNavigator')
                    }}
                />
            )}
        </>
    )
}

export default SendSuccess
