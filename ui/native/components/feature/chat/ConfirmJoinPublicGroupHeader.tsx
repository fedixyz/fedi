import { useNavigation } from '@react-navigation/native'
import React from 'react'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'

const ConfirmJoinPublicGroupHeader: React.FC = () => {
    const navigation = useNavigation<NavigationHook>()
    return (
        <Header
            closeButton
            onClose={() => {
                if (navigation.canGoBack()) navigation.goBack()
                // If we can't go back, navigate home
                else
                    navigation.navigate('TabsNavigator', {
                        initialRouteName: 'Chat',
                    })
            }}
        />
    )
}

export default ConfirmJoinPublicGroupHeader
