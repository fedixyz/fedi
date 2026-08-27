import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, View } from 'react-native'

import { reset } from '../../../state/navigation'
import type { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'

/**
 * Operator console header: back, the service label, and the only route into
 * service settings.
 *
 * The dashboard renders this itself rather than handing it to the navigator, so
 * that the settings control and the screen body share one coordinate space and
 * the tour can measure the control. This also matches every other Wallet
 * Service screen — see `WalletServiceScreenHeader` for why one owner of the top
 * inset matters.
 *
 * Back always lands on the Wallet tab: the entry guard resets onto this screen
 * once a service is formed, so there is no stack to pop, and the wallet is
 * where the service belongs.
 *
 * Android's hardware back is bound to the same action. Without that it popped
 * to whatever pushed the dashboard — usually "Join or Create a Wallet Service",
 * a screen offering to create the service the user already has — so the two
 * back controls on one screen disagreed.
 */
export const WalletServiceDashboardHeader: React.FC<{
    /** Highlight target for the dashboard tour. */
    settingsRef?: React.RefObject<View | null>
}> = ({ settingsRef }) => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const goToWallet = useCallback(() => {
        navigation.dispatch(
            reset('TabsNavigator', { initialRouteName: 'Wallet' }),
        )
    }, [navigation])

    // only while focused: the dashboard stays mounted under service settings,
    // and a handler left registered there would send its back button home too
    useFocusEffect(
        useCallback(() => {
            const subscription = BackHandler.addEventListener(
                'hardwareBackPress',
                () => {
                    goToWallet()
                    // handled — stop Android popping the stack as well
                    return true
                },
            )
            return () => subscription.remove()
        }, [goToWallet]),
    )

    return (
        <Header
            backButton
            onBackButtonPress={goToWallet}
            headerCenter={
                <Text bold numberOfLines={1}>
                    {t('feature.wallet-service.dashboard-header')}
                </Text>
            }
            headerRight={
                <View ref={settingsRef} collapsable={false}>
                    <PressableIcon
                        testID="wallet-service-settings"
                        svgName="Cog"
                        onPress={() =>
                            navigation.navigate('WalletServiceSettings')
                        }
                    />
                </View>
            }
        />
    )
}

/** Service settings header: back and the screen label. */
export const WalletServiceSettingsHeader: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1}>
                    {t('feature.wallet-service.settings-title')}
                </Text>
            }
        />
    )
}
