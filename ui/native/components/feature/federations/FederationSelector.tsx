import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'

import {
    selectActiveFederation,
    selectShouldShowDegradedStatus,
} from '@fedi/common/redux'

import { useAppSelector, usePrevious } from '../../../state/hooks'
import {
    DRAWER_NAVIGATION_ID,
    DrawerNavigationHook,
    NavigationHook,
} from '../../../types/navigation'
import HoloGradient from '../../ui/HoloGradient'
import { ConnectionIcon } from './ConnectionIcon'
import { FederationLogo } from './FederationLogo'

const FederationSelector: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const activeFederation = useAppSelector(selectActiveFederation)
    const shouldShowDegradedStatus = useAppSelector(s =>
        activeFederation
            ? selectShouldShowDegradedStatus(s, activeFederation)
            : false,
    )
    const previousActiveFederation = usePrevious(activeFederation)
    const drawerNavigator = navigation.getParent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        DRAWER_NAVIGATION_ID as any,
    ) as DrawerNavigationHook

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

    if (!activeFederation) return <></>

    return (
        <>
            <HoloGradient
                level="900"
                style={style.gradientContainer}
                gradientStyle={style.gradient}>
                <Pressable
                    style={style.container}
                    onPress={openFederationsDrawer}>
                    <FederationLogo
                        federation={activeFederation}
                        size={24}
                        hex
                    />
                    <Text
                        bold
                        caption
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        style={style.federationName}>
                        {activeFederation?.name}
                    </Text>
                    {/* Hides this tag if there is a local internet problem */}
                    {shouldShowDegradedStatus && (
                        <ConnectionIcon
                            status={activeFederation.status}
                            size={18}
                        />
                    )}
                </Pressable>
            </HoloGradient>
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        gradientContainer: {
            borderRadius: 50,
            ...theme.styles.subtleShadow,
        },
        gradient: {
            padding: theme.spacing.xxs,
            borderRadius: 50,
            alignSelf: 'center',
        },
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.sm,
            borderRadius: 50,
            backgroundColor: theme.colors.white,
        },
        federationName: {
            flexGrow: 1,
            maxWidth: '85%',
        },
    })

export default FederationSelector
