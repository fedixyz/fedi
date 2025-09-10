import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useLnurlReceiveCode } from '@fedi/common/hooks/pay'
import { selectActiveFederationId } from '@fedi/common/redux'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import Flex from '../../ui/Flex'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'

const RequestMoneyHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const { routes } = navigation.getState()
    const activeFederationId = useAppSelector(selectActiveFederationId)

    // Show back button only if we can go back
    const shouldShowBack = navigation.canGoBack()

    // Show close button only if back button would not take us to TabsNavigator
    const shouldShowClose = routes[routes.length - 2]?.name !== 'TabsNavigator'
    const { supportsLnurl } = useLnurlReceiveCode(
        fedimint,
        activeFederationId || '',
    )

    return (
        <Header
            backButton={shouldShowBack}
            closeButton={shouldShowClose}
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
                        onPress={() => navigation.navigate('Receive')}
                    />
                    {supportsLnurl && (
                        <PressableIcon
                            svgName="ScanLightning"
                            onPress={() => navigation.navigate('ReceiveLnurl')}
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
