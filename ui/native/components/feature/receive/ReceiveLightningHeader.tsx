import { useNavigation } from '@react-navigation/native'
import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { useLnurlReceiveCode } from '@fedi/common/hooks/pay'
import { selectActiveFederationId } from '@fedi/common/redux'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const ReceiveLightningHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const { routes } = navigation.getState()
    const { theme } = useTheme()
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
                    {t('feature.receive.add-amount')}
                </Text>
            }
            headerRight={
                supportsLnurl ? (
                    <Pressable
                        style={styles.LnurlText}
                        onPress={() => navigation.navigate('ReceiveLnurl')}>
                        <SvgImage
                            name="Bolt"
                            size={SvgImageSize.sm}
                            color={theme.colors.orange}
                        />
                        <Text bold color={theme.colors.orange}>
                            {t('words.lnurl')}
                        </Text>
                    </Pressable>
                ) : undefined
            }
        />
    )
}

export default ReceiveLightningHeader

const styles = StyleSheet.create({
    LnurlText: {
        flexDirection: 'row',
        alignItems: 'center',
    },
})
