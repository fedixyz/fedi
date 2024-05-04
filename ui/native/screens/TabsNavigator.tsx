import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useIsFocused } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    AppState,
    AppStateStatus,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import {
    useIsChatSupported,
    useIsStabilityPoolSupported,
    usePopupFederationInfo,
} from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    refreshActiveStabilityPool,
    refreshFederations,
    selectActiveFederation,
    selectHasUnseenMessages,
    selectHasUnseenPaymentUpdates,
} from '@fedi/common/redux'

import { fedimint } from '../bridge'
import ChatHeader from '../components/feature/chat/ChatHeader'
import SelectedFederationHeader from '../components/feature/federations/SelectedFederationHeader'
import HomeHeader from '../components/feature/home/HomeHeader'
import SvgImage, {
    SvgImageSize,
    getIconSizeMultiplier,
} from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import {
    RootStackParamList,
    TabsNavigatorParamList,
    TABS_NAVIGATOR_ID,
} from '../types/navigation'
import ChatScreen from './ChatScreen'
import Home from './Home'
import OmniScanner from './OmniScanner'

const MAX_TABS_FONT_SCALE = 1.8

export type Props = NativeStackScreenProps<RootStackParamList, 'TabsNavigator'>

const Tab = createBottomTabNavigator<TabsNavigatorParamList>()

const TabsNavigator: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const isFocused = useIsFocused()
    const insets = useSafeAreaInsets()
    const [offline] = useState(false)
    const toast = useToast()
    const canChat = useIsChatSupported()
    const hasUnseenMessages = useAppSelector(selectHasUnseenMessages)
    const hasUnseenPaymentUpdates = useAppSelector(
        selectHasUnseenPaymentUpdates,
    )
    const activeFederation = useAppSelector(selectActiveFederation)
    const isStabilityPoolSupported = useIsStabilityPoolSupported()
    const popupInfo = usePopupFederationInfo()
    const dispatch = useAppDispatch()
    const appStateRef = useRef<AppStateStatus>(
        AppState.currentState,
    ) as MutableRefObject<AppStateStatus>
    const { fontScale } = useWindowDimensions()

    // If the popup federation has ended, redirect user to end screen.
    useEffect(() => {
        if (isFocused && popupInfo?.ended) {
            navigation.navigate('PopupFederationEnded')
        }
    }, [isFocused, navigation, popupInfo])

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
                    // Refresh stabilitypool balance if supported
                    if (isStabilityPoolSupported) {
                        dispatch(refreshActiveStabilityPool({ fedimint }))
                    }
                }
                appStateRef.current = nextAppState
            },
        )
        return () => subscription.remove()
    }, [dispatch, isStabilityPoolSupported])

    // If we don't have a selected federation, there's nothing to display here
    // Redirect user to splash screen and render nothing.
    if (!activeFederation && isFocused) {
        navigation.navigate('Splash')
        return <View />
    }

    const style = styles(
        theme,
        insets,
        Math.min(fontScale, MAX_TABS_FONT_SCALE),
    )
    return (
        <>
            <SelectedFederationHeader />
            <Tab.Navigator
                initialRouteName="Home"
                id={TABS_NAVIGATOR_ID}
                screenOptions={({ route }) => ({
                    tabBarButton: props => {
                        switch (route.name) {
                            case 'Home':
                                return <Pressable {...props} />
                            case 'Chat':
                                if (canChat) {
                                    return <Pressable {...props} />
                                } else {
                                    return (
                                        <Pressable
                                            {...props}
                                            style={[
                                                props.style,
                                                style.disabledIcon,
                                            ]}
                                            onPress={() => {
                                                toast.show({
                                                    content: t(
                                                        'errors.chat-unavailable',
                                                    ),
                                                    status: 'error',
                                                })
                                            }}
                                        />
                                    )
                                }
                            case 'OmniScanner':
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
                        switch (route.name) {
                            case 'Home':
                                return (
                                    <SvgImage
                                        name={focused ? 'HomeFilled' : 'Home'}
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
                            case 'OmniScanner':
                                return (
                                    <SvgImage
                                        name={'Scan'}
                                        {...svgImageProps}
                                    />
                                )
                            default:
                                return null
                        }
                    },
                    tabBarLabel: ({ focused, children }) => (
                        <Text
                            caption
                            bold={focused}
                            medium={!focused}
                            maxFontSizeMultiplier={MAX_TABS_FONT_SCALE}
                            style={{
                                color: focused
                                    ? theme.colors.primary
                                    : theme.colors.primaryLight,
                            }}>
                            {children}
                        </Text>
                    ),
                    tabBarActiveTintColor: theme.colors.primary,
                    tabBarInactiveTintColor: theme.colors.primaryLight,
                    tabBarStyle: style.tabBar,
                    tabBarItemStyle: style.tabBarItem,
                    headerTitleStyle: theme.components.Text.style,
                    tabBarBadgeStyle: style.tabBarBadge,
                })}>
                <Tab.Screen
                    name="Home"
                    initialParams={{ offline }}
                    options={() => ({
                        title: t('words.home'),
                        header: () => <HomeHeader />,
                    })}>
                    {props => <Home {...props} offline={offline} />}
                </Tab.Screen>
                <Tab.Screen
                    name="Chat"
                    component={ChatScreen}
                    options={() => ({
                        title: t('words.chat'),
                        header: () => <ChatHeader />,
                        tabBarBadge:
                            hasUnseenMessages || hasUnseenPaymentUpdates
                                ? ''
                                : undefined,
                    })}
                />
                <Tab.Screen
                    name="OmniScanner"
                    component={OmniScanner}
                    options={() => ({
                        title: t('words.scan'),
                        headerShown: false,
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
        },
        tabBarIconContainer: {
            paddingBottom: iconPadding,
            marginTop: 'auto',
        },
        tabBarBadge: {
            backgroundColor: theme.colors.red,
            top: 8,
            left: 2,
            borderWidth: 2,
            borderColor: theme.colors.secondary,
            width: 12,
            height: 12,
            minWidth: 0,
            borderRadius: 6,
        },
        tabBarItem: {
            paddingBottom: itemPadding,
        },
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
