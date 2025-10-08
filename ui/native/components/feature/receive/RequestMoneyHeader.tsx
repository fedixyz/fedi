import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useLnurlReceiveCode } from '@fedi/common/hooks/receive'

import { fedimint } from '../../../bridge'
import { NavigationHook, RootStackParamList } from '../../../types/navigation'
import Flex from '../../ui/Flex'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'

type ReceiveLightningRouteProp = RouteProp<
    RootStackParamList,
    'ReceiveLightning'
>
const RequestMoneyHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const route = useRoute<ReceiveLightningRouteProp>()
    const { federationId } = route.params
    const { routes } = navigation.getState()

    // Show back button only if we can go back
    const shouldShowBack = navigation.canGoBack()

    // Show close button only if back button would not take us to TabsNavigator
    const shouldShowClose = routes[routes.length - 2]?.name !== 'TabsNavigator'
    const { supportsLnurl } = useLnurlReceiveCode(fedimint, federationId || '')

    return (
        <Header
            backButton={shouldShowBack}
            closeButton={shouldShowClose}
            closeRoute="Federations"
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.receive.request-money')}
                </Text>
            }
            rightContainerStyle={styles(theme).rightContainer}
            headerRight={
                <Flex gap="sm" row>
                    <PressableIcon
                        svgName="Scan"
                        onPress={() =>
                            navigation.navigate('Receive', { federationId })
                        }
                    />
                    {supportsLnurl && (
                        <PressableIcon
                            svgName="ScanLightning"
                            onPress={() =>
                                navigation.navigate('ReceiveLnurl', {
                                    federationId,
                                })
                            }
                        />
                    )}
                </Flex>
            }
        />
    )
}
const styles = (_theme: Theme) =>
    StyleSheet.create({
        rightContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
        },
    })

export default RequestMoneyHeader
