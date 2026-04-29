import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    AppState,
    AppStateStatus,
    Pressable,
    StyleSheet,
    useWindowDimensions,
} from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import {
    refreshCommunities,
    refreshFederations,
    selectCommunities,
    selectLastUsedTab,
    selectLoadedFederations,
    selectMatrixHasNotifications,
} from '@fedi/common/redux'
import { selectZendeskUnreadMessageCount } from '@fedi/common/redux/support'
import { HomeNavigationTab } from '@fedi/common/types/linking'

import StabilityPoolMonitorManager from '../components/StabilityPoolMonitorManager'
import ChatHeader from '../components/feature/chat/ChatHeader'
import CommunitiesOverlay from '../components/feature/federations/CommunitiesOverlay'
import WalletHeader from '../components/feature/federations/WalletHeader'
import HomeHeader from '../components/feature/home/HomeHeader'
import SelectWalletOverlay from '../components/feature/send/SelectWalletOverlay'
import GradientView from '../components/ui/GradientView'
import SvgImage, { getIconSizeMultiplier } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import {
    RootStackParamList,
    TABS_NAVIGATOR_ID,
    TabsNavigatorParamList,
} from '../types/navigation'
import ChatScreen from './ChatScreen'
import Home from './Home'
import Mods from './Mods'
import Wallet from './Wallet'

const MAX_TABS_FONT_SCALE = 1.2

export type Props = NativeStackScreenProps<RootStackParamList, 'TabsNavigator'>

const Tab = createBottomTabNavigator<TabsNavigatorParamList>()

const TabsNavigator: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const [walletOverlayOpen, setWalletOverlayOpen] = useState(false)
    const [communitiesOverlayOpen, setCommunitiesOverlayOpen] = useState(false)
    // TODO: Reimplement unseen logic with matrix
    // const hasUnseenMessages = useAppSelector(selectHasUnseenMessages)
    const hasUnreadMessages = useAppSelector(selectMatrixHasNotifications)
    const communities = useAppSelector(selectCommunities)
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const zendeskMsgCount = useAppSelector(selectZendeskUnreadMessageCount)
    const lastUsedTab = useAppSelector(selectLastUsedTab)
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const appStateRef = useRef<AppStateStatus>(
        AppState.currentState,
    ) as MutableRefObject<AppStateStatus>

    const tabToSceenMap: Record<
        HomeNavigationTab,
        keyof TabsNavigatorParamList
    > = {
        [HomeNavigationTab.Home]: 'Home',
        [HomeNavigationTab.Chat]: 'Chat',
        [HomeNavigationTab.MiniApps]: 'Mods',
        [HomeNavigationTab.Wallet]: 'Wallet',
    }

    const { fontScale } = useWindowDimensions()

    // This logic is needed refresh federation metadata
    useEffect(() => {
        // Subscribe to changes in AppState to detect when app goes from
        // background to foreground
        const subscription = AppState.addEventListener(
            'change',
            nextAppState => {
                if (
                    appStateRef.current.match(/inactive|background/) &&
                    nextAppState === 'active'
                ) {
                    dispatch(refreshFederations(fedimint))
                    dispatch(refreshCommunities(fedimint))
                }
                appStateRef.current = nextAppState
            },
        )
        return () => subscription.remove()
    }, [dispatch, fedimint])

    const style = styles(
        theme,
        insets,
        Math.min(fontScale, MAX_TABS_FONT_SCALE),
    )

    return (
        <>
            <Tab.Navigator
                initialRouteName={
                    route.params?.initialRouteName ??
                    tabToSceenMap[lastUsedTab] ??
                    'Home'
                }
                id={TABS_NAVIGATOR_ID}
                screenOptions={({ route: screenRoute }) => ({
                    freezeOnBlur: true,
                    tabBarButton: props => {
                        switch (screenRoute.name) {
                            case 'Home':
                                return (
                                    <Pressable
                                        {...props}
                                        style={({ pressed }) => [
                                            props.style,
                                            pressed &&
                                                style.tabBarButtonPressed,
                                        ]}
                                    />
                                )
                            case 'Chat':
                                return (
                                    <Pressable
                                        {...props}
                                        style={({ pressed }) => [
                                            props.style,
                                            pressed &&
                                                style.tabBarButtonPressed,
                                        ]}
                                    />
                                )
                            case 'Mods':
                                return (
                                    <Pressable
                                        {...props}
                                        style={({ pressed }) => [
                                            props.style,
                                            pressed &&
                                                style.tabBarButtonPressed,
                                        ]}
                                    />
                                )
                            case 'Wallet':
                                return (
                                    <Pressable
                                        {...props}
                                        style={({ pressed }) => [
                                            props.style,
                                            pressed &&
                                                style.tabBarButtonPressed,
                                        ]}
                                    />
                                )
                            default:
                                return null
                        }
                    },
                    tabBarIcon: ({ focused }) => {
                        const svgImageProps = {
                            maxFontSizeMultiplier: MAX_TABS_FONT_SCALE,
                            containerStyle: style.tabBarIconContainer,
                            color: focused
                                ? theme.colors.primary
                                : theme.colors.primaryLight,
                        }
                        switch (screenRoute.name) {
                            case 'Home':
                                return (
                                    <SvgImage
                                        name={
                                            focused
                                                ? 'CommunityFilled'
                                                : 'Community'
                                        }
                                        {...svgImageProps}
                                    />
                                )
                            case 'Chat':
                                return (
                                    <SvgImage
                                        name={focused ? 'ChatFilled' : 'Chat'}
                                        {...svgImageProps}
                                    />
                                )
                            case 'Mods':
                                return (
                                    <SvgImage
                                        name={focused ? 'AppsFilled' : 'Apps'}
                                        {...svgImageProps}
                                    />
                                )
                            case 'Wallet':
                                return (
                                    <SvgImage
                                        name={
                                            focused ? 'WalletFilled' : 'Wallet'
                                        }
                                        {...svgImageProps}
                                    />
                                )
                            default:
                                return null
                        }
                    },
                    tabBarShowLabel: true,
                    tabBarLabelStyle: {
                        ...style.tabBarLabel,
                        ...theme.components.Text.style,
                    },
                    tabBarActiveTintColor: theme.colors.primary,
                    tabBarInactiveTintColor: theme.colors.primaryLight,
                    tabBarStyle: style.tabBar,
                    tabBarItemStyle: style.tabBarItem,
                    headerTitleStyle: theme.components.Text.style,
                    tabBarBadgeStyle: style.tabBarBadge,
                })}>
                <Tab.Screen
                    name="Wallet"
                    component={Wallet}
                    listeners={({ navigation }) => ({
                        tabPress: event => {
                            if (
                                !navigation.isFocused() ||
                                loadedFederations.length < 2
                            ) {
                                return
                            }

                            event.preventDefault()
                            setWalletOverlayOpen(true)
                        },
                    })}
                    options={() => ({
                        tabBarTestID: 'WalletTabButton',
                        title: t('words.wallet'),
                        header: () => (
                            <WalletHeader
                                onOpenSelectWalletOverlay={() =>
                                    setWalletOverlayOpen(true)
                                }
                            />
                        ),
                    })}
                />
                <Tab.Screen
                    name="Chat"
                    component={ChatScreen}
                    options={() => ({
                        tabBarTestID: 'ChatTabButton',
                        title: t('words.chat'),
                        header: () => <ChatHeader />,
                        tabBarBadge: hasUnreadMessages ? '' : undefined,
                    })}
                />
                <Tab.Screen
                    name="Scan"
                    options={({ navigation }) => ({
                        tabBarTestID: 'ScanTabButton',
                        tabBarLabel: t('phrases.scan-slash-paste'),
                        tabBarActiveTintColor: theme.colors.darkGrey,
                        tabBarInactiveTintColor: theme.colors.darkGrey,
                        tabBarButton: props => (
                            <Pressable
                                {...props}
                                onPress={() =>
                                    navigation.navigate('OmniScanner')
                                }
                                style={({ pressed }) => [
                                    props.style,
                                    pressed && style.tabBarButtonPressed,
                                ]}
                            />
                        ),
                        tabBarIcon: () => (
                            <GradientView
                                variant="black"
                                style={style.scanButton}>
                                <SvgImage
                                    name="Scan"
                                    color={theme.colors.white}
                                    size={24}
                                />
                            </GradientView>
                        ),
                    })}>
                    {() => null}
                </Tab.Screen>
                <Tab.Screen
                    name="Mods"
                    component={Mods}
                    options={() => ({
                        tabBarTestID: 'ModsTabButton',
                        title: t('words.mods'),
                        headerShown: false, // this allows us to draw over the header with tooltips
                        tabBarBadge: zendeskMsgCount > 0 ? '' : undefined,
                    })}
                />
                <Tab.Screen
                    name="Home"
                    listeners={({ navigation }) => ({
                        tabPress: event => {
                            if (
                                !navigation.isFocused() ||
                                communities.length < 2
                            ) {
                                return
                            }

                            event.preventDefault()
                            setCommunitiesOverlayOpen(true)
                        },
                    })}
                    options={() => ({
                        tabBarTestID: 'HomeTabButton',
                        title: t('words.community'),
                        header: () => (
                            <HomeHeader
                                onOpenCommunitiesOverlay={() =>
                                    setCommunitiesOverlayOpen(true)
                                }
                            />
                        ),
                    })}>
                    {props => <Home {...props} />}
                </Tab.Screen>
            </Tab.Navigator>
            <SelectWalletOverlay
                open={walletOverlayOpen}
                onDismiss={() => setWalletOverlayOpen(false)}
            />
            <CommunitiesOverlay
                open={communitiesOverlayOpen}
                onOpenChange={setCommunitiesOverlayOpen}
            />
            <StabilityPoolMonitorManager />
        </>
    )
}

const styles = (theme: Theme, insets: EdgeInsets, fontScale: number) => {
    // Tab bar height must be a fixed value due to its internal logic, but the height
    // is affected by fontScale, so we need to calculate it manually.
    const itemPadding = theme.spacing.lg
    const iconSize = theme.sizes.sm * getIconSizeMultiplier(fontScale)
    const iconPadding = theme.spacing.xs
    const fontSize = fediTheme.fontSizes.caption * fontScale
    const tabBarHeight = itemPadding * 2 + iconPadding + iconSize + fontSize

    return StyleSheet.create({
        tabBar: {
            backgroundColor: theme.colors.secondary,
            borderTopWidth: 0,
            elevation: 24,
            height: tabBarHeight + insets.bottom,
            paddingHorizontal: theme.spacing.xs,
            shadowColor: 'rgba(11, 16, 19, 0.1)',
            shadowOffset: {
                width: 0,
                height: 4,
            },
            shadowOpacity: 1,
            shadowRadius: 24,
        },
        scanButton: {
            borderWidth: 3,
            borderColor: theme.colors.white,
            position: 'absolute',
            top: -30,
            height: 62,
            width: 62,
            borderRadius: 1024,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        tabBarIconContainer: {},
        tabBarBadge: {
            backgroundColor: theme.colors.red,
            top: 10,
            left: 4,
            borderWidth: 2,
            borderColor: theme.colors.secondary,
            width: 12,
            height: 12,
            minWidth: 0,
            borderRadius: 6,
        },
        tabBarItem: {},
        tabBarLabel: {
            fontSize: fediTheme.fontSizes.small,
            paddingBottom: theme.spacing.md,
        },
        disabledIcon: {
            opacity: 0.2,
            backgroundColor: theme.colors.grey,
        },
        row: {
            flexDirection: 'row',
        },
        tabBarButtonPressed: {
            backgroundColor: theme.colors.primary05,
            borderRadius: theme.borders.defaultRadius,
        },
    })
}

export default TabsNavigator
