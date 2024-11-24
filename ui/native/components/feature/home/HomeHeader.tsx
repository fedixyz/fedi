import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'

import {
    DRAWER_NAVIGATION_ID,
    DrawerNavigationHook,
    NavigationHook,
} from '../../../types/navigation'
import { isNightly } from '../../../utils/device-info'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import HeaderAvatar from '../chat/HeaderAvatar'
import FederationSelector from '../federations/FederationSelector'
import { PopupFederationCountdown } from '../federations/PopupFederationCountdown'
import { NetworkBanner } from '../wallet/NetworkBanner'

const HomeHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const popupInfo = usePopupFederationInfo()
    const showNightlyBanner = useMemo(() => isNightly(), [])

    const style = styles(theme)

    const drawerNavigator = navigation.getParent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        DRAWER_NAVIGATION_ID as any,
    ) as DrawerNavigationHook

    const openFederationsDrawer = () => {
        drawerNavigator.openDrawer()
    }
    const openSettings = useCallback(() => {
        return navigation.navigate('Settings')
    }, [navigation])

    return (
        <>
            <Header
                containerStyle={style.container}
                headerLeft={
                    <PressableIcon
                        onPress={openFederationsDrawer}
                        hitSlop={10}
                        maxFontSizeMultiplier={1.5}
                        svgName="HamburgerIcon"
                    />
                }
                headerRight={<HeaderAvatar onPress={openSettings} />}
                headerCenter={<FederationSelector />}
                centerContainerStyle={style.centerContainer}
            />
            <NetworkBanner />
            {popupInfo && <PopupFederationCountdown />}
            {showNightlyBanner && (
                <View style={style.nightly}>
                    <Text small style={style.nightlyText} adjustsFontSizeToFit>
                        {t('feature.developer.nightly')}
                    </Text>
                </View>
            )}
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingBottom: theme.spacing.md,
            justifyContent: 'space-between',
        },
        centerContainer: {
            maxWidth: '80%',
        },
        nightly: {
            position: 'absolute',
            bottom: 0,
            right: theme.spacing.lg,
            backgroundColor: theme.colors.primary,
            paddingHorizontal: theme.spacing.sm,
            borderTopLeftRadius: 5,
            borderTopRightRadius: 5,
        },
        nightlyText: {
            fontSize: 10,
            color: theme.colors.secondary,
        },
    })

export default HomeHeader
