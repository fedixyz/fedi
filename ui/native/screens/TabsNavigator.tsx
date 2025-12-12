import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { MutableRefObject, useEffect, useRef } from 'react'
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
import {
    refreshCommunities,
    refreshFederations,
    selectMatrixHasNotifications,
} from '@fedi/common/redux'
import { selectZendeskUnreadMessageCount } from '@fedi/common/redux/support'

import { fedimint } from '../bridge'
import ChatHeader from '../components/feature/chat/ChatHeader'
import FederationsHeader from '../components/feature/federations/FederationsHeader'
import HomeHeader from '../components/feature/home/HomeHeader'
import SvgImage, {
    SvgImageSize,
    getIconSizeMultiplier,
} from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import {
    RootStackParamList,
    TABS_NAVIGATOR_ID,
    TabsNavigatorParamList,
} from '../types/navigation'
import ChatScreen from './ChatScreen'
import Federations from './Federations'
import Home from './Home'
import Mods from './Mods'

const MAX_TABS_FONT_SCALE = 1.2

export type Props = NativeStackScreenProps<RootStackParamList, 'TabsNavigator'>

const Tab = createBottomTabNavigator<TabsNavigatorParamList>()

const TabsNavigator: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    // TODO: Reimplement unseen logic with matrix
    // const hasUnseenMessages = useAppSelector(selectHasUnseenMessages)
    const hasUnreadMessages = useAppSelector(selectMatrixHasNotifications)
    const zendeskMsgCount = useAppSelector(selectZendeskUnreadMessageCount)
    const dispatch = useAppDispatch()
    const appStateRef = useRef<AppStateStatus>(
        AppState.currentState,
    ) as MutableRefObject<AppStateStatus>
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
    }, [dispatch])

    const style = styles(
        theme,
        insets,
        Math.min(fontScale, MAX_TABS_FONT_SCALE),
    )

    return (
        <>
            <Tab.Navigator
                initialRouteName={route.params?.initialRouteName || 'Home'}
                id={TABS_NAVIGATOR_ID}
                screenOptions={({ route: screenRoute }) => ({
                    freezeOnBlur: true,
                    tabBarButton: props => {
                        switch (screenRoute.name) {
                            case 'Home':
                                return <Pressable {...props} />
                            case 'Chat':
                                return <Pressable {...props} />
                            case 'Mods':
                                return <Pressable {...props} />
                            case 'Federations':
                                return <Pressable {...props} />
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
                            case 'Federations':
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
                    tabBarShowLabel: false,
                    tabBarActiveTintColor: theme.colors.primary,
                    tabBarInactiveTintColor: theme.colors.primaryLight,
                    tabBarStyle: style.tabBar,
                    tabBarItemStyle: style.tabBarItem,
                    headerTitleStyle: theme.components.Text.style,
                    tabBarBadgeStyle: style.tabBarBadge,
                })}>
                <Tab.Screen
                    name="Home"
                    options={() => ({
                        tabBarTestID: 'HomeTabButton',
                        title: t('words.home'),
                        header: () => <HomeHeader />,
                    })}>
                    {props => <Home {...props} />}
                </Tab.Screen>
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
                    name="Federations"
                    component={Federations}
                    options={() => ({
                        tabBarTestID: 'FederationsTabButton',
                        title: t('words.federations'),
                        header: () => <FederationsHeader />,
                    })}
                />
            </Tab.Navigator>
        </>
    )
}

const styles = (theme: Theme, insets: EdgeInsets, fontScale: number) => {
    // Tab bar height must be a fixed value due to its internal logic, but the height
    // is affected by fontScale, so we need to calculate it manually.
    const itemPadding = theme.spacing.lg
    const iconSize =
        theme.sizes[SvgImageSize.sm] * getIconSizeMultiplier(fontScale)
    const iconPadding = theme.spacing.xs
    const fontSize = fediTheme.fontSizes.caption * fontScale
    const tabBarHeight = itemPadding * 2 + iconPadding + iconSize + fontSize

    return StyleSheet.create({
        tabBar: {
            backgroundColor: theme.colors.secondary,
            height: tabBarHeight + insets.bottom,
            borderTopWidth: 1,
            borderTopColor: theme.colors.extraLightGrey,
            shadowColor: 'rgba(11, 16, 19, 0.1)',
            shadowOffset: {
                width: 0,
                height: 4,
            },
            shadowRadius: 24,
            elevation: 24,
            shadowOpacity: 1,
        },
        tabBarIconContainer: {},
        tabBarBadge: {
            backgroundColor: theme.colors.red,
            top: 21,
            left: 4,
            borderWidth: 2,
            borderColor: theme.colors.secondary,
            width: 12,
            height: 12,
            minWidth: 0,
            borderRadius: 6,
        },
        tabBarItem: {},
        disabledIcon: {
            opacity: 0.2,
            backgroundColor: theme.colors.grey,
        },
        row: {
            flexDirection: 'row',
        },
    })
}

export default TabsNavigator
