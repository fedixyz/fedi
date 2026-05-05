import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { detectInviteCodeType } from '@fedi/common/utils/FederationUtils'

import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'

type JoinFederationRouteProp = RouteProp<RootStackParamList, 'JoinFederation'>

const JoinFederationHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation()
    const route = useRoute<JoinFederationRouteProp>()
    const code = route.params?.invite

    const titleKey =
        code && detectInviteCodeType(code) === 'community'
            ? 'phrases.space-invitation'
            : 'phrases.wallet-service'

    return (
        <Header
            backButton
            onBackButtonPress={() => {
                if (navigation.canGoBack()) navigation.goBack()
                else navigation.navigate('TabsNavigator')
            }}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t(titleKey)}
                </Text>
            }
        />
    )
}

export default JoinFederationHeader
