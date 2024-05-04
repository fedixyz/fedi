import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import { SafeAreaView } from 'react-native-safe-area-context'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import {
    selectActiveFederation,
    selectHasNewChatActivityInOtherFeds,
} from '@fedi/common/redux'

import { useAppSelector, usePrevious } from '../../../state/hooks'
import {
    DrawerNavigationHook,
    DRAWER_NAVIGATION_ID,
    NavigationHook,
} from '../../../types/navigation'
import { FederationLogo } from '../../ui/FederationLogo'
import SvgImage from '../../ui/SvgImage'
import { PopupFederationCountdown } from './PopupFederationCountdown'

const SelectedFederationHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const activeFederation = useAppSelector(selectActiveFederation)
    const previousActiveFederation = usePrevious(activeFederation)
    const popupInfo = usePopupFederationInfo()
    const drawerNavigator = navigation.getParent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        DRAWER_NAVIGATION_ID as any,
    ) as DrawerNavigationHook

    const hasNewChatActivityInOtherFeds = useAppSelector(
        selectHasNewChatActivityInOtherFeds,
    )

    const openFederationsDrawer = () => {
        drawerNavigator.openDrawer()
    }

    // Close the drawer when activeFederation changes
    useEffect(() => {
        if (previousActiveFederation?.id !== activeFederation?.id) {
            drawerNavigator.closeDrawer()
        }
    }, [drawerNavigator, activeFederation, previousActiveFederation?.id])

    const style = styles(theme)
    return (
        <SafeAreaView
            edges={['top', 'left', 'right']}
            style={styles(theme).container}>
            <Pressable
                style={[
                    style.federation,
                    hasNewChatActivityInOtherFeds
                        ? {
                              marginRight: theme.spacing.sm,
                              paddingHorizontal: theme.spacing.md,
                          }
                        : {},
                ]}
                onPress={openFederationsDrawer}>
                <FederationLogo federation={activeFederation} size={24} />
                <Text
                    bold
                    caption
                    numberOfLines={1}
                    style={style.federationName}>
                    {activeFederation?.name}
                </Text>
                <SvgImage name="ChevronRight" size={20} />
                <View
                    style={[
                        style.unreadIndicator,
                        hasNewChatActivityInOtherFeds
                            ? { opacity: 1 }
                            : { opacity: 0 },
                    ]}
                />
            </Pressable>
            {popupInfo && <PopupFederationCountdown />}
            {/* Display a small UI indicator for Fedi Nightly builds */}
            {DeviceInfo.getBundleId().includes('nightly') && (
                <View style={style.nightly}>
                    <Text small style={style.nightlyText}>
                        {t('feature.developer.nightly')}
                    </Text>
                </View>
            )}
        </SafeAreaView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: theme.spacing.sm,
            borderBottomColor: theme.colors.extraLightGrey,
            borderBottomWidth: 1,
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
        federation: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.sm,
        },
        federationName: {
            maxWidth: '80%',
            marginLeft: theme.spacing.sm,
            marginRight: theme.spacing.xs,
        },
        headerContainer: {
            paddingBottom: theme.spacing.sm,
            borderBottomColor: theme.colors.extraLightGrey,
            borderBottomWidth: 1,
        },
        unreadIndicator: {
            backgroundColor: theme.colors.red,
            height: theme.sizes.unreadIndicatorSize,
            width: theme.sizes.unreadIndicatorSize,
            borderRadius: theme.sizes.unreadIndicatorSize * 0.5,
            position: 'absolute',
            right: 0,
        },
    })

export default SelectedFederationHeader
