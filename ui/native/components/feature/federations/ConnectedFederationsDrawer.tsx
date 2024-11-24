import {
    DrawerContentComponentProps,
    DrawerContentScrollView,
} from '@react-navigation/drawer'
import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { selectActiveFederation, selectFederations } from '@fedi/common/redux'
import { LoadedFederationListItem } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import HoloGradient from '../../ui/HoloGradient'
import CommunityTile from './CommunityTile'
import CommunityTileLoading from './CommunityTileLoading'

const ConnectedFederationsDrawer: React.FC<DrawerContentComponentProps> = (
    props: DrawerContentComponentProps,
) => {
    const { t } = useTranslation()
    const drawerNavigation = props.navigation
    const mainNavigation = useNavigation<NavigationHook>()
    const { theme } = useTheme()
    const { height } = useWindowDimensions()
    const activeFederation = useAppSelector(selectActiveFederation)
    const federations = useAppSelector(selectFederations)
    const insets = useSafeAreaInsets()

    const handleTilePress = useCallback(
        (c: LoadedFederationListItem) => {
            // Dismiss drawer if active federation is clicked
            if (c.id === activeFederation?.id) {
                return drawerNavigation.closeDrawer()
            }
            drawerNavigation.reset({
                index: 0,
                routes: [
                    {
                        name: 'SwitchingFederations',
                        params: {
                            federationId: c.id,
                        },
                    },
                ],
            })
        },
        [drawerNavigation, activeFederation],
    )

    const handleQrPress = useCallback(
        (c: LoadedFederationListItem) => {
            mainNavigation.navigate('FederationInvite', {
                inviteLink: c.inviteCode,
            })
        },
        [mainNavigation],
    )

    const handleStatusPress = useCallback(
        (c: LoadedFederationListItem) => {
            mainNavigation.navigate('FederationDetails', {
                federationId: c.id,
            })
        },
        [mainNavigation],
    )
    const style = styles(theme)
    return (
        <HoloGradient
            level="400"
            gradientStyle={style.imageBackground}
            style={style.backgroundContainer}
            locations={fediTheme.holoGradientLocations.radial}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}>
            <DrawerContentScrollView
                {...props}
                style={[
                    style.container,
                    {
                        maxHeight:
                            height -
                            theme.sizes.addFederationButtonHeight -
                            insets.bottom,
                    },
                ]}>
                <View style={style.content}>
                    <Text
                        h2
                        medium
                        style={style.title}
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {t('words.communities')}
                    </Text>
                    <View style={style.communitiesList}>
                        {federations.map((f, i) => {
                            if (f.init_state === 'ready') {
                                const community: LoadedFederationListItem = f
                                return (
                                    <CommunityTile
                                        key={`di-${i}`}
                                        community={community}
                                        onSelect={() =>
                                            handleTilePress(community)
                                        }
                                        onSelectQr={() =>
                                            handleQrPress(community)
                                        }
                                        onSelectStatus={() =>
                                            handleStatusPress(community)
                                        }
                                        isActiveCommunity={
                                            activeFederation?.id ===
                                            community.id
                                        }
                                    />
                                )
                            } else {
                                return <CommunityTileLoading />
                            }
                        })}
                    </View>
                </View>
            </DrawerContentScrollView>
            <View style={style.buttonContainer}>
                <Button
                    onPress={() => {
                        mainNavigation.navigate('JoinFederation', {
                            invite: undefined,
                        })
                    }}
                    titleStyle={style.buttonText}
                    titleProps={{ medium: true, caption: true }}
                    title={
                        <>
                            <Text
                                caption
                                medium
                                adjustsFontSizeToFit
                                style={style.buttonText}>
                                {t('feature.community.add-community')}
                            </Text>
                        </>
                    }
                    night
                />
            </View>
        </HoloGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: 0,
            flex: 0,
            flexGrow: 1,
            flexShrink: 0,
            margin: 0,
        },
        content: {
            flex: 1,
        },
        communitiesList: {
            padding: 0,
        },
        buttonContainer: {
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.xl,
        },
        buttonText: {
            paddingHorizontal: theme.spacing.sm,
            letterSpacing: -0.1,
            lineHeight: 20,
            fontFamily: 'AlbertSans-Medium',
            color: theme.colors.white,
        },
        backgroundContainer: {
            backgroundColor: theme.colors.white,
        },
        imageBackground: {
            height: '100%',
            width: '100%',
        },
        title: {
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.lg + 2,
        },
    })

export default ConnectedFederationsDrawer
