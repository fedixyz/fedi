import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { selectShouldRateFederation } from '@fedi/common/redux'

import RateFederationOverlay from '../components/feature/federations/RateFederationOverlay'
import { Column } from '../components/ui/Flex'
import SuccessShield from '../components/ui/SuccessShield'
import { useAppSelector } from '../state/hooks'
import { resetToWallets } from '../state/navigation'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SendSuccessShield'
>

const SendSuccessShield: React.FC<Props> = ({ route }: Props) => {
    const { title, formattedAmount, description } = route.params

    const [showRateFederation, setShowRateFederation] = useState(false)
    const navigation = useNavigation()
    const { t } = useTranslation()
    const shouldRateFederation = useAppSelector(s =>
        selectShouldRateFederation(s),
    )
    const { theme } = useTheme()

    return (
        <>
            <SuccessShield
                message={
                    <Column center gap="md">
                        <Text h2 bolder center>
                            {title}
                        </Text>
                        {formattedAmount && (
                            <Text bolder center>
                                {formattedAmount}
                            </Text>
                        )}
                        {description && (
                            <Text color={theme.colors.darkGrey} center>
                                {description}
                            </Text>
                        )}
                    </Column>
                }
                button={
                    <Button
                        title={t('words.ok')}
                        onPress={() => {
                            if (shouldRateFederation) {
                                setShowRateFederation(true)
                            } else {
                                navigation.dispatch(resetToWallets())
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
                        navigation.navigate('TabsNavigator', {
                            initialRouteName: 'Federations',
                        })
                    }}
                />
            )}
        </>
    )
}

export default SendSuccessShield
