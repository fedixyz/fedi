import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'

type HelpCentreRouteProp = RouteProp<RootStackParamList, 'HelpCentre'>

const HelpCentreHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation()
    const route = useRoute<HelpCentreRouteProp>()

    const fromOnboarding = route.params?.fromOnboarding ?? false

    const handleClose = () => {
        if (fromOnboarding) {
            navigation.navigate('Splash')
        } else {
            navigation.goBack()
        }
    }

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.support.title')}
                </Text>
            }
            onClose={handleClose}
            onBackButtonPress={handleClose}
            closeButton
        />
    )
}

export default HelpCentreHeader
