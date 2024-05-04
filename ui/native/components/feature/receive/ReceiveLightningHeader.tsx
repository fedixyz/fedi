import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'

const ReceiveLightningHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const { routes } = navigation.getState()

    // Show back button only if we can go back
    const shouldShowBack = navigation.canGoBack()

    // Show close button only if back button would not take us to TabsNavigator
    const shouldShowClose = routes[routes.length - 2]?.name !== 'TabsNavigator'

    return (
        <Header
            backButton={shouldShowBack}
            closeButton={shouldShowClose}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.receive.add-amount')}
                </Text>
            }
        />
    )
}

export default ReceiveLightningHeader
